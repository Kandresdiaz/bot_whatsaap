const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Listar conversaciones de una sesión o usuario
router.get('/:sessionId', async (req, res) => {
  try {
    let { sessionId } = req.params;
    const { search, status } = req.query;

    const { getValidUserId, getUserStore, resolvePhoneAndJid, safeToIsoString, getSession } = require('../whatsapp/sessionManager');
    const validUserId = getValidUserId(sessionId);

    // 0. VERIFICAR ESTADO DE CONEXIÓN Y RESOLVER IDENTIFICADORES DE SESIÓN
    const sessionIdsSet = new Set();
    if (isUuid(sessionId)) sessionIdsSet.add(sessionId);
    if (isUuid(validUserId)) sessionIdsSet.add(validUserId);

    let isConnInDb = false;
    let ownerUserId = validUserId;

    if (supabase) {
      try {
        const orFilter = isUuid(sessionId)
          ? `user_id.eq.${validUserId},id.eq.${sessionId},id.eq.${validUserId}`
          : `user_id.eq.${validUserId}`;

        const { data: userSessions } = await supabase
          .from('whatsapp_sessions')
          .select('id, user_id, status')
          .or(orFilter)
          .order('created_at', { ascending: false });

        if (Array.isArray(userSessions) && userSessions.length > 0) {
          isConnInDb = userSessions.some(s => s.status === 'connected');
          for (const s of userSessions) {
            if (isUuid(s.id)) sessionIdsSet.add(s.id);
            if (isUuid(s.user_id)) {
              sessionIdsSet.add(s.user_id);
              ownerUserId = s.user_id;
            }
          }
        }
      } catch (errDbSess) {
        console.warn('[Conversations] Error verificando sesiones en DB:', errDbSess.message);
      }
    }

    const active = getSession(sessionId) || getSession(validUserId) || getSession(ownerUserId);
    const isConnInRam = active && active.status === 'connected';

    if (!isConnInRam && !isConnInDb) {
      return res.json({ success: true, conversations: [] });
    }

    const sessionList = Array.from(sessionIdsSet);

    // Consulta principal por session_ids del usuario
    let data = [];
    if (sessionList.length > 0) {
      let q = supabase.from('conversations').select('*').in('session_id', sessionList).order('last_message_at', { ascending: false }).limit(200);
      if (status) q = q.eq('status', status);
      if (search) q = q.or(`contact_name.ilike.%${search}%,contact_phone.ilike.%${search}%`);
      const { data: d } = await q;
      if (d) data = d;
    }

    // Obtener la tienda RAM única y exclusivamente de este usuario
    let store = getUserStore(validUserId);

    const phoneSet = new Set();
    const merged = [];

    const activeSession = active || getSession(ownerUserId);
    const selfPhone = (activeSession?.phone || '').split(':')[0].replace(/[^0-9]/g, '');

    // 1. Primero: conversaciones de DB
    for (const c of data) {
      if (!c) continue;
      const rawPhone = (c.contact_phone || '').trim();
      if (!rawPhone) continue;
      const resolved = resolvePhoneAndJid(rawPhone);
      const cleanPhone = resolved.phone || rawPhone;
      if (!cleanPhone) continue;
      if (selfPhone && cleanPhone === selfPhone) continue;

      if (phoneSet.has(cleanPhone)) continue;
      phoneSet.add(cleanPhone);
      merged.push({
        ...c,
        contact_phone: cleanPhone,
        contact_name: c.contact_name || cleanPhone,
        last_message: c.last_message || null,
        last_message_at: c.last_message_at || c.created_at,
      });
    }

    // 2. Fusionar chats de RAM de Baileys (chats que llegan pero aún no están en DB)
    try {
      const resolveFn = typeof resolvePhoneAndJid === 'function'
        ? resolvePhoneAndJid
        : (id) => ({ phone: (id || '').split('@')[0].replace(/[^0-9]/g, ''), jid: id, isGroup: false });

      if (store && store.chats) {
        for (const [, chat] of store.chats.entries()) {
          if (!chat || !chat.id || chat.id === 'status@broadcast') continue;
          const resolved = resolveFn(chat.id);
          const phone = resolved.phone || (chat.id || '').split('@')[0].replace(/[^0-9]/g, '');
          if (!phone || phone.length < 5) continue;
          if (selfPhone && phone === selfPhone) continue;
          if (phoneSet.has(phone)) continue;
          phoneSet.add(phone);

          // Obtener nombre del contacto desde store de contactos
          let contactName = chat.name || '';
          if (!contactName || contactName === phone) {
            const co = store.contacts?.get(chat.id) || store.contacts?.get(`${phone}@s.whatsapp.net`) || store.contacts?.get(phone);
            contactName = co?.name || co?.notify || co?.verifiedName || phone;
          }

          const isGroupChat = resolved.isGroup || phone.includes('-') || (chat.id && chat.id.endsWith('@g.us')) || (contactName && contactName.toLowerCase().includes('grupo'));

          merged.push({
            id: `ram_${phone}`,
            session_id: sessionList[0] || validUserId,
            contact_phone: phone,
            contact_name: contactName,
            bot_active: !isGroupChat,
            is_blacklisted: false,
            is_lead: false,
            unread_count: chat.unreadCount || 0,
            status: 'open',
            last_message: null,
            last_message_at: typeof safeToIsoString === 'function' ? safeToIsoString(chat.conversationTimestamp) : new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) { console.warn('[RAM Chats Merge Error]:', e.message); }

    // 2.5. Enriquecer últimos mensajes faltantes desde la tabla messages en Supabase
    try {
      const needLastMsgIds = merged
        .filter(c => !c.last_message && c.id && !c.id.startsWith('ram_'))
        .map(c => c.id);

      if (needLastMsgIds.length > 0) {
        const { data: latestDbMsgs } = await supabase
          .from('messages')
          .select('conversation_id, content, timestamp')
          .in('conversation_id', needLastMsgIds.slice(0, 100))
          .order('timestamp', { ascending: false });

        if (Array.isArray(latestDbMsgs)) {
          const dbMsgMap = new Map();
          for (const m of latestDbMsgs) {
            if (!dbMsgMap.has(m.conversation_id)) {
              dbMsgMap.set(m.conversation_id, m);
            }
          }
          for (const conv of merged) {
            if (!conv.last_message && dbMsgMap.has(conv.id)) {
              const lm = dbMsgMap.get(conv.id);
              conv.last_message = lm.content;
              if (!conv.last_message_at || new Date(lm.timestamp) > new Date(conv.last_message_at)) {
                conv.last_message_at = lm.timestamp;
              }
            }
          }
        }
      }
    } catch (dbMsgErr) {
      console.warn('[Get Conversations] Error enriqueciendo desde messages DB:', dbMsgErr.message);
    }

    // 3. Enriquecer previews de último mensaje desde RAM
    try {
      const { extractText } = require('../whatsapp/sessionManager');
      if (store && store.messages && store.messages.size > 0) {
        // Agrupar mensajes por teléfono, quedarse con el más reciente
        const latestByPhone = new Map();
        for (const [, msg] of store.messages.entries()) {
          if (!msg?.key?.remoteJid) continue;
          const resolved = resolvePhoneAndJid(msg.key.remoteJid);
          const phone = resolved.phone;
          if (!phone) continue;
          const text = extractText ? extractText(msg) : '';
          if (!text) continue;
          const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) : 0;
          if (!latestByPhone.has(phone) || ts > latestByPhone.get(phone).ts) {
            latestByPhone.set(phone, { text, ts });
          }
        }
        for (const conv of merged) {
          const latest = latestByPhone.get(conv.contact_phone);
          if (latest) {
            if (!conv.last_message || latest.ts * 1000 > new Date(conv.last_message_at || 0).getTime()) {
              conv.last_message = latest.text;
              conv.last_message_at = new Date(latest.ts * 1000).toISOString();
            }
          }
        }
      }
    } catch (_) {}

    // 4. Enriquecer nombres desde contactos RAM y forzar bot_active = false para grupos y contactos desactivados en RAM/DB
    try {
      const { isContactBotDisabled, setContactBotStatus } = require('../whatsapp/sessionManager');

      const disabledPhonesFromDb = new Set();
      const blacklistedPhonesFromDb = new Set();

      // Consultar en DB todos los números que tengan bot_active = false o is_blacklisted = true
      const { data: disabledRows } = await supabase
        .from('conversations')
        .select('contact_phone, bot_active, is_blacklisted')
        .or('bot_active.eq.false,is_blacklisted.eq.true');

      if (disabledRows && disabledRows.length > 0) {
        for (const r of disabledRows) {
          const p = (r.contact_phone || '').replace(/[^0-9]/g, '');
          if (!p) continue;
          if (r.bot_active === false) {
            disabledPhonesFromDb.add(p);
            setContactBotStatus(p, false, validUserId);
          }
          if (r.is_blacklisted === true) {
            blacklistedPhonesFromDb.add(p);
          }
        }
      }

      for (const c of merged) {
        const cleanP = (c.contact_phone || '').replace(/[^0-9]/g, '');
        const cleanName = c.contact_name || '';
        if (!cleanName || cleanName === cleanP) {
          if (store && store.contacts) {
            const co = store.contacts.get(cleanP) || store.contacts.get(`${cleanP}@s.whatsapp.net`) || store.contacts.get(`${cleanP}@lid`);
            const betterName = co?.name || co?.notify || co?.verifiedName;
            if (betterName) c.contact_name = betterName;
          }
        }

        const isGroup = cleanP.includes('-') || (c.contact_name || '').toLowerCase().includes('grupo') || (c.id || '').endsWith('@g.us');
        if (blacklistedPhonesFromDb.has(cleanP)) {
          c.is_blacklisted = true;
        }

        if (isGroup || disabledPhonesFromDb.has(cleanP) || isContactBotDisabled(cleanP, validUserId)) {
          c.bot_active = false;
        }
      }
    } catch (_) {}

    // Ordenar por fecha de último mensaje descendente
    merged.sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());

    res.json({ success: true, conversations: merged });
  } catch (err) {
    console.error('[GET Conversations Error]:', err.message);
    res.json({ success: true, conversations: [] });
  }
});

// Mensajes de una conversación
router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { phone: queryPhone, userId: queryUserId } = req.query;

    const { getSessionUuid, getUserSessionIds, getValidUserId, getUserStore, extractText, safeToIsoString, resolvePhoneAndJid, cleanPhoneFromJid } = require('../whatsapp/sessionManager');

    const validUserId = getValidUserId(queryUserId || 'admin');
    const rawTargetPhone = (queryPhone || conversationId || '').toString().trim();
    const resolvedTarget = resolvePhoneAndJid(rawTargetPhone);
    const cleanPhone = resolvedTarget.phone || cleanPhoneFromJid(rawTargetPhone);

    // Acotar SIEMPRE a las sesiones del usuario que pregunta. Sin este filtro, buscar por
    // contact_phone devolvía las conversaciones de cualquier negocio del SaaS que tuviera
    // guardado ese mismo número, y el endpoint terminaba sirviendo chats ajenos.
    const ownSessionIds = await getUserSessionIds(validUserId);
    const sessionScope = ownSessionIds.length > 0 ? ownSessionIds : null;

    let realConvId = isUuid(conversationId) ? conversationId : null;

    // Buscar UUID real de la conversación si no lo tenemos
    if (!realConvId && cleanPhone && sessionScope) {
      try {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .in('session_id', sessionScope)
          .eq('contact_phone', cleanPhone)
          .order('last_message_at', { ascending: false })
          .limit(1);

        if (conv && conv[0]?.id) realConvId = conv[0].id;
      } catch (_) {}
    }

    let dbMsgs = [];
    const convIdsToQuery = new Set();
    if (realConvId) convIdsToQuery.add(realConvId);

    if (cleanPhone && sessionScope) {
      try {
        const { data: relatedConvs } = await supabase
          .from('conversations')
          .select('id')
          .in('session_id', sessionScope)
          .eq('contact_phone', cleanPhone);
        if (relatedConvs && relatedConvs.length > 0) {
          relatedConvs.forEach(c => convIdsToQuery.add(c.id));
        }
        if (resolvedTarget?.lid && resolvedTarget.lid !== cleanPhone) {
          const { data: lidConvs } = await supabase
            .from('conversations')
            .select('id')
            .in('session_id', sessionScope)
            .eq('contact_phone', resolvedTarget.lid);
          if (lidConvs && lidConvs.length > 0) {
            lidConvs.forEach(c => convIdsToQuery.add(c.id));
          }
        }
      } catch (_) {}
    }

    if (convIdsToQuery.size > 0) {
      const { data, error: qErr } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', Array.from(convIdsToQuery))
        .order('timestamp', { ascending: false })
        .limit(500);

      if (qErr) {
        console.warn('[GET Messages DB Warning]:', qErr.message);
      }
      dbMsgs = data || [];

      if (realConvId) {
        try {
          await supabase.from('conversations').update({ unread_count: 0 }).eq('id', realConvId);
        } catch (_) {}
      }
    }

    // Fusionar mensajes de la memoria RAM de Baileys
    const ramMsgs = [];
    if (cleanPhone) {
      try {
        let store = getUserStore(validUserId);

        if (store && store.messages) {
          for (const [mId, m] of store.messages.entries()) {
            if (!m || !m.key || !m.key.remoteJid) continue;
            const jid = m.key.remoteJid;
            const resJid = resolvePhoneAndJid(jid);
            const msgPhone = resJid.phone || cleanPhoneFromJid(jid);
            const isMatch = (msgPhone && cleanPhone && msgPhone === cleanPhone) ||
                            (resJid.lid && cleanPhone && resJid.lid === cleanPhone) ||
                            (resolvedTarget?.lid && msgPhone && resolvedTarget.lid === msgPhone);
            if (isMatch) {
              const text = extractText ? extractText(m) : '';
              if (text) {
                ramMsgs.push({
                  id: m.key.id || mId,
                  conversation_id: realConvId || conversationId,
                  content: text,
                  direction: m.key.fromMe ? 'outbound' : 'inbound',
                  sent_by: m.key.fromMe ? 'human' : 'client',
                  timestamp: safeToIsoString(m.messageTimestamp),
                });
              }
            }
          }
        }
      } catch (errRam) {
        console.warn('[GET Messages RAM Error]:', errRam.message);
      }
    }

    // Fusionar y deduplicar mensajes por contenido y ventana de tiempo
    const rawCombined = [...dbMsgs, ...ramMsgs];
    const dedupedMsgs = [];

    for (const m of rawCombined) {
      if (!m || !m.content) continue;
      const mTime = new Date(m.timestamp || 0).getTime();
      const isDup = dedupedMsgs.some(ex => {
        if (m.id && ex.id && m.id === ex.id) return true;
        if (m.direction === ex.direction && m.content.trim() === ex.content.trim()) {
          const exTime = new Date(ex.timestamp || 0).getTime();
          if (Math.abs(mTime - exTime) < 10000) return true;
        }
        return false;
      });
      if (!isDup) dedupedMsgs.push(m);
    }

    dedupedMsgs.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

    res.json({ success: true, messages: dedupedMsgs });
  } catch (err) {
    console.error('[GET Messages Error]:', err.message);
    res.json({ success: true, messages: [] });
  }
});

// Crear o buscar conversación para un número de teléfono
router.post('/create', async (req, res) => {
  try {
    const { userId, phone, contactName } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'phone es requerido' });
    }

    const { getSessionUuid, getValidUserId } = require('../whatsapp/sessionManager');
    const validUserId = getValidUserId(userId || 'admin');
    const sessionUuid = await getSessionUuid(validUserId);
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    if (!cleanPhone) {
      return res.status(400).json({ success: false, error: 'Número de teléfono inválido' });
    }

    // Buscar si ya existe, solo dentro de las sesiones de este usuario. Sin ese filtro el
    // endpoint podía devolver la conversación de otro negocio que tuviera el mismo número.
    const { getUserSessionIds } = require('../whatsapp/sessionManager');
    const ownSessionIds = await getUserSessionIds(validUserId);
    if (sessionUuid && !ownSessionIds.includes(sessionUuid)) ownSessionIds.push(sessionUuid);

    let { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .in('session_id', ownSessionIds.length > 0 ? ownSessionIds : [sessionUuid])
      .eq('contact_phone', cleanPhone)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.json({ success: true, conversation: existing[0] });
    }

    // Crear conversación nueva en Supabase
    const { data: newConv, error: insErr } = await supabase
      .from('conversations')
      .insert({
        session_id: sessionUuid,
        contact_phone: cleanPhone,
        contact_name: contactName || cleanPhone,
        bot_active: true,
        is_blacklisted: false,
        last_message_at: new Date().toISOString(),
        unread_count: 0,
        status: 'open',
      })
      .select()
      .limit(1);

    if (insErr) {
      console.error('[Conversations Create Error]:', insErr.message);
      return res.status(500).json({ success: false, error: insErr.message });
    }

    return res.json({ success: true, conversation: newConv && newConv[0] });
  } catch (err) {
    console.error('[Conversations Create Crash Safe]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sincronizar chats de la sesión activa
router.post('/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { getSession, syncChatsAndMessagesToDb, emitToUserRooms, getSessionUuid, storeChats } = require('../whatsapp/sessionManager');

    const sessionUuid = await getSessionUuid(userId);
    const session = getSession(userId);

    if (session?.sock) {
      try {
        if (session.sock.groupFetchAllParticipating) {
          const groups = await session.sock.groupFetchAllParticipating();
          if (groups) {
            const groupChats = Object.values(groups).map(g => ({
              id: g.id,
              name: g.subject || g.name,
              conversationTimestamp: g.creation || Math.floor(Date.now() / 1000),
              unreadCount: 0,
            }));
            storeChats(userId, groupChats);
          }
        }
      } catch (e) {
        console.warn('[Sync groups warning]:', e.message);
      }
    }

    await syncChatsAndMessagesToDb(userId, [], [], [], global.io);

    if (global.io) {
      emitToUserRooms(global.io, userId, 'chats_synced', { timestamp: new Date().toISOString() }, sessionUuid);
    }
    res.json({ success: true, message: 'Sincronización completada' });
  } catch (err) {
    console.error('[POST Sync Crash Safe]:', err.message);
    res.json({ success: true, message: 'Sincronización procesada', error: err.message });
  }
});

// Activar/desactivar bot en una conversación
router.patch('/:conversationId/toggle-bot', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { bot_active, phone: reqPhone, userId } = req.body;
    const { setContactBotStatus, getSessionUuid, getUserSessionIds, getValidUserId } = require('../whatsapp/sessionManager');

    const cleanPhone = (reqPhone || conversationId || '').toString().replace('ram_', '').replace(/[^0-9]/g, '');

    if (cleanPhone) {
      setContactBotStatus(cleanPhone, bot_active, userId);
    }

    if (isUuid(conversationId)) {
      await supabase
        .from('conversations')
        .update({ bot_active })
        .eq('id', conversationId);
    }

    // Acotado a las sesiones de este usuario: sin el filtro, pausar el bot para un contacto
    // lo pausaba también en todos los demás negocios del SaaS que tuvieran ese número.
    const ownSessionIds = await getUserSessionIds(userId || 'admin');

    if (cleanPhone && ownSessionIds.length > 0) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .in('session_id', ownSessionIds)
        .eq('contact_phone', cleanPhone);

      if (existing && existing.length > 0) {
        await supabase
          .from('conversations')
          .update({ bot_active })
          .in('session_id', ownSessionIds)
          .eq('contact_phone', cleanPhone);
      } else {
        const validUserId = getValidUserId(userId || 'admin');
        const sessionUuid = await getSessionUuid(validUserId);

        await supabase
          .from('conversations')
          .insert({
            session_id: sessionUuid,
            contact_phone: cleanPhone,
            contact_name: cleanPhone,
            bot_active,
            is_blacklisted: false,
            last_message_at: new Date().toISOString(),
          });
      }
    }
    res.json({ success: true, bot_active });
  } catch (err) {
    console.error('[Toggle Bot Error]:', err.message);
    res.json({ success: true, bot_active: req.body.bot_active });
  }
});

// Agregar a blacklist (amigos/familia)
router.patch('/:conversationId/blacklist', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { blacklisted, reason, phone: reqPhone, userId } = req.body;
    const { setContactBotStatus, getSessionUuid, getUserSessionIds, getValidUserId } = require('../whatsapp/sessionManager');

    const cleanPhone = (reqPhone || conversationId || '').toString().replace('ram_', '').replace(/[^0-9]/g, '');

    if (cleanPhone) {
      setContactBotStatus(cleanPhone, !blacklisted, userId);
    }

    if (isUuid(conversationId)) {
      await supabase
        .from('conversations')
        .update({
          is_blacklisted: blacklisted,
          blacklist_reason: reason || null,
          bot_active: !blacklisted,
        })
        .eq('id', conversationId);
    }

    // Acotado a las sesiones de este usuario: sin el filtro, poner un contacto en lista negra
    // lo bloqueaba también en todos los demás negocios del SaaS que tuvieran ese número.
    const ownSessionIds = await getUserSessionIds(userId || 'admin');

    if (cleanPhone && ownSessionIds.length > 0) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .in('session_id', ownSessionIds)
        .eq('contact_phone', cleanPhone);

      if (existing && existing.length > 0) {
        await supabase
          .from('conversations')
          .update({
            is_blacklisted: blacklisted,
            blacklist_reason: reason || null,
            bot_active: !blacklisted,
          })
          .in('session_id', ownSessionIds)
          .eq('contact_phone', cleanPhone);
      } else {
        const validUserId = getValidUserId(userId || 'admin');
        const sessionUuid = await getSessionUuid(validUserId);

        await supabase
          .from('conversations')
          .insert({
            session_id: sessionUuid,
            contact_phone: cleanPhone,
            contact_name: cleanPhone,
            bot_active: !blacklisted,
            is_blacklisted: blacklisted,
            blacklist_reason: reason || null,
            last_message_at: new Date().toISOString(),
          });
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Blacklist Error]:', err.message);
    res.json({ success: true });
  }
});

// Endpoint de diagnóstico transparente: estado de Baileys, chats en RAM y chats en DB
router.get('/debug-info/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { getSession, getValidUserId, getUserStore, getSessionUuid } = require('../whatsapp/sessionManager');
    const validUserId = getValidUserId(userId);
    const sessionUuid = await getSessionUuid(userId);
    const session = getSession(userId) || getSession(validUserId);

    const store = getUserStore(validUserId);
    const ramChatsCount = store && store.chats ? store.chats.size : 0;
    const ramMessagesCount = store && store.messages ? store.messages.size : 0;

    let dbChatsCount = 0;
    let dbSessionStatus = 'unknown';

    try {
      const { data: userSessions } = await supabase
        .from('whatsapp_sessions')
        .select('id, status, phone_number')
        .eq('user_id', validUserId);

      const sessionIds = (userSessions || []).map(s => s.id).filter(Boolean);
      if (sessionUuid && !sessionIds.includes(sessionUuid)) sessionIds.push(sessionUuid);

      if (userSessions && userSessions.length > 0) {
        dbSessionStatus = userSessions[0].status;
      }

      if (sessionIds.length > 0) {
        const { count } = await supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .in('session_id', sessionIds);
        dbChatsCount = count || 0;
      }
    } catch (_) {}

    res.json({
      success: true,
      userId: validUserId,
      sessionUuid,
      status: session?.status || dbSessionStatus || 'disconnected',
      phone: session?.phone || null,
      hasActiveSocket: !!session?.sock,
      ramChatsCount,
      ramMessagesCount,
      dbChatsCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
