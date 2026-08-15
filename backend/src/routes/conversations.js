const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Listar conversaciones de una sesión o usuario
router.get('/:sessionId', async (req, res) => {
  try {
    let { sessionId } = req.params;
    const { search, status } = req.query;

    const { getSessionUuid, getValidUserId, syncChatsAndMessagesToDb } = require('../whatsapp/sessionManager');
    const validUserId = getValidUserId(sessionId);
    const sessionUuid = await getSessionUuid(sessionId);

    const sessionIdsSet = new Set();
    if (sessionUuid) sessionIdsSet.add(sessionUuid);

    try {
      const { data: userSessions } = await supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('user_id', validUserId);

      if (Array.isArray(userSessions)) {
        userSessions.forEach(s => sessionIdsSet.add(s.id));
      }
    } catch (_) {}

    const sessionList = Array.from(sessionIdsSet);

    let query = supabase
      .from('conversations')
      .select('*');

    if (sessionList.length > 0) {
      query = query.or(`session_id.in.(${sessionList.join(',')}),session_id.is.null`);
    }

    query = query.order('last_message_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('contact_name', `%${search}%`);

    let { data, error } = await query;
    if (error) console.error('[Conversations GET Error]:', error?.message);

    // Si no hay conversaciones específicas, forzar sincronización y traer todas las conversaciones de la tabla
    if (!data || data.length === 0) {
      try {
        await syncChatsAndMessagesToDb(sessionId, [], [], [], global.io);
      } catch (_) {}
      const { data: allConvs } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(200);
      data = allConvs || [];
    }

    res.json({ success: true, conversations: data || [] });
  } catch (err) {
    console.error('[GET Conversations Crash Safe]:', err.message);
    res.json({ success: true, conversations: [] });
  }
});

// Sincronizar chats de la sesión activa
router.post('/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { syncChatsAndMessagesToDb, emitToUserRooms, getSessionUuid } = require('../whatsapp/sessionManager');

    const sessionUuid = await getSessionUuid(userId);
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
