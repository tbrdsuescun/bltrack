const { sequelize } = require('./sequelize');
const { DataTypes } = require('sequelize');
const { logger } = require('../utils/logger');

async function ensureUsersNombre() {
  const qi = sequelize.getQueryInterface();
  try {
    const desc = await qi.describeTable('users');
    if (!desc.nombre) {
      await qi.addColumn('users', 'nombre', { type: DataTypes.STRING(100), allowNull: true });
      logger.info({ msg: 'Migration applied: users.nombre added' });
    } else {
      logger.debug({ msg: 'Migration skipped: users.nombre already exists' });
    }
  } catch (err) {
    logger.error({ msg: 'Migration failed: ensureUsersNombre', error: err.message });
    throw err;
  }
}

async function runMigrations() {
  await ensureUsersNombre();
}

module.exports = { runMigrations };