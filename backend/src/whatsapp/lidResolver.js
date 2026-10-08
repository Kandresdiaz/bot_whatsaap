// Cuando WhatsApp escribe desde un LID (<id>@lid) sin entregar el celular real, el mismo cliente
// termina en DOS chats: uno con su celular (de conversaciones anteriores) y otro con el LID.
//
// Aquí se resuelve preguntándole a WhatsApp (USync, vía Baileys) cuál es el LID de cada celular
// que ya tenemos en los chats: si el LID de alguno coincide con el que llegó, es la misma persona.
// Luego se fusionan los dos chats sin perder mensajes, citas ni pedidos.

const { supabase } = require('../db/supabase');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const digitsOf = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

// Un celular real tiene 8 a 13 dígitos; un LID, 14 o más
const isPnDigits = (d) => d.length >= 8 && d.length <= 13;
const isLidDigits = (d) => d.length >= 14;

// Para no repetir consultas a WhatsApp por un LID que no coincide con nadie
const NEGATIVE_TTL_MS = 30 * 60 * 1000;
const negativeCache = new Map(); // `${sessionUuid}:${lid}` -> expira
const MAX_PNS_TO_CHECK = 150;
const CHUNK = 50;

const registerPair = (lid, pn) => {
  try {
    const { registerLidMappingFromKey } = require('./sessionManager');
    registerLidMappingFromKey({ remoteJid: `${lid}@lid`, remoteJidAlt: `${pn}@s.whatsapp.net` });
  } catch (_) {}
};

// Devuelve Map(lid -> celular) con los LID que se lograron resolver.
const discoverLidMappings = async (sock, sessionUuid, lids) => {
  const found = new Map();
  const repo = sock?.signalRepository?.lidMapping;
  if (!repo?.getLIDsForPNs || !sessionUuid || !supabase) return found;

  const now = Date.now();
  const pending = [...new Set(lids)].filter(l => !((negativeCache.get(`${sessionUuid}:${l}`) || 0) > now));
  if (!pending.length) return found;

  const { data } = await supabase
    .from('conversations')
    .select('contact_phone')
    .eq('session_id', sessionUuid)
    .order('last_message_at', { ascending: false })
    .limit(300);
  const pns = [...new Set((data || []).map(r => String(r.contact_phone || '').replace(/[^0-9]/g, '')).filter(isPnDigits))]
    .slice(0, MAX_PNS_TO_CHECK);

  for (let i = 0; i < pns.length && found.size < pending.length; i += CHUNK) {
    const chunk = pns.slice(i, i + CHUNK).map(p => `${p}@s.whatsapp.net`);
    try {
      const pairs = await repo.getLIDsForPNs(chunk);
      for (const pair of pairs || []) {
        const lid = digitsOf(pair.lid);
        const pn = digitsOf(pair.pn);
        if (!lid || !pn) continue;
        registerPair(lid, pn); // sirve también para que la lista de chats junte duplicados
        if (pending.includes(lid)) found.set(lid, pn);
      }
    } catch (e) {
      console.warn(`[LID] Aviso consultando LIDs a WhatsApp: ${e.message}`);
    }
    if (i + CHUNK < pns.length) await sleep(500);
  }

  for (const lid of pending) {
    if (!found.has(lid)) negativeCache.set(`${sessionUuid}:${lid}`, now + NEGATIVE_TTL_MS);
  }
  return found;
};

// Pasa los mensajes de un chat a otro. Si hay un mensaje idéntico (índice único por
// conversation_id+content+timestamp) se descarta el duplicado en vez de fallar.
const moveMessages = async (fromId, toId) => {
  const { error } = await supabase.from('messages').update({ conversation_id: toId }).eq('conversation_id', fromId);
  if (!error) return;
  const { data: rows } = await supabase.from('messages').select('id').eq('conversation_id', fromId);
  for (const row of rows || []) {
    const { error: e } = await supabase.from('messages').update({ conversation_id: toId }).eq('id', row.id);
    if (e) await supabase.from('messages').delete().eq('id', row.id);
  }
};

// Une el chat del LID con el del celular real (o solo le corrige el número si no existe otro).
const mergeLidConversation = async (sessionUuid, lid, pn) => {
  if (!supabase || !sessionUuid || !lid || !pn || lid === pn) return { merged: 0, renamed: 0 };

  const { data: lidConvs } = await supabase.from('conversations').select('*')
    .eq('session_id', sessionUuid).eq('contact_phone', lid);
  if (!lidConvs?.length) return { merged: 0, renamed: 0 };

  const { data: targets } = await supabase.from('conversations').select('*')
    .eq('session_id', sessionUuid).eq('contact_phone', pn)
    .order('last_message_at', { ascending: false }).limit(1);
  let target = targets?.[0] || null;

  let merged = 0;
  let renamed = 0;
  for (const conv of lidConvs) {
    if (!target) {
      const { error } = await supabase.from('conversations').update({ contact_phone: pn }).eq('id', conv.id);
      if (!error) {
        target = { ...conv, contact_phone: pn };
        renamed++;
        await fixRecordPhones(conv.id, lid, pn);
      }
      continue;
    }

    await moveMessages(conv.id, target.id);
    // Citas y pedidos deben apuntar al chat que queda, o se perderían al borrar el del LID
    await supabase.from('appointments').update({ conversation_id: target.id }).eq('conversation_id', conv.id);
    await supabase.from('orders').update({ conversation_id: target.id }).eq('conversation_id', conv.id);
    await fixRecordPhones(target.id, lid, pn);

    const generic = (n) => !n || n === pn || n === lid || /^x$/i.test(n.trim());
    const update = {};
    const convNewer = new Date(conv.last_message_at || 0) > new Date(target.last_message_at || 0);
    if (convNewer) {
      update.last_message = conv.last_message;
      update.last_message_at = conv.last_message_at;
    }
    if (generic(target.contact_name) && !generic(conv.contact_name)) update.contact_name = conv.contact_name;
    if (conv.is_lead && !target.is_lead) update.is_lead = true;
    update.unread_count = (target.unread_count || 0) + (conv.unread_count || 0);
    if (Object.keys(update).length) {
      await supabase.from('conversations').update(update).eq('id', target.id);
      target = { ...target, ...update };
    }

    const { error: delErr } = await supabase.from('conversations').delete().eq('id', conv.id);
    if (delErr) console.warn(`[LID] No se pudo borrar el chat duplicado ${conv.id}: ${delErr.message}`);
    else merged++;
  }

  if (merged || renamed) console.log(`[LID] ✅ ${lid} = +${pn}: ${merged} chat(s) fusionados, ${renamed} renumerado(s)`);
  return { merged, renamed };
};

// Citas y pedidos de ese chat que quedaron con el LID como teléfono
const fixRecordPhones = async (conversationId, lid, pn) => {
  for (const table of ['appointments', 'orders']) {
    try {
      await supabase.from(table).update({ client_phone: pn }).eq('conversation_id', conversationId).eq('client_phone', lid);
    } catch (_) {}
  }
};

// Revisa todos los chats que hoy están con un LID y trata de unirlos a su celular real.
// Se corre al conectar el WhatsApp: arregla los duplicados que ya existían.
const reconcileLidConversations = async (sock, sessionUuid) => {
  if (!supabase || !sessionUuid) return;
  const { data } = await supabase.from('conversations').select('contact_phone')
    .eq('session_id', sessionUuid).order('last_message_at', { ascending: false }).limit(300);
  const lids = [...new Set((data || []).map(r => String(r.contact_phone || '').replace(/[^0-9]/g, '')).filter(isLidDigits))];
  if (!lids.length) return;

  console.log(`[LID] Revisando ${lids.length} chat(s) con identificador interno para unirlos a su celular real`);
  const found = await discoverLidMappings(sock, sessionUuid, lids);
  for (const [lid, pn] of found) await mergeLidConversation(sessionUuid, lid, pn);
  const missing = lids.length - found.size;
  if (missing > 0) console.log(`[LID] ${missing} chat(s) siguen sin celular real (WhatsApp no lo entrega)`);
};

module.exports = { discoverLidMappings, mergeLidConversation, reconcileLidConversations, isLidDigits };
