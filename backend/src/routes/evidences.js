const express = require('express')
const axios = require('axios')
const path = require('path')
const { authRequired } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const { EvidenceSubmission, RegistroFotografico } = require('../db/sequelize')
const { Op } = require('sequelize')
const fs = require('fs').promises
const { filePath } = require('../services/storage')
const { EVIDENCE_URL, EVIDENCE_USER, EVIDENCE_PASS, EXTERNAL_RETRY_COUNT, EXTERNAL_TIMEOUT_MS, STORAGE_PATH } = require('../config')
const { processEvidenceSubmission } = require('../services/evidenceQueue')

const router = express.Router()

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
      await new Promise(r => setTimeout(r, 500 * attempt))
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

function mapLimit(items, limit, fn) {
  let i = 0
  const list = Array.isArray(items) ? items : []
  const out = new Array(list.length)
  async function worker() {
    while (i < list.length) {
      const idx = i++
      out[idx] = await fn(list[idx], idx)
    }
  }
  const workers = Array(Math.min(Number(limit || 1), list.length)).fill(0).map(() => worker())
  return Promise.all(workers).then(() => out)
}

function formatDate(ts) {
  const d = new Date(ts)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function formatDateTime(ts) {
  const d = new Date(ts)
  if (!Number.isFinite(d.getTime())) return '-'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}

function parseFlexibleDate(value) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }
  const s = String(value || '').trim()
  if (!s) return null

  const simple = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (simple) {
    const dd = Number(simple[1])
    const mm = Number(simple[2])
    const yyyy = Number(simple[3])
    const out = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0)
    return Number.isFinite(out.getTime()) ? out : null
  }

  const isoDay = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDay) {
    const yyyy = Number(isoDay[1])
    const mm = Number(isoDay[2])
    const dd = Number(isoDay[3])
    const out = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0)
    return Number.isFinite(out.getTime()) ? out : null
  }

  const out = new Date(s)
  return Number.isFinite(out.getTime()) ? out : null
}

function parseFilterDate(value, endOfDay) {
  if (!value) return null
  const parsed = parseFlexibleDate(value)
  if (!parsed) return null
  if (endOfDay) parsed.setHours(23, 59, 59, 999)
  else parsed.setHours(0, 0, 0, 0)
  return parsed
}

function buildEffectiveDateInfo(rec) {
  const meta = Array.isArray(rec?.documents_meta) ? rec.documents_meta : []
  let fromImage = null

  for (const doc of meta) {
    const parsed = parseFlexibleDate(doc?.date)
    if (!parsed) continue
    if (!fromImage || parsed.getTime() < fromImage.getTime()) fromImage = parsed
  }

  if (fromImage) {
    return {
      at: fromImage,
      label: formatDate(fromImage),
      source: 'image'
    }
  }

  const created = parseFlexibleDate(rec?.createdAt || rec?.created_at)
  if (created) {
    return {
      at: created,
      label: formatDateTime(created),
      source: 'submission'
    }
  }

  return { at: null, label: '-', source: null }
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

async function buildDocumentsFromRegistro(rec, onlyMeta) {
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

    const k = base + '|' + ext
    if (!indexExact.has(k)) indexExact.set(k, p)

    const c = extractConsecutive(base)
    if (c) {
      const kc = String(c.n) + '|' + ext
      const arr = byConsec.get(kc) || []
      arr.push(p)
      byConsec.set(kc, arr)
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
      if (score > bestScore) { bestScore = score; best = p }
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

  const targets = meta.length ? meta.map(m => {
    const name = String(m?.name || '').trim()
    const ext = normalizeExt(m?.extension)
    if (!name || !ext) return null
    const p = findPhotoForMeta(m)
    if (!p) return null
    return { p, forced: { name, extension: ext, category: String(m?.category || '').trim() } }
  }).filter(Boolean) : null

  const toRead = targets ? targets : photos
  const concurrency = targets ? 1 : 4

  const docsRaw = await mapLimit(toRead, concurrency, async (entry) => {
    const p = targets ? entry.p : entry
    const forced = targets ? entry.forced : null
    try {
      const ts = Number(String(p.id || '').split('-')[0]) || Date.now()
      const date = formatDate(ts)
      const filename = p.filename || p.id || 'Documento'
      const ext = forced?.extension || extFor(filename)
      const name = forced?.name || (baseNameFor(filename) || 'Documento')
      const category = forced ? (forced.category || '') : ''
      const abs = p.path || filePath(p.id)
      const buf = await fs.readFile(abs)
      const contentBase64 = buf.toString('base64')
      return { name, extension: ext, category, date, contentBase64 }
    } catch {
      return null
    }
  })

  const docs = docsRaw.filter(Boolean)
  const totalBytes = docs.reduce((acc, d) => acc + Buffer.byteLength(d.contentBase64, 'base64'), 0)
  const docsMeta = docs.map(d => ({ name: d.name, extension: d.extension, category: d.category || '', date: d.date, bytes: Buffer.byteLength(d.contentBase64, 'base64') }))
  return { docs, totalBytes, docsMeta }
}

router.post('/evidences/submit', authRequired, async (req, res) => {
  try {
    const body = req.body || {}
    const serverBuild = !!body.serverBuild
    if (serverBuild) {
      const blId = String(body.blId || '').trim()
      const referenceNumber = String(body.referenceNumber || '')
      const doNumber = body.doNumber ? String(body.doNumber) : null
      const type = String(body.type || '')
      const typeVal = type === 'master' ? 'master' : 'hijo'
      if (!blId || !referenceNumber || !type) return res.status(400).json({ ok: false, error: 'blId, referenceNumber y type requeridos' })
      const rec = await RegistroFotografico.findOne({ where: { bl_id: blId, user_id: req.user.id, type: typeVal } })
      if (!rec || !Array.isArray(rec.photos) || rec.photos.length === 0) {
        try {
          await writeEvidenceLog('no-photos', { ts: new Date().toISOString(), endpoint: EVIDENCE_URL, user_id: req.user.id, type, referenceNumber, doNumber, error: { message: 'No hay fotos para el BL' } })
        } catch {}
        return res.status(404).json({ ok: false, error: 'No hay fotos para el BL' })
      }
      const counts = countPlainNietoFromPhotos(rec.photos, referenceNumber)
      const payloadStored = buildStoredPayload({
        referenceNumber,
        totalImages: counts.totalImages,
        totalImagesNieto: counts.totalImagesNieto,
        doNumber,
        type,
        documentsCount: rec.photos.length,
        totalBytes: 0,
        documentsMeta: [],
        sourceMode: 'registro'
      })
      const initial = await EvidenceSubmission.create({
        user_id: req.user.id,
        reference_number: referenceNumber,
        do_number: doNumber,
        type,
        documents_count: rec.photos.length,
        total_bytes: 0,
        documents_meta: [],
        payload: payloadStored,
        status: 'queued',
        sent_docs_count: 0,
        processing_started_at: null,
        next_attempt_at: null,
        error_message: null
      })
      res.json({ ok: true, queued: true, scheduled: true, id: initial.id, endpoint: EVIDENCE_URL, received: { referenceNumber, totalImages: counts.totalImages, totalImagesNieto: counts.totalImagesNieto, doNumber, type, documentsCount: rec.photos.length } })
      return
    }
    const { referenceNumber, doNumber, type, documents } = body
    const totalImages = normalizeTotalImages(body.totalImages)
    const totalImagesNieto = normalizeTotalImages(body.totalImagesNieto)
    const typeVal = String(type || '')
    if (!referenceNumber || !typeVal) return res.status(400).json({ ok: false, error: 'referenceNumber y type requeridos' })

    const list = Array.isArray(documents) ? documents : []
    const documentsCount = list.length
    const totalBytes = list.reduce((acc, d) => acc + (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0), 0)
    const docsMeta = list.map(d => ({ name: d.name, extension: d.extension, category: d.category || '', date: d.date, bytes: (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0) }))

    const payloadStored = buildStoredPayload({
      referenceNumber,
      totalImages,
      totalImagesNieto,
      doNumber,
      type: typeVal,
      documentsCount,
      totalBytes,
      documentsMeta: docsMeta,
      documents: list,
      sourceMode: 'payload'
    })

    let rec = null
    try {
      rec = await EvidenceSubmission.create({
        user_id: req.user.id,
        reference_number: String(referenceNumber),
        do_number: doNumber ? String(doNumber) : null,
        type: typeVal,
        documents_count: documentsCount,
        total_bytes: totalBytes,
        documents_meta: docsMeta,
        payload: payloadStored,
        status: 'queued',
        sent_docs_count: 0,
        processing_started_at: null,
        next_attempt_at: null,
        error_message: null
      })
    } catch {}

    res.json({ ok: true, queued: true, scheduled: true, id: rec?.id || null, endpoint: EVIDENCE_URL, received: { referenceNumber, totalImages, totalImagesNieto, doNumber, type: typeVal, documentsCount }, meta: { totalBytes } })
  } catch (err) {
    try {
      const b = req.body || {}
      const referenceNumber = String(b.referenceNumber || '')
      const doNumber = b.doNumber ? String(b.doNumber) : null
      const typeVal = String(b.type || '')
      const totalImages = normalizeTotalImages(b.totalImages)
      const totalImagesNieto = normalizeTotalImages(b.totalImagesNieto)
      const list = Array.isArray(b.documents) ? b.documents : []
      const documentsCount = list.length
      const totalBytes = list.reduce((acc, d) => acc + (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0), 0)
      const docsMeta = list.map(d => ({ name: d.name, extension: d.extension, category: d.category || '', date: d.date, bytes: (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0) }))
      const payloadStored = buildStoredPayload({ referenceNumber, totalImages, totalImagesNieto, doNumber, type: typeVal, documentsCount, totalBytes, documentsMeta: docsMeta, documents: list, sourceMode: 'payload' })
      await EvidenceSubmission.create({ user_id: req.user?.id || null, reference_number: referenceNumber, do_number: doNumber, type: typeVal, documents_count: documentsCount, total_bytes: totalBytes, documents_meta: docsMeta, payload: payloadStored, status: 'error', sent_docs_count: 0, processing_started_at: null, next_attempt_at: null, error_message: err.message })
    } catch {}
    res.status(500).json({ ok: false, error: 'Error al recibir evidencias', detail: err.message })
  }
})

router.get('/evidences/admin/pending', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const limitRaw = Number(req.query?.limit || 200)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.trunc(limitRaw))) : 200
    const rows = await EvidenceSubmission.findAll({
      where: { status: { [Op.ne]: 'sent' } },
      order: [['id', 'DESC']],
      limit,
      attributes: { exclude: ['payload'] }
    })

    function docMetaToName(d) {
      const name = String(d?.name || '').trim()
      const ext = String(d?.extension || '').trim()
      if (!name) return null
      return ext && ext.startsWith('.') ? (name + ext) : (ext ? (name + '.' + ext) : name)
    }

    const itemsRaw = await mapLimit(rows, 4, async (r) => {
      let imageNames = []
      const meta = Array.isArray(r.documents_meta) ? r.documents_meta : []
      if (meta.length) {
        imageNames = meta.map(docMetaToName).filter(Boolean)
      }
      if (!imageNames.length) {
        const typeVal = String(r.type || '') === 'master' ? 'master' : 'hijo'
        let reg = null
        if (r.user_id) {
          reg = await RegistroFotografico.findOne({ where: { bl_id: String(r.reference_number || ''), type: typeVal, user_id: r.user_id } })
        }
        if (!reg) {
          reg = await RegistroFotografico.findOne({ where: { bl_id: String(r.reference_number || ''), type: typeVal } })
        }
        const photos = Array.isArray(reg?.photos) ? reg.photos : []
        imageNames = photos.map(p => String(p?.filename || p?.id || '').trim()).filter(Boolean)
      }
      const preview = imageNames.slice(0, 5)
      return {
        id: r.id,
        user_id: r.user_id,
        reference_number: r.reference_number,
        do_number: r.do_number,
        type: r.type,
        status: r.status,
        documents_count: r.documents_count,
        total_bytes: r.total_bytes,
        error_message: r.error_message,
        created_at: r.createdAt || r.created_at || null,
        updated_at: r.updatedAt || r.updated_at || null,
        image_names_preview: preview,
        images_total: imageNames.length,
      }
    })

    const items = itemsRaw.filter(Boolean)
    res.json({ ok: true, items, count: items.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al listar evidencias pendientes', detail: err.message })
  }
})

router.get('/evidences/admin/sent', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const fromRaw = String(req.query?.from || '').trim()
    const toRaw = String(req.query?.to || '').trim()
    if (!fromRaw && !toRaw) {
      return res.json({
        ok: true,
        items: [],
        count: 0,
        filters: { from: null, to: null },
        requires_filters: true
      })
    }
    if (!fromRaw || !toRaw) {
      return res.status(400).json({ ok: false, error: 'Debes indicar fecha desde y fecha hasta' })
    }
    const from = fromRaw ? parseFilterDate(fromRaw, false) : null
    const to = toRaw ? parseFilterDate(toRaw, true) : null
    if (fromRaw && !from) return res.status(400).json({ ok: false, error: 'Fecha desde inválida' })
    if (toRaw && !to) return res.status(400).json({ ok: false, error: 'Fecha hasta inválida' })
    if (from && to && from.getTime() > to.getTime()) {
      return res.status(400).json({ ok: false, error: 'La fecha desde no puede ser mayor que la fecha hasta' })
    }

    const limitRaw = Number(req.query?.limit || 2000)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10000, Math.trunc(limitRaw))) : 2000
    const rows = await EvidenceSubmission.findAll({
      where: { status: 'sent' },
      order: [['createdAt', 'DESC']],
      limit,
      attributes: { exclude: ['payload'] }
    })

    const items = rows.map(r => {
      const meta = Array.isArray(r.documents_meta) ? r.documents_meta : []
      const dateInfo = buildEffectiveDateInfo(r)
      const imagesTotal = Math.max(Number(r.documents_count || 0), meta.length)
      return {
        id: r.id,
        user_id: r.user_id,
        reference_number: r.reference_number,
        do_number: r.do_number,
        type: r.type,
        status: r.status,
        documents_count: r.documents_count,
        images_total: imagesTotal,
        effective_date: dateInfo.label,
        effective_date_at: dateInfo.at ? dateInfo.at.toISOString() : null,
        effective_date_source: dateInfo.source,
        created_at: r.createdAt || r.created_at || null,
        updated_at: r.updatedAt || r.updated_at || null
      }
    }).filter(item => {
      if (!from && !to) return true
      const dt = parseFlexibleDate(item.effective_date_at || item.created_at)
      if (!dt) return false
      if (from && dt.getTime() < from.getTime()) return false
      if (to && dt.getTime() > to.getTime()) return false
      return true
    })

    res.json({
      ok: true,
      items,
      count: items.length,
      filters: { from: fromRaw || null, to: toRaw || null }
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al listar evidencias enviadas', detail: err.message })
  }
})

router.post('/evidences/admin/resend', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    const cleaned = Array.from(new Set(ids.map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0))).slice(0, 300)
    if (!cleaned.length) return res.status(400).json({ ok: false, error: 'ids requeridos' })

    const records = await EvidenceSubmission.findAll({ where: { id: { [Op.in]: cleaned } } })
    const byId = {}
    records.forEach(r => { byId[String(r.id)] = r })

    const results = await mapLimit(cleaned, 1, async (id) => {
      const rec = byId[String(id)]
      if (!rec) return { id, ok: false, status: null, error: 'No encontrado' }
      return processEvidenceSubmission(rec, { force: true })
    })

    res.json({ ok: true, results })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al reenviar evidencias', detail: err.message })
  }
})

module.exports = router
