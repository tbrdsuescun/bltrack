const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { authRequired } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/role');
const { STORAGE_PATH } = require('../config');

const router = express.Router();

router.get('/logs', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const dir = path.join(STORAGE_PATH, 'evidence-logs');
    let files = [];
    try { files = await fs.readdir(dir); } catch {}
    const last = files.slice().sort().reverse().slice(0, 50);
    const items = [];
    for (const f of last) {
      try {
        const raw = await fs.readFile(path.join(dir, f));
        const obj = JSON.parse(String(raw));
        items.push(obj);
      } catch {}
    }
    res.json({ items, count: items.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
