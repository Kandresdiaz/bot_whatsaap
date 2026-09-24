const { supabase } = require('../db/supabase');

// Negocio y administrador principal de BotWA: su catálogo se siembra por código,
// así que nunca se bloquea su bot por falta de información.
const PRIMARY_ADMIN_UUID = '0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d';
const PRIMARY_BOTWA_ID = '8fd9a59d-77d7-4db7-8637-9aaebca1158e';

const MIN_DESCRIPTION_LENGTH = 20;

/**
 * Decide si un negocio tiene información suficiente para que la IA responda.
 * Un bot sin información solo puede inventar, así que exigimos:
 *   1. Negocio configurado (wizard completado) y con nombre.
 *   2. Una descripción de qué vende u ofrece (o instrucciones personalizadas).
 *   3. Al menos un producto/servicio activo o una FAQ/documento activo.
 * Devuelve { ready, missing[] } con los pendientes en lenguaje para el usuario.
 */
const evaluateBotReadiness = (business, productsCount = 0, knowledgeCount = 0) => {
  if (business?.id === PRIMARY_BOTWA_ID) return { ready: true, missing: [] };

  const missing = [];
  if (!business || !business.is_configured || !business.name?.trim()) {
    missing.push('Completar la configuración del negocio (wizard en "Conectar WhatsApp")');
  }

  const description = `${business?.description || ''} ${business?.custom_instructions || ''}`.trim();
  if (description.length < MIN_DESCRIPTION_LENGTH) {
    missing.push('Escribir la descripción de lo que vende u ofrece tu negocio');
  }

  if (productsCount === 0 && knowledgeCount === 0) {
    missing.push('Cargar al menos un producto/servicio en el Catálogo o una pregunta frecuente en la Base de Conocimiento');
  }

  return { ready: missing.length === 0, missing };
};

/**
 * Igual que evaluateBotReadiness pero consultando la base de datos por usuario.
 */
const checkBotReadiness = async (userId) => {
  if (userId === PRIMARY_ADMIN_UUID || userId === 'admin') return { ready: true, missing: [] };
  if (!supabase) return { ready: true, missing: [] };

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, description, custom_instructions, is_configured')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  const business = businesses?.[0] || null;
  if (!business) return evaluateBotReadiness(null);

  const [{ count: productsCount }, { count: knowledgeCount }] = await Promise.all([
    supabase.from('products_services').select('id', { count: 'exact', head: true })
      .eq('business_id', business.id).eq('is_active', true),
    supabase.from('knowledge_base').select('id', { count: 'exact', head: true })
      .eq('business_id', business.id).eq('is_active', true),
  ]);

  return evaluateBotReadiness(business, productsCount || 0, knowledgeCount || 0);
};

module.exports = { evaluateBotReadiness, checkBotReadiness };
