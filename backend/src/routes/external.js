const express = require('express')
const axios = require('axios')
const { authRequired } = require('../middlewares/auth')
const { MASTERS_URL, MASTERS_USER, MASTERS_PASS, EXTERNAL_TIMEOUT_MS } = require('../config')

const router = express.Router()

router.get('/external/masters', authRequired, async (req, res) => {
  try {
    const url = MASTERS_URL || 'http://tracking.transborder.com.co/Development/ApisNotes-Cotiz/DevRestApiNotesCotiz.nsf/api.xsp/operaciones/masters'
    const username = MASTERS_USER || ''
    const password = MASTERS_PASS || ''
    const response = await axios.get(url, { auth: { username, password }, timeout: EXTERNAL_TIMEOUT_MS })
    const data = Array.isArray(response.data?.data) ? response.data.data : []
    res.json({ data })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

module.exports = router