const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { JWT_SECRET } = require('../config');
const { User } = require('../db/sequelize');

const router = express.Router();

// Login real: valida contra la tabla users
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: 'Email y password requeridos' });

    const userModel = await User.findOne({ where: { email } });
    if (!userModel || userModel.is_active === false) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    const valid = await bcrypt.compare(password, userModel.password_hash);
    if (!valid) return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

    userModel.last_login = new Date();
    await userModel.save();

    const user = {
      id: userModel.id,
      email: userModel.email,
      role: userModel.role,
      display_name: userModel.display_name,
      nombre: userModel.nombre,
      puerto: userModel.puerto
    };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error en login', detail: err.message });
  }
});

module.exports = router;