// Un pedido tiene campos fijos (producto, total, dirección...), pero cada negocio pide otros datos
// al cerrar: fecha y hora de entrega, quién recibe, dedicatoria, referencia, alergias... Si el
// modelo los manda como campos extra, no se pierden: pasan a las notas del pedido que ve el dueño.

const KNOWN_FIELDS = new Set([
  'nombre', 'telefono', 'producto', 'items', 'cantidad', 'total', 'precio',
  'direccion', 'ciudad', 'metodo_pago', 'notas',
]);

const MAX_VALUE_CHARS = 300;

const label = (key) => {
  const text = String(key).replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * @param {object} order       datos del pedido tal como los emitió el modelo
 * @param {object} [opts]
 * @param {boolean} [opts.alwaysQuantity]  incluir la cantidad aunque sea 1 (al modificar un pedido)
 * @returns {string[]}  fragmentos tipo "Cantidad: 2", "Fecha entrega: sábado 8am"
 */
const extraOrderFields = (order, { alwaysQuantity = false } = {}) => {
  if (!order || typeof order !== 'object') return [];
  const out = [];

  const qty = parseInt(order.cantidad, 10);
  if (Number.isFinite(qty) && qty > 0 && (qty > 1 || alwaysQuantity)) out.push(`Cantidad: ${qty}`);

  for (const [key, value] of Object.entries(order)) {
    if (KNOWN_FIELDS.has(String(key).toLowerCase())) continue;
    if (value === null || value === undefined || typeof value === 'object') continue;
    const text = String(value).trim();
    if (!text) continue;
    out.push(`${label(key)}: ${text.slice(0, MAX_VALUE_CHARS)}`);
  }
  return out;
};

module.exports = { extraOrderFields };
