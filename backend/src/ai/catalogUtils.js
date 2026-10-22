// Piezas compartidas por los dos lectores de catálogo: el de texto (catalogExtractor)
// y el de imágenes (catalogVision).
const { categoryKey } = require('../services/categories');
const { supabase } = require('../db/supabase');

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Saca el primer objeto JSON de la respuesta (algunos modelos lo envuelven en ```json
// o lo preceden de un bloque <think>).
const parseJson = (raw) => {
  const match = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
};

// "$ 12.500.000", "12,500,000", "1'560.000" → 12500000
const toPrice = (v) => {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : 0;
  const digits = String(v || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
};

/** Nombres de producto y títulos de conocimiento que el negocio ya tiene, normalizados. */
const loadExistingKeys = async (businessId) => {
  const [{ data: products }, { data: kb }] = await Promise.all([
    supabase.from('products_services').select('id, name, image_url, category').eq('business_id', businessId),
    supabase.from('knowledge_base').select('title, type').eq('business_id', businessId),
  ]);
  return {
    products: new Set((products || []).map(p => norm(p.name))),
    // id y foto de cada producto existente: permite completar la foto que falta sin pisar nada
    productInfo: new Map((products || []).map(p => [norm(p.name), { id: p.id, image_url: p.image_url }])),
    // Huella de cada página que ya se leyó: la foto de un producto se guarda con el hash de la
    // imagen en el nombre, así que si ya está aquí no hace falta pagar IA para leerla de nuevo.
    pageHashes: new Set((products || [])
      .map(p => (String(p.image_url || '').match(/\/([0-9a-f]{16})\.jpg(?:\?|$)/) || [])[1])
      .filter(Boolean)),
    kb: new Set((kb || []).filter(k => k.type === 'faq' || k.type === 'text').map(k => norm(k.title))),
    // Categorías que ya existen: el modelo escribe "MOTO ELÉCTRICA" en una página y "Motos
    // eléctricas" en la siguiente. Se reutiliza el nombre que ya está guardado.
    categories: new Map((products || [])
      .map(p => [categoryKey(p.category), String(p.category || '').trim()])
      .filter(([k, name]) => k && name)),
  };
};

// `knownCategories` (clave normalizada → nombre ya guardado) evita que el mismo tipo de producto
// quede repartido en tres categorías distintas según cómo lo escribió el modelo en cada página.
const resolveCategory = (raw, knownCategories) => {
  const name = String(raw || '').trim().slice(0, 60) || 'General';
  if (!(knownCategories instanceof Map)) return name;
  const key = categoryKey(name);
  if (!key) return name;
  const known = knownCategories.get(key);
  if (known) return known;
  knownCategories.set(key, name);
  return name;
};

const buildProductRow = (businessId, p, imageUrl = null, knownCategories = null) => ({
  business_id: businessId,
  name: String(p?.nombre || '').trim().slice(0, 120),
  description: String(p?.descripcion || '').trim().slice(0, 600),
  price: toPrice(p?.precio),
  currency: 'COP',
  category: resolveCategory(p?.categoria, knownCategories),
  image_url: imageUrl || null,
  is_active: true,
  updated_at: new Date().toISOString(),
});

module.exports = { norm, parseJson, toPrice, loadExistingKeys, buildProductRow };
