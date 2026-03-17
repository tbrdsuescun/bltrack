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

process.on('uncaughtException', (err) => {
  logger.error({ msg: 'CRITICAL: Uncaught Exception', error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ msg: 'CRITICAL: Unhandled Rejection', error: reason instanceof Error ? reason.message : String(reason) });
});

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

server.listen(PORT, () => {
  initDb()
    .then(async () => {
      try {
        await runMigrations();
      } catch (e) {
      }
    })
    .catch((e) => logger.error({ error: e.message }));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
