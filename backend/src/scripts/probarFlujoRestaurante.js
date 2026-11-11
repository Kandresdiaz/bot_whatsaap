/**
 * Comprueba el flujo de un restaurante sin tocar la base ni gastar IA:
 *   node src/scripts/probarFlujoRestaurante.js
 *
 * Son los casos que antes se rompían:
 *  1. El total de un pedido con varios platos y cantidades distintas (el verificador de precios
 *     lo tomaba por inventado y el bot derivaba a un asesor justo al cerrar la venta).
 *  2. El total que se guarda en el pedido (se sumaban los precios unitarios sin las cantidades).
 *  3. El horario que cruza la medianoche (6:00 pm a 2:00 am daba "cerrado" a toda hora).
 * Y las reglas que NO deben aflojarse: un precio o una promo que nadie configuró se sigue bloqueando.
 */

const { verifyReplyAmounts, reconcileOrderTotal } = require('../ai/grounding');
const { isOutsideHours } = require('../services/businessHours');
const { validateSlot } = require('../services/bookingActions');

const MENU = [
  { name: 'Combo Parche', price: 28000, category: 'Combos', description: 'hamburguesa doble + papas + gaseosa' },
  { name: 'Hamburguesa Clásica', price: 18000, category: 'Hamburguesas' },
  { name: 'Papas Francesas', price: 7000, category: 'Acompañamientos' },
  { name: 'Gaseosa 400ml', price: 4000, category: 'Bebidas' },
];
const FAQS = [
  { title: '¿Cuánto cuesta el domicilio?', content: 'El domicilio cuesta $5.000 y cubrimos Laureles, Estadio y Belén.' },
];

let fallos = 0;
const check = (ok, titulo, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? '✅' : '❌'} ${titulo}${detalle ? `  — ${detalle}` : ''}`);
};

// ─── 1. Lo que el bot puede decirle al cliente ───────────────────────────────
console.log('\n── Totales que el bot SÍ puede decir ──');
const ctx = { products: MENU, knowledge: FAQS, business: null, texts: [] };
const debenPasar = [
  '¡Listo! 2 Combo Parche = $56.000 + domicilio a Laureles $5.000. Total $61.000 por Nequi.',
  '2 Hamburguesa Clásica, 1 Gaseosa 400ml y 1 Papas Francesas = $47.000',
  '1 Hamburguesa Clásica, 2 Gaseosa 400ml y 3 Papas Francesas = $47.000',
  'Son $40.000 más $5.000 de domicilio, total $45.000',
  'La Hamburguesa Clásica vale $18.000',
];
for (const reply of debenPasar) {
  const v = verifyReplyAmounts(reply, ctx);
  check(v.ok, reply.slice(0, 70), v.ok ? '' : `bloqueada por ${v.invalid.join(', ')}`);
}

console.log('\n── Precios inventados que SIGUEN bloqueados ──');
const debenBloquear = [
  'La Hamburguesa Clásica está en promoción a $12.900 hoy',
  'Tenemos combos desde $9.500',
  '2 Hamburguesa Clásica con descuento especial: $30.000',
  'El menú infantil cuesta $15.500',
];
for (const reply of debenBloquear) {
  const v = verifyReplyAmounts(reply, ctx);
  check(!v.ok, reply.slice(0, 70), v.ok ? 'PASÓ y no debía' : `detectado ${v.invalid.join(', ')}`);
}

// ─── 2. El total que queda guardado en el pedido ─────────────────────────────
console.log('\n── Total guardado en el pedido ──');
const pedidos = [
  [{ producto: '2 Hamburguesa Clásica, 1 Gaseosa 400ml', cantidad: 1, total: 40000 }, 40000, 'varios platos con cantidades distintas'],
  [{ producto: '2 Combo Parche y 3 Papas Francesas', cantidad: 1, total: 77000 }, 77000, 'dos platos, ambos con cantidad'],
  [{ producto: 'Hamburguesa Clásica y Gaseosa 400ml', cantidad: 2, total: 44000 }, 44000, 'sin cantidad por plato: aplica la del pedido'],
  [{ producto: 'Hamburguesa Clásica', cantidad: 3, total: 54000 }, 54000, 'un solo plato'],
  [{ producto: 'Hamburguesa Clásica', cantidad: 1, total: 99000 }, 18000, 'total que no cuadra → se corrige con el precio del menú'],
  [{ producto: 'Sancocho de gallina', cantidad: 1, total: 99000 }, 0, 'plato que no está en el menú → el total no se guarda'],
];
for (const [pedido, esperado, nota] of pedidos) {
  const { total } = reconcileOrderTotal(pedido, MENU);
  check(total === esperado, nota, `guardado $${total.toLocaleString('es-CO')} (esperado $${esperado.toLocaleString('es-CO')})`);
}

// ─── 3. Horario nocturno ─────────────────────────────────────────────────────
console.log('\n── Restaurante de 6:00 pm a 2:00 am ──');
const nocturno = {
  timezone: 'America/Bogota', active_days: [0, 1, 2, 3, 4, 5, 6],
  active_hours_start: '18:00:00', active_hours_end: '02:00:00',
};
const horaLocal = (h) => new Date(Date.UTC(2026, 10, 12, h + 5, 0, 0)); // Bogotá = UTC-5
for (const [h, cerradoEsperado] of [[13, true], [19, false], [23, false], [1, false], [3, true]]) {
  const cerrado = isOutsideHours(nocturno, horaLocal(h));
  check(cerrado === cerradoEsperado, `${String(h).padStart(2, '0')}:00 → ${cerrado ? 'cerrado' : 'abierto'}`);
}
for (const [hora, okEsperado] of [['19:00', true], ['23:00', true], ['01:00', true], ['04:00', false]]) {
  const r = validateSlot(nocturno, '2026-11-14', hora, { busy: [], now: new Date('2026-11-10T15:00:00Z') });
  check(r.ok === okEsperado, `reserva ${hora} → ${r.ok ? 'aceptada' : 'rechazada'}`, r.reason || '');
}

console.log('\n── Negocio de horario normal (8:00 a 18:00, sin domingos) ──');
const diurno = {
  timezone: 'America/Bogota', active_days: [1, 2, 3, 4, 5, 6],
  active_hours_start: '08:00:00', active_hours_end: '18:00:00', appointment_duration: 30,
};
for (const [h, cerradoEsperado] of [[7, true], [9, false], [18, true], [20, true]]) {
  check(isOutsideHours(diurno, horaLocal(h)) === cerradoEsperado, `miércoles ${String(h).padStart(2, '0')}:00`);
}
check(isOutsideHours(diurno, new Date(Date.UTC(2026, 10, 15, 15, 0, 0))) === true, 'domingo cerrado');
for (const [hora, okEsperado] of [['09:00', true], ['17:30', true], ['17:45', false], ['07:30', false]]) {
  const r = validateSlot(diurno, '2026-11-12', hora, { busy: [], now: new Date('2026-11-10T15:00:00Z') });
  check(r.ok === okEsperado, `cita ${hora} → ${r.ok ? 'aceptada' : 'rechazada'}`);
}

console.log(fallos === 0 ? '\n🎉 Todo el flujo del restaurante pasa.\n' : `\n⚠️  ${fallos} caso(s) fallando.\n`);
process.exit(fallos === 0 ? 0 : 1);
