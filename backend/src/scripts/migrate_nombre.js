const { initDb, sequelize } = require('../db/sequelize');
const { runMigrations } = require('../db/migrate');
const { logger } = require('../utils/logger');

(async () => {
  try {
    await initDb();
    await runMigrations();
    logger.info('Migration completed successfully');
  } catch (err) {
    logger.error({ msg: 'Migration error', error: err.message });
    process.exitCode = 1;
  } finally {
    try { await sequelize.close(); } catch (e) {}
  }
})();