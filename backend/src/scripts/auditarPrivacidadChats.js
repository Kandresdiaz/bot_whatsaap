// Audita el aislamiento entre cuentas de las conversaciones ya guardadas.
//
// Los bugs que se corrigieron en el código (caché de IA compartido, búsqueda de
// conversación solo por contact_phone y filas guardadas con session_id nulo)
// dejaron rastro en la base de datos: filas huérfanas y chats donde se mezclaron
// mensajes de dos negocios. Arreglar el código no limpia lo que ya quedó escrito.
//
//   node src/scripts/auditarPrivacidadChats.js             (solo informe, no toca nada)
//   node src/scripts/auditarPrivacidadChats.js --confirmar (respalda y borra las huérfanas)
//
// Con --confirmar SOLO se borran las conversaciones huérfanas (session_id nulo o
// apuntando a una sesión que ya no existe): no son visibles para ningún negocio y
// no se pueden atribuir a nadie. Antes de borrarlas se guarda un respaldo JSON.
// Los chats con mensajes mezclados NO se tocan: hay que revisarlos a mano porque
// no hay forma de saber qué mensaje era de cada negocio.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db/supabase');

const CONFIRMAR = process.argv.includes('--confirmar');

const traerTodo = async (tabla, columnas) => {
  let acumulado = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await supabase.from(tabla).select(columnas).range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    acumulado = acumulado.concat(data || []);
    if (!data || data.length < 1000) break;
    desde += 1000;
  }
  return acumulado;
};

const main = async () => {
  if (!supabase) {
    console.error('Sin conexión a Supabase: define SUPABASE_URL y SUPABASE_SERVICE_KEY.');
    process.exit(1);
  }

  const sesiones = await traerTodo('whatsapp_sessions', 'id, user_id, phone_number, last_phone');

  // owner_phone solo existe si ya se ejecutó la migración 008.
  let conversaciones;
  let hayOwnerPhone = true;
  try {
    conversaciones = await traerTodo('conversations', 'id, session_id, contact_phone, contact_name, last_message, last_message_at, owner_phone');
  } catch (_) {
    hayOwnerPhone = false;
    conversaciones = await traerTodo('conversations', 'id, session_id, contact_phone, contact_name, last_message, last_message_at');
  }

  const sesionPorId = new Map(sesiones.map(s => [s.id, s]));

  const huerfanas = conversaciones.filter(c => !c.session_id || !sesionPorId.has(c.session_id));

  // Un mismo número atendido por varios negocios es legítimo (un cliente le puede
  // escribir a dos negocios del SaaS), pero es justo donde pegaban los bugs: si ves
  // en un chat respuestas que hablan de otro negocio, el cruce fue aquí.
  const porTelefono = new Map();
  for (const c of conversaciones) {
    const tel = (c.contact_phone || '').replace(/[^0-9]/g, '');
    if (!tel || !c.session_id) continue;
    const dueno = sesionPorId.get(c.session_id)?.user_id;
    if (!dueno) continue;
    if (!porTelefono.has(tel)) porTelefono.set(tel, new Map());
    porTelefono.get(tel).set(dueno, c);
  }
  const compartidos = [...porTelefono.entries()].filter(([, duenos]) => duenos.size > 1);

  console.log(`\nSesiones de WhatsApp: ${sesiones.length}`);
  console.log(`Conversaciones totales: ${conversaciones.length}`);
  console.log(`\n1) Conversaciones huérfanas (sin sesión válida): ${huerfanas.length}`);
  for (const c of huerfanas.slice(0, 20)) {
    console.log(`   - ${c.contact_phone} (${c.contact_name || 's/n'}) session_id=${c.session_id || 'NULL'} · ${c.last_message_at || 's/f'}`);
  }
  if (huerfanas.length > 20) console.log(`   ... y ${huerfanas.length - 20} más`);

  console.log(`\n2) Números atendidos por más de una cuenta: ${compartidos.length}`);
  for (const [tel, duenos] of compartidos.slice(0, 20)) {
    console.log(`   - ${tel} → ${duenos.size} cuentas: ${[...duenos.keys()].join(', ')}`);
  }
  if (compartidos.length > 20) console.log(`   ... y ${compartidos.length - 20} más`);
  console.log('   (Revisa estos chats en el panel: son los únicos donde el bug pudo mezclar mensajes.)');

  const digitos = (v) => (v || '').toString().replace(/[^0-9]/g, '');

  if (!hayOwnerPhone) {
    console.log('\n3) Chats de un WhatsApp anterior: no se puede saber (falta la migración 008).');
  } else {
    // Chats marcados con un número que ya no es el vinculado a esa cuenta: son los que
    // antes seguían apareciendo en el panel al conectar otro WhatsApp. Con la migración
    // 008 desplegada ya no se ven, pero siguen ocupando espacio en la base.
    const deOtroNumero = conversaciones.filter(c => {
      const s = sesionPorId.get(c.session_id);
      if (!s) return false;
      const actual = digitos(s.phone_number) || digitos(s.last_phone);
      const dueno = digitos(c.owner_phone);
      return actual && dueno && actual !== dueno;
    });
    console.log(`\n3) Chats de un WhatsApp anterior (ya no se muestran en el panel): ${deOtroNumero.length}`);
    const porNumero = new Map();
    for (const c of deOtroNumero) {
      const d = digitos(c.owner_phone);
      porNumero.set(d, (porNumero.get(d) || 0) + 1);
    }
    for (const [num, cuantos] of porNumero) console.log(`   - número ${num}: ${cuantos} chats`);

    const sinDueno = conversaciones.filter(c => c.session_id && sesionPorId.has(c.session_id) && !digitos(c.owner_phone));
    if (sinDueno.length > 0) {
      console.log(`\n   Ojo: ${sinDueno.length} chats con sesión válida pero SIN número dueño.`);
      console.log('   No se muestran en el panel. Vuelve a ejecutar el UPDATE de la migración 008');
      console.log('   con el WhatsApp de esas cuentas conectado para rellenarlos.');
    }
  }

  if (!CONFIRMAR) {
    console.log('\nSimulación: no se borró nada. Añade --confirmar para borrar las huérfanas del punto 1.');
    return;
  }

  if (huerfanas.length === 0) {
    console.log('\nNo hay conversaciones huérfanas que borrar.');
    return;
  }

  const respaldo = path.join(__dirname, `respaldo_huerfanas_${Date.now()}.json`);
  const ids = huerfanas.map(c => c.id);
  const mensajes = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const { data } = await supabase.from('messages').select('*').in('conversation_id', lote);
    if (data) mensajes.push(...data);
  }
  fs.writeFileSync(respaldo, JSON.stringify({ conversaciones: huerfanas, mensajes }, null, 2), 'utf8');
  console.log(`\nRespaldo guardado en ${respaldo} (${huerfanas.length} chats, ${mensajes.length} mensajes).`);

  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    await supabase.from('messages').delete().in('conversation_id', lote);
    const { error } = await supabase.from('conversations').delete().in('id', lote);
    if (error) throw new Error(`Error borrando conversaciones: ${error.message}`);
  }
  console.log(`${huerfanas.length} conversaciones huérfanas eliminadas.`);
};

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
