// Piezas compartidas por los dos lectores de catálogo: el de texto (catalogExtractor)
// y el de imágenes (catalogVision).
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
    supabase.from('products_services').select('name').eq('business_id', businessId),
    supabase.from('knowledge_base').select('title, type').eq('business_id', businessId),
  ]);
  return {
    products: new Set((products || []).map(p => norm(p.name))),
    kb: new Set((kb || []).filter(k => k.type === 'faq' || k.type === 'text').map(k => norm(k.title))),
  };
};

const buildProductRow = (businessId, p, imageUrl = null) => ({
  business_id: businessId,
  name: String(p?.nombre || '').trim().slice(0, 120),
  description: String(p?.descripcion || '').trim().slice(0, 600),
  price: toPrice(p?.precio),
  currency: 'COP',
  category: String(p?.categoria || '').trim().slice(0, 60) || 'General',
  image_url: imageUrl || null,
  is_active: true,
  updated_at: new Date().toISOString(),
});

module.exports = { norm, parseJson, toPrice, loadExistingKeys, buildProductRow };
