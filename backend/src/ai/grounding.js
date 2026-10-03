// Verificación posterior a la respuesta: cada valor en dinero que el bot le dice al cliente
// tiene que salir de lo que el negocio configuró (catálogo, base de conocimiento, datos del
// negocio) o de lo que el propio cliente dijo. Es código, no prompt: no depende de que el
// modelo obedezca. Si un valor no se puede respaldar, la respuesta no se envía.

const normalize = (text) => (text || '')
  .toString()
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// "1.250.000" | "1,250,000" | "1250000" | "120.5" → número. Devuelve null si no es un número.
const parseAmount = (raw) => {
  let s = String(raw || '').replace(/[^\d.,]/g, '').replace(/[.,]+$/, '');
  if (!s) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ''), 10);
  if (/^\d+[.,]\d{1,2}$/.test(s)) return parseFloat(s.replace(',', '.'));
  s = s.replace(/[.,]/g, '');
  return s ? parseInt(s, 10) : null;
};

// Valores en dinero escritos en una respuesta: "$120.000", "120.000 COP", "120 mil pesos",
// "1,5 millones". Un número suelto sin marca de dinero (una cantidad, una hora) no cuenta.
const MONEY_RE = /(?:\$\s*(\d[\d.,]*)\s*(mil\b|millones?\b|k\b)?)|(?:(\d[\d.,]*)\s*(mil\b|millones?\b)?\s*(?:cop\b|pesos\b))/gi;

const applyUnit = (value, unit) => {
  if (value === null || value === undefined) return null;
  const u = (unit || '').toLowerCase();
  if (u === 'mil' || u === 'k') return value * 1000;
  if (u.startsWith('millon')) return value * 1000000;
  return value;
};

const extractMoney = (text) => {
  const found = [];
  const src = String(text || '');
  let m;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(src)) !== null) {
    const raw = m[1] ?? m[3];
    const unit = m[2] ?? m[4];
    const amount = applyUnit(parseAmount(raw), unit);
    if (amount !== null && !Number.isNaN(amount)) found.push(amount);
  }
  return found;
};

// Todos los números de un texto de configuración (aunque no lleven "$": "envío 12.000").
const extractAllNumbers = (text) => {
  const found = [];
  const src = String(text || '');
  const re = /(\d[\d.,]*)\s*(mil\b|millones?\b)?/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const base = parseAmount(m[1]);
    if (base === null || Number.isNaN(base)) continue;
    found.push(base);
    const withUnit = applyUnit(base, m[2]);
    if (withUnit !== base) found.push(withUnit);
  }
  return found;
};

const MAX_QTY = 50;

// Conjunto de valores que el bot SÍ puede decir.
const buildAllowedAmounts = ({ products = [], knowledge = [], business = null, texts = [], reply = '' } = {}) => {
  const allowed = new Set([0]);
  const add = (n) => { if (typeof n === 'number' && Number.isFinite(n)) allowed.add(Math.round(n)); };

  const prices = [];
  for (const p of products) {
    const price = Number(p?.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    prices.push({ name: normalize(p.name), price });
    add(price);
    for (let q = 2; q <= MAX_QTY; q++) add(price * q);
    extractAllNumbers(p.description).forEach(add);
  }

  for (const k of knowledge) {
    extractAllNumbers(k?.title).forEach(add);
    extractAllNumbers(k?.content).forEach(add);
  }
  if (business) {
    [business.description, business.custom_instructions, business.closing_instructions,
      business.payment_or_booking_link, business.address, business.greeting_msg]
      .forEach(t => extractAllNumbers(t).forEach(add));
  }
  // Lo que dijo el cliente (su presupuesto, un monto que cita) puede repetirse en la respuesta
  texts.forEach(t => extractAllNumbers(t).forEach(add));

  // Totales de varios productos: solo con los productos que la propia respuesta nombra
  const normReply = normalize(reply);
  const mentioned = prices.filter(p => p.name && p.name.length >= 3 && normReply.includes(p.name)).slice(0, 8);
  const n = mentioned.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += mentioned[i].price;
    for (let q = 1; q <= 10; q++) add(sum * q);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) add(Math.abs(mentioned[i].price - mentioned[j].price));
  }
  return allowed;
};

// { ok, invalid } — invalid son los valores en dinero de la respuesta que nadie configuró.
const verifyReplyAmounts = (reply, ctx = {}) => {
  const amounts = extractMoney(reply);
  if (amounts.length === 0) return { ok: true, invalid: [] };
  const allowed = buildAllowedAmounts({ ...ctx, reply });
  const invalid = [...new Set(amounts.filter(a => !allowed.has(Math.round(a))))];
  return { ok: invalid.length === 0, invalid };
};

// El total que el modelo escribe en [NUEVO_PEDIDO] tiene que salir del catálogo: se recalcula
// con los precios reales. Devuelve el pedido con el total corregido (o en 0 si no se puede saber).
const reconcileOrderTotal = (order, products = []) => {
  if (!order || typeof order !== 'object') return order;
  const declared = parseAmount(order.total ?? order.precio ?? 0) || 0;
  const qty = Math.max(1, parseInt(order.cantidad, 10) || 1);
  const normItem = normalize(order.producto || order.items || '');

  // Un mismo producto puede venir de varias búsquedas: se cuenta una sola vez
  const byName = new Map();
  for (const p of products) {
    const name = normalize(p.name);
    if (name.length >= 3 && Number(p.price) > 0 && !byName.has(name)) byName.set(name, Number(p.price));
  }

  let expected = null;
  if (normItem) {
    if (byName.has(normItem)) {
      // El pedido nombra exactamente un producto del catálogo
      expected = byName.get(normItem) * qty;
    } else {
      // El pedido nombra varios ("Silla modelo 3 y Lampara"): los productos cuyo nombre aparece en el
      // texto; si uno está contenido en otro más específico ("modelo 2" en "modelo 215") gana el más específico
      const inside = [...byName.keys()].filter(n => normItem.includes(n));
      const specific = inside.filter(n => !inside.some(o => o !== n && o.includes(n)));
      if (specific.length === 1) expected = byName.get(specific[0]) * qty;
      else if (specific.length > 1) expected = specific.reduce((s, n) => s + byName.get(n), 0);
    }
  }

  if (expected !== null) {
    return declared === expected ? order : { ...order, total: expected };
  }
  // No se pudo ubicar el producto en el catálogo: un total inventado no se guarda
  const known = new Set(products.map(p => Math.round(Number(p.price) * qty)).filter(Number.isFinite));
  return known.has(Math.round(declared)) ? order : { ...order, total: 0 };
};

module.exports = {
  parseAmount,
  extractMoney,
  extractAllNumbers,
  buildAllowedAmounts,
  verifyReplyAmounts,
  reconcileOrderTotal,
};
