require('dotenv').config();
const { supabase } = require('../db/supabase');

async function seed() {
  console.log('🌱 Iniciando inserción de datos en Supabase...');

  // 1. Obtener negocio principal
  let businessId = '00000000-0000-0000-0000-000000000001';
  const { data: bData } = await supabase.from('businesses').select('id, user_id').limit(1);
  if (bData && bData.length > 0) {
    businessId = bData[0].id;
    console.log('📍 Negocio encontrado en DB:', businessId);
  } else {
    console.log('📍 Usando negocio por defecto:', businessId);
  }

  // 2. Planes a insertar
  const defaultProducts = [
    {
      business_id: businessId,
      name: 'Plan Básico BotWA',
      description: '1 número de WhatsApp, Agente IA 24/7 RAG, 1.000 msgs/mes, 20 docs FAQs. Captura de datos para Vender O Agendar.',
      price: 120000,
      currency: 'COP',
      category: 'Planes / Membresías',
      is_active: true,
    },
    {
      business_id: businessId,
      name: 'Plan Profesional BotWA',
      description: '1 número de WhatsApp, Vender Y Agendar simultáneamente, Catálogo interactivo RAG, Lead Alert instantáneo, 5.000 msgs/mes, 100 docs.',
      price: 250000,
      currency: 'COP',
      category: 'Planes / Membresías',
      is_active: true,
    },
    {
      business_id: businessId,
      name: 'Plan Business / Agencia BotWA',
      description: 'Multi-línea WhatsApp, White-Label VIP, 15.000 msgs/mes, Configuración e instalación Done-For-You por el equipo.',
      price: 450000,
      currency: 'COP',
      category: 'Planes / Membresías',
      is_active: true,
    },
  ];

  for (const prod of defaultProducts) {
    const { data: existing } = await supabase
      .from('products_services')
      .select('id')
      .eq('name', prod.name)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('products_services')
        .update(prod)
        .eq('id', existing[0].id);
      if (error) console.error('Error actualizando producto:', prod.name, error.message);
      else console.log('✅ Producto actualizado:', prod.name);
    } else {
      const { error } = await supabase.from('products_services').insert(prod);
      if (error) console.error('Error insertando producto:', prod.name, error.message);
      else console.log('✅ Producto insertado:', prod.name);
    }
  }

  // 3. Knowledge base a insertar
  const defaultKnowledge = [
    {
      business_id: businessId,
      title: 'Información General de BotWA y Garantías',
      content: 'BotWA es un servicio SaaS de bots de WhatsApp con inteligencia artificial para negocios latinoamericanos. Ofrecemos 7 días de prueba gratis y garantía de devolución del 100% en los primeros 14 días. La instalación toma menos de 15 minutos.',
      type: 'text',
      is_active: true,
    },
    {
      business_id: businessId,
      title: 'Preguntas Frecuentes (FAQs) de BotWA',
      content: '¿Cómo funciona? Te conectas escaneando un código QR estilo WhatsApp Web. El bot responde las 24 horas del día sin necesidad de tener el celular encendido todo el tiempo. ¿Qué pasa si el bot no sabe algo? Te notifica al instante a tu WhatsApp para que un humano responda.',
      type: 'faq',
      is_active: true,
    },
  ];

  for (const item of defaultKnowledge) {
    const { data: existing } = await supabase
      .from('knowledge_base')
      .select('id')
      .eq('title', item.title)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase.from('knowledge_base').update(item).eq('id', existing[0].id);
      if (error) console.error('Error actualizando KB:', item.title, error.message);
      else console.log('✅ KB actualizada:', item.title);
    } else {
      const { error } = await supabase.from('knowledge_base').insert(item);
      if (error) console.error('Error insertando KB:', item.title, error.message);
      else console.log('✅ KB insertada:', item.title);
    }
  }

  console.log('🎉 Inserción completada con éxito.');
  process.exit(0);
}

seed();
