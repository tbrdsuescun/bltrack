const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const { logger } = require('../utils/logger');

function authRequired(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    logger.warn(`[AUTH_FAIL] No token provided for ${req.method} ${req.url}`);
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, role }
    // logger.debug(`[AUTH_SUCCESS] User ${payload.id} authenticated`);
    next();
  } catch (err) {
    logger.warn(`[AUTH_FAIL] Invalid token for ${req.method} ${req.url}: ${err.message}`);
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

module.exports = { authRequired };