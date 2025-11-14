require('dotenv').config();
const http = require('http');
const app = require('./app');
const { logger } = require('./utils/logger');
const { initDb, sequelize } = require('./db/sequelize');
const { runMigrations } = require('./db/migrate');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

server.listen(PORT, () => {
  logger.info({ msg: 'Server started', port: PORT });
  // Inicializar conexión a BD y sincronizar modelos sin bloquear el servidor
  initDb()
    .then(async () => {
      try {
        await runMigrations();
        await sequelize.sync();
        logger.info('DB synced');
      } catch (e) {
        logger.error({ msg: 'DB sync/migration error', error: e.message });
      }
    })
    .catch((e) => logger.error({ msg: 'DB init failed', error: e.message }));
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
});