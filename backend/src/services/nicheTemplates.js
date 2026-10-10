/**
 * Plantillas de configuración por nicho para dar de alta clientes rápido desde el admin.
 * Llenan lo que es igual para todos los negocios del nicho (personalidad, objetivo, mensajes,
 * horario típico, cierre). Lo propio de cada negocio (descripción, link de pago, catálogo)
 * se completa después. "{negocio}" se reemplaza por el nombre del negocio.
 */
const NICHE_TEMPLATES = {
  distribuidora: {
    label: 'Distribuidora / Mayorista',
    fields: {
      category: 'Distribuidora / Mayorista',
      bot_personality: 'profesional',
      main_goal: 'vender',
      greeting_msg: '¡Hola! 👋 Te damos la bienvenida a {negocio}. ¿Qué referencia o producto estás buscando? Si quieres, te envío nuestro catálogo.',
      away_msg: 'Gracias por escribir a {negocio} 🙏 Estamos fuera de horario, pero puedes dejarnos tu pedido y te lo confirmamos a primera hora.',
      active_hours_start: '08:00:00',
      active_hours_end: '18:00:00',
      active_days: [1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para tomar el pedido pide: nombre o razón social, NIT o cédula, ciudad y dirección de entrega, y las referencias con la cantidad de cada una. Confirma el total antes de registrar el pedido. Si el cliente pregunta por pedido mínimo, descuentos por volumen o fletes y no tienes el dato, dile que un asesor se lo confirma.',
      custom_instructions: 'Atiendes a clientes que compran para revender o para su negocio: responde con precio y referencia exacta del catálogo. Nunca inventes precios, existencias ni tiempos de entrega; si no aparecen en el catálogo, ofrece pasar con un asesor.',
    },
  },
  tienda: {
    label: 'Tienda (ropa, calzado, accesorios, belleza)',
    fields: {
      category: 'Tienda / E-commerce',
      bot_personality: 'amigable',
      main_goal: 'vender',
      greeting_msg: '¡Hola! 👋 Bienvenid@ a {negocio} ✨ ¿Qué estás buscando hoy? Te puedo mostrar fotos y precios.',
      away_msg: 'Gracias por escribir a {negocio} 💛 Ya cerramos por hoy, pero cuéntanos qué te gustó y mañana te confirmamos disponibilidad.',
      active_hours_start: '09:00:00',
      active_hours_end: '19:00:00',
      active_days: [1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para cerrar el pedido pide: nombre completo, celular, ciudad, dirección exacta y la talla o color de cada producto. Pregunta la forma de pago y confirma el total antes de registrar el pedido.',
      custom_instructions: 'Cuando pregunten por un producto, muestra la foto y el precio del catálogo. No confirmes tallas, colores ni existencias que no estén en el catálogo; ofrece que un asesor lo verifique.',
    },
  },
  restaurante: {
    label: 'Restaurante / Comida a domicilio',
    fields: {
      category: 'Restaurante / Comida',
      bot_personality: 'amigable',
      main_goal: 'vender',
      greeting_msg: '¡Hola! 👋 Bienvenid@ a {negocio} 🍽️ ¿Quieres ver el menú o ya sabes qué vas a pedir?',
      away_msg: 'Gracias por escribir a {negocio} 🙏 En este momento estamos cerrados. Te esperamos en nuestro horario de atención.',
      active_hours_start: '11:00:00',
      active_hours_end: '21:00:00',
      active_days: [0, 1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para tomar el pedido pide: nombre, dirección exacta con barrio, celular, los platos con su cantidad y la forma de pago (efectivo, Nequi o datáfono). Confirma el total y el costo del domicilio antes de registrar el pedido.',
      custom_instructions: 'Responde con los platos y precios del menú. No prometas tiempos de entrega exactos ni platos que no estén en el menú.',
    },
  },
  servicios: {
    label: 'Servicios con cita (barbería, spa, consultorio, taller)',
    fields: {
      category: 'Servicios con cita',
      bot_personality: 'profesional',
      main_goal: 'agendar_citas',
      appointment_duration: 30,
      greeting_msg: '¡Hola! 👋 Bienvenid@ a {negocio}. ¿Qué servicio te interesa? Te ayudo a agendar tu cita.',
      away_msg: 'Gracias por escribir a {negocio} 🙏 Estamos fuera de horario. Déjanos el servicio que necesitas y te confirmamos la cita.',
      active_hours_start: '08:00:00',
      active_hours_end: '18:00:00',
      active_days: [1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para agendar pide: nombre completo, celular, el servicio y el día y la hora que prefiere. Confirma la cita antes de registrarla.',
      custom_instructions: 'Informa solo los servicios y precios cargados. No des diagnósticos ni prometas resultados; ante dudas específicas ofrece hablar con un asesor.',
    },
  },
};

/** Lista para el selector del admin: [{ id, label }]. */
const listNicheTemplates = () =>
  Object.entries(NICHE_TEMPLATES).map(([id, t]) => ({ id, label: t.label, category: t.fields.category }));

/**
 * Campos de la plantilla listos para guardar en `businesses`, con el nombre del negocio aplicado.
 * Si se pasa `existing`, solo devuelve los campos que el negocio aún tiene vacíos (nunca pisa
 * lo que ya configuró). Devuelve null si la plantilla no existe.
 */
const buildTemplateFields = (templateId, businessName, existing = null) => {
  const template = NICHE_TEMPLATES[templateId];
  if (!template) return null;

  const name = (businessName || existing?.name || '').trim() || 'nuestro negocio';
  const out = {};
  for (const [key, value] of Object.entries(template.fields)) {
    const current = existing?.[key];
    const isEmpty = current === undefined || current === null || current === '' ||
      (Array.isArray(current) && current.length === 0);
    // La categoría por defecto 'General' cuenta como vacía
    if (existing && !isEmpty && !(key === 'category' && current === 'General')) continue;
    out[key] = typeof value === 'string' ? value.replace(/\{negocio\}/g, name) : value;
  }
  return out;
};

module.exports = { NICHE_TEMPLATES, listNicheTemplates, buildTemplateFields };
