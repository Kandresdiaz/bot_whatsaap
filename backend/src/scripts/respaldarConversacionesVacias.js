// Respalda a un JSON las conversaciones que no tienen NINGÚN mensaje asociado.
// Solo lectura sobre la base: no borra ni modifica nada.
//
//   node src/scripts/respaldarConversacionesVacias.js
//
// Genera respaldo_conversaciones_vacias.json en la raíz de backend/.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db/supabase');

// PostgREST corta cada respuesta en ~1000 filas: hay que paginar.
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
  const conversaciones = await traerTodo('conversations', '*');
  const mensajes = await traerTodo('messages', 'conversation_id');

  const conMensajes = new Set(mensajes.map(m => m.conversation_id));
  const vacias = conversaciones.filter(c => !conMensajes.has(c.id));

  console.log('conversaciones totales :', conversaciones.length);
  console.log('mensajes totales       :', mensajes.length);
  console.log('sin ningún mensaje     :', vacias.length);
  console.log('con al menos un mensaje:', conversaciones.length - vacias.length);

  // Salvaguardas: ninguna candidata debería tener contenido.
  const sospechosas = vacias.filter(c => conMensajes.has(c.id) || c.last_message);
  console.log('candidatas con contenido (debe ser 0):', sospechosas.length);

  const destino = path.join(__dirname, '../../respaldo_conversaciones_vacias.json');
  fs.writeFileSync(destino, JSON.stringify(vacias, null, 2));
  console.log('');
  console.log('respaldo escrito:', destino);
  console.log('tamaño:', (fs.statSync(destino).size / 1024).toFixed(0), 'KB');
  process.exit(0);
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
