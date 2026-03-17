const { sequelize } = require('../db/sequelize');
const { DataTypes } = require('sequelize');

async function run() {
  const qi = sequelize.getQueryInterface();
  const table = 'registro_fotografico';
  try {
    console.log(`\n--- Diagnosticando tabla: ${table} ---\n`);
    
    const desc = await qi.describeTable(table);
    if (!desc.type) {
        console.log('ALERTA: Columna "type" no existe. Creándola...');
        await qi.addColumn(table, 'type', { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'hijo' });
        console.log('Columna "type" creada.');
        
        await sequelize.query("UPDATE registro_fotografico SET type = 'hijo' WHERE type IS NULL");
    } else {
        console.log('OK: Columna "type" existe.');
    }

    const indexes = await qi.showIndex(table);
    console.log('Índices actuales:', indexes.map(i => i.name));

    const blocking = indexes.filter(i => 
        i.unique && 
        i.fields.length === 2 && 
        i.fields.some(f => f.attribute === 'bl_id') && 
        i.fields.some(f => f.attribute === 'user_id')
    );

    if (blocking.length > 0) {
        for (const idx of blocking) {
            console.log(`ELIMINANDO índice bloqueante encontrado: ${idx.name}`);
            await qi.removeIndex(table, idx.name);
            console.log('Índice eliminado.');
        }
    } else {
        console.log('OK: No se encontraron índices únicos bloqueantes (bl_id + user_id).');
    }
    
    console.log('\nDiagnóstico y corrección finalizados.');

  } catch (err) {
    console.error('Error fatal:', err);
  } finally {
    await sequelize.close();
  }
}

run();
