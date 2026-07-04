const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Listar conversaciones de una sesión
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { search, status } = req.query;

  let query = supabase
    .from('conversations')
    .select('*')
    .eq('session_id', sessionId)
    .order('last_message_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('contact_name', `%${search}%`);

  const { data, error } = await query;
  res.json({ success: true, conversations: data || [] });
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
