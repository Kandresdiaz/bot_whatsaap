const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { createSession, disconnectSession, sendMessage } = require('../whatsapp/sessionManager');

// Iniciar sesión (genera QR con Baileys)
router.post('/start', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId es requerido' });
  }

  let businessId = null;
  let sessionId = userId;

  try {
    // 1. Obtener el business_id del usuario si existe
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    businessId = business?.id || null;

    // 2. Intentar guardar o actualizar sesión en DB sin romper si falla
    try {
      const { data: session } = await supabase
        .from('whatsapp_sessions')
        .upsert({ user_id: userId, business_id: businessId, status: 'connecting' }, { onConflict: 'user_id' })
        .select()
        .maybeSingle();

      if (session?.id) sessionId = session.id;
    } catch (dbErr) {
      console.warn('DB upsert aviso (continuando con Baileys):', dbErr.message);
    }

    // 3. Iniciar sesión de Baileys siempre
    createSession(userId, businessId, global.io).catch(err => {
      console.error('Error en Baileys createSession:', err);
    });

    return res.json({ success: true, sessionId });
  } catch (err) {
    console.error('Error iniciando sesión:', err);
    // Aunque haya un error de lectura, iniciamos Baileys de todas formas
    createSession(userId, businessId, global.io).catch(e => console.error('Baileys fallback err:', e));
    return res.json({ success: true, sessionId: userId });
  }
});

// Estado de la sesión
router.get('/status/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    res.json({ success: true, session: session || null });
  } catch (err) {
    res.json({ success: false, session: null });
  }
});

// Desconectar sesión
router.post('/stop', async (req, res) => {
  const { userId } = req.body;
  if (userId) {
    try {
      await disconnectSession(userId);
    } catch (e) {
      console.error('Error desconectando sesión:', e);
    }
  }
  res.json({ success: true });
});

// Enviar mensaje manual (intervención del dueño)
router.post('/send', async (req, res) => {
  const { userId, phone, message, conversationId } = req.body;

  try {
    await sendMessage(userId, phone, message);

    if (conversationId) {
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
