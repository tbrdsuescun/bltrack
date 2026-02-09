const { sequelize, initDb } = require('../db/sequelize');
const { QueryTypes } = require('sequelize');

(async () => {
  try {
    console.log('--- Conectando para limpieza ---');
    await initDb();

    console.log('Buscando procesos zombis (> 200 segundos)...');
    const processList = await sequelize.query('SHOW FULL PROCESSLIST', { type: QueryTypes.SELECT });
    
    // Filtramos procesos que llevan mucho tiempo y no son del sistema
    const zombies = processList.filter(p => 
      p.Command !== 'Sleep' && 
      p.User !== 'event_scheduler' && 
      p.Time > 200
    );

    if (zombies.length === 0) {
      console.log('No se encontraron procesos zombis.');
    } else {
      console.log(`Se encontraron ${zombies.length} procesos colgados. Eliminando...`);
      
      for (const z of zombies) {
        console.log(`Matando proceso ID ${z.Id} (Time: ${z.Time}s) - ${z.Info ? z.Info.substring(0,30) : '...'}`);
        try {
          await sequelize.query(`KILL ${z.Id}`);
          console.log(`-> ID ${z.Id} eliminado.`);
        } catch (e) {
          console.error(`-> Error matando ID ${z.Id}:`, e.message);
        }
      }
      console.log('Limpieza completada.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
})();