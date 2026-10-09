// Páginas de nicho: cada una apunta a un grupo de búsquedas concreto en lugar de "bot de WhatsApp" genérico.
// Solo se prometen funciones que BotWA ya tiene (catálogo con fotos, pedidos, citas, notas de voz, panel).

export interface NicheChatMsg { from: 'in' | 'out'; text: string; time: string }

export interface Niche {
  slug: string;
  key: 'restaurantes' | 'clinicas';
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  pill: string;
  h1: string;
  h1Highlight: string;
  lead: string;
  chatName: string;
  chatAvatar: string;
  chat: NicheChatMsg[];
  painsTitle: string;
  pains: { icon: string; title: string; text: string }[];
  featuresTitle: string;
  features: { icon: string; title: string; text: string }[];
  setupTitle: string;
  setup: string[];
  faqs: { q: string; a: string }[];
  ctaText: string;
  waText: string;
}

export const NICHES: Record<Niche['key'], Niche> = {
  restaurantes: {
    slug: 'bot-whatsapp-restaurantes',
    key: 'restaurantes',
    metaTitle: 'Bot de WhatsApp para restaurantes y domicilios con IA',
    metaDescription:
      'Toma pedidos a domicilio por WhatsApp de forma automática: tu menú con fotos y precios, dirección, forma de pago y pedido listo en tu panel. Prueba 7 días con $0 hoy.',
    keywords: [
      'bot de whatsapp para restaurantes',
      'pedidos por whatsapp automáticos',
      'chatbot para domicilios',
      'menú por whatsapp',
      'bot whatsapp comidas rápidas',
      'automatizar pedidos restaurante colombia',
    ],
    pill: '🍔 Restaurantes · comidas rápidas · domicilios',
    h1: 'Tu restaurante toma pedidos por WhatsApp',
    h1Highlight: 'aunque estés en la cocina',
    lead:
      'BotWA contesta cada mensaje con tu menú, precios, zonas y horario de domicilio, toma la dirección y la forma de pago, y te deja el pedido listo en el panel. Sin Rappi, sin comisión por pedido.',
    chatName: 'Hamburguesas El Parche',
    chatAvatar: '🍔',
    chat: [
      { from: 'in', text: 'Buenas, ¿qué combos tienen? 🍔', time: '8:14 p. m.' },
      { from: 'out', text: '¡Hola! Tenemos el Combo Parche (hamburguesa doble + papas + gaseosa) a $28.000 y el Combo Sencillo a $21.000. Te envío la foto del menú 📸', time: '8:14 p. m.' },
      { from: 'in', text: 'Dos Parche para el barrio Laureles, pago con Nequi', time: '8:15 p. m.' },
      { from: 'out', text: '¡Listo! 2 Combo Parche = $56.000 + domicilio a Laureles $5.000. Total $61.000 por Nequi. ¿Me confirmas la dirección exacta?', time: '8:15 p. m.' },
    ],
    painsTitle: '¿Te suena esto en hora pico?',
    pains: [
      { icon: '⏳', title: 'Clientes que se cansan de esperar', text: 'Entre freír, empacar y despachar, los chats se acumulan y el cliente termina pidiendo en otro lado.' },
      { icon: '🔁', title: 'Las mismas preguntas todo el día', text: '"¿Hasta qué hora hay domicilio?", "¿cuánto vale el combo?", "¿llegan a mi barrio?". Siempre lo mismo.' },
      { icon: '💸', title: 'Comisiones que se comen la ganancia', text: 'Las apps de domicilios cobran por cada pedido. Por tu propio WhatsApp el cliente es tuyo y la venta completa también.' },
    ],
    featuresTitle: 'Lo que hace BotWA por tu restaurante',
    features: [
      { icon: '📸', title: 'Menú con fotos', text: 'Envía la foto del plato o del menú cuando el cliente pregunta. Puedes cargar el menú desde un PDF.' },
      { icon: '🛵', title: 'Pedidos completos', text: 'Pregunta productos, cantidades, dirección y forma de pago (efectivo, Nequi, transferencia) y registra el pedido.' },
      { icon: '📋', title: 'Panel de pedidos', text: 'Ves los pedidos que toma el bot en tu dashboard y las conversaciones en vivo para intervenir cuando quieras.' },
      { icon: '🎙️', title: 'Entiende notas de voz', text: 'Muchos clientes piden por audio. El bot lo entiende y responde por escrito.' },
      { icon: '🌙', title: 'Responde de noche', text: 'Si cierras a la medianoche, el bot avisa el horario y deja al cliente listo para pedir mañana.' },
      { icon: '🧠', title: 'Solo dice lo que es cierto', text: 'Responde con tu menú y tus precios. Si algo no está en tu información, no lo inventa.' },
    ],
    setupTitle: 'Listo en una tarde',
    setup: [
      'Entra con Google y crea tu panel.',
      'Sube tu menú (fotos o PDF), precios, zonas de domicilio y horario.',
      'Escanea el QR desde el WhatsApp del negocio, igual que WhatsApp Web.',
      'Pruébalo tú mismo desde el simulador antes de que hable con clientes.',
    ],
    faqs: [
      { q: '¿Funciona con el WhatsApp que ya usa mi restaurante?', a: 'Sí. Conectas tu número escaneando un QR, como WhatsApp Web. Tus clientes siguen escribiendo al mismo número de siempre.' },
      { q: '¿Puedo atender yo un pedido si quiero?', a: 'Sí. Desde el panel ves cada conversación en vivo y puedes responder tú cuando lo necesites.' },
      { q: '¿Cobra comisión por pedido?', a: 'No. Pagas un plan mensual fijo según la cantidad de mensajes; los pedidos y el dinero van directo a tu negocio.' },
      { q: '¿Qué plan necesito?', a: 'Para tomar pedidos y enviar fotos del menú, el plan Máquina de Ventas Pro. Si solo quieres responder preguntas frecuentes, el plan Vendedor Automático.' },
      { q: '¿Qué pasa si cambio precios o se acaba un plato?', a: 'Lo actualizas en el panel y el bot responde con la información nueva de inmediato.' },
    ],
    ctaText: 'Empieza tu prueba de 7 días para tu restaurante',
    waText: 'Hola, tengo un restaurante y quiero probar BotWA',
  },
  clinicas: {
    slug: 'bot-whatsapp-clinicas',
    key: 'clinicas',
    metaTitle: 'Bot de WhatsApp para clínicas y consultorios: agenda citas 24/7',
    metaDescription:
      'Agenda citas por WhatsApp automáticamente: responde precios de tratamientos, horarios y ubicación, y registra la cita en tu panel. Para odontología, estética y consultorios. Prueba 7 días.',
    keywords: [
      'bot de whatsapp para consultorio odontológico',
      'agendar citas por whatsapp automático',
      'chatbot para clínica estética',
      'bot whatsapp clínica',
      'agenda de citas whatsapp para odontólogos',
      'automatizar citas consultorio colombia',
    ],
    pill: '🦷 Odontología · estética · consultorios',
    h1: 'Tu consultorio agenda citas por WhatsApp',
    h1Highlight: 'mientras atiendes pacientes',
    lead:
      'BotWA responde precios de tratamientos, horarios, ubicación y preparación, toma los datos del paciente y deja la cita registrada en tu panel. Nadie tiene que soltar la fresa para contestar el celular.',
    chatName: 'Sonrisa Dental Centro',
    chatAvatar: '🦷',
    chat: [
      { from: 'in', text: 'Hola, ¿cuánto vale una limpieza? ¿atienden el sábado?', time: '9:52 p. m.' },
      { from: 'out', text: '¡Hola! La limpieza con valoración está en $90.000. Atendemos sábados de 8:00 a. m. a 1:00 p. m. ¿Quieres que te agende?', time: '9:52 p. m.' },
      { from: 'in', text: 'Sí, el sábado a las 10. Soy Laura Gómez', time: '9:53 p. m.' },
      { from: 'out', text: 'Perfecto, Laura 😊 Quedas agendada el sábado a las 10:00 a. m. para limpieza. Estamos en la Cra. 7 #45-20, consultorio 302.', time: '9:53 p. m.' },
    ],
    painsTitle: '¿Pasa esto en tu consultorio?',
    pains: [
      { icon: '📵', title: 'Mensajes sin responder en consulta', text: 'Mientras atiendes a un paciente, otros escriben preguntando precios y se van con quien responda primero.' },
      { icon: '🌙', title: 'Pacientes que escriben de noche', text: 'Mucha gente pide la cita después del trabajo. Si respondes al otro día, ya agendó en otro lado.' },
      { icon: '🗂️', title: 'Recepción saturada', text: 'Tu asistente pasa horas repitiendo valores, horarios y dirección en lugar de atender a quien está en sala.' },
    ],
    featuresTitle: 'Lo que hace BotWA por tu consultorio',
    features: [
      { icon: '📅', title: 'Agenda citas', text: 'Pregunta el tratamiento, el día y la hora, toma nombre y datos del paciente y registra la cita en tu panel.' },
      { icon: '💬', title: 'Responde valores y tratamientos', text: 'Limpieza, blanqueamiento, ortodoncia, botox, valoración: responde con tu lista de precios real.' },
      { icon: '📍', title: 'Ubicación y preparación', text: 'Dirección, parqueadero, cómo llegar y qué debe traer o hacer el paciente antes de la cita.' },
      { icon: '📋', title: 'Panel de citas', text: 'Ves todas las citas que agenda el bot y las conversaciones en vivo para intervenir cuando quieras.' },
      { icon: '🎙️', title: 'Entiende notas de voz', text: 'Si el paciente pregunta por audio, el bot lo entiende y responde por escrito.' },
      { icon: '🧠', title: 'No inventa', text: 'Responde solo con la información que tú cargaste. Lo que no sabe, lo deja para que lo atiendas tú.' },
    ],
    setupTitle: 'Listo en una tarde',
    setup: [
      'Entra con Google y crea tu panel.',
      'Carga tus tratamientos, valores, horarios de atención y ubicación.',
      'Escanea el QR desde el WhatsApp del consultorio, igual que WhatsApp Web.',
      'Pruébalo tú mismo desde el simulador antes de que hable con pacientes.',
    ],
    faqs: [
      { q: '¿El bot da diagnósticos o recomendaciones médicas?', a: 'No, y no debe hacerlo. Responde información administrativa (precios, horarios, ubicación, preparación) y agenda. Las preguntas clínicas las deja para el profesional.' },
      { q: '¿Funciona con el WhatsApp que ya usa mi consultorio?', a: 'Sí. Conectas el número escaneando un QR, como WhatsApp Web, y los pacientes siguen escribiendo al mismo número.' },
      { q: '¿Sirve para clínicas estéticas y spas, no solo odontología?', a: 'Sí. Funciona igual para estética, dermatología, fisioterapia, psicología y cualquier consultorio que agende por WhatsApp.' },
      { q: '¿Qué plan necesito?', a: 'Para agendar citas, el plan Máquina de Ventas Pro. Si tienes varias sedes o varias líneas de WhatsApp, el plan Dominio Agencia / VIP.' },
      { q: '¿Puedo responder yo cuando quiera?', a: 'Sí. Desde el panel ves cada conversación en vivo y puedes tomar el control en cualquier momento.' },
    ],
    ctaText: 'Empieza tu prueba de 7 días para tu consultorio',
    waText: 'Hola, tengo un consultorio y quiero probar BotWA',
  },
};

export const NICHE_LIST = Object.values(NICHES);
