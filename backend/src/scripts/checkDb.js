require('dotenv').config();
const { supabase } = require('../db/supabase');
const { askGroq } = require('../ai/groq');

async function check() {
  console.log('🤖 SIMULACIÓN DE FLUJO CONVERSACIONAL Y CONTINUIDAD DE VENTAS EN BOTWA:\n');

  const { data: prods } = await supabase.from('products_services').select('*').eq('business_id', '8fd9a59d-77d7-4db7-8637-9aaebca1158e');
  const { data: kb } = await supabase.from('knowledge_base').select('*').eq('business_id', '8fd9a59d-77d7-4db7-8637-9aaebca1158e');
  const { data: bus } = await supabase.from('businesses').select('*').eq('id', '8fd9a59d-77d7-4db7-8637-9aaebca1158e').single();

  const conversationHistory = [];

  const turns = [
    'Bueno que vendes',
    'A ver dime',
    'El del medio qué incluye exactamente?',
    'Y si se me acaban los mensajes del mes qué pasa?',
    'Listo me interesa iniciar la prueba de 7 días, mi negocio es Odontología Sonrisas'
  ];

  for (let i = 0; i < turns.length; i++) {
    const userMsg = turns[i];
    console.log(`\n======================================================`);
    console.log(`👤 CLIENTE (Turno ${i + 1}): "${userMsg}"`);
    console.log(`======================================================`);

    const result = await askGroq(userMsg, bus, kb, conversationHistory, prods);
    console.log(`🤖 BOTWA:\n${result.reply}`);

    if (result.isLeadHot) {
      console.log(`🔥 [LEAD CALIENTE DETECTADO] Datos capturados:`, result.clientData || result.newAppointmentData || 'Interés alto de compra');
    }

    conversationHistory.push({ content: userMsg, direction: 'inbound' });
    conversationHistory.push({ content: result.reply, direction: 'outbound' });
  }

  console.log('\n✅ Simulación completada exitosamente.');
  process.exit(0);
}

check();
