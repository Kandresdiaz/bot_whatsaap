require('dotenv').config();
const { supabase } = require('../db/supabase');
const { seedDefaultProductsAndKB } = require('../db/seedHelper');

async function seedAll() {
  console.log('🔍 Buscando TODOS los usuarios y negocios en Supabase...');

  const { data: users } = await supabase.from('users').select('*');
  console.log('👥 Usuarios en DB:', users);

  const { data: businesses } = await supabase.from('businesses').select('*');
  console.log('🏢 Negocios en DB:', businesses);

  // Asegurar que todos los usuarios tengan su rol de admin si son Kevin o admin
  for (const u of (users || [])) {
    if (u.email === 'kevina0416@gmail.com' || u.email === 'admin@bot.com') {
      await supabase.from('users').update({ is_admin: true, plan: 'business', status: 'active' }).eq('id', u.id);
      console.log(`✅ Usuario ${u.email} (${u.id}) actualizado como Super Admin`);
    }
  }

  // Poblar productos y KB para CADA negocio en Supabase
  for (const bus of (businesses || [])) {
    console.log(`\n🌱 Poblando productos y KB para negocio: "${bus.name}" (${bus.id})`);
    await seedDefaultProductsAndKB(bus.id);
  }

  console.log('\n🎉 ¡Poblado total completado con éxito!');
  process.exit(0);
}

seedAll();
