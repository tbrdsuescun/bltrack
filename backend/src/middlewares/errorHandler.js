const { logger } = require('../utils/logger');

function errorHandler(err, req, res, next) {
  // logger.error({
  //   msg: 'Unhandled error',
  //   error: err.message,
  //   stack: err.stack,
  //   path: req.path,
  //   method: req.method,
  // });
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.message || 'Internal Server Error',
  });
}

module.exports = { errorHandler };