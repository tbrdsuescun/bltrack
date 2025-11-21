const path = require('path');

module.exports = {
  PORT: process.env.PORT || 4000,
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret',
  EXTERNAL_ENDPOINT: process.env.EXTERNAL_ENDPOINT || 'https://api.externo.mock/bls',
  STORAGE_PATH: process.env.STORAGE_PATH || path.join(process.cwd(), 'uploads'),
  EXTERNAL_TIMEOUT_MS: parseInt(process.env.EXTERNAL_TIMEOUT_MS || '10000', 10),
  EXTERNAL_RETRY_COUNT: parseInt(process.env.EXTERNAL_RETRY_COUNT || '2', 10),
  MASTERS_URL: process.env.MASTERS_URL || 'https://tracking.transborder.com.co/Development/ApisNotes-Cotiz/DevRestApiNotesCotiz.nsf/api.xsp/operaciones/masters',
  MASTERS_USER: process.env.MASTERS_USER || '',
  MASTERS_PASS: process.env.MASTERS_PASS || ''
};