require('dotenv').config();
const { supabase } = require('../db/supabase');

async function seedAll() {
  console.log('🌱 Sembrando productos y base de conocimiento para TODOS los negocios en Supabase...');

  const { data: businesses } = await supabase.from('businesses').select('id, name, user_id');
  console.log('🏢 Negocios a procesar:', businesses);

  const defaultProducts = [
    {
      name: 'Plan Vendedor Automático',
      description: '1 Línea WhatsApp, Catálogo interactivo RAG 24/7, respuestas en <2s, 1.500 msgs IA/mes, 20 docs FAQs. Incluye 7 días gratis.',
      price: 120000,
      currency: 'COP',
      category: 'Planes BotWA',
      is_active: true,
    },
    {
      name: 'Plan Máquina de Ventas Pro (⭐ Más Popular)',
      description: '1 Línea WhatsApp, Catálogo con Fotos Multimedia automáticas, Agendador de Citas y Pedidos, 5.000 msgs IA/mes, 100 docs, Generador de FAQs con IA. Incluye 7 días gratis.',
      price: 249000,
      currency: 'COP',
      category: 'Planes BotWA',
      is_active: true,
    },
    {
      name: 'Plan Dominio Agencia / VIP',
      description: 'Multi-línea WhatsApp, Marca Blanca con tu logo, Prompting y RAG a medida (Done-For-You), 20.000 msgs IA/mes, Catálogo ilimitado y Soporte 1 a 1.',
      price: 490000,
      currency: 'COP',
      category: 'Planes BotWA',
      is_active: true,
    },
  ];

  const defaultKnowledge = [
    {
      title: '¿Qué es BotWA y cómo funciona?',
      content: 'BotWA es una plataforma SaaS que conecta un asistente de Inteligencia Artificial a tu propio número de WhatsApp escaneando un código QR (estilo WhatsApp Web). Atiende clientes, envía fotos del catálogo con precios, agenda citas y califica prospectos en tiempo real las 24 horas.',
      type: 'faq',
      is_active: true,
    },
    {
      title: 'Planes, Precios y 7 Días de Prueba Gratis',
      content: 'Ofrecemos 3 planes con 7 Días de Prueba Gratis ($0 hoy): 1) Plan Vendedor Automático: $120.000 COP/mes (1.500 msgs IA/mes). 2) Plan Máquina de Ventas Pro ($249.000 COP/mes, 5.000 msgs con fotos y citas). 3) Plan Dominio Agencia / VIP: $490.000 COP/mes (20.000 msgs multi-línea y marca blanca).',
      type: 'faq',
      is_active: true,
    },
    {
      title: 'Límites de mensajes y qué pasa si se acaban',
      content: '¿Cuántos mensajes de IA incluye cada plan? Plan Vendedor Automático: 1.500 msgs/mes. Plan Pro: 5.000 msgs/mes. Plan VIP: 20.000 msgs/mes. Si tu negocio llega al límite de mensajes en el mes, nunca deja de atender clientes: puedes pasar de inmediato al plan superior pagando solo el excedente o adquirir paquetes de mensajes adicionales desde tu panel.',
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
