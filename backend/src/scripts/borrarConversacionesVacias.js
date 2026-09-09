// Borra las conversaciones fantasma: las que no tienen NINGÚN mensaje asociado
// y tampoco last_message. Son filas creadas por la sincronización inicial de
// WhatsApp que nunca llegaron a guardar contenido, y en el panel aparecen como
// chats que al abrirlos están vacíos.
//
// Ejecuta primero respaldarConversacionesVacias.js. Este script exige que el
// respaldo exista y no borra sin el flag --confirmar.
//
//   node src/scripts/borrarConversacionesVacias.js            (simulación)
//   node src/scripts/borrarConversacionesVacias.js --confirmar (borra de verdad)
//
// Las conversaciones que SÍ tienen last_message se excluyen aunque no tengan
// mensajes: ese texto es el único rastro que queda de lo que se perdió.

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
    if (desde > 60000) break;
  }
  return acumulado;
};

(async () => {
  const respaldo = path.join(__dirname, '../../respaldo_conversaciones_vacias.json');
  if (!fs.existsSync(respaldo)) {
    console.error('No existe el respaldo. Ejecuta antes respaldarConversacionesVacias.js');
    process.exit(1);
  }

  const conversaciones = await traerTodo('conversations', 'id, contact_phone, last_message');
  const mensajes = await traerTodo('messages', 'conversation_id');
  const mensajesAntes = mensajes.length;

  const conMensajes = new Set(mensajes.map(m => m.conversation_id));
  const aBorrar = conversaciones.filter(c => !conMensajes.has(c.id) && !c.last_message);
  const preservadas = conversaciones.filter(c => !conMensajes.has(c.id) && c.last_message);

  console.log('conversaciones totales:', conversaciones.length);
  console.log('a borrar (sin mensajes y sin last_message):', aBorrar.length);
  console.log('preservadas (sin mensajes pero con last_message):', preservadas.length);

  if (!CONFIRMAR) {
    console.log('');
    console.log('SIMULACIÓN. Nada fue borrado. Añade --confirmar para ejecutar.');
    process.exit(0);
  }

  let borradas = 0;
  for (let i = 0; i < aBorrar.length; i += 200) {
    const lote = aBorrar.slice(i, i + 200).map(c => c.id);
    const { error } = await supabase.from('conversations').delete().in('id', lote);
    if (error) {
      console.error(`  lote ${i}: ${error.message}`);
      continue;
    }
    borradas += lote.length;
  }

  console.log('');
  console.log('BORRADAS:', borradas);

  // Verificar que no se tocó ni un solo mensaje.
  const conversacionesDespues = await traerTodo('conversations', 'id');
  const mensajesDespues = await traerTodo('messages', 'id');
  console.log('conversaciones ahora:', conversacionesDespues.length);
  console.log('mensajes ahora:', mensajesDespues.length,
    mensajesDespues.length === mensajesAntes ? '(intactos)' : '!! CAMBIARON');
  process.exit(0);
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
