const express = require('express')
const axios = require('axios')
const { authRequired } = require('../middlewares/auth')
const { MASTERS_URL, MASTERS_USER, MASTERS_PASS, EXTERNAL_TIMEOUT_MS } = require('../config')

const router = express.Router()

router.get('/external/masters', authRequired, async (req, res) => {
  try {
    const puerto = String(req.query?.puerto || '').trim().toLowerCase()
    const base = MASTERS_URL
    const url = puerto ? `${base}?puerto=${encodeURIComponent(puerto)}` : base
    const username = process.env.MASTERS_USER || ''
    const password = process.env.MASTERS_PASS || ''
    const opts = { timeout: EXTERNAL_TIMEOUT_MS }
    if (username && password) opts.auth = { username, password }
    const response = await axios.get(url, opts)
    const data = Array.isArray(response.data?.data) ? response.data.data : []
    res.json({ data })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

module.exports = router