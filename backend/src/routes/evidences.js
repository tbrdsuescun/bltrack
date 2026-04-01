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

function buildStoredPayload({ referenceNumber, totalImages, totalImagesNieto, doNumber, type, documentsCount, totalBytes, documentsMeta, logPath }) {
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
  if (logPath) out.logPath = String(logPath)
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

function extFor(name) {
  const dot = String(name || '').lastIndexOf('.')
  return dot >= 0 ? String(name).slice(dot).toLowerCase() : '.dat'
}

function baseNameFor(name) {
  const s = String(name || '')
  const dot = s.lastIndexOf('.')
  return dot >= 0 ? s.slice(0, dot) : s
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

async function buildDocumentsFromRegistro(rec) {
  const photos = Array.isArray(rec?.photos) ? rec.photos : []
  const docsRaw = await mapLimit(photos, 4, async (p) => {
    try {
      const ts = Number(String(p.id || '').split('-')[0]) || Date.now()
      const date = formatDate(ts)
      const filename = p.filename || p.id || 'Documento'
      const ext = extFor(filename)
      const name = baseNameFor(filename) || 'Documento'
      const category = p?.averia ? 'averia' : (p?.crossdoking ? 'crossdoking' : '')
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
      const initial = await EvidenceSubmission.create({ user_id: req.user.id, reference_number: referenceNumber, do_number: doNumber, type, documents_count: rec.photos.length, total_bytes: 0, documents_meta: [], payload: null, status: 'queued', error_message: null })
      res.json({ ok: true, queued: true, id: initial.id, endpoint: EVIDENCE_URL, received: { referenceNumber, totalImages: counts.totalImages, totalImagesNieto: counts.totalImagesNieto, doNumber, type, documentsCount: rec.photos.length } })
      setImmediate(async () => {
        try {
          const { docs, totalBytes, docsMeta } = await buildDocumentsFromRegistro(rec)
          const documentsCount = docs.length

          const counts = countPlainNietoFromPhotos(rec.photos, referenceNumber)
          const payloadFull = { referenceNumber, totalImages: counts.totalImages, totalImagesNieto: counts.totalImagesNieto, doNumber, type, documents: docs }
          const payloadStored = buildStoredPayload({ referenceNumber, totalImages: counts.totalImages, totalImagesNieto: counts.totalImagesNieto, doNumber, type, documentsCount, totalBytes, documentsMeta: docsMeta })

          await initial.update({ documents_count: documentsCount, total_bytes: totalBytes, documents_meta: docsMeta, payload: payloadStored, status: 'received', error_message: null })

          try {
            const wPrep = await writeEvidenceLog(initial.id, { ts: new Date().toISOString(), endpoint: EVIDENCE_URL, user_id: req.user.id, type, referenceNumber, doNumber, documents_count: documentsCount, documents_meta: docsMeta, action: 'prepare', payload: payloadStored }, 'prepare')
            if (wPrep) {
              try { await initial.update({ payload: buildStoredPayload({ referenceNumber, totalImages: counts.totalImages, totalImagesNieto: counts.totalImagesNieto, doNumber, type, documentsCount, totalBytes, documentsMeta: docsMeta, logPath: relLogPath(wPrep) }) }) } catch {}
            }

            const out = await sendToExternal(payloadFull)
            const logicalErrMsg = (out && out.data && typeof out.data === 'object') ? String(out.data.errorMessage || '').trim() : ''
            if (logicalErrMsg) {
              const errEntry = {
                ts: new Date().toISOString(),
                endpoint: EVIDENCE_URL,
                user_id: req.user.id,
                type,
                referenceNumber,
                doNumber,
                documents_count: documentsCount,
                documents_meta: docsMeta,
                error: { message: logicalErrMsg, status: out?.status || null, body: out?.data },
                payload: payloadStored,
                payloadFull
              }
              const wErr = await writeEvidenceLog(initial.id, errEntry, 'error')
              if (wErr) {
                try { await initial.update({ payload: buildStoredPayload({ referenceNumber, totalImages: counts.totalImages, totalImagesNieto: counts.totalImagesNieto, doNumber, type, documentsCount, totalBytes, documentsMeta: docsMeta, logPath: relLogPath(wErr) }) }) } catch {}
              }
              await initial.update({ status: 'failed', error_message: logicalErrMsg })
              return
            }

            await writeEvidenceLog(initial.id, {
              ts: new Date().toISOString(),
              endpoint: EVIDENCE_URL,
              user_id: req.user.id,
              type,
              referenceNumber,
              doNumber,
              documents_count: documentsCount,
              documents_meta: docsMeta,
              response: { status: out?.status || null, body: out?.data }
            }, 'response')
            await initial.update({ status: 'sent', error_message: null })
          } catch (err) {
            const errEntry = {
              ts: new Date().toISOString(),
              endpoint: EVIDENCE_URL,
              user_id: req.user.id,
              type,
              referenceNumber,
              doNumber,
              documents_count: documentsCount,
              documents_meta: docsMeta,
              error: { message: err.message, status: err?.response?.status || null, body: err?.response?.data },
              payload: payloadStored,
              payloadFull
            }
            const wErr = await writeEvidenceLog(initial.id, errEntry, 'error')
            if (wErr) {
              try { await initial.update({ payload: buildStoredPayload({ referenceNumber, totalImages: counts.totalImages, totalImagesNieto: counts.totalImagesNieto, doNumber, type, documentsCount, totalBytes, documentsMeta: docsMeta, logPath: relLogPath(wErr) }) }) } catch {}
            }
            try { await initial.update({ status: 'failed', error_message: err.message }) } catch {}
          }
        } catch (e) {
          try { await initial.update({ status: 'error', error_message: e.message }) } catch {}
        }
      })
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

    const payloadFull = { referenceNumber: String(referenceNumber), totalImages, totalImagesNieto, doNumber: doNumber ? String(doNumber) : null, type: typeVal, documents: list }
    const payloadStored = buildStoredPayload({ referenceNumber, totalImages, totalImagesNieto, doNumber, type: typeVal, documentsCount, totalBytes, documentsMeta: docsMeta })

    let rec = null
    try { rec = await EvidenceSubmission.create({ user_id: req.user.id, reference_number: String(referenceNumber), do_number: doNumber ? String(doNumber) : null, type: typeVal, documents_count: documentsCount, total_bytes: totalBytes, documents_meta: docsMeta, payload: payloadStored, status: 'received', error_message: null }) } catch {}

    res.json({ ok: true, queued: true, endpoint: EVIDENCE_URL, received: { referenceNumber, totalImages, totalImagesNieto, doNumber, type: typeVal, documentsCount }, meta: { totalBytes } })

    setImmediate(async () => {
      if (!rec) return
      try {
        const wPrep = await writeEvidenceLog(rec.id, { ts: new Date().toISOString(), endpoint: EVIDENCE_URL, user_id: req.user.id, type: typeVal, referenceNumber, doNumber, documents_count: documentsCount, documents_meta: docsMeta, action: 'prepare', payload: payloadStored }, 'prepare')
        if (wPrep) {
          try { await rec.update({ payload: buildStoredPayload({ referenceNumber, totalImages, totalImagesNieto, doNumber, type: typeVal, documentsCount, totalBytes, documentsMeta: docsMeta, logPath: relLogPath(wPrep) }) }) } catch {}
        }

        const out = await sendToExternal(payloadFull)
        const logicalErrMsg = (out && out.data && typeof out.data === 'object') ? String(out.data.errorMessage || '').trim() : ''
        if (logicalErrMsg) {
          const errEntry = {
            ts: new Date().toISOString(),
            endpoint: EVIDENCE_URL,
            user_id: req.user.id,
            type: typeVal,
            referenceNumber,
            doNumber,
            documents_count: documentsCount,
            documents_meta: docsMeta,
            error: { message: logicalErrMsg, status: out?.status || null, body: out?.data },
            payload: payloadStored,
            payloadFull
          }
          const wErr = await writeEvidenceLog(rec.id, errEntry, 'error')
          if (wErr) {
            try { await rec.update({ payload: buildStoredPayload({ referenceNumber, totalImages, totalImagesNieto, doNumber, type: typeVal, documentsCount, totalBytes, documentsMeta: docsMeta, logPath: relLogPath(wErr) }) }) } catch {}
          }
          await rec.update({ status: 'failed', error_message: logicalErrMsg })
          return
        }

        await writeEvidenceLog(rec.id, {
          ts: new Date().toISOString(),
          endpoint: EVIDENCE_URL,
          user_id: req.user.id,
          type: typeVal,
          referenceNumber,
          doNumber,
          documents_count: documentsCount,
          documents_meta: docsMeta,
          response: { status: out?.status || null, body: out?.data }
        }, 'response')

        await rec.update({ status: 'sent', error_message: null })
      } catch (err) {
        const errEntry = {
          ts: new Date().toISOString(),
          endpoint: EVIDENCE_URL,
          user_id: req.user.id,
          type: typeVal,
          referenceNumber,
          doNumber,
          documents_count: documentsCount,
          documents_meta: docsMeta,
          error: { message: err.message, status: err?.response?.status || null, body: err?.response?.data },
          payload: payloadStored,
          payloadFull
        }
        const wErr = await writeEvidenceLog(rec.id, errEntry, 'error')
        if (wErr) {
          try { await rec.update({ payload: buildStoredPayload({ referenceNumber, totalImages, totalImagesNieto, doNumber, type: typeVal, documentsCount, totalBytes, documentsMeta: docsMeta, logPath: relLogPath(wErr) }) }) } catch {}
        }
        try { await rec.update({ status: 'failed', error_message: err.message }) } catch {}
      }
    })
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
      const payloadStored = buildStoredPayload({ referenceNumber, totalImages, totalImagesNieto, doNumber, type: typeVal, documentsCount, totalBytes, documentsMeta: docsMeta })
      await EvidenceSubmission.create({ user_id: req.user?.id || null, reference_number: referenceNumber, do_number: doNumber, type: typeVal, documents_count: documentsCount, total_bytes: totalBytes, documents_meta: docsMeta, payload: payloadStored, status: 'error', error_message: err.message })
    } catch {}
    res.status(500).json({ ok: false, error: 'Error al recibir evidencias', detail: err.message })
  }
})

router.get('/admin/evidences/pending', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const limitRaw = Number(req.query?.limit || 200)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.trunc(limitRaw))) : 200
    const rows = await EvidenceSubmission.findAll({
      where: { status: { [Op.ne]: 'sent' } },
      order: [['created_at', 'DESC']],
      limit
    })
    const items = rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      reference_number: r.reference_number,
      do_number: r.do_number,
      type: r.type,
      status: r.status,
      documents_count: r.documents_count,
      total_bytes: r.total_bytes,
      error_message: r.error_message,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
    res.json({ ok: true, items, count: items.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al listar evidencias pendientes', detail: err.message })
  }
})

router.post('/admin/evidences/resend', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    const cleaned = Array.from(new Set(ids.map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0))).slice(0, 300)
    if (!cleaned.length) return res.status(400).json({ ok: false, error: 'ids requeridos' })

    const records = await EvidenceSubmission.findAll({ where: { id: { [Op.in]: cleaned } } })
    const byId = {}
    records.forEach(r => { byId[String(r.id)] = r })

    const results = await mapLimit(cleaned, 2, async (id) => {
      const rec = byId[String(id)]
      if (!rec) return { id, ok: false, status: null, error: 'No encontrado' }
      if (String(rec.status) === 'sent') return { id, ok: true, status: 'sent', skipped: true }

      const referenceNumber = String(rec.reference_number || '').trim()
      const doNumber = rec.do_number ? String(rec.do_number) : null
      const typeVal = String(rec.type || '') === 'master' ? 'master' : 'hijo'
      if (!referenceNumber) return { id, ok: false, status: String(rec.status || ''), error: 'reference_number vacío' }

      let reg = null
      if (rec.user_id) {
        reg = await RegistroFotografico.findOne({ where: { bl_id: referenceNumber, type: typeVal, user_id: rec.user_id } })
      }
      if (!reg) {
        reg = await RegistroFotografico.findOne({ where: { bl_id: referenceNumber, type: typeVal } })
      }
      if (!reg || !Array.isArray(reg.photos) || reg.photos.length === 0) {
        try {
          await writeEvidenceLog(id, { ts: new Date().toISOString(), endpoint: EVIDENCE_URL, action: 'resend', referenceNumber, doNumber, type: typeVal, error: { message: 'No hay fotos en servidor para este BL' } }, 'resend-no-photos')
        } catch {}
        try { await rec.update({ status: 'failed', error_message: 'No hay fotos en servidor para este BL' }) } catch {}
        return { id, ok: false, status: 'failed', error: 'No hay fotos en servidor para este BL' }
      }

      try { await rec.update({ status: 'queued', error_message: null }) } catch {}
      try {
        const { docs, totalBytes, docsMeta } = await buildDocumentsFromRegistro(reg)
        const documentsCount = docs.length
        if (!documentsCount) throw new Error('No se pudieron construir documentos desde storage')

        const stored = (rec.payload && typeof rec.payload === 'object') ? rec.payload : {}
        const totalImages = normalizeTotalImages(stored.totalImages)
        const totalImagesNieto = normalizeTotalImages(stored.totalImagesNieto)
        const counts = countPlainNietoFromPhotos(reg.photos, referenceNumber)
        const payloadFull = { referenceNumber, totalImages: totalImages || counts.totalImages, totalImagesNieto: totalImagesNieto || counts.totalImagesNieto, doNumber, type: typeVal, documents: docs }

        const payloadStored = buildStoredPayload({
          referenceNumber,
          totalImages: payloadFull.totalImages,
          totalImagesNieto: payloadFull.totalImagesNieto,
          doNumber,
          type: typeVal,
          documentsCount,
          totalBytes,
          documentsMeta: docsMeta
        })

        const wPrep = await writeEvidenceLog(rec.id, { ts: new Date().toISOString(), endpoint: EVIDENCE_URL, type: typeVal, referenceNumber, doNumber, documents_count: documentsCount, documents_meta: docsMeta, action: 'resend-prepare', payload: payloadStored }, 'resend-prepare')
        if (wPrep) {
          try { await rec.update({ payload: buildStoredPayload({ referenceNumber, totalImages: payloadFull.totalImages, totalImagesNieto: payloadFull.totalImagesNieto, doNumber, type: typeVal, documentsCount, totalBytes, documentsMeta: docsMeta, logPath: relLogPath(wPrep) }) }) } catch {}
        } else {
          try { await rec.update({ payload: payloadStored }) } catch {}
        }
        try { await rec.update({ documents_count: documentsCount, total_bytes: totalBytes, documents_meta: docsMeta, error_message: null }) } catch {}

        const out = await sendToExternal(payloadFull)
        const logicalErrMsg = (out && out.data && typeof out.data === 'object') ? String(out.data.errorMessage || '').trim() : ''
        if (logicalErrMsg) {
          const errEntry = {
            ts: new Date().toISOString(),
            endpoint: EVIDENCE_URL,
            type: typeVal,
            referenceNumber,
            doNumber,
            documents_count: documentsCount,
            documents_meta: docsMeta,
            error: { message: logicalErrMsg, status: out?.status || null, body: out?.data },
            payload: payloadStored,
            payloadFull
          }
          const wErr = await writeEvidenceLog(rec.id, errEntry, 'resend-error')
          if (wErr) {
            try { await rec.update({ payload: buildStoredPayload({ referenceNumber, totalImages: payloadFull.totalImages, totalImagesNieto: payloadFull.totalImagesNieto, doNumber, type: typeVal, documentsCount, totalBytes, documentsMeta: docsMeta, logPath: relLogPath(wErr) }) }) } catch {}
          }
          await rec.update({ status: 'failed', error_message: logicalErrMsg })
          return { id, ok: false, status: 'failed', error: logicalErrMsg }
        }

        await writeEvidenceLog(rec.id, {
          ts: new Date().toISOString(),
          endpoint: EVIDENCE_URL,
          type: typeVal,
          referenceNumber,
          doNumber,
          documents_count: documentsCount,
          documents_meta: docsMeta,
          action: 'resend-response',
          response: { status: out?.status || null, body: out?.data }
        }, 'resend-response')
        await rec.update({ status: 'sent', error_message: null })
        return { id, ok: true, status: 'sent' }
      } catch (err) {
        const msg = String(err?.message || 'Error reenviando')
        try {
          await writeEvidenceLog(rec.id, { ts: new Date().toISOString(), endpoint: EVIDENCE_URL, action: 'resend-error', referenceNumber, doNumber, type: typeVal, error: { message: msg, status: err?.response?.status || null, body: err?.response?.data } }, 'resend-error')
        } catch {}
        try { await rec.update({ status: 'failed', error_message: msg }) } catch {}
        return { id, ok: false, status: 'failed', error: msg }
      }
    })

    res.json({ ok: true, results })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al reenviar evidencias', detail: err.message })
  }
})

module.exports = router
