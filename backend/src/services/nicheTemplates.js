/**
 * Negocios predeterminados (plantillas por nicho). Sirven para configurar rápido un bot:
 * - el admin las aplica al registrar un cliente;
 * - el usuario las ve como sugerencias en "Configurar Bot" y como FAQs recomendadas en
 *   "Knowledge Base", y puede usarlas tal cual, pulirlas o escribir lo suyo.
 * "{negocio}" se reemplaza por el nombre del negocio. "[COMPLETAR: ...]" marca datos que solo
 * el negocio conoce; el panel no deja guardar mientras quede alguno.
 */
const NICHE_TEMPLATES = {
  clinica: {
    label: 'Clínica / Consultorio (médico, odontología, estética)',
    fields: {
      category: 'Consultorio médico / Odontología',
      bot_personality: 'profesional',
      main_goal: 'agendar_citas',
      appointment_duration: 30,
      description: '{negocio} es [COMPLETAR: tipo de clínica, ej. clínica odontológica] en [COMPLETAR: ciudad y barrio]. Ofrecemos [COMPLETAR: servicios principales, ej. valoración, limpieza, ortodoncia, blanqueamiento].',
      greeting_msg: '¡Hola! 👋 Bienvenid@ a {negocio}. ¿Qué servicio necesitas? Con gusto te ayudo a agendar tu cita.',
      away_msg: 'Gracias por escribir a {negocio} 🙏 Estamos fuera de horario. Déjanos tu nombre y el servicio que necesitas y te confirmamos la cita apenas abramos.',
      active_hours_start: '08:00:00',
      active_hours_end: '18:00:00',
      active_days: [1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para agendar pide: nombre completo, número de documento, celular, el servicio o motivo de consulta y el día y la hora que prefiere. Pregunta si es particular o por EPS / prepagada. Confirma la cita antes de registrarla.',
      custom_instructions: 'Nunca des diagnósticos, recomendaciones de medicamentos ni opiniones médicas: ante síntomas o dudas clínicas, ofrece una valoración con el profesional. Si el paciente describe una urgencia, dile que acuda a urgencias o llame al 123. Informa solo precios y servicios cargados.',
    },
    faqs: [
      { title: '¿Cuánto cuesta la valoración o consulta?', content: 'La valoración cuesta [COMPLETAR: precio] e incluye [COMPLETAR: qué incluye]. ¿Te la agendo?' },
      { title: '¿Atienden por EPS o prepagada?', content: '[COMPLETAR: ej. Atendemos de forma particular y con las prepagadas Sura y Colsanitas.]' },
      { title: '¿Dónde están ubicados?', content: 'Estamos en [COMPLETAR: dirección y barrio], [COMPLETAR: referencia o parqueadero].' },
      { title: '¿Qué formas de pago reciben?', content: 'Recibimos [COMPLETAR: efectivo, tarjeta, Nequi, transferencia].' },
      { title: '¿Con cuánta anticipación debo cancelar o cambiar la cita?', content: 'Te pedimos avisar con al menos [COMPLETAR: ej. 24 horas] de anticipación para reprogramar sin costo.' },
    ],
  },
  inmobiliaria: {
    label: 'Inmobiliaria (venta y arriendo)',
    fields: {
      category: 'Inmobiliaria',
      bot_personality: 'profesional',
      main_goal: 'agendar_citas',
      appointment_duration: 60,
      description: '{negocio} es una inmobiliaria en [COMPLETAR: ciudad] que [COMPLETAR: vende y/o arrienda] [COMPLETAR: apartamentos, casas, locales, lotes] en [COMPLETAR: zonas o barrios].',
      greeting_msg: '¡Hola! 👋 Bienvenid@ a {negocio}. ¿Buscas comprar o arrendar? Cuéntame la zona y tu presupuesto y te muestro opciones.',
      away_msg: 'Gracias por escribir a {negocio} 🏡 Estamos fuera de horario. Déjanos la zona, el tipo de inmueble y tu presupuesto, y un asesor te contacta mañana.',
      active_hours_start: '08:00:00',
      active_hours_end: '18:00:00',
      active_days: [1, 2, 3, 4, 5, 6],
      closing_instructions: 'Antes de ofrecer inmuebles pregunta: si busca comprar o arrendar, zona o barrio, tipo de inmueble, número de habitaciones y presupuesto. Para agendar la visita pide: nombre completo, celular, el inmueble de interés y el día y la hora que prefiere.',
      custom_instructions: 'Muestra solo inmuebles que estén en el catálogo, con su precio y características. No confirmes disponibilidad, negociaciones de precio ni aprobación de crédito: eso lo confirma un asesor. Para arriendo, menciona los requisitos cargados.',
    },
    faqs: [
      { title: '¿Qué requisitos piden para arrendar?', content: 'Para arrendar pedimos [COMPLETAR: ej. estudio con aseguradora, carta laboral, 1 codeudor con finca raíz o póliza].' },
      { title: '¿Cobran comisión?', content: '[COMPLETAR: ej. Para el comprador o arrendatario no tiene costo.]' },
      { title: '¿Puedo visitar el inmueble?', content: 'Claro, agendamos la visita con un asesor. ¿Qué día y a qué hora te queda bien?' },
      { title: '¿Ayudan con el crédito hipotecario o leasing?', content: '[COMPLETAR: ej. Te asesoramos con los bancos aliados, pero la aprobación depende de cada banco.]' },
      { title: '¿Reciben inmuebles para vender o arrendar?', content: 'Sí. Déjanos la dirección, el tipo de inmueble y tu celular, y un asesor te contacta para avaluarlo.' },
    ],
  },
  belleza: {
    label: 'Barbería / Peluquería / Spa / Uñas',
    fields: {
      category: 'Peluquería / Barbería',
      bot_personality: 'amigable',
      main_goal: 'agendar_citas',
      appointment_duration: 45,
      description: '{negocio} es [COMPLETAR: barbería, peluquería, spa o salón de uñas] en [COMPLETAR: ciudad y barrio]. Ofrecemos [COMPLETAR: servicios principales].',
      greeting_msg: '¡Hola! 👋 Bienvenid@ a {negocio} ✨ ¿Qué servicio te quieres hacer? Te ayudo a separar tu turno.',
      away_msg: 'Gracias por escribir a {negocio} 💈 Ya cerramos por hoy. Dinos el servicio y el día que quieres y te confirmamos el turno.',
      active_hours_start: '09:00:00',
      active_hours_end: '20:00:00',
      active_days: [1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para separar el turno pide: nombre, celular, el servicio, el día y la hora que prefiere y si quiere un profesional en especial. Confirma el turno antes de registrarlo.',
      custom_instructions: 'Informa solo los servicios y precios cargados. Si preguntan por un servicio que no está en la lista, ofrece consultarlo con un asesor.',
    },
    faqs: [
      { title: '¿Atienden sin cita?', content: '[COMPLETAR: ej. Sí, pero con cita no tienes que esperar.]' },
      { title: '¿Cuánto se demora el servicio?', content: 'Depende del servicio: [COMPLETAR: ej. corte 40 min, uñas 1 hora].' },
      { title: '¿Dónde están ubicados?', content: 'Estamos en [COMPLETAR: dirección y barrio].' },
      { title: '¿Qué formas de pago reciben?', content: 'Recibimos [COMPLETAR: efectivo, Nequi, tarjeta].' },
      { title: '¿Hay que dejar un abono para separar el turno?', content: '[COMPLETAR: ej. No, solo te pedimos llegar 5 minutos antes.]' },
    ],
  },
  distribuidora: {
    label: 'Distribuidora / Mayorista',
    fields: {
      category: 'Distribuidora / Mayorista',
      bot_personality: 'profesional',
      main_goal: 'vender',
      description: '{negocio} es una distribuidora de [COMPLETAR: qué productos] en [COMPLETAR: ciudad]. Vendemos al por mayor [COMPLETAR: y al detal] y despachamos a [COMPLETAR: ciudades o todo el país].',
      greeting_msg: '¡Hola! 👋 Te damos la bienvenida a {negocio}. ¿Qué referencia o producto estás buscando? Si quieres, te envío nuestro catálogo.',
      away_msg: 'Gracias por escribir a {negocio} 🙏 Estamos fuera de horario, pero puedes dejarnos tu pedido y te lo confirmamos a primera hora.',
      active_hours_start: '08:00:00',
      active_hours_end: '18:00:00',
      active_days: [1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para tomar el pedido pide: nombre o razón social, NIT o cédula, ciudad y dirección de entrega, y las referencias con la cantidad de cada una. Confirma el total antes de registrar el pedido. Si el cliente pregunta por pedido mínimo, descuentos por volumen o fletes y no tienes el dato, dile que un asesor se lo confirma.',
      custom_instructions: 'Atiendes a clientes que compran para revender o para su negocio: responde con precio y referencia exacta del catálogo. Nunca inventes precios, existencias ni tiempos de entrega; si no aparecen en el catálogo, ofrece pasar con un asesor.',
    },
    faqs: [
      { title: '¿Cuál es el pedido mínimo?', content: 'El pedido mínimo es de [COMPLETAR: monto o unidades].' },
      { title: '¿Hacen descuentos por cantidad?', content: '[COMPLETAR: ej. Sí: 5% desde $1.000.000 y 10% desde $3.000.000.]' },
      { title: '¿Hacen envíos a otras ciudades?', content: 'Despachamos a [COMPLETAR: ciudades] por [COMPLETAR: transportadora]. El flete [COMPLETAR: lo paga el cliente / es gratis desde cierto monto] y tarda [COMPLETAR: días].' },
      { title: '¿Qué formas de pago reciben?', content: 'Recibimos [COMPLETAR: transferencia, consignación, Nequi, crédito para clientes frecuentes].' },
      { title: '¿Dan factura electrónica?', content: '[COMPLETAR: ej. Sí, enviamos factura electrónica al correo con tu NIT o cédula.]' },
    ],
  },
  tienda: {
    label: 'Tienda (ropa, calzado, accesorios, belleza)',
    fields: {
      category: 'Tienda / E-commerce',
      bot_personality: 'amigable',
      main_goal: 'vender',
      description: '{negocio} es una tienda de [COMPLETAR: qué venden] en [COMPLETAR: ciudad]. Vendemos [COMPLETAR: en tienda física y/o en línea] con envíos a [COMPLETAR: ciudades o todo el país].',
      greeting_msg: '¡Hola! 👋 Bienvenid@ a {negocio} ✨ ¿Qué estás buscando hoy? Te puedo mostrar fotos y precios.',
      away_msg: 'Gracias por escribir a {negocio} 💛 Ya cerramos por hoy, pero cuéntanos qué te gustó y mañana te confirmamos disponibilidad.',
      active_hours_start: '09:00:00',
      active_hours_end: '19:00:00',
      active_days: [1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para cerrar el pedido pide: nombre completo, celular, ciudad, dirección exacta y la talla o color de cada producto. Pregunta la forma de pago y confirma el total antes de registrar el pedido.',
      custom_instructions: 'Cuando pregunten por un producto, muestra la foto y el precio del catálogo. No confirmes tallas, colores ni existencias que no estén en el catálogo; ofrece que un asesor lo verifique.',
    },
    faqs: [
      { title: '¿Cuánto cuesta el envío y cuánto tarda?', content: 'El envío cuesta [COMPLETAR: valor] y llega en [COMPLETAR: días]. [COMPLETAR: ej. Gratis por compras desde $150.000.]' },
      { title: '¿Tienen pago contraentrega?', content: '[COMPLETAR: ej. Sí, en las principales ciudades.]' },
      { title: '¿Puedo cambiar un producto?', content: 'Tienes [COMPLETAR: días] para cambios, con el producto sin usar y con etiquetas.' },
      { title: '¿Tienen tienda física?', content: '[COMPLETAR: dirección y horario, o "Solo vendemos en línea".]' },
      { title: '¿Qué formas de pago reciben?', content: 'Recibimos [COMPLETAR: Nequi, Daviplata, transferencia, tarjeta].' },
    ],
  },
  restaurante: {
    label: 'Restaurante / Comida a domicilio',
    fields: {
      category: 'Restaurante / Comida',
      bot_personality: 'amigable',
      main_goal: 'vender',
      description: '{negocio} es [COMPLETAR: tipo de comida, ej. comida rápida, almuerzos, pizzería] en [COMPLETAR: ciudad y barrio]. Tenemos [COMPLETAR: domicilio, para llevar y/o mesa].',
      greeting_msg: '¡Hola! 👋 Bienvenid@ a {negocio} 🍽️ ¿Quieres ver el menú o ya sabes qué vas a pedir?',
      away_msg: 'Gracias por escribir a {negocio} 🙏 En este momento estamos cerrados. Te esperamos en nuestro horario de atención.',
      active_hours_start: '11:00:00',
      active_hours_end: '21:00:00',
      active_days: [0, 1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para tomar el pedido pide: nombre, dirección exacta con barrio, celular, los platos con su cantidad y la forma de pago (efectivo, Nequi o datáfono). Confirma el total y el costo del domicilio antes de registrar el pedido.',
      custom_instructions: 'Responde con los platos y precios del menú. No prometas tiempos de entrega exactos ni platos que no estén en el menú.',
    },
    faqs: [
      { title: '¿Cuánto cuesta el domicilio?', content: 'El domicilio cuesta [COMPLETAR: valor o "depende del barrio"] y cubrimos [COMPLETAR: zonas].' },
      { title: '¿Cuánto se demora el pedido?', content: 'Normalmente entre [COMPLETAR: ej. 30 y 45 minutos], según la hora y la zona.' },
      { title: '¿Tienen opciones vegetarianas?', content: '[COMPLETAR: platos vegetarianos o "Por ahora no".]' },
      { title: '¿Qué formas de pago reciben?', content: 'Recibimos [COMPLETAR: efectivo, Nequi, datáfono].' },
      { title: '¿Hacen pedidos para eventos?', content: '[COMPLETAR: ej. Sí, con 2 días de anticipación. Cuéntanos la fecha y el número de personas.]' },
    ],
  },
  servicios: {
    label: 'Otros servicios con cita (taller, asesorías, gimnasio)',
    fields: {
      category: 'Servicios con cita',
      bot_personality: 'profesional',
      main_goal: 'agendar_citas',
      appointment_duration: 30,
      description: '{negocio} ofrece [COMPLETAR: servicios] en [COMPLETAR: ciudad y barrio].',
      greeting_msg: '¡Hola! 👋 Bienvenid@ a {negocio}. ¿Qué servicio te interesa? Te ayudo a agendar tu cita.',
      away_msg: 'Gracias por escribir a {negocio} 🙏 Estamos fuera de horario. Déjanos el servicio que necesitas y te confirmamos la cita.',
      active_hours_start: '08:00:00',
      active_hours_end: '18:00:00',
      active_days: [1, 2, 3, 4, 5, 6],
      closing_instructions: 'Para agendar pide: nombre completo, celular, el servicio y el día y la hora que prefiere. Confirma la cita antes de registrarla.',
      custom_instructions: 'Informa solo los servicios y precios cargados. No des diagnósticos ni prometas resultados; ante dudas específicas ofrece hablar con un asesor.',
    },
    faqs: [
      { title: '¿Cuánto cuesta el servicio?', content: 'El precio depende del servicio: [COMPLETAR: precios principales].' },
      { title: '¿Dónde están ubicados?', content: 'Estamos en [COMPLETAR: dirección y barrio].' },
      { title: '¿Qué formas de pago reciben?', content: 'Recibimos [COMPLETAR: efectivo, Nequi, tarjeta].' },
      { title: '¿Atienden a domicilio?', content: '[COMPLETAR: ej. Sí, con un recargo de $X / No, solo en nuestra sede.]' },
    ],
  },
};

// Campos que el admin no aplica solo al registrar un cliente: la descripción tiene datos por completar
const ADMIN_SKIP_FIELDS = new Set(['description']);

/** Lista corta para el selector del admin: [{ id, label, category }]. */
const listNicheTemplates = () =>
  Object.entries(NICHE_TEMPLATES).map(([id, t]) => ({ id, label: t.label, category: t.fields.category }));

/** Plantillas completas para las sugerencias del panel (campos y FAQs, con "{negocio}" sin reemplazar). */
const listNicheTemplatesFull = () =>
  Object.entries(NICHE_TEMPLATES).map(([id, t]) => ({ id, label: t.label, fields: t.fields, faqs: t.faqs || [] }));

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
    if (ADMIN_SKIP_FIELDS.has(key)) continue;
    const current = existing?.[key];
    const isEmpty = current === undefined || current === null || current === '' ||
      (Array.isArray(current) && current.length === 0);
    // La categoría por defecto 'General' cuenta como vacía
    if (existing && !isEmpty && !(key === 'category' && current === 'General')) continue;
    out[key] = typeof value === 'string' ? value.replace(/\{negocio\}/g, name) : value;
  }
  return out;
};

module.exports = { NICHE_TEMPLATES, listNicheTemplates, listNicheTemplatesFull, buildTemplateFields };
