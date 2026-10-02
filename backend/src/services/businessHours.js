// ¿El local está cerrado ahora mismo según días y horario del negocio?
// El bot responde igual 24/7; solo cambia el contexto que recibe la IA.
const isOutsideHours = (business, now = new Date()) => {
  const local = new Date(now.toLocaleString('en-US', { timeZone: business.timezone || 'America/Bogota' }));
  const hour = local.getHours();
  const day = local.getDay();
  let activeDays = business.active_days || [0, 1, 2, 3, 4, 5, 6];
  if (typeof activeDays === 'string') {
    try { activeDays = JSON.parse(activeDays); } catch (_) { activeDays = [0, 1, 2, 3, 4, 5, 6]; }
  }
  const start = parseInt(business.active_hours_start?.toString().split(':')[0] || '0');
  const end = parseInt(business.active_hours_end?.toString().split(':')[0] || '24');

  return Array.isArray(activeDays) && (!activeDays.includes(day) || hour < start || hour >= end);
};

module.exports = { isOutsideHours };
