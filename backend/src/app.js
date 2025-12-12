const express = require('express');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
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
app.set('etag', false);

// Compresión Gzip/Brotli antes de static para reducir transfer
app.use(compression());

app.use(cors({
  origin: ['http://localhost:4002','http://Bltrack.transborder.com.co:4000'],
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ extended: true, limit: '1000mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Serve frontend static
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(FRONTEND_DIR));

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
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.use(errorHandler);

module.exports = app;
