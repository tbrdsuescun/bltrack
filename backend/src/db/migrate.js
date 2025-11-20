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
  const qi = sequelize.getQueryInterface();
  try {
    await qi.describeTable('master_children');
  } catch (e) {
    try {
      await qi.createTable('master_children', {
        master_id: { type: DataTypes.STRING(100), allowNull: false },
        child_id: { type: DataTypes.STRING(100), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: true },
        updated_at: { type: DataTypes.DATE, allowNull: true },
      });
      await qi.addIndex('master_children', ['master_id', 'child_id'], { unique: true, name: 'mc_master_child_unique' });
      logger.info({ msg: 'Migration applied: master_children created' });
    } catch (err) {
      logger.error({ msg: 'Migration failed: master_children', error: err.message });
      throw err;
    }
  }
}

module.exports = { runMigrations };