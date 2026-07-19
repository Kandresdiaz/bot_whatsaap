const { supabase } = require('../db/supabase');
const { askGroq } = require('../ai/groq');
const { notifyLead } = require('./notifier');
const { handleAppointmentFlow } = require('./appointmentFlow');

// ─── ANTI-BAN: delays aleatorios humanizados ──────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = () => sleep(Math.floor(Math.random() * 2000) + 800);

// Rate limit: máx 20 mensajes/hora por contacto
const messageCount = new Map();
const isRateLimited = (phone) => {
  const key = `${phone}_${Math.floor(Date.now() / 3600000)}`;
  const count = messageCount.get(key) || 0;
  if (count >= 20) return true;
  messageCount.set(key, count + 1);
  return false;
};

// ─── Extraer texto del mensaje Baileys ────────────────────────────────────────
const extractText = (msg) => {
  const m = msg.message;
  if (!m) return '';
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.buttonsResponseMessage?.selectedDisplayText
    || m.listResponseMessage?.title
    || '';
};

// ─── Enviar mensaje con Baileys ───────────────────────────────────────────────
const sendText = async (sock, jid, text) => {
  try {
    await sock.sendMessage(jid, { text });
  } catch (e) {
    console.error('[MSG] Error enviando texto:', e.message);
  }
};

// ─── DB: Safe query helpers ───────────────────────────────────────────────────
const safeQuery = async (fn) => {
  try { return await fn(); } catch (e) {
    console.error('[DB] Query error:', e.message);
    return { data: null, error: e };
  }
};

// ─── Handler principal ────────────────────────────────────────────────────────
const handleIncomingMessage = async (sock, msg, userId, businessId) => {
  const jid = msg.key.remoteJid || '';
  const isGroup = jid.endsWith('@g.us');
  if (isGroup) return;

  const contactPhone = jid.replace('@s.whatsapp.net', '');
  const contactName = msg.pushName || contactPhone;
  const text = extractText(msg).trim();
  if (!text) return;

  console.log(`[MSG] ${contactPhone} → ${userId}: "${text.slice(0, 60)}"`);

  // ── 1. Buscar o crear conversación ───────────────────────────────────────
  let conversation = null;
  try {
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('contact_phone', contactPhone)
      .maybeSingle();

    if (existing) {
      conversation = existing;
      await supabase.from('conversations').update({
        contact_name: contactName,
        last_message_at: new Date().toISOString(),
        unread_count: (existing.unread_count || 0) + 1,
      }).eq('id', existing.id);
    } else {
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
        .maybeSingle();
      conversation = newConv;
    }
  } catch (e) {
    console.error('[MSG] Error con conversación:', e.message);
    // Continuar con conversación nula — no bloquear la respuesta
  }

  // ── 2. Guardar mensaje entrante ───────────────────────────────────────────
  if (conversation?.id) {
    await safeQuery(() => supabase.from('messages').insert({
      conversation_id: conversation.id,
      content: text,
      direction: 'inbound',
      sent_by: 'human',
      timestamp: new Date().toISOString(),
    }));

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
  }

  // ── 3. Bot desactivado o blacklist ────────────────────────────────────────
  if (conversation?.is_blacklisted || (conversation && !conversation.bot_active)) {
    if (global.io) global.io.to(`user_${userId}`).emit('manual_needed', {
      conversationId: conversation.id, contactName, message: text,
    });
    return;
  }

  // ── 4. Rate limit anti-spam ───────────────────────────────────────────────
  if (isRateLimited(contactPhone)) return;

  // ── 5. Obtener negocio ────────────────────────────────────────────────────
  let business = null;
  try {
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    business = data;
  } catch (e) {
    console.error('[MSG] Error obteniendo negocio:', e.message);
  }

  // Si no hay negocio configurado, responder con mensaje genérico
  if (!business) {
    await randomDelay();
    await sendText(sock, jid, '¡Hola! 👋 Estamos configurando nuestro asistente. Vuelve pronto para recibir atención completa 😊');
    return;
  }

  // ── 6. Verificar horario de atención ──────────────────────────────────────
  try {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: business.timezone || 'America/Bogota' }));
    const hour = local.getHours();
    const day = local.getDay();
    const activeDays = business.active_days || [1, 2, 3, 4, 5];
    const start = parseInt(business.active_hours_start?.split(':')[0] || '8');
    const end = parseInt(business.active_hours_end?.split(':')[0] || '18');

    if (!activeDays.includes(day) || hour < start || hour >= end) {
      await randomDelay();
      await sendText(sock, jid, business.away_msg || 'Gracias por escribirnos 🙏 Te respondemos en nuestro horario de atención.');
      return;
    }
  } catch (e) {
    console.error('[MSG] Error verificando horario:', e.message);
    // Si falla la verificación de horario, continuar de todas formas
  }

  // ── 7. Flujo de citas (si aplica) ─────────────────────────────────────────
  try {
    const tookOver = await handleAppointmentFlow(sock, msg, conversation, business, jid);
    if (tookOver) return;
  } catch (e) {
    console.error('[MSG] Error en appointmentFlow:', e.message);
  }

  // ── 8. Cargar knowledge base completa ─────────────────────────────────────
  let knowledge = [];
  try {
    const { data } = await supabase
      .from('knowledge_base')
      .select('id, title, content, type, file_url')
      .eq('business_id', business.id)
      .eq('is_active', true);
    knowledge = data || [];
  } catch (e) {
    console.error('[MSG] Error cargando knowledge base:', e.message);
  }

  // ── 9. Historial reciente de la conversación ───────────────────────────────
  let history = [];
  if (conversation?.id) {
    try {
      const { data } = await supabase
        .from('messages')
        .select('content, direction')
        .eq('conversation_id', conversation.id)
        .order('timestamp', { ascending: false })
        .limit(10);
      history = (data || []).reverse();
    } catch (e) {
      console.error('[MSG] Error cargando historial:', e.message);
    }
  }

  // ── 10. RAG + Groq: generar respuesta ─────────────────────────────────────
  const { reply, isLeadHot, tokensUsed, imageName, ragChunksUsed } = await askGroq(
    text, business, knowledge, history
  );

  console.log(`[RAG] Chunks usados: ${ragChunksUsed} | Tokens: ${tokensUsed}`);

  // ── 11. Lead caliente → notificar al dueño ────────────────────────────────
  if (isLeadHot && conversation?.id) {
    await safeQuery(() => supabase.from('conversations').update({ is_lead: true }).eq('id', conversation.id));
    try {
      await notifyLead(business, contactPhone, contactName, text, conversation.id, sock, jid);
    } catch (e) {
      console.error('[MSG] Error notificando lead:', e.message);
    }
  }

  // ── 12. Anti-ban delay ─────────────────────────────────────────────────────
  await randomDelay();

  // ── 13. Enviar imagen si el bot la detectó ─────────────────────────────────
  if (imageName) {
    const img = knowledge.find(k =>
      k.type === 'image' &&
      k.title.toLowerCase().includes(imageName.toLowerCase()) &&
      k.file_url
    );
    if (img?.file_url) {
      try {
        await sock.sendMessage(jid, { image: { url: img.file_url }, caption: img.content });
        await sleep(800);
      } catch (e) {
        console.error('[MSG] Error enviando imagen:', e.message);
      }
    }
  }

  // ── 14. Enviar respuesta de texto ──────────────────────────────────────────
  await sendText(sock, jid, reply);

  // ── 15. Guardar respuesta del bot en DB ───────────────────────────────────
  if (conversation?.id) {
    await safeQuery(() => supabase.from('messages').insert({
      conversation_id: conversation.id,
      content: reply,
      direction: 'outbound',
      sent_by: 'bot',
      timestamp: new Date().toISOString(),
      groq_tokens_used: tokensUsed,
    }));

    if (global.io) {
      global.io.to(`user_${userId}`).emit('new_message', {
        conversationId: conversation.id,
        message: { content: reply, direction: 'outbound', sent_by: 'bot', timestamp: new Date() },
      });
    }
  }
};

module.exports = { handleIncomingMessage };
