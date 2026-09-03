const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { createSession, disconnectSession, sendMessage, getSession } = require('../whatsapp/sessionManager');

// Iniciar sesión (genera QR con Baileys)
router.post('/start', async (req, res) => {
  const { userId, force } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId es requerido' });
  }

  let businessId = null;
  let sessionId = userId;

  try {
    const { getValidUserId } = require('../whatsapp/sessionManager');
    const validUserId = getValidUserId(userId);
    const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    // 0. Verificar que el usuario tenga suscripción paga o prueba con tarjeta activa (si no es admin)
    if (validUserId && isUuid(validUserId)) {
      const { data: u } = await supabase
        .from('users')
        .select('id, is_admin, status, subscription_status, trial_ends_at, paid_until')
        .eq('id', validUserId)
        .maybeSingle();

      if (u && !u.is_admin) {
        const now = new Date();
        const isTrialActive = u.subscription_status === 'trialing' && u.trial_ends_at && new Date(u.trial_ends_at) > now;
        const isPaidActive = (u.subscription_status === 'active' || u.status === 'active') && (!u.paid_until || new Date(u.paid_until) > now);

        if (u.status === 'paused' || (!isTrialActive && !isPaidActive)) {
          return res.status(403).json({
            success: false,
            error: 'Debes registrar tu tarjeta para activar los 7 días de prueba gratis o tener una suscripción activa para conectar WhatsApp.',
            requires_subscription: true,
          });
        }
      }
    }

    // 1. Obtener el business_id del usuario si existe
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', validUserId)
      .maybeSingle();

    businessId = business?.id || null;

    // 2. Garantizar que el registro de sesión exista en DB ANTES de arrancar Baileys
    // (crítico: messaging-history.set se dispara al conectar y necesita el sessionUuid ya creado)
    try {
      const { data: existingSession } = await supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('user_id', validUserId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingSession && existingSession.length > 0) {
        // Actualizar estado a connecting
        await supabase.from('whatsapp_sessions').update({ status: 'connecting', qr_code: null }).eq('id', existingSession[0].id);
        sessionId = existingSession[0].id;
      } else {
        // Crear nuevo registro
        const { data: newSession } = await supabase
          .from('whatsapp_sessions')
          .insert({ user_id: validUserId, status: 'connecting' })
          .select('id')
          .limit(1);
        if (newSession && newSession[0]) sessionId = newSession[0].id;
      }
    } catch (dbErr) {
      console.warn('DB session upsert aviso (continuando con Baileys):', dbErr.message);
    }

    // 2.5 Si ya hay un QR activo o sesión conectada y no se forzó nuevo QR, responder inmediatamente
    const active = getSession(userId) || getSession(validUserId);
    if (!force && active) {
      if (active.status === 'qr_ready' && active.qr) {
        console.log(`[Sessions API] Reutilizando QR existente para ${validUserId}`);
        return res.json({
          success: true,
          sessionId,
          status: 'qr_ready',
          qr: active.qr,
          phone: null
        });
      }
      if (active.status === 'connected') {
        return res.json({
          success: true,
          sessionId,
          status: 'connected',
          qr: null,
          phone: active.phone || null
        });
      }
    }

    // 3. Iniciar sesión de Baileys (solo forzar borrado si force es explícito)
    const forceClean = Boolean(force);

    createSession(validUserId, businessId, global.io, forceClean).catch(err => {
      console.error('Error en Baileys createSession:', err);
    });

    // 4. Esperar hasta 5 segundos a que Baileys genere el QR en RAM para retornos ultrarrápidos
    let qrReady = null;
    let currentStatus = 'connecting';
    let phoneNum = null;

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      const currentActive = getSession(userId) || getSession(validUserId);
      if (currentActive?.qr) {
        qrReady = currentActive.qr;
        currentStatus = 'qr_ready';
        break;
      }
      if (currentActive?.status === 'connected') {
        currentStatus = 'connected';
        phoneNum = currentActive.phone;
        break;
      }
    }

    return res.json({
      success: true,
      sessionId,
      status: currentStatus,
      qr: qrReady,
      phone: phoneNum
    });
  } catch (err) {
    console.error('Error iniciando sesión:', err);
    createSession(userId, businessId, global.io, Boolean(force)).catch(e => console.error('Baileys fallback err:', e));
    return res.json({ success: true, sessionId: userId, status: 'connecting', qr: null });
  }
});

// Estado de la sesión
router.get('/status/:userId', async (req, res) => {
  const { userId } = req.params;
  const { getSession, getSessionUuid, isExplicitlyDisconnected, getValidUserId } = require('../whatsapp/sessionManager');

  try {
    const validUserId = getValidUserId(userId);
    const active = getSession(userId) || getSession(validUserId);

    const { data: dbSession } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('user_id', validUserId)
      .maybeSingle();

    // Si el usuario fue desconectado manualmente y no hay sesión activa en RAM
    if (isExplicitlyDisconnected(validUserId) && (!active || active.status === 'disconnected')) {
      const sessionUuid = await getSessionUuid(validUserId);
      return res.json({
        success: true,
        session: {
          id: sessionUuid,
          user_id: validUserId,
          status: 'disconnected',
          phone_number: null,
          qr_code: null,
          bot_enabled: dbSession?.bot_enabled ?? false,
        }
      });
    }

    // Si la memoria RAM tiene sesión activa (Socket / QR), RAM MANDA
    if (active) {
      const finalStatus = active.status || (active.sock ? 'connecting' : 'disconnected');
      const isConn = finalStatus === 'connected';
      const finalQr = isConn ? null : (active.qr || (finalStatus === 'qr_ready' ? dbSession?.qr_code : null));
      const finalPhone = isConn ? (active.phone || dbSession?.phone_number || null) : null;

      return res.json({
        success: true,
        session: {
          ...(dbSession || {}),
          id: dbSession?.id || (await getSessionUuid(validUserId)),
          user_id: validUserId,
          status: finalStatus,
          qr_code: finalQr,
          phone_number: finalPhone,
          bot_enabled: active.bot_enabled !== undefined ? active.bot_enabled : (dbSession?.bot_enabled ?? false),
        }
      });
    }

    // Si no está en RAM pero sí en DB
    if (dbSession) {
      const isConn = dbSession.status === 'connected';
      if (isConn && !active && !isExplicitlyDisconnected(validUserId)) {
        // Auto-restaurar sesión Baileys en segundo plano si estaba conectada en DB y no fue desconectada manualmente
        createSession(validUserId, dbSession.business_id, global.io).catch(() => {});
      }
      return res.json({
        success: true,
        session: {
          ...dbSession,
          status: dbSession.status || 'disconnected',
          phone_number: dbSession.phone_number || null,
          qr_code: dbSession.status === 'qr_ready' ? dbSession.qr_code : null,
          bot_enabled: dbSession.bot_enabled ?? false,
        }
      });
    }

    const sessionUuid = await getSessionUuid(validUserId);
    res.json({ success: true, session: { id: sessionUuid, status: 'disconnected', user_id: validUserId, phone_number: null, qr_code: null } });
  } catch (err) {
    res.json({ success: true, session: { status: 'disconnected', user_id: userId, phone_number: null, qr_code: null } });
  }
});

// Obtener estado del Bot Global
router.get('/global-bot/:userId', async (req, res) => {
  const { userId } = req.params;
  const { getGlobalBotStatus } = require('../whatsapp/sessionManager');
  try {
    const bot_enabled = await getGlobalBotStatus(userId);
    res.json({ success: true, bot_enabled });
  } catch (e) {
    res.json({ success: true, bot_enabled: false });
  }
});

// Cambiar estado del Bot Global (Activar / Pausar)
router.patch('/global-bot/:userId', async (req, res) => {
  const { userId } = req.params;
  const { bot_enabled } = req.body;
  const { setGlobalBotStatus } = require('../whatsapp/sessionManager');

  try {
    const updatedStatus = await setGlobalBotStatus(userId, bot_enabled, global.io);
    res.json({ success: true, bot_enabled: updatedStatus });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
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
  const { userId, sessionId, phone, message, conversationId } = req.body;
  const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  try {
    const { getSessionUuid, getValidUserId, sendMessage: sendBaileysMessage } = require('../whatsapp/sessionManager');
    const targetUserId = userId || sessionId || 'admin';
    const validUserId = getValidUserId(targetUserId);
    const rawPhone = (phone || '').trim();

    if (!rawPhone) {
      return res.status(400).json({ success: false, error: 'El número de teléfono es requerido' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío' });
    }

    // 1. PASO CLAVE: Transmitir a WhatsApp vía Baileys socket primero
    await sendBaileysMessage(targetUserId, rawPhone, message);

    // 2. PASO SECUNDARIO: Persistencia en base de datos (si la BD pestañea, no bloquea la confirmación al usuario)
    let targetConvId = isUuid(conversationId) ? conversationId : null;
    const cleanDigits = rawPhone.replace(/[^0-9]/g, '');

    try {
      if (!targetConvId && cleanDigits) {
        const { resolvePhoneAndJid } = require('../whatsapp/sessionManager');
        const resolved = resolvePhoneAndJid(rawPhone);
        const resolvedPhone = resolved.phone || cleanDigits;
        const sessionUuid = await getSessionUuid(validUserId);

        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_phone', resolvedPhone)
          .limit(1);

        const existingRow = existing && existing[0];
        if (existingRow?.id) {
          targetConvId = existingRow.id;
        } else {
          const { data: newConv } = await supabase
            .from('conversations')
            .insert({
              session_id: sessionUuid,
              contact_phone: resolvedPhone,
              contact_name: resolvedPhone,
              bot_active: true,
              is_blacklisted: false,
              last_message_at: new Date().toISOString(),
              unread_count: 0,
              status: 'open',
            })
            .select('id')
            .limit(1);
          const newRow = newConv && newConv[0];
          targetConvId = newRow?.id || null;
        }
      }

      if (targetConvId) {
        await supabase.from('conversations').update({
          last_message_at: new Date().toISOString(),
        }).eq('id', targetConvId);

        await supabase.from('messages').insert({
          conversation_id: targetConvId,
          content: message,
          direction: 'outbound',
          sent_by: 'human',
          timestamp: new Date().toISOString(),
        });

        if (global.io) {
          const { emitToUserRooms } = require('../whatsapp/sessionManager');
          const sessionUuid = await getSessionUuid(validUserId);
          const msgObj = { id: Date.now().toString(), content: message, direction: 'outbound', sent_by: 'human', timestamp: new Date().toISOString() };
          emitToUserRooms(global.io, validUserId, 'new_message', {
            conversationId: targetConvId,
            contactPhone: cleanDigits,
            message: msgObj,
          }, sessionUuid);
          emitToUserRooms(global.io, validUserId, 'conversation_updated', {
            conversationId: targetConvId, contactPhone: cleanDigits, lastMessage: message, timestamp: new Date().toISOString(),
          }, sessionUuid);
        }
      }
    } catch (dbErr) {
      console.warn('[Send DB Persist Warning]:', dbErr.message);
    }

    return res.json({ success: true, conversationId: targetConvId, message: 'Mensaje enviado correctamente' });
  } catch (err) {
    console.error('[Send Message Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Error al enviar mensaje por WhatsApp' });
  }
});

module.exports = router;
