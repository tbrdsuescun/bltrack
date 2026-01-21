const { sequelize } = require('../db/sequelize');

async function fixIndexes() {
  const qi = sequelize.getQueryInterface();
  try {
    console.log('Checking indexes...');
    const indexes = await qi.showIndex('master_children');
    console.log('Current indexes:', indexes.map(i => i.name));

    const badIndex = indexes.find(i => i.name === 'master_children_master_id_child_id');
    if (badIndex) {
      console.log('Removing problematic index: master_children_master_id_child_id');
      await qi.removeIndex('master_children', 'master_children_master_id_child_id');
      console.log('Removed.');
    } else {
      console.log('Index master_children_master_id_child_id not found (good).');
    }

    // Ensure the new one exists
    const goodIndex = indexes.find(i => i.name === 'mc_master_child_type_unique');
    if (!goodIndex) {
      console.log('Creating new index: mc_master_child_type_unique');
      await qi.addIndex('master_children', ['master_id', 'child_id', 'type'], { unique: true, name: 'mc_master_child_type_unique' });
      console.log('Created.');
    } else {
        console.log('Index mc_master_child_type_unique exists (good).');
    }

  } catch (err) {
    console.error('Error fixing indexes:', err);
  } finally {
    await sequelize.close();
  }
}

fixIndexes();
