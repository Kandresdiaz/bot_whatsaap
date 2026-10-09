// Catálogo completo como texto de WhatsApp, armado directo de la base de datos: sin IA (0 tokens)
// y con los precios exactos. Se usa cuando el cliente pide "todo el catálogo" y el negocio no
// tiene un PDF que enviarle.

// Más que esto ya no es una lista que alguien lea en el celular: ahí la IA muestra las categorías
const MAX_LIST_PRODUCTS = 150;
// Un mensaje por bloque de este tamaño, para que no llegue un muro de texto imposible de leer
const MAX_MESSAGE_CHARS = 3000;

const formatPrice = (p) => {
  const n = Number(p.price);
  if (!(n > 0)) return 'precio a consultar';
  const currency = p.currency && p.currency !== 'COP' ? ` ${p.currency}` : '';
  return `$${n.toLocaleString('es-CO')}${currency}`;
};

/**
 * Productos activos del negocio (o de una categoría), o null si son demasiados para una lista.
 * @returns {Promise<Array|null>}
 */
const loadListableProducts = async (supabase, businessId, category = null) => {
  let q = supabase.from('products_services').select('name, price, currency, category')
    .eq('business_id', businessId).eq('is_active', true);
  if (category) q = q.eq('category', category);
  const { data, error } = await q.order('price', { ascending: true }).limit(MAX_LIST_PRODUCTS + 1);
  if (error) throw error;
  return (data || []).length > MAX_LIST_PRODUCTS ? null : (data || []);
};

/** Agrupa por categoría (la más grande primero) y parte en mensajes de WhatsApp. */
const buildCatalogMessages = (products) => {
  const groups = new Map();
  for (const p of products) {
    const c = (p.category || '').trim() || 'Otros';
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(p);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const messages = [];
  let current = '';
  const push = (block) => {
    if (current && current.length + block.length + 2 > MAX_MESSAGE_CHARS) {
      messages.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${block}` : block;
  };
  for (const [category, items] of sorted) {
    const lines = items.map(p => `• ${p.name} – ${formatPrice(p)}`);
    // Una categoría enorme se parte en varios bloques; el título se repite para no perder el hilo
    let block = `*${category}* (${items.length})`;
    for (const line of lines) {
      if (block.length + line.length + 1 > MAX_MESSAGE_CHARS) {
        push(block);
        block = `*${category}* (continuación)`;
      }
      block += `\n${line}`;
    }
    push(block);
  }
  if (current) messages.push(current);
  return messages;
};

module.exports = { loadListableProducts, buildCatalogMessages, MAX_LIST_PRODUCTS };
