const express = require('express');
const { authRequired } = require('../middlewares/auth');
const { sequelize, MasterChild } = require('../db/sequelize');
const { RegistroFotografico } = require('../db/sequelize');
const { QueryTypes } = require('sequelize');

const router = express.Router();

router.get('/masters', authRequired, async (req, res) => {
  try {
    const rows = await MasterChild.findAll({
      attributes: ['master_id', [sequelize.fn('COUNT', sequelize.col('child_id')), 'children_count']],
      group: ['master_id'],
      order: [['master_id', 'ASC']]
    });
    const items = rows.map(r => ({ master: r.master_id, children_count: Number(r.get('children_count')) }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al obtener masters', detail: err.message });
  }
});

router.get('/masters/with-photos', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const recs = await RegistroFotografico.findAll({ where: { user_id: userId } });
    const childIds = recs.map(r => r.bl_id);
    if (childIds.length === 0) return res.json({ items: [] });
    const mastersRows = await sequelize.query(
      'SELECT DISTINCT master_id FROM master_children WHERE child_id IN (:childIds)',
      { replacements: { childIds }, type: QueryTypes.SELECT }
    );
    const masterIds = mastersRows.map(r => r.master_id);
    if (masterIds.length === 0) return res.json({ items: [] });
    const counts = await sequelize.query(
      'SELECT master_id, COUNT(child_id) AS children_count FROM master_children WHERE master_id IN (:masterIds) GROUP BY master_id ORDER BY master_id ASC',
      { replacements: { masterIds }, type: QueryTypes.SELECT }
    );
    const items = counts.map(r => ({ master: r.master_id, children_count: Number(r.children_count) }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al obtener masters con fotos', detail: err.message });
  }
});

router.get('/masters/:id/children', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await MasterChild.findAll({ where: { master_id: id }, order: [['child_id', 'ASC']] });
    const items = rows.map(r => ({ child: r.child_id }));
    res.json({ master: id, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al obtener hijos', detail: err.message });
  }
});

router.post('/masters/sync', authRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    let created = 0;
    for (const it of items) {
      const master_id = String(it.master_id || it.master || '').trim();
      const child_id = String(it.child_id || it.child || '').trim();
      if (!master_id || !child_id) continue;
      const cliente_nombre = it.cliente_nombre || it.nombre_cliente || null;
      const cliente_nit = it.cliente_nit || it.nit || null;
      const numero_ie = it.numero_ie || it.ie || null;
      const descripcion_mercancia = it.descripcion_mercancia || it.descripcion || null;
      const numero_pedido = it.numero_pedido || it.pedido || it.order_number || null;
      await sequelize.query(
        'INSERT INTO master_children (master_id, child_id, cliente_nombre, cliente_nit, numero_ie, descripcion_mercancia, numero_pedido, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE cliente_nombre = VALUES(cliente_nombre), cliente_nit = VALUES(cliente_nit), numero_ie = VALUES(numero_ie), descripcion_mercancia = VALUES(descripcion_mercancia), numero_pedido = VALUES(numero_pedido), updated_at = NOW()',
        { replacements: [master_id, child_id, cliente_nombre, cliente_nit, numero_ie, descripcion_mercancia, numero_pedido] }
      );
      created++;
    }
    res.status(201).json({ ok: true, created });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al sincronizar masters', detail: err.message });
  }
});

module.exports = router;