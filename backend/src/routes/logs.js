const express = require('express');
const { authRequired } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/role');

const router = express.Router();

// Ver logs (demo: retorna registros sintéticos)
router.get('/logs', authRequired, requireRole('admin'), (req, res) => {
  const items = [
    { id: 1, bl_id: 'BL-1001', user_id: 1, send_status: 'sent', created_at: new Date().toISOString() },
    { id: 2, bl_id: 'BL-1002', user_id: 2, send_status: 'failed', error_detail: 'timeout', created_at: new Date().toISOString() },
  ];
  res.json({ items, count: items.length });
});

module.exports = router;