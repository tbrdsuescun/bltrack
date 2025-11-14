function requireRole(role) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ ok: false, error: 'No autenticado' });
    if (user.role !== role) return res.status(403).json({ ok: false, error: 'Sin permisos' });
    next();
  };
}

module.exports = { requireRole };