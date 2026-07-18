const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { createSession, disconnectSession, sendMessage, getSession } = require('../whatsapp/sessionManager');

// Iniciar sesión (genera QR con Baileys)
router.post('/start', async (req, res) => {
  const { userId } = req.body;

  try {
    // 1. Obtener el business_id del usuario
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', userId)
      .single();

    const businessId = business?.id || null;

    // 2. Crear o buscar sesión en DB
    let { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!session) {
      const { data: newSession } = await supabase
        .from('whatsapp_sessions')
        .insert({ user_id: userId, business_id: businessId, status: 'connecting' })
        .select()
        .single();
      session = newSession;
    }

    // 3. Iniciar sesión de Baileys asíncronamente
    createSession(userId, businessId, global.io).catch(err => {
      console.error('Error en Baileys createSession:', err);
    });

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
  const { userId } = req.body;
  if (userId) {
    await disconnectSession(userId);
  }
  res.json({ success: true });
});

// Enviar mensaje manual (intervención del dueño)
router.post('/send', async (req, res) => {
  const { userId, phone, message, conversationId } = req.body;

  try {
    await sendMessage(userId, phone, message);

    if (conversationId) {
      // Guardar en DB como mensaje humano
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        content: message,
        direction: 'outbound',
        sent_by: 'human',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
