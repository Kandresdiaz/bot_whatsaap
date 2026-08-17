const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Listar conversaciones de una sesión o usuario
router.get('/:sessionId', async (req, res) => {
  try {
    let { sessionId } = req.params;
    const { search, status } = req.query;

    const { getSessionUuid, getValidUserId, syncChatsAndMessagesToDb, getSession, createSession } = require('../whatsapp/sessionManager');
    const validUserId = getValidUserId(sessionId);
    const sessionUuid = await getSessionUuid(sessionId);

    // Si no hay sesión activa en RAM, auto-iniciar en segundo plano
    try {
      const activeS = getSession(sessionId) || getSession(validUserId);
      if (!activeS) {
        createSession(validUserId, null, global.io).catch(() => {});
      }
    } catch (_) {}

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
      .order('last_message_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('contact_name', `%${search}%`);

    let { data, error } = await query;
    if (error) console.error('[Conversations GET Error]:', error?.message);

    const dbConvs = data || [];
    const phoneSet = new Set(dbConvs.map(c => c.contact_phone));
    const merged = [...dbConvs];

    // Fusionar chats acumulados en memoria RAM de Baileys
    try {
      const { getUserStore, safeToIsoString } = require('../whatsapp/sessionManager');
      const store = getUserStore(validUserId);

      if (store && store.chats) {
        for (const [key, chat] of store.chats.entries()) {
          if (!chat || !chat.id || chat.id === 'status@broadcast') continue;
          const jid = chat.id;
          const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
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
            last_message_at: safeToIsoString ? safeToIsoString(chat.conversationTimestamp) : new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }
      }

      if (store && store.contacts) {
        for (const [key, c] of store.contacts.entries()) {
          if (!c || !c.id || c.id === 'status@broadcast') continue;
          const jid = c.id;
          const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/[^0-9]/g, '');
          if (!phone || phoneSet.has(phone)) continue;

          const name = c.name || c.notify || c.verifiedName || phone;
          phoneSet.add(phone);
          merged.push({
            id: `ram_c_${phone}`,
            session_id: sessionUuid || validUserId,
            contact_phone: phone,
            contact_name: name,
            bot_active: true,
            is_blacklisted: false,
            is_lead: false,
            unread_count: 0,
            status: 'open',
            last_message_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.warn('[Merge RAM Chats Error]:', e.message);
    }

    merged.sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());

    res.json({ success: true, conversations: merged });
  } catch (err) {
    console.error('[GET Conversations Crash Safe]:', err.message);
    res.json({ success: true, conversations: [] });
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

// Mensajes de una conversación
router.get('/:conversationId/messages', async (req, res) => {
  const { conversationId } = req.params;

  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true });

  // Marcar como leídos
  await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId);

  res.json({ success: true, messages: data || [] });
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
