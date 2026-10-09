// Guías del blog: contenido útil para búsquedas de "cómo hacer X" de cada nicho.
// Cada guía enlaza a su página de nicho, que es la que convierte.
import type { Niche } from './niches';

export interface GuideSection { h2: string; paragraphs?: string[]; list?: string[] }

export interface Guide {
  slug: string;
  niche: Niche['key'];
  title: string;
  description: string;
  published: string; // YYYY-MM-DD
  updated: string;
  intro: string;
  sections: GuideSection[];
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
];

export const getGuide = (slug: string) => GUIDES.find(g => g.slug === slug);
export const guidesForNiche = (niche: Niche['key']) => GUIDES.filter(g => g.niche === niche);
