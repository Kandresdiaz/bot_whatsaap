require('dotenv').config();
const { supabase } = require('../db/supabase');

async function cleanup() {
  console.log('🧹 Limpiando y sincronizando productos y base de conocimiento de BotWA...');

  const businessId = '8fd9a59d-77d7-4db7-8637-9aaebca1158e';

  // 1. Actualizar configuración del negocio BotWA
  await supabase.from('businesses').update({
    name: 'BotWA',
    category: 'Software / Automatización de WhatsApp con IA',
    description: 'SaaS de bots de WhatsApp con inteligencia artificial para negocios y empresas. Automatiza ventas, agendamiento de citas, catálogo con fotos y respuestas 24/7 con IA RAG.',
    bot_personality: 'vendedor persuasivo, cercano, consultivo, profesional y enfocado en cerrar ventas',
    main_goal: 'vender',
    greeting_msg: '¡Hola! 👋 Te damos la bienvenida a BotWA. Automatizamos tus ventas en WhatsApp 24/7 con Inteligencia Artificial por menos del 10% del costo de un empleado. ¿Qué tipo de negocio tienes o te gustaría conocer nuestros planes y precios?',
  }).eq('id', businessId);

  // 2. Limpiar todos los productos previos de BotWA
  await supabase.from('products_services').delete().eq('business_id', businessId);

  // 3. Insertar los 3 planes oficiales
  const officialPlans = [
    {
      business_id: businessId,
      name: 'Plan Vendedor Automático',
      description: '1 Línea WhatsApp, Catálogo interactivo RAG 24/7, respuestas en <2s, 1.500 msgs IA/mes, 20 docs FAQs. Incluye 7 días gratis.',
      price: 120000,
      currency: 'COP',
      category: 'Planes BotWA',
      is_active: true,
    },
    {
      business_id: businessId,
      name: 'Plan Máquina de Ventas Pro (⭐ Más Popular)',
      description: '1 Línea WhatsApp, Catálogo con Fotos Multimedia automáticas, Agendador de Citas y Pedidos, 5.000 msgs IA/mes, 100 docs, Generador de FAQs con IA. Incluye 7 días gratis.',
      price: 249000,
      currency: 'COP',
      category: 'Planes BotWA',
      is_active: true,
    },
    {
      business_id: businessId,
      name: 'Plan Dominio Agencia / VIP',
      description: 'Multi-línea WhatsApp, Marca Blanca con tu logo, Prompting y RAG a medida (Done-For-You), 20.000 msgs IA/mes, Catálogo ilimitado y Soporte 1 a 1.',
      price: 490000,
      currency: 'COP',
      category: 'Planes BotWA',
      is_active: true,
    },
  ];

  await supabase.from('products_services').insert(officialPlans);
  console.log('✅ 3 Planes oficiales guardados en Supabase.');

  // 4. Limpiar y actualizar base de conocimiento
  await supabase.from('knowledge_base').delete().eq('business_id', businessId);

  const officialKB = [
    {
      business_id: businessId,
      title: '¿Qué es BotWA y cómo funciona?',
      content: 'BotWA es una plataforma SaaS que conecta un asistente de Inteligencia Artificial a tu propio número de WhatsApp escaneando un código QR (estilo WhatsApp Web). Atiende clientes, envía fotos del catálogo con precios, agenda citas y califica prospectos en tiempo real las 24 horas.',
      type: 'faq',
      is_active: true,
    },
    {
      business_id: businessId,
      title: 'Planes, Precios y 7 Días de Prueba Gratis',
      content: 'Ofrecemos 3 planes con 7 Días de Prueba Gratis ($0 hoy): 1) Plan Vendedor Automático: $120.000 COP/mes (1.500 msgs IA/mes). 2) Plan Máquina de Ventas Pro ($249.000 COP/mes, 5.000 msgs con fotos y citas). 3) Plan Dominio Agencia / VIP: $490.000 COP/mes (20.000 msgs multi-línea y marca blanca).',
      type: 'faq',
      is_active: true,
    },
    {
      business_id: businessId,
      title: 'Límites de mensajes y qué pasa si se acaban',
      content: '¿Cuántos mensajes de IA incluye cada plan? Plan Vendedor Automático: 1.500 msgs/mes. Plan Pro: 5.000 msgs/mes. Plan VIP: 20.000 msgs/mes. Si tu negocio llega al límite de mensajes en el mes, nunca deja de atender clientes: puedes pasar de inmediato al plan superior pagando solo el excedente o adquirir paquetes de mensajes adicionales desde tu panel.',
      type: 'faq',
      is_active: true,
    },
    {
      business_id: businessId,
      title: '¿Necesito tener mi computador o celular encendido todo el tiempo?',
      content: 'No. El bot corre en la nube de forma permanente 24/7. Tu teléfono puede estar apagado o sin batería y el bot seguirá respondiendo a tus clientes al instante.',
      type: 'faq',
      is_active: true,
    },
    {
      business_id: businessId,
      title: '¿Tengo riesgo de baneo en WhatsApp?',
      content: 'BotWA cuenta con arquitectura anti-baneo: delays humanizados de respuesta (800-2800ms), rate limit de 20 mensajes por hora por contacto y solo responde a mensajes entrantes de clientes sin hacer spam masivo no deseado.',
      type: 'faq',
      is_active: true,
    },
  ];

  await supabase.from('knowledge_base').insert(officialKB);
  console.log('✅ Base de conocimiento limpia y actualizada en Supabase.');

  process.exit(0);
}

cleanup();
