const { supabase } = require('../db/supabase');
const { SessionManager } = require('../whatsapp/sessionManager');

const checkRenewals = async () => {
  const now = new Date();
  const in3Days = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);

  // Usuarios que vencen en 3 días
  const { data: expiringSoon } = await supabase
    .from('users')
    .select('*, whatsapp_sessions(id, status)')
    .eq('status', 'active')
    .lte('paid_until', in3Days.toISOString())
    .gte('paid_until', now.toISOString());

  for (const user of expiringSoon || []) {
    const session = user.whatsapp_sessions?.[0];
    if (!session || session.status !== 'connected') continue;

    const client = SessionManager.getClient(session.id);
    if (!client || !user.phone) continue;

    const message = `⚠️ *Recordatorio de renovación*\n\n` +
      `Hola ${user.name}, tu suscripción al bot de WhatsApp vence el ${new Date(user.paid_until).toLocaleDateString('es-CO')}.\n\n` +
      `Para renovar y continuar con el servicio, escríbenos o realiza tu pago por Nequi.\n\n` +
      `¡Gracias por confiar en nosotros! 🤝`;

    try {
      await client.sendMessage(`${user.phone}@c.us`, message);
      console.log(`Recordatorio enviado a: ${user.email}`);
    } catch (err) {
      console.error(`Error enviando recordatorio a ${user.email}:`, err);
    }
  }

  // Usuarios con prueba de 7 días vencida sin pago → pausar automáticamente
  const { data: expiredTrials } = await supabase
    .from('users')
    .select('id, email')
    .eq('subscription_status', 'trialing')
    .eq('status', 'active')
    .lt('trial_ends_at', now.toISOString());

  for (const user of expiredTrials || []) {
    await supabase.from('users').update({ status: 'paused', subscription_status: 'past_due' }).eq('id', user.id);
    console.log(`[RENEWAL] Prueba de 7 días expirada, usuario pausado: ${user.email} (${user.id})`);
  }

  // Usuarios activos con paid_until vencido → pausar automáticamente
  const { data: expired } = await supabase
    .from('users')
    .select('id, email')
    .eq('status', 'active')
    .not('paid_until', 'is', null)
    .lt('paid_until', now.toISOString());

  for (const user of expired || []) {
    await supabase.from('users').update({ status: 'paused' }).eq('id', user.id);
    console.log(`[RENEWAL] Usuario pausado por vencimiento de mensualidad: ${user.email} (${user.id})`);
  }
};

module.exports = { checkRenewals };
