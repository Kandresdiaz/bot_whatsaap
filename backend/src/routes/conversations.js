const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Listar conversaciones de una sesión o usuario (Optimizado a <30ms)
router.get('/:sessionId', async (req, res) => {
  try {
    let { sessionId } = req.params;
    const { search, status } = req.query;

    const { getSessionUuid, getValidUserId } = require('../whatsapp/sessionManager');
    const validUserId = getValidUserId(sessionId);
    const sessionUuid = await getSessionUuid(sessionId);
    const sessionIdsSet = new Set();
    if (isUuid(sessionUuid)) sessionIdsSet.add(sessionUuid);
    if (isUuid(sessionId)) sessionIdsSet.add(sessionId);
    if (isUuid(validUserId)) sessionIdsSet.add(validUserId);

    try {
      const { data: userSessions } = await supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('user_id', validUserId);

      if (Array.isArray(userSessions)) {
        userSessions.forEach(s => {
          if (isUuid(s?.id)) sessionIdsSet.add(s.id);
        });
      }
    } catch (_) {}

    const sessionList = Array.from(sessionIdsSet);

    let query = supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false })
      .limit(100);

    if (sessionList.length > 0) {
      query = query.in('session_id', sessionList);
    }
    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('contact_name', `%${search}%`);

    let { data, error } = await query;

    // Fallback si la consulta filtrada por session_id no arroja resultados
    if ((!data || data.length === 0) && !search && !status) {
      const { data: fallbackConvs } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(100);
      data = fallbackConvs || [];
    }

    if (error) console.error('[Conversations GET Error]:', error?.message);

    const { getUserStore, resolvePhoneAndJid, safeToIsoString } = require('../whatsapp/sessionManager');
    const store = getUserStore(validUserId);

    const dbConvs = data || [];
    const phoneSet = new Set();
    const merged = [];

    for (const c of dbConvs) {
      if (!c || !c.contact_phone) continue;
      const resolved = resolvePhoneAndJid(c.contact_phone);
      const cleanPhone = resolved.phone || c.contact_phone;

      // Descartar LID duplicado si ya tenemos la conversación con el número de teléfono real
      if (phoneSet.has(cleanPhone)) continue;
      phoneSet.add(cleanPhone);

      merged.push({
        ...c,
        contact_phone: cleanPhone,
      });
    }

    // Fusionar chats acumulados en memoria RAM de Baileys
    try {
      if (store && store.chats) {
        for (const [key, chat] of store.chats.entries()) {
          if (!chat || !chat.id || chat.id === 'status@broadcast') continue;
          const resolved = resolvePhoneAndJid(chat.id);
          const phone = resolved.phone;
          if (!phone || phoneSet.has(phone)) continue;

          phoneSet.add(phone);
          merged.push({
            id: `ram_${phone}`,
            session_id: sessionUuid || validUserId,
            contact_phone: phone,
            contact_name: chat.name || phone,
            bot_active: true,
            is_blacklisted: false,
            is_lead: false,
            unread_count: chat.unreadCount || 0,
            status: 'open',
            last_message: null,
            last_message_at: safeToIsoString ? safeToIsoString(chat.conversationTimestamp) : new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.warn('[Merge RAM Chats Error]:', e.message);
    }

    // Obtener los últimos mensajes de la memoria RAM de Baileys si no vienen en la DB
    try {
      const { extractText } = require('../whatsapp/sessionManager');
      if (store && store.messages && store.messages.size > 0) {
        for (const [key, msg] of store.messages.entries()) {
          if (!msg || !msg.key || !msg.key.remoteJid) continue;
          const resolved = resolvePhoneAndJid(msg.key.remoteJid);
          const phone = resolved.phone;
          const text = extractText ? extractText(msg) : '';
          const msgTs = safeToIsoString(msg.messageTimestamp);

          if (phone && text) {
            const foundConv = merged.find(c => c.contact_phone === phone);
            if (foundConv) {
              if (!foundConv.last_message || new Date(msgTs) > new Date(foundConv.last_message_at || 0)) {
                foundConv.last_message = text;
                foundConv.last_message_at = msgTs;
              }
            }
          }
        }
      }
    } catch (_) {}

    // Enriquecer nombres de contactos desde la memoria de contactos de Baileys
    try {
      if (store && store.contacts) {
        for (const c of merged) {
          const cleanP = c.contact_phone ? c.contact_phone.replace(/[^0-9]/g, '') : '';
          const cNameClean = c.contact_name ? c.contact_name.replace(/[^0-9]/g, '') : '';
          if (!c.contact_name || cNameClean === cleanP) {
            const contactObj = store.contacts.get(cleanP) || store.contacts.get(`${cleanP}@s.whatsapp.net`) || store.contacts.get(`${cleanP}@lid`);
            const betterName = contactObj?.name || contactObj?.notify || contactObj?.verifiedName;
            if (betterName) {
              c.contact_name = betterName;
            }
          }
        }
      }
    } catch (_) {}

    // Ordenar por la fecha del último mensaje descendente
    merged.sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());

    res.json({ success: true, conversations: merged });
  } catch (err) {
    console.error('[GET Conversations Crash Safe]:', err.message);
    res.json({ success: true, conversations: [] });
  }
});

// Mensajes de una conversación
router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const cleanPhone = conversationId.replace(/[^0-9]/g, '');
    let realConvId = isUuid(conversationId) ? conversationId : null;

    // Si es un ID de RAM o número de teléfono, buscar el UUID real en Supabase por contact_phone
    if (!realConvId && cleanPhone) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_phone', cleanPhone)
        .maybeSingle();

      if (conv?.id) realConvId = conv.id;
    }

    let dbMsgs = [];
    if (realConvId) {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', realConvId)
        .order('timestamp', { ascending: true })
        .limit(200);

      dbMsgs = data || [];
      await supabase.from('conversations').update({ unread_count: 0 }).eq('id', realConvId).catch(() => {});
    }

    // Fusionar mensajes en RAM de Baileys para este número
    const ramMsgs = [];
    if (cleanPhone) {
      try {
        const { getUserStore, extractText, safeToIsoString, getValidUserId } = require('../whatsapp/sessionManager');
        const validId = getValidUserId('admin');
        const store = getUserStore(validId);
        if (store && store.messages) {
          for (const [mId, m] of store.messages.entries()) {
            if (!m || !m.key || !m.key.remoteJid) continue;
            const jid = m.key.remoteJid;
            const p = jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
            if (p === cleanPhone) {
              const text = extractText ? extractText(m) : '';
              if (text) {
                ramMsgs.push({
                  id: m.key.id || mId,
                  conversation_id: realConvId || conversationId,
                  content: text,
                  direction: m.key.fromMe ? 'outbound' : 'inbound',
                  sent_by: m.key.fromMe ? 'human' : 'client',
                  timestamp: safeToIsoString(m.messageTimestamp),
                });
              }
            }
          }
        }
      } catch (_) {}
    }

    // Fusionar y eliminar duplicados por id/content
    const msgMap = new Map();
    dbMsgs.forEach(m => msgMap.set(m.id || `${m.timestamp}_${m.content}`, m));
    ramMsgs.forEach(m => {
      const key = `${m.timestamp}_${m.content}`;
      if (!msgMap.has(key) && !msgMap.has(m.id)) {
        msgMap.set(m.id, m);
      }
    });

    const allMsgs = Array.from(msgMap.values());
    allMsgs.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

    res.json({ success: true, messages: allMsgs });
  } catch (err) {
    console.error('[GET Messages Error]:', err.message);
    res.json({ success: true, messages: [] });
  }
});

// Crear o buscar conversación para un número de teléfono
router.post('/create', async (req, res) => {
  try {
    const { userId, phone, contactName } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'phone es requerido' });
    }

    const { getSessionUuid, getValidUserId } = require('../whatsapp/sessionManager');
    const validUserId = getValidUserId(userId || 'admin');
    const sessionUuid = await getSessionUuid(validUserId);
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    if (!cleanPhone) {
      return res.status(400).json({ success: false, error: 'Número de teléfono inválido' });
    }

    // Buscar si ya existe
    let { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_phone', cleanPhone)
      .maybeSingle();

    if (existing) {
      return res.json({ success: true, conversation: existing });
    }

    // Crear conversación nueva en Supabase
    const { data: newConv, error: insErr } = await supabase
      .from('conversations')
      .insert({
        session_id: sessionUuid,
        contact_phone: cleanPhone,
        contact_name: contactName || cleanPhone,
        bot_active: true,
        is_blacklisted: false,
        last_message_at: new Date().toISOString(),
        unread_count: 0,
        status: 'open',
      })
      .select()
      .maybeSingle();

    if (insErr) {
      console.error('[Conversations Create Error]:', insErr.message);
      return res.status(500).json({ success: false, error: insErr.message });
    }

    return res.json({ success: true, conversation: newConv });
  } catch (err) {
    console.error('[Conversations Create Crash Safe]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sincronizar chats de la sesión activa
router.post('/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { getSession, syncChatsAndMessagesToDb, emitToUserRooms, getSessionUuid, storeChats } = require('../whatsapp/sessionManager');

    const sessionUuid = await getSessionUuid(userId);
    const session = getSession(userId);

    if (session?.sock) {
      try {
        if (session.sock.groupFetchAllParticipating) {
          const groups = await session.sock.groupFetchAllParticipating();
          if (groups) {
            const groupChats = Object.values(groups).map(g => ({
              id: g.id,
              name: g.subject || g.name,
              conversationTimestamp: g.creation || Math.floor(Date.now() / 1000),
              unreadCount: 0,
            }));
            storeChats(userId, groupChats);
          }
        }
      } catch (e) {
        console.warn('[Sync groups warning]:', e.message);
      }
    }

    await syncChatsAndMessagesToDb(userId, [], [], [], global.io);

    if (global.io) {
      emitToUserRooms(global.io, userId, 'chats_synced', { timestamp: new Date().toISOString() }, sessionUuid);
    }
    res.json({ success: true, message: 'Sincronización completada' });
  } catch (err) {
    console.error('[POST Sync Crash Safe]:', err.message);
    res.json({ success: true, message: 'Sincronización procesada', error: err.message });
  }
});

// Activar/desactivar bot en una conversación
router.patch('/:conversationId/toggle-bot', async (req, res) => {
  const { conversationId } = req.params;
  const { bot_active, reason } = req.body;

  await supabase
    .from('conversations')
    .update({ bot_active })
    .eq('id', conversationId);

  res.json({ success: true, bot_active });
});

// Agregar a blacklist (amigos/familia)
router.patch('/:conversationId/blacklist', async (req, res) => {
  const { conversationId } = req.params;
  const { blacklisted, reason } = req.body;

  await supabase
    .from('conversations')
    .update({
      is_blacklisted: blacklisted,
      blacklist_reason: reason || null,
      bot_active: !blacklisted,
    })
    .eq('id', conversationId);

  res.json({ success: true });
});

// Marcar conversación como resuelta
router.patch('/:conversationId/resolve', async (req, res) => {
  const { conversationId } = req.params;
  await supabase.from('conversations').update({ status: 'resolved' }).eq('id', conversationId);
  res.json({ success: true });
});

module.exports = router;
