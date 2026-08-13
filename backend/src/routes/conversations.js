const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Listar conversaciones de una sesión o usuario
router.get('/:sessionId', async (req, res) => {
  let { sessionId } = req.params;
  const { search, status } = req.query;

  const { getSessionUuid } = require('../whatsapp/sessionManager');
  const sessionUuid = await getSessionUuid(sessionId);

  if (!sessionUuid) {
    return res.json({ success: true, conversations: [] });
  }

  let query = supabase
    .from('conversations')
    .select('*')
    .eq('session_id', sessionUuid)
    .order('last_message_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('contact_name', `%${search}%`);

  const { data, error } = await query;
  if (error) console.error('[Conversations GET Error]:', error?.message);
  res.json({ success: true, conversations: data || [] });
});

// Sincronizar chats de la sesión activa
router.post('/sync/:userId', async (req, res) => {
  const { userId } = req.params;
  const { getSession } = require('../whatsapp/sessionManager');
  const session = getSession(userId);

  if (!session || !session.sock) {
    return res.status(400).json({ success: false, error: 'Sesión de WhatsApp no activa' });
  }

  try {
    if (global.io) {
      global.io.to(`user_${userId}`).emit('chats_synced', { timestamp: new Date().toISOString() });
    }
    res.json({ success: true, message: 'Sincronización disparada correctamente' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
