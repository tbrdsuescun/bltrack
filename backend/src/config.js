const path = require('path');

module.exports = {
  PORT: process.env.PORT || 4000,
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret',
  EXTERNAL_ENDPOINT: process.env.EXTERNAL_ENDPOINT || 'https://api.externo.mock/bls',
  STORAGE_PATH: process.env.STORAGE_PATH || path.join(process.cwd(), 'uploads'),
  EXTERNAL_TIMEOUT_MS: parseInt(process.env.EXTERNAL_TIMEOUT_MS || '100000', 10),
  EXTERNAL_RETRY_COUNT: parseInt(process.env.EXTERNAL_RETRY_COUNT || '3', 10),
  MASTERS_URL: process.env.MASTERS_URL || 'https://tracking.transborder.com.co/ApisNotes-Cotiz/RestApiNotesCotiz.nsf/api.xsp/operaciones/masters',
  MASTERS_USER: process.env.MASTERS_USER || 'cconsumer',
  MASTERS_PASS: process.env.MASTERS_PASS || 'cotizadorapiconsumer',
  EVIDENCE_URL: process.env.EVIDENCE_URL || 'https://tracking.transborder.com.co/TbrApis/WebHookRestApis.nsf/api.xsp/Receive/ReporteFotograficoImpo',
  EVIDENCE_USER: process.env.EVIDENCE_USER || 'WConsumer',
  EVIDENCE_PASS: process.env.EVIDENCE_PASS || 'TBR2025*+'
};
