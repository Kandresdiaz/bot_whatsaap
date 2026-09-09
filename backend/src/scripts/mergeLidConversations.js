const { supabase } = require('../db/supabase');
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '../../sessions');

async function mergeLidConversations() {
  console.log('[MergeLID] Iniciando escaneo y unificación de conversaciones LID...');

  // 1. Cargar todos los mapas de reversa de todas las carpetas de sesión
  const lidToPn = new Map();
  if (fs.existsSync(SESSIONS_DIR)) {
    const folders = fs.readdirSync(SESSIONS_DIR);
    for (const folder of folders) {
      const folderPath = path.join(SESSIONS_DIR, folder);
      try {
        if (!fs.statSync(folderPath).isDirectory()) continue;
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
          if (file.startsWith('lid-mapping-') && file.endsWith('_reverse.json')) {
            const lid = file.slice('lid-mapping-'.length, -'_reverse.json'.length);
            try {
              const raw = fs.readFileSync(path.join(folderPath, file), 'utf8');
              const pn = JSON.parse(raw);
              const cleanPn = String(pn).replace(/[^0-9]/g, '');
              if (lid && cleanPn) {
                lidToPn.set(lid, cleanPn);
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }

  console.log(`[MergeLID] ${lidToPn.size} mapeos LID->Teléfono cargados.`);

  // 2. Traer todas las conversaciones de la base de datos
  const { data: convs, error } = await supabase.from('conversations').select('*');
  if (error || !convs) {
    console.error('[MergeLID] Error cargando conversaciones:', error?.message);
    return;
  }

  console.log(`[MergeLID] Procesando ${convs.length} conversaciones en Supabase...`);

  let mergedCount = 0;
  let updatedPhoneCount = 0;

  for (const conv of convs) {
    const phone = conv.contact_phone;
    if (!phone) continue;

    // Verificar si el contact_phone es un LID
    let realPhone = lidToPn.get(phone);
    if (!realPhone) {
      for (const folder of (fs.existsSync(SESSIONS_DIR) ? fs.readdirSync(SESSIONS_DIR) : [])) {
        const filePath = path.join(SESSIONS_DIR, folder, `lid-mapping-${phone}_reverse.json`);
        if (fs.existsSync(filePath)) {
          try {
            const raw = fs.readFileSync(filePath, 'utf8');
            realPhone = String(JSON.parse(raw)).replace(/[^0-9]/g, '');
            if (realPhone) {
              lidToPn.set(phone, realPhone);
              break;
            }
          } catch (_) {}
        }
      }
    }

    if (!realPhone || realPhone === phone) continue;

    console.log(`[MergeLID] Conversación detectada con LID ${phone} (${conv.contact_name}) -> Teléfono Real: ${realPhone}`);

    let query = supabase.from('conversations').select('*').eq('contact_phone', realPhone);
    if (conv.session_id) query = query.eq('session_id', conv.session_id);
    const { data: targetConvs } = await query.order('last_message_at', { ascending: false }).limit(1);

    const target = targetConvs && targetConvs[0];

    if (target && target.id !== conv.id) {
      console.log(`  -> Fusionando con conversación existente ${target.id} (${target.contact_name})`);

      const { data: movedMsgs, error: moveErr } = await supabase
        .from('messages')
        .update({ conversation_id: target.id })
        .eq('conversation_id', conv.id)
        .select('id');

      if (moveErr) {
        console.warn(`  Aviso al mover mensajes de ${conv.id}:`, moveErr.message);
      } else {
        console.log(`  -> ${movedMsgs?.length || 0} mensajes movidos a la conversación canónica.`);
      }

      const targetTime = target.last_message_at ? new Date(target.last_message_at).getTime() : 0;
      const convTime = conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0;

      const updatePayload = {};
      if (convTime > targetTime) {
        updatePayload.last_message = conv.last_message;
        updatePayload.last_message_at = conv.last_message_at;
      }
      if (
        conv.contact_name &&
        conv.contact_name !== phone &&
        (!target.contact_name || target.contact_name === realPhone || target.contact_name === 'X' || target.contact_name.length < conv.contact_name.length)
      ) {
        updatePayload.contact_name = conv.contact_name;
      }

      if (Object.keys(updatePayload).length > 0) {
        await supabase.from('conversations').update(updatePayload).eq('id', target.id);
      }

      const { error: delErr } = await supabase.from('conversations').delete().eq('id', conv.id);
      if (delErr) {
        console.warn(`  Aviso al eliminar conversación LID ${conv.id}:`, delErr.message);
      } else {
        console.log(`  -> Conversación duplicada ${conv.id} eliminada con éxito.`);
      }

      mergedCount++;
    } else if (!target) {
      console.log(`  -> No existe conversación previa para el teléfono real. Actualizando contact_phone de ${phone} a ${realPhone}`);
      const { error: upErr } = await supabase
        .from('conversations')
        .update({ contact_phone: realPhone })
        .eq('id', conv.id);

      if (upErr) {
        console.warn(`  Aviso al actualizar contact_phone para ${conv.id}:`, upErr.message);
      } else {
        updatedPhoneCount++;
      }
    }
  }

  console.log(`[MergeLID] Limpieza completada: ${mergedCount} conversaciones fusionadas, ${updatedPhoneCount} números normalizados.`);
}

if (require.main === module) {
  mergeLidConversations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[MergeLID Fatal Error]:', err);
      process.exit(1);
    });
}

module.exports = { mergeLidConversations };
