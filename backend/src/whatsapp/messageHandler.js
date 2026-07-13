const { supabase } = require('../db/supabase');
const { askGroq } = require('../ai/groq');
const { notifyLead } = require('./notifier');
const { handleAppointmentFlow } = require('./appointmentFlow');

// ─── ANTI-BAN: delays aleatorios ─────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = () => sleep(Math.floor(Math.random() * 2000) + 1000);

// Rate limit: máx 20 mensajes/hora por contacto
const messageCount = new Map();
const isRateLimited = (phone) => {
  const key = `${phone}_${Math.floor(Date.now() / 3600000)}`;
  const count = messageCount.get(key) || 0;
  if (count >= 20) return true;
  messageCount.set(key, count + 1);
  return false;
};

// ─── Extraer texto del mensaje Baileys ───────────────────────────────────────
const extractText = (msg) => {
  const m = msg.message;
  if (!m) return '';
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || '';
};

// ─── Enviar mensaje con Baileys ──────────────────────────────────────────────
const sendText = async (sock, jid, text) => {
  await sock.sendMessage(jid, { text });
};

// ─── Handler principal ───────────────────────────────────────────────────────
const handleIncomingMessage = async (sock, msg, userId, businessId) => {
  const jid = msg.key.remoteJid || '';
  const isGroup = jid.endsWith('@g.us');
  if (isGroup) return;

  const contactPhone = jid.replace('@s.whatsapp.net', '');
  const contactName = msg.pushName || contactPhone;
  const text = extractText(msg).trim();
  if (!text) return;

  // 1. Buscar o crear conversación
  let { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('contact_phone', contactPhone)
    .single();

  if (!conversation) {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        contact_phone: contactPhone,
        contact_name: contactName,
        bot_active: true,
        is_blacklisted: false,
      })
      .select()
      .single();
    conversation = newConv;
  } else {
    await supabase.from('conversations').update({
      contact_name: contactName,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
    }).eq('id', conversation.id);
  }

  // 2. Guardar mensaje entrante
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    content: text,
    direction: 'inbound',
    sent_by: 'human',
    timestamp: new Date().toISOString(),
  });

  // Emitir tiempo real al dashboard
  if (global.io) {
    global.io.to(`user_${userId}`).emit('new_message', {
      conversationId: conversation.id,
      message: { content: text, direction: 'inbound', sent_by: 'human', timestamp: new Date() },
    });
    global.io.to(`user_${userId}`).emit('conversation_updated', {
      conversationId: conversation.id, contactName, lastMessage: text,
    });
  }

  // 3. Bot desactivado o blacklist → solo notificar al dueño
  if (conversation.is_blacklisted || !conversation.bot_active) {
    if (global.io) global.io.to(`user_${userId}`).emit('manual_needed', {
      conversationId: conversation.id, contactName, message: text,
    });
    return;
  }

  // 4. Rate limit anti-spam
  if (isRateLimited(contactPhone)) return;

  // 5. Obtener negocio
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (!business) return;

  // 6. Verificar horario
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: business.timezone || 'America/Bogota' }));
  const hour = local.getHours();
  const day = local.getDay();
  const activeDays = business.active_days || [1,2,3,4,5];
  const start = parseInt(business.active_hours_start?.split(':')[0] || '8');
  const end = parseInt(business.active_hours_end?.split(':')[0] || '18');

  if (!activeDays.includes(day) || hour < start || hour >= end) {
    await randomDelay();
    await sendText(sock, jid, business.away_msg || 'Gracias por escribirnos. Te respondemos en horario de atención 🙏');
    return;
  }

  // 7. Flujo de citas primero
  const tookOver = await handleAppointmentFlow(sock, msg, conversation, business, jid);
  if (tookOver) return;

  // 8. Knowledge base
  const { data: knowledge } = await supabase
    .from('knowledge_base')
    .select('title, content, type, file_url')
    .eq('business_id', business.id)
    .eq('is_active', true);

  // 9. Historial reciente
  const { data: history } = await supabase
    .from('messages')
    .select('content, direction')
    .eq('conversation_id', conversation.id)
    .order('timestamp', { ascending: false })
    .limit(10);

  // 10. IA Groq
  const { reply, isLeadHot, tokensUsed, imageName } = await askGroq(
    text, business, knowledge || [], (history || []).reverse()
  );

  // 11. Lead caliente → notificar
  if (isLeadHot) {
    await supabase.from('conversations').update({ is_lead: true }).eq('id', conversation.id);
    await notifyLead(business, contactPhone, contactName, text, conversation.id, sock, jid);
  }

  // 12. Anti-ban delay
  await randomDelay();

  // 13. Enviar imagen si el bot la detectó
  if (imageName) {
    const img = (knowledge || []).find(k =>
      k.type === 'image' && k.title.toLowerCase().includes(imageName.toLowerCase()) && k.file_url
    );
    if (img?.file_url) {
      try {
        await sock.sendMessage(jid, {
          image: { url: img.file_url },
          caption: img.content,
        });
        await sleep(800);
      } catch (e) { console.error('Error enviando imagen:', e.message); }
    }
  }

  // 14. Enviar respuesta texto
  await sendText(sock, jid, reply);

  // Guardar respuesta del bot
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    content: reply,
    direction: 'outbound',
    sent_by: 'bot',
    timestamp: new Date().toISOString(),
    groq_tokens_used: tokensUsed,
  });

  if (global.io) {
    global.io.to(`user_${userId}`).emit('new_message', {
      conversationId: conversation.id,
      message: { content: reply, direction: 'outbound', sent_by: 'bot', timestamp: new Date() },
    });
  }
};

module.exports = { handleIncomingMessage };
