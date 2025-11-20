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

async function ensureUsersPuerto() {
  const qi = sequelize.getQueryInterface();
  try {
    const desc = await qi.describeTable('users');
    if (!desc.puerto) {
      await qi.addColumn('users', 'puerto', { type: DataTypes.STRING(50), allowNull: true });
      logger.info({ msg: 'Migration applied: users.puerto added' });
    } else {
      logger.debug({ msg: 'Migration skipped: users.puerto already exists' });
    }
  } catch (err) {
    logger.error({ msg: 'Migration failed: ensureUsersPuerto', error: err.message });
    throw err;
  }
}

async function runMigrations() {
  await ensureUsersNombre();
  await ensureUsersPuerto();
}

module.exports = { runMigrations };