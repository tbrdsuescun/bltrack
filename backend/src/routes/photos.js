const express = require('express');
const multer = require('multer');
const path = require('path');
const { authRequired } = require('../middlewares/auth');
const { ensureStorageDir, filePath, deleteFileSafe } = require('../services/storage');
const { RegistroFotografico, sequelize } = require('../db/sequelize');
const fs = require('fs');

ensureStorageDir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, require('../config').STORAGE_PATH),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const router = express.Router();

// Subir fotos: guarda en disco y persiste registro del BL + fotos por usuario
router.post('/bls/:id/photos', authRequired, upload.array('photos', 12), async (req, res) => {
  const { id } = req.params;
  const flagsRaw = req.body?.averia_flags;
  let flags = {};
  try { flags = typeof flagsRaw === 'string' ? JSON.parse(flagsRaw) : (flagsRaw || {}) } catch { flags = {} }
  const photos = (req.files || []).map((f) => ({
    id: path.basename(f.filename),
    filename: f.originalname,
    path: f.path,
    size: f.size,
    mime: f.mimetype,
    status: 'kept',
    averia: !!flags[f.originalname]
  }));
  try {
    const [rec, created] = await RegistroFotografico.findOrCreate({
      where: { bl_id: id, user_id: req.user.id },
      defaults: { bl_id: id, user_id: req.user.id, photos, send_status: 'pending' },
    });
    if (!created) {
      const prev = Array.isArray(rec.photos) ? rec.photos : [];
      rec.photos = prev.concat(photos);
      rec.send_status = 'pending';
      await rec.save();
    }
    try {
      const master_id = String(req.body.master_id || '').trim();
      const child_id = String(req.body.child_id || '').trim() || String(id || '').trim();
      const cliente_nombre = req.body.cliente_nombre ?? req.body.nombre_cliente ?? null;
      const cliente_nit = req.body.cliente_nit ?? req.body.nit ?? null;
      const numero_ie = req.body.numero_ie ?? req.body.ie ?? null;
      const numero_DO_master = (req.body.numero_DO_master ?? req.body.numero_master ?? master_id) || null;
      const numero_DO_hijo = (req.body.numero_DO_hijo ?? req.body.numero_do ?? child_id) || null;
      const pais_de_origen = req.body.pais_de_origen ?? req.body.pais_origen ?? null;
      const puerto_de_origen = req.body.puerto_de_origen ?? req.body.puerto_origen ?? null;
      if (master_id && child_id) {
        await sequelize.query(
          'INSERT INTO master_children (master_id, child_id, user_id, cliente_nombre, cliente_nit, numero_ie, numero_DO_master, numero_DO_hijo, pais_de_origen, puerto_de_origen, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), cliente_nombre = VALUES(cliente_nombre), cliente_nit = VALUES(cliente_nit), numero_ie = VALUES(numero_ie), numero_DO_master = VALUES(numero_DO_master), numero_DO_hijo = VALUES(numero_DO_hijo), pais_de_origen = VALUES(pais_de_origen), puerto_de_origen = VALUES(puerto_de_origen), updated_at = NOW()',
          { replacements: [master_id, child_id, req.user.id, cliente_nombre, cliente_nit, numero_ie, numero_DO_master, numero_DO_hijo, pais_de_origen, puerto_de_origen] }
        );
      }
    } catch (e) {
      // noop: si falla la inserción de detalles, no bloquea la carga de fotos
    }
    res.status(201).json({
      bl_id: id,
      user_id: req.user.id,
      count: photos.length,
      photos,
      details: {
        master_id: String(req.body.master_id || id),
        child_id: String(req.body.child_id || id),
        cliente_nombre: req.body.cliente_nombre ?? req.body.nombre_cliente ?? null,
        cliente_nit: req.body.cliente_nit ?? req.body.nit ?? null,
        numero_ie: req.body.numero_ie ?? req.body.ie ?? null,
        descripcion_mercancia: req.body.descripcion_mercancia ?? req.body.descripcion ?? null,
        numero_pedido: req.body.numero_pedido ?? req.body.pedido ?? req.body.order_number ?? null,
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al persistir fotos', detail: err.message });
  }
});

// Obtener fotos existentes para un BL del usuario autenticado
router.get('/bls/:id/photos', authRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const rec = await RegistroFotografico.findOne({ where: { bl_id: id, user_id: req.user.id } });
    const list = Array.isArray(rec?.photos) ? rec.photos : [];
    const photos = list
      .filter(p => p && p.id && fs.existsSync(filePath(p.id)))
      .map(p => ({
        id: p.id,
        filename: p.filename,
        url: '/uploads/' + p.id,
        size: p.size,
        mime: p.mime,
        status: p.status || 'kept',
        averia: !!p.averia,
      }));
    res.json({ bl_id: id, count: photos.length, photos });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al obtener fotos', detail: err.message });
  }
});

// Actualizar flags de avería para fotos existentes
router.patch('/bls/:id/photos/averia', authRequired, async (req, res) => {
  const { id } = req.params;
  const flags = req.body?.flags || {};
  try {
    const rec = await RegistroFotografico.findOne({ where: { bl_id: id, user_id: req.user.id } });
    if (!rec || !Array.isArray(rec.photos)) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    const photos = rec.photos.map(p => ({ ...p, averia: typeof flags[p.id] !== 'undefined' ? !!flags[p.id] : !!p.averia }));
    rec.photos = photos;
    await rec.save();
    const response = photos.map(p => ({ id: p.id, filename: p.filename, url: p.path ? ('/uploads/' + p.id) : null, size: p.size, mime: p.mime, status: p.status || 'kept', averia: !!p.averia }));
    res.json({ bl_id: id, count: response.length, photos: response });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al actualizar avería', detail: err.message });
  }
});

// Eliminar foto (disco) - no actualiza registro; podría hacerse si se requiere
router.delete('/photos/:photoId', authRequired, async (req, res) => {
  const { photoId } = req.params;
  const ok = deleteFileSafe(filePath(photoId));
  let removed = 0;
  try {
    const recs = await RegistroFotografico.findAll({ where: { user_id: req.user.id } });
    for (const rec of recs) {
      const list = Array.isArray(rec.photos) ? rec.photos : [];
      const next = list.filter(p => String(p.id) !== String(photoId));
      if (next.length !== list.length) {
        rec.photos = next;
        await rec.save();
        removed += 1;
      }
    }
  } catch {}
  res.json({ photoId, deleted: ok, dbUpdated: removed > 0, updatedRecords: removed });
});

module.exports = router;
