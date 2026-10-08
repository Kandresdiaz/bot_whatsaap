// Etiquetas internas que el modelo añade al final de su respuesta, ej.
//   [MODIFICAR_CITA: {"fecha": "2026-10-10", "hora": "10:00:00"}]
// El cliente nunca debe verlas y sus datos se usan para guardar citas y pedidos.
//
// Los modelos a veces las dejan incompletas (olvidan el "]" final o la respuesta se corta por
// límite de tokens). Con una regex que exige "}]", la etiqueta no se leía (la cita no se
// guardaba ni se movía) Y tampoco se borraba, así que el cliente veía el JSON en el chat.
// Aquí se recorre el objeto por llaves balanceadas: el "]" es opcional.

const JSON_TAGS = [
  'NUEVA_CITA',
  'CANCELAR_CITA',
  'MODIFICAR_CITA',
  'NUEVO_PEDIDO',
  'MODIFICAR_PEDIDO',
  'DATOS_CLIENTE',
];

// Posición donde termina el objeto JSON que empieza en `start` (un "{"), o -1 si no cierra.
const findObjectEnd = (text, start) => {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
  }
  return -1;
};

// Ubica la primera etiqueta `name`: { data, start, end }. `data` es null si el JSON no se pudo
// leer (cortado o inválido), pero `start`/`end` siguen sirviendo para borrarla.
const findJsonTag = (text, name) => {
  const open = new RegExp(`\\[\\s*${name}\\s*:\\s*`, 'i').exec(text || '');
  if (!open) return null;
  const start = open.index;
  const braceAt = open.index + open[0].length;
  if (text[braceAt] !== '{') {
    const close = text.indexOf(']', braceAt);
    return { data: null, start, end: close === -1 ? text.length : close + 1 };
  }
  const objEnd = findObjectEnd(text, braceAt);
  if (objEnd === -1) return { data: null, start, end: text.length }; // cortada: se borra hasta el final
  let data = null;
  try { data = JSON.parse(text.slice(braceAt, objEnd)); } catch (_) {}
  let end = objEnd;
  const rest = /^\s*\]/.exec(text.slice(objEnd));
  if (rest) end += rest[0].length;
  return { data, start, end };
};

const parseJsonTag = (text, name) => findJsonTag(text, name)?.data || null;

// Quita todas las etiquetas internas, completas o no.
const stripInternalTags = (text) => {
  let out = text || '';
  for (const name of JSON_TAGS) {
    let found;
    while ((found = findJsonTag(out, name))) {
      out = out.slice(0, found.start) + out.slice(found.end);
    }
  }
  return out
    .replace(/\[LEAD_CALIENTE\]/gi, '')
    .replace(/\[ENVIAR_IMAGEN:[^\]]*\]?/gi, '')
    .replace(/\[[A-Z_]{4,}(?::[^\]]*)?\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
};

module.exports = { JSON_TAGS, parseJsonTag, findJsonTag, stripInternalTags };
