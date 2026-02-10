const path = require('path');
const fs = require('fs');
const envLocal = path.join(__dirname, '..', '.env');
const envCwd = path.join(process.cwd(), '.env');
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : envCwd });
const http = require('http');
const app = require('./app');
const { logger } = require('./utils/logger');
const { initDb, sequelize } = require('./db/sequelize');
const { runMigrations } = require('./db/migrate');

// Global error handlers to capture crashes
process.on('uncaughtException', (err) => {
  logger.error({ msg: 'CRITICAL: Uncaught Exception', error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ msg: 'CRITICAL: Unhandled Rejection', error: reason instanceof Error ? reason.message : String(reason) });
});

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

server.listen(PORT, () => {
  // logger.info({ msg: 'Server started', port: PORT });
  // Inicializar conexión a BD y sincronizar modelos sin bloquear el servidor
  initDb()
    .then(async () => {
      try {
        await runMigrations();
        // await sequelize.sync();
        // logger.info('DB synced');
      } catch (e) {
        // logger.error({ msg: 'DB sync/migration error', error: e.message });
      }
    })
    .catch((e) => logger.error({ //msg: 'DB init failed', error: e.message
    }));
});

// Graceful shutdown
process.on('SIGINT', () => {
  // logger.info('Shutting down...');
  server.close(() => process.exit(0));
});