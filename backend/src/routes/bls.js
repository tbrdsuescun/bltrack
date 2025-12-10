const express = require('express');
const { authRequired } = require('../middlewares/auth');
const { getWithRetry } = require('../services/externalClient');
const { EXTERNAL_RETRY_COUNT, EXTERNAL_ENDPOINT } = require('../config');
const { RegistroFotografico } = require('../db/sequelize');
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../db/sequelize');

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
    const isAdmin = req.user.role === 'admin';
    const where = isAdmin ? {} : { user_id: userId };
    const rows = await RegistroFotografico.findAll({ where, order: [['updated_at', 'DESC']] });
    const blIds = [...new Set(rows.map(r => r.bl_id))];
    let detailsMap = {};
    if (blIds.length) {
      try {
        const placeholders = blIds.map(() => '?').join(',');
        const query = `SELECT * FROM master_children WHERE child_id IN (${placeholders})`;
        const detailRows = await sequelize.query(query, { replacements: blIds, type: QueryTypes.SELECT });
        detailRows.forEach(dr => { detailsMap[String(dr.child_id)] = dr; });
      } catch (e) {
        detailsMap = {};
      }
    }
    const agg = {};
    rows.forEach(r => {
      const k = String(r.bl_id);
      const prev = agg[k] || { bl_id: k, photos_count: 0, send_status: r.send_status, sent_at: r.sent_at };
      prev.photos_count += Array.isArray(r.photos) ? r.photos.length : 0;
      prev.send_status = prev.send_status || r.send_status;
      prev.sent_at = prev.sent_at || r.sent_at;
      agg[k] = prev;
    });
    const items = Object.values(agg).map(r => {
      const d = detailsMap[String(r.bl_id)] || {};
      const nombreCliente = d.cliente_nombre || d.nombre_cliente || d.client_name || d.nombre || '';
      const nitCliente = d.cliente_nit || d.nit || d.client_nit || '';
      const clienteNit = [nombreCliente, nitCliente].filter(Boolean).join(' - ');
      const ieNumero = d.numero_ie || d.ie || d.ie_number || '';
      const descripcion = d.descripcion_mercancia || d.descripcion || d.descripcionMercancia || '';
      const pedidoNumero = d.numero_pedido || d.pedido || d.order_number || d.orden || '';
      return {
        bl_id: r.bl_id,
        photos_count: r.photos_count,
        send_status: r.send_status,
        sent_at: r.sent_at,
        cliente_nit: clienteNit || null,
        ie_number: ieNumero || null,
        descripcion: descripcion || null,
        pedido_number: pedidoNumero || null,
      };
    });
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

// Obtiene los HBLs de un master
router.get('/master/:master/children', authRequired, async (req, res) => {
  try {
    const { master } = req.params;
    const query = 'SELECT * FROM master_children WHERE master_id = ? AND child_id <> master_id';
    const items = await sequelize.query(query, { replacements: [master], type: QueryTypes.SELECT });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al obtener HBLs del master', detail: err.message });
  }
});

module.exports = router;