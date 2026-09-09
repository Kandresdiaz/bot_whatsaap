const { supabase } = require('./supabase');

const defaultProducts = [
  {
    name: 'Plan Vendedor Automático (1.500 msgs/mes)',
    description: 'Ideal para negocios pequeños o independientes (hasta 50 chats/día). Atención 24/7 en WhatsApp, respuestas inmediatas en <2s, catálogo inteligente con IA y base de FAQs. Incluye 7 días gratis ($0 COP hoy con tarjeta).',
    price: 120000,
    currency: 'COP',
    category: 'Planes BotWA',
    is_active: true,
  },
  {
    name: 'Plan Máquina de Ventas Pro (5.000 msgs/mes - ⭐ Más Recomendado)',
    description: 'Para tiendas y empresas en crecimiento (hasta 170 chats/día). Envío automático de fotos y multimedia del catálogo, agendador de citas y toma de pedidos con sincronización a tu panel, 5.000 msgs IA/mes y FAQs ampliadas. Incluye 7 días gratis ($0 COP hoy con tarjeta).',
    price: 249000,
    currency: 'COP',
    category: 'Planes BotWA',
    is_active: true,
  },
  {
    name: 'Plan Dominio Agencia / VIP (20.000 msgs/mes)',
    description: 'Para empresas consolidadas, clínicas o agencias (más de 650 chats/día). Múltiples líneas de WhatsApp conectadas, marca blanca con tu logo, prompting y embudo personalizado Done-For-You y soporte VIP 1 a 1. Incluye 7 días gratis ($0 COP hoy con tarjeta).',
    price: 490000,
    currency: 'COP',
    category: 'Planes BotWA',
    is_active: true,
  },
];

const defaultKnowledge = [
  {
    title: 'Información General de BotWA y Garantías',
    content: 'BotWA es un servicio SaaS de bots de WhatsApp con inteligencia artificial para negocios latinoamericanos. Ofrecemos 7 días de prueba gratis y garantía de devolución del 100% en los primeros 14 días. La instalación toma menos de 15 minutos.',
    type: 'text',
    is_active: true,
  },
  {
    title: 'Preguntas Frecuentes (FAQs) de BotWA',
    content: '¿Cómo funciona? Te conectas escaneando un código QR estilo WhatsApp Web. El bot responde las 24 horas del día sin necesidad de tener el celular encendido todo el tiempo. ¿Qué pasa si el bot no sabe algo? Te notifica al instante a tu WhatsApp para que un humano responda.',
    type: 'faq',
    is_active: true,
  },
  {
    title: 'Límites de mensajes y qué pasa si se acaban',
    content: '¿Cuántos mensajes de IA incluye cada plan? El Plan Vendedor Automático ($120.000 COP) incluye hasta 1.500 mensajes/mes. El Plan Máquina de Ventas Pro ($249.000 COP) incluye hasta 5.000 mensajes/mes con fotos y agendamiento. El Plan Dominio Agencia ($490.000 COP) incluye hasta 20.000 mensajes/mes multi-línea. ¿Qué pasa si se me acaban los mensajes del mes? Tu negocio nunca deja de responder; puedes hacer un upgrade inmediato al plan superior pagando solo el excedente o adquirir paquetes de mensajes adicionales desde tu panel.',
    type: 'faq',
    is_active: true,
  },
];

const seedDefaultProductsAndKB = async (businessId) => {
  if (!businessId) return;
  try {
    const { data: bus } = await supabase.from('businesses').select('name').eq('id', businessId).limit(1);
    const busName = bus && bus[0]?.name;
    // Solo sembrar planes de BotWA si el negocio es BotWA o no tiene nombre asignado
    if (busName && busName !== 'BotWA' && busName !== 'Asistente Virtual') {
      return;
    }

    // Si ya existen 3 o más productos en el catálogo de este negocio, NO sembrar nada
    const { data: currentProds } = await supabase
      .from('products_services')
      .select('id')
      .eq('business_id', businessId);

    if (currentProds && currentProds.length >= 3) {
      console.log('[SEED HELPER] El negocio ya cuenta con sus 3 planes oficiales. Omitiendo.');
      return;
    }

    for (const prod of defaultProducts) {
      const payload = { ...prod, business_id: businessId };
      const { data: existing } = await supabase
        .from('products_services')
        .select('id')
        .eq('business_id', businessId)
        .ilike('name', `%${prod.name.split(' ')[1]}%`)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('products_services').insert(payload);
      }
    }

    for (const item of defaultKnowledge) {
      const payload = { ...item, business_id: businessId };
      const { data: existing } = await supabase
        .from('knowledge_base')
        .select('id')
        .eq('business_id', businessId)
        .eq('title', item.title)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('knowledge_base').insert(payload);
      }
    }
  } catch (e) {
    console.error('[SEED HELPER] Error sembrando datos relacionales:', e.message);
  }
};

module.exports = { seedDefaultProductsAndKB };
