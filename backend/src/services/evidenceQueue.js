const axios = require('axios')
const path = require('path')
const fs = require('fs').promises
const { Op } = require('sequelize')
const { EvidenceSubmission, RegistroFotografico } = require('../db/sequelize')
const { filePath } = require('./storage')
const { EVIDENCE_URL, EVIDENCE_USER, EVIDENCE_PASS, EXTERNAL_RETRY_COUNT, EXTERNAL_TIMEOUT_MS, STORAGE_PATH } = require('../config')
const { logger } = require('../utils/logger')

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const PROCESSING_STALE_MS = Number(process.env.EVIDENCE_PROCESSING_STALE_MS || (6 * 60 * 60 * 1000))
const DOC_DELAY_MS = Math.max(0, Number(process.env.EVIDENCE_DOC_DELAY_MS || 0))
const CYCLE_LIMIT = Math.max(1, Number(process.env.EVIDENCE_CYCLE_LIMIT || 200))

let schedulerTimer = null
let cycleRunning = false

async function sleep(ms) {
  if (!ms) return
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function sendToExternal(payload) {
  let attempt = 0
  let lastErr
  const max = Number(EXTERNAL_RETRY_COUNT || 0)
  while (attempt <= max) {
    try {
      const res = await axios.post(EVIDENCE_URL, payload, {
        timeout: EXTERNAL_TIMEOUT_MS,
        auth: (EVIDENCE_USER && EVIDENCE_PASS) ? { username: EVIDENCE_USER, password: EVIDENCE_PASS } : undefined,
        headers: { 'Content-Type': 'application/json' }
      })
      return { status: res.status, data: res.data }
    } catch (err) {
      lastErr = err
      attempt++
      if (attempt > max) throw err
      await sleep(500 * attempt)
    }
  }
  throw lastErr
}

function normalizeTotalImages(v) {
  const n = typeof v === 'number' ? v : Number(String(v || '').trim())
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.trunc(n)
}

async function writeEvidenceLog(id, entry, suffix) {
  try {
    const dir = path.join(STORAGE_PATH, 'evidence-logs')
    await fs.mkdir(dir, { recursive: true })
    const sfx = String(suffix || '').trim()
    const name = `${String(id)}-${Date.now()}${sfx ? '-' + sfx : ''}.json`
    const file = path.join(dir, name)
    await fs.writeFile(file, JSON.stringify(entry))
    return { name, file }
  } catch {
    return null
  }
}

function relLogPath(w) {
  const n = String(w?.name || '').trim()
  return n ? ('evidence-logs/' + n) : null
}

function buildStoredPayload({ referenceNumber, totalImages, totalImagesNieto, doNumber, type, documentsCount, totalBytes, documentsMeta, documents, logPath, sourceMode }) {
  const out = {
    referenceNumber: String(referenceNumber || ''),
    totalImages: normalizeTotalImages(totalImages),
    totalImagesNieto: normalizeTotalImages(totalImagesNieto),
    doNumber: doNumber ? String(doNumber) : null,
    type: String(type || ''),
    documentsCount: Number(documentsCount || 0),
    totalBytes: Number(totalBytes || 0),
    documentsMeta: Array.isArray(documentsMeta) ? documentsMeta : []
  }
  if (Array.isArray(documents)) out.documents = documents
  if (logPath) out.logPath = String(logPath)
  if (sourceMode) out.sourceMode = String(sourceMode)
  return out
}

function formatDate(ts) {
  const d = new Date(ts)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function extFor(name) {
  const dot = String(name || '').lastIndexOf('.')
  return dot >= 0 ? String(name).slice(dot).toLowerCase() : '.dat'
}

function baseNameFor(name) {
  const s = String(name || '')
  const dot = s.lastIndexOf('.')
  return dot >= 0 ? s.slice(0, dot) : s
}

function normalizeExt(v) {
  const s = String(v || '').trim().toLowerCase()
  if (!s) return ''
  return s.startsWith('.') ? s : ('.' + s)
}

function prefixFromFilename(filename) {
  const s = String(filename || '')
  const dot = s.lastIndexOf('.')
  const base = dot >= 0 ? s.slice(0, dot) : s
  const idx = base.lastIndexOf('_')
  if (idx <= 0) return null
  const num = Number(base.slice(idx + 1))
  if (!Number.isFinite(num)) return null
  return base.slice(0, idx)
}

function countPlainNietoFromPhotos(list, slug) {
  const arr = Array.isArray(list) ? list : []
  const s = String(slug || '')
  if (!s) return { totalImages: 0, totalImagesNieto: 0 }
  const needle = s + '_'
  let totalImages = 0
  let totalImagesNieto = 0
  for (const p of arr) {
    const prefix = prefixFromFilename(p?.filename || '')
    if (!prefix) continue
    if (prefix === s) totalImages++
    else if (prefix.startsWith(needle)) totalImagesNieto++
  }
  return { totalImages, totalImagesNieto }
}

function extractConsecutive(base) {
  const s = String(base || '')
  const idx = s.lastIndexOf('_')
  if (idx <= 0) return null
  const n = Number(s.slice(idx + 1))
  if (!Number.isFinite(n)) return null
  return { prefix: s.slice(0, idx), n: Math.trunc(n) }
}

function docMetaFromDoc(doc) {
  const bytes = typeof doc?.contentBase64 === 'string' ? Buffer.byteLength(doc.contentBase64, 'base64') : 0
  return {
    meta: {
      name: String(doc?.name || '').trim(),
      extension: String(doc?.extension || '').trim(),
      category: String(doc?.category || '').trim(),
      date: String(doc?.date || '').trim(),
      bytes
    },
    bytes
  }
}

function sanitizeDoc(doc) {
  return {
    name: String(doc?.name || '').trim(),
    extension: normalizeExt(doc?.extension),
    category: String(doc?.category || '').trim(),
    date: String(doc?.date || '').trim(),
    contentBase64: typeof doc?.contentBase64 === 'string' ? doc.contentBase64 : ''
  }
}

function selectPhotoTargets(rec, onlyMeta) {
  const photos = Array.isArray(rec?.photos) ? rec.photos : []
  const meta = Array.isArray(onlyMeta) ? onlyMeta : []

  const indexExact = new Map()
  const byConsec = new Map()

  for (const p of photos) {
    const filename = String(p?.filename || p?.id || '').trim()
    if (!filename) continue
    const ext = (extFor(filename) || '').toLowerCase()
    const base = (baseNameFor(filename) || '').toLowerCase()
    if (!base || !ext) continue

    const key = base + '|' + ext
    if (!indexExact.has(key)) indexExact.set(key, p)

    const c = extractConsecutive(base)
    if (c) {
      const ck = String(c.n) + '|' + ext
      const arr = byConsec.get(ck) || []
      arr.push(p)
      byConsec.set(ck, arr)
    }
  }

  function bestCandidate(candidates, nameLower, prefixLower, n) {
    let best = null
    let bestScore = -1
    for (const p of candidates) {
      const fn = String(p?.filename || p?.id || '').trim()
      const base = (baseNameFor(fn) || '').toLowerCase()
      let score = 0
      if (base === nameLower) score += 1000
      if (base.endsWith(nameLower)) score += 800
      if (base.includes(nameLower)) score += 600
      if (prefixLower && base.includes(prefixLower)) score += 120
      if (n != null && base.endsWith('_' + String(n))) score += 200
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
    return bestScore > 0 ? best : (candidates[0] || null)
  }

  function findPhotoForMeta(m) {
    const name = String(m?.name || '').trim()
    const ext = normalizeExt(m?.extension).toLowerCase()
    if (!name || !ext) return null

    const nameLower = name.toLowerCase()
    const exact = indexExact.get(nameLower + '|' + ext)
    if (exact) return exact

    const c = extractConsecutive(nameLower)
    if (c) {
      const candidates = byConsec.get(String(c.n) + '|' + ext) || []
      if (candidates.length === 1) return candidates[0]
      if (candidates.length > 1) return bestCandidate(candidates, nameLower, c.prefix, c.n)
    }

    const fallback = []
    for (const p of photos) {
      const fn = String(p?.filename || p?.id || '').trim()
      if (!fn) continue
      const pExt = (extFor(fn) || '').toLowerCase()
      if (pExt !== ext) continue
      const base = (baseNameFor(fn) || '').toLowerCase()
      if (!base) continue
      if (base === nameLower || base.endsWith(nameLower) || base.includes(nameLower)) fallback.push(p)
    }
    if (fallback.length) return bestCandidate(fallback, nameLower, c?.prefix || '', c?.n)

    return null
  }

  if (meta.length) {
    return meta.map(m => {
      const name = String(m?.name || '').trim()
      const ext = normalizeExt(m?.extension)
      if (!name || !ext) return null
      const p = findPhotoForMeta(m)
      if (!p) return null
      return { photo: p, forced: { name, extension: ext, category: String(m?.category || '').trim() } }
    }).filter(Boolean)
  }

  return photos.map(p => ({ photo: p, forced: null }))
}

async function buildDocumentFromTarget(target) {
  const p = target?.photo || {}
  const forced = target?.forced || null
  const ts = Number(String(p.id || '').split('-')[0]) || Date.now()
  const filename = p.filename || p.id || 'Documento'
  const abs = p.path || filePath(p.id)
  const buf = await fs.readFile(abs)
  const doc = {
    name: forced?.name || (baseNameFor(filename) || 'Documento'),
    extension: forced?.extension || extFor(filename),
    category: forced ? (forced.category || '') : '',
    date: formatDate(ts),
    contentBase64: buf.toString('base64')
  }
  const bytes = Buffer.byteLength(doc.contentBase64, 'base64')
  return {
    doc,
    bytes,
    meta: {
      name: doc.name,
      extension: doc.extension,
      category: doc.category || '',
      date: doc.date,
      bytes
    }
  }
}

async function findRegistroForSubmission(rec) {
  const referenceNumber = String(rec?.reference_number || '').trim()
  const typeVal = String(rec?.type || '') === 'master' ? 'master' : 'hijo'
  if (!referenceNumber) return null
  let reg = null
  if (rec?.user_id) {
    reg = await RegistroFotografico.findOne({ where: { bl_id: referenceNumber, type: typeVal, user_id: rec.user_id } })
  }
  if (!reg) {
    reg = await RegistroFotografico.findOne({ where: { bl_id: referenceNumber, type: typeVal } })
  }
  return reg
}

async function resolveSubmissionSource(rec) {
  const stored = (rec?.payload && typeof rec.payload === 'object') ? rec.payload : {}
  const referenceNumber = String(rec?.reference_number || '').trim()
  const doNumber = rec?.do_number ? String(rec.do_number) : null
  const typeVal = String(rec?.type || '') === 'master' ? 'master' : 'hijo'

  if (Array.isArray(stored.documents) && stored.documents.length) {
    const docs = stored.documents.map(sanitizeDoc).filter(d => d.name && d.extension)
    const docsMeta = docs.map(doc => docMetaFromDoc(doc).meta)
    const totalBytes = docsMeta.reduce((acc, item) => acc + Number(item?.bytes || 0), 0)
    return {
      mode: 'payload',
      referenceNumber,
      doNumber,
      typeVal,
      totalImages: normalizeTotalImages(stored.totalImages),
      totalImagesNieto: normalizeTotalImages(stored.totalImagesNieto),
      items: docs.map(doc => ({ type: 'payload', doc })),
      documentsMeta: docsMeta,
      documentsCount: docs.length,
      totalBytes
    }
  }

  const reg = await findRegistroForSubmission(rec)
  if (!reg || !Array.isArray(reg.photos) || reg.photos.length === 0) {
    throw new Error('No hay fotos en servidor para este BL')
  }
  const onlyMeta = Array.isArray(rec?.documents_meta) ? rec.documents_meta : []
  const targets = selectPhotoTargets(reg, onlyMeta)
  if (!targets.length) {
    throw new Error('No se pudieron reconstruir documentos desde storage')
  }
  const counts = countPlainNietoFromPhotos(reg.photos, referenceNumber)
  return {
    mode: 'registro',
    referenceNumber,
    doNumber,
    typeVal,
    totalImages: normalizeTotalImages(stored.totalImages) || counts.totalImages,
    totalImagesNieto: normalizeTotalImages(stored.totalImagesNieto) || counts.totalImagesNieto,
    items: targets.map(target => ({ type: 'storage', target })),
    documentsMeta: [],
    documentsCount: targets.length,
    totalBytes: 0
  }
}

async function processEvidenceSubmission(rec, options) {
  const force = !!options?.force
  const submission = rec?.id ? rec : await EvidenceSubmission.findByPk(rec)
  if (!submission) return { id: rec?.id || rec, ok: false, status: null, error: 'No encontrado' }
  if (!force && String(submission.status || '') === 'sent') {
    return { id: submission.id, ok: true, status: 'sent', skipped: true }
  }

  logger.info({
    msg: 'Evidence submission processing start',
    mode: force ? 'manual' : 'cron',
    submission_id: submission.id,
    reference_number: submission.reference_number,
    current_status: submission.status,
    sent_docs_count: submission.sent_docs_count
  })

  const claimedAt = new Date()
  await submission.update({
    status: 'processing',
    processing_started_at: claimedAt,
    next_attempt_at: null,
    error_message: null
  })

  try {
    const resolved = await resolveSubmissionSource(submission)
    const payloadStoredBase = buildStoredPayload({
      referenceNumber: resolved.referenceNumber,
      totalImages: resolved.totalImages,
      totalImagesNieto: resolved.totalImagesNieto,
      doNumber: resolved.doNumber,
      type: resolved.typeVal,
      documentsCount: resolved.documentsCount,
      totalBytes: resolved.totalBytes,
      documentsMeta: resolved.documentsMeta,
      documents: resolved.mode === 'payload' ? resolved.items.map(item => item.doc) : undefined,
      sourceMode: resolved.mode
    })

    const wPrep = await writeEvidenceLog(submission.id, {
      ts: new Date().toISOString(),
      endpoint: EVIDENCE_URL,
      action: force ? 'manual-prepare' : 'cron-prepare',
      referenceNumber: resolved.referenceNumber,
      doNumber: resolved.doNumber,
      type: resolved.typeVal,
      documents_count: resolved.documentsCount,
      documents_meta: resolved.documentsMeta,
      payload: payloadStoredBase
    }, force ? 'manual-prepare' : 'cron-prepare')

    const initialPayload = wPrep
      ? buildStoredPayload({
          referenceNumber: resolved.referenceNumber,
          totalImages: resolved.totalImages,
          totalImagesNieto: resolved.totalImagesNieto,
          doNumber: resolved.doNumber,
          type: resolved.typeVal,
          documentsCount: resolved.documentsCount,
          totalBytes: resolved.totalBytes,
          documentsMeta: resolved.documentsMeta,
          documents: resolved.mode === 'payload' ? resolved.items.map(item => item.doc) : undefined,
          logPath: relLogPath(wPrep),
          sourceMode: resolved.mode
        })
      : payloadStoredBase

    const sentDocsStart = Math.max(0, Number(submission.sent_docs_count || 0))
    const docsMeta = Array.isArray(resolved.documentsMeta) ? resolved.documentsMeta.slice() : []
    let totalBytes = Number(resolved.totalBytes || 0)
    let sentDocs = sentDocsStart

    await submission.update({
      documents_count: resolved.documentsCount,
      total_bytes: totalBytes,
      documents_meta: docsMeta,
      payload: initialPayload
    })

    for (let i = sentDocsStart; i < resolved.items.length; i++) {
      const item = resolved.items[i]
      const built = item.type === 'payload'
        ? (() => {
            const doc = sanitizeDoc(item.doc)
            const info = docMetaFromDoc(doc)
            return { doc, meta: info.meta, bytes: info.bytes }
          })()
        : await buildDocumentFromTarget(item.target)

      docsMeta[i] = built.meta
      totalBytes = docsMeta.reduce((acc, meta) => acc + Number(meta?.bytes || 0), 0)

      const payloadOne = {
        referenceNumber: resolved.referenceNumber,
        totalImages: resolved.totalImages,
        totalImagesNieto: resolved.totalImagesNieto,
        doNumber: resolved.doNumber,
        type: resolved.typeVal,
        documents: [built.doc]
      }

      try {
        const out = await sendToExternal(payloadOne)
        const logicalErrMsg = (out && out.data && typeof out.data === 'object') ? String(out.data.errorMessage || '').trim() : ''
        if (logicalErrMsg) {
          throw new Error(logicalErrMsg)
        }
        sentDocs = i + 1
        await submission.update({
          status: 'processing',
          sent_docs_count: sentDocs,
          documents_count: resolved.documentsCount,
          total_bytes: totalBytes,
          documents_meta: docsMeta,
          payload: buildStoredPayload({
            referenceNumber: resolved.referenceNumber,
            totalImages: resolved.totalImages,
            totalImagesNieto: resolved.totalImagesNieto,
            doNumber: resolved.doNumber,
            type: resolved.typeVal,
            documentsCount: resolved.documentsCount,
            totalBytes,
            documentsMeta: docsMeta,
            documents: resolved.mode === 'payload' ? resolved.items.map(entry => entry.doc) : undefined,
            logPath: relLogPath(wPrep),
            sourceMode: resolved.mode
          }),
          error_message: null
        })
      } catch (err) {
        const msg = String(err?.message || 'Error enviando evidencia')
        const wErr = await writeEvidenceLog(submission.id, {
          ts: new Date().toISOString(),
          endpoint: EVIDENCE_URL,
          action: force ? 'manual-doc-error' : 'cron-doc-error',
          referenceNumber: resolved.referenceNumber,
          doNumber: resolved.doNumber,
          type: resolved.typeVal,
          doc_index: i,
          doc_name: (built.doc?.name || '') + (built.doc?.extension || ''),
          sent_docs: sentDocs,
          total_docs: resolved.documentsCount,
          error: { message: msg, status: err?.response?.status || null, body: err?.response?.data },
          payloadFull: payloadOne
        }, force ? 'manual-doc-error' : 'cron-doc-error')

        await submission.update({
          status: 'failed',
          error_message: msg,
          sent_docs_count: sentDocs,
          processing_started_at: null,
          next_attempt_at: new Date(Date.now() + FOUR_HOURS_MS),
          documents_count: resolved.documentsCount,
          total_bytes: totalBytes,
          documents_meta: docsMeta,
          payload: buildStoredPayload({
            referenceNumber: resolved.referenceNumber,
            totalImages: resolved.totalImages,
            totalImagesNieto: resolved.totalImagesNieto,
            doNumber: resolved.doNumber,
            type: resolved.typeVal,
            documentsCount: resolved.documentsCount,
            totalBytes,
            documentsMeta: docsMeta,
            documents: resolved.mode === 'payload' ? resolved.items.map(entry => entry.doc) : undefined,
            logPath: relLogPath(wErr) || relLogPath(wPrep),
            sourceMode: resolved.mode
          })
        })

        logger.warn({
          msg: 'Evidence submission processing failed on document',
          mode: force ? 'manual' : 'cron',
          submission_id: submission.id,
          reference_number: resolved.referenceNumber,
          sent_docs: sentDocs,
          total_docs: resolved.documentsCount,
          error: msg
        })

        return { id: submission.id, ok: false, status: 'failed', error: msg, sent_docs: sentDocs, total_docs: resolved.documentsCount }
      }

      if (DOC_DELAY_MS > 0 && i < resolved.items.length - 1) {
        await sleep(DOC_DELAY_MS)
      }
    }

    await writeEvidenceLog(submission.id, {
      ts: new Date().toISOString(),
      endpoint: EVIDENCE_URL,
      action: force ? 'manual-complete' : 'cron-complete',
      referenceNumber: resolved.referenceNumber,
      doNumber: resolved.doNumber,
      type: resolved.typeVal,
      result: { sent_docs: sentDocs, total_docs: resolved.documentsCount }
    }, force ? 'manual-complete' : 'cron-complete')

    await submission.update({
      status: 'sent',
      error_message: null,
      sent_docs_count: sentDocs,
      processing_started_at: null,
      next_attempt_at: null,
      documents_count: resolved.documentsCount,
      total_bytes: totalBytes,
      documents_meta: docsMeta,
      payload: buildStoredPayload({
        referenceNumber: resolved.referenceNumber,
        totalImages: resolved.totalImages,
        totalImagesNieto: resolved.totalImagesNieto,
        doNumber: resolved.doNumber,
        type: resolved.typeVal,
        documentsCount: resolved.documentsCount,
        totalBytes,
        documentsMeta: docsMeta,
        documents: resolved.mode === 'payload' ? resolved.items.map(entry => entry.doc) : undefined,
        logPath: relLogPath(wPrep),
        sourceMode: resolved.mode
      })
    })

    logger.info({
      msg: 'Evidence submission processing complete',
      mode: force ? 'manual' : 'cron',
      submission_id: submission.id,
      reference_number: resolved.referenceNumber,
      sent_docs: sentDocs,
      total_docs: resolved.documentsCount
    })

    return { id: submission.id, ok: true, status: 'sent', sent_docs: sentDocs, total_docs: resolved.documentsCount }
  } catch (err) {
    const msg = String(err?.message || 'Error procesando evidencia')
    try {
      await writeEvidenceLog(submission.id, {
        ts: new Date().toISOString(),
        endpoint: EVIDENCE_URL,
        action: force ? 'manual-error' : 'cron-error',
        referenceNumber: submission.reference_number,
        doNumber: submission.do_number,
        type: submission.type,
        error: { message: msg, status: err?.response?.status || null, body: err?.response?.data }
      }, force ? 'manual-error' : 'cron-error')
    } catch {}
    await submission.update({
      status: 'failed',
      error_message: msg,
      processing_started_at: null,
      next_attempt_at: new Date(Date.now() + FOUR_HOURS_MS)
    })
    logger.error({
      msg: 'Evidence submission processing fatal error',
      mode: force ? 'manual' : 'cron',
      submission_id: submission.id,
      reference_number: submission.reference_number,
      error: msg
    })
    return { id: submission.id, ok: false, status: 'failed', error: msg }
  }
}

async function claimNextSubmissionIds(limit) {
  const now = new Date()
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS)
  const rows = await EvidenceSubmission.findAll({
    where: {
      [Op.or]: [
        {
          status: { [Op.in]: ['queued', 'received', 'failed', 'error', 'partial'] },
          [Op.or]: [
            { next_attempt_at: null },
            { next_attempt_at: { [Op.lte]: now } }
          ]
        },
        {
          status: 'processing',
          processing_started_at: { [Op.lte]: staleBefore }
        }
      ]
    },
    order: [['created_at', 'ASC'], ['id', 'ASC']],
    limit: Math.max(1, Number(limit || CYCLE_LIMIT))
  })

  const claimed = []
  for (const row of rows) {
    const where = { id: row.id, status: row.status }
    if (String(row.status) === 'processing') {
      where.processing_started_at = { [Op.lte]: staleBefore }
    }
    const [updated] = await EvidenceSubmission.update({
      status: 'processing',
      processing_started_at: new Date(),
      next_attempt_at: null,
      error_message: null
    }, { where })
    if (updated === 1) claimed.push(row.id)
  }
  return claimed
}

async function runEvidenceCycle() {
  if (cycleRunning) return { skipped: true, reason: 'already-running' }
  cycleRunning = true
  try {
    let processed = 0
    logger.info({ msg: 'Evidence cycle start', limit: CYCLE_LIMIT })
    while (processed < CYCLE_LIMIT) {
      const ids = await claimNextSubmissionIds(CYCLE_LIMIT - processed)
      if (!ids.length) {
        logger.info({ msg: 'Evidence cycle no pending submissions', processed })
        break
      }
      logger.info({ msg: 'Evidence cycle claimed submissions', ids, claimed: ids.length })
      for (const id of ids) {
        const rec = await EvidenceSubmission.findByPk(id)
        if (!rec) continue
        await processEvidenceSubmission(rec)
        processed++
      }
    }
    logger.info({ msg: 'Evidence cycle end', processed })
    return { skipped: false, processed }
  } catch (err) {
    logger.error({ msg: 'Evidence cycle failed', error: err.message, stack: err.stack })
    return { skipped: false, error: err.message }
  } finally {
    cycleRunning = false
  }
}

function startEvidenceScheduler() {
  if (schedulerTimer) return
  logger.info({ msg: 'Evidence scheduler bootstrap', first_run_in_ms: 15000, interval_ms: FOUR_HOURS_MS })
  setTimeout(() => {
    runEvidenceCycle().catch(err => logger.error({ msg: 'Initial evidence cycle failed', error: err.message }))
  }, 15000)
  schedulerTimer = setInterval(() => {
    runEvidenceCycle().catch(err => logger.error({ msg: 'Scheduled evidence cycle failed', error: err.message }))
  }, FOUR_HOURS_MS)
  logger.info(`[EVIDENCE_SCHEDULER] Activo cada ${Math.round(FOUR_HOURS_MS / (60 * 60 * 1000))} horas`)
}

module.exports = {
  buildStoredPayload,
  countPlainNietoFromPhotos,
  normalizeTotalImages,
  processEvidenceSubmission,
  runEvidenceCycle,
  startEvidenceScheduler
}
