const { sequelize, initDb } = require('../db/sequelize')
const { DataTypes } = require('sequelize')

async function ensurePayloadColumn() {
  await initDb()
  const qi = sequelize.getQueryInterface()
  let hasTable = true
  let desc = null
  try {
    desc = await qi.describeTable('evidence_submissions')
  } catch (e) {
    hasTable = false
  }
  if (!hasTable) {
    await qi.createTable('evidence_submissions', {
      id: { type: DataTypes.INTEGER, allowNull: false, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      reference_number: { type: DataTypes.STRING(120), allowNull: false },
      do_number: { type: DataTypes.STRING(120), allowNull: true },
      type: { type: DataTypes.STRING(20), allowNull: false },
      documents_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      total_bytes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      documents_meta: { type: DataTypes.JSON, allowNull: true },
      payload: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'received' },
      error_message: { type: DataTypes.STRING(512), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    })
    await qi.addIndex('evidence_submissions', ['user_id', 'reference_number'], { name: 'es_user_ref_idx' })
    desc = await qi.describeTable('evidence_submissions')
  }
  if (!desc.payload) {
    await qi.addColumn('evidence_submissions', 'payload', { type: DataTypes.JSON, allowNull: true })
  }
  const final = await qi.describeTable('evidence_submissions')
  const cols = Object.keys(final)
  console.log('evidence_submissions columns:', cols)
  console.log('payload exists:', !!final.payload)
}

ensurePayloadColumn().then(() => {
  console.log('Migration completed successfully')
  process.exit(0)
}).catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})

