const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
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

// Mapa de sesiones activas: userId → { sock, businessId, status, qr, phone }
const sessions = new Map();

const SESSIONS_DIR = path.join(__dirname, '../../sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const logger = pino({ level: 'silent' });

// Helper para eliminar la carpeta física de credenciales de un usuario
const deleteSessionFolder = (userId) => {
  const sessionDir = path.join(SESSIONS_DIR, userId);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`[Baileys] 🧹 Carpeta de credenciales eliminada para ${userId}`);
    } catch (e) {
      console.warn(`[Baileys] Error eliminando carpeta de ${userId}:`, e.message);
    }
  }
};

// Helper seguro para upsert a Supabase sin lanzar excepción
const safeUpsert = async (table, data, conflict = 'user_id') => {
  if (!supabase) return;
  try {
    await supabase.from(table).upsert(data, { onConflict: conflict });
  } catch (e) {
    console.warn(`[DB] upsert ${table} aviso:`, e.message);
  }
};

// Helper para extraer texto de mensajes de Baileys
const extractText = (msg) => {
  if (!msg || !msg.message) return '';
  const m = msg.message;
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.buttonsResponseMessage?.selectedDisplayText
    || m.listResponseMessage?.title
    || (m.imageMessage ? '[Imagen]' : '')
    || (m.videoMessage ? '[Video]' : '')
    || (m.audioMessage ? '[Audio]' : '')
    || (m.documentMessage ? '[Documento]' : '')
    || (m.stickerMessage ? '[Sticker]' : '')
    || '';
};

// Sincronizador de chats, contactos e historial a Supabase
const syncChatsAndMessagesToDb = async (userId, chats = [], contacts = [], messages = [], io = null) => {
  if (!supabase) return;

  const contactsMap = new Map();
  if (Array.isArray(contacts)) {
    for (const c of contacts) {
      if (c && c.id) {
        const name = c.name || c.notify || c.verifiedName;
        if (name) contactsMap.set(c.id, name);
      }
    }
  }

  // 1. Procesar chats de WhatsApp
  if (Array.isArray(chats) && chats.length > 0) {
    for (const chat of chats) {
      if (!chat || !chat.id) continue;
      const jid = chat.id;
      const contactPhone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
      if (!contactPhone) continue;

      const isGroup = jid.endsWith('@g.us');
      const contactName = chat.name || contactsMap.get(jid) || (isGroup ? 'Grupo WA' : contactPhone);

      const ts = chat.conversationTimestamp
        ? new Date(Number(chat.conversationTimestamp) * 1000).toISOString()
        : new Date().toISOString();

      try {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id, contact_name')
          .eq('user_id', userId)
          .eq('contact_phone', contactPhone)
          .maybeSingle();

        if (existing) {
          const updateData = {
            last_message_at: ts,
            session_id: userId,
          };
          if (contactName && contactName !== contactPhone) {
            updateData.contact_name = contactName;
          }
          await supabase.from('conversations').update(updateData).eq('id', existing.id);
        } else {
          await supabase.from('conversations').insert({
            user_id: userId,
            session_id: userId,
            contact_phone: contactPhone,
            contact_name: contactName || contactPhone,
            bot_active: true,
            is_blacklisted: false,
            unread_count: chat.unreadCount || 0,
            last_message_at: ts,
          });
        }
      } catch (err) {
        console.warn(`[Sync] Error guardando chat ${contactPhone}:`, err.message);
      }
    }
  }

  // 2. Procesar mensajes recibidos en el historial
  if (Array.isArray(messages) && messages.length > 0) {
    for (const msg of messages) {
      if (!msg || !msg.key || !msg.message) continue;
      const jid = msg.key.remoteJid;
      if (!jid) continue;
      const contactPhone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
      if (!contactPhone) continue;

      const text = extractText(msg);
      if (!text) continue;

      const pushName = msg.pushName || contactsMap.get(jid) || contactPhone;
      const msgTime = msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();

      try {
        let conversationId = null;
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('user_id', userId)
          .eq('contact_phone', contactPhone)
          .maybeSingle();

        if (conv) {
          conversationId = conv.id;
        } else {
          const { data: newConv } = await supabase
            .from('conversations')
            .insert({
              user_id: userId,
              session_id: userId,
              contact_phone: contactPhone,
              contact_name: pushName,
              bot_active: true,
              is_blacklisted: false,
              last_message_at: msgTime,
            })
            .select()
            .maybeSingle();
          conversationId = newConv?.id;
        }

        if (conversationId) {
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            content: text,
            direction: msg.key.fromMe ? 'outbound' : 'inbound',
            sent_by: msg.key.fromMe ? 'human' : 'customer',
            timestamp: msgTime,
          });
        }
      } catch (e) {
        console.warn(`[Sync] Error guardando mensaje de ${contactPhone}:`, e.message);
      }
    }
  }

  if (io) {
    io.to(`user_${userId}`).emit('chats_synced', { timestamp: new Date().toISOString() });
    io.to(`session_${userId}`).emit('chats_synced', { timestamp: new Date().toISOString() });
  }
};

const createSession = async (userId, businessId, io, forceClean = false) => {
  const existingSession = sessions.get(userId);

  // Si ya está conectada y no pedimos limpieza forzada, retornamos el socket
  if (existingSession?.sock && existingSession?.status === 'connected' && !forceClean) {
    console.log(`[Baileys] Sesión ya conectada para ${userId}`);
    return existingSession.sock;
  }

  // Si pedimos limpieza forzada o la sesión anterior falló, cerramos socket previo y borramos credenciales viejas
  if (forceClean || (existingSession && existingSession.status !== 'connecting')) {
    if (existingSession?.sock) {
      try { existingSession.sock.end(new Error('Reiniciando sesión')); } catch (_) {}
    }
    deleteSessionFolder(userId);
    sessions.delete(userId);
  }

  const sessionDir = path.join(SESSIONS_DIR, userId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  // Guardar estado inicial en memoria inmediatamente
  sessions.set(userId, { status: 'connecting', businessId, sock: null, qr: null });

  // Guardar estado inicial en DB inmediatamente al solicitar conexión
  await safeUpsert('whatsapp_sessions', {
    user_id: userId,
    status: 'connecting',
    qr_code: null,
  });

  let state, saveCreds;
  try {
    const authResult = await useMultiFileAuthState(sessionDir);
    state = authResult.state;
    saveCreds = authResult.saveCreds;
  } catch (authErr) {
    console.error(`[Baileys] Error cargando credenciales de ${userId}:`, authErr);
    deleteSessionFolder(userId);
    sessions.delete(userId);
    return;
  }

  // Obtener versión latest de WhatsApp Web o usar fallback reciente
  let WA_VERSION = [2, 3000, 1043857760];
  try {
    const latest = await fetchLatestBaileysVersion();
    if (latest && latest.version) {
      WA_VERSION = latest.version;
    }
  } catch (errVer) {
    console.warn('[Baileys] Aviso al obtener versión Baileys (usando fallback):', errVer.message);
  }

  const sock = makeWASocket({
    version: WA_VERSION,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ['BotWA SaaS', 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: true,
    downloadHistory: true,
    markOnlineOnConnect: false,
    shouldSyncHistoryMessage: () => true,
    connectTimeoutMs: 30000,
    keepAliveIntervalMs: 15000,
    retryRequestDelayMs: 3000,
  });

  // Guardar instancia de socket activa
  const currentS = sessions.get(userId) || {};
  sessions.set(userId, { ...currentS, sock, status: 'connecting' });

  // Guardar credenciales al cambiar
  sock.ev.on('creds.update', saveCreds);

  // ─── Sincronización del historial enviado por WhatsApp al conectar ─────────
  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
    console.log(`[Baileys Sync] Sincronización inicial para ${userId}: ${chats?.length || 0} chats, ${contacts?.length || 0} contactos, ${messages?.length || 0} msgs`);
    await syncChatsAndMessagesToDb(userId, chats, contacts, messages, io);
  });

  sock.ev.on('chats.upsert', async (chats) => {
    console.log(`[Baileys Sync] ${chats?.length || 0} chats actualizados para ${userId}`);
    await syncChatsAndMessagesToDb(userId, chats, [], [], io);
  });

  sock.ev.on('contacts.upsert', async (contacts) => {
    console.log(`[Baileys Sync] ${contacts?.length || 0} contactos recibidos para ${userId}`);
    await syncChatsAndMessagesToDb(userId, [], contacts, [], io);
  });

  // ─── Eventos de conexión ─────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ── QR generado ──────────────────────────────────────────────────────
    if (qr) {
      console.log(`[QR] Generado correctamente para ${userId}`);
      try {
        const QRCode = require('qrcode');
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });

        // Guardar en memoria activa para respuesta instantánea de API
        const sData = sessions.get(userId) || {};
        sessions.set(userId, { ...sData, qr: qrDataUrl, status: 'qr_ready' });

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

      sessions.set(userId, { sock, businessId, status: 'connected', phone, qr: null });

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

      const isLoggedOut = code === DisconnectReason.loggedOut || code === 401 || code === 403 || code === 405;
      const shouldReconnect = !isLoggedOut;

      console.log(`[Baileys] Conexión cerrada para ${userId}. Código: ${code}. LoggedOut: ${isLoggedOut}. Reconectar: ${shouldReconnect}`);

      if (isLoggedOut) {
        deleteSessionFolder(userId);
      }

      sessions.delete(userId);

      await safeUpsert('whatsapp_sessions', {
        user_id: userId,
        status: shouldReconnect ? 'reconnecting' : 'disconnected',
        qr_code: null,
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

  // ─── Mensajes procesados (Entrantes y Salientes propios) ──────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue;

      const sessionData = sessions.get(userId);
      if (!sessionData) continue;

      // Si el mensaje fue enviado por el propio usuario desde su teléfono
      if (msg.key.fromMe) {
        const jid = msg.key.remoteJid || '';
        const contactPhone = jid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
        const text = extractText(msg);
        if (!contactPhone || !text) continue;

        try {
          const { data: conv } = await supabase
            .from('conversations')
            .select('id')
            .eq('user_id', userId)
            .eq('contact_phone', contactPhone)
            .maybeSingle();

          let conversationId = conv?.id;
          if (!conversationId) {
            const { data: newConv } = await supabase.from('conversations').insert({
              user_id: userId,
              session_id: userId,
              contact_phone: contactPhone,
              contact_name: contactPhone,
              bot_active: true,
              is_blacklisted: false,
              last_message_at: new Date().toISOString(),
            }).select().maybeSingle();
            conversationId = newConv?.id;
          }

          if (conversationId) {
            await supabase.from('conversations').update({
              last_message_at: new Date().toISOString(),
            }).eq('id', conversationId);

            await supabase.from('messages').insert({
              conversation_id: conversationId,
              content: text,
              direction: 'outbound',
              sent_by: 'human',
              timestamp: new Date().toISOString(),
            });

            if (io) {
              io.to(`user_${userId}`).emit('new_message', {
                conversationId,
                message: { content: text, direction: 'outbound', sent_by: 'human', timestamp: new Date() },
              });
            }
          }
        } catch (e) {
          console.error('[MSG fromMe] Error guardando mensaje propio:', e.message);
        }
        continue;
      }

      // Si es mensaje entrante del cliente
      if (type === 'notify' && handleIncomingMessage) {
        try {
          await handleIncomingMessage(sock, msg, userId, businessId);
        } catch (err) {
          console.error(`[MSG] Error procesando mensaje de ${userId}:`, err.message);
        }
      }
    }
  });

  const existing = sessions.get(userId) || {};
  sessions.set(userId, { ...existing, sock, businessId, status: 'connecting' });
  return sock;
};

const disconnectSession = async (userId) => {
  const session = sessions.get(userId);
  if (session?.sock) {
    try {
      await session.sock.logout();
    } catch (e) {
      console.error('[Baileys] Error haciendo logout:', e.message);
    }
  }
  deleteSessionFolder(userId);
  sessions.delete(userId);
  await safeUpsert('whatsapp_sessions', {
    user_id: userId,
    status: 'disconnected',
    phone_number: null,
    qr_code: null,
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
  if (!session || !session.sock) throw new Error('Sesión no conectada');
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  await session.sock.sendMessage(jid, { text });
};

module.exports = { createSession, disconnectSession, getSession, restoreSessions, sendMessage, syncChatsAndMessagesToDb };

