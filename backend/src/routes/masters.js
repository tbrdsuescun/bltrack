const express = require('express');
const { authRequired } = require('../middlewares/auth');
const { sequelize, MasterChild } = require('../db/sequelize');
const { RegistroFotografico } = require('../db/sequelize');
const { QueryTypes } = require('sequelize');

const router = express.Router();

router.get('/masters', authRequired, async (req, res) => {
  try {
    const mastersRows = await sequelize.query(
      'SELECT DISTINCT master_id FROM master_children',
      { type: QueryTypes.SELECT }
    );
    const masterIds = mastersRows.map(r => r.master_id);
    if (masterIds.length === 0) return res.json({ items: [] });
    const counts = await sequelize.query(
      'SELECT master_id, COUNT(child_id) AS children_count FROM master_children WHERE master_id IN (:masterIds) AND child_id <> master_id GROUP BY master_id ORDER BY master_id ASC',
      { replacements: { masterIds }, type: QueryTypes.SELECT }
    );
    const photosCounts = await sequelize.query(
      'SELECT bl_id AS master_id, COALESCE(SUM(JSON_LENGTH(photos)), 0) AS photos_count_master FROM registro_fotografico WHERE bl_id IN (:masterIds) GROUP BY bl_id',
      { replacements: { masterIds }, type: QueryTypes.SELECT }
    );
    const countMap = {};
    counts.forEach(r => { countMap[String(r.master_id)] = Number(r.children_count) });
    const photosMap = {};
    photosCounts.forEach(r => { photosMap[String(r.master_id)] = Number(r.photos_count_master) });
    const items = masterIds.map(id => ({ master: id, children_count: countMap[id] || 0, photos_count_master: photosMap[id] || 0 }));
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
    console.log("childIds: ", childIds)
    if (childIds.length === 0) return res.json({ items: [] });
    const mastersRows = await sequelize.query(
      'SELECT DISTINCT master_id FROM master_children WHERE child_id IN (:childIds)',
      { replacements: { childIds }, type: QueryTypes.SELECT }
    );
    const masterIds = mastersRows.map(r => r.master_id);
    if (masterIds.length === 0) return res.json({ items: [] });
    const counts = await sequelize.query(
      'SELECT master_id, COUNT(child_id) AS children_count FROM master_children WHERE master_id IN (:masterIds) AND child_id <> master_id GROUP BY master_id ORDER BY master_id ASC',
      { replacements: { masterIds }, type: QueryTypes.SELECT }
    );
    const photosCounts = await sequelize.query(
      'SELECT bl_id AS master_id, COALESCE(SUM(JSON_LENGTH(photos)), 0) AS photos_count_master FROM registro_fotografico WHERE bl_id IN (:masterIds) AND user_id = :userId GROUP BY bl_id',
      { replacements: { masterIds, userId }, type: QueryTypes.SELECT }
    );
    const master = await sequelize.query(
      'SELECT master_id, MAX(numero_DO_master) AS numero_DO_master FROM master_children WHERE master_id IN (:masterIds) GROUP BY master_id',
      { replacements: { masterIds }, type: QueryTypes.SELECT }
    );
    const countMap = {};
    counts.forEach(r => { countMap[String(r.master_id)] = Number(r.children_count) });
    const photosMap = {};
    photosCounts.forEach(r => { photosMap[String(r.master_id)] = Number(r.photos_count_master) });
    const masterMap = {};
    console.log("master: ", master)
    master.forEach(r => { masterMap[String(r.master_id)] = r.numero_DO_master ?? null });
    const items = masterIds.map(id => ({ master: id, children_count: countMap[id] || 0, photos_count_master: photosMap[id] || 0, numero_DO_master: masterMap[id] ?? null }));
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
      const numero_DO_master = it.numero_DO_master || it.numero_master || master_id || null;
      const numero_DO_hijo = it.numero_DO_hijo || it.numero_do || child_id || null;
      const pais_de_origen = it.pais_de_origen || it.pais_origen || null;
      const puerto_de_origen = it.puerto_de_origen || it.puerto_origen || null;
      await sequelize.query(
        'INSERT INTO master_children (master_id, child_id, user_id, cliente_nombre, cliente_nit, numero_ie, numero_DO_master, numero_DO_hijo, pais_de_origen, puerto_de_origen, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), cliente_nombre = VALUES(cliente_nombre), cliente_nit = VALUES(cliente_nit), numero_ie = VALUES(numero_ie), numero_DO_master = VALUES(numero_DO_master), numero_DO_hijo = VALUES(numero_DO_hijo), pais_de_origen = VALUES(pais_de_origen), puerto_de_origen = VALUES(puerto_de_origen), updated_at = NOW()',
        { replacements: [master_id, child_id, req.user.id, cliente_nombre, cliente_nit, numero_ie, numero_DO_master, numero_DO_hijo, pais_de_origen, puerto_de_origen] }
      );
      created++;
    }
    res.status(201).json({ ok: true, created });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al sincronizar masters', detail: err.message });
  }
});

module.exports = router;