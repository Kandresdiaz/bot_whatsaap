require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const sessionsRoutes = require('./routes/sessions');
const conversationsRoutes = require('./routes/conversations');
const businessRoutes = require('./routes/business');
const knowledgeRoutes = require('./routes/knowledge');
const adminRoutes = require('./routes/admin');

const { SessionManager } = require('./whatsapp/sessionManager');
const { checkRenewals } = require('./jobs/renewalChecker');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Guardar io globalmente para usarlo en otros módulos
global.io = io;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
// Keepalive para Render free tier (UptimeRobot pinga este endpoint cada 14 min)
app.get('/ping', (req, res) => res.send('pong 🤖'));

// Socket.io conexión
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.on('join_session', (sessionId) => {
    socket.join(`session_${sessionId}`);
    console.log(`Socket unido a sesión: ${sessionId}`);
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Cron: verificar renovaciones cada día a las 9am
cron.schedule('0 9 * * *', async () => {
  console.log('Verificando renovaciones...');
  await checkRenewals();
});

// Restaurar sesiones activas al iniciar
SessionManager.restoreAllSessions().then(() => {
  console.log('Sesiones restauradas');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
});
