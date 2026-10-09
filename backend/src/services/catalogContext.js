// Carga el catálogo que ve el bot en cada mensaje.
//
// - Catálogo pequeño/mediano (hasta LARGE_CATALOG_MIN productos activos): se carga completo,
//   como siempre. Así el modelo ve todo y no tiene que adivinar nada.
// - Catálogo grande: se busca en Postgres (buscar_productos, migración 005), así que no hay
//   tope de 150 productos ni se carga todo el catálogo en cada mensaje.
// - Si la migración 005 aún no está aplicada (o la búsqueda falla), se usa el modo anterior:
//   hasta 150 productos en memoria. Nunca se queda sin catálogo.

const LARGE_CATALOG_MIN = parseInt(process.env.LARGE_CATALOG_MIN, 10) || 60;
const LEGACY_LIMIT = 150;
const SAMPLE_SIZE = 12;
const SUMMARY_TTL_MS = 5 * 60 * 1000;
const RPC_RETRY_MS = 5 * 60 * 1000;
const SUMMARY_MAX_ROWS = 5000;

const PRODUCT_COLUMNS = 'name, description, price, currency, category, image_url';

const summaryCache = new Map(); // businessId → { total, categories, expiresAt }
let rpcDownUntil = 0;

// Se llama cuando el dueño edita su catálogo (ver clearBusinessAiCache).
const invalidateCatalogSummary = (businessId) => {
  if (businessId) summaryCache.delete(businessId);
};

const isMissingFunction = (error) => Boolean(error) && (
  error.code === 'PGRST202' || error.code === '42883' ||
  /could not find the function|function .* does not exist/i.test(error.message || '')
);

// "menos de 150.000", "hasta $200000" → 150000 (o null)
const parseBudget = (text) => {
  const m = (text || '').match(/(?:menos de|hasta|máximo|maximo|menor a)\s*\$?\s*([\d\.\,]+)/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[\.\,]/g, ''), 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
};

// Categorías y total de productos activos del negocio (una consulta liviana, en caché 5 min).
const getCatalogSummary = async (supabase, businessId) => {
  const hit = summaryCache.get(businessId);
  if (hit && hit.expiresAt > Date.now()) return hit;

  const { data, error } = await supabase
    .from('products_services').select('category')
    .eq('business_id', businessId).eq('is_active', true).limit(SUMMARY_MAX_ROWS);
  if (error) throw error;

  const counts = new Map();
  for (const row of data || []) {
    const c = (row.category || '').trim();
    if (c) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
  const categories = sorted.map(([c]) => c);
  const categoryCounts = Object.fromEntries(sorted);
  const summary = { total: (data || []).length, categories, categoryCounts, expiresAt: Date.now() + SUMMARY_TTL_MS };
  summaryCache.set(businessId, summary);
  return summary;
};

// Modo anterior: hasta 150 productos, con filtro SQL por presupuesto si el cliente lo menciona.
const loadLegacyProducts = async (supabase, businessId, text) => {
  let q = supabase.from('products_services').select(PRODUCT_COLUMNS).eq('is_active', true);
  if (businessId) q = q.eq('business_id', businessId);
  let priceFiltered = false;
  const budget = parseBudget(text);
  if (budget) { q = q.lte('price', budget); priceFiltered = true; }
  const { data } = await q.order('category', { ascending: true }).limit(LEGACY_LIMIT);
  return { products: data || [], priceFiltered };
};

const callSearch = async (supabase, businessId, terms, { limit = 12, orden = 'relevancia', maxPrice = null } = {}) => {
  if (Date.now() < rpcDownUntil) return null;
  const { data, error } = await supabase.rpc('buscar_productos', {
    p_business_id: businessId,
    p_terms: terms,
    p_limit: limit,
    p_orden: orden,
    p_max_price: maxPrice,
  });
  if (error) {
    if (isMissingFunction(error)) {
      rpcDownUntil = Date.now() + RPC_RETRY_MS;
      console.warn('[CATALOGO] buscar_productos no existe todavía (falta la migración 005): se usa el modo anterior');
    } else {
      console.error('[CATALOGO] Error en buscar_productos:', error.message);
    }
    return null;
  }
  return data || [];
};

// Lista de una categoría ("muéstrame todas las motos"): una consulta directa, sin ranking ni IA.
const listCategory = async (supabase, businessId, category, limit = 20) => {
  const { data, error } = await supabase
    .from('products_services').select(PRODUCT_COLUMNS)
    .eq('business_id', businessId).eq('is_active', true).eq('category', category)
    .order('price', { ascending: true }).limit(limit);
  if (error) {
    console.error('[CATALOGO] Error listando la categoría:', error.message);
    return null;
  }
  return data || [];
};

const callSimilar = async (supabase, businessId, productId, limit = 6) => {
  if (Date.now() < rpcDownUntil) return null;
  const { data, error } = await supabase.rpc('productos_similares', {
    p_business_id: businessId, p_product_id: String(productId), p_limit: limit,
  });
  if (error) {
    if (isMissingFunction(error)) rpcDownUntil = Date.now() + RPC_RETRY_MS;
    else console.error('[CATALOGO] Error en productos_similares:', error.message);
    return null;
  }
  return data || [];
};

/**
 * @returns {Promise<{products: Array, priceFiltered: boolean, options: object}>}
 *   options → se pasa tal cual a askGroq. Vacío en modo anterior; en catálogo grande trae
 *   searchProducts/similarProducts y los datos del catálogo.
 */
const loadCatalogContext = async ({ supabase, business, text }) => {
  const businessId = business?.id;
  const legacy = async () => ({ ...(await loadLegacyProducts(supabase, businessId, text)), options: {} });

  if (!businessId || Date.now() < rpcDownUntil) return legacy();

  try {
    const summary = await getCatalogSummary(supabase, businessId);
    if (summary.total <= LARGE_CATALOG_MIN) return legacy();

    const maxPrice = parseBudget(text);
    const sample = await callSearch(supabase, businessId, [], { limit: SAMPLE_SIZE, maxPrice });
    if (sample === null) return legacy(); // la función SQL no está disponible

    return {
      products: sample,
      priceFiltered: Boolean(maxPrice),
      options: {
        catalogTotal: summary.total,
        categories: summary.categories,
        categoryCounts: summary.categoryCounts,
        sample,
        searchProducts: (terms, opts = {}) => callSearch(supabase, businessId, terms, { maxPrice, ...opts }),
        similarProducts: (productId, limit) => callSimilar(supabase, businessId, productId, limit),
        listCategory: (category, limit) => listCategory(supabase, businessId, category, limit),
        // La foto que manda el cliente se compara contra el catálogo cargado en modo anterior
        visionProducts: async () => (await loadLegacyProducts(supabase, businessId, '')).products,
      },
    };
  } catch (e) {
    console.error('[CATALOGO] Error cargando el catálogo, se usa el modo anterior:', e.message);
    return legacy();
  }
};

module.exports = { loadCatalogContext, invalidateCatalogSummary, parseBudget, LARGE_CATALOG_MIN };
