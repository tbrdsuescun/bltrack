const express = require('express')
const axios = require('axios')
const { authRequired } = require('../middlewares/auth')
const { MASTERS_URL, MASTERS_USER, MASTERS_PASS, EXTERNAL_TIMEOUT_MS, EXTERNAL_RETRY_COUNT } = require('../config')

const router = express.Router();
const cache = new Map()

router.get('/external/masters', authRequired, async (req, res) => {
  try {
    const puertoRaw = String(req.query?.puerto || '').trim()
    const puerto = puertoRaw ? puertoRaw.toUpperCase() : ''
    const base = MASTERS_URL
    const url = puerto ? `${base}?puerto=${encodeURIComponent(puerto)}` : base
    res.set('X-External-URL', url)
    const cacheKey = puerto || '__ALL__'
    const ttlMs = 15 * 60 * 1000
    const hit = cache.get(cacheKey)
    if (hit && Array.isArray(hit.data) && (Date.now() - (hit.ts || 0)) < ttlMs) {
      return res.json({ data: hit.data })
    }
    const username = MASTERS_USER || ''
    const password = MASTERS_PASS || ''
    const baseTimeout = Number(EXTERNAL_TIMEOUT_MS) || 30000
    const tries = (parseInt(EXTERNAL_RETRY_COUNT || '0', 10) || 0) + 1
    let response = null
    let lastErr = null
    
    for (let i = 0; i < tries; i++) {
      const currentTimeout = baseTimeout * (i + 1)
      const opts = { timeout: currentTimeout, headers: { Accept: 'application/json' } }
      if (username && password) opts.auth = { username, password }
      
      try { 
        console.log(`Attempt ${i+1}/${tries} with timeout ${currentTimeout}ms`)
        response = await axios.get(url, opts)
        break 
      } catch (e) { 
        lastErr = e 
        console.warn(`Attempt ${i+1} failed: ${e.message}`)
      }
    }
    if (!response) {
      const status = lastErr?.response?.status
      const body = lastErr?.response?.data
      const msg = status ? `External ${status}` : (lastErr?.message || 'Unknown error')
      return res.status(502).json({ ok: false, error: msg, details: body })
    }
    const ct = String(response.headers?.['content-type'] || '')
    const payload = response.data
    let data = []
    if (Array.isArray(payload)) data = payload
    else if (Array.isArray(payload?.data)) data = payload.data
    else if (Array.isArray(payload?.items)) data = payload.items
    if (/text\/html/i.test(ct) && data.length === 0) {
      return res.status(502).json({ ok: false, error: 'External service returned HTML (likely auth required). Check MASTERS_USER/MASTERS_PASS.' })
    }
    try { cache.set(cacheKey, { ts: Date.now(), data }) } catch {}
    res.json({ data })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
}) 

module.exports = router