require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const app = express();
const server = http.createServer(app);

// ── CORS dinámico ANTES de todo ─────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Socket.io ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
global.io = io;

io.on('connection', (socket) => {
  console.log('[IO] Cliente conectado:', socket.id);

  socket.on('join_session', (id) => {
    socket.join(`session_${id}`);
    socket.join(`user_${id}`);
    console.log(`[IO] Socket unido a: session_${id} y user_${id}`);
  });

  socket.on('disconnect', () => {
    console.log('[IO] Cliente desconectado:', socket.id);
  });
});

// ── Rutas (importación diferida con manejo de errores) ───────────────────────
const loadRoute = (path, name) => {
  try {
    return require(path);
  } catch (e) {
    console.error(`[ROUTE] Error cargando ${name}:`, e.message);
    const r = express.Router();
    r.all('*', (req, res) => res.status(503).json({ error: `${name} no disponible: ${e.message}` }));
    return r;
  }
};

app.use('/api/auth',          loadRoute('./routes/auth',          'auth'));
app.use('/api/sessions',      loadRoute('./routes/sessions',      'sessions'));
app.use('/api/conversations', loadRoute('./routes/conversations', 'conversations'));
app.use('/api/business',      loadRoute('./routes/business',      'business'));
app.use('/api/knowledge',     loadRoute('./routes/knowledge',     'knowledge'));
app.use('/api/admin',         loadRoute('./routes/admin',         'admin'));
app.use('/api/appointments',  loadRoute('./routes/appointments',  'appointments'));

// ── Health / Debug ───────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.send('pong 🤖'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Endpoint de diagnóstico — muestra versión del código y env vars presentes
app.get('/api/debug/version', (req, res) => {
  res.json({
    commit: process.env.RENDER_GIT_COMMIT || 'local',
    node: process.version,
    uptime: process.uptime(),
    env: {
      GROQ_API_KEY: !!process.env.GROQ_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Cron ─────────────────────────────────────────────────────────────────────
try {
  const { checkRenewals } = require('./jobs/renewalChecker');
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Verificando renovaciones...');
    try { await checkRenewals(); } catch (e) { console.error('[CRON]', e.message); }
  });
} catch (e) {
  console.error('[CRON] Error cargando renewalChecker:', e.message);
}

// ── Restaurar sesiones activas (sin bloquear el arranque) ───────────────────
setTimeout(async () => {
  try {
    const { restoreSessions } = require('./whatsapp/sessionManager');
    await restoreSessions(io);
    console.log('[STARTUP] Sesiones restauradas');
  } catch (e) {
    console.error('[STARTUP] Error restaurando sesiones (no crítico):', e.message);
  }
}, 3000); // Esperar 3s para que el servidor esté completamente listo

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 BotWA Backend LATEST corriendo en puerto ${PORT}`);

  // ── SELF-PING KEEPALIVE ────────────────────────────────────────────────────
  // Render free tier duerme después de 15 min de inactividad.
  // Este self-ping cada 10 min mantiene el servidor despierto 24/7 sin costo.
  const https = require('https');
  const http2 = require('http');
  const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.RAILWAY_STATIC_URL || null;

  if (selfUrl) {
    const pingUrl = `${selfUrl}/ping`;
    console.log(`[KEEPALIVE] Self-ping activado → ${pingUrl}`);

    setInterval(() => {
      const client = pingUrl.startsWith('https') ? https : http2;
      client.get(pingUrl, (res) => {
        console.log(`[KEEPALIVE] Ping OK (${res.statusCode})`);
      }).on('error', (e) => {
        console.warn('[KEEPALIVE] Ping falló:', e.message);
      });
    }, 10 * 60 * 1000); // cada 10 minutos
  } else {
    // Fallback: ping a sí mismo por localhost
    setInterval(() => {
      http2.get(`http://localhost:${PORT}/ping`, (res) => {
        if (res.statusCode === 200) console.log('[KEEPALIVE] localhost ping OK');
      }).on('error', () => {});
    }, 10 * 60 * 1000);
  }
});

// ── Manejo de errores no capturados ──────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message, err.stack);
  // No hacemos process.exit — dejamos que el servidor siga vivo
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason);
});
