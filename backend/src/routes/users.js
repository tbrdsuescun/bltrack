const express = require('express');
const bcrypt = require('bcrypt');
const { authRequired } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/role');
const { User } = require('../db/sequelize');

const router = express.Router();

// Listar usuarios
router.get('/', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const items = await User.findAll({ order: [['id', 'ASC']] });
    const data = items.map(u => ({ id: u.id, nombre: u.nombre || u.display_name || null, email: u.email, role: u.role, is_active: u.is_active, last_login: u.last_login, puerto: u.puerto }));
    res.json({ items: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al listar usuarios', detail: err.message });
  }
});

// Obtener usuario
router.get('/:id', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    res.json({ id: user.id, nombre: user.nombre || user.display_name || null, email: user.email, role: user.role, is_active: user.is_active, last_login: user.last_login, puerto: user.puerto });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al obtener usuario', detail: err.message });
  }
});

// Crear usuario
router.post('/', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const { nombre, email, password, role = 'operario', is_active = true, puerto } = req.body || {};
    if (!nombre || !email || !password) return res.status(400).json({ ok: false, error: 'Nombre, email y password son requeridos' });

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ ok: false, error: 'Email ya existe' });

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ nombre, display_name: nombre, email, password_hash, role, is_active, puerto });
    res.status(201).json({ id: user.id, nombre: user.nombre, email: user.email, role: user.role, is_active: user.is_active, puerto: user.puerto });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al crear usuario', detail: err.message });
  }
});

// Actualizar usuario
router.patch('/:id', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, password, role, is_active, puerto } = req.body || {};
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (email && email !== user.email) {
      const collision = await User.findOne({ where: { email } });
      if (collision && collision.id !== user.id) return res.status(409).json({ ok: false, error: 'Email ya existe' });
      user.email = email;
    }
    if (typeof nombre !== 'undefined') {
      user.nombre = nombre;
      user.display_name = nombre;
    }
    if (typeof role !== 'undefined') user.role = role;
    if (typeof puerto !== 'undefined') user.puerto = puerto;
    if (typeof is_active !== 'undefined') user.is_active = !!is_active;
    if (password) user.password_hash = await bcrypt.hash(password, 10);
    await user.save();
    res.json({ id: user.id, nombre: user.nombre, email: user.email, role: user.role, is_active: user.is_active, puerto: user.puerto });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al actualizar usuario', detail: err.message });
  }
});

// Eliminar usuario (hard delete)
router.delete('/:id', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    await user.destroy();
    res.json({ ok: true, id: Number(id), deleted: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al eliminar usuario', detail: err.message });
  }
});

// Desactivar usuario (soft)
router.patch('/:id/deactivate', authRequired, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    user.is_active = false;
    await user.save();
    res.json({ id: Number(id), is_active: false });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Fallo al desactivar usuario', detail: err.message });
  }
});

module.exports = router;