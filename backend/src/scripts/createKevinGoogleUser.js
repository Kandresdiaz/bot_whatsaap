require('dotenv').config();
const { supabase } = require('../db/supabase');
const { seedDefaultProductsAndKB } = require('../db/seedHelper');

async function createKevin() {
  console.log('👤 Creando/asegurando usuario Google de Kevin en Supabase...');

  const kevinEmail = 'kevina0416@gmail.com';
  const kevinName = 'Kevin Andrés Díaz';

  // 1. Buscar si ya existe por email
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', kevinEmail)
    .maybeSingle();

  if (!user) {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email: kevinEmail,
        name: kevinName,
        plan: 'business',
        status: 'active',
        is_admin: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando usuario Kevin:', error.message);
      process.exit(1);
    }
    user = newUser;
    console.log('✅ Usuario Kevin creado en `users`:', user);
  } else {
    // Asegurar que sea admin y plan business
    await supabase.from('users').update({ is_admin: true, plan: 'business', status: 'active' }).eq('id', user.id);
    console.log('✅ Usuario Kevin actualizado como Super Admin en `users`:', user.id);
  }

  // 2. Crear negocio para Kevin si no existe
  let { data: bus } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!bus) {
    const { data: newBus, error: bErr } = await supabase
      .from('businesses')
      .insert({
        user_id: user.id,
        name: 'BotWA Ventas e Inteligencia Artificial',
        category: 'Software / SaaS',
        city: 'Medellín',
        timezone: 'America/Bogota',
        bot_personality: 'amigable, experto en ventas, atento y persuasivo',
        active_hours_start: '00:00:00',
        active_hours_end: '23:59:59',
        active_days: [0, 1, 2, 3, 4, 5, 6],
      })
      .select()
      .single();

    if (bErr) console.error('Error creando negocio de Kevin:', bErr.message);
    else {
      bus = newBus;
      console.log('✅ Negocio de Kevin creado en `businesses`:', bus.id);
    }
  } else {
    console.log('📍 Negocio de Kevin ya existe:', bus.id);
  }

  // 3. Poblar productos y base de conocimiento relacional para el negocio de Kevin
  if (bus?.id) {
    await seedDefaultProductsAndKB(bus.id);
    console.log('🎉 Productos y Knowledge Base sembrados para el negocio de Kevin:', bus.id);
  }

  process.exit(0);
}

createKevin();
