const express = require('express')
const { authRequired } = require('../middlewares/auth')
const { EvidenceSubmission } = require('../db/sequelize')

const router = express.Router()


router.post('/evidences/submit', authRequired, async (req, res) => {
  try {
    const { referenceNumber, doNumber, type, documents } = req.body || {}
    if (!referenceNumber || !type) return res.status(400).json({ ok: false, error: 'referenceNumber y type requeridos' })
    const list = Array.isArray(documents) ? documents : []
    const documentsCount = list.length
    const totalBytes = list.reduce((acc, d) => acc + (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0), 0)
    const docsMeta = list.map(d => ({ name: d.name, extension: d.extension, category: d.category || '', date: d.date, bytes: (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0) }))
    try {
      await EvidenceSubmission.create({
        user_id: req.user.id,
        reference_number: String(referenceNumber),
        do_number: doNumber ? String(doNumber) : null,
        type: String(type),
        documents_count: documentsCount,
        total_bytes: totalBytes,
        documents_meta: docsMeta,
        status: 'received',
        error_message: null,
      })
    } catch (e) {
      // noop: si falla el guardado, no bloquea la recepción
    }
    res.json({ ok: true, received: { referenceNumber, doNumber, type, documentsCount }, meta: { totalBytes } })
  } catch (err) {
    try {
      await EvidenceSubmission.create({
        user_id: req.user?.id || null,
        reference_number: String(req.body?.referenceNumber || ''),
        do_number: req.body?.doNumber ? String(req.body.doNumber) : null,
        type: String(req.body?.type || ''),
        documents_count: Array.isArray(req.body?.documents) ? req.body.documents.length : 0,
        total_bytes: Array.isArray(req.body?.documents) ? req.body.documents.reduce((acc, d) => acc + (typeof d.contentBase64 === 'string' ? Buffer.byteLength(d.contentBase64, 'base64') : 0), 0) : 0,
        documents_meta: Array.isArray(req.body?.documents) ? req.body.documents.map(d => ({ name: d.name, extension: d.extension, category: d.category || '', date: d.date })) : [],
        status: 'error',
        error_message: err.message,
      })
    } catch (_) {}
    res.status(500).json({ ok: false, error: 'Error al recibir evidencias', detail: err.message })
  }
})

module.exports = router
