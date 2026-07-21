const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

// Supabase es opcional — si falla no bloquea Baileys
let supabase = null;
try {
  supabase = require('../db/supabase').supabase;
} catch (_) {}

let handleIncomingMessage = null;
try {
  handleIncomingMessage = require('./messageHandler').handleIncomingMessage;
} catch (_) {}

// Mapa de sesiones activas: userId → { sock, businessId }
const sessions = new Map();

const SESSIONS_DIR = path.join(__dirname, '../../sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const logger = pino({ level: 'silent' });

// Helper seguro para upsert a Supabase sin lanzar excepción
const safeUpsert = async (table, data, conflict = 'user_id') => {
  if (!supabase) return;
  try {
    await supabase.from(table).upsert(data, { onConflict: conflict });
  } catch (e) {
    console.warn(`[DB] upsert ${table} aviso:`, e.message);
  }
};

const createSession = async (userId, businessId, io) => {
  // Si ya existe una sesión activa la retornamos
  if (sessions.has(userId)) {
    console.log(`[Baileys] Sesión ya activa para ${userId}`);
    return sessions.get(userId).sock;
  }

  const sessionDir = path.join(SESSIONS_DIR, userId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  // Guardar estado inicial en DB inmediatamente al solicitar conexión
  await safeUpsert('whatsapp_sessions', {
    user_id: userId,
    status: 'connecting',
  });

  let state, saveCreds;
  try {
    const auth = await useMultiFileAuthState(sessionDir);
    state = auth.state;
    saveCreds = auth.saveCreds;
  } catch (e) {
    console.error('[Baileys] Error cargando auth state:', e.message);
    throw e;
  }

  // Usar versión hardcodeada para no depender de fetch externo
  const WA_VERSION = [2, 3000, 1015901307];

  const sock = makeWASocket({
    version: WA_VERSION,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: true, // también imprimir en consola para debug
    browser: ['BotWA SaaS', 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    retryRequestDelayMs: 2000,
  });

  // Guardar credenciales al cambiar
  sock.ev.on('creds.update', saveCreds);

  // ─── Eventos de conexión ─────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ── QR generado ──────────────────────────────────────────────────────
    if (qr) {
      console.log(`[QR] Generado para ${userId}`);
      try {
        const QRCode = require('qrcode');
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });

        // Emitir al frontend por Socket.io
        if (io) {
          io.to(`user_${userId}`).emit('qr', { qr: qrDataUrl });
          io.to(`session_${userId}`).emit('qr', { qr: qrDataUrl });
        }

        // Guardar en DB (no bloquear si falla)
        await safeUpsert('whatsapp_sessions', {
          user_id: userId,
          qr_code: qrDataUrl,
          status: 'qr_ready',
        });
      } catch (errQr) {
        console.error('[QR] Error generando DataURL:', errQr.message);
      }
    }

    // ── Conexión establecida ──────────────────────────────────────────────
    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || '';
      console.log(`[Baileys] ✅ Conectado: ${phone} (usuario: ${userId})`);

      sessions.set(userId, { sock, businessId });

      await safeUpsert('whatsapp_sessions', {
        user_id: userId,
        phone_number: phone,
        status: 'connected',
        qr_code: null,
        connected_at: new Date().toISOString(),
      });

      if (io) {
        const payload = { phone };
        io.to(`user_${userId}`).emit('connected', payload);
        io.to(`user_${userId}`).emit('session_ready', payload);
        io.to(`session_${userId}`).emit('connected', payload);
        io.to(`session_${userId}`).emit('session_ready', payload);
      }
    }

    // ── Conexión cerrada ──────────────────────────────────────────────────
    if (connection === 'close') {
      const code = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : 0;

      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[Baileys] Conexión cerrada para ${userId}. Código: ${code}. Reconectar: ${shouldReconnect}`);

      sessions.delete(userId);

      await safeUpsert('whatsapp_sessions', {
        user_id: userId,
        status: shouldReconnect ? 'reconnecting' : 'disconnected',
      });

      if (io) {
        const payload = { shouldReconnect };
        io.to(`user_${userId}`).emit('disconnected', payload);
        io.to(`session_${userId}`).emit('disconnected', payload);
      }

      if (shouldReconnect) {
        console.log(`[Baileys] Reconectando ${userId} en 5s...`);
        setTimeout(() => createSession(userId, businessId, io).catch(console.error), 5000);
      }
    }
  });

  // ─── Mensajes entrantes ──────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const sessionData = sessions.get(userId);
      if (!sessionData) continue;

      if (handleIncomingMessage) {
        try {
          await handleIncomingMessage(sock, msg, userId, businessId);
        } catch (err) {
          console.error(`[MSG] Error procesando mensaje de ${userId}:`, err.message);
        }
      }
    }
  });

  sessions.set(userId, { sock, businessId });
  return sock;
};

const disconnectSession = async (userId) => {
  const session = sessions.get(userId);
  if (!session) return;
  try {
    await session.sock.logout();
  } catch (e) {
    console.error('[Baileys] Error haciendo logout:', e.message);
  }
  sessions.delete(userId);
  await safeUpsert('whatsapp_sessions', {
    user_id: userId,
    status: 'disconnected',
    phone_number: null,
  });
};

const getSession = (userId) => sessions.get(userId);

const restoreSessions = async (io) => {
  if (!supabase) return;
  try {
    const { data: activeSessions } = await supabase
      .from('whatsapp_sessions')
      .select('user_id, business_id')
      .eq('status', 'connected');

    if (!activeSessions?.length) return;
    console.log(`[Restore] Restaurando ${activeSessions.length} sesión(es)...`);

    for (const session of activeSessions) {
      try {
        const sessionDir = path.join(SESSIONS_DIR, session.user_id);
        if (fs.existsSync(sessionDir)) {
          await createSession(session.user_id, session.business_id, io);
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        console.error(`[Restore] Error para ${session.user_id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[Restore] Error restaurando sesiones:', e.message);
  }
};

const sendMessage = async (userId, to, text) => {
  const session = sessions.get(userId);
  if (!session) throw new Error('Sesión no conectada');
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  await session.sock.sendMessage(jid, { text });
};

module.exports = { createSession, disconnectSession, getSession, restoreSessions, sendMessage };
