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
  if (!msg || !msg.message) return '';
  let m = msg.message;
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessageV2Extension) m = m.viewOnceMessageV2Extension.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  if (m.editedMessage) m = m.editedMessage.message?.protocolMessage?.editedMessage || m.editedMessage;
  if (!m) return '';

  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.documentMessage?.caption
    || m.buttonsResponseMessage?.selectedDisplayText
    || m.listResponseMessage?.title
    || m.templateButtonReplyMessage?.selectedId
    || (m.imageMessage ? '[Imagen]' : '')
    || (m.videoMessage ? '[Video]' : '')
    || (m.audioMessage ? '[Audio]' : '')
    || (m.documentMessage ? (m.documentMessage.fileName ? `[Documento: ${m.documentMessage.fileName}]` : '[Documento]') : '')
    || (m.stickerMessage ? '[Sticker]' : '')
    || (m.locationMessage ? '[Ubicación]' : '')
    || (m.contactMessage ? '[Contacto]' : '')
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
  if (!msg || !msg.key) return;

  // ── 0. FILTRO RIGUROSO: Solo chats privados 1 a 1 de usuarios reales ────────
  const jid = msg.key.remoteJid || '';

  // A) Ignorar mensajes enviados por el propio número del usuario/bot
  if (msg.key.fromMe) return;

  // B) Ignorar Grupos de WhatsApp (por JID, participant, o formato)
  const isGroup = jid.endsWith('@g.us')
    || jid.includes('@g.us')
    || Boolean(msg.key.participant)
    || (jid.length > 15 && jid.includes('-'));

  if (isGroup) {
    console.log(`[MSG Filter] 🛑 Ignorando mensaje de grupo: ${jid}`);
    return;
  }

  // C) Ignorar Estados/Historias, Listas de Difusión, Canales (Newsletters), Llamadas y Servicio
  if (
    jid === 'status@broadcast' ||
    jid.endsWith('@broadcast') ||
    jid.endsWith('@newsletter') ||
    jid.endsWith('@call') ||
    msg.broadcast ||
    jid.startsWith('0@') ||
    jid.startsWith('13135550002@')
  ) {
    console.log(`[MSG Filter] 🛑 Ignorando estado/difusión/canal/sistema: ${jid}`);
    return;
  }

  // D) Exigir que sea un JID de usuario individual (@s.whatsapp.net o @lid)
  if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) {
    console.log(`[MSG Filter] 🛑 Ignorando JID no individual: ${jid}`);
    return;
  }

  // E) Ignorar stubs/notificaciones de sistema (llamadas perdidas, notificaciones de grupos, etc.)
  if (msg.messageStubType || msg.stubType) return;

  // F) Ignorar eventos no-texto (reacciones de emojis, ediciones, eliminaciones, encuestas, etc.)
  const rawMsg = msg.message;
  if (!rawMsg) return;
  if (
    rawMsg.reactionMessage ||
    rawMsg.protocolMessage ||
    rawMsg.pollUpdateMessage ||
    rawMsg.pinInChatMessage ||
    rawMsg.keepInChatMessage ||
    rawMsg.callLogMesssage ||
    rawMsg.scheduledCallCreationMessage
  ) {
    return;
  }

  const { resolvePhoneAndJid } = require('./sessionManager');
  const resolved = resolvePhoneAndJid(jid);

  if (resolved.isGroup) {
    console.log(`[MSG Filter] 🛑 Ignorando grupo resuelto: ${jid}`);
    return;
  }

  const contactPhone = resolved.phone;
  if (!contactPhone || contactPhone.includes('-')) return;

  const { enqueueIncomingMessage } = require('../queues/messageQueue');

  return enqueueIncomingMessage(contactPhone, async () => {
    const contactName = msg.pushName || contactPhone;
    const text = extractText(msg).trim();
    if (!text) return;

    console.log(`[MSG] ${contactPhone} (${contactName}) → ${userId}: "${text.slice(0, 60)}"`);

  // ── 1. Buscar o crear conversación (por número de contacto garantizado) ─────
  let conversation = null;
  try {
    const { getSessionUuid } = require('./sessionManager');
    const sessionUuid = await getSessionUuid(userId);

    // 1) Buscar conversación existente por número de teléfono
    const { data: existingConvs } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_phone', contactPhone)
      .order('last_message_at', { ascending: false })
      .limit(1);

    if (existingConvs && existingConvs.length > 0) {
      conversation = existingConvs[0];
      await supabase.from('conversations').update({
        contact_name: contactName,
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1,
      }).eq('id', conversation.id);
    } else {
      // 2) Si no existe conversación previa para este teléfono, insertarla
      const { data: newConv, error: insErr } = await supabase
        .from('conversations')
        .insert({
          session_id: sessionUuid || '00000000-0000-0000-0000-000000000001',
          contact_phone: contactPhone,
          contact_name: contactName,
          bot_active: true,
          is_blacklisted: false,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .limit(1);

      if (insErr) console.warn('[MSG] Aviso insertando conversación:', insErr.message);
      conversation = newConv && newConv[0];
    }
  } catch (e) {
    console.error('[MSG] Error con conversación:', e.message);
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

    // Emitir tiempo real al dashboard INMEDIATAMENTE (0ms)
    if (global.io) {
      try {
        const { emitToUserRooms } = require('./sessionManager');
        const msgObj = { id: Date.now().toString(), content: text, direction: 'inbound', sent_by: 'human', timestamp: new Date().toISOString() };
        emitToUserRooms(global.io, userId, 'new_message', {
          conversationId: conversation?.id || `conv_${contactPhone}`,
          contactPhone,
          message: msgObj,
        });
        emitToUserRooms(global.io, userId, 'conversation_updated', {
          conversationId: conversation?.id || `conv_${contactPhone}`,
          contactPhone,
          contactName,
          lastMessage: text,
          timestamp: msgObj.timestamp,
        });
      } catch (errIo) {
        console.warn('[MSG Handler] Aviso emitiendo socket inbound:', errIo.message);
      }
    }
  }

  // ── 3. Bot desactivado (Global o por Conversación) o Blacklist ──────────────
  let isGlobalBotEnabled = false;
  try {
    const { getGlobalBotStatus, isContactBotDisabled } = require('./sessionManager');
    isGlobalBotEnabled = await getGlobalBotStatus(userId);

    if (isContactBotDisabled(contactPhone)) {
      console.log(`[MSG Filter] 🛑 Bot desactivado en RAM para contacto: ${contactPhone}`);
      return;
    }
  } catch (_) {}

  // Verificar estado del bot para esta conversación y para este teléfono en DB
  let isChatBotActive = conversation ? conversation.bot_active : true;
  let isBlacklisted = conversation ? conversation.is_blacklisted : false;

  try {
    const { data: dbCheck } = await supabase
      .from('conversations')
      .select('bot_active, is_blacklisted')
      .eq('contact_phone', contactPhone);

    if (dbCheck && dbCheck.length > 0) {
      for (const row of dbCheck) {
        if (row.bot_active === false) isChatBotActive = false;
        if (row.is_blacklisted === true) isBlacklisted = true;
      }
    }
  } catch (_) {}

  if (!isGlobalBotEnabled || isBlacklisted || !isChatBotActive) {
    console.log(`[MSG] 🛑 Bot NO responde para ${contactPhone} (Global ON: ${isGlobalBotEnabled}, Chat Bot ON: ${isChatBotActive}, Blacklist: ${isBlacklisted})`);
    if (global.io) {
      try {
        const { emitToUserRooms, getSessionUuid } = require('./sessionManager');
        getSessionUuid(userId).then(sessionUuid => {
          emitToUserRooms(global.io, userId, 'manual_needed', {
            conversationId: conversation?.id, contactName, message: text,
          }, sessionUuid);
        });
      } catch (_) {
        global.io.to(`user_${userId}`).emit('manual_needed', {
          conversationId: conversation?.id, contactName, message: text,
        });
      }
    }
    return;
  }

  // ── 4. Rate limit anti-spam ───────────────────────────────────────────────
  if (isRateLimited(contactPhone)) return;

  // ── 5. Obtener negocio ────────────────────────────────────────────────────
  let business = null;
  try {
    const { getValidUserId } = require('./sessionManager');
    const validUserId = getValidUserId(userId);
    const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (businessId && isUuid(businessId)) {
      const { data: bById } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .limit(1);
      if (bById && bById.length > 0) business = bById[0];
    }

    if (!business) {
      const { data: bData } = await supabase
        .from('businesses')
        .select('*')
        .or(`user_id.eq.${userId},user_id.eq.${validUserId}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (bData && bData.length > 0) {
        business = bData[0];
      }
    }

    if (!business || business.name === 'Asistente Virtual') {
      const { data: fallback } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      if (fallback && fallback.length > 0) {
        business = fallback[0];
      }
    }
  } catch (e) {
    console.error('[MSG] Error obteniendo negocio:', e.message);
  }

  // Si no hay negocio configurado, usar objeto predeterminado de BotWA Vendedor
  if (!business || business.name === 'Asistente Virtual') {
    business = {
      id: '8fd9a59d-77d7-4db7-8637-9aaebca1158e',
      name: 'BotWA',
      category: 'Automatización de WhatsApp con IA',
      city: 'Colombia',
      timezone: 'America/Bogota',
      bot_personality: 'persuasivo',
      main_goal: 'vender',
      greeting_msg: '¡Hola! 👋 Te damos la bienvenida a BotWA. Te ayudamos a automatizar tus ventas en WhatsApp 24/7 con Inteligencia Artificial por menos del 10% del costo de un empleado. ¿Te gustaría conocer nuestros precios o probar una demostración?',
      active_hours_start: '00:00:00',
      active_hours_end: '23:59:59',
      active_days: [0, 1, 2, 3, 4, 5, 6],
      bot_enabled: true
    };
  }

  // ── 6. Verificar horario de atención ──────────────────────────────────────
  try {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: business.timezone || 'America/Bogota' }));
    const hour = local.getHours();
    const day = local.getDay();
    let activeDays = business.active_days || [0, 1, 2, 3, 4, 5, 6];
    if (typeof activeDays === 'string') {
      try { activeDays = JSON.parse(activeDays); } catch (_) { activeDays = [0, 1, 2, 3, 4, 5, 6]; }
    }
    const start = parseInt(business.active_hours_start?.toString().split(':')[0] || '0');
    const end = parseInt(business.active_hours_end?.toString().split(':')[0] || '24');

    if (Array.isArray(activeDays) && (!activeDays.includes(day) || hour < start || hour >= end)) {
      await randomDelay();
      await sendText(sock, jid, business.away_msg || 'Gracias por escribirnos 🙏 Te respondemos en nuestro horario de atención.');
      return;
    }
  } catch (e) {
    console.error('[MSG] Error verificando horario:', e.message);
  }

  // ── 7. Flujo de citas (si aplica) ─────────────────────────────────────────
  try {
    const tookOver = await handleAppointmentFlow(sock, msg, conversation, business, jid);
    if (tookOver) return;
  } catch (e) {
    console.error('[MSG] Error en appointmentFlow:', e.message);
  }

  // ── 8. Cargar knowledge base completa y Catálogo de Productos/Servicios ────
  let knowledge = [];
  let products = [];
  try {
    let query = supabase.from('knowledge_base').select('id, title, content, type, file_url').eq('is_active', true);
    if (business?.id) {
      query = query.eq('business_id', business.id);
    }
    const { data } = await query;
    knowledge = data || [];
  } catch (e) {
    console.error('[MSG] Error cargando knowledge base:', e.message);
  }

  try {
    let pQuery = supabase.from('products_services').select('name, description, price, currency, category, image_url').eq('is_active', true);
    if (business?.id) {
      pQuery = pQuery.eq('business_id', business.id);
    }

    // Filtro SQL por presupuesto si el usuario menciona montos (ej: "menos de 150.000")
    const priceMatch = (text || '').match(/(?:menos de|hasta|máximo|maximo|menor a)\s*\$?\s*([\d\.\,]+)/i);
    if (priceMatch) {
      const num = parseInt(priceMatch[1].replace(/[\.\,]/g, ''));
      if (!isNaN(num) && num > 0) {
        pQuery = pQuery.lte('price', num);
      }
    }

    const { data: prods } = await pQuery.order('category', { ascending: true }).limit(30);
    products = prods || [];

    if (products.length === 0) {
      const { data: defaultProds } = await supabase.from('products_services').select('name, description, price, currency, category, image_url').eq('is_active', true).limit(15);
      products = defaultProds || [
        { name: 'Plan Básico BotWA', description: '1 Flujo IA (Vender o Agendar), 20 FAQs, 1 Número WA', price: 120000, currency: 'COP', category: 'Planes BotWA' },
        { name: 'Plan Profesional BotWA', description: 'Ambos Flujos (Vender Y Agendar), Catálogo RAG, Alerta Lead Caliente, 100 FAQs', price: 250000, currency: 'COP', category: 'Planes BotWA' },
        { name: 'Plan Agencia / Business BotWA', description: 'Múltiples Números WA, White-label, Prompting y RAG a medida, Soporte Prioritario', price: 450000, currency: 'COP', category: 'Planes BotWA' },
      ];
    }
  } catch (e) {
    console.error('[MSG] Error cargando catálogo de productos:', e.message);
  }

  // ── 9. Historial reciente de la conversación ───────────────────────────────
  let history = [];
  try {
    if (conversation?.id) {
      const { data } = await supabase
        .from('messages')
        .select('content, direction')
        .eq('conversation_id', conversation.id)
        .order('timestamp', { ascending: false })
        .limit(12);
      history = (data || []).reverse();
    }
  } catch (e) {
    console.error('[MSG] Error cargando historial:', e.message);
  }

  // ── 10. RAG + Groq: generar respuesta ─────────────────────────────────────
  const { reply, isLeadHot, tokensUsed, imageName, ragChunksUsed } = await askGroq(
    text, business, knowledge, history, products
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

  // ── 13. Enviar imagen si el bot la detectó (KB o Productos) ───────────────
  let targetImageSearch = imageName;
  if (!targetImageSearch) {
    const normMsg = text.toLowerCase();
    const isRequestingImage = /foto|imagen|referencia|muéstrame|muestra|ver/i.test(normMsg);
    if (isRequestingImage && Array.isArray(products)) {
      const matchedProd = products.find(p => p.image_url && normMsg.includes(p.name.toLowerCase()));
      if (matchedProd) {
        targetImageSearch = matchedProd.name;
      }
    }
  }

  if (targetImageSearch) {
    let imgUrl = null;
    let caption = null;

    const imgKB = knowledge.find(k =>
      k.type === 'image' &&
      k.title.toLowerCase().includes(targetImageSearch.toLowerCase()) &&
      k.file_url
    );

    if (imgKB?.file_url) {
      imgUrl = imgKB.file_url;
      caption = imgKB.content;
    } else {
      const prodImg = products.find(p =>
        p.image_url &&
        (p.name.toLowerCase().includes(targetImageSearch.toLowerCase()) || (p.category && p.category.toLowerCase().includes(targetImageSearch.toLowerCase())))
      );
      if (prodImg?.image_url) {
        imgUrl = prodImg.image_url;
        caption = `${prodImg.name} - $${Number(prodImg.price || 0).toLocaleString('es-CO')} ${prodImg.currency || 'COP'}`;
      }
    }

    if (imgUrl) {
      try {
        await sock.sendMessage(jid, { image: { url: imgUrl }, caption: caption || '' });
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
      try {
        const { emitToUserRooms } = require('./sessionManager');
        const msgObj = { id: Date.now().toString(), content: reply, direction: 'outbound', sent_by: 'bot', timestamp: new Date().toISOString() };
        emitToUserRooms(global.io, userId, 'new_message', {
          conversationId: conversation?.id || `conv_${contactPhone}`,
          contactPhone,
          message: msgObj,
        });
        emitToUserRooms(global.io, userId, 'conversation_updated', {
          conversationId: conversation?.id || `conv_${contactPhone}`,
          contactPhone,
          lastMessage: reply,
          timestamp: msgObj.timestamp,
        });
      } catch (errIo) {
        console.warn('[MSG Handler] Aviso emitiendo socket outbound:', errIo.message);
      }
    }
  }
  });
};

module.exports = { handleIncomingMessage };
