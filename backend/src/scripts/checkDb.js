require('dotenv').config();
const { supabase } = require('../db/supabase');

async function check() {
  console.log('🔍 Diagnosticando base de datos Supabase...');

  const { data: users, error: uErr } = await supabase.from('users').select('id, name, email, plan');
  console.log('👥 USUARIOS (', users?.length || 0, '):', users, uErr ? uErr.message : '');

  const { data: businesses, error: bErr } = await supabase.from('businesses').select('id, user_id, name');
  console.log('🏢 NEGOCIOS (', businesses?.length || 0, '):', businesses, bErr ? bErr.message : '');

  const { data: products, error: pErr } = await supabase.from('products_services').select('id, business_id, name, price');
  console.log('📦 PRODUCTOS (', products?.length || 0, '):', products, pErr ? pErr.message : '');

  const { data: kb, error: kErr } = await supabase.from('knowledge_base').select('id, business_id, title');
  console.log('🧠 KNOWLEDGE BASE (', kb?.length || 0, '):', kb, kErr ? kErr.message : '');

  process.exit(0);
}

check();
