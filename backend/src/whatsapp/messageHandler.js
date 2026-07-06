const { supabase } = require('../db/supabase');
const { askGroq } = require('../ai/groq');
const { notifyLead } = require('./notifier');

// ─── ANTI-BAN: delays aleatorios entre respuestas ───────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = () => sleep(Math.floor(Math.random() * 2000) + 1000); // 1-3 seg

// Contador simple en memoria para limitar mensajes por hora por contacto
const messageCount = new Map();
const MAX_MESSAGES_PER_HOUR = 20;

const isRateLimited = (contactPhone) => {
  const key = `${contactPhone}_${Math.floor(Date.now() / 3600000)}`; // key por hora
  const count = messageCount.get(key) || 0;
  if (count >= MAX_MESSAGES_PER_HOUR) return true;
  messageCount.set(key, count + 1);
  return false;
};
// ─────────────────────────────────────────────────────────────────────────────

const handleIncomingMessage = async (client, msg, sessionId, userId) => {
  const contactPhone = msg.from.replace('@c.us', '');
  const contactName = msg._data?.notifyName || contactPhone;
  const text = msg.body?.trim() || '';

  if (!text) return;
  if (msg.from.includes('@g.us')) return; // ignorar grupos

  // 1. Buscar o crear conversación
  let { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('session_id', sessionId)
    .eq('contact_phone', contactPhone)
    .single();

  if (!conversation) {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        session_id: sessionId,
        contact_phone: contactPhone,
        contact_name: contactName,
        bot_active: true,
        is_blacklisted: false,
      })
      .select()
      .single();
    conversation = newConv;
  } else {
    await supabase
      .from('conversations')
      .update({
        contact_name: contactName,
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1,
      })
      .eq('id', conversation.id);
  }

  // 2. Guardar mensaje entrante
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    content: text,
    direction: 'inbound',
    sent_by: 'human',
    timestamp: new Date().toISOString(),
  });

  // Emitir al frontend en tiempo real
  if (global.io) {
    global.io.to(`session_${sessionId}`).emit('new_message', {
      conversationId: conversation.id,
      message: { content: text, direction: 'inbound', sent_by: 'human', timestamp: new Date() },
    });
    // Actualizar lista de conversaciones
    global.io.to(`session_${sessionId}`).emit('conversation_updated', {
      conversationId: conversation.id,
      contactName,
      lastMessage: text,
      unreadCount: (conversation.unread_count || 0) + 1,
    });
  }

  // 3. Si está en blacklist o bot desactivado → solo notificar al dueño sin responder
  if (conversation.is_blacklisted || !conversation.bot_active) {
    console.log(`Bot desactivado para ${contactPhone}`);
    if (global.io) {
      global.io.to(`session_${sessionId}`).emit('manual_needed', {
        conversationId: conversation.id,
        contactName,
        message: text,
      });
    }
    return;
  }

  // 4. Anti-ban: rate limit
  if (isRateLimited(contactPhone)) {
    console.log(`Rate limit alcanzado para ${contactPhone}`);
    return;
  }

  // 5. Obtener business
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!business) return;

  // 6. Verificar horario
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: business.timezone || 'America/Bogota' }));
  const localHour = localTime.getHours();
  const dayOfWeek = localTime.getDay();
  const activeDays = business.active_days || [1, 2, 3, 4, 5];
  const startHour = parseInt(business.active_hours_start?.split(':')[0] || '8');
  const endHour = parseInt(business.active_hours_end?.split(':')[0] || '18');

  const isWithinHours = localHour >= startHour && localHour < endHour;
  const isActiveDay = activeDays.includes(dayOfWeek);

  if (!isWithinHours || !isActiveDay) {
    await randomDelay(); // anti-ban
    await sendBotMessage(client, msg.from, business.away_msg || 'Gracias por escribirnos. Te respondemos en horario de atención 🙏', conversation.id, sessionId);
    return;
  }

  // 7. Knowledge base
  const { data: knowledge } = await supabase
    .from('knowledge_base')
    .select('title, content, type')
    .eq('business_id', business.id)
    .eq('is_active', true);

  // 8. Historial (últimos 10 mensajes para contexto)
  const { data: history } = await supabase
    .from('messages')
    .select('content, direction, sent_by')
    .eq('conversation_id', conversation.id)
    .order('timestamp', { ascending: false })
    .limit(10);

  const chatHistory = (history || []).reverse();

  // 9. IA con Groq
  const { reply, isLeadHot, tokensUsed } = await askGroq(text, business, knowledge || [], chatHistory);

  // 10. Lead caliente → notificar
  if (isLeadHot) {
    await supabase.from('conversations').update({ is_lead: true }).eq('id', conversation.id);
    await notifyLead(business, contactPhone, contactName, text, conversation.id, client);
  }

  // 11. Anti-ban: delay antes de responder (simula humano escribiendo)
  await randomDelay();

  // 12. Enviar respuesta
  await sendBotMessage(client, msg.from, reply, conversation.id, sessionId, tokensUsed);
};

const sendBotMessage = async (client, to, text, conversationId, sessionId, tokensUsed = 0) => {
  try {
    await client.sendMessage(to, text);

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      content: text,
      direction: 'outbound',
      sent_by: 'bot',
      timestamp: new Date().toISOString(),
      groq_tokens_used: tokensUsed,
    });

    if (global.io) {
      global.io.to(`session_${sessionId}`).emit('new_message', {
        conversationId,
        message: { content: text, direction: 'outbound', sent_by: 'bot', timestamp: new Date() },
      });
    }
  } catch (err) {
    console.error('Error enviando mensaje:', err);
  }
};

module.exports = { handleIncomingMessage };
