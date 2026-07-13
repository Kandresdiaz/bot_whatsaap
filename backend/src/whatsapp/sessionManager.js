const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../db/supabase');
const { handleIncomingMessage } = require('./messageHandler');

// Mapa de sesiones activas: userId → socket de Baileys
const sessions = new Map();

const SESSIONS_DIR = path.join(__dirname, '../../sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const logger = pino({ level: 'silent' }); // silenciar logs internos de Baileys

const createSession = async (userId, businessId, io) => {
  if (sessions.has(userId)) {
    console.log(`Sesión ya existe para ${userId}`);
    return;
  }

  const sessionDir = path.join(SESSIONS_DIR, userId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ['BotWA', 'Chrome', '120.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  // ─── Guardar credenciales cuando cambian ────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ─── QR Code ────────────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`QR generado para usuario ${userId}`);
      // Emitir QR al frontend vía Socket.io
      if (io) io.to(`user_${userId}`).emit('qr', { qr });

      // Guardar QR en BD para que el frontend lo muestre
      await supabase
        .from('whatsapp_sessions')
        .upsert({ user_id: userId, qr_code: qr, status: 'qr_ready' }, { onConflict: 'user_id' });
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || '';
      console.log(`✅ WhatsApp conectado: ${phone} (usuario: ${userId})`);

      sessions.set(userId, { sock, businessId });

      await supabase
        .from('whatsapp_sessions')
        .upsert({
          user_id: userId,
          phone_number: phone,
          status: 'connected',
          qr_code: null,
          connected_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (io) io.to(`user_${userId}`).emit('connected', { phone });
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : 0;

      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`Conexión cerrada para ${userId}. Código: ${code}. Reconectar: ${shouldReconnect}`);

      sessions.delete(userId);

      await supabase
        .from('whatsapp_sessions')
        .upsert({ user_id: userId, status: shouldReconnect ? 'reconnecting' : 'disconnected' }, { onConflict: 'user_id' });

      if (io) io.to(`user_${userId}`).emit('disconnected', { shouldReconnect });

      // Auto-reconectar si no fue logout intencional
      if (shouldReconnect) {
        console.log(`Reconectando ${userId} en 5 segundos...`);
        setTimeout(() => createSession(userId, businessId, io), 5000);
      }
    }
  });

  // ─── Mensajes entrantes ──────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue; // ignorar mensajes propios
      if (!msg.message) continue;

      const sessionData = sessions.get(userId);
      if (!sessionData) continue;

      try {
        await handleIncomingMessage(sock, msg, userId, businessId);
      } catch (err) {
        console.error(`Error procesando mensaje de ${userId}:`, err.message);
      }
    }
  });

  sessions.set(userId, { sock, businessId });
  return sock;
};

const disconnectSession = async (userId) => {
  const session = sessions.get(userId);
  if (!session) return;
  await session.sock.logout();
  sessions.delete(userId);
  await supabase
    .from('whatsapp_sessions')
    .upsert({ user_id: userId, status: 'disconnected', phone_number: null }, { onConflict: 'user_id' });
};

const getSession = (userId) => sessions.get(userId);

const restoreSessions = async (io) => {
  const { data: activeSessions } = await supabase
    .from('whatsapp_sessions')
    .select('user_id, business_id')
    .eq('status', 'connected');

  if (!activeSessions?.length) return;
  console.log(`Restaurando ${activeSessions.length} sesión(es) activa(s)...`);

  for (const session of activeSessions) {
    const sessionDir = path.join(SESSIONS_DIR, session.user_id);
    if (fs.existsSync(sessionDir)) {
      await createSession(session.user_id, session.business_id, io);
      await new Promise(r => setTimeout(r, 2000)); // esperar entre sesiones
    }
  }
};

// Función para enviar mensaje desde el dashboard (intervención manual)
const sendMessage = async (userId, to, text) => {
  const session = sessions.get(userId);
  if (!session) throw new Error('Sesión no conectada');
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  await session.sock.sendMessage(jid, { text });
};

module.exports = { createSession, disconnectSession, getSession, restoreSessions, sendMessage };
