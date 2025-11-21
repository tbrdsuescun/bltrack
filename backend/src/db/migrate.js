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
  try {
    const desc = await qi.describeTable('master_children');
    if (!desc.cliente_nombre) {
      await qi.addColumn('master_children', 'cliente_nombre', { type: DataTypes.STRING(255), allowNull: true });
      logger.info({ msg: 'Migration applied: master_children.cliente_nombre added' });
    }
    if (!desc.cliente_nit) {
      await qi.addColumn('master_children', 'cliente_nit', { type: DataTypes.STRING(100), allowNull: true });
      logger.info({ msg: 'Migration applied: master_children.cliente_nit added' });
    }
    if (!desc.numero_ie) {
      await qi.addColumn('master_children', 'numero_ie', { type: DataTypes.STRING(100), allowNull: true });
      logger.info({ msg: 'Migration applied: master_children.numero_ie added' });
    }
    if (desc.descripcion_mercancia) {
      await qi.removeColumn('master_children', 'descripcion_mercancia');
      logger.info({ msg: 'Migration applied: master_children.descripcion_mercancia removed' });
    }
    if (desc.numero_pedido) {
      await qi.removeColumn('master_children', 'numero_pedido');
      logger.info({ msg: 'Migration applied: master_children.numero_pedido removed' });
    }
    if (!desc.user_id) {
      await qi.addColumn('master_children', 'user_id', { type: DataTypes.INTEGER, allowNull: true });
      logger.info({ msg: 'Migration applied: master_children.user_id added' });
    }
    if (!desc.numero_DO_master) {
      await qi.addColumn('master_children', 'numero_DO_master', { type: DataTypes.STRING(100), allowNull: true });
      logger.info({ msg: 'Migration applied: master_children.numero_DO_master added' });
    }
    if (!desc.numero_DO_hijo) {
      await qi.addColumn('master_children', 'numero_DO_hijo', { type: DataTypes.STRING(100), allowNull: true });
      logger.info({ msg: 'Migration applied: master_children.numero_DO_hijo added' });
    }
    if (!desc.pais_de_origen) {
      await qi.addColumn('master_children', 'pais_de_origen', { type: DataTypes.STRING(100), allowNull: true });
      logger.info({ msg: 'Migration applied: master_children.pais_de_origen added' });
    }
    if (!desc.puerto_de_origen) {
      await qi.addColumn('master_children', 'puerto_de_origen', { type: DataTypes.STRING(100), allowNull: true });
      logger.info({ msg: 'Migration applied: master_children.puerto_de_origen added' });
    }
  } catch (err) {
    logger.error({ msg: 'Migration failed: ensure master_children details', error: err.message });
    throw err;
  }
}

module.exports = { runMigrations };