const { supabase } = require('../db/supabase');
const { askGroq } = require('../ai/groq');
const { loadCatalogContext } = require('../services/catalogContext');
const { extraOrderFields } = require('../ai/orderNotes');
const { resolveUserBusiness } = require('../services/businessResolver');
const { notifyLead } = require('./notifier');
const { handleAppointmentFlow } = require('./appointmentFlow');
const { isOutsideHours } = require('../services/businessHours');
const { norm } = require('../ai/catalogUtils');

// ─── ANTI-BAN: delays aleatorios humanizados ──────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = () => sleep(Math.floor(Math.random() * 2000) + 800);

// Rate limit anti-spam: máx 60 mensajes/hora por contacto (un cliente armando un pedido
// largo puede pasar de 20 sin ser spam)
const MAX_MSGS_PER_HOUR = 60;
const messageCount = new Map();
const isRateLimited = (phone) => {
  const hour = Math.floor(Date.now() / 3600000);
  const key = `${phone}_${hour}`;
  const count = messageCount.get(key) || 0;
  if (count >= MAX_MSGS_PER_HOUR) return true;
  messageCount.set(key, count + 1);
  // Limpiar contadores de horas pasadas para no acumular memoria
  if (messageCount.size > 5000) {
    for (const k of messageCount.keys()) if (!k.endsWith(`_${hour}`)) messageCount.delete(k);
  }
  return false;
};

// ─── Ráfagas: el cliente escribe "hola" / "una pregunta" / "cuánto vale X" seguido ──
// Se espera BURST_WAIT_MS desde el último mensaje y se responde UNA vez a todo junto.
// Los mensajes anteriores de la ráfaga se guardan en la DB pero no llaman a la IA.
const BURST_WAIT_MS = Math.max(0, parseInt(process.env.BOT_BURST_WAIT_MS, 10) || 3500);
const bursts = new Map(); // `${userId}:${phone}` -> { seq, lastAt }

const registerBurstMessage = (burstKey) => {
  const prev = bursts.get(burstKey);
  const entry = { seq: (prev?.seq || 0) + 1, lastAt: Date.now() };
  bursts.set(burstKey, entry);
  return entry.seq;
};

// true si llegó otro mensaje del mismo cliente después de este (ese responderá por los dos)
const isSupersededByNewer = async (burstKey, seq) => {
  while (true) {
    const entry = bursts.get(burstKey);
    if (!entry || entry.seq !== seq) return true;
    const remaining = entry.lastAt + BURST_WAIT_MS - Date.now();
    if (remaining <= 0) {
      bursts.delete(burstKey);
      return false;
    }
    await sleep(remaining);
  }
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

// ─── Devuelve el imageMessage (con caption y mimetype) si el mensaje trae una foto ──
const getImageMessage = (msg) => {
  let m = msg?.message;
  if (!m) return null;
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m?.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m?.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m?.viewOnceMessageV2Extension) m = m.viewOnceMessageV2Extension.message;
  return m?.imageMessage || null;
};

// ─── Fotos del catálogo: encontrar el producto correcto aunque lo pidan "mal" ──
// El cliente puede pedir ver algo de mil formas ("mándame una foto", "la puedo ver?",
// "cómo se ve", "muéstrame", "y una imagen?"). Estas piezas vuelven robusta esa búsqueda.

// ¿El mensaje pide VER una foto/imagen? (tolerante a typos, acentos e informalidad)
const IMAGE_REQUEST_RE = /\b(fotos?|fotico|imagen|imagenes|img|referencia|catalogo)\b|\bmuestr\w*\b|\bensen\w*\b|\b(verla|verlo|verlos|verlas|vela|velo)\b|\bla (puedo|quiero|podria|podemos|podrias) ver\b|\b(puedo|quiero) verl\w*\b|\bcomo (se ve|luce|es de)\b/;
const isImageRequest = (text) => IMAGE_REQUEST_RE.test(norm(text));

// Palabras vacías: no identifican al producto, no deben diluir el puntaje de coincidencia.
const STOPWORDS = new Set(['que','los','las','una','uno','del','por','favor','porfa','para','con','ver','vela','velo','verla','verlo','verlas','verlos','foto','fotos','fotico','imagen','imagenes','img','referencia','quiero','puedo','podria','podrias','podemos','muestra','muestrame','muestrame','mandame','manda','enviame','envia','pasame','pasa','mostrar','ensename','enseñame','como','esa','ese','este','esta','esos','esas','ella','ello','esto','eso','tienes','tiene','hay','algo','porfavor','pls','porfis','alguna','algun']);

// Puntúa qué tan bien un texto de búsqueda coincide con el nombre/categoría de un producto.
const scoreProductMatch = (target, p) => {
  const t = norm(target);
  const name = norm(p?.name);
  if (!t || !name) return 0;
  if (name === t) return 100;
  if (name.includes(t) || t.includes(name)) return 85;
  const tWords = [...new Set(t.split(' ').filter(w => w.length >= 3 && !STOPWORDS.has(w)))];
  if (!tWords.length) return 0;
  const hits = tWords.filter(w => name.includes(w)).length;
  let score = (hits / tWords.length) * 70;
  // Un token "modelo" (con dígitos, ej. em22, x100) que coincide es muy distintivo: pesa más.
  if (tWords.some(w => /\d/.test(w) && name.includes(w))) score = Math.max(score, 82);
  const cat = norm(p?.category);
  if (cat && (cat.includes(t) || t.includes(cat))) score += 8;
  return score;
};

// Mejor producto CON FOTO que coincide con `target` (nombre que dijo el cliente o el modelo).
const pickProductImage = (target, catalog, minScore = 45) => {
  if (!target || !Array.isArray(catalog)) return null;
  let best = null, bestScore = 0;
  for (const p of catalog) {
    if (!p?.image_url) continue;
    const s = scoreProductMatch(target, p);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return bestScore >= minScore ? best : null;
};

// El cliente pide "una foto" sin nombrar el producto: ¿de cuál venían hablando?
// Recorre los últimos mensajes (del más reciente al más viejo) buscando un producto
// del catálogo (con foto) nombrado por su nombre completo o por su token de modelo.
const resolveContextProduct = (history, catalog) => {
  if (!Array.isArray(history) || !Array.isArray(catalog)) return null;
  const withImg = catalog.filter(p => p?.image_url && p?.name);
  if (!withImg.length) return null;
  const recent = history.slice(-6).reverse();
  for (const m of recent) {
    const c = norm(m?.content);
    if (!c) continue;
    let found = withImg.find(p => c.includes(norm(p.name)));
    if (found) return found;
    found = withImg.find(p => norm(p.name).split(' ').some(w => /\d/.test(w) && w.length >= 3 && c.includes(w)));
    if (found) return found;
  }
  return null;
};

// ─── Enviar mensaje con Baileys (Human Pacing & Presencia 'Escribiendo...') ────
const sendText = async (sock, jid, text) => {
  try {
    // 1. Simular presencia 'Escribiendo...' (Efecto humano y protección anti-ban)
    try {
      if (sock?.sendPresenceUpdate) {
        await sock.sendPresenceUpdate('composing', jid);
        const delayMs = Math.min(Math.max((text || '').length * 18, 1200), 2800);
        await new Promise(r => setTimeout(r, delayMs));
        await sock.sendPresenceUpdate('paused', jid);
      }
    } catch (_) {}

    // 2. Enviar mensaje de texto
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

// Avisa al panel que el mensaje debe responderlo un humano (el bot no contestó)
const emitManualNeeded = (userId, payload) => {
  if (!global.io) return;
  try {
    const { emitToUserRooms, getSessionUuid } = require('./sessionManager');
    getSessionUuid(userId).then(sessionUuid => {
      emitToUserRooms(global.io, userId, 'manual_needed', payload, sessionUuid);
    });
  } catch (_) {
    global.io.to(`user_${userId}`).emit('manual_needed', payload);
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

  const { resolvePhoneAndJid, registerLidMappingFromKey } = require('./sessionManager');
  // Si el mensaje llega desde un LID (@lid), su llave trae el número real en remoteJidAlt:
  // registrarlo aquí garantiza que el teléfono del contacto y de la cita sea el verdadero.
  registerLidMappingFromKey(msg.key);
  let resolved = resolvePhoneAndJid(jid);

  if (resolved.isGroup) {
    console.log(`[MSG Filter] 🛑 Ignorando grupo resuelto: ${jid}`);
    return;
  }

  // Último recurso: si tras resolver seguimos con un LID (el mapeo aún no estaba en memoria),
  // preguntarle directamente a Baileys por el número real detrás de ese LID.
  if (jid.endsWith('@lid') && resolved.jid.endsWith('@lid')) {
    try {
      const realPn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid);
      const realDigits = (realPn || '').replace(/[^0-9]/g, '');
      if (realDigits) {
        registerLidMappingFromKey({ remoteJid: jid, remoteJidAlt: `${realDigits}@s.whatsapp.net` });
        resolved = resolvePhoneAndJid(jid);
      }
    } catch (_) {}
  }

  const contactPhone = resolved.phone;
  if (!contactPhone || contactPhone.includes('-')) return;

  // Si WhatsApp no entrega el número real de este cliente (lo oculta), contactPhone es solo el
  // identificador interno (LID): no se puede llamar ni escribir. En ese caso el bot le pide su
  // celular al cliente al agendar o tomar un pedido (ver phoneUnknown más abajo).
  const phoneUnknown = resolved.jid.endsWith('@lid');
  if (phoneUnknown) {
    console.log(`[LID] ⚠️ Sin número real para ${jid} (remoteJidAlt=${msg.key.remoteJidAlt || 'ausente'}, addressingMode=${msg.key.addressingMode || '?'}): el bot pedirá el celular al cliente`);
  }
  // Celular que el cliente escribió en la conversación (solo se usa si el real es desconocido)
  const givenPhone = (data) => {
    const digits = String(data?.telefono || data?.celular || '').replace(/[^0-9]/g, '');
    return digits.length >= 7 && digits.length <= 15 ? digits : null;
  };

  const { enqueueIncomingMessage } = require('../queues/messageQueue');

  // Se registra al llegar (antes de la cola) para que el mensaje anterior sepa que hay uno nuevo
  const burstKey = `${userId}:${contactPhone}`;
  const burstSeq = registerBurstMessage(burstKey);

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

    // 1) Buscar conversación existente por número de teléfono (aislada a esta sesión)
    let convQuery = supabase
      .from('conversations')
      .select('*')
      .eq('contact_phone', contactPhone);
    if (sessionUuid) convQuery = convQuery.eq('session_id', sessionUuid);
    const { data: existingConvs } = await convQuery.order('last_message_at', { ascending: false }).limit(1);

    if (existingConvs && existingConvs.length > 0) {
      conversation = existingConvs[0];
      await supabase.from('conversations').update({
        contact_name: contactName,
        last_message: text,
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1,
      }).eq('id', conversation.id);
    } else {
      // 2) Si no existe conversación previa para este teléfono, insertarla
      const { data: newConv, error: insErr } = await supabase
        .from('conversations')
        .upsert({
          session_id: sessionUuid || null,
          contact_phone: contactPhone,
          contact_name: contactName,
          bot_active: true,
          is_blacklisted: false,
          last_message: text,
          last_message_at: new Date().toISOString(),
        }, { onConflict: 'session_id,contact_phone' })
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
    // Timestamp REAL del mensaje. syncChatsAndMessagesToDb inserta este mismo mensaje
    // usando msg.messageTimestamp; si aquí usáramos new Date() las dos filas quedarían con
    // timestamps distintos, la deduplicación no las reconocería como la misma y el mensaje
    // saldría duplicado en el chat.
    const { safeToIsoString } = require('./sessionManager');
    const inboundTs = safeToIsoString(msg.messageTimestamp);

    await safeQuery(() => supabase.from('messages').insert({
      conversation_id: conversation.id,
      content: text,
      direction: 'inbound',
      sent_by: 'human',
      timestamp: inboundTs,
    }));

    // Emitir tiempo real al dashboard INMEDIATAMENTE (0ms)
    if (global.io) {
      try {
        const { emitToUserRooms } = require('./sessionManager');
        const sessionUuid = await require('./sessionManager').getSessionUuid(userId);
        const msgObj = { id: msg.key?.id || Date.now().toString(), content: text, direction: 'inbound', sent_by: 'human', timestamp: inboundTs };
        emitToUserRooms(global.io, userId, 'new_message', {
          conversationId: conversation?.id || `conv_${contactPhone}`,
          contactPhone,
          message: msgObj,
        }, sessionUuid);
        emitToUserRooms(global.io, userId, 'conversation_updated', {
          conversationId: conversation?.id || `conv_${contactPhone}`,
          contactPhone,
          contactName,
          lastMessage: text,
          timestamp: msgObj.timestamp,
        }, sessionUuid);
      } catch (errIo) {
        console.warn('[MSG Handler] Aviso emitiendo socket inbound:', errIo.message);
      }
    }
  }

  // ── 3. Bot desactivado (Global o por Conversación) o Blacklist ──────────────
  let isGlobalBotEnabled = true;
  try {
    const { getGlobalBotStatus, isContactBotDisabled } = require('./sessionManager');
    const status = await getGlobalBotStatus(userId);
    if (typeof status === 'boolean') isGlobalBotEnabled = status;

    if (isContactBotDisabled(contactPhone, userId)) {
      console.log(`[MSG Filter] 🛑 Bot desactivado en RAM para contacto: ${contactPhone}`);
      return;
    }
  } catch (_) {}

  // Verificar estado del bot para esta conversación y para este teléfono en DB
  let isChatBotActive = conversation ? conversation.bot_active : true;
  let isBlacklisted = conversation ? conversation.is_blacklisted : false;

  try {
    // Acotado a las sesiones de ESTE usuario. Sin el filtro, la consulta traía las filas de
    // todos los negocios del SaaS que tuvieran ese contacto, y bastaba con que uno solo
    // hubiera pausado el bot para ese número para que el bot dejara de responder a todos.
    const { getUserSessionIds } = require('./sessionManager');
    const ownSessionIds = await getUserSessionIds(userId);

    if (ownSessionIds.length > 0) {
      const { data: dbCheck } = await supabase
        .from('conversations')
        .select('bot_active, is_blacklisted')
        .in('session_id', ownSessionIds)
        .eq('contact_phone', contactPhone);

      if (dbCheck && dbCheck.length > 0) {
        for (const row of dbCheck) {
          if (row.bot_active === false) isChatBotActive = false;
          if (row.is_blacklisted === true) isBlacklisted = true;
        }
      }
    }
  } catch (_) {}

  if (!isGlobalBotEnabled || isBlacklisted || !isChatBotActive) {
    console.log(`[MSG] 🛑 Bot NO responde para ${contactPhone} (Global ON: ${isGlobalBotEnabled}, Chat Bot ON: ${isChatBotActive}, Blacklist: ${isBlacklisted})`);
    emitManualNeeded(userId, { conversationId: conversation?.id, contactName, message: text });
    return;
  }

  // ── 3.2. Ráfaga: si el cliente sigue escribiendo, responde el último mensaje por todos ──
  // Las fotos no se saltan: cada una necesita su propio análisis de visión.
  if (!getImageMessage(msg) && await isSupersededByNewer(burstKey, burstSeq)) {
    console.log(`[MSG] ⏳ ${contactPhone} siguió escribiendo: se responde todo junto en el siguiente mensaje`);
    return;
  }

  // ── 3.5. Verificar estado de suscripción, prueba y límite estricto de mensajes ────
  try {
    const { getValidUserId, emitToUserRooms } = require('./sessionManager');
    const validUserId = getValidUserId(userId);
    const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (validUserId && isUuid(validUserId)) {
      const { checkUserMessageQuota } = require('../routes/billing');
      const quotaCheck = await checkUserMessageQuota(validUserId);

      if (!quotaCheck.canSend) {
        if (quotaCheck.reason === 'quota_exceeded') {
          console.log(`[QUOTA] 🛑 Límite de mensajes mensual alcanzado para ${userId}: ${quotaCheck.messagesUsed}/${quotaCheck.messageLimit} msgs.`);

          // 1. Emitir evento inmediato al dashboard del usuario
          if (global.io) {
            try {
              emitToUserRooms(global.io, userId, 'quota_exceeded', {
                messagesUsed: quotaCheck.messagesUsed,
                messageLimit: quotaCheck.messageLimit,
                plan: quotaCheck.plan,
                isTrial: quotaCheck.isTrial,
              });
            } catch (_) {}
          }

          // 2. Respuesta de cortesía al cliente final en WhatsApp (sin consumir API de Groq)
          await randomDelay();
          await sendText(
            sock,
            jid,
            'Hola, gracias por comunicarte. En este momento tu mensaje ha sido transferido a un asesor de nuestro equipo, quien te responderá en breve. 🙏'
          );
          return;
        }

        if (quotaCheck.reason === 'account_paused') {
          console.log(`[MSG] 🛑 Bot pausado para ${userId}: cuenta pausada o suscripción inactiva.`);
          return;
        }
      }
    }
  } catch (subErr) {
    console.warn('[MSG] Aviso verificando suscripción y cuota de usuario:', subErr.message);
  }

  // ── 4. Rate limit anti-spam ───────────────────────────────────────────────
  if (isRateLimited(contactPhone)) {
    console.warn(`[MSG] 🛑 ${contactPhone} superó ${MAX_MSGS_PER_HOUR} mensajes en la hora: el bot no responde, pasa a un asesor`);
    emitManualNeeded(userId, { conversationId: conversation?.id, contactName, message: text });
    return;
  }

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

    // Mismo criterio que el panel: si el usuario tiene más de un negocio, el que tiene datos cargados
    if (!business && validUserId) {
      business = await resolveUserBusiness(supabase, validUserId) || null;
    }

    if (!business && userId && userId !== validUserId) {
      business = await resolveUserBusiness(supabase, userId) || null;
    }

    // Fallback a BotWA SOLO si es el administrador principal
    const PRIMARY_ADMIN_UUID = '0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d';
    if (!business && (validUserId === PRIMARY_ADMIN_UUID || userId === 'admin')) {
      const { data: botwaBus } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', '8fd9a59d-77d7-4db7-8637-9aaebca1158e')
        .limit(1);
      if (botwaBus && botwaBus.length > 0) {
        business = botwaBus[0];
      }
    }
  } catch (e) {
    console.error('[MSG] Error obteniendo negocio:', e.message);
  }

  // Si no hay negocio: solo el administrador principal usa el perfil de BotWA.
  // Cualquier otro usuario sin negocio no tiene información y el bot no responde.
  if (!business) {
    const { getValidUserId } = require('./sessionManager');
    const isPrimaryAdmin = getValidUserId(userId) === '0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d' || userId === 'admin';
    if (isPrimaryAdmin) {
      business = {
        id: '8fd9a59d-77d7-4db7-8637-9aaebca1158e',
        name: 'BotWA',
        category: 'Automatización y Bots de WhatsApp con IA',
        city: 'Colombia',
        timezone: 'America/Bogota',
        bot_personality: 'persuasivo',
        main_goal: 'vender',
        greeting_msg: '¡Hola! 👋 Te damos la bienvenida a BotWA. ¿Te gustaría conocer nuestros planes o probar una demostración?',
        active_hours_start: '00:00:00',
        active_hours_end: '23:59:59',
        active_days: [0, 1, 2, 3, 4, 5, 6],
        bot_enabled: true
      };
    } else {
      console.log(`[MSG] 🛑 Bot NO responde para ${contactPhone}: el usuario ${userId} no tiene negocio configurado.`);
      emitManualNeeded(userId, { conversationId: conversation?.id, contactName, message: text });
      return;
    }
  }

  // ── 6. Horario de atención (Modo Asistente Virtual 24/7) ─────────────────
  try {
    if (isOutsideHours(business)) {
      business.isOutsideHours = true;
      console.log(`[MSG] 🌙 Negocio fuera de horario físico (${business.active_hours_start}-${business.active_hours_end}). El bot IA responde en modo 24/7.`);
    }
  } catch (e) {
    console.error('[MSG] Error verificando horario:', e.message);
  }

  // ── 8. Cargar knowledge base completa y Catálogo de Productos/Servicios ────
  let knowledge = [];
  let products = [];
  let priceFiltered = false;
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

  let catalogOptions = {};
  try {
    // Catálogo completo si es pequeño; búsqueda en SQL si es grande (ver services/catalogContext.js)
    const catalog = await loadCatalogContext({ supabase, business, text });
    products = catalog.products;
    priceFiltered = catalog.priceFiltered;
    catalogOptions = catalog.options;

    const PRIMARY_BOTWA_ID = '8fd9a59d-77d7-4db7-8637-9aaebca1158e';
    if (products.length === 0 && business?.id === PRIMARY_BOTWA_ID) {
      const { data: defaultProds } = await supabase.from('products_services').select('name, description, price, currency, category, image_url').eq('business_id', PRIMARY_BOTWA_ID).eq('is_active', true).limit(15);
      products = (defaultProds && defaultProds.length > 0) ? defaultProds : [
        { name: 'Plan Vendedor Automático (1.500 msgs/mes)', description: 'Ideal para negocios pequeños o independientes (hasta 50 chats/día). Atención 24/7 en WhatsApp, respuestas inmediatas en segundos, catálogo inteligente con IA y base de FAQs. Incluye 7 días gratis ($0 COP hoy con tarjeta).', price: 120000, currency: 'COP', category: 'Planes BotWA' },
        { name: 'Plan Máquina de Ventas Pro (5.000 msgs/mes - ⭐ Más Recomendado)', description: 'Para tiendas y empresas en crecimiento (hasta 170 chats/día). Envío automático de fotos y multimedia del catálogo, agendador de citas y toma de pedidos con sincronización a tu panel, 5.000 msgs IA/mes y FAQs ampliadas. Incluye 7 días gratis ($0 COP hoy con tarjeta).', price: 249000, currency: 'COP', category: 'Planes BotWA' },
        { name: 'Plan Dominio Agencia / VIP (20.000 msgs/mes)', description: 'Para empresas consolidadas, clínicas o agencias (más de 650 chats/día). Múltiples líneas de WhatsApp conectadas, marca blanca con tu logo, prompting y embudo personalizado Done-For-You y soporte VIP 1 a 1. Incluye 7 días gratis ($0 COP hoy con tarjeta).', price: 490000, currency: 'COP', category: 'Planes BotWA' },
      ];
    }
  } catch (e) {
    console.error('[MSG] Error cargando catálogo de productos:', e.message);
  }

  // ── 8.5. Sin información configurada no hay nada que responder: la IA solo inventaría ──
  const { evaluateBotReadiness } = require('../services/botReadiness');
  // Un filtro por presupuesto puede vaciar la lista sin que el catálogo esté vacío
  const readiness = evaluateBotReadiness(business, products.length || (priceFiltered ? 1 : 0), knowledge.length);
  if (!readiness.ready) {
    console.log(`[MSG] 🛑 Bot NO responde para ${contactPhone}: negocio sin información (${readiness.missing.join(' | ')})`);
    emitManualNeeded(userId, { conversationId: conversation?.id, contactName, message: text });
    return;
  }

  // ── 6.5. Manejo amable de Stickers y Audios (sin quemar tokens ni fugar razonamiento) ──
  if (text === '[Sticker]') {
    const stickerReply = '😄 ¡Buen sticker! Cuéntame, ¿en qué te puedo colaborar el día de hoy? 😊';
    await randomDelay();
    await sendText(sock, jid, stickerReply);
    if (conversation?.id) {
      await safeQuery(() => supabase.from('messages').insert({
        conversation_id: conversation.id,
        content: stickerReply,
        direction: 'outbound',
        sent_by: 'bot',
        timestamp: new Date().toISOString(),
      }));
    }
    return;
  }

  if (text === '[Audio]') {
    const audioReply = '🎙️ ¡Hola! Por aquí no puedo escuchar audios en este momento, pero si me escribes por texto te ayudo con gusto de inmediato. 😊';
    await randomDelay();
    await sendText(sock, jid, audioReply);
    if (conversation?.id) {
      await safeQuery(() => supabase.from('messages').insert({
        conversation_id: conversation.id,
        content: audioReply,
        direction: 'outbound',
        sent_by: 'bot',
        timestamp: new Date().toISOString(),
      }));
    }
    return;
  }

  // ── 7. Flujo de citas inteligente manejado directamente por Groq AI (Citas / Ventas / Cancelaciones) ──
  // (El interceptor rígido de texto queda desactivado para que la IA maneje con contexto completo y empatía)

  // ── 9. Historial reciente de la conversación ───────────────────────────────
  let history = [];
  try {
    if (conversation?.id) {
      const { data } = await supabase
        .from('messages')
        .select('content, direction, timestamp')
        .eq('conversation_id', conversation.id)
        .order('timestamp', { ascending: false })
        .limit(12);
      history = (data || []).reverse();
    }
  } catch (e) {
    console.error('[MSG] Error cargando historial:', e.message);
  }

  // Fallback a mensajes en RAM de Baileys si la DB aún no tiene historial acumulado
  if (history.length <= 1) {
    try {
      const { getUserStore, getValidUserId } = require('./sessionManager');
      const store = getUserStore(getValidUserId(userId));
      if (store && store.messages) {
        const jidDigits = contactPhone.replace(/[^0-9]/g, '');
        const ramMsgs = [];
        for (const [mId, mObj] of store.messages.entries()) {
          const mPhone = (mObj.remoteJid || '').replace(/[^0-9]/g, '');
          if (mPhone && (mPhone.includes(jidDigits) || jidDigits.includes(mPhone))) {
            const mText = mObj.content || mObj.text || '';
            if (mText) {
              ramMsgs.push({
                content: mText,
                direction: mObj.fromMe ? 'outbound' : 'inbound',
              });
            }
          }
        }
        if (ramMsgs.length > history.length) {
          history = ramMsgs.slice(-10);
        }
      }
    } catch (_) {}
  }

  // ── 9.5 ACCESO Y CUOTA ─────────────────────────────────────────────────────
  // Regla estándar para todos los usuarios: registrarse, configurar el negocio y conectar
  // WhatsApp es libre; el bot solo responde con tarjeta registrada (prueba de 7 días, tope de
  // 150 mensajes) o con un pago vigente. Al cliente final nunca se le habla de planes ni cuotas:
  // si el bot no puede responder, calla y el dueño lo ve en su panel.
  let blockReason = null;
  try {
    if (userId) {
      const { data: userProfile } = await supabase
        .from('users')
        .select('id, is_admin, plan, subscription_status, status, trial_ends_at, paid_until')
        .eq('id', userId)
        .maybeSingle();

      // Los administradores NUNCA tienen límite
      if (userProfile && !userProfile.is_admin) {
        const now = Date.now();
        const trialEnds = userProfile.trial_ends_at ? new Date(userProfile.trial_ends_at).getTime() : null;
        const isPaused = userProfile.status === 'paused' || userProfile.status === 'cancelled';
        const isTrialActive = userProfile.subscription_status === 'trialing' && (!trialEnds || trialEnds > now);
        const isPaidActive = userProfile.subscription_status === 'active'
          || (userProfile.paid_until && new Date(userProfile.paid_until).getTime() > now);
        const maxTrialMsgs = 150;

        if (isPaused || (!isTrialActive && !isPaidActive)) {
          blockReason = 'sin_plan';
        } else if (isTrialActive && !isPaidActive) {
          const { getSessionUuid } = require('./sessionManager');
          const sessionUuid = await getSessionUuid(userId);

          if (sessionUuid) {
            // 1. Obtener conversaciones de esta sesión exacta
            const { data: userConvs } = await supabase
              .from('conversations')
              .select('id')
              .eq('session_id', sessionUuid)
              .limit(500);

            const userConvIds = (userConvs || []).map(c => c.id).filter(Boolean);

            if (userConvIds.length > 0) {
              // Los 150 mensajes cuentan desde que empezó la prueba (7 días antes de su fin)
              const trialStart = new Date((trialEnds || now) - 7 * 24 * 60 * 60 * 1000).toISOString();
              // Contar mensajes emitidos ÚNICAMENTE en las conversaciones de este usuario
              const { count: msgsSent } = await supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .in('conversation_id', userConvIds)
                .eq('direction', 'outbound')
                .gte('timestamp', trialStart);

              if ((msgsSent || 0) >= maxTrialMsgs) {
                console.warn(`[QUOTA PROTECT] 🛑 Usuario ${userId} superó el límite de prueba gratuita (${msgsSent}/${maxTrialMsgs} msgs). Bloqueando llamada a Groq.`);
                blockReason = 'tope_prueba';
              }
            }
          }
        }
      }
    }
  } catch (eQuota) {
    // Si hay cualquier error de red, NO bloqueamos el servicio para no interferir
    console.error('[QUOTA CHECK ERROR]', eQuota.message);
    blockReason = null;
  }

  if (blockReason) {
    console.log(`[ACCESS] Bot sin responder para usuario ${userId}: ${blockReason === 'sin_plan' ? 'sin tarjeta ni pago vigente' : 'tope de 150 mensajes de prueba'}`);
    return;
  }

  // ── 9.8 Imagen del cliente: interpretarla y cruzarla con el catálogo ──────
  let aiText = text;
  const incomingImage = getImageMessage(msg);
  if (incomingImage) {
    const { analyzeImage, buildImageContext, isVisionEnabled } = require('../ai/vision');
    const caption = (incomingImage.caption || '').trim();

    // Responde con un texto fijo, lo guarda y avisa al panel: así el asesor toma la conversación
    const handOffToAdvisor = async (replyText) => {
      emitManualNeeded(userId, { conversationId: conversation?.id, contactName, message: text });
      await randomDelay();
      await sendText(sock, jid, replyText);
      if (conversation?.id) {
        await safeQuery(() => supabase.from('messages').insert({
          conversation_id: conversation.id,
          content: replyText,
          direction: 'outbound',
          sent_by: 'bot',
          timestamp: new Date().toISOString(),
        }));
      }
    };

    let analysis = null;
    if (isVisionEnabled()) {
      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        // La foto se compara con el catálogo; en uno grande `products` es solo una muestra
        const visionProducts = catalogOptions.visionProducts ? await catalogOptions.visionProducts() : products;
        analysis = await analyzeImage(buffer, incomingImage.mimetype, visionProducts, caption);
      } catch (e) {
        console.error('[MSG] Error descargando la imagen:', e.message);
      }
    }

    if (!analysis) {
      console.log(`[MSG] 🖼️ No se pudo interpretar la imagen de ${contactPhone}: se deriva a un asesor`);
      await handOffToAdvisor('Recibí tu foto 📸 Un asesor la revisa y te responde en breve. 🙏');
      return;
    }

    console.log(`[VISION] ${contactPhone}: ${analysis.tipo} | ${analysis.producto?.name || 'sin match'} (${analysis.confianza})`);

    if (analysis.tipo === 'comprobante_pago') {
      await handOffToAdvisor('¡Gracias! Recibí tu comprobante 🧾 Un asesor lo verifica y te confirma en breve. 🙏');
      return;
    }

    aiText = buildImageContext(analysis, caption);
  } else {
    // Juntar los mensajes seguidos que el cliente mandó sin respuesta del bot (últimos 2 min)
    // en una sola pregunta, y sacarlos del historial para no repetirlos.
    const cutoff = Date.now() - 2 * 60 * 1000;
    let i = history.length;
    while (
      i > 0 && history.length - i < 6 &&
      history[i - 1].direction === 'inbound' &&
      (!history[i - 1].timestamp || new Date(history[i - 1].timestamp).getTime() >= cutoff)
    ) i--;
    const burstTexts = history.slice(i).map(m => (m.content || '').trim()).filter(Boolean);
    if (burstTexts.length > 1 && burstTexts[burstTexts.length - 1] === text) {
      aiText = burstTexts.join('\n');
      history = history.slice(0, i);
      console.log(`[MSG] 🧩 ${contactPhone}: ${burstTexts.length} mensajes seguidos respondidos en una sola respuesta`);
    }
  }

  // ── 10. RAG + Groq: generar respuesta ─────────────────────────────────────
  const { reply, isLeadHot, tokensUsed, imageName, newAppointmentData, cancelAppointmentData, modifyAppointmentData, newOrderData, modifyOrderData, clientData, ragChunksUsed, productsUsed } = await askGroq(
    aiText, business, knowledge, history, products, { ...catalogOptions, contactPhoneUnknown: phoneUnknown }
  );
  // Para enviar la foto de un producto: lo que el bot tuvo a la vista este turno, más lo cargado
  const imageCatalog = Array.isArray(productsUsed) && productsUsed.length ? [...productsUsed, ...products] : products;

  console.log(`[RAG] Chunks usados: ${ragChunksUsed} | Tokens: ${tokensUsed}`);

  // ── 11. Actualizar Nombre de Contacto si fue capturado en el Cierre ────────
  const capturedName = newOrderData?.nombre || clientData?.nombre || newAppointmentData?.nombre || cancelAppointmentData?.nombre || modifyAppointmentData?.nombre;
  if (capturedName && conversation?.id && (conversation.contact_name === contactPhone || !conversation.contact_name)) {
    await safeQuery(() => supabase.from('conversations').update({ contact_name: capturedName }).eq('id', conversation.id));
  }

  // ── 12. Registrar Cita Automática en Base de Datos (si aplica) ────────────
  if (newAppointmentData && conversation?.id && business?.id) {
    try {
      const apptDate = newAppointmentData.fecha || new Date().toISOString().split('T')[0];
      const apptTime = newAppointmentData.hora || '10:00:00';
      // La IA a veces repite la etiqueta al seguir conversando: la misma cita no se guarda dos veces
      const { data: sameAppt } = await supabase.from('appointments').select('id')
        .eq('conversation_id', conversation.id).eq('status', 'confirmed')
        .eq('appointment_date', apptDate).eq('appointment_time', apptTime).limit(1);

      const { data: newAppt } = sameAppt?.length ? { data: null } : await supabase.from('appointments').insert({
        conversation_id: conversation.id,
        business_id: business.id,
        client_name: capturedName || contactName,
        client_phone: phoneUnknown ? (givenPhone(newAppointmentData) || contactPhone) : contactPhone,
        service: newAppointmentData.servicio || 'Servicio General',
        appointment_date: apptDate,
        appointment_time: apptTime,
        status: 'confirmed',
        notes: `Cita agendada por Bot IA para ${business.name}`,
      }).select().limit(1);
      if (sameAppt?.length) console.log('[MSG] Cita repetida por la IA, no se duplica.');

      if (newAppt && newAppt.length > 0 && global.io) {
        const { emitToUserRooms } = require('./sessionManager');
        emitToUserRooms(global.io, userId, 'new_appointment', newAppt[0]);
      }
    } catch (eAppt) {
      console.error('[MSG] Error guardando cita automática:', eAppt.message);
    }
  }

  // ── 12.0 Cancelar o Borrar Cita en Base de Datos (si aplica) ─────────────
  if (cancelAppointmentData && business?.id) {
    try {
      let cancelQuery = supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('business_id', business.id)
        .eq('status', 'confirmed');

      if (conversation?.id) {
        cancelQuery = cancelQuery.or(`conversation_id.eq.${conversation.id},client_phone.eq.${contactPhone}`);
      } else {
        cancelQuery = cancelQuery.eq('client_phone', contactPhone);
      }

      if (cancelAppointmentData.fecha) {
        cancelQuery = cancelQuery.eq('appointment_date', cancelAppointmentData.fecha);
      }

      const { data: cancelledList } = await cancelQuery.select();
      console.log(`[MSG] 🛑 Citas canceladas en DB: ${cancelledList?.length || 0}`);

      if (cancelledList && cancelledList.length > 0 && global.io) {
        const { emitToUserRooms } = require('./sessionManager');
        emitToUserRooms(global.io, userId, 'appointment_cancelled', cancelledList[0]);
      }
    } catch (eCancel) {
      console.error('[MSG] Error cancelando cita en DB:', eCancel.message);
    }
  }

  // ── 12.0.1 Modificar / Reprogramar Cita en Base de Datos (si aplica) ─────
  if (modifyAppointmentData && business?.id && (modifyAppointmentData.fecha || modifyAppointmentData.hora)) {
    try {
      const updates = {};
      if (modifyAppointmentData.fecha) updates.appointment_date = modifyAppointmentData.fecha;
      if (modifyAppointmentData.hora) updates.appointment_time = modifyAppointmentData.hora;
      if (modifyAppointmentData.servicio) updates.service = modifyAppointmentData.servicio;

      if (Object.keys(updates).length > 0) {
        let modQuery = supabase.from('appointments').update(updates)
          .eq('business_id', business.id).eq('status', 'confirmed');

        if (conversation?.id) {
          modQuery = modQuery.or(`conversation_id.eq.${conversation.id},client_phone.eq.${contactPhone}`);
        } else {
          modQuery = modQuery.eq('client_phone', contactPhone);
        }
        // Si el cliente dijo cuál cita cambiaba, apuntamos a esa fecha original
        if (modifyAppointmentData.fecha_anterior) {
          modQuery = modQuery.eq('appointment_date', modifyAppointmentData.fecha_anterior);
        }

        const { data: modifiedList } = await modQuery.select();
        console.log(`[MSG] 🔁 Citas modificadas en DB: ${modifiedList?.length || 0}`);

        if (modifiedList && modifiedList.length > 0 && global.io) {
          const { emitToUserRooms } = require('./sessionManager');
          emitToUserRooms(global.io, userId, 'appointment_modified', modifiedList[0]);
        }
      }
    } catch (eMod) {
      console.error('[MSG] Error modificando cita en DB:', eMod.message);
    }
  }

  // ── 12.1 Registrar Pedido Automático en Base de Datos (si aplica venta de productos) ──
  const orderDetails = newOrderData || (clientData && (clientData.producto || clientData.ciudad) ? clientData : null);
  if (orderDetails && conversation?.id && business?.id) {
    try {
      const itemsList = orderDetails.producto || orderDetails.items || 'Pedido por WhatsApp';
      const address = orderDetails.direccion || orderDetails.ciudad || '';
      const city = orderDetails.ciudad || '';
      const payMethod = orderDetails.metodo_pago || 'Por confirmar';
      const orderTotal = orderDetails.total || orderDetails.precio || 0;
      const extraNotes = [orderDetails.notas, ...extraOrderFields(orderDetails), orderDetails.telefono && `Tel. que dio: ${orderDetails.telefono}`].filter(Boolean).join(' · ');

      // Mismo pedido repetido por la IA en las últimas horas de esta conversación: no se duplica
      const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: sameOrder } = await supabase.from('orders').select('id')
        .eq('conversation_id', conversation.id).eq('items', itemsList).gte('created_at', since).limit(1);
      if (sameOrder?.length) throw Object.assign(new Error('pedido repetido'), { duplicate: true });

      const { data: newOrder } = await supabase.from('orders').insert({
        conversation_id: conversation.id,
        business_id: business.id,
        client_name: capturedName || contactName,
        client_phone: phoneUnknown ? (givenPhone(orderDetails) || contactPhone) : contactPhone,
        items: itemsList,
        total_amount: isNaN(parseFloat(orderTotal)) ? 0 : parseFloat(orderTotal),
        currency: 'COP',
        shipping_address: address,
        city: city,
        payment_method: payMethod,
        status: 'pending',
        notes: `Pedido capturado por Bot IA en WhatsApp (${business.name})${extraNotes ? ` · ${extraNotes}` : ''}`,
      }).select().limit(1);

      if (newOrder && newOrder.length > 0 && global.io) {
        const { emitToUserRooms } = require('./sessionManager');
        emitToUserRooms(global.io, userId, 'new_order', newOrder[0]);
      }
    } catch (eOrder) {
      if (eOrder.duplicate) console.log('[MSG] Pedido repetido por la IA, no se duplica.');
      else console.error('[MSG] Error guardando pedido automático:', eOrder.message);
    }
  }

  // ── 12.2 Modificar Pedido ya tomado en Base de Datos (si aplica) ─────────
  if (modifyOrderData && conversation?.id && business?.id) {
    try {
      // Apuntamos al último pedido pendiente de esta conversación
      const { data: existingOrders } = await supabase.from('orders')
        .select('id, items, total_amount, shipping_address, city, payment_method, notes')
        .eq('conversation_id', conversation.id).eq('business_id', business.id)
        .eq('status', 'pending').order('created_at', { ascending: false }).limit(1);

      if (existingOrders && existingOrders.length > 0) {
        const prev = existingOrders[0];
        const updates = {};
        if (modifyOrderData.producto) updates.items = modifyOrderData.producto;
        const newTotal = modifyOrderData.total ?? modifyOrderData.precio;
        if (newTotal !== undefined && newTotal !== '' && !isNaN(parseFloat(newTotal))) {
          updates.total_amount = parseFloat(newTotal);
        }
        if (modifyOrderData.direccion) updates.shipping_address = modifyOrderData.direccion;
        if (modifyOrderData.ciudad) updates.city = modifyOrderData.ciudad;
        if (modifyOrderData.metodo_pago) updates.payment_method = modifyOrderData.metodo_pago;
        const changeNote = [modifyOrderData.notas, ...extraOrderFields(modifyOrderData, { alwaysQuantity: true })].filter(Boolean).join(' · ');
        if (changeNote) {
          updates.notes = `${prev.notes || ''} · Modificado por Bot IA: ${changeNote}`.trim();
        }

        if (Object.keys(updates).length > 0) {
          const { data: modOrder } = await supabase.from('orders').update(updates).eq('id', prev.id).select().limit(1);
          console.log(`[MSG] 🔁 Pedido modificado en DB: ${modOrder?.length || 0}`);
          if (modOrder && modOrder.length > 0 && global.io) {
            const { emitToUserRooms } = require('./sessionManager');
            emitToUserRooms(global.io, userId, 'order_modified', modOrder[0]);
          }
        }
      } else {
        console.log('[MSG] MODIFICAR_PEDIDO sin pedido pendiente previo: se ignora (no se crea uno nuevo).');
      }
    } catch (eModOrder) {
      console.error('[MSG] Error modificando pedido en DB:', eModOrder.message);
    }
  }

  // ── 13. Lead caliente / Cierre → notificar al dueño ────────────────────────
  if (isLeadHot && conversation?.id) {
    await safeQuery(() => supabase.from('conversations').update({ is_lead: true }).eq('id', conversation.id));
    try {
      const leadPhone = phoneUnknown
        ? (givenPhone(newAppointmentData) || givenPhone(newOrderData) || givenPhone(clientData) || contactPhone)
        : contactPhone;
      await notifyLead(business, leadPhone, capturedName || contactName, text, conversation.id, sock, jid, { newAppointmentData, newOrderData, clientData });
    } catch (e) {
      console.error('[MSG] Error notificando lead:', e.message);
    }
  }

  // ── 12. Anti-ban delay ─────────────────────────────────────────────────────
  await randomDelay();

  // ── 13. Enviar imagen del producto (etiqueta del modelo o deducida del contexto) ──
  // Tres capas para que SIEMPRE llegue la foto correcta, pida como pida el cliente:
  //  (a) el modelo dejó [ENVIAR_IMAGEN: nombre]  → KB primero, luego catálogo
  //  (b) el modelo lo olvidó pero el cliente pidió ver una foto → la deducimos:
  //      del producto nombrado en este mensaje, o del que venían hablando.
  const productCaption = (p) => `${p.name} - $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}`;
  let imgUrl = null;
  let caption = null;

  if (imageName) {
    const target = norm(imageName);
    const imgKB = knowledge.find(k =>
      k.type === 'image' && k.file_url && k.title &&
      (norm(k.title).includes(target) || target.includes(norm(k.title)))
    );
    if (imgKB?.file_url) {
      imgUrl = imgKB.file_url;
      caption = imgKB.content;
    } else {
      const prodImg = pickProductImage(imageName, imageCatalog);
      if (prodImg) { imgUrl = prodImg.image_url; caption = productCaption(prodImg); }
    }
  }

  // Fallback: el cliente claramente pidió ver una foto y el modelo no dejó etiqueta (o no resolvió).
  if (!imgUrl && isImageRequest(text) && Array.isArray(imageCatalog)) {
    // ¿nombró el producto en este mensaje? (umbral alto: debe ser claro)
    let prodImg = pickProductImage(text, imageCatalog, 60);
    // si no, ¿de cuál producto venían hablando en la conversación?
    if (!prodImg) prodImg = resolveContextProduct(history, imageCatalog);
    if (prodImg?.image_url) { imgUrl = prodImg.image_url; caption = productCaption(prodImg); }
  }

  if (imgUrl) {
    try {
      await sock.sendMessage(jid, { image: { url: imgUrl }, caption: caption || '' });
      await sleep(800);
    } catch (e) {
      console.error('[MSG] Error enviando imagen:', e.message);
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
        const { emitToUserRooms, getSessionUuid } = require('./sessionManager');
        const sessionUuid = await getSessionUuid(userId);
        const msgObj = { id: Date.now().toString(), content: reply, direction: 'outbound', sent_by: 'bot', timestamp: new Date().toISOString() };
        emitToUserRooms(global.io, userId, 'new_message', {
          conversationId: conversation?.id || `conv_${contactPhone}`,
          contactPhone,
          message: msgObj,
        }, sessionUuid);
        emitToUserRooms(global.io, userId, 'conversation_updated', {
          conversationId: conversation?.id || `conv_${contactPhone}`,
          contactPhone,
          lastMessage: reply,
          timestamp: msgObj.timestamp,
        }, sessionUuid);
      } catch (errIo) {
        console.warn('[MSG Handler] Aviso emitiendo socket outbound:', errIo.message);
      }
    }
  }
  });
};

module.exports = { handleIncomingMessage };
