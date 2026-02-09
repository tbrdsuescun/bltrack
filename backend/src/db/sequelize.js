const { Sequelize, DataTypes } = require('sequelize');
const { logger } = require('../utils/logger');

const DB_URL = process.env.DB_URL || 'mysql://root:Transborder2025*@localhost:3306/app_db';

const sequelize = new Sequelize(DB_URL, {
  logging: false,
  define: { underscored: true },
  pool: {
    max: 10,       // Máximo de conexiones simultáneas
    min: 0,
    acquire: 30000, // Tiempo máximo para intentar conectar antes de fallar (30s)
    idle: 10000     // Tiempo que una conexión puede estar libre antes de cerrarse (10s)
  },
  dialectOptions: {
    // Forzar timeout en consultas SQL para evitar bloqueos eternos (ej. 20 segundos)
    connectTimeout: 20000 
  }
});

const User = sequelize.define('User', {
  nombre: { type: DataTypes.STRING(100), allowNull: true },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'operario'), allowNull: false, defaultValue: 'operario' },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  display_name: { type: DataTypes.STRING(100), allowNull: true },
  last_login: { type: DataTypes.DATE, allowNull: true },
  puerto: { type: DataTypes.STRING(50), allowNull: true },
}, {
  tableName: 'users',
});

const RegistroFotografico = sequelize.define('RegistroFotografico', {
  bl_id: { type: DataTypes.STRING(100), allowNull: false },
  type: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'hijo' },
  photos: { type: DataTypes.JSON, allowNull: false },
  storage_location: { type: DataTypes.ENUM('disk', 'bucket'), allowNull: false, defaultValue: 'disk' },
  send_status: { type: DataTypes.ENUM('pending', 'sent', 'failed'), allowNull: false, defaultValue: 'pending' },
  external_response_code: { type: DataTypes.INTEGER, allowNull: true },
  external_response_message: { type: DataTypes.STRING(512), allowNull: true },
  external_response_body: { type: DataTypes.JSON, allowNull: true },
  request_payload: { type: DataTypes.JSON, allowNull: true },
  error_detail: { type: DataTypes.STRING(512), allowNull: true },
  retries: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sent_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'registro_fotografico',
});

User.hasMany(RegistroFotografico, { foreignKey: 'user_id' });
RegistroFotografico.belongsTo(User, { foreignKey: 'user_id' });

const MasterChild = sequelize.define('MasterChild', {
  master_id: { type: DataTypes.STRING(100), allowNull: false, primaryKey: true },
  child_id: { type: DataTypes.STRING(100), allowNull: false, primaryKey: true },
  type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'hijo', primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  cliente_nombre: { type: DataTypes.STRING(255), allowNull: true },
  cliente_nit: { type: DataTypes.STRING(100), allowNull: true },
  numero_ie: { type: DataTypes.STRING(100), allowNull: true },
  numero_DO_master: { type: DataTypes.STRING(100), allowNull: true },
  numero_DO_hijo: { type: DataTypes.STRING(100), allowNull: true },
  pais_de_origen: { type: DataTypes.STRING(100), allowNull: true },
  puerto_de_origen: { type: DataTypes.STRING(100), allowNull: true },
}, {
  tableName: 'master_children',
  indexes: [
    { unique: true, fields: ['master_id', 'child_id', 'type'] }
  ]
});

const EvidenceSubmission = sequelize.define('EvidenceSubmission', {
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  reference_number: { type: DataTypes.STRING(120), allowNull: false },
  do_number: { type: DataTypes.STRING(120), allowNull: true },
  type: { type: DataTypes.ENUM('master', 'hijo'), allowNull: false },
  documents_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  total_bytes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  documents_meta: { type: DataTypes.JSON, allowNull: true },
  payload: { type: DataTypes.JSON, allowNull: true },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'received' },
  error_message: { type: DataTypes.STRING(512), allowNull: true },
}, {
  tableName: 'evidence_submissions',
});

async function initDb() {
  try {
    await sequelize.authenticate();
    // logger.info('DB connection established');
  } catch (err) {
    // logger.error({ msg: 'DB connect error', error: err.message });
    throw err;
  }
}

module.exports = { sequelize, initDb, User, RegistroFotografico, MasterChild, EvidenceSubmission };
