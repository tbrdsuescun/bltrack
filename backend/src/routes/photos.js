const express = require('express');
const multer = require('multer');
const path = require('path');
const { authRequired } = require('../middlewares/auth');
const { ensureStorageDir, filePath, deleteFileSafe } = require('../services/storage');
const { RegistroFotografico } = require('../db/sequelize');

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
  const photos = (req.files || []).map((f) => ({
    id: path.basename(f.filename),
    filename: f.originalname,
    path: f.path,
    size: f.size,
    mime: f.mimetype,
    status: 'kept',
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
    res.status(201).json({ bl_id: id, user_id: req.user.id, count: photos.length, photos });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al persistir fotos', detail: err.message });
  }
});

// Obtener fotos existentes para un BL del usuario autenticado
router.get('/bls/:id/photos', authRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const rec = await RegistroFotografico.findOne({ where: { bl_id: id, user_id: req.user.id } });
    const photos = Array.isArray(rec?.photos) ? rec.photos.map(p => ({
      id: p.id,
      filename: p.filename,
      url: p.path ? ('/uploads/' + p.id) : null,
      size: p.size,
      mime: p.mime,
      status: p.status || 'kept',
    })) : [];
    res.json({ bl_id: id, count: photos.length, photos });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al obtener fotos', detail: err.message });
  }
});

// Eliminar foto (disco) - no actualiza registro; podría hacerse si se requiere
router.delete('/photos/:photoId', authRequired, (req, res) => {
  const { photoId } = req.params;
  const ok = deleteFileSafe(filePath(photoId));
  res.json({ photoId, deleted: ok });
});

module.exports = router;