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

// Las salas de Socket.io llevan los mensajes de WhatsApp en vivo. Antes 'join_session'
// aceptaba cualquier id sin comprobar nada: bastaba con conocer (o adivinar) el id de otro
// negocio para recibir sus chats en tiempo real. Ahora se exige el mismo token del panel y
// solo se entra a salas que pertenecen a ese token.
const { verifyToken } = require('./auth/token');
const { canJoinRoom, requireAdmin } = require('./auth/access');

io.use((socket, next) => {
  const raw = socket.handshake.auth?.token || socket.handshake.query?.token || '';
  const session = verifyToken(String(raw).replace(/^Bearer\s+/i, '').trim());
  if (!session) return next(new Error('unauthorized'));
  socket.data.auth = session;
  next();
});

io.on('connection', (socket) => {
  console.log('[IO] Cliente conectado:', socket.id);

  socket.on('join_session', async (id) => {
    if (!id) return;
    if (!(await canJoinRoom(socket.data.auth, String(id)))) {
      console.warn(`[IO] Rechazado join_session a ${id} (token de ${socket.data.auth.uid})`);
      return;
    }
    socket.join(`session_${id}`);
    socket.join(`user_${id}`);
    console.log(`[IO] Socket unido a: session_${id} y user_${id}`);
  });

  socket.on('disconnect', () => {
    console.log('[IO] Cliente desconectado:', socket.id);
  });
});

// ── Rutas (importación diferida con manejo de errores) ───────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/sessions',      require('./routes/sessions'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/business',      require('./routes/business'));
app.use('/api/knowledge',     require('./routes/knowledge'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/appointments',  require('./routes/appointments'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/products',      require('./routes/products'));
app.use('/api/billing',       require('./routes/billing'));

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
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
    },
    // Capacidad de IA: llamadas en curso, en espera y proveedores en pausa por límite
    ai: require('./ai/llmPool').getPoolStatus(),
    queue: require('./queues/messageQueue').getQueueStatus(),
    timestamp: new Date().toISOString(),
  });
});

// Radiografía de las sesiones de WhatsApp: para saber POR QUÉ se cae un número en vez
// de adivinar. Solo admin: enseña teléfonos y estado de todas las cuentas.
app.get('/api/debug/sessions', requireAdmin, async (req, res) => {
  try {
    const { getSessionsDiagnostics } = require('./whatsapp/sessionManager');
    const enMemoria = getSessionsDiagnostics();

    // Filas de la base SIN traer session_data (pesa megas y se cobra como ancho de banda).
    let enBase = [];
    const duplicadas = [];
    try {
      const { supabase } = require('./db/supabase');
      const { data } = await supabase
        .from('whatsapp_sessions')
        .select('id, user_id, status, phone_number, connected_at, created_at')
        .order('created_at', { ascending: false });

      enBase = data || [];
      const porUsuario = new Map();
      for (const fila of enBase) {
        porUsuario.set(fila.user_id, (porUsuario.get(fila.user_id) || 0) + 1);
      }
      // Más de una fila por cuenta rompe la restauración de credenciales tras un reinicio.
      for (const [userId, cuantas] of porUsuario) {
        if (cuantas > 1) duplicadas.push({ userId, filas: cuantas });
      }
    } catch (e) {
      console.warn('[Debug Sessions] Error leyendo whatsapp_sessions:', e.message);
    }

    res.json({
      success: true,
      uptimeSegundos: Math.round(process.uptime()),
      memoriaMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      sesionesEnMemoria: enMemoria,
      sesionesEnBase: enBase.map(f => ({
        userId: f.user_id,
        estado: f.status,
        telefono: f.phone_number,
        conectadaDesde: f.connected_at,
      })),
      cuentasConFilasDuplicadas: duplicadas,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Solo admin: esta ruta hace UNA llamada a la IA por cada modelo disponible. Abierta,
// cualquiera que supiera la URL podía dispararla en bucle y quemar la cuota de Groq,
// dejando al bot sin poder responder a nadie. Además enseñaba la lista de modelos y el
// largo de la API key.
app.get('/api/debug/test-groq', requireAdmin, async (req, res) => {
  try {
    const Groq = require('groq-sdk');
    const apiKey = (process.env.GROQ_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
    if (!apiKey) {
      return res.json({ success: false, error: 'GROQ_API_KEY env var is missing or empty' });
    }
    const client = new Groq({ apiKey });
    
    // Obtener lista completa de modelos soportados por la API Key
    let availableModels = [];
    try {
      const modelsList = await client.models.list();
      availableModels = (modelsList.data || []).map(m => m.id);
    } catch (listErr) {
      console.warn('Error listando modelos:', listErr.message);
    }

    const testCandidates = availableModels.length > 0 
      ? availableModels 
      : ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'];

    const results = [];
    const errors = [];

    for (const m of testCandidates) {
      try {
        const resp = await client.chat.completions.create({
          model: m,
          messages: [{ role: 'user', content: 'Hola' }],
          max_tokens: 15
        });
        results.push({ model: m, content: resp.choices[0]?.message?.content });
      } catch (err) {
        errors.push({ model: m, error: err.message, status: err.status, code: err.code });
      }
    }
    res.json({ success: results.length > 0, apiKeyLength: apiKey.length, availableModels, results, errors });
  } catch (err) {
    // Sin stack en la respuesta: delata rutas del servidor y versiones de dependencias.
    console.error('[Debug test-groq]', err.stack || err.message);
    res.status(500).json({ success: false, error: err.message });
  }
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
//
// En Render se espera bastante más que en local A PROPÓSITO. Al desplegar, Render levanta
// la instancia nueva y solo cuando responde le manda SIGTERM a la vieja: durante esos
// segundos hay DOS procesos. Si el nuevo abre WhatsApp con las mismas credenciales
// mientras el viejo sigue conectado, WhatsApp lo ve como dos dispositivos iguales, expulsa
// uno (error 440 'conflict') y a la larga invalida la sesión → QR otra vez. Esperar deja
// que el proceso viejo se apague y suelte la conexión antes de reconectar.
const RESTORE_DELAY_MS = parseInt(
  process.env.STARTUP_RESTORE_DELAY_MS || (process.env.RENDER_EXTERNAL_URL ? '25000' : '3000'),
  10,
);
console.log(`[STARTUP] Las sesiones de WhatsApp se restauran en ${Math.round(RESTORE_DELAY_MS / 1000)}s`);

setTimeout(async () => {
  try {
    const { restoreSessions } = require('./whatsapp/sessionManager');
    await restoreSessions(io);
    console.log('[STARTUP] Sesiones restauradas');

    const { mergeLidConversations } = require('./scripts/mergeLidConversations');
    mergeLidConversations().catch(e => console.warn('[STARTUP] Error en mergeLidConversations:', e.message));
  } catch (e) {
    console.error('[STARTUP] Error restaurando sesiones (no crítico):', e.message);
  }
}, RESTORE_DELAY_MS);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 BotWA Backend LATEST corriendo en puerto ${PORT}`);

  // ── Inicializar cron jobs de retención y recordatorios ─────────────────────
  try {
    const { initCronJobs } = require('./services/cronService');
    initCronJobs();
  } catch (eCron) {
    console.error('[CRON INIT ERROR]', eCron.message);
  }

  // ── SELF-PING KEEPALIVE (4 MINUTOS) ───────────────────────────────────────
  // Render free tier duerme después de 15 min de inactividad.
  // Este self-ping cada 4 min mantiene el servidor despierto 24/7 sin caídas.
  const https = require('https');
  const http2 = require('http');
  // Solo Render duerme el servicio; en Railway, una VPS o un PC no hace falta.
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (!selfUrl) {
    console.log('[KEEPALIVE] No es Render: self-ping desactivado');
    return;
  }

  const pingUrl = `${selfUrl}/ping`;
  console.log(`[KEEPALIVE] Self-ping activado cada 4 min → ${pingUrl}`);

  setInterval(() => {
    const client = pingUrl.startsWith('https') ? https : http2;
    client.get(pingUrl, (res) => {
      if (res.statusCode === 200) console.log(`[KEEPALIVE] Ping OK (${res.statusCode})`);
    }).on('error', (e) => {
      console.warn('[KEEPALIVE] Ping aviso:', e.message);
    });
  }, 4 * 60 * 1000); // cada 4 minutos
});

// ── Cierre elegante (Graceful Shutdown) ───────────────────────────────────────
// Render envía SIGTERM antes de reiniciar o desplegar. Guardamos credenciales activas.
const handleGracefulShutdown = async (signal) => {
  console.log(`[SHUTDOWN] Señal ${signal} recibida. Guardando credenciales activas en Supabase...`);
  try {
    const { saveAllActiveSessions, sessions } = require('./whatsapp/sessionManager');
    if (typeof saveAllActiveSessions === 'function') {
      await saveAllActiveSessions();
    }

    // Cerrar los sockets de WhatsApp ANTES de salir: si no, la conexión queda colgando
    // unos segundos y choca con la instancia nueva que Render ya está levantando.
    if (sessions && typeof sessions.entries === 'function') {
      const cerrados = new Set();
      for (const [, s] of sessions.entries()) {
        if (s?.sock && !cerrados.has(s.sock)) {
          cerrados.add(s.sock);
          try { s.sock.end(new Error('Apagando el servidor')); } catch (_) {}
        }
      }
      if (cerrados.size > 0) console.log(`[SHUTDOWN] ${cerrados.size} conexiones de WhatsApp cerradas.`);
    }
  } catch (e) {
    console.error('[SHUTDOWN] Error guardando sesiones:', e.message);
  }
  process.exit(0);
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

// ── Manejo de errores no capturados ──────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message, err.stack);
  // No hacemos process.exit — dejamos que el servidor siga vivo
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason);
});
