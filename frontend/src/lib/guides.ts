// Guías del blog: contenido útil para búsquedas de "cómo hacer X" de cada nicho.
// Cada guía enlaza a su página de nicho, que es la que convierte.
import type { Niche } from './niches';

// `outro`: párrafos que van después de la lista.
export interface GuideSection { h2: string; paragraphs?: string[]; list?: string[]; outro?: string[] }

export interface Guide {
  slug: string;
  niche: Niche['key'];
  title: string;
  description: string;
  published: string; // YYYY-MM-DD
  updated: string;
  intro: string;
  sections: GuideSection[];
  faqs?: { q: string; a: string }[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'como-recibir-pedidos-por-whatsapp-restaurante',
    niche: 'restaurantes',
    title: 'Cómo recibir pedidos por WhatsApp en tu restaurante sin perder ventas',
    description:
      'Guía práctica para organizar los pedidos a domicilio por WhatsApp: menú, mensajes listos, datos que debes pedir y cómo automatizarlo.',
    published: '2026-10-09',
    updated: '2026-10-09',
    intro:
      'En Colombia la mayoría de domicilios de barrio se piden por WhatsApp. El problema no es que lleguen pedidos, sino responderlos rápido en hora pico. Esta guía te muestra cómo ordenarlo, primero a mano y luego con un bot.',
    sections: [
      {
        h2: '1. Ten un menú que se pueda enviar en un mensaje',
        paragraphs: [
          'El cliente quiere ver precios antes de preguntar. Ten una foto clara del menú (o un PDF corto) con nombre del plato, precio y qué incluye cada combo. Evita menús de 6 páginas: si no cabe en una pantalla, separa por categorías.',
        ],
      },
      {
        h2: '2. Define los datos que necesitas en cada pedido',
        paragraphs: ['Pedir los datos en desorden es lo que más alarga una conversación. Pide siempre lo mismo y en el mismo orden:'],
        list: [
          'Productos y cantidades (con adiciones o "sin cebolla").',
          'Dirección completa con barrio y punto de referencia.',
          'Nombre y teléfono de quien recibe.',
          'Forma de pago: efectivo (¿con cuánto paga?), Nequi o transferencia.',
        ],
      },
      {
        h2: '3. Publica tus zonas y costos de domicilio',
        paragraphs: [
          'La pregunta "¿llegan a mi barrio?" se repite decenas de veces al día. Escribe una lista de barrios o zonas con su costo de envío y el monto mínimo para envío gratis. Así respondes en segundos y el cliente ya sabe el total.',
        ],
      },
      {
        h2: '4. Usa respuestas rápidas… y luego automatiza',
        paragraphs: [
          'WhatsApp Business permite guardar respuestas rápidas, lo cual ayuda, pero alguien igual tiene que leer y contestar cada chat. Cuando pasas de 30 o 40 pedidos por noche, eso ya no alcanza.',
          'Un bot con IA como BotWA lee el mensaje, responde con tu menú y precios reales, toma los datos del pedido en orden y te lo deja registrado en el panel. Tú solo cocinas y despachas.',
        ],
      },
      {
        h2: '5. Revisa los pedidos que no se cerraron',
        paragraphs: [
          'Al final del día mira las conversaciones donde el cliente preguntó pero no pidió. Casi siempre hay un patrón: el domicilio es caro, falta un plato que buscan o el horario no está claro. Ajusta eso y vendes más sin gastar en publicidad.',
        ],
      },
    ],
  },
  {
    slug: 'automatizar-whatsapp-restaurante-sin-comisiones',
    niche: 'restaurantes',
    title: 'Domicilios propios por WhatsApp vs. apps de delivery: cuánto ahorras',
    description:
      'Compara el costo de vender por apps de domicilios frente a tu propio WhatsApp automatizado y aprende a mover a tus clientes frecuentes a tu canal.',
    published: '2026-10-09',
    updated: '2026-10-09',
    intro:
      'Las apps de domicilios te dan visibilidad, pero cada pedido paga comisión. La estrategia que usan muchos restaurantes de barrio es simple: usar las apps para que te conozcan y llevar a los clientes que repiten a su propio WhatsApp.',
    sections: [
      {
        h2: 'Haz la cuenta con tus números',
        paragraphs: [
          'Toma tus pedidos de un mes por apps y multiplica por la comisión que pagas. Compáralo con el costo fijo de atender esos mismos pedidos por tu WhatsApp. Para un negocio con ventas constantes, la diferencia suele pagar varias veces una herramienta de automatización.',
        ],
      },
      {
        h2: 'Cómo llevar clientes a tu WhatsApp',
        list: [
          'Incluye en cada bolsa una tarjeta con tu número y un beneficio por pedir directo (papas gratis, envío gratis desde cierto monto).',
          'Pon el número en tu perfil de Instagram, Google Maps y en el empaque.',
          'Usa un enlace wa.me con un mensaje prellenado, por ejemplo "Hola, quiero ver el menú".',
        ],
      },
      {
        h2: 'El riesgo: no dar abasto',
        paragraphs: [
          'Si mueves pedidos a WhatsApp pero tardas 15 minutos en responder, el cliente vuelve a la app. Por eso el paso siguiente es automatizar la atención: un bot que responda al instante con el menú, tome el pedido y lo registre.',
        ],
      },
      {
        h2: 'Qué buscar en un bot para restaurante',
        list: [
          'Que responda con tu menú y precios reales, sin inventar.',
          'Que pueda enviar fotos de los platos.',
          'Que entienda notas de voz, porque muchos clientes piden por audio.',
          'Que te deje ver y tomar cualquier conversación cuando quieras.',
          'Que no cobre comisión por pedido.',
        ],
      },
    ],
  },
  {
    slug: 'como-agendar-citas-por-whatsapp-consultorio',
    niche: 'clinicas',
    title: 'Cómo agendar citas por WhatsApp en tu consultorio sin saturar la recepción',
    description:
      'Paso a paso para organizar el agendamiento por WhatsApp en clínicas odontológicas, estéticas y consultorios: qué preguntar, qué responder y cómo automatizarlo.',
    published: '2026-10-09',
    updated: '2026-10-09',
    intro:
      'Para muchos pacientes WhatsApp es la forma natural de pedir una cita. Si en tu consultorio la recepción vive pegada al celular, esta guía te ayuda a ordenar el proceso y a decidir cuándo vale la pena automatizarlo.',
    sections: [
      {
        h2: '1. Escribe las respuestas que más repites',
        paragraphs: ['Antes de automatizar nada, haz una lista con las preguntas que más llegan. En casi todos los consultorios son las mismas:'],
        list: [
          '¿Cuánto vale la valoración o la consulta?',
          '¿Cuánto vale el tratamiento X (limpieza, blanqueamiento, ortodoncia, botox)?',
          '¿Qué horario tienen? ¿Atienden sábados?',
          '¿Dónde quedan? ¿Hay parqueadero?',
          '¿Reciben mi EPS o prepagada?',
        ],
      },
      {
        h2: '2. Define qué datos pides para agendar',
        paragraphs: [
          'Nombre completo, teléfono, tratamiento o motivo de consulta, y día y hora preferidos. Si pides la cédula u otros datos sensibles, hazlo solo cuando sea necesario y explica para qué.',
        ],
      },
      {
        h2: '3. Separa lo administrativo de lo clínico',
        paragraphs: [
          'Precios, horarios, ubicación y preparación se pueden responder siempre igual. Las preguntas clínicas ("¿esto es normal?", "¿qué me tomo?") deben pasar al profesional. Tener esto claro es la base para automatizar sin riesgos.',
        ],
      },
      {
        h2: '4. Automatiza la parte repetitiva',
        paragraphs: [
          'Un bot con IA como BotWA responde la parte administrativa con tu información real, toma los datos del paciente y registra la cita en tu panel, incluso a las 10 de la noche. Las conversaciones quedan visibles para que tu equipo intervenga cuando haga falta.',
        ],
      },
      {
        h2: '5. Mide cuántas citas llegan fuera de horario',
        paragraphs: [
          'Revisa a qué hora se agendan las citas. En muchos consultorios una parte importante llega de noche o en fin de semana, justo cuando nadie contesta. Ese es el número que te dice cuánto te está costando no responder.',
        ],
      },
    ],
  },
  {
    slug: 'mensajes-whatsapp-para-clinica-odontologica',
    niche: 'clinicas',
    title: 'Plantillas de mensajes de WhatsApp para clínicas odontológicas y estéticas',
    description:
      'Mensajes listos para copiar: bienvenida, precios, confirmación de cita, indicaciones antes del procedimiento y seguimiento después de la consulta.',
    published: '2026-10-09',
    updated: '2026-10-09',
    intro:
      'Responder bien por WhatsApp es parte de la experiencia del paciente. Estas plantillas te sirven para estandarizar las respuestas de tu equipo, y son también la base de la información que le das a un bot.',
    sections: [
      {
        h2: 'Bienvenida',
        paragraphs: [
          '"¡Hola! Gracias por escribir a [Nombre de la clínica] 😊 ¿En qué te podemos ayudar? Puedes preguntarnos por valores, horarios o agendar tu cita."',
        ],
      },
      {
        h2: 'Precio de un tratamiento',
        paragraphs: [
          '"La [limpieza / valoración / sesión] tiene un valor de $[precio] e incluye [qué incluye]. Dura aproximadamente [tiempo]. ¿Te gustaría agendarla? Tenemos disponibilidad [días]."',
        ],
      },
      {
        h2: 'Confirmación de cita',
        paragraphs: [
          '"Listo, [Nombre] ✅ Tu cita para [tratamiento] quedó el [día] a las [hora]. Estamos en [dirección]. Si necesitas cambiarla, escríbenos con al menos 24 horas de anticipación."',
        ],
      },
      {
        h2: 'Indicaciones antes del procedimiento',
        paragraphs: [
          '"Para tu cita de [procedimiento] te recomendamos: [indicación 1], [indicación 2]. Llega 10 minutos antes y trae tu documento."',
        ],
      },
      {
        h2: 'Seguimiento después de la consulta',
        paragraphs: [
          '"Hola [Nombre], ¿cómo te has sentido después de tu [procedimiento]? Cualquier duda nos escribes. Recuerda que tu próximo control es en [tiempo]."',
        ],
      },
      {
        h2: 'Cómo usar estas plantillas con un bot',
        paragraphs: [
          'Si cargas tus precios, horarios, dirección e indicaciones en BotWA, el bot responde con este mismo estilo pero adaptado a cada pregunta, y registra la cita cuando el paciente confirma. Tu equipo solo revisa y atiende lo clínico.',
        ],
      },
    ],
  },
  {
    slug: 'cuanto-cuesta-bot-whatsapp-restaurante',
    niche: 'restaurantes',
    title: 'Cuánto cuesta un bot de WhatsApp para restaurante en Colombia (2026)',
    description:
      'Precios reales de un bot de WhatsApp con IA para restaurantes, qué incluye cada plan y cómo saber si se paga solo con los pedidos que hoy pierdes.',
    published: '2026-10-28',
    updated: '2026-10-28',
    intro:
      'Si tu restaurante recibe pedidos por WhatsApp, la pregunta no es solo cuánto cuesta un bot, sino cuánto te cuesta no responder a tiempo. Aquí tienes los precios, qué incluye cada opción y una forma simple de hacer la cuenta con tus números.',
    sections: [
      {
        h2: 'Las tres formas de atender el WhatsApp de un restaurante',
        list: [
          'Tú o alguien de tu equipo, a mano: no cuesta dinero extra, pero en hora pico alguien deja de cocinar o despachar para contestar, y los chats se acumulan.',
          'Contratar a una persona solo para el WhatsApp: resuelve la hora pico, pero es un salario con prestaciones y solo cubre su turno.',
          'Un bot con IA: un pago mensual fijo, responde todos los chats al mismo tiempo y a cualquier hora, y tú intervienes cuando quieras.',
        ],
      },
      {
        h2: 'Cuánto cuesta BotWA',
        paragraphs: ['Todos los planes incluyen 7 días de prueba con $0 hoy y se cancelan con un clic.'],
        list: [
          'Vendedor Automático — $120.000 COP/mes: responde preguntas de menú, precios, horarios y zonas. Hasta 1.500 mensajes IA al mes.',
          'Máquina de Ventas Pro — $249.000 COP/mes: además envía fotos de los platos y el menú en PDF, toma pedidos completos y los deja en tu panel. Hasta 5.000 mensajes IA al mes. Es el plan que usan la mayoría de restaurantes con domicilio.',
          'Dominio Agencia / VIP — $490.000 COP/mes: varias líneas de WhatsApp (por ejemplo, varias sedes) y hasta 20.000 mensajes IA al mes.',
        ],
      },
      {
        h2: 'Haz la cuenta: ¿se paga solo?',
        paragraphs: [
          'Toma tu ticket promedio de domicilio. Si es de $35.000 y el plan Pro cuesta $249.000, necesitas recuperar unos 8 pedidos al mes para cubrirlo: 2 por semana. Piensa cuántos chats quedan sin responder un viernes en la noche y tendrás la respuesta.',
          'Si quieres hacerlo con tus números exactos, usa nuestra calculadora gratuita de ventas perdidas por WhatsApp.',
        ],
      },
      {
        h2: 'Costos que no se ven',
        list: [
          'Comisión por pedido: BotWA no cobra comisión. El cliente y el dinero son tuyos.',
          'Mensajes: cada plan tiene un límite mensual. Un pedido normal se resuelve en pocos mensajes, así que el plan Pro alcanza para cientos de pedidos al mes.',
          'Configuración: la haces tú en una tarde (menú, precios, zonas y horario) y escaneas un QR. No hay costo de instalación.',
        ],
      },
      {
        h2: 'Qué revisar antes de pagar cualquier bot',
        list: [
          'Que responda con tu menú y precios reales y no invente.',
          'Que entienda notas de voz.',
          'Que puedas ver todas las conversaciones y responder tú cuando quieras.',
          'Que te deje probarlo con clientes reales antes de cobrarte.',
        ],
      },
    ],
    faqs: [
      { q: '¿Hay que pagar instalación?', a: 'No. Te registras con Google, cargas tu menú y escaneas un QR. El pago es solo la mensualidad del plan.' },
      { q: '¿Cobra comisión por pedido?', a: 'No. Pagas un valor mensual fijo; todo lo que vendes es tuyo.' },
      { q: '¿Qué pasa si me paso de mensajes?', a: 'Puedes subir de plan en cualquier momento desde el panel.' },
    ],
  },
  {
    slug: 'whatsapp-business-vs-bot-ia-restaurante',
    niche: 'restaurantes',
    title: 'WhatsApp Business vs. bot con IA para restaurantes: cuál te conviene',
    description:
      'Comparación honesta entre las respuestas rápidas de WhatsApp Business y un bot con inteligencia artificial para tomar pedidos de domicilio.',
    published: '2026-10-28',
    updated: '2026-10-28',
    intro:
      'WhatsApp Business es gratis y tiene herramientas útiles. Entonces, ¿para qué pagar un bot? Depende de cuántos chats recibes y de quién los contesta. Esta comparación te ayuda a decidir.',
    sections: [
      {
        h2: 'Lo que WhatsApp Business ya hace bien',
        list: [
          'Mensaje de bienvenida y de ausencia automáticos.',
          'Respuestas rápidas: escribes "/menu" y se pega un texto guardado.',
          'Catálogo de productos y etiquetas para organizar chats.',
        ],
        outro: ['Si recibes pocos pedidos al día y siempre hay alguien libre para contestar, con esto alcanza.'],
      },
      {
        h2: 'Dónde se queda corto',
        list: [
          'Alguien tiene que leer cada mensaje y escoger la respuesta. En hora pico esa persona no existe.',
          'El mensaje de ausencia no toma pedidos: solo dice "te respondemos luego", y el cliente se va.',
          'No entiende preguntas distintas: "¿la hawaiana tiene piña?" o "¿llegan a Belén?" necesitan a una persona.',
          'No sabe tomar el pedido completo (productos, dirección, pago) por su cuenta.',
        ],
      },
      {
        h2: 'Lo que agrega un bot con IA',
        paragraphs: [
          'Un bot como BotWA lee cada mensaje, entiende lo que el cliente quiere (aunque lo escriba con errores o por nota de voz) y responde con tu información real: menú, precios, zonas y horario. Toma el pedido completo, lo deja en tu panel y puedes entrar a cualquier conversación cuando quieras.',
        ],
      },
      {
        h2: 'Cómo decidir',
        list: [
          'Menos de 10 pedidos al día y alguien libre: quédate con WhatsApp Business y sus respuestas rápidas.',
          'Más de 20 pedidos al día o chats sin responder en la noche: un bot con IA se paga con los pedidos que hoy pierdes.',
          'Entre los dos: prueba el bot 7 días con $0 y compara cuántos pedidos tomó.',
        ],
      },
      {
        h2: '¿Puedo usar los dos?',
        paragraphs: [
          'BotWA se conecta a tu número escaneando un QR, como WhatsApp Web. Tu número y tus clientes siguen siendo los mismos; solo que ahora alguien responde siempre.',
        ],
      },
    ],
  },
  {
    slug: 'como-enviar-menu-por-whatsapp-pdf-o-fotos',
    niche: 'restaurantes',
    title: 'Cómo enviar el menú por WhatsApp: ¿PDF, fotos o texto?',
    description:
      'Qué formato de menú vende más por WhatsApp, cómo armarlo para que se lea en el celular y cómo hacer que se envíe solo cada vez que un cliente lo pide.',
    published: '2026-10-28',
    updated: '2026-10-28',
    intro:
      '"¿Me regalas el menú?" es probablemente el mensaje que más recibe tu restaurante. La forma en que lo envías cambia cuánto vendes. Estas son las opciones y cuándo usar cada una.',
    sections: [
      {
        h2: 'Fotos: la que más abre el apetito',
        paragraphs: [
          'Una foto clara del plato vende más que cualquier descripción. Úsala para los productos estrella y los combos. Desventaja: si mandas 15 fotos seguidas, el cliente se pierde.',
        ],
      },
      {
        h2: 'PDF: el menú completo en un solo archivo',
        paragraphs: [
          'Ideal cuando tienes muchas categorías. Para que funcione en el celular: una página por categoría, letra grande, precio al lado de cada plato y nada de fondos oscuros con letra delgada. Que pese menos de 5 MB para que abra rápido con datos móviles.',
        ],
      },
      {
        h2: 'Texto: rápido y fácil de copiar',
        paragraphs: [
          'Una lista corta por categoría ("Hamburguesas: Sencilla $18.000, Doble $24.000…") se lee sin descargar nada y el cliente puede copiar lo que quiere. Funciona muy bien para menús del día.',
        ],
      },
      {
        h2: 'La combinación que mejor funciona',
        list: [
          'Primer mensaje: texto corto con las categorías y los más pedidos.',
          'Si pregunta por un plato: la foto de ese plato.',
          'Si pide "el menú completo": el PDF.',
        ],
      },
      {
        h2: 'Cómo hacer que se envíe solo',
        paragraphs: [
          'En BotWA subes tu menú en PDF y las fotos de tus productos una vez. Cuando un cliente pide "el menú", el bot envía el PDF; cuando pregunta por un plato, envía su foto y su precio, y sigue con el pedido. Tú no tocas el celular.',
        ],
      },
    ],
  },
  {
    slug: 'mensajes-whatsapp-para-restaurantes-plantillas',
    niche: 'restaurantes',
    title: 'Mensajes de WhatsApp para restaurantes: plantillas listas para copiar',
    description:
      'Plantillas de bienvenida, menú, confirmación de pedido, fuera de horario, pedido demorado y seguimiento para restaurantes y comidas rápidas.',
    published: '2026-10-28',
    updated: '2026-10-28',
    intro:
      'Responder igual de bien a las 12 del día que a las 11 de la noche es más fácil con mensajes listos. Copia estas plantillas, cambia lo que está entre corchetes y guárdalas como respuestas rápidas.',
    sections: [
      { h2: 'Bienvenida', paragraphs: ['"¡Hola! Bienvenido a [Restaurante] 🍔 Hoy tenemos [plato destacado] a $[precio]. ¿Te envío el menú o ya sabes qué vas a pedir?"'] },
      { h2: 'Envío del menú', paragraphs: ['"Aquí está nuestro menú 📋 Los más pedidos son [plato 1] y [plato 2]. El domicilio a [zona] cuesta $[valor] y es gratis desde $[monto]."'] },
      { h2: 'Confirmación del pedido', paragraphs: ['"¡Listo, [Nombre]! ✅ Tu pedido: [productos]. Total: $[total] con domicilio. Llega a [dirección] en [tiempo] aprox. Pagas con [forma de pago]."'] },
      { h2: 'Fuera de horario', paragraphs: ['"¡Hola! Ahora estamos cerrados 🌙 Atendemos de [hora] a [hora]. Si quieres, déjanos tu pedido y te lo confirmamos apenas abramos."'] },
      { h2: 'Pedido demorado', paragraphs: ['"[Nombre], tu pedido va un poco tarde por la cantidad de pedidos de hoy 🙏 Llega en unos [minutos] minutos. ¡Gracias por la paciencia!"'] },
      { h2: 'Seguimiento para que vuelva a pedir', paragraphs: ['"¡Hola [Nombre]! ¿Qué tal estuvo tu [plato]? Este [día] tenemos [promoción]. Escríbenos cuando quieras pedir 😊"'] },
      {
        h2: 'Cuando las plantillas ya no alcanzan',
        paragraphs: [
          'Las respuestas rápidas ayudan, pero alguien tiene que escoger cuál mandar en cada chat. Con un bot como BotWA cargas tu menú, zonas y horario una vez, y el bot responde con este mismo estilo, adaptado a lo que pregunta cada cliente, y toma el pedido completo.',
        ],
      },
    ],
  },
  {
    slug: 'como-reducir-inasistencias-citas-consultorio',
    niche: 'clinicas',
    title: 'Cómo reducir las inasistencias a citas en tu consultorio',
    description:
      'Por qué los pacientes no llegan a sus citas y 6 acciones concretas para reducir las inasistencias, empezando por el recordatorio por WhatsApp.',
    published: '2026-10-28',
    updated: '2026-10-28',
    intro:
      'Cada paciente que no llega es un espacio en la agenda que ya no puedes vender y un profesional esperando. La buena noticia: la mayoría de inasistencias no son mala intención, son olvido. Y el olvido se puede prevenir.',
    sections: [
      {
        h2: 'Por qué los pacientes no llegan',
        list: [
          'Se les olvidó: la cita se agendó hace una o dos semanas.',
          'Les surgió algo y les dio pena avisar.',
          'No tenían claro dónde quedaba o a qué hora era.',
          'No sabían cómo preparar el procedimiento y prefirieron no ir.',
        ],
      },
      {
        h2: '1. Recordatorio por WhatsApp antes de la cita',
        paragraphs: [
          'Es la acción con más impacto y la más fácil. Un mensaje corto con fecha, hora y dirección. Para citas agendadas con mucha anticipación funciona bien el día anterior; para citas del mismo día, 1 o 2 horas antes.',
        ],
      },
      {
        h2: '2. Pide confirmación',
        paragraphs: [
          'Termina el recordatorio con una pregunta: "¿Nos confirmas tu asistencia?". Quien no puede ir tiene una salida fácil para avisar, y tú recuperas el espacio a tiempo.',
        ],
      },
      {
        h2: '3. Facilita reprogramar',
        paragraphs: ['Si cambiar la cita implica llamar en horario de oficina, el paciente simplemente no llega. Que pueda reprogramar respondiendo el mismo chat.'],
      },
      {
        h2: '4. Envía ubicación e indicaciones',
        paragraphs: ['Dirección, parqueadero y qué traer o cómo prepararse. Menos dudas, menos excusas.'],
      },
      {
        h2: '5. Ten una lista de espera',
        paragraphs: ['Cuando alguien cancela, escribe a los pacientes que pidieron una cita más pronto. Un espacio cancelado con tiempo no es un espacio perdido.'],
      },
      {
        h2: '6. Mide tu tasa de inasistencia',
        paragraphs: ['Cuenta cada semana cuántas citas no se cumplieron. Si no lo mides, no sabes si lo que haces funciona.'],
      },
      {
        h2: 'Automatízalo',
        paragraphs: [
          'En BotWA activas los recordatorios en Panel → Citas y eliges cuándo se envían: 1, 2, 4, 24 o 48 horas antes. El bot le escribe a cada paciente con cita pendiente o confirmada, y si el paciente responde, el bot sigue la conversación. Tú ves en el panel qué citas ya fueron avisadas.',
        ],
      },
    ],
    faqs: [
      { q: '¿Con cuánta anticipación se debe enviar el recordatorio?', a: 'Para la mayoría de consultorios funciona bien 24 horas antes si la cita se agendó con días de anticipación, o 1 a 2 horas antes para citas cercanas.' },
      { q: '¿Se puede enviar el recordatorio automáticamente?', a: 'Sí. Con BotWA lo activas desde el panel y el bot lo envía por WhatsApp a cada paciente a la hora que elijas.' },
    ],
  },
  {
    slug: 'recordatorio-de-citas-por-whatsapp-automatico',
    niche: 'clinicas',
    title: 'Recordatorio de citas por WhatsApp automático: cómo configurarlo',
    description:
      'Cómo enviar recordatorios de citas por WhatsApp sin hacerlo a mano: qué debe decir el mensaje, cuándo enviarlo y cómo activarlo en BotWA paso a paso.',
    published: '2026-10-28',
    updated: '2026-10-28',
    intro:
      'Mandar recordatorios uno por uno funciona hasta que tienes 20 citas al día. Aquí te explicamos cómo dejarlos automáticos, qué debe decir el mensaje y a qué hora conviene enviarlo.',
    sections: [
      {
        h2: 'Qué debe decir un buen recordatorio',
        list: [
          'Nombre del paciente.',
          'Tratamiento o motivo, fecha y hora.',
          'Dirección (y piso o consultorio).',
          'Una pregunta para confirmar o reprogramar.',
        ],
        outro: ['Ejemplo: "Hola Laura 😊 Te recordamos tu cita de limpieza hoy a las 10:00 a. m. en Cra. 7 #45-20, consultorio 302. ¿Nos confirmas tu asistencia?"'],
      },
      {
        h2: 'Cuándo enviarlo',
        list: [
          '1 hora antes: ideal para citas del mismo día o pacientes que viven cerca.',
          '2 a 4 horas antes: deja tiempo para organizar el transporte.',
          '24 a 48 horas antes: para procedimientos que requieren preparación o citas agendadas con mucha anticipación.',
        ],
      },
      {
        h2: 'Opción manual: botón por cita',
        paragraphs: [
          'En el panel de citas de BotWA cada cita tiene un botón de WhatsApp que abre el mensaje ya escrito. Sirve si tienes pocas citas, pero alguien tiene que acordarse de enviarlo.',
        ],
      },
      {
        h2: 'Opción automática: paso a paso en BotWA',
        list: [
          'Entra a tu panel y ve a Citas.',
          'Activa los recordatorios automáticos (vienen apagados).',
          'Elige la anticipación: 1, 2, 4, 24 o 48 horas antes.',
          'Listo: el bot revisa la agenda cada pocos minutos y envía un solo recordatorio por cita a las citas pendientes y confirmadas.',
        ],
        outro: [
          'Si una cita se reprograma, el recordatorio se envía de nuevo con la fecha nueva. El mensaje queda en el chat del paciente y la cita aparece marcada como avisada en tu panel.',
        ],
      },
      {
        h2: 'Lo que no debes hacer',
        list: [
          'Enviar varios recordatorios para la misma cita: molesta y aumenta los bloqueos.',
          'Incluir diagnósticos o datos clínicos en el mensaje.',
          'Escribir a personas que no te dieron su número para eso.',
        ],
      },
    ],
    faqs: [
      { q: '¿El recordatorio sale desde mi número?', a: 'Sí, sale desde el WhatsApp del consultorio que conectaste a BotWA y queda en el mismo chat del paciente.' },
      { q: '¿Qué pasa si se desconecta el WhatsApp?', a: 'El recordatorio no se pierde: se reintenta cuando la sesión vuelve a estar conectada.' },
    ],
  },
  {
    slug: 'cuanto-cuesta-bot-whatsapp-consultorio',
    niche: 'clinicas',
    title: 'Cuánto cuesta un bot de WhatsApp para consultorio o clínica (2026)',
    description:
      'Precios de un bot de WhatsApp con IA para consultorios odontológicos, clínicas estéticas y profesionales de la salud, y cómo calcular si se paga solo.',
    published: '2026-10-28',
    updated: '2026-10-28',
    intro:
      'En un consultorio, un solo paciente nuevo al mes puede valer más que la mensualidad de un bot. Aquí tienes los precios, qué incluye cada plan y cómo hacer la cuenta.',
    sections: [
      {
        h2: 'Cuánto cuesta BotWA',
        paragraphs: ['Todos los planes empiezan con 7 días de prueba y $0 hoy.'],
        list: [
          'Vendedor Automático — $120.000 COP/mes: responde valores, horarios, ubicación y preguntas frecuentes. Hasta 1.500 mensajes IA al mes.',
          'Máquina de Ventas Pro — $249.000 COP/mes: además agenda citas, las deja en tu panel y envía recordatorios automáticos. Hasta 5.000 mensajes IA al mes. Es el plan recomendado para consultorios.',
          'Dominio Agencia / VIP — $490.000 COP/mes: varias sedes o varias líneas de WhatsApp y hasta 20.000 mensajes IA al mes.',
        ],
      },
      {
        h2: 'Haz la cuenta',
        paragraphs: [
          'Si una valoración cuesta $90.000 y un tratamiento promedio supera los $300.000, el plan Pro se paga con 1 paciente nuevo al mes que antes se iba con otro consultorio por no recibir respuesta, o con 3 citas que antes se perdían por inasistencia.',
          'Para hacerlo con tus números, usa la calculadora gratuita de ventas perdidas por WhatsApp.',
        ],
      },
      {
        h2: 'Comparado con más horas de recepción',
        paragraphs: [
          'Ampliar el horario de recepción para cubrir noches y fines de semana cuesta varias veces más que un bot, y aun así una persona atiende un chat a la vez. El bot cubre la parte repetitiva (precios, horarios, agendar, recordar) y tu equipo se queda con lo que necesita criterio.',
        ],
      },
      {
        h2: 'Qué revisar antes de contratar',
        list: [
          'Que responda solo con tu información y no dé consejos médicos.',
          'Que agende y te deje ver las citas en un panel.',
          'Que envíe recordatorios automáticos.',
          'Que puedas tomar cualquier conversación cuando quieras.',
          'Que puedas probarlo antes de pagar.',
        ],
      },
    ],
    faqs: [
      { q: '¿El bot da recomendaciones médicas?', a: 'No. Responde información administrativa (precios, horarios, ubicación, preparación) y agenda. Lo clínico lo deja al profesional.' },
      { q: '¿Hay costo de instalación?', a: 'No. Lo configuras tú en una tarde y pagas solo la mensualidad.' },
    ],
  },
  {
    slug: 'whatsapp-business-vs-bot-ia-consultorio',
    niche: 'clinicas',
    title: 'WhatsApp Business vs. bot con IA para consultorios y clínicas',
    description:
      'Qué puede hacer WhatsApp Business gratis en un consultorio, dónde se queda corto y cuándo vale la pena un bot con IA que agende y recuerde citas.',
    published: '2026-10-28',
    updated: '2026-10-28',
    intro:
      'Casi todos los consultorios ya usan WhatsApp Business. La pregunta es si con eso basta o si vale la pena dar el siguiente paso. Esta comparación te ayuda a decidir.',
    sections: [
      {
        h2: 'Lo que WhatsApp Business hace gratis',
        list: [
          'Mensaje de bienvenida y de ausencia.',
          'Respuestas rápidas guardadas (precios, dirección).',
          'Etiquetas para organizar pacientes.',
        ],
      },
      {
        h2: 'Dónde se queda corto en un consultorio',
        list: [
          'No agenda: alguien tiene que mirar la agenda, proponer horarios y anotar la cita.',
          'No recuerda citas automáticamente.',
          'El mensaje de ausencia no retiene al paciente que escribe a las 9 de la noche.',
          'Cada pregunta distinta necesita a una persona.',
        ],
      },
      {
        h2: 'Lo que agrega un bot con IA',
        list: [
          'Entiende la pregunta del paciente (también por nota de voz) y responde con tus valores y horarios reales.',
          'Agenda la cita y la deja en tu panel.',
          'Envía recordatorios automáticos antes de la cita.',
          'Atiende de noche y los fines de semana.',
          'Tu equipo puede tomar cualquier conversación cuando quiera.',
        ],
      },
      {
        h2: 'Cómo decidir',
        list: [
          'Pocas citas por WhatsApp y alguien siempre disponible: WhatsApp Business es suficiente.',
          'Mensajes sin responder, pacientes que escriben de noche o inasistencias frecuentes: un bot se paga con un par de pacientes al mes.',
          'Si tienes dudas, prueba 7 días con $0 y mira cuántas citas agendó.',
        ],
      },
    ],
  },
];

export const getGuide = (slug: string) => GUIDES.find(g => g.slug === slug);
export const guidesForNiche = (niche: Niche['key']) => GUIDES.filter(g => g.niche === niche);
export const relatedGuides = (guide: Guide, max = 3) =>
  GUIDES.filter(g => g.niche === guide.niche && g.slug !== guide.slug).slice(0, max);
