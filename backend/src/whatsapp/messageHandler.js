const { supabase } = require('../db/supabase');
const { askGroq } = require('../ai/groq');
const { notifyLead } = require('./notifier');

const handleIncomingMessage = async (client, msg, sessionId, userId) => {
  const contactPhone = msg.from.replace('@c.us', '');
  const contactName = msg._data?.notifyName || contactPhone;
  const text = msg.body?.trim() || '';

  if (!text) return;

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
    // Actualizar nombre y timestamp
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

  // Emitir mensaje al frontend en tiempo real
  if (global.io) {
    global.io.to(`session_${sessionId}`).emit('new_message', {
      conversationId: conversation.id,
      message: { content: text, direction: 'inbound', sent_by: 'human', timestamp: new Date() },
    });
  }

  // 3. Si la conversación está en blacklist o bot desactivado, no responder
  if (conversation.is_blacklisted || !conversation.bot_active) {
    console.log(`Bot desactivado para ${contactPhone}, mensaje ignorado.`);
    return;
  }

  // 4. Obtener business del usuario
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!business) return;

  // 5. Verificar horario de atención
  const now = new Date();
  const localHour = new Date(now.toLocaleString('en-US', { timeZone: business.timezone })).getHours();
  const dayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: business.timezone })).getDay();
  const activeDays = business.active_days || [1, 2, 3, 4, 5];
  const startHour = parseInt(business.active_hours_start?.split(':')[0] || '8');
  const endHour = parseInt(business.active_hours_end?.split(':')[0] || '18');

  const isWithinHours = localHour >= startHour && localHour < endHour;
  const isActiveDay = activeDays.includes(dayOfWeek);

  if (!isWithinHours || !isActiveDay) {
    const awayMsg = business.away_msg || 'Gracias por escribirnos. Te respondemos en horario de atención.';
    await sendBotMessage(client, msg.from, awayMsg, conversation.id, sessionId);
    return;
  }

  // 6. Obtener knowledge base del negocio
  const { data: knowledge } = await supabase
    .from('knowledge_base')
    .select('title, content, type')
    .eq('business_id', business.id)
    .eq('is_active', true);

  // 7. Obtener historial de conversación (últimos 10 mensajes)
  const { data: history } = await supabase
    .from('messages')
    .select('content, direction, sent_by')
    .eq('conversation_id', conversation.id)
    .order('timestamp', { ascending: false })
    .limit(10);

  const chatHistory = (history || []).reverse();

  // 8. Generar respuesta con Groq
  const { reply, isLeadHot, tokensUsed } = await askGroq(text, business, knowledge || [], chatHistory);

  // 9. Si detecta lead caliente, notificar
  if (isLeadHot) {
    await supabase.from('conversations').update({ is_lead: true }).eq('id', conversation.id);
    await notifyLead(business, contactPhone, contactName, text, conversation.id, client, sessionId);
  }

  // 10. Enviar respuesta del bot
  await sendBotMessage(client, msg.from, reply, conversation.id, sessionId, tokensUsed);
};

const sendBotMessage = async (client, to, text, conversationId, sessionId, tokensUsed = 0) => {
  try {
    await client.sendMessage(to, text);

    // Guardar en DB
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      content: text,
      direction: 'outbound',
      sent_by: 'bot',
      timestamp: new Date().toISOString(),
      groq_tokens_used: tokensUsed,
    });

    // Emitir al frontend
    if (global.io) {
      global.io.to(`session_${sessionId}`).emit('new_message', {
        conversationId,
        message: { content: text, direction: 'outbound', sent_by: 'bot', timestamp: new Date() },
      });
    }
  } catch (err) {
    console.error('Error enviando mensaje del bot:', err);
  }
};

module.exports = { handleIncomingMessage };
