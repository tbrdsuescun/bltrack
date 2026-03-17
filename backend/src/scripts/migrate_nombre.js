const { initDb, sequelize } = require('../db/sequelize');
const { runMigrations } = require('../db/migrate');
const { logger } = require('../utils/logger');

(async () => {
  try {
    await initDb();
    await runMigrations();
  } catch (err) {
    process.exitCode = 1;
  } finally {
    try { await sequelize.close(); } catch (e) {}
  }
})();
