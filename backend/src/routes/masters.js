const express = require('express');
const { authRequired } = require('../middlewares/auth');
const { sequelize, MasterChild } = require('../db/sequelize');
const { RegistroFotografico } = require('../db/sequelize');

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
    const mastersRows = await MasterChild.findAll({ where: { child_id: childIds } });
    const masterIds = [...new Set(mastersRows.map(r => r.master_id))];
    if (masterIds.length === 0) return res.json({ items: [] });
    const counts = await MasterChild.findAll({
      where: { master_id: masterIds },
      attributes: ['master_id', [sequelize.fn('COUNT', sequelize.col('child_id')), 'children_count']],
      group: ['master_id'],
      order: [['master_id', 'ASC']]
    });
    const items = counts.map(r => ({ master: r.master_id, children_count: Number(r.get('children_count')) }));
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
      const [rec, wasCreated] = await MasterChild.findOrCreate({ where: { master_id, child_id }, defaults: {
        master_id,
        child_id,
        cliente_nombre: it.cliente_nombre || it.nombre_cliente || null,
        cliente_nit: it.cliente_nit || it.nit || null,
        numero_ie: it.numero_ie || it.ie || null,
        descripcion_mercancia: it.descripcion_mercancia || it.descripcion || null,
        numero_pedido: it.numero_pedido || it.pedido || it.order_number || null,
      } });
      const updates = {};
      if (it.cliente_nombre || it.nombre_cliente) updates.cliente_nombre = it.cliente_nombre || it.nombre_cliente;
      if (it.cliente_nit || it.nit) updates.cliente_nit = it.cliente_nit || it.nit;
      if (it.numero_ie || it.ie) updates.numero_ie = it.numero_ie || it.ie;
      if (it.descripcion_mercancia || it.descripcion) updates.descripcion_mercancia = it.descripcion_mercancia || it.descripcion;
      if (it.numero_pedido || it.pedido || it.order_number) updates.numero_pedido = it.numero_pedido || it.pedido || it.order_number;
      if (Object.keys(updates).length) {
        await rec.update(updates);
      }
      created++;
    }
    res.status(201).json({ ok: true, created });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al sincronizar masters', detail: err.message });
  }
});

module.exports = router;