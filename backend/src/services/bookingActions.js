// Lo que el bot HACE en la base de datos cuando el cliente agenda, reprograma o cancela una cita, o
// hace, cambia o cancela un pedido. Estaba dentro de la función gigante del handler y nunca se probó;
// aquí cada acción es una función con su resultado, y todas validan antes de guardar.
//
// Reglas que antes no existían:
//  · Una cita necesita fecha Y hora (antes, si faltaba, se guardaba "hoy 10:00" sin que nadie lo dijera).
//  · No se agenda en el pasado, en un día cerrado, fuera del horario ni en un horario ya ocupado.
//  · Reprogramar o cancelar toca UNA cita (la que el cliente nombró o la más próxima), no todas.
//  · Si no hay cita/pedido que modificar, no se queda en silencio: se crea o se avisa al dueño en las notas.

const { extraOrderFields } = require('../ai/orderNotes');

const CLOSED_ORDER_STATUSES = new Set(['cancelled', 'canceled', 'delivered', 'completed', 'entregado', 'cancelado']);

// ─── Fecha y hora en la zona del negocio ─────────────────────────────────────
const nowInZone = (tz = 'America/Bogota', now = new Date()) => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now); // YYYY-MM-DD
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const hh = parts.find(p => p.type === 'hour')?.value || '00';
  const mm = parts.find(p => p.type === 'minute')?.value || '00';
  return { date, time: `${hh === '24' ? '00' : hh}:${mm}` };
};

const toHHMM = (t) => String(t || '').slice(0, 5);
const toMinutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const parseDays = (raw) => {
  let days = raw;
  if (typeof days === 'string') { try { days = JSON.parse(days); } catch (_) { days = null; } }
  return Array.isArray(days) && days.length > 0 && days.length < 7 ? days.map(Number) : null; // null = todos los días
};
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * ¿Se puede agendar en esa fecha y hora?  → { ok, reason }
 * @param {object} business
 * @param {string} fecha  YYYY-MM-DD
 * @param {string} hora   HH:MM o HH:MM:SS
 * @param {object} [opts]
 * @param {string[]} [opts.busy]  horarios ocupados "YYYY-MM-DD HH:MM"
 * @param {Date}     [opts.now]
 */
const validateSlot = (business, fecha, hora, { busy = [], now = new Date() } = {}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`))) {
    return { ok: false, reason: 'la fecha no es válida (se necesita año-mes-día)' };
  }
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(hora || ''))) {
    return { ok: false, reason: 'la hora no es válida' };
  }
  const time = toHHMM(String(hora).padStart(5, '0'));

  const today = nowInZone(business?.timezone, now);
  if (fecha < today.date || (fecha === today.date && time <= today.time)) {
    return { ok: false, reason: `${fecha} ${time} ya pasó (ahora es ${today.date} ${today.time})` };
  }

  const days = parseDays(business?.active_days);
  const weekday = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  if (days && !days.includes(weekday)) {
    const open = days.slice().sort((a, b) => a - b).map(d => DAY_NAMES[d]).join(', ');
    const plural = (d) => (d.endsWith('s') ? d : `${d}s`);
    return { ok: false, reason: `el negocio no atiende los ${plural(DAY_NAMES[weekday])} (atiende: ${open})` };
  }

  const start = toHHMM(business?.active_hours_start);
  const end = toHHMM(business?.active_hours_end);
  if (start && end) {
    const duration = parseInt(business?.appointment_duration, 10) || 0;
    if (toMinutes(time) < toMinutes(start) || toMinutes(time) + duration > toMinutes(end)) {
      return { ok: false, reason: `${time} está fuera del horario (${start} - ${end}${duration ? `, cada cita dura ${duration} min` : ''})` };
    }
  }

  if (busy.includes(`${fecha} ${time}`)) {
    return { ok: false, reason: `${fecha} ${time} ya está ocupado por otra cita` };
  }
  return { ok: true, reason: null };
};

// Horarios ya ocupados de los próximos días: se le muestran al bot para que no los ofrezca.
const loadBusySlots = async (supabase, business, { days = 21, now = new Date() } = {}) => {
  if (!business?.id) return [];
  const today = nowInZone(business.timezone, now).date;
  const { data } = await supabase.from('appointments').select('appointment_date, appointment_time')
    .eq('business_id', business.id).neq('status', 'cancelled').gte('appointment_date', today)
    .order('appointment_date', { ascending: true }).limit(300);
  const limit = new Date(`${today}T12:00:00Z`); limit.setUTCDate(limit.getUTCDate() + days);
  const limitStr = limit.toISOString().slice(0, 10);
  return (data || [])
    .filter(a => a.appointment_date <= limitStr)
    .map(a => `${a.appointment_date} ${toHHMM(a.appointment_time)}`);
};

// ─── Citas ────────────────────────────────────────────────────────────────────
// Citas confirmadas del cliente: por conversación o por celular
const clientAppointments = async (supabase, { business, conversation, contactPhone }) => {
  let q = supabase.from('appointments').select('*').eq('business_id', business.id).eq('status', 'confirmed');
  q = conversation?.id
    ? q.or(`conversation_id.eq.${conversation.id},client_phone.eq.${contactPhone}`)
    : q.eq('client_phone', contactPhone);
  const { data } = await q.order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true });
  return data || [];
};

// La cita a la que se refiere el cliente: la de `fecha` si la nombró; si no, la más próxima
const pickAppointment = (list, fecha, today) => {
  if (fecha) return list.filter(a => a.appointment_date === fecha);
  const upcoming = list.filter(a => a.appointment_date >= today);
  return upcoming.length ? [upcoming[0]] : (list.length ? [list[list.length - 1]] : []);
};

const saveAppointment = async (supabase, { business, conversation, data, clientName, clientPhone, now }) => {
  if (!data?.fecha || !data?.hora) return { status: 'invalid', reason: 'faltan la fecha o la hora' };

  const busy = await loadBusySlots(supabase, business, { now });
  // La IA a veces repite la etiqueta al seguir conversando: la misma cita no se guarda dos veces
  const { data: same } = await supabase.from('appointments').select('id')
    .eq('conversation_id', conversation.id).eq('status', 'confirmed')
    .eq('appointment_date', data.fecha).eq('appointment_time', data.hora).limit(1);
  if (same?.length) return { status: 'duplicate' };

  const slot = validateSlot(business, data.fecha, data.hora, { busy, now });
  if (!slot.ok) return { status: 'invalid', reason: slot.reason };

  const { data: rows, error } = await supabase.from('appointments').insert({
    conversation_id: conversation.id,
    business_id: business.id,
    client_name: clientName,
    client_phone: clientPhone,
    service: data.servicio || 'Servicio General',
    appointment_date: data.fecha,
    appointment_time: data.hora,
    status: 'confirmed',
    notes: `Cita agendada por Bot IA para ${business.name}`,
  }).select().limit(1);
  if (error) return { status: 'error', reason: error.message };
  return { status: 'created', appointment: rows?.[0] };
};

const modifyAppointment = async (supabase, ctx) => {
  const { business, conversation, data, now } = ctx;
  if (!data?.fecha && !data?.hora) return { status: 'invalid', reason: 'no dice la nueva fecha ni la nueva hora' };

  const today = nowInZone(business?.timezone, now).date;
  const list = await clientAppointments(supabase, ctx);
  const [target] = pickAppointment(list, data.fecha_anterior, today);

  // No hay cita que mover: el cliente quería ESA fecha, así que se agenda (no se queda en silencio)
  if (!target) {
    const created = await saveAppointment(supabase, { ...ctx, data: { ...data, servicio: data.servicio } });
    return created.status === 'created' ? { ...created, status: 'created_from_modify' } : created;
  }

  const fecha = data.fecha || target.appointment_date;
  const hora = data.hora || target.appointment_time;
  const busy = (await loadBusySlots(supabase, business, { now }))
    .filter(s => s !== `${target.appointment_date} ${toHHMM(target.appointment_time)}`); // su propio horario no cuenta
  const slot = validateSlot(business, fecha, hora, { busy, now });
  if (!slot.ok) return { status: 'invalid', reason: slot.reason };

  const updates = { appointment_date: fecha, appointment_time: hora };
  if (data.servicio) updates.service = data.servicio;
  const { data: rows, error } = await supabase.from('appointments').update(updates).eq('id', target.id).select().limit(1);
  if (error) return { status: 'error', reason: error.message };
  return { status: 'updated', appointment: rows?.[0], previous: target };
};

const cancelAppointment = async (supabase, ctx) => {
  const { business, data, now } = ctx;
  const today = nowInZone(business?.timezone, now).date;
  const list = await clientAppointments(supabase, ctx);
  const targets = pickAppointment(list, data?.fecha, today);
  if (targets.length === 0) return { status: 'none' };
  const { data: rows, error } = await supabase.from('appointments').update({ status: 'cancelled' })
    .in('id', targets.map(t => t.id)).select();
  if (error) return { status: 'error', reason: error.message };
  return { status: 'cancelled', appointments: rows || [], count: (rows || []).length };
};

// ─── Pedidos ──────────────────────────────────────────────────────────────────
const latestOrder = async (supabase, { business, conversation }) => {
  const { data } = await supabase.from('orders').select('*')
    .eq('conversation_id', conversation.id).eq('business_id', business.id)
    .order('created_at', { ascending: false }).limit(5);
  // El más reciente que siga abierto (un pedido ya entregado o cancelado no se toca)
  return (data || []).find(o => !CLOSED_ORDER_STATUSES.has(String(o.status || '').toLowerCase())) || null;
};

const saveOrder = async (supabase, { business, conversation, order, clientName, clientPhone }) => {
  const itemsList = order.producto || order.items || 'Pedido por WhatsApp';
  const extraNotes = [order.notas, ...extraOrderFields(order), order.telefono && `Tel. que dio: ${order.telefono}`].filter(Boolean).join(' · ');

  // Mismo pedido repetido por la IA en las últimas horas de esta conversación: no se duplica
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: same } = await supabase.from('orders').select('id')
    .eq('conversation_id', conversation.id).eq('items', itemsList).gte('created_at', since).limit(1);
  if (same?.length) return { status: 'duplicate' };

  const total = parseFloat(order.total || order.precio || 0);
  const { data: rows, error } = await supabase.from('orders').insert({
    conversation_id: conversation.id,
    business_id: business.id,
    client_name: clientName,
    client_phone: clientPhone,
    items: itemsList,
    total_amount: Number.isNaN(total) ? 0 : total,
    currency: 'COP',
    shipping_address: order.direccion || order.ciudad || '',
    city: order.ciudad || '',
    payment_method: order.metodo_pago || 'Por confirmar',
    status: 'pending',
    notes: `Pedido capturado por Bot IA en WhatsApp (${business.name})${extraNotes ? ` · ${extraNotes}` : ''}`,
  }).select().limit(1);
  if (error) return { status: 'error', reason: error.message };
  return { status: 'created', order: rows?.[0] };
};

const modifyOrder = async (supabase, ctx) => {
  const { business, conversation, order } = ctx;
  const target = await latestOrder(supabase, ctx);

  // No hay pedido abierto: si el cliente nombra un producto, es un pedido nuevo (no se pierde)
  if (!target) {
    if (order?.producto || order?.items) {
      const created = await saveOrder(supabase, ctx);
      return created.status === 'created' ? { ...created, status: 'created_from_modify' } : created;
    }
    return { status: 'none' };
  }

  const changeNote = [order.notas, ...extraOrderFields(order, { alwaysQuantity: true })].filter(Boolean).join(' · ');

  // El negocio ya lo está procesando: no se cambian sus campos solos, se le avisa al dueño en las notas
  if (String(target.status).toLowerCase() !== 'pending') {
    const note = `${target.notes || ''} · ⚠️ El cliente pidió un cambio DESPUÉS de confirmar el pedido: ${[order.producto, order.direccion, order.ciudad, order.metodo_pago, changeNote].filter(Boolean).join(' · ') || 'revisar con el cliente'}`.trim();
    const { data: rows } = await supabase.from('orders').update({ notes: note }).eq('id', target.id).select().limit(1);
    return { status: 'needs_review', order: rows?.[0] };
  }

  const updates = {};
  if (order.producto) updates.items = order.producto;
  const newTotal = order.total ?? order.precio;
  if (newTotal !== undefined && newTotal !== '' && !Number.isNaN(parseFloat(newTotal)) && parseFloat(newTotal) > 0) {
    updates.total_amount = parseFloat(newTotal);
  }
  if (order.direccion) updates.shipping_address = order.direccion;
  if (order.ciudad) updates.city = order.ciudad;
  if (order.metodo_pago) updates.payment_method = order.metodo_pago;
  if (changeNote) updates.notes = `${target.notes || ''} · Modificado por Bot IA: ${changeNote}`.trim();
  if (Object.keys(updates).length === 0) return { status: 'none' };

  const { data: rows, error } = await supabase.from('orders').update(updates).eq('id', target.id).select().limit(1);
  if (error) return { status: 'error', reason: error.message };
  return { status: 'updated', order: rows?.[0], previous: target };
};

const cancelOrder = async (supabase, ctx) => {
  const { order } = ctx;
  const target = await latestOrder(supabase, ctx);
  if (!target) return { status: 'none' };
  const reason = order?.motivo ? ` (motivo: ${order.motivo})` : '';

  if (String(target.status).toLowerCase() !== 'pending') {
    const note = `${target.notes || ''} · ⚠️ El cliente pidió CANCELAR este pedido después de confirmarlo${reason}`.trim();
    const { data: rows } = await supabase.from('orders').update({ notes: note }).eq('id', target.id).select().limit(1);
    return { status: 'needs_review', order: rows?.[0] };
  }
  const { data: rows, error } = await supabase.from('orders')
    .update({ status: 'cancelled', notes: `${target.notes || ''} · Cancelado por el cliente vía Bot IA${reason}`.trim() })
    .eq('id', target.id).select().limit(1);
  if (error) return { status: 'error', reason: error.message };
  return { status: 'cancelled', order: rows?.[0] };
};

/**
 * Aplica, en orden, lo que el modelo pidió en este turno. Devuelve qué pasó con cada acción.
 * `emit(evento, fila)` avisa al panel en vivo.
 */
const applyBookingActions = async (ctx, actions) => {
  const { supabase, business, conversation, contactPhone, contactName, capturedName, phoneUnknown, givenPhone, emit = () => {}, now } = ctx;
  const out = {};
  if (!business?.id) return out;
  const base = { supabase, business, conversation, contactPhone, now };
  const clientName = capturedName || contactName;
  const phoneFor = (data) => (phoneUnknown ? (givenPhone?.(data) || contactPhone) : contactPhone);
  const run = async (key, fn) => {
    try { out[key] = await fn(); } catch (e) { out[key] = { status: 'error', reason: e.message }; console.error(`[RESERVAS] Error en ${key}:`, e.message); }
  };

  if (actions.newAppointment && conversation?.id) {
    await run('newAppointment', async () => {
      const r = await saveAppointment(supabase, { ...base, data: actions.newAppointment, clientName, clientPhone: phoneFor(actions.newAppointment) });
      if (r.status === 'created') emit('new_appointment', r.appointment);
      return r;
    });
  }
  if (actions.cancelAppointment) {
    await run('cancelAppointment', async () => {
      const r = await cancelAppointment(supabase, { ...base, data: actions.cancelAppointment });
      if (r.status === 'cancelled') emit('appointment_cancelled', r.appointments[0]);
      return r;
    });
  }
  if (actions.modifyAppointment && conversation?.id) {
    await run('modifyAppointment', async () => {
      const r = await modifyAppointment(supabase, { ...base, data: actions.modifyAppointment, clientName, clientPhone: phoneFor(actions.modifyAppointment) });
      if (r.status === 'updated') emit('appointment_modified', r.appointment);
      if (r.status === 'created_from_modify') emit('new_appointment', r.appointment);
      return r;
    });
  }
  if (actions.newOrder && conversation?.id) {
    await run('newOrder', async () => {
      const r = await saveOrder(supabase, { ...base, order: actions.newOrder, clientName, clientPhone: phoneFor(actions.newOrder) });
      if (r.status === 'created') emit('new_order', r.order);
      return r;
    });
  }
  if (actions.modifyOrder && conversation?.id) {
    await run('modifyOrder', async () => {
      const r = await modifyOrder(supabase, { ...base, order: actions.modifyOrder, clientName, clientPhone: phoneFor(actions.modifyOrder) });
      if (r.status === 'updated' || r.status === 'needs_review') emit('order_modified', r.order);
      if (r.status === 'created_from_modify') emit('new_order', r.order);
      return r;
    });
  }
  if (actions.cancelOrder && conversation?.id) {
    await run('cancelOrder', async () => {
      const r = await cancelOrder(supabase, { ...base, order: actions.cancelOrder });
      if (r.status === 'cancelled' || r.status === 'needs_review') emit('order_modified', r.order);
      return r;
    });
  }
  return out;
};

module.exports = {
  validateSlot, loadBusySlots, nowInZone,
  saveAppointment, modifyAppointment, cancelAppointment,
  saveOrder, modifyOrder, cancelOrder,
  applyBookingActions,
};
