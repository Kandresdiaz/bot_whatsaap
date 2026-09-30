// Planes, preguntas frecuentes y contacto comercial compartidos entre la landing (/) y /pricing.

export interface Plan {
  id: string;
  name: string;
  priceCOP: number;
  priceUSD: number;
  period: string;
  tag: string;
  isPopular?: boolean;
  description: string;
  messagesPerMonth: number;
  features: string[];
  bonuses: { name: string; value: string }[];
  totalValue: string;
}

export const TRIAL_DAYS = 7;
export const TRIAL_MESSAGES = 150;

// Número del bot de ventas de BotWA (Kevin). Formato internacional sin '+'.
export const SALES_WHATSAPP_NUMBER = '573057405422';
export const salesWhatsAppLink = (text = 'Hola, quiero probar BotWA') =>
  `https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

export const PLANS: Record<string, Plan> = {
  starter: {
    id: 'starter',
    name: 'Vendedor Automático',
    priceCOP: 120000,
    priceUSD: 30,
    period: 'mes',
    tag: '🚀 Básico',
    description: 'Responde, cotiza y atiende a tus clientes 24/7 sin perder ventas ni contratar personal.',
    messagesPerMonth: 1500,
    features: [
      '1 Línea de WhatsApp conectada',
      'Catálogo interactivo con IA RAG anti-alucinación',
      'Respuestas automáticas en segundos',
      'Hasta 1.500 mensajes IA / mes incluidos',
      'Gestión de conversaciones en vivo en el Dashboard',
      'Base de conocimiento (hasta 20 documentos/FAQs)',
    ],
    bonuses: [
      { name: 'Plantilla de Catálogo y FAQ para tu nicho', value: '$45 USD' },
      { name: 'Soporte técnico por WhatsApp', value: '$30 USD' },
    ],
    totalValue: '$190 USD',
  },
  pro: {
    id: 'pro',
    name: 'Máquina de Ventas Pro',
    priceCOP: 249000,
    priceUSD: 62,
    period: 'mes',
    tag: '⭐ MÁS POPULAR',
    isPopular: true,
    description: 'La suite completa de ventas por catálogo, fotos multimedia, citas y pedidos.',
    messagesPerMonth: 5000,
    features: [
      '1 Línea de WhatsApp conectada',
      'Catálogo con envío automático de Fotos Multimedia',
      'Agendador interactivo de Citas y Pedidos',
      'Panel centralizado de Citas y Pedidos en Dashboard',
      'Hasta 5.000 mensajes IA / mes incluidos',
      'Generador de FAQs con IA a demanda',
      'Base de conocimiento ampliada (hasta 100 docs)',
    ],
    bonuses: [
      { name: 'Plantillas de catálogo listas para tu nicho', value: '$45 USD' },
      { name: 'Guía Anti-Baneo y Cierre Persuasivo', value: '$97 USD' },
      { name: 'Configuración asistida de fotos y productos', value: '$60 USD' },
    ],
    totalValue: '$450 USD',
  },
  business: {
    id: 'business',
    name: 'Dominio Agencia / VIP',
    priceCOP: 490000,
    priceUSD: 120,
    period: 'mes',
    tag: '👑 ESCALA TOTAL',
    description: 'Automatización total para franquicias, clínicas o empresas con múltiples líneas de WhatsApp.',
    messagesPerMonth: 20000,
    features: [
      'Múltiples líneas de WhatsApp',
      'Marca Blanca (White-Label con tu logo)',
      'Prompting y RAG a la medida (Done-For-You)',
      'Hasta 20.000 mensajes IA / mes',
      'Base de conocimiento y catálogo ilimitados',
      'Soporte prioritario 1 a 1 directo por WhatsApp',
    ],
    bonuses: [
      { name: 'Todo lo incluido en el Plan Pro', value: '$450 USD' },
      { name: 'Sesión 1 a 1 de optimización de embudo', value: '$200 USD' },
      { name: 'Onboarding VIP asistido', value: '$100 USD' },
    ],
    totalValue: '$950 USD',
  },
};

export const FAQS: { q: string; a: string }[] = [
  {
    q: '¿Se me cobrará algo hoy al ingresar mi tarjeta?',
    a: 'El costo de tu prueba es $0 COP. Para verificar que la tarjeta es real y activa, Mercado Pago podría realizar una retención temporal de seguridad (~$1 USD o ~$4.000 COP) que se anula y reembolsa automáticamente en segundos en tu extracto. El cobro real de tu plan solo ocurrirá al finalizar tu 7mo día de prueba si decides continuar.',
  },
  {
    q: '¿Puedo pagar con Nequi o Bancolombia?',
    a: '¡Sí! Puedes usar tu Tarjeta Débito Nequi Visa virtual (la que viene dentro de tu app Nequi con 16 dígitos y código de seguridad CVV), así como cualquier tarjeta Débito Mastercard/Visa de Bancolombia, Daviplata o cualquier banco colombiano.',
  },
  {
    q: '¿Cómo cancelo si no deseo continuar después de los 7 días?',
    a: 'Puedes cancelar tu suscripción con un solo clic directamente desde la sección de Facturación en tu Dashboard en cualquier momento antes de que finalicen los 7 días.',
  },
  {
    q: '¿Qué pasa si mis clientes me escriben en la noche o festivos?',
    a: 'El bot responde 24/7 los 365 días del año. Tu catálogo, información y agendamiento estarán siempre activos sin importar la hora ni el día.',
  },
];

export const formatCOP = (val: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

// "1.500" siempre: toLocaleString('es-CO') no agrupa números de 4 cifras.
export const formatThousands = (val: number) => String(val).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
