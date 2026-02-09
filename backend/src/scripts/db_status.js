const { sequelize, initDb } = require('../db/sequelize');
const { QueryTypes } = require('sequelize');

(async () => {
  try {
    console.log('--- Conectando a la Base de Datos ---');
    await initDb();

    console.log('\n--- 1. PROCESOS ACTIVOS (SHOW PROCESSLIST) ---');
    console.log('Muestra todas las conexiones abiertas y qué consulta están ejecutando actualmente.');
    const processList = await sequelize.query('SHOW FULL PROCESSLIST', { type: QueryTypes.SELECT });
    
    // Filtramos para no mostrar este mismo script y mostrar solo los que están haciendo algo o durmiendo mucho
    const relevantProcesses = processList.filter(p => p.Command !== 'Sleep' || p.Time > 10);
    console.table(relevantProcesses.map(p => ({
      ID: p.Id,
      User: p.User,
      Time: p.Time + 's',
      State: p.State,
      Info: p.Info ? p.Info.substring(0, 50) + '...' : 'NULL'
    })));

    console.log('\n--- 2. TRANSACCIONES ACTIVAS (INNODB_TRX) ---');
    console.log('Muestra transacciones que han estado abiertas por mucho tiempo y podrían estar bloqueando.');
    const transactions = await sequelize.query(`
      SELECT 
        trx_id,
        trx_state,
        trx_started,
        TIMESTAMPDIFF(SECOND, trx_started, NOW()) as duration_sec,
        trx_query
      FROM information_schema.INNODB_TRX
    `, { type: QueryTypes.SELECT });

    if (transactions.length === 0) {
      console.log('>> No hay transacciones activas en este momento.');
    } else {
      console.table(transactions);
    }

    console.log('\n--- 3. BLOQUEOS (INNODB_LOCKS - Aprox) ---');
    // Nota: En versiones recientes de MySQL, information_schema.INNODB_LOCKS está deprecado, 
    // pero INNODB_TRX suele ser suficiente para ver quién tiene el bloqueo.
    const locks = await sequelize.query(`
      SELECT 
        r.trx_id waiting_trx_id,
        r.trx_mysql_thread_id waiting_thread,
        r.trx_query waiting_query,
        b.trx_id blocking_trx_id,
        b.trx_mysql_thread_id blocking_thread,
        b.trx_query blocking_query
      FROM information_schema.innodb_lock_waits w
      INNER JOIN information_schema.innodb_trx b
        ON b.trx_id = w.blocking_trx_id
      INNER JOIN information_schema.innodb_trx r
        ON r.trx_id = w.requesting_trx_id;
    `, { type: QueryTypes.SELECT });

    if (locks.length === 0) {
        console.log('>> No hay bloqueos (deadlocks) detectados en este instante exacto.');
    } else {
        console.log('!! SE DETECTARON BLOQUEOS !!');
        console.table(locks);
    }

  } catch (err) {
    console.error('Error ejecutando diagnóstico:', err);
  } finally {
    await sequelize.close();
  }
})();