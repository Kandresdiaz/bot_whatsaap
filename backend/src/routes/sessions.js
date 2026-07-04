const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { SessionManager } = require('../whatsapp/sessionManager');

// Iniciar sesión (genera QR)
router.post('/start', async (req, res) => {
  const { userId } = req.body;

  try {
    // Crear o buscar sesión en DB
    let { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!session) {
      const { data: newSession } = await supabase
        .from('whatsapp_sessions')
        .insert({ user_id: userId, status: 'connecting' })
        .select()
        .single();
      session = newSession;
    }

    // Iniciar cliente de WhatsApp
    await SessionManager.startSession(session.id, userId);

    res.json({ success: true, sessionId: session.id });
  } catch (err) {
    console.error('Error iniciando sesión:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Estado de la sesión
router.get('/status/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('user_id', userId)
    .single();

  res.json({ success: true, session });
});

// Desconectar sesión
router.post('/stop', async (req, res) => {
  const { sessionId } = req.body;
  await SessionManager.stopSession(sessionId);
  res.json({ success: true });
});

// Enviar mensaje manual (intervención del dueño)
router.post('/send', async (req, res) => {
  const { sessionId, phone, message, conversationId } = req.body;

  const result = await SessionManager.sendMessage(sessionId, phone, message);

  if (result.success && conversationId) {
    // Guardar en DB como mensaje humano
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      content: message,
      direction: 'outbound',
      sent_by: 'human',
      timestamp: new Date().toISOString(),
    });
  }

  res.json(result);
});

module.exports = router;
