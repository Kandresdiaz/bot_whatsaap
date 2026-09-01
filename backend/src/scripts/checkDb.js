require('dotenv').config();
const { supabase } = require('../db/supabase');
const { askGroq } = require('../ai/groq');

async function check() {
  const { data: prods } = await supabase.from('products_services').select('*').eq('business_id', '8fd9a59d-77d7-4db7-8637-9aaebca1158e');
  const { data: kb } = await supabase.from('knowledge_base').select('*').eq('business_id', '8fd9a59d-77d7-4db7-8637-9aaebca1158e');
  const { data: bus } = await supabase.from('businesses').select('*').eq('id', '8fd9a59d-77d7-4db7-8637-9aaebca1158e').single();

  const history = [
    { content: 'Bueno que vendes', direction: 'inbound' },
    { content: '¡Hola! 👋 Te damos la bienvenida a BotWA. Automatizamos tus ventas en WhatsApp 24/7 con Inteligencia Artificial, por menos del 10% del costo de un empleado. ¿Te gustaría conocer nuestros precios o probar una demostración?', direction: 'outbound' }
  ];

  console.log('🧪 Probando respuesta del bot ante "A ver dime":');
  const res = await askGroq('A ver dime', bus, kb, history, prods);
  console.log('\n🤖 RESPUESTA DEL BOT:\n' + res.reply);
  console.log('\n✨ Lead Hot:', res.isLeadHot, '| Chunks:', res.ragChunksUsed, '| Tokens:', res.tokensUsed);
  process.exit(0);
}

check();
