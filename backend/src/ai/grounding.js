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

// ─── Cantidad escrita junto a un producto ────────────────────────────────────
// Un pedido de restaurante casi nunca lleva una sola cantidad: "2 hamburguesas, 1 gaseosa y
// papas". Para saber cuánto vale hay que leer la cantidad de CADA plato, no una para todo.
// Reconoce "2 combo parche", "3 porciones de papas", "combo parche x2".
// Hacia adelante exige la marca "x"/"por": si no, el precio que suele venir después del nombre
// ("Combo Parche $28.000" → "combo parche 28 000") se leería como cantidad 28.
const QTY_BEFORE_RE = /(\d{1,3})\s*(?:x|und|unds?|unidades?|porciones?|porcion|platos?|ordenes?|orden)?\s*(?:de\s+)?$/;
const QTY_AFTER_RE = /^\s*(?:x|por)\s*(\d{1,3})\b/;

const qtyNextTo = (normText, normName) => {
  if (!normText || !normName) return 1;
  let qty = 0;
  let from = 0;
  for (;;) {
    const at = normText.indexOf(normName, from);
    if (at === -1) break;
    from = at + normName.length;
    const before = QTY_BEFORE_RE.exec(normText.slice(Math.max(0, at - 16), at));
    const after = QTY_AFTER_RE.exec(normText.slice(from, from + 10));
    const found = Math.max(
      before ? parseInt(before[1], 10) : 0,
      after ? parseInt(after[1], 10) : 0,
    );
    qty = Math.max(qty, found >= 1 && found <= MAX_QTY ? found : 1);
  }
  return qty || 1;
};

// Conjunto de valores que el bot SÍ puede decir.
// "$0" solo vale si el negocio lo dice (una prueba gratis, un envío gratis): un producto sin precio
// registrado NO es gratis. `allowZero` es para el negocio cuyo producto es justo "$0 hoy" (BotWA).
const buildAllowedAmounts = ({ products = [], knowledge = [], business = null, texts = [], reply = '', allowZero = false } = {}) => {
  const allowed = new Set(allowZero ? [0] : []);
  const add = (n) => { if (typeof n === 'number' && Number.isFinite(n)) allowed.add(Math.round(n)); };

  // Cargos que el negocio configuró aparte del catálogo (domicilio, recargo, descuento): se
  // guardan por separado porque el total que paga el cliente los suma al valor de los platos.
  const fees = new Set();
  const addFee = (n) => { if (typeof n === 'number' && Number.isFinite(n) && n > 0) fees.add(Math.round(n)); };

  const prices = [];
  for (const p of products) {
    const price = Number(p?.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    prices.push({ name: normalize(p.name), price });
    add(price);
    for (let q = 2; q <= MAX_QTY; q++) add(price * q);
    extractAllNumbers(p.description).forEach((v) => { add(v); addFee(v); });
  }

  for (const k of knowledge) {
    extractAllNumbers(k?.title).forEach((v) => { add(v); addFee(v); });
    extractAllNumbers(k?.content).forEach((v) => { add(v); addFee(v); });
  }
  if (business) {
    [business.description, business.custom_instructions, business.closing_instructions,
      business.payment_or_booking_link, business.address, business.greeting_msg]
      .forEach(t => extractAllNumbers(t).forEach((v) => { add(v); addFee(v); }));
  }
  // Lo que dijo el cliente (su presupuesto, un monto que cita) puede repetirse en la respuesta
  texts.forEach(t => extractAllNumbers(t).forEach(add));

  // Totales de varios productos: solo con los productos que la propia respuesta nombra
  const normReply = normalize(reply);
  const mentioned = prices.filter(p => p.name && p.name.length >= 3 && normReply.includes(p.name)).slice(0, 8);
  const n = mentioned.length;
  // Cada plato con la cantidad que la respuesta le puso: "2 Combo Parche y 1 Gaseosa" = 2×+1×
  const qtys = mentioned.map(p => qtyNextTo(normReply, p.name));
  const sums = new Set();
  for (let mask = 1; mask < (1 << n); mask++) {
    let unit = 0;
    let withQty = 0;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      unit += mentioned[i].price;
      withQty += mentioned[i].price * qtys[i];
    }
    sums.add(withQty);
    // Cantidades parejas ("dos de cada uno"), que es lo que ya se admitía antes
    for (let q = 1; q <= 10; q++) sums.add(unit * q);
  }
  sums.forEach(add);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) add(Math.abs(mentioned[i].price - mentioned[j].price));
  }

  // El total que paga el cliente = los platos + el domicilio (o - un descuento) que el negocio
  // tiene configurado. Cada parte ya está respaldada, así que la suma también lo está: sin esto
  // el bot no podía decir "son $56.000 + $5.000 de domicilio, total $61.000".
  const extras = [...new Set(extractMoney(reply).map(a => Math.round(a)).filter(a => fees.has(a)))].slice(0, 3);
  const e = extras.length;
  if (e > 0 && sums.size > 0) {
    for (let mask = 1; mask < (1 << e); mask++) {
      let extra = 0;
      for (let i = 0; i < e; i++) if (mask & (1 << i)) extra += extras[i];
      for (const s of sums) {
        add(s + extra);
        if (s - extra > 0) add(s - extra);
      }
    }
  }

  // "Son $56.000 más $5.000 de domicilio, total $61.000": si un valor es la suma (o la resta) de
  // otros que la MISMA respuesta dice y que ya están respaldados, ese valor también lo está.
  // Cubre el total final cuando el subtotal viene de lo que ya se habló en la conversación.
  const backed = [...new Set(extractMoney(reply).map(a => Math.round(a)).filter(a => a > 0 && allowed.has(a)))].slice(0, 6);
  for (let i = 0; i < backed.length; i++) {
    for (let j = i + 1; j < backed.length; j++) {
      add(backed[i] + backed[j]);
      add(Math.abs(backed[i] - backed[j]));
      for (let k = j + 1; k < backed.length; k++) add(backed[i] + backed[j] + backed[k]);
    }
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

// ─── Códigos de modelo ("EM22", "EB-1S", "WH2001") ───────────────────────────
// El modelo puede cambiar una letra o un número de la referencia ("EM2p" en vez de "EM22") y el
// cliente pediría un producto que no existe. Toda referencia que aparezca en la respuesta tiene que
// estar en el catálogo, la base de conocimiento, los datos del negocio o lo que escribió el cliente.
const CODE_RE = /\b[A-Za-z]{1,5}-?\d{1,4}[A-Za-z]{0,3}\b/g;
const COMMON_TOKENS = new Set(['mp3', 'mp4', 'b2b', 'b2c', 'co2', 'h2o', 'covid19', '24x7']);
const compact = (text) => normalize(text).replace(/\s+/g, '');

const verifyReplyCodes = (reply, { products = [], knowledge = [], business = null, texts = [] } = {}) => {
  // Enlaces y correos no son referencias de producto
  const cleaned = String(reply || '').replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/gi, ' ');
  const found = [...new Set((cleaned.match(CODE_RE) || []))];
  if (found.length === 0) return { ok: true, invalid: [] };

  const corpus = compact([
    ...products.flatMap(p => [p?.name, p?.description, p?.category]),
    ...knowledge.flatMap(k => [k?.title, k?.content]),
    ...(business ? [business.name, business.description, business.custom_instructions, business.closing_instructions, business.address, business.greeting_msg] : []),
    ...texts,
  ].filter(Boolean).join(' '));

  const invalid = found.filter(code => {
    const c = compact(code);
    return c.length >= 3 && !COMMON_TOKENS.has(c) && !corpus.includes(c);
  });
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
      else if (specific.length > 1) {
        // Varios platos en un mismo pedido: cada uno se cobra por SU cantidad ("2 hamburguesas,
        // 1 gaseosa" = 2×18.000 + 1×4.000). Antes se sumaban los precios unitarios y el total
        // guardado quedaba por debajo de lo que el cliente paga.
        const perItem = specific.map(n => qtyNextTo(normItem, n));
        const sum = specific.reduce((s, n, i) => s + byName.get(n) * perItem[i], 0);
        // Si ningún plato trae su propia cantidad, "cantidad" aplica al pedido completo
        // ("2 combos de hamburguesa y gaseosa").
        expected = perItem.some(q => q > 1) ? sum : sum * qty;
      }
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
  verifyReplyCodes,
  reconcileOrderTotal,
};
