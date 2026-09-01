const { supabase } = require('./supabase');

const defaultProducts = [
  {
    name: 'Plan Vendedor Automático',
    description: '1 número de WhatsApp, Agente IA 24/7 con Catálogo RAG, 1.500 msgs/mes, 20 docs FAQs. Respuestas instantáneas en 2 segundos.',
    price: 120000,
    currency: 'COP',
    category: 'Planes / Membresías',
    is_active: true,
  },
  {
    name: 'Plan Máquina de Ventas Pro',
    description: '1 número de WhatsApp, Catálogo interactivo con envío de fotos multimedia, Agendador de Citas y Pedidos, 5.000 msgs/mes, 100 docs, Generador de FAQs con IA.',
    price: 249000,
    currency: 'COP',
    category: 'Planes / Membresías',
    is_active: true,
  },
  {
    name: 'Plan Dominio Agencia / VIP',
    description: 'Multi-línea WhatsApp, White-Label VIP, 20.000 msgs/mes, Catálogo ilimitado, Prompting a la medida Done-For-You y soporte 1 a 1.',
    price: 490000,
    currency: 'COP',
    category: 'Planes / Membresías',
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

    for (const prod of defaultProducts) {
      const payload = { ...prod, business_id: businessId };
      const { data: existing } = await supabase
        .from('products_services')
        .select('id')
        .eq('business_id', businessId)
        .eq('name', prod.name)
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
