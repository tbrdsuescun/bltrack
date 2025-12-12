const express = require('express')
const axios = require('axios')
const { authRequired } = require('../middlewares/auth')
const { MASTERS_URL, MASTERS_USER, MASTERS_PASS, EXTERNAL_TIMEOUT_MS } = require('../config')

const router = express.Router()

router.get('/external/masters', authRequired, async (req, res) => {
  try {
    const puerto = String(req.query?.puerto || '').trim()
    const base = MASTERS_URL
    const url = puerto ? `${base}?puerto=${encodeURIComponent(puerto)}` : base
    res.set('X-External-URL', url)
    const username = MASTERS_USER || ''
    const password = MASTERS_PASS || ''
    const opts = { timeout: EXTERNAL_TIMEOUT_MS }
    if (username && password) opts.auth = { username, password }
    const response = await axios.get(url, opts)
    const ct = String(response.headers?.['content-type'] || '')
    const payload = response.data
    let data = []
    if (Array.isArray(payload)) data = payload
    else if (Array.isArray(payload?.data)) data = payload.data
    else if (Array.isArray(payload?.items)) data = payload.items
    res.set('X-External-Status', String(response.status || ''))
    res.set('X-External-Count', String(data.length))
    res.set('X-External-Auth', username && password ? 'basic' : 'none')
    if (/text\/html/i.test(ct) && data.length === 0) {
      return res.status(502).json({ ok: false, error: 'External service returned HTML (likely auth required). Check MASTERS_USER/MASTERS_PASS.' })
    }
    res.json({ data })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

module.exports = router