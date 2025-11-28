const express = require('express');
const path = require('path');
const compression = require('compression');
const { errorHandler } = require('./middlewares/errorHandler');

const authRouter = require('./routes/auth');
const blsRouter = require('./routes/bls');
const photosRouter = require('./routes/photos');
const sendRouter = require('./routes/send');
const logsRouter = require('./routes/logs');
const usersRouter = require('./routes/users');
const mastersRouter = require('./routes/masters');
const externalRouter = require('./routes/external');
const evidencesRouter = require('./routes/evidences');

const app = express();

// Compresión Gzip/Brotli antes de static para reducir transfer
app.use(compression());

app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ extended: true, limit: '1000mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Serve frontend static
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// Healthcheck
app.get('/health', (req, res) => res.json({ ok: true }));

// Routes
app.use('/auth', authRouter);
app.use('/bls', blsRouter);
app.use(photosRouter);
app.use(sendRouter);
app.use(logsRouter);
app.use('/users', usersRouter);
app.use(mastersRouter);
app.use(externalRouter);
app.use(evidencesRouter);

// Error handler last
app.use(errorHandler);

module.exports = app;
