const express = require('express');
const { authRequired } = require('../middlewares/auth');
const { getWithRetry } = require('../services/externalClient');
const { EXTERNAL_RETRY_COUNT, EXTERNAL_ENDPOINT } = require('../config');
const { RegistroFotografico } = require('../db/sequelize');
const { Op } = require('sequelize');

const router = express.Router();

// Lista BLs disponibles desde servicio externo (para selector)
router.get('/options', authRequired, async (req, res) => {
  try {
    const data = await getWithRetry(EXTERNAL_ENDPOINT, EXTERNAL_RETRY_COUNT);
    const items = Array.isArray(data) ? data : (data.items || []);
    res.json({ items });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Fallo al obtener opciones de BL', detail: err.message });
  }
});

// Lista de BLs trabajados por el usuario (desde registro_fotografico)
router.get('/mine', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await RegistroFotografico.findAll({ where: { user_id: userId }, order: [['updated_at', 'DESC']] });
    const items = rows.map(r => ({
      bl_id: r.bl_id,
      photos_count: Array.isArray(r.photos) ? r.photos.length : 0,
      send_status: r.send_status,
      sent_at: r.sent_at,
    }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al listar tus BLs', detail: err.message });
  }
});

// Historial detallado de BLs con filtros (por usuario)
router.get('/history', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const { bl_id, status, from, to } = req.query || {};
    const where = { user_id: userId };
    if (bl_id) where.bl_id = { [Op.like]: `%${bl_id}%` };
    if (status) where.send_status = status;
    // Rango de fechas sobre updated_at (última modificación)
    if (from || to) {
      const range = {};
      if (from) range[Op.gte] = new Date(from + 'T00:00:00Z');
      if (to) range[Op.lte] = new Date(to + 'T23:59:59Z');
      where.updated_at = range;
    }
    const rows = await RegistroFotografico.findAll({ where, order: [['updated_at', 'DESC']] });
    const items = rows.map(r => ({
      bl_id: r.bl_id,
      photos_count: Array.isArray(r.photos) ? r.photos.length : 0,
      send_status: r.send_status,
      retries: r.retries,
      error_detail: r.error_detail,
      created_at: r.created_at,
      updated_at: r.updated_at,
      sent_at: r.sent_at,
    }));
    res.json({ items, count: items.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al obtener historial', detail: err.message });
  }
});

// Lista BLs (demo: mock por compatibilidad)
router.get('/', authRequired, async (req, res) => {
  try {
    const data = [
      { id: 'BL-1001', ref: 'REF-1001', status: 'open' },
      { id: 'BL-1002', ref: 'REF-1002', status: 'open' },
    ];
    res.json({ items: data, source: 'mock' });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Fallo al obtener BLs' });
  }
});

// Detalle BL (demo)
router.get('/:id', authRequired, async (req, res) => {
  const { id } = req.params;
  const item = { id, ref: `REF-${id}`, details: { origin: 'COL', destination: 'USA' } };
  res.json(item);
});

module.exports = router;