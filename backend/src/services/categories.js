// Las categorías llegan como las escribió el dueño (o como venían en el PDF que importó):
// "BICIMOTO ELÉCTRICA", "Bicimoto eléctrica" y "Bicimotos eléctricas" son la misma, pero en la
// base son tres filas distintas. Si no se agrupan, el bot le muestra al cliente la misma
// categoría tres veces y, cuando elige una, solo ve un pedazo del catálogo.

// "Bicimotos Eléctricas" → "bicimoto electrica" (sin tildes, sin plural, en orden alfabético
// para que "moto eléctrica" y "eléctrica moto" caigan en el mismo grupo).
const categoryKey = (value) => {
  const singular = (w) => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
  return (value || '')
    .toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter(Boolean).map(singular).sort().join(' ');
};

const isAllCaps = (s) => s === s.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(s);

// "BICIMOTO ELÉCTRICA" → "Bicimoto eléctrica": un renglón en mayúsculas sostenidas se lee como
// un grito en WhatsApp. Las siglas cortas (SUV, TV) se dejan como están.
const prettyCategory = (name) => {
  const s = (name || '').trim();
  return isAllCaps(s) && s.length > 4 ? s.charAt(0) + s.slice(1).toLowerCase() : s;
};

/**
 * Agrupa las variantes de una misma categoría.
 * @param {Object|Array<[string, number]>} rawCounts  categoría tal como está en la base → cuántos productos
 * @returns {{labels: string[], counts: Object, variants: Object}}
 *   labels   → nombres a mostrar, de la categoría más grande a la más pequeña
 *   counts   → nombre mostrado → total de productos (sumando sus variantes)
 *   variants → nombre mostrado → nombres tal como están en la base (para consultar)
 */
const groupCategories = (rawCounts) => {
  const entries = Array.isArray(rawCounts) ? rawCounts : Object.entries(rawCounts || {});
  const groups = new Map();
  for (const [raw, count] of entries) {
    const name = (raw || '').toString().trim();
    const n = Number(count) || 0;
    if (!name) continue;
    const key = categoryKey(name);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) { group = { label: name, score: -1, total: 0, variants: [] }; groups.set(key, group); }
    group.total += n;
    if (!group.variants.includes(name)) group.variants.push(name);
    // Se muestra la variante más usada; a igual uso, la que no está en mayúsculas sostenidas
    const score = n * 2 + (isAllCaps(name) ? 0 : 1);
    if (score > group.score) { group.score = score; group.label = name; }
  }

  const sorted = [...groups.values()].sort((a, b) => b.total - a.total);
  const labels = [];
  const counts = {};
  const variants = {};
  for (const group of sorted) {
    const label = prettyCategory(group.label);
    if (!(label in counts)) { labels.push(label); counts[label] = 0; variants[label] = []; }
    counts[label] += group.total;
    for (const v of group.variants) if (!variants[label].includes(v)) variants[label].push(v);
  }
  return { labels, counts, variants };
};

/** Agrupa una lista de productos por categoría ya normalizada. */
const groupProductsByCategory = (products = []) => {
  const counts = new Map();
  for (const p of products) {
    const c = (p.category || '').trim();
    if (c) counts.set(c, (counts.get(c) || 0) + 1);
  }
  return groupCategories([...counts.entries()]);
};

module.exports = { categoryKey, prettyCategory, groupCategories, groupProductsByCategory };
