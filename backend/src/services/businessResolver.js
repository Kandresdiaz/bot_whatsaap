// Un usuario normalmente tiene UN negocio, pero el sistema puede crear más de uno (el panel crea
// el negocio la primera vez que se abre; dos cargas seguidas pueden dejar un duplicado vacío).
// Si cada ruta elegía "el primero" con un criterio distinto, el catálogo se guardaba en un negocio
// y el bot leía otro vacío: el bot "no miraba el catálogo". Todas las rutas y el bot eligen aquí.
//
// Regla: de los negocios del usuario, el que tiene más información cargada (productos activos +
// base de conocimiento activa); si empatan, el más reciente.

const MAX_CANDIDATES = 8;

const countRows = async (supabase, table, businessId) => {
  const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).eq('is_active', true);
  return count || 0;
};

/**
 * @param {object} supabase
 * @param {string} userId
 * @param {string} [columns]  columnas a traer del negocio ('*' por defecto); 'id' siempre se incluye
 * @returns {Promise<object|null>}
 */
const resolveUserBusiness = async (supabase, userId, columns = '*') => {
  if (!userId) return null;
  const select = columns === '*' || /\bid\b/.test(columns) ? columns : `id, ${columns}`;
  const { data } = await supabase.from('businesses').select(select)
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(MAX_CANDIDATES);

  if (!data || data.length === 0) return null;
  if (data.length === 1) return data[0];

  const scored = await Promise.all(data.map(async (b, index) => ({
    business: b,
    index,
    size: (await countRows(supabase, 'products_services', b.id)) + (await countRows(supabase, 'knowledge_base', b.id)),
  })));
  scored.sort((a, b) => b.size - a.size || a.index - b.index); // más datos; a igualdad, el más reciente
  const chosen = scored[0];
  console.warn(`[NEGOCIO] El usuario ${String(userId).slice(0, 8)}… tiene ${data.length} negocios; se usa el que tiene datos cargados (${chosen.size}).`);
  return chosen.business;
};

module.exports = { resolveUserBusiness };
