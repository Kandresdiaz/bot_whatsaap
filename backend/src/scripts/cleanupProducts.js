require('dotenv').config();
const { supabase } = require('../db/supabase');

async function cleanup() {
  console.log('🧹 Limpiando productos desactualizados en Supabase...');

  // Eliminar los productos viejos de 29.900, 79.900 y 179.900
  const { error } = await supabase
    .from('products_services')
    .delete()
    .in('price', [29900, 79900, 179900]);

  if (error) {
    console.error('Error eliminando productos viejos:', error.message);
  } else {
    console.log('✅ Productos viejos eliminados correctamente.');
  }

  // Asegurar que los productos 120k, 250k, 450k tengan business_id '00000000-0000-0000-0000-000000000001'
  const { data: current } = await supabase.from('products_services').select('*');
  console.log('📦 Productos actuales en DB (', current?.length || 0, '):', current);

  process.exit(0);
}

cleanup();
