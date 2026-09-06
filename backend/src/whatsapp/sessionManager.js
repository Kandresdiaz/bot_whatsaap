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

// Mapeo en memoria de LIDs a números de teléfono reales (PN)
const lidToPnMap = new Map(); // lidDigits -> pnDigits
const pnToLidMap = new Map(); // pnDigits -> lidDigits

const cleanPhoneFromJid = (jid) => {
  if (!jid || typeof jid !== 'string') return '';
  const withoutDomain = jid.split('@')[0];
  const withoutDevice = withoutDomain.split(':')[0].split('.')[0];
  return withoutDevice.replace(/[^0-9]/g, '');
};

const isLidJidOrDigits = (str) => {
  if (!str || typeof str !== 'string') return false;
  if (str.endsWith('@lid')) return true;
  const digits = str.replace(/[^0-9]/g, '');
  return lidToPnMap.has(digits);
};

const resolvePhoneAndJid = (input) => {
  if (!input || typeof input !== 'string') return { phone: '', jid: '', isGroup: false };
  const raw = input.trim();
  if (raw.endsWith('@g.us') || (raw.length > 15 && raw.includes('-'))) {
    const cleanGroup = raw.split('@')[0].replace(/[^0-9-]/g, '');
    return { phone: cleanGroup, jid: `${cleanGroup}@g.us`, isGroup: true };
  }

  const cleanDigits = cleanPhoneFromJid(raw);
  const isLid = isLidJidOrDigits(raw);

  if (isLid) {
    if (lidToPnMap.has(cleanDigits)) {
      const realPn = lidToPnMap.get(cleanDigits);
      return { phone: realPn, jid: `${realPn}@s.whatsapp.net`, lid: cleanDigits, isGroup: false };
    }
    return { phone: cleanDigits, jid: `${cleanDigits}@lid`, lid: cleanDigits, isGroup: false };
  }

  if (pnToLidMap.has(cleanDigits)) {
    return { phone: cleanDigits, jid: `${cleanDigits}@s.whatsapp.net`, lid: pnToLidMap.get(cleanDigits), isGroup: false };
  }

  return { phone: cleanDigits, jid: `${cleanDigits}@s.whatsapp.net`, isGroup: false };
};

const registerLidPnMapping = (jid1, jid2) => {
  if (!jid1 || !jid2) return;
  const is1Lid = isLidJidOrDigits(jid1);
  const is2Lid = isLidJidOrDigits(jid2);
  const d1 = cleanPhoneFromJid(jid1);
  const d2 = cleanPhoneFromJid(jid2);

  if (!d1 || !d2 || d1 === d2) return;

  if (is1Lid && !is2Lid) {
    lidToPnMap.set(d1, d2);
    pnToLidMap.set(d2, d1);
  } else if (is2Lid && !is1Lid) {
    lidToPnMap.set(d2, d1);
    pnToLidMap.set(d1, d2);
  }
};

const storeChats = (userId, chats = []) => {
  const list = Array.isArray(chats) ? chats : (chats?.chats || []);
  const store = getUserStore(userId);
  for (const c of list) {
    if (c && c.id && c.id !== 'status@broadcast') {
      if (c.lid) registerLidPnMapping(c.id, c.lid);
      if (c.pn || c.phone) registerLidPnMapping(c.id, c.pn || c.phone);

      const resolved = resolvePhoneAndJid(c.id);
      const existing = store.chats.get(c.id) || store.chats.get(resolved.phone) || {};
      const updated = { ...existing, ...c, id: c.id, name: c.name || existing.name };
      store.chats.set(c.id, updated);
      if (resolved.phone) store.chats.set(resolved.phone, updated);
    }
  }
};

const storeContacts = (userId, contacts = []) => {
  const list = Array.isArray(contacts) ? contacts : (contacts?.contacts || []);
  const store = getUserStore(userId);
  for (const c of list) {
    if (c && c.id) {
      if (c.lid) registerLidPnMapping(c.id, c.lid);
      if (c.pn || c.phone) registerLidPnMapping(c.id, c.pn || c.phone);

      const resolved = resolvePhoneAndJid(c.id);
      const existing = store.contacts.get(c.id) || store.contacts.get(resolved.phone) || {};
      const updated = { ...existing, ...c };
      store.contacts.set(c.id, updated);
      if (resolved.phone) store.contacts.set(resolved.phone, updated);

      const name = c.name || c.notify || c.verifiedName;
      if (name) {
        if (!userContacts.has(userId)) userContacts.set(userId, new Map());
        const contactsMap = userContacts.get(userId);
        contactsMap.set(c.id, name);
        if (resolved.phone) contactsMap.set(resolved.phone, name);
        if (resolved.lid) contactsMap.set(resolved.lid, name);
      }
    }
  }
};

const storeMessages = (userId, messages = []) => {
  const list = Array.isArray(messages) ? messages : (messages?.messages || []);
  const store = getUserStore(userId);
  for (const m of list) {
    if (!m || !m.key || !m.key.remoteJid || m.key.remoteJid === 'status@broadcast') continue;
    const msgId = m.key.id || `${m.key.remoteJid}_${m.messageTimestamp}`;
    store.messages.set(msgId, m);

    const jid = m.key.remoteJid;
    const resolved = resolvePhoneAndJid(jid);

    if (m.pushName) {
      storeContacts(userId, [{ id: jid, notify: m.pushName }]);
    }

    const chatObj = {
      id: jid,
      name: m.pushName || (jid.endsWith('@g.us') ? 'Grupo WA' : resolved.phone),
      conversationTimestamp: m.messageTimestamp || Math.floor(Date.now() / 1000),
      unreadCount: 0,
    };

    if (!store.chats.has(jid)) {
      store.chats.set(jid, chatObj);
      if (resolved.phone) store.chats.set(resolved.phone, chatObj);
    } else {
      const existingChat = store.chats.get(jid) || store.chats.get(resolved.phone);
      if (existingChat) {
        if (m.pushName && (!existingChat.name || existingChat.name === resolved.phone)) {
          existingChat.name = m.pushName;
        }
        if (m.messageTimestamp) {
          existingChat.conversationTimestamp = m.messageTimestamp;
        }
        store.chats.set(jid, existingChat);
        if (resolved.phone) store.chats.set(resolved.phone, existingChat);
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

// Helper para limpiar conversaciones y mensajes de una sesión desvinculada/cerrada
const clearUserConversationsFromDb = async (userId) => {
  if (!supabase || !userId) return;
  try {
    const validUserId = getValidUserId(userId);
    const { data: userSessions } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', validUserId);

    const sessionIds = [];
    if (Array.isArray(userSessions)) {
      userSessions.forEach(s => { if (s?.id) sessionIds.push(s.id); });
    }
    if (sessionIds.length === 0) return;

    const { data: convs } = await supabase
      .from('conversations')
      .select('id')
      .in('session_id', sessionIds);

    if (convs && convs.length > 0) {
      const convIds = convs.map(c => c.id);
      await supabase.from('messages').delete().in('conversation_id', convIds);
      await supabase.from('conversations').delete().in('session_id', sessionIds);
      console.log(`[Baileys Auth] 🧹 Eliminadas ${convs.length} conversaciones de sesión desvinculada para ${validUserId}`);
    }
  } catch (e) {
    console.warn('[Baileys Auth] Aviso limpiando conversaciones en DB:', e.message);
  }
};

const PRIMARY_ADMIN_ID = '0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d';
const ADMIN_UUID = '00000000-0000-0000-0000-000000000001';
const sessionUuidToUserMap = new Map();

const getValidUserId = (userId) => {
  if (!userId || userId === 'admin' || userId === ADMIN_UUID) return PRIMARY_ADMIN_ID;
  if (sessionUuidToUserMap.has(userId)) return sessionUuidToUserMap.get(userId);
  return userId;
};

// Emisor seguro de eventos Socket.io aislado a las salas del usuario
const emitToUserRooms = (io, userId, event, payload, sessionUuid = null) => {
  if (!io || !userId) return;
  const validId = getValidUserId(userId);
  const rooms = new Set([
    `user_${userId}`,
    `user_${validId}`,
    `session_${userId}`,
    `session_${validId}`,
  ]);

  const isAdmin = (userId === 'admin' || userId === ADMIN_UUID || validId === PRIMARY_ADMIN_ID);
  if (isAdmin) {
    rooms.add(`user_${PRIMARY_ADMIN_ID}`);
    rooms.add(`session_${PRIMARY_ADMIN_ID}`);
    rooms.add(`user_${ADMIN_UUID}`);
    rooms.add(`session_${ADMIN_UUID}`);
    rooms.add('user_admin');
    rooms.add('session_admin');
  }

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
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0 && existing[0]?.id) {
      sessionUuidToUserMap.set(existing[0].id, validUserId);
      return existing[0].id;
    }

    // 2. Probar si userId directamente coincide con id de whatsapp_sessions
    const { data: byId } = await supabase
      .from('whatsapp_sessions')
      .select('id, user_id')
      .eq('id', userId)
      .limit(1);

    if (byId && byId.length > 0 && byId[0]?.id) {
      const mappedUser = byId[0].user_id || validUserId;
      sessionUuidToUserMap.set(byId[0].id, mappedUser);
      return byId[0].id;
    }

    // 3. Crear registro nuevo usando validUserId
    const { data: newSess } = await supabase
      .from('whatsapp_sessions')
      .insert({ user_id: validUserId, status: 'connected' })
      .select('id')
      .limit(1);

    const newId = newSess && newSess[0]?.id;
    if (newId) {
      sessionUuidToUserMap.set(newId, validUserId);
    }
    return newId || null;
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

// Convertidor seguro de timestamps Baileys/Protobuf (soporta Objetos Long {low, high}, BigInt, etc.)
const safeToIsoString = (ts) => {
  if (!ts) return new Date().toISOString();
  try {
    let num = 0;
    if (typeof ts === 'object' && ts !== null) {
      if (typeof ts.toNumber === 'function') {
        num = ts.toNumber();
      } else if ('low' in ts && 'high' in ts) {
        num = (ts.high * 4294967296) + (ts.low >>> 0);
      } else if ('low' in ts) {
        num = ts.low >>> 0;
      }
    } else if (typeof ts === 'bigint') {
      num = Number(ts);
    } else {
      num = Number(ts);
    }

    if (!isNaN(num) && num > 0) {
      const ms = num > 100000000000 ? num : num * 1000;
      const date = new Date(ms);
      if (!isNaN(date.getTime())) return date.toISOString();
    }
  } catch (_) {}
  return new Date().toISOString();
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

    // Cargar conversaciones existentes de Supabase para cualquier sesión pertenecientes a este usuario
    const validUserId = getValidUserId(userId);
    const { data: userSessions } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', validUserId);

    const userSessionIds = (userSessions || []).map(s => s.id).filter(Boolean);
    if (sessionUuid && !userSessionIds.includes(sessionUuid)) userSessionIds.push(sessionUuid);

    const { data: existingConvs } = await supabase
      .from('conversations')
      .select('id, session_id, contact_phone, contact_name, last_message_at, bot_active, is_blacklisted')
      .in('session_id', userSessionIds.length > 0 ? userSessionIds : [sessionUuid]);

    const convMap = new Map();
    if (Array.isArray(existingConvs)) {
      for (const c of existingConvs) {
        convMap.set(c.contact_phone, c);
        if (c.bot_active === false) {
          setContactBotStatus(c.contact_phone, false, userId);
        }
      }
    }

    // 1. Extraer y aplanar todos los mensajes disponibles (incluyendo chat.messages si vienen anidados)
    const allMessagesList = [...(Array.isArray(messages) ? messages : [])];
    if (Array.isArray(chats)) {
      for (const ch of chats) {
        if (Array.isArray(ch.messages)) {
          for (const mItem of ch.messages) {
            const rawMsg = mItem.message ? mItem : (mItem.msg || mItem);
            if (rawMsg) allMessagesList.push(rawMsg);
          }
        }
      }
    }

    const userSessionObj = sessions.get(userId) || sessions.get(getValidUserId(userId));
    const userOwnPhone = (userSessionObj?.phone || userSessionObj?.sock?.user?.id || '').split(':')[0].replace(/[^0-9]/g, '');

    // Mapa de último mensaje por número de teléfono
    const latestMsgByPhone = new Map();
    for (const msg of allMessagesList) {
      if (!msg || !msg.key || msg.key.remoteJid === 'status@broadcast') continue;
      const jid = msg.key.remoteJid;
      const resolved = resolvePhoneAndJid(jid);
      const phone = resolved.phone || cleanPhoneFromJid(jid);
      if (!phone) continue;

      const isGroup = resolved.isGroup || jid.endsWith('@g.us');
      if (userOwnPhone && phone === userOwnPhone) continue;
      if (phone.length >= 14 && !isGroup) continue;

      const text = extractText(msg);
      const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) : 0;
      const isoTs = safeToIsoString(msg.messageTimestamp);

      if (!latestMsgByPhone.has(phone) || ts > latestMsgByPhone.get(phone).ts) {
        latestMsgByPhone.set(phone, { text, ts, isoTs, msg });
      }
    }

    const newConvsToInsert = [];
    const convsToUpdate = [];
    const addedPhones = new Set();

    // 1. Procesar chats reales de WhatsApp
    if (Array.isArray(chats) && chats.length > 0) {
      for (const chat of chats) {
        if (!chat || !chat.id || chat.id === 'status@broadcast') continue;
        const jid = chat.id;
        const resolved = resolvePhoneAndJid(jid);
        const contactPhone = resolved.phone || cleanPhoneFromJid(jid);
        if (!contactPhone) continue;

        const isGroup = resolved.isGroup || jid.endsWith('@g.us');
        if (userOwnPhone && contactPhone === userOwnPhone) continue;
        if (contactPhone.length >= 14 && !isGroup) continue;

        let contactName = chat.name || contactsMap.get(jid) || contactsMap.get(contactPhone) || (isGroup ? 'Grupo WA' : contactPhone);

        // Si no tenemos nombre, buscar si hay pushName en mensajes recibidos de este JID
        const latestInfo = latestMsgByPhone.get(contactPhone);
        if (contactName === contactPhone && latestInfo?.msg?.pushName) {
          contactName = latestInfo.msg.pushName;
        }

        // Timestamp del chat: usar el del último mensaje o conversationTimestamp del chat
        let ts = null;
        if (latestInfo?.isoTs) {
          ts = latestInfo.isoTs;
        } else if (chat.conversationTimestamp) {
          ts = safeToIsoString(chat.conversationTimestamp);
        } else {
          ts = new Date().toISOString();
        }

        const lastMsgText = latestInfo?.text || null;

        if (convMap.has(contactPhone)) {
          const existing = convMap.get(contactPhone);
          if (existing) {
            const updateData = {};
            if (ts && (!existing.last_message_at || new Date(ts) > new Date(existing.last_message_at))) {
              updateData.last_message_at = ts;
            }
            if (lastMsgText && (!existing.last_message || new Date(ts) >= new Date(existing.last_message_at || 0))) {
              updateData.last_message = lastMsgText;
            }
            if (contactName && contactName !== contactPhone && existing.contact_name !== contactName) {
              updateData.contact_name = contactName;
            }
            if (Object.keys(updateData).length > 0) {
              convsToUpdate.push({ id: existing.id, ...updateData });
            }
          }
        } else if (!addedPhones.has(contactPhone)) {
          addedPhones.add(contactPhone);
          newConvsToInsert.push({
            session_id: sessionUuid,
            contact_phone: contactPhone,
            contact_name: contactName || contactPhone,
            bot_active: !isGroup && !isContactBotDisabled(contactPhone, userId),
            is_blacklisted: false,
            unread_count: chat.unreadCount || 0,
            last_message: lastMsgText,
            last_message_at: ts,
          });
        }
      }
    }

    // 2. Procesar mensajes del historial para asegurar que sus chats existan con su último mensaje
    if (latestMsgByPhone.size > 0) {
      for (const [phone, info] of latestMsgByPhone.entries()) {
        if (!convMap.has(phone) && !addedPhones.has(phone)) {
          addedPhones.add(phone);
          const pushName = info.msg?.pushName || contactsMap.get(phone) || phone;
          const isGroup = info.msg?.key?.remoteJid?.endsWith('@g.us');

          newConvsToInsert.push({
            session_id: sessionUuid,
            contact_phone: phone,
            contact_name: pushName,
            bot_active: !isGroup && !isContactBotDisabled(phone, userId),
            is_blacklisted: false,
            last_message: info.text || null,
            last_message_at: info.isoTs,
          });
        }
      }
    }

    // Guardar nuevas conversaciones en Supabase vía upsert con onConflict (session_id, contact_phone)
    if (newConvsToInsert.length > 0) {
      try {
        const { data: inserted, error: insErr } = await supabase
          .from('conversations')
          .upsert(newConvsToInsert, { onConflict: 'session_id,contact_phone' })
          .select('id, contact_phone, contact_name, last_message, last_message_at');

        if (insErr) {
          console.warn('[Sync] Aviso en upsert lote de conversaciones, ejecutando individual:', insErr.message);
          for (const convItem of newConvsToInsert) {
            try {
              const { data: singleIns } = await supabase
                .from('conversations')
                .upsert(convItem, { onConflict: 'session_id,contact_phone' })
                .select('id, contact_phone, contact_name, last_message, last_message_at')
                .limit(1);
              const row = singleIns && singleIns[0];
              if (row) convMap.set(row.contact_phone, row);
            } catch (_) {}
          }
        } else if (Array.isArray(inserted)) {
          for (const c of inserted) {
            convMap.set(c.contact_phone, c);
          }
        }
      } catch (err) {
        console.warn('[Sync] Excepción insertando conversaciones:', err.message);
      }
    }

    // Re-consultar conversaciones para asegurar mapeo completo en convMap
    try {
      const { data: refreshedConvs } = await supabase
        .from('conversations')
        .select('id, contact_phone, contact_name, last_message, last_message_at')
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
        const resolved = resolvePhoneAndJid(jid);
        const contactPhone = resolved.phone || cleanPhoneFromJid(jid);
        if (!contactPhone) continue;

        const text = extractText(msg);
        if (!text) continue;

        const msgTime = safeToIsoString(msg.messageTimestamp);

        let conv = convMap.get(contactPhone);
        if (!conv?.id) {
          // Búsqueda directa por número de teléfono en Supabase aislado a este usuario
          try {
            const { data: directConv } = await supabase
              .from('conversations')
              .select('id, contact_phone')
              .in('session_id', userSessionIds.length > 0 ? userSessionIds : [sessionUuid])
              .eq('contact_phone', contactPhone)
              .limit(1);

            if (directConv && directConv[0]?.id) {
              conv = directConv[0];
              convMap.set(contactPhone, conv);
            }
          } catch (_) {}
        }

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
              await supabase.from('messages').upsert(batch, { onConflict: 'conversation_id,content,timestamp', ignoreDuplicates: true });
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

// Persistencia y restauración indestructible de la carpeta completa de credenciales y claves de Baileys
const saveSessionTimeouts = new Map();
const debouncedSaveFullSessionToDb = (userId, sessionDir, delay = 2500) => {
  const validUserId = getValidUserId(userId);
  if (saveSessionTimeouts.has(validUserId)) {
    clearTimeout(saveSessionTimeouts.get(validUserId));
  }
  const timer = setTimeout(async () => {
    saveSessionTimeouts.delete(validUserId);
    await saveFullSessionToDb(validUserId, sessionDir);
  }, delay);
  saveSessionTimeouts.set(validUserId, timer);
};

const saveFullSessionToDb = async (userId, sessionDir) => {
  if (!supabase || !fs.existsSync(sessionDir)) return;
  try {
    const validUserId = getValidUserId(userId);
    const credsFile = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsFile)) return;

    const files = fs.readdirSync(sessionDir);
    const sessionObj = {};

    // 1. creds.json es obligatorio
    sessionObj['creds.json'] = fs.readFileSync(credsFile, 'utf8');

    // 2. Guardar claves de estado de sync y sesiones (con límite de tamaño para Supabase)
    let totalBytes = sessionObj['creds.json'].length;
    const MAX_BYTES = 3 * 1024 * 1024; // 3MB de margen seguro para Supabase PostgREST

    for (const file of files) {
      if (file === 'creds.json' || !file.endsWith('.json')) continue;
      const filePath = path.join(sessionDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      if (totalBytes + content.length < MAX_BYTES) {
        sessionObj[file] = content;
        totalBytes += content.length;
      }
    }

    const jsonStr = JSON.stringify(sessionObj);
    await safeUpsert('whatsapp_sessions', {
      user_id: validUserId,
      session_data: jsonStr,
    });
    console.log(`[Baileys Auth] 💾 Sesión guardada en Supabase para ${validUserId} (${Object.keys(sessionObj).length} archivos, ${(totalBytes / 1024).toFixed(1)} KB)`);
  } catch (e) {
    console.warn('[Baileys Auth] Error guardando sesión completa:', e.message);
  }
};

const restoreFullSessionFromDb = async (userId, sessionDir) => {
  if (!supabase) return false;
  try {
    const validUserId = getValidUserId(userId);
    const { data: dbSess } = await supabase
      .from('whatsapp_sessions')
      .select('session_data')
      .eq('user_id', validUserId)
      .maybeSingle();

    if (dbSess?.session_data) {
      if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

      let parsed = null;
      try {
        parsed = JSON.parse(dbSess.session_data);
      } catch (_) {}

      if (parsed && typeof parsed === 'object' && parsed['creds.json']) {
        for (const [filename, content] of Object.entries(parsed)) {
          if (filename.endsWith('.json') && typeof content === 'string') {
            fs.writeFileSync(path.join(sessionDir, filename), content, 'utf8');
          }
        }
        console.log(`[Baileys Auth] 🔄 Restaurada sesión completa de Baileys desde Supabase para ${validUserId}`);
        return true;
      } else if (typeof dbSess.session_data === 'string') {
        fs.writeFileSync(path.join(sessionDir, 'creds.json'), dbSess.session_data, 'utf8');
        console.log(`[Baileys Auth] 🔄 Restaurado creds.json desde Supabase para ${validUserId}`);
        return true;
      }
    }
  } catch (e) {
    console.warn('[Baileys Auth] Error restaurando sesión:', e.message);
  }
  return false;
};

const createSession = async (userId, businessId, io, forceClean = false, isManualStart = false) => {
  const validUserId = getValidUserId(userId);
  userDisconnectedMap.delete(userId);
  userDisconnectedMap.delete(validUserId);

  const existingSession = sessions.get(userId) || sessions.get(validUserId);

  // Si ya está conectada y no pedimos limpieza forzada, retornamos el socket
  if (existingSession?.sock && existingSession?.status === 'connected' && !forceClean) {
    console.log(`[Baileys] Sesión ya conectada para ${userId}`);
    return existingSession.sock;
  }

  // Si ya tiene QR listo y activo y no se solicitó forzar nuevo QR, reutilizamos la sesión activa
  if (existingSession?.sock && existingSession?.status === 'qr_ready' && existingSession?.qr && !forceClean) {
    console.log(`[Baileys] QR ya generado y activo para ${userId}, reutilizando sesión existente`);
    return existingSession.sock;
  }

  // Solo si se solicita limpieza forzada explícita (ej. escanear nuevo QR o desconexión manual) borramos credenciales
  if (forceClean) {
    if (existingSession?.sock) {
      try { existingSession.sock.end(new Error('Reiniciando sesión')); } catch (_) {}
    }
    deleteSessionFolder(userId);
    deleteSessionFolder(validUserId);
    sessions.delete(userId);
    sessions.delete(validUserId);
    userStores.delete(userId);
    userStores.delete(validUserId);
    userContacts.delete(userId);
    userContacts.delete(validUserId);
    clearUserConversationsFromDb(validUserId).catch(() => {});

    safeUpsert('whatsapp_sessions', {
      user_id: validUserId,
      session_data: null,
      qr_code: null,
      phone_number: null,
      status: 'connecting',
    }).catch(() => {});
  } else if (existingSession?.sock) {
    try { existingSession.sock.end(new Error('Reconectando socket')); } catch (_) {}
  }

  const sessionDir = path.join(SESSIONS_DIR, userId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  // Guardar estado inicial en memoria inmediatamente (bot activo por defecto)
  const prevSession = sessions.get(userId) || {};
  sessions.set(userId, { status: 'connecting', businessId, sock: null, qr: null, bot_enabled: prevSession.bot_enabled !== undefined ? prevSession.bot_enabled : true });
  sessions.set(validUserId, sessions.get(userId));
  if (validUserId === ADMIN_UUID) sessions.set('admin', sessions.get(userId));

  // *** CRÍTICO: Garantizar que el registro en whatsapp_sessions exista ANTES de crear el socket
  // messaging-history.set llega al conectar y llama syncChatsAndMessagesToDb → getSessionUuid()
  // Si el registro no existe en DB en ese momento, getSessionUuid() retorna null y se pierden todos los chats
  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('user_id', validUserId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        // Registrar en mapa de memoria para acceso rápido
        sessionUuidToUserMap.set(existing[0].id, validUserId);
        await supabase.from('whatsapp_sessions').update({ status: 'connecting', qr_code: null }).eq('id', existing[0].id);
      } else {
        const { data: newSess } = await supabase
          .from('whatsapp_sessions')
          .insert({ user_id: validUserId, status: 'connecting' })
          .select('id')
          .limit(1);
        if (newSess && newSess[0]) {
          sessionUuidToUserMap.set(newSess[0].id, validUserId);
        }
      }
    } catch (dbErr) {
      console.warn('[createSession] Aviso DB setup sesión:', dbErr.message);
    }
  }

  const credsFilePath = path.join(sessionDir, 'creds.json');
  if (!forceClean && !fs.existsSync(credsFilePath) && supabase) {
    await restoreFullSessionFromDb(validUserId, sessionDir);
  }

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
    browser: Browsers.ubuntu('Chrome'),
    generateHighQualityLinkPreview: false,
    syncFullHistory: true,
    downloadHistory: true,
    markOnlineOnConnect: false,
    shouldSyncHistoryMessage: () => true,
    getMessage: async (key) => {
      try {
        const store = getUserStore(userId);
        const msgId = key.id || `${key.remoteJid}_${key.messageTimestamp}`;
        const found = store.messages.get(msgId) || store.messages.get(key.id);
        if (found) return found.message;
      } catch (_) {}
      return undefined;
    },
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
    maxMsgRetryCount: 5,
  });

  // Guardar instancia de socket activa
  const currentS = sessions.get(userId) || {};
  sessions.set(userId, { ...currentS, sock, status: 'connecting' });

  // Guardar credenciales al cambiar (en disco y debounced en Supabase para evitar saturación)
  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
      debouncedSaveFullSessionToDb(userId, sessionDir, 2500);
    } catch (_) {}
  });

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
      const validId = getValidUserId(userId);

      // Si la sesión fue iniciada en segundo plano (auto-reconexión, restauración de servidor, etc.)
      // y NO fue solicitada manualmente por el usuario en la pantalla de conectar:
      // Significa que las credenciales fueron revocadas / el usuario cerró sesión en su teléfono.
      if (!isManualStart) {
        console.log(`[Baileys] 🛑 QR no solicitado durante reconexión de fondo para ${userId}. Dispositivo desvinculado desde el teléfono.`);
        userDisconnectedMap.add(userId);
        userDisconnectedMap.add(validId);

        try { sock.ev.removeAllListeners(); } catch (_) {}
        try { sock.end(new Error('Dispositivo desvinculado desde el teléfono')); } catch (_) {}

        // Eliminar de RAM
        sessions.delete(userId);
        sessions.delete(validId);
        const isAdmin = (userId === 'admin' || userId === ADMIN_UUID || validId === PRIMARY_ADMIN_ID);
        if (isAdmin) {
          sessions.delete('admin');
          sessions.delete(ADMIN_UUID);
          sessions.delete(PRIMARY_ADMIN_ID);
        }

        // Limpiar memoria RAM de chats y contactos
        userStores.delete(userId);
        userStores.delete(validId);
        userContacts.delete(userId);
        userContacts.delete(validId);

        // Limpiar carpetas físicas de credenciales invalidadas
        deleteSessionFolder(userId);
        deleteSessionFolder(validId);

        // Limpiar conversaciones y mensajes en base de datos para no dejar chats huérfanos
        clearUserConversationsFromDb(validId).catch(() => {});

        safeUpsert('whatsapp_sessions', {
          user_id: validId,
          status: 'disconnected',
          phone_number: null,
          qr_code: null,
          session_data: null,
          connected_at: null,
        }).catch(e => console.warn('[DB] Error guardando desconexión:', e.message));

        if (io) {
          const payload = { shouldReconnect: false, isLoggedOut: true, status: 'disconnected' };
          emitToUserRooms(io, userId, 'disconnected', payload);
          emitToUserRooms(io, validId, 'disconnected', payload);
        }
        return;
      }

      const sData = sessions.get(userId) || sessions.get(validId) || {};
      
      // Si es exactamente el mismo código QR que ya tenemos en memoria, no regenerar ni re-emitir
      if (sData.rawQr === qr && sData.qr) {
        return;
      }

      console.log(`[QR] Generado correctamente para ${userId}`);
      try {
        const QRCode = require('qrcode');
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });

        // Guardar en memoria activa para respuesta instantánea de API
        const updatedState = { ...sData, qr: qrDataUrl, rawQr: qr, status: 'qr_ready' };

        sessions.set(userId, updatedState);
        sessions.set(validId, updatedState);
        const isAdmin = (userId === 'admin' || userId === ADMIN_UUID || validId === PRIMARY_ADMIN_ID);
        if (isAdmin) sessions.set('admin', updatedState);

        // Emitir al frontend por Socket.io a las salas del usuario
        emitToUserRooms(io, userId, 'qr', { qr: qrDataUrl });

        // Guardar en DB (no bloquear si falla)
        safeUpsert('whatsapp_sessions', {
          user_id: validId,
          qr_code: qrDataUrl,
          status: 'qr_ready',
        }).catch(e => console.warn('[DB] Error guardando QR:', e.message));
      } catch (errQr) {
        console.error('[QR] Error generando DataURL:', errQr.message);
      }
    }

    // ── Conexión establecida ──────────────────────────────────────────────
    if (connection === 'open') {
      const phone = (sock.user?.id?.split(':')[0] || '').replace(/[^0-9]/g, '');
      console.log(`[Baileys] ✅ Conectado: ${phone} (usuario: ${userId})`);

      const validId = getValidUserId(userId);

      // Si el número de teléfono cambió respecto a la sesión guardada en DB,
      // purgar de raíz todo el historial previo (RAM y DB) para NUNCA mezclar conversaciones
      try {
        if (supabase) {
          const { data: currentDbSession } = await supabase
            .from('whatsapp_sessions')
            .select('phone_number')
            .eq('user_id', validId)
            .maybeSingle();

          const prevPhone = (currentDbSession?.phone_number || '').replace(/[^0-9]/g, '');

          if (prevPhone && phone && prevPhone !== phone) {
            console.log(`[Baileys] 🔄 CAMBIO DE NÚMERO DETECTADO para ${validId}: Anterior (${prevPhone}) → Nuevo (${phone}). Limpiando historial previo.`);
            userStores.delete(userId);
            userStores.delete(validId);
            userContacts.delete(userId);
            userContacts.delete(validId);
            await clearUserConversationsFromDb(validId);
          }
        }
      } catch (checkErr) {
        console.warn('[Baileys] Aviso al verificar cambio de número:', checkErr.message);
      }

      // 1. Actualizar memoria RAM INMEDIATAMENTE para todas las claves de usuario
      const prevS = sessions.get(userId) || sessions.get(validId) || {};
      const connectedState = { ...prevS, sock, businessId, status: 'connected', phone, qr: null };

      sessions.set(userId, connectedState);
      sessions.set(validId, connectedState);
      const isAdmin = (userId === 'admin' || userId === ADMIN_UUID || validId === PRIMARY_ADMIN_ID);
      if (isAdmin) sessions.set('admin', connectedState);

      getSessionUuid(userId).then(sessUuid => {
        if (sessUuid) {
          sessions.set(sessUuid, connectedState);
          userStores.set(sessUuid, getUserStore(userId));
          userContacts.set(sessUuid, userContacts.get(userId) || new Map());
        }
      }).catch(() => {});

      // 2. Emitir por Socket.io INMEDIATAMENTE a todas las salas del usuario
      if (io) {
        const payload = { phone, userId, status: 'connected' };
        emitToUserRooms(io, userId, 'connected', payload);
        emitToUserRooms(io, validId, 'connected', payload);
        emitToUserRooms(io, userId, 'session_ready', payload);
        emitToUserRooms(io, validId, 'session_ready', payload);
      }

      // 3. Persistir en DB en segundo plano sin bloquear
      safeUpsert('whatsapp_sessions', {
        user_id: validId,
        phone_number: phone,
        status: 'connected',
        qr_code: null,
        connected_at: new Date().toISOString(),
      }).catch(e => console.warn('[DB] Error guardando sesión en DB:', e.message));

      debouncedSaveFullSessionToDb(userId, sessionDir, 1000);

      // 4. Disparar sincronizaciones secuenciales iniciales de chats y grupos
      const triggerInitialSync = async () => {
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
              await syncChatsAndMessagesToDb(userId, groupChats, [], [], io);
            }
          }
        } catch (errSync) {
          console.warn('[Sync open] Aviso en sync inicial:', errSync.message);
        }
      };

      setTimeout(triggerInitialSync, 1000);
      setTimeout(triggerInitialSync, 4000);
      setTimeout(triggerInitialSync, 8000);
    }

    // ── Conexión cerrada ──────────────────────────────────────────────────
    if (connection === 'close') {
      const errOutput = lastDisconnect?.error?.output;
      const code = errOutput?.statusCode
        || lastDisconnect?.error?.statusCode
        || (lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : 0)
        || 0;

      const errMsg = (lastDisconnect?.error?.message || '').toLowerCase();
      const errData = String(lastDisconnect?.error?.data || '').toLowerCase();

      const isLoggedOut =
        code === DisconnectReason.loggedOut ||
        code === DisconnectReason.badSession ||
        code === 401 ||
        code === 403 ||
        errMsg.includes('logged out') ||
        errMsg.includes('unauthorized') ||
        errMsg.includes('forbidden') ||
        errMsg.includes('device_removed') ||
        errData.includes('logged out');

      const validId = getValidUserId(userId);
      const isExplicitDisconnect = userDisconnectedMap.has(userId) || userDisconnectedMap.has(validId);

      const shouldReconnect = !isLoggedOut && !isExplicitDisconnect;

      console.log(`[Baileys] Conexión cerrada para ${userId}. Código: ${code}. LoggedOut: ${isLoggedOut}. Desconexión manual: ${isExplicitDisconnect}. Reconectar: ${shouldReconnect}`);

      if (isLoggedOut || isExplicitDisconnect) {
        userDisconnectedMap.add(userId);
        userDisconnectedMap.add(validId);

        try { sock.ev.removeAllListeners(); } catch (_) {}
        try { sock.end(new Error('Sesión cerrada')); } catch (_) {}

        // Eliminar de RAM
        sessions.delete(userId);
        sessions.delete(validId);
        const isAdmin = (userId === 'admin' || userId === ADMIN_UUID || validId === PRIMARY_ADMIN_ID);
        if (isAdmin) {
          sessions.delete('admin');
          sessions.delete(ADMIN_UUID);
          sessions.delete(PRIMARY_ADMIN_ID);
        }

        // Limpiar memoria RAM de chats y contactos para que no persistan chats viejos
        userStores.delete(userId);
        userStores.delete(validId);
        userContacts.delete(userId);
        userContacts.delete(validId);

        // Limpiar carpetas físicas de credenciales invalidadas
        deleteSessionFolder(userId);
        deleteSessionFolder(validId);

        // Limpiar conversaciones y mensajes en base de datos para no dejar chats huérfanos
        clearUserConversationsFromDb(validId).catch(() => {});

        safeUpsert('whatsapp_sessions', {
          user_id: validId,
          status: 'disconnected',
          phone_number: null,
          qr_code: null,
          session_data: null,
          connected_at: null,
        }).catch(e => console.warn('[DB] Error guardando desconexión:', e.message));

        if (io) {
          const payload = { shouldReconnect: false, isLoggedOut: true, status: 'disconnected' };
          emitToUserRooms(io, userId, 'disconnected', payload);
          emitToUserRooms(io, validId, 'disconnected', payload);
        }
      } else {
        // Si va a reconectar por fallo temporal de red o servidor
        const prevS = sessions.get(userId) || sessions.get(validId) || {};
        const sData = { ...prevS, sock: null, status: 'connecting' };
        sessions.set(userId, sData);
        sessions.set(validId, sData);
        const isAdmin = (userId === 'admin' || userId === ADMIN_UUID || validId === PRIMARY_ADMIN_ID);
        if (isAdmin) sessions.set('admin', sData);

        safeUpsert('whatsapp_sessions', {
          user_id: validId,
          status: 'reconnecting',
          qr_code: null,
        }).catch(() => {});

        if (io) {
          const payload = { shouldReconnect: true, isLoggedOut: false, status: 'reconnecting' };
          emitToUserRooms(io, userId, 'reconnecting', payload);
          emitToUserRooms(io, validId, 'reconnecting', payload);
        }

        console.log(`[Baileys] Reconectando ${userId} en 3s... (código: ${code}, motivo: ${errMsg})`);
        setTimeout(() => {
          if (!userDisconnectedMap.has(userId) && !userDisconnectedMap.has(validId)) {
            createSession(userId, businessId, io, false, false).catch(console.error);
          }
        }, 3000);
      }
    }
  });

  // ─── Mensajes procesados (Entrantes, Salientes e Historial append/notify) ─
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    storeMessages(userId, messages);

    if (Array.isArray(messages) && messages.length > 0) {
      console.log(`[Baileys Sync] Recibidos ${messages.length} mensajes (type: ${type}) para ${userId}`);
      await syncChatsAndMessagesToDb(userId, [], [], messages, io);
    }

    for (const msg of messages) {
      if (!msg.message) continue;

      const sessionData = sessions.get(userId);
      if (!sessionData) continue;

      // Si el mensaje fue enviado por el propio usuario desde su teléfono
      if (msg.key.fromMe) {
        const jid = msg.key.remoteJid || '';
        const resolved = resolvePhoneAndJid(jid);
        const contactPhone = resolved.phone || cleanPhoneFromJid(jid);
        const text = extractText(msg);
        if (!contactPhone || !text) continue;

        try {
          const sessionUuid = await getSessionUuid(userId);

          const { data: convRows } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_phone', contactPhone)
            .order('last_message_at', { ascending: false })
            .limit(1);

          let conversationId = convRows && convRows[0]?.id;
          if (!conversationId) {
            const { data: newConvRows } = await supabase.from('conversations').upsert({
              session_id: sessionUuid || null,
              contact_phone: contactPhone,
              contact_name: contactPhone,
              bot_active: true,
              is_blacklisted: false,
              last_message: text,
              last_message_at: new Date().toISOString(),
            }, { onConflict: 'session_id,contact_phone' }).select('id').limit(1);
            conversationId = newConvRows && newConvRows[0]?.id;
          }

          if (conversationId) {
            await supabase.from('conversations').update({
              last_message: text,
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
              const msgObj = {
                id: msg.key.id || Date.now().toString(),
                content: text,
                direction: 'outbound',
                sent_by: 'human',
                timestamp: new Date().toISOString(),
              };
              emitToUserRooms(io, userId, 'new_message', {
                conversationId,
                contactPhone,
                message: msgObj,
              }, sessionUuid);
              emitToUserRooms(io, userId, 'conversation_updated', {
                conversationId,
                contactPhone,
                lastMessage: text,
                timestamp: new Date().toISOString(),
              }, sessionUuid);
            }
          }
        } catch (e) {
          console.error('[MSG fromMe] Error guardando mensaje propio:', e.message);
        }
        continue;
      }

      // Si es mensaje entrante en tiempo real del cliente (notify o append reciente, ignorar historial antiguo y fromMe)
      const isRecent = msg.messageTimestamp ? (Date.now() / 1000 - Number(msg.messageTimestamp) < 300) : true;
      if ((type === 'notify' || (type === 'append' && isRecent)) && handleIncomingMessage && !msg.key.fromMe) {
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
  if (!userId) return;
  const validId = getValidUserId(userId);
  userDisconnectedMap.add(userId);
  userDisconnectedMap.add(validId);

  const isAdmin = (userId === 'admin' || userId === ADMIN_UUID || validId === PRIMARY_ADMIN_ID);
  const session = sessions.get(userId) || sessions.get(validId) || (isAdmin ? sessions.get('admin') : null);

  // 1. Limpiar estado en memoria RAM INMEDIATAMENTE
  sessions.delete(userId);
  sessions.delete(validId);
  if (isAdmin) {
    sessions.delete('admin');
    sessions.delete(ADMIN_UUID);
    sessions.delete(PRIMARY_ADMIN_ID);
  }

  userStores.delete(userId);
  userStores.delete(validId);
  userContacts.delete(userId);
  userContacts.delete(validId);

  // 2. Persistir desconexión en DB de inmediato
  await safeUpsert('whatsapp_sessions', {
    user_id: validId,
    status: 'disconnected',
    phone_number: null,
    qr_code: null,
    session_data: null,
    connected_at: null,
  });

  // 3. Emitir evento de desconexión a todas las salas del usuario de inmediato
  if (global.io) {
    const payload = { shouldReconnect: false, isLoggedOut: true, status: 'disconnected' };
    emitToUserRooms(global.io, userId, 'disconnected', payload);
    emitToUserRooms(global.io, validId, 'disconnected', payload);
  }

  // 4. Terminar socket en segundo plano con timeout estricto sin bloquear la respuesta
  if (session?.sock) {
    try { session.sock.ev.removeAllListeners(); } catch (_) {}
    try {
      await Promise.race([
        session.sock.logout().catch(() => {}),
        new Promise(r => setTimeout(r, 1500))
      ]);
    } catch (_) {}
    try { session.sock.end(new Error('Desconexión manual')); } catch (_) {}
  }

  // 5. Limpiar carpetas físicas y conversaciones de DB en segundo plano
  deleteSessionFolder(userId);
  deleteSessionFolder(validId);
  clearUserConversationsFromDb(validId).catch(() => {});
};

const getSession = (userId) => {
  if (!userId) return null;

  // 1. Coincidencia exacta de clave
  if (sessions.has(userId)) return sessions.get(userId);

  // 2. Coincidencia por validUserId
  const validId = getValidUserId(userId);
  if (sessions.has(validId)) return sessions.get(validId);

  // Si userId es Admin, probar las claves reservadas del admin
  const isAdmin = (userId === 'admin' || userId === ADMIN_UUID || validId === PRIMARY_ADMIN_ID);
  if (isAdmin) {
    if (sessions.has('admin')) return sessions.get('admin');
    if (sessions.has(ADMIN_UUID)) return sessions.get(ADMIN_UUID);
    if (sessions.has(PRIMARY_ADMIN_ID)) return sessions.get(PRIMARY_ADMIN_ID);
  }

  // 3. Buscar si alguna clave registrada mapea a este mismo usuario
  for (const [key, s] of sessions.entries()) {
    if (getValidUserId(key) === validId) return s;
  }

  // NUNCA devolver sesiones ajenas de otros usuarios
  return null;
};

const restoreSessions = async (io) => {
  if (!supabase) return;
  try {
    // 1. Limpiar sesiones obsoletas atascadas en 'connecting' o 'qr_ready'
    await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected', qr_code: null })
      .in('status', ['connecting', 'qr_ready']);

    // 2. Solo restaurar sesiones que estaban efectivamente conectadas y con credenciales guardadas
    const { data: activeSessions } = await supabase
      .from('whatsapp_sessions')
      .select('user_id, status, session_data')
      .eq('status', 'connected')
      .not('session_data', 'is', null);

    if (!activeSessions || activeSessions.length === 0) {
      console.log('[Restore] No hay sesiones conectadas previamente para restaurar.');
      return;
    }

    for (const session of activeSessions) {
      if (!session || !session.user_id) continue;
      try {
        console.log(`[Restore] Restaurando sesión activa para ${session.user_id}...`);
        await createSession(session.user_id, null, io, false, false);
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.error(`[Restore] Error restaurando ${session.user_id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[Restore] Error en restoreSessions:', e.message);
  }
};

const sendMessage = async (userId, to, text) => {
  const validUserId = getValidUserId(userId);
  let session = getSession(userId) || getSession(validUserId);

  // Auto-restaurar sesión SOLO si en DB la sesión figuraba conectada con session_data
  if (!session || !session.sock) {
    if (supabase) {
      try {
        const { data: dbSess } = await supabase
          .from('whatsapp_sessions')
          .select('status, session_data')
          .eq('user_id', validUserId)
          .maybeSingle();

        if (dbSess?.status === 'connected' && dbSess?.session_data) {
          console.log(`[SendMessage] Restaurando socket activo para ${userId}...`);
          createSession(validUserId, null, global.io, false, false).catch(() => {});

          // Esperar hasta 10 segundos a que se inicialice el socket de Baileys
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            session = getSession(userId) || getSession(validUserId);
            if (session?.sock) break;
          }
        }
      } catch (_) {}
    }
  }

  let activeSock = session?.sock;

  if (!activeSock) {
    throw new Error('WhatsApp no está conectado actualmente. Por favor ve a la pestaña "Conectar WhatsApp" y escanea el código QR.');
  }

  const rawTo = (to || '').trim();
  const resolved = resolvePhoneAndJid(rawTo);
  let targetJid = resolved.jid;

  console.log(`[Baileys Outbound] Enviando mensaje a ${rawTo} -> JID ${targetJid} (usuario: ${userId}): "${text.slice(0, 50)}"`);

  // Intentar envío con hasta 3 reintentos con JID primario y alternativo si aplica
  let lastErr = null;
  const jidCandidates = [targetJid];
  if (resolved.lid && !targetJid.endsWith('@lid')) {
    jidCandidates.push(`${resolved.lid}@lid`);
  } else if (!targetJid.endsWith('@g.us') && rawTo.length === 15) {
    const cleanDigits = rawTo.replace(/[^0-9]/g, '');
    if (!jidCandidates.includes(`${cleanDigits}@lid`)) jidCandidates.push(`${cleanDigits}@lid`);
    if (!jidCandidates.includes(`${cleanDigits}@s.whatsapp.net`)) jidCandidates.push(`${cleanDigits}@s.whatsapp.net`);
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const currentJid = jidCandidates[(attempt - 1) % jidCandidates.length];
    try {
      // Re-verificar socket por si se reinició entre reintentos
      const currentSession = getSession(userId) || getSession(validUserId);
      const currentSock = currentSession?.sock || activeSock;

      await currentSock.sendMessage(currentJid, { text });
      console.log(`[Baileys Outbound] ✅ Mensaje entregado con éxito a ${currentJid} (intento ${attempt})`);
      if (currentSession) currentSession.status = 'connected';
      return { success: true, jid: currentJid };
    } catch (err) {
      lastErr = err;
      console.warn(`[Baileys Outbound] Error en intento ${attempt} enviando a ${currentJid}:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
    }
  }

  throw new Error(`Error de envío en WhatsApp: ${lastErr?.message || 'Fallo de entrega'}`);
};

const getGlobalBotStatus = async (userId) => {
  const validUserId = getValidUserId(userId);
  const session = getSession(userId) || getSession(validUserId);

  if (!supabase) {
    return session?.bot_enabled !== undefined ? session.bot_enabled : true;
  }

  try {
    const { data: sess } = await supabase
      .from('whatsapp_sessions')
      .select('bot_enabled')
      .eq('user_id', validUserId)
      .limit(1);

    if (sess && sess.length > 0 && typeof sess[0].bot_enabled === 'boolean') {
      if (session) session.bot_enabled = sess[0].bot_enabled;
      return sess[0].bot_enabled;
    }

    const { data: bus } = await supabase
      .from('businesses')
      .select('bot_enabled')
      .eq('user_id', validUserId)
      .limit(1);

    if (bus && bus.length > 0 && typeof bus[0].bot_enabled === 'boolean') {
      if (session) session.bot_enabled = bus[0].bot_enabled;
      return bus[0].bot_enabled;
    }

    const enabled = session?.bot_enabled !== undefined ? session.bot_enabled : true;
    return enabled;
  } catch (e) {
    return session?.bot_enabled !== undefined ? session.bot_enabled : true;
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

const disabledBotPhones = new Set();

const setContactBotStatus = (phone, botActive, userId = null) => {
  const cleanPhone = (phone || '').toString().replace('ram_', '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return;
  const validUserId = userId ? getValidUserId(userId) : null;
  const userKey = validUserId ? `${validUserId}_${cleanPhone}` : null;

  if (botActive === false) {
    disabledBotPhones.add(cleanPhone);
    if (userKey) disabledBotPhones.add(userKey);
  } else {
    disabledBotPhones.delete(cleanPhone);
    if (userKey) disabledBotPhones.delete(userKey);
  }
};

const isContactBotDisabled = (phone, userId = null) => {
  const cleanPhone = (phone || '').toString().replace('ram_', '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return false;
  const validUserId = userId ? getValidUserId(userId) : null;
  if (validUserId && disabledBotPhones.has(`${validUserId}_${cleanPhone}`)) return true;
  return disabledBotPhones.has(cleanPhone);
};

const isExplicitlyDisconnected = (userId) => {
  const validId = getValidUserId(userId);
  return userDisconnectedMap.has(userId) || userDisconnectedMap.has(validId);
};

module.exports = {
  sessions,
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
  getUserStore,
  safeToIsoString,
  storeChats,
  extractText,
  isExplicitlyDisconnected,
  resolvePhoneAndJid,
  cleanPhoneFromJid,
  setContactBotStatus,
  isContactBotDisabled,
};



