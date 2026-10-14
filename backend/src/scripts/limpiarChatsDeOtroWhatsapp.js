// Borra los chats que quedaron de un WhatsApp anterior.
//
// POR QUÉ HACE FALTA
// Hasta la migración 008 no se guardaba qué número atendió cada chat. Para los chats
// que ya existen no hay forma de deducirlo: el relleno de la 008 los marca a todos con
// el número vinculado hoy, así que los del WhatsApp anterior siguen viéndose. La única
// salida para esos es borrarlos. De aquí en adelante ya no pasa: cada chat nuevo nace
// marcado con su número y, al detectar un cambio de número, el backend los limpia solo.
//
//   node src/scripts/limpiarChatsDeOtroWhatsapp.js --usuario correo@ejemplo.com
//       → informe: sesiones, cuántos chats y cuáles son los más recientes
//
//   node src/scripts/limpiarChatsDeOtroWhatsapp.js --usuario correo@ejemplo.com --telefono 573133942341
//       → simula el borrado SOLO de ese chat (se pueden pasar varios --telefono)
//
//   node src/scripts/limpiarChatsDeOtroWhatsapp.js --usuario correo@ejemplo.com --todos
//       → simula el borrado de TODOS los chats de esa cuenta. WhatsApp vuelve a
//         sincronizar los del número conectado en cuanto el bot se reconecte.
//
// Nada se borra sin --confirmar, y antes se guarda un respaldo JSON con los chats y
// sus mensajes.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db/supabase');

const args = process.argv.slice(2);
const CONFIRMAR = args.includes('--confirmar');
const TODOS = args.includes('--todos');

const valorDe = (bandera) => {
  const i = args.indexOf(bandera);
  return i !== -1 ? args[i + 1] : null;
};
const todosLosValores = (bandera) => {
  const out = [];
  args.forEach((a, i) => { if (a === bandera && args[i + 1]) out.push(args[i + 1]); });
  return out;
};

const digitos = (v) => (v === null || v === undefined ? '' : String(v)).replace(/[^0-9]/g, '');

const main = async () => {
  if (!supabase) {
    console.error('Sin conexión a Supabase: define SUPABASE_URL y SUPABASE_SERVICE_KEY.');
    process.exit(1);
  }

  const usuario = valorDe('--usuario');
  if (!usuario) {
    console.error('Falta --usuario <correo o user_id>. Lee la cabecera de este archivo.');
    process.exit(1);
  }

  // 1. Resolver la cuenta
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuario);
  const { data: usuarios } = await supabase
    .from('users')
    .select('id, email, name')
    .eq(esUuid ? 'id' : 'email', usuario)
    .limit(1);

  const cuenta = usuarios && usuarios[0];
  if (!cuenta) {
    console.error(`No existe ninguna cuenta con ${esUuid ? 'id' : 'correo'} ${usuario}.`);
    process.exit(1);
  }
  console.log(`\nCuenta: ${cuenta.name || '(sin nombre)'} · ${cuenta.email} · ${cuenta.id}`);

  // 2. Sus sesiones de WhatsApp
  const { data: sesiones } = await supabase
    .from('whatsapp_sessions')
    .select('id, status, phone_number, created_at')
    .eq('user_id', cuenta.id)
    .order('created_at', { ascending: false });

  const sesionIds = (sesiones || []).map(s => s.id);
  console.log(`\nSesiones de WhatsApp: ${sesionIds.length}`);
  for (const s of sesiones || []) {
    console.log(`   - ${s.id} · ${s.status} · número ${s.phone_number || '(ninguno)'} · creada ${s.created_at}`);
  }
  if (sesionIds.length === 0) {
    console.log('\nEsta cuenta no tiene sesiones: no hay chats que limpiar.');
    return;
  }

  // 3. Sus chats
  const { data: chats } = await supabase
    .from('conversations')
    .select('id, contact_phone, contact_name, last_message, last_message_at')
    .in('session_id', sesionIds)
    .order('last_message_at', { ascending: false });

  const todosLosChats = chats || [];
  console.log(`\nChats guardados: ${todosLosChats.length}`);
  for (const c of todosLosChats.slice(0, 15)) {
    const texto = (c.last_message || '').replace(/\s+/g, ' ').slice(0, 50);
    console.log(`   - ${c.contact_phone} (${c.contact_name || 's/n'}) · "${texto}" · ${c.last_message_at || 's/f'}`);
  }
  if (todosLosChats.length > 15) console.log(`   ... y ${todosLosChats.length - 15} más`);

  // 4. Qué se va a borrar
  const telefonos = todosLosValores('--telefono').map(digitos).filter(Boolean);
  let aBorrar = [];

  if (TODOS) {
    aBorrar = todosLosChats;
  } else if (telefonos.length > 0) {
    aBorrar = todosLosChats.filter(c => telefonos.includes(digitos(c.contact_phone)));
    const noEncontrados = telefonos.filter(t => !todosLosChats.some(c => digitos(c.contact_phone) === t));
    for (const t of noEncontrados) console.log(`\nAviso: no hay ningún chat con el número ${t} en esta cuenta.`);
  } else {
    console.log('\nSolo informe. Añade --telefono <número> (uno o varios) o --todos para elegir qué borrar.');
    return;
  }

  console.log(`\nSe borrarían ${aBorrar.length} chats y todos sus mensajes.`);
  if (aBorrar.length === 0) return;

  if (!CONFIRMAR) {
    console.log('Simulación: no se borró nada. Repite el comando con --confirmar.');
    return;
  }

  // 5. Respaldo y borrado
  const ids = aBorrar.map(c => c.id);
  const mensajes = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const { data } = await supabase.from('messages').select('*').in('conversation_id', lote);
    if (data) mensajes.push(...data);
  }

  const respaldo = path.join(__dirname, `respaldo_chats_${cuenta.id}_${Date.now()}.json`);
  fs.writeFileSync(respaldo, JSON.stringify({ cuenta, chats: aBorrar, mensajes }, null, 2), 'utf8');
  console.log(`\nRespaldo guardado en ${respaldo} (${aBorrar.length} chats, ${mensajes.length} mensajes).`);

  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    await supabase.from('messages').delete().in('conversation_id', lote);
    const { error } = await supabase.from('conversations').delete().in('id', lote);
    if (error) throw new Error(`Error borrando chats: ${error.message}`);
  }

  console.log(`${aBorrar.length} chats eliminados.`);
  console.log('El panel se actualiza solo en unos segundos: no hace falta desconectar ni reescanear.');
};

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
