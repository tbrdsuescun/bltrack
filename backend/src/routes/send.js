const express = require('express');
const { authRequired } = require('../middlewares/auth');
const { postWithRetry } = require('../services/externalClient');
const { EXTERNAL_RETRY_COUNT, EXTERNAL_ENDPOINT } = require('../config');
const { RegistroFotografico } = require('../db/sequelize');

const router = express.Router();

// Enviar BL + fotos: toma registro del usuario para el BL y lo envía al externo
router.post('/bls/:id/send', authRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const rec = await RegistroFotografico.findOne({ where: { bl_id: id, user_id: req.user.id } });
    if (!rec || !Array.isArray(rec.photos) || rec.photos.length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay fotos para enviar' });
    }
    const payload = { bl_id: id, user_id: req.user.id, photos: rec.photos };
    let responseBody;
    try {
      responseBody = await postWithRetry(EXTERNAL_ENDPOINT + '/send', payload, EXTERNAL_RETRY_COUNT);
      rec.send_status = 'sent';
      rec.external_response_code = 200;
      rec.external_response_message = 'OK';
      rec.external_response_body = responseBody;
      rec.request_payload = payload;
      rec.error_detail = null;
      rec.sent_at = new Date();
      await rec.save();
    } catch (err) {
      rec.send_status = 'failed';
      rec.external_response_code = err.response?.status || null;
      rec.external_response_message = err.message;
      rec.external_response_body = err.response?.data || null;
      rec.request_payload = payload;
      rec.error_detail = err.message;
      await rec.save();
      return res.status(502).json({ ok: false, error: 'Fallo al enviar a externo', detail: err.message });
    }
    return res.json({ ok: true, bl_id: id, status: rec.send_status, external: responseBody });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al preparar envío', detail: err.message });
  }
});

module.exports = router;