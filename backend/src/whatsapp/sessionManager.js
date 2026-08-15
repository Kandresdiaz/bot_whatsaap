const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
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
const userDisconnectedMap = new Set();

// Caché en memoria de contactos por usuario: userId → Map(jid → name)
const userContacts = new Map();

// Store en memoria RAM para acumular chats, contactos y mensajes por usuario
const userStores = new Map();

const getUserStore = (userId) => {
  const validId = getValidUserId(userId);
  if (!userStores.has(validId)) {
    userStores.set(validId, {
      chats: new Map(),     // jid -> chatObj
      contacts: new Map(),  // jid -> contactObj
      messages: new Map(),  // msgId -> msgObj
    });
  }
  return userStores.get(validId);
};

const storeChats = (userId, chats = []) => {
  if (!Array.isArray(chats)) return;
  const store = getUserStore(userId);
  for (const c of chats) {
    if (c && c.id && c.id !== 'status@broadcast') {
      const existing = store.chats.get(c.id) || {};
      store.chats.set(c.id, { ...existing, ...c });
    }
  }
};

const storeContacts = (userId, contacts = []) => {
  if (!Array.isArray(contacts)) return;
  const store = getUserStore(userId);
  for (const c of contacts) {
    if (c && c.id) {
      const existing = store.contacts.get(c.id) || {};
      store.contacts.set(c.id, { ...existing, ...c });
      const name = c.name || c.notify || c.verifiedName;
      if (name) {
        if (!userContacts.has(userId)) userContacts.set(userId, new Map());
        const contactsMap = userContacts.get(userId);
        contactsMap.set(c.id, name);
        const cleanPhone = c.id.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
        if (cleanPhone) contactsMap.set(cleanPhone, name);
      }
    }
  }
};

const storeMessages = (userId, messages = []) => {
  if (!Array.isArray(messages)) return;
  const store = getUserStore(userId);
  for (const m of messages) {
    if (!m || !m.key || !m.key.remoteJid || m.key.remoteJid === 'status@broadcast') continue;
    const msgId = m.key.id || `${m.key.remoteJid}_${m.messageTimestamp}`;
    store.messages.set(msgId, m);

    const jid = m.key.remoteJid;
    if (m.pushName) {
      storeContacts(userId, [{ id: jid, notify: m.pushName }]);
    }
    if (!store.chats.has(jid)) {
      const isGroup = jid.endsWith('@g.us');
      store.chats.set(jid, {
        id: jid,
        name: m.pushName || (isGroup ? 'Grupo WA' : jid.replace(/[^0-9]/g, '')),
        conversationTimestamp: m.messageTimestamp || Math.floor(Date.now() / 1000),
        unreadCount: 0,
      });
    } else {
      const existingChat = store.chats.get(jid);
      if (m.pushName && (!existingChat.name || existingChat.name === jid.replace(/[^0-9]/g, ''))) {
        existingChat.name = m.pushName;
      }
      if (m.messageTimestamp) {
        existingChat.conversationTimestamp = m.messageTimestamp;
      }
    }
  }
};

const SESSIONS_DIR = path.join(__dirname, '../../sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const logger = pino({ level: 'silent' });

// Helper para eliminar la carpeta física de credenciales de un usuario
const deleteSessionFolder = (userId) => {
  if (!userId) return;
  const validId = getValidUserId(userId);
  const targets = new Set([userId, validId]);
  for (const id of targets) {
    const sessionDir = path.join(SESSIONS_DIR, id);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`[Baileys] 🧹 Carpeta de credenciales eliminada para ${id}`);
      } catch (e) {
        console.warn(`[Baileys] Error eliminando carpeta de ${id}:`, e.message);
      }
    }
  }
};

const ADMIN_UUID = '00000000-0000-0000-0000-000000000001';

const getValidUserId = (userId) => {
  if (!userId || userId === 'admin') return ADMIN_UUID;
  return userId;
};

// Emisor seguro e instantáneo de eventos Socket.io a todas las salas del usuario
const emitToUserRooms = (io, userId, event, payload, sessionUuid = null) => {
  if (!io) return;
  const validId = getValidUserId(userId);
  const rooms = new Set([
    `user_${userId}`,
    `user_${validId}`,
    `session_${userId}`,
    `session_${validId}`,
  ]);
  if (sessionUuid) {
    rooms.add(`session_${sessionUuid}`);
    rooms.add(`user_${sessionUuid}`);
  }
  for (const room of rooms) {
    try { io.to(room).emit(event, payload); } catch (_) {}
  }
};

// Obtener o crear el UUID de sesión en whatsapp_sessions (mapeo consistente por user_id)
const getSessionUuid = async (userId) => {
  if (!supabase || !userId) return null;

  try {
    const validUserId = getValidUserId(userId);

    // 1. Buscar primero por user_id (clave principal del negocio/usuario)
    const { data: existing } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', validUserId)
      .maybeSingle();

    if (existing?.id) return existing.id;

    // 2. Probar si userId directamente coincide con id de whatsapp_sessions
    const { data: byId } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (byId?.id) return byId.id;

    // 3. Crear registro nuevo usando validUserId
    const { data: newSess } = await supabase
      .from('whatsapp_sessions')
      .insert({ user_id: validUserId, status: 'connected' })
      .select('id')
      .maybeSingle();

    return newSess?.id || null;
  } catch (e) {
    console.warn('[DB] getSessionUuid aviso:', e.message);
    return null;
  }
};

// Helper seguro para upsert a Supabase sin lanzar excepción
const safeUpsert = async (table, data, conflict = 'user_id') => {
  if (!supabase) return;
  try {
    const dataWithValidId = { ...data };
    if (dataWithValidId.user_id) {
      dataWithValidId.user_id = getValidUserId(dataWithValidId.user_id);
    }
    const { data: existing } = await supabase.from(table).select('id').eq('user_id', dataWithValidId.user_id).maybeSingle();
    if (existing?.id) {
      await supabase.from(table).update(dataWithValidId).eq('id', existing.id);
    } else {
      await supabase.from(table).insert(dataWithValidId);
    }
  } catch (e) {
    console.warn(`[DB] upsert ${table} aviso:`, e.message);
  }
};

// Helper robusto para extraer texto de mensajes de Baileys
const extractText = (msg) => {
  if (!msg || !msg.message) return '';
  let m = msg.message;
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessageV2Extension) m = m.viewOnceMessageV2Extension.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  if (m.editedMessage) m = m.editedMessage.message?.protocolMessage?.editedMessage || m.editedMessage;
  if (!m) return '';

  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.documentMessage?.caption
    || m.buttonsResponseMessage?.selectedDisplayText
    || m.listResponseMessage?.title
    || m.templateButtonReplyMessage?.selectedId
    || (m.imageMessage ? '[Imagen]' : '')
    || (m.videoMessage ? '[Video]' : '')
    || (m.audioMessage ? '[Audio]' : '')
    || (m.documentMessage ? (m.documentMessage.fileName ? `[Documento: ${m.documentMessage.fileName}]` : '[Documento]') : '')
    || (m.stickerMessage ? '[Sticker]' : '')
    || (m.locationMessage ? '[Ubicación]' : '')
    || (m.contactMessage ? '[Contacto]' : '')
    || '';
};

// Sincronizador optimizado en lote de chats, contactos e historial a Supabase
const syncChatsAndMessagesToDb = async (userId, inputChats = [], inputContacts = [], inputMessages = [], io = null) => {
  if (!supabase) return;

  let sessionUuid = null;
  try {
    sessionUuid = await getSessionUuid(userId);
  } catch (e) {
    console.warn('[Sync] Error obteniendo sessionUuid:', e.message);
  }
  if (!sessionUuid) return;

  try {
    // 1. Guardar cualquier nuevo dato en el store en memoria RAM
    if (Array.isArray(inputChats) && inputChats.length > 0) storeChats(userId, inputChats);
    if (Array.isArray(inputContacts) && inputContacts.length > 0) storeContacts(userId, inputContacts);
    if (Array.isArray(inputMessages) && inputMessages.length > 0) storeMessages(userId, inputMessages);

    // 2. Extraer todo lo acumulado en memoria para sincronización garantizada
    const store = getUserStore(userId);
    const chats = Array.from(store.chats.values());
    const contacts = Array.from(store.contacts.values());
    const messages = Array.from(store.messages.values());

    console.log(`[Sync DB] Sincronizando para ${userId} (${sessionUuid}): ${chats.length} chats, ${contacts.length} contactos, ${messages.length} msgs`);

    // Obtener/actualizar caché de contactos
    if (!userContacts.has(userId)) {
      userContacts.set(userId, new Map());
    }
    const contactsMap = userContacts.get(userId);

    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        if (c && c.id) {
          const name = c.name || c.notify || c.verifiedName;
          if (name) {
            contactsMap.set(c.id, name);
            const cleanPhone = c.id.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
            if (cleanPhone) contactsMap.set(cleanPhone, name);
          }
        }
      }
    }

    // Cargar conversaciones existentes de Supabase en una sola consulta
    const { data: existingConvs } = await supabase
      .from('conversations')
      .select('id, contact_phone, contact_name, last_message_at')
      .eq('session_id', sessionUuid);

    const convMap = new Map();
    if (Array.isArray(existingConvs)) {
      for (const c of existingConvs) {
        convMap.set(c.contact_phone, c);
      }
    }

    const newConvsToInsert = [];
    const convsToUpdate = [];

    // 1. Procesar chats de WhatsApp
    if (Array.isArray(chats) && chats.length > 0) {
      for (const chat of chats) {
        if (!chat || !chat.id || chat.id === 'status@broadcast') continue;
        const jid = chat.id;
        const contactPhone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
        if (!contactPhone) continue;

        const isGroup = jid.endsWith('@g.us');
        let contactName = chat.name || contactsMap.get(jid) || contactsMap.get(contactPhone) || (isGroup ? 'Grupo WA' : contactPhone);

        // Si no tenemos nombre, buscar si hay pushName en mensajes recibidos de este JID
        if (contactName === contactPhone && Array.isArray(messages)) {
          const msgPush = messages.find(m => m.key?.remoteJid === jid && m.pushName);
          if (msgPush?.pushName) contactName = msgPush.pushName;
        }

        const ts = chat.conversationTimestamp
          ? new Date(Number(chat.conversationTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        if (convMap.has(contactPhone)) {
          const existing = convMap.get(contactPhone);
          if (existing) {
            const updateData = {};
            if (new Date(ts) > new Date(existing.last_message_at || 0)) {
              updateData.last_message_at = ts;
            }
            if (contactName && contactName !== contactPhone && existing.contact_name !== contactName) {
              updateData.contact_name = contactName;
            }
            if (Object.keys(updateData).length > 0) {
              convsToUpdate.push({ id: existing.id, ...updateData });
            }
          }
        } else {
          newConvsToInsert.push({
            session_id: sessionUuid,
            contact_phone: contactPhone,
            contact_name: contactName || contactPhone,
            bot_active: true,
            is_blacklisted: false,
            unread_count: chat.unreadCount || 0,
            last_message_at: ts,
          });
        }
      }
    }

    // 2. Procesar mensajes del historial para asegurar que sus chats existan
    if (Array.isArray(messages) && messages.length > 0) {
      for (const msg of messages) {
        if (!msg || !msg.key || !msg.key.remoteJid || msg.key.remoteJid === 'status@broadcast') continue;
        const jid = msg.key.remoteJid;
        const contactPhone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
        if (!contactPhone) continue;

        const isGroup = jid.endsWith('@g.us');
        const pushName = msg.pushName || contactsMap.get(jid) || contactsMap.get(contactPhone) || (isGroup ? 'Grupo WA' : contactPhone);
        const msgTime = msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        if (!convMap.has(contactPhone) && !newConvsToInsert.some(c => c.contact_phone === contactPhone)) {
          newConvsToInsert.push({
            session_id: sessionUuid,
            contact_phone: contactPhone,
            contact_name: pushName,
            bot_active: true,
            is_blacklisted: false,
            last_message_at: msgTime,
          });
        }
      }
    }

    // Guardar nuevas conversaciones en Supabase en lote
    if (newConvsToInsert.length > 0) {
      try {
        const { data: inserted } = await supabase
          .from('conversations')
          .insert(newConvsToInsert)
          .select('id, contact_phone, contact_name, last_message_at');

        if (Array.isArray(inserted)) {
          for (const c of inserted) {
            convMap.set(c.contact_phone, c);
          }
        }
      } catch (err) {
        console.warn('[Sync] Error insertando nuevas conversaciones:', err.message);
      }
    }

    // Re-consultar conversaciones para asegurar mapeo completo en convMap
    try {
      const { data: refreshedConvs } = await supabase
        .from('conversations')
        .select('id, contact_phone, contact_name, last_message_at')
        .eq('session_id', sessionUuid);

      if (Array.isArray(refreshedConvs)) {
        for (const c of refreshedConvs) {
          convMap.set(c.contact_phone, c);
        }
      }
    } catch (_) {}

    // Actualizar conversaciones existentes
    if (convsToUpdate.length > 0) {
      for (const item of convsToUpdate) {
        const { id, ...changes } = item;
        try {
          await supabase.from('conversations').update(changes).eq('id', id);
        } catch (_) {}
      }
    }

    // 3. Procesar y guardar mensajes en lote
    if (Array.isArray(messages) && messages.length > 0) {
      const messagesToInsert = [];

      for (const msg of messages) {
        if (!msg || !msg.key || !msg.message || msg.key.remoteJid === 'status@broadcast') continue;
        const jid = msg.key.remoteJid;
        const contactPhone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
        if (!contactPhone) continue;

        const text = extractText(msg);
        if (!text) continue;

        const msgTime = msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        const conv = convMap.get(contactPhone);
        if (conv?.id) {
          messagesToInsert.push({
            conversation_id: conv.id,
            content: text,
            direction: msg.key.fromMe ? 'outbound' : 'inbound',
            sent_by: 'human',
            timestamp: msgTime,
          });
        }
      }

      if (messagesToInsert.length > 0) {
        // Cargar mensajes recientes para evitar duplicar mensajes exactos
        const convIds = Array.from(convMap.values()).map(c => c.id).filter(Boolean);
        let existingMsgSet = new Set();

        if (convIds.length > 0) {
          try {
            const { data: existingMsgs } = await supabase
              .from('messages')
              .select('conversation_id, content, timestamp')
              .in('conversation_id', convIds.slice(0, 100));

            if (Array.isArray(existingMsgs)) {
              for (const m of existingMsgs) {
                existingMsgSet.add(`${m.conversation_id}_${m.content}_${m.timestamp}`);
              }
            }
          } catch (_) {}
        }

        const uniqueMessages = messagesToInsert.filter(
          m => !existingMsgSet.has(`${m.conversation_id}_${m.content}_${m.timestamp}`)
        );

        if (uniqueMessages.length > 0) {
          // Insertar en lotes de 50 mensajes
          const BATCH_SIZE = 50;
          for (let i = 0; i < uniqueMessages.length; i += BATCH_SIZE) {
            const batch = uniqueMessages.slice(i, i + BATCH_SIZE);
            try {
              await supabase.from('messages').insert(batch);
            } catch (errMsg) {
              console.warn(`[Sync] Error en lote de mensajes (${i}):`, errMsg.message);
            }
          }
        }
      }
    }
  } catch (syncErr) {
    console.error('[Sync] Error general en syncChatsAndMessagesToDb:', syncErr.message);
  }

  if (io) {
    emitToUserRooms(io, userId, 'chats_synced', { timestamp: new Date().toISOString() }, sessionUuid);
  }
};

const createSession = async (userId, businessId, io, forceClean = false) => {
  const validUserId = getValidUserId(userId);
  userDisconnectedMap.delete(userId);
  userDisconnectedMap.delete(validUserId);

  const existingSession = sessions.get(userId) || sessions.get(validUserId);

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
  safeUpsert('whatsapp_sessions', {
    user_id: userId,
    status: 'connecting',
    qr_code: null,
  }).catch(() => {});

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
  let WA_VERSION = [2, 3000, 1015901307];
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
    browser: Browsers.ubuntu('Chrome'),
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
  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, syncType }) => {
    console.log(`[Baileys Sync] messaging-history.set para ${userId}: ${chats?.length || 0} chats, ${contacts?.length || 0} contactos, ${messages?.length || 0} msgs (type: ${syncType})`);
    storeChats(userId, chats);
    storeContacts(userId, contacts);
    storeMessages(userId, messages);
    await syncChatsAndMessagesToDb(userId, chats, contacts, messages, io);
  });

  sock.ev.on('chats.set', async (data) => {
    const list = Array.isArray(data) ? data : (data?.chats || []);
    console.log(`[Baileys Sync] chats.set recibido para ${userId}: ${list.length} chats`);
    storeChats(userId, list);
    await syncChatsAndMessagesToDb(userId, list, [], [], io);
  });

  sock.ev.on('contacts.set', async (data) => {
    const list = Array.isArray(data) ? data : (data?.contacts || []);
    console.log(`[Baileys Sync] contacts.set recibido para ${userId}: ${list.length} contactos`);
    storeContacts(userId, list);
    await syncChatsAndMessagesToDb(userId, [], list, [], io);
  });

  sock.ev.on('messages.set', async (data) => {
    const list = Array.isArray(data) ? data : (data?.messages || []);
    console.log(`[Baileys Sync] messages.set recibido para ${userId}: ${list.length} msgs`);
    storeMessages(userId, list);
    await syncChatsAndMessagesToDb(userId, [], [], list, io);
  });

  sock.ev.on('chats.upsert', async (data) => {
    const list = Array.isArray(data) ? data : (data?.chats || []);
    console.log(`[Baileys Sync] ${list.length} chats actualizados para ${userId}`);
    storeChats(userId, list);
    await syncChatsAndMessagesToDb(userId, list, [], [], io);
  });

  sock.ev.on('chats.update', async (data) => {
    const list = Array.isArray(data) ? data : (data?.chats || []);
    console.log(`[Baileys Sync] ${list.length} chats modificados para ${userId}`);
    storeChats(userId, list);
    await syncChatsAndMessagesToDb(userId, list, [], [], io);
  });

  sock.ev.on('contacts.upsert', async (data) => {
    const list = Array.isArray(data) ? data : (data?.contacts || []);
    console.log(`[Baileys Sync] ${list.length} contactos recibidos para ${userId}`);
    storeContacts(userId, list);
    await syncChatsAndMessagesToDb(userId, [], list, [], io);
  });

  sock.ev.on('contacts.update', async (data) => {
    const list = Array.isArray(data) ? data : (data?.contacts || []);
    console.log(`[Baileys Sync] ${list.length} contactos modificados para ${userId}`);
    storeContacts(userId, list);
    await syncChatsAndMessagesToDb(userId, [], list, [], io);
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

        // Emitir al frontend por Socket.io a todas las salas del usuario
        emitToUserRooms(io, userId, 'qr', { qr: qrDataUrl });

        // Guardar en DB (no bloquear si falla)
        safeUpsert('whatsapp_sessions', {
          user_id: userId,
          qr_code: qrDataUrl,
          status: 'qr_ready',
        }).catch(e => console.warn('[DB] Error guardando QR:', e.message));
      } catch (errQr) {
        console.error('[QR] Error generando DataURL:', errQr.message);
      }
    }

    // ── Conexión establecida ──────────────────────────────────────────────
    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || '';
      console.log(`[Baileys] ✅ Conectado: ${phone} (usuario: ${userId})`);

      // 1. Actualizar memoria RAM INMEDIATAMENTE
      const prevS = sessions.get(userId) || {};
      sessions.set(userId, { ...prevS, sock, businessId, status: 'connected', phone, qr: null });

      // 2. Emitir por Socket.io INMEDIATAMENTE a todas las salas
      if (io) {
        const payload = { phone, userId };
        emitToUserRooms(io, userId, 'connected', payload);
        emitToUserRooms(io, userId, 'session_ready', payload);
      }

      // 3. Persistir en DB en segundo plano sin bloquear
      safeUpsert('whatsapp_sessions', {
        user_id: userId,
        phone_number: phone,
        status: 'connected',
        qr_code: null,
        connected_at: new Date().toISOString(),
      }).catch(e => console.warn('[DB] Error guardando sesión en DB:', e.message));

      // 4. Disparar sincronización inicial de chats y grupos en segundo plano
      setTimeout(async () => {
        try {
          await syncChatsAndMessagesToDb(userId, [], [], [], io);
          if (sock.groupFetchAllParticipating) {
            const groups = await sock.groupFetchAllParticipating();
            if (groups) {
              const groupChats = Object.values(groups).map(g => ({
                id: g.id,
                name: g.subject || g.name,
                conversationTimestamp: g.creation || Math.floor(Date.now() / 1000),
                unreadCount: 0,
              }));
              console.log(`[Baileys Sync] ${groupChats.length} grupos recuperados para ${userId}`);
              await syncChatsAndMessagesToDb(userId, groupChats, [], [], io);
            }
          }
        } catch (errSync) {
          console.warn('[Sync open] Aviso en sync inicial:', errSync.message);
        }
      }, 1000);
    }

    // ── Conexión cerrada ──────────────────────────────────────────────────
    if (connection === 'close') {
      const errOutput = lastDisconnect?.error?.output;
      const code = errOutput?.statusCode
        || lastDisconnect?.error?.statusCode
        || (lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : 0)
        || 0;

      const errMsg = (lastDisconnect?.error?.message || '').toLowerCase();

      const isLoggedOut =
        code === DisconnectReason.loggedOut ||
        code === DisconnectReason.badSession ||
        code === 401 ||
        code === 403 ||
        code === 405 ||
        code === 428 ||
        errMsg.includes('logged out') ||
        errMsg.includes('unauthorized') ||
        errMsg.includes('bad session');

      const validId = getValidUserId(userId);
      const isExplicitDisconnect = userDisconnectedMap.has(userId) || userDisconnectedMap.has(validId);

      const shouldReconnect = !isLoggedOut && !isExplicitDisconnect;

      console.log(`[Baileys] Conexión cerrada para ${userId}. Código: ${code}. LoggedOut: ${isLoggedOut}. Desconexión manual: ${isExplicitDisconnect}. Reconectar: ${shouldReconnect}`);

      // Eliminar de RAM todas las posibles referencias
      sessions.delete(userId);
      sessions.delete(validId);
      if (userId === ADMIN_UUID || validId === ADMIN_UUID) sessions.delete('admin');

      if (isLoggedOut || isExplicitDisconnect) {
        // Limpiar carpetas físicas de credenciales invalidadas
        deleteSessionFolder(userId);
        deleteSessionFolder(validId);

        safeUpsert('whatsapp_sessions', {
          user_id: validId,
          status: 'disconnected',
          phone_number: null,
          qr_code: null,
          connected_at: null,
        }).catch(e => console.warn('[DB] Error guardando desconexión:', e.message));

        if (io) {
          const payload = { shouldReconnect: false, isLoggedOut: true, status: 'disconnected' };
          emitToUserRooms(io, userId, 'disconnected', payload);
          emitToUserRooms(io, validId, 'disconnected', payload);
        }
      } else {
        safeUpsert('whatsapp_sessions', {
          user_id: validId,
          status: 'reconnecting',
          qr_code: null,
        }).catch(() => {});

        if (io) {
          const payload = { shouldReconnect: true, isLoggedOut: false, status: 'reconnecting' };
          emitToUserRooms(io, userId, 'disconnected', payload);
          emitToUserRooms(io, validId, 'disconnected', payload);
        }

        console.log(`[Baileys] Reconectando ${userId} en 5s...`);
        setTimeout(() => createSession(userId, businessId, io).catch(console.error), 5000);
      }
    }
  });

  // ─── Mensajes procesados (Entrantes, Salientes e Historial append) ────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    storeMessages(userId, messages);

    // Si se están recibiendo paquetes del historial enviado por WhatsApp ('append')
    if (type === 'append' && Array.isArray(messages) && messages.length > 0) {
      console.log(`[Baileys Sync] Recibidos ${messages.length} mensajes del historial ('append') para ${userId}`);
      await syncChatsAndMessagesToDb(userId, [], [], messages, io);
      return;
    }

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
          const sessionUuid = await getSessionUuid(userId);
          if (!sessionUuid) continue;

          const { data: conv } = await supabase
            .from('conversations')
            .select('id')
            .eq('session_id', sessionUuid)
            .eq('contact_phone', contactPhone)
            .maybeSingle();

          let conversationId = conv?.id;
          if (!conversationId) {
            const { data: newConv } = await supabase.from('conversations').insert({
              session_id: sessionUuid,
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
              emitToUserRooms(io, userId, 'new_message', {
                conversationId,
                message: { content: text, direction: 'outbound', sent_by: 'human', timestamp: new Date() },
              }, sessionUuid);
              emitToUserRooms(io, userId, 'conversation_updated', {
                conversationId, contactPhone, lastMessage: text,
              }, sessionUuid);
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
  const validId = getValidUserId(userId);
  userDisconnectedMap.add(userId);
  userDisconnectedMap.add(validId);

  const session = getSession(userId) || getSession(validId);
  if (session?.sock) {
    try {
      await session.sock.logout();
    } catch (e) {
      try { session.sock.end(new Error('Desconexión manual')); } catch (_) {}
    }
  }
  deleteSessionFolder(userId);
  deleteSessionFolder(validId);
  sessions.delete(userId);
  sessions.delete(validId);
  if (userId === ADMIN_UUID || validId === ADMIN_UUID) sessions.delete('admin');

  await safeUpsert('whatsapp_sessions', {
    user_id: validId,
    status: 'disconnected',
    phone_number: null,
    qr_code: null,
    connected_at: null,
  });

  if (global.io) {
    const payload = { shouldReconnect: false, isLoggedOut: true, status: 'disconnected' };
    emitToUserRooms(global.io, userId, 'disconnected', payload);
    emitToUserRooms(global.io, validId, 'disconnected', payload);
  }
};

const getSession = (userId) => {
  if (!userId) return null;

  // 1. Coincidencia exacta de clave
  if (sessions.has(userId)) return sessions.get(userId);

  // 2. Coincidencia por validUserId ('admin' o ADMIN_UUID)
  const validId = getValidUserId(userId);
  if (sessions.has(validId)) return sessions.get(validId);
  if (sessions.has('admin')) return sessions.get('admin');
  if (sessions.has(ADMIN_UUID)) return sessions.get(ADMIN_UUID);

  // 3. Buscar si alguna clave coincide en getValidUserId
  for (const [key, s] of sessions.entries()) {
    if (getValidUserId(key) === validId) return s;
  }

  // 4. Fallback: Si existe una única sesión activa en memoria RAM, retornarla
  if (sessions.size === 1) {
    return sessions.values().next().value;
  }

  return null;
};

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

const getGlobalBotStatus = async (userId) => {
  const session = getSession(userId);
  if (session && typeof session.bot_enabled === 'boolean') {
    return session.bot_enabled;
  }
  if (!supabase) return true;

  try {
    const validUserId = getValidUserId(userId);
    const { data: sess } = await supabase
      .from('whatsapp_sessions')
      .select('bot_enabled')
      .eq('user_id', validUserId)
      .maybeSingle();

    let enabled = true;
    if (sess && typeof sess.bot_enabled === 'boolean') {
      enabled = sess.bot_enabled;
    } else {
      const { data: bus } = await supabase
        .from('businesses')
        .select('bot_enabled')
        .eq('user_id', validUserId)
        .maybeSingle();
      if (bus && typeof bus.bot_enabled === 'boolean') {
        enabled = bus.bot_enabled;
      }
    }

    const currentS = getSession(userId);
    if (currentS) currentS.bot_enabled = enabled;
    return enabled;
  } catch (e) {
    return true;
  }
};

const setGlobalBotStatus = async (userId, bot_enabled, io = null) => {
  const validUserId = getValidUserId(userId);
  const targetSession = getSession(userId) || getSession(validUserId);
  if (targetSession) {
    targetSession.bot_enabled = bot_enabled;
  }

  await safeUpsert('whatsapp_sessions', {
    user_id: validUserId,
    bot_enabled: bot_enabled,
  });

  if (supabase) {
    try {
      await supabase
        .from('businesses')
        .update({ bot_enabled: bot_enabled })
        .eq('user_id', validUserId);
    } catch (_) {}
  }

  const sessionUuid = await getSessionUuid(validUserId);
  const activeIo = io || global.io;
  if (activeIo) {
    emitToUserRooms(activeIo, userId, 'global_bot_updated', { userId, bot_enabled, sessionUuid }, sessionUuid);
  }

  return bot_enabled;
};

module.exports = {
  createSession,
  disconnectSession,
  getSession,
  restoreSessions,
  sendMessage,
  syncChatsAndMessagesToDb,
  getSessionUuid,
  getValidUserId,
  emitToUserRooms,
  getGlobalBotStatus,
  setGlobalBotStatus,
};



