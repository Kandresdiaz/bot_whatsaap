// ¿El local está cerrado ahora mismo según días y horario del negocio?
// El bot responde igual 24/7; solo cambia el contexto que recibe la IA.
//
// Soporta horarios que CRUZAN LA MEDIANOCHE (un restaurante de 6:00 pm a 2:00 am). Antes la
// comparación era `hora < inicio || hora >= fin`, que con 18:00–02:00 da verdadero a TODAS las
// horas: el bot le decía al cliente que estaban cerrados justo en plena hora pico.
// En un horario nocturno la madrugada pertenece al turno del día anterior, así que los días de
// atención se comparan contra ESE día (1:00 am del domingo = turno del sábado).
// También se tienen en cuenta los minutos: un cierre a las 21:30 no es a las 21:00.

const toMinutes = (value, fallback) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
  if (!m) return fallback;
  const minutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return Number.isFinite(minutes) ? minutes : fallback;
};

const isOutsideHours = (business, now = new Date()) => {
  const local = new Date(now.toLocaleString('en-US', { timeZone: business.timezone || 'America/Bogota' }));
  const minutes = local.getHours() * 60 + local.getMinutes();

  let activeDays = business.active_days || [0, 1, 2, 3, 4, 5, 6];
  if (typeof activeDays === 'string') {
    try { activeDays = JSON.parse(activeDays); } catch (_) { activeDays = [0, 1, 2, 3, 4, 5, 6]; }
  }
  if (!Array.isArray(activeDays)) return false;

  const start = toMinutes(business.active_hours_start, 0);
  const end = toMinutes(business.active_hours_end, 24 * 60);
  const overnight = end <= start;

  const inWindow = overnight
    ? (minutes >= start || minutes < end)
    : (minutes >= start && minutes < end);
  if (!inWindow) return true;

  // El día que cuenta es el del turno abierto, no el del calendario
  const shiftDay = overnight && minutes < end ? (local.getDay() + 6) % 7 : local.getDay();
  return !activeDays.includes(shiftDay);
};

module.exports = { isOutsideHours, toMinutes };
