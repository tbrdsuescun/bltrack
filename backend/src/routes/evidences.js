const express = require('express')
const axios = require('axios')
const path = require('path')
const { authRequired } = require('../middlewares/auth')
const { EvidenceSubmission, RegistroFotografico } = require('../db/sequelize')
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

async function writeEvidenceLog(id, entry) {
  try {
    const dir = path.join(STORAGE_PATH, 'evidence-logs')
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(dir, `${String(id)}-${Date.now()}.json`)
    await fs.writeFile(file, JSON.stringify(entry))
  } catch {}
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
      if (!blId || !referenceNumber || !type) return res.status(400).json({ ok: false, error: 'blId, referenceNumber y type requeridos' })
      const rec = await RegistroFotografico.findOne({ where: { bl_id: blId, user_id: req.user.id } })
      if (!rec || !Array.isArray(rec.photos) || rec.photos.length === 0) {
        try {
          await writeEvidenceLog('no-photos', { ts: new Date().toISOString(), endpoint: EVIDENCE_URL, user_id: req.user.id, type, referenceNumber, doNumber, error: { message: 'No hay fotos para el BL' } })
        } catch {}
        return res.status(404).json({ ok: false, error: 'No hay fotos para el BL' })
      }
      function formatDate(ts) { const d = new Date(ts); const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yyyy = d.getFullYear(); return `${dd}/${mm}/${yyyy}` }
      function extFor(name) { const dot = String(name||'').lastIndexOf('.'); return dot>=0 ? String(name).slice(dot).toLowerCase() : '.dat' }
      function mapLimit(items, limit, fn) {
        let i = 0
        const out = new Array(items.length)
        async function worker() {
          while (i < items.length) {
            const idx = i++
            out[idx] = await fn(items[idx], idx)
          }
        }
        const workers = Array(Math.min(limit, items.length)).fill(0).map(() => worker())
        return Promise.all(workers).then(() => out)
      }
      const initial = await EvidenceSubmission.create({ user_id: req.user.id, reference_number: referenceNumber, do_number: doNumber, type, documents_count: rec.photos.length, total_bytes: 0, documents_meta: [], payload: null, status: 'queued', error_message: null })
      res.json({ ok: true, queued: true, id: initial.id, endpoint: EVIDENCE_URL, received: { referenceNumber, doNumber, type, documentsCount: rec.photos.length } })
      setImmediate(async () => {
        try {
          async function readBase64(p) { const abs = p.path || filePath(p.id); const buf = await fs.readFile(abs); return buf.toString('base64') }
          const docsRaw = await mapLimit(rec.photos, 4, async (p) => {
            try {
              const ts = Number(String(p.id||'').split('-')[0]) || Date.now()
              const date = formatDate(ts)
              const name = p.filename || p.id || 'Documento'
              const ext = extFor(p.filename || p.id)
              const category = p.averia ? 'averia' : ''
              const contentBase64 = await readBase64(p)
              return { name, extension: ext, category, date, contentBase64 }
            } catch {
              return null
            }
          })
          const docs = docsRaw.filter(Boolean)
          const documentsCount = docs.length
          const totalBytes = docs.reduce((acc, d) => acc + Buffer.byteLength(d.contentBase64, 'base64'), 0)
          const docsMeta = docs.map(d => ({ name: d.name, extension: d.extension, category: d.category || '', date: d.date, bytes: Buffer.byteLength(d.contentBase64, 'base64') }))
          const payload = { referenceNumber, doNumber, type, documents: docs }
          await initial.update({ documents_count: documentsCount, total_bytes: totalBytes, documents_meta: docsMeta, payload, status: 'received', error_message: null })
          try {
            await writeEvidenceLog(initial.id, { ts: new Date().toISOString(), endpoint: EVIDENCE_URL, user_id: req.user.id, type, referenceNumber, doNumber, documents_count: documentsCount, documents_meta: docsMeta, action: 'prepare' })
            const out = await sendToExternal(payload)
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
            })
            await initial.update({ status: 'sent', error_message: null })
          } catch (err) {
            try {
              await writeEvidenceLog(initial.id, {
                ts: new Date().toISOString(),
                endpoint: EVIDENCE_URL,
                user_id: req.user.id,
                type,
                referenceNumber,
                doNumber,
                documents_count: documentsCount,
                documents_meta: docsMeta,
                error: { message: err.message, status: err?.response?.status || null, body: err?.response?.data }
              })
            } catch {}
            try { await initial.update({ status: 'failed', error_message: err.message }) } catch {}
          }
        } catch (e) {
          try { await initial.update({ status: 'error', error_message: e.message }) } catch {}
        }
      })
      return
    }
    const { referenceNumber, doNumber, type, documents } = body
    if (!referenceNumber || !type) return res.status(400).json({ ok: false, error: 'referenceNumber y type requeridos' })
    const list = Array.isArray(documents) ? documents : []
    const documentsCount = list.length
    const totalBytes = list.reduce((acc, d) => acc + (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0), 0)
    const docsMeta = list.map(d => ({ name: d.name, extension: d.extension, category: d.category || '', date: d.date, bytes: (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0) }))
    const payload = { referenceNumber: String(referenceNumber), doNumber: doNumber ? String(doNumber) : null, type: String(type), documents: list }
    let rec = null
    try { rec = await EvidenceSubmission.create({ user_id: req.user.id, reference_number: String(referenceNumber), do_number: doNumber ? String(doNumber) : null, type: String(type), documents_count: documentsCount, total_bytes: totalBytes, documents_meta: docsMeta, payload, status: 'received', error_message: null }) } catch {}
    res.json({ ok: true, queued: true, endpoint: EVIDENCE_URL, received: { referenceNumber, doNumber, type, documentsCount }, meta: { totalBytes } })
    setImmediate(async () => {
      if (!rec) return
      try {
        await writeEvidenceLog(rec.id, { ts: new Date().toISOString(), endpoint: EVIDENCE_URL, user_id: req.user.id, type, referenceNumber, doNumber, documents_count: documentsCount, documents_meta: docsMeta, action: 'prepare' })
        const out = await sendToExternal(payload)
        await writeEvidenceLog(rec.id, {
          ts: new Date().toISOString(),
          endpoint: EVIDENCE_URL,
          user_id: req.user.id,
          type,
          referenceNumber,
          doNumber,
          documents_count: documentsCount,
          documents_meta: docsMeta,
          response: { status: out?.status || null, body: out?.data }
        })
        await rec.update({ status: 'sent', error_message: null })
      } catch (err) {
        try {
          await writeEvidenceLog(rec.id, {
            ts: new Date().toISOString(),
            endpoint: EVIDENCE_URL,
            user_id: req.user.id,
            type,
            referenceNumber,
            doNumber,
            documents_count: documentsCount,
            documents_meta: docsMeta,
            error: { message: err.message, status: err?.response?.status || null, body: err?.response?.data }
          })
        } catch {}
        try { await rec.update({ status: 'failed', error_message: err.message }) } catch {}
      }
    })
  } catch (err) {
    try {
      const b = req.body || {}
      const payload = { referenceNumber: String(b.referenceNumber || ''), doNumber: b.doNumber ? String(b.doNumber) : null, type: String(b.type || ''), documents: Array.isArray(b.documents) ? b.documents : [] }
      await EvidenceSubmission.create({ user_id: req.user?.id || null, reference_number: String(b.referenceNumber || ''), do_number: b.doNumber ? String(b.doNumber) : null, type: String(b.type || ''), documents_count: Array.isArray(b.documents) ? b.documents.length : 0, total_bytes: Array.isArray(b.documents) ? b.documents.reduce((acc, d) => acc + (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0), 0) : 0, documents_meta: Array.isArray(b.documents) ? b.documents.map(d => ({ name: d.name, extension: d.extension, category: d.category || '', date: d.date })) : [], payload, status: 'error', error_message: err.message })
    } catch {}
    res.status(500).json({ ok: false, error: 'Error al recibir evidencias', detail: err.message })
  }
})

module.exports = router
