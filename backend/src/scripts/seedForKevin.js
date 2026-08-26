require('dotenv').config();
const { supabase } = require('../db/supabase');

async function seedAll() {
  console.log('🌱 Sembrando productos y base de conocimiento para TODOS los negocios en Supabase...');

  const { data: businesses } = await supabase.from('businesses').select('id, name, user_id');
  console.log('🏢 Negocios a procesar:', businesses);

  const defaultProducts = [
    {
      name: 'Plan Básico BotWA',
      description: '1 número de WhatsApp, Agente IA 24/7 RAG, 1.000 msgs/mes, 20 docs FAQs. Captura de datos para Vender O Agendar.',
      price: 120000,
      currency: 'COP',
      category: 'Planes / Membresías',
      is_active: true,
    },
    {
      name: 'Plan Profesional BotWA',
      description: '1 número de WhatsApp, Vender Y Agendar simultáneamente, Catálogo interactivo RAG, Lead Alert instantáneo, 5.000 msgs/mes, 100 docs.',
      price: 250000,
      currency: 'COP',
      category: 'Planes / Membresías',
      is_active: true,
    },
    {
      name: 'Plan Business / Agencia BotWA',
      description: 'Multi-línea WhatsApp, White-Label VIP, 15.000 msgs/mes, Configuración e instalación Done-For-You por el equipo.',
      price: 450000,
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
  ];

  for (const bus of (businesses || [])) {
    console.log(`\n👉 Procesando negocio: ${bus.name} (${bus.id})`);

    // Insertar/actualizar productos
    for (const prod of defaultProducts) {
      const payload = { ...prod, business_id: bus.id };
      const { data: existing } = await supabase
        .from('products_services')
        .select('id')
        .eq('business_id', bus.id)
        .eq('name', prod.name)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase.from('products_services').update(payload).eq('id', existing[0].id);
        console.log(`  ✅ Producto actualizado: ${prod.name}`);
      } else {
        await supabase.from('products_services').insert(payload);
        console.log(`  ➕ Producto insertado: ${prod.name}`);
      }
    }

    // Insertar/actualizar conocimiento
    for (const item of defaultKnowledge) {
      const payload = { ...item, business_id: bus.id };
      const { data: existing } = await supabase
        .from('knowledge_base')
        .select('id')
        .eq('business_id', bus.id)
        .eq('title', item.title)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase.from('knowledge_base').update(payload).eq('id', existing[0].id);
        console.log(`  ✅ KB actualizada: ${item.title}`);
      } else {
        await supabase.from('knowledge_base').insert(payload);
        console.log(`  ➕ KB insertada: ${item.title}`);
      }
    }
  }

  console.log('\n🎉 ¡Sembrado de datos relacionales completado con éxito!');
  process.exit(0);
}

seedAll();
