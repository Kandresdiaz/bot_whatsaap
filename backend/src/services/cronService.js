const cron = require('node-cron');
const { supabase } = require('../db/supabase');
const { sendTrialReminderEmail } = require('./emailService');
const { runAppointmentReminders } = require('./appointmentReminders');

const PLAN_NAMES = {
  starter: 'Plan Vendedor Automático',
  pro: 'Plan Máquina de Ventas Pro',
  business: 'Plan Dominio Agencia / VIP'
};

const PLAN_PRICES = {
  starter: 120000,
  pro: 249000,
  business: 490000
};

// ── Cron Job: Recordatorio 48h antes del cobro automático ──────────────────────
const initCronJobs = () => {
  // Se ejecuta todos los días a las 09:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] ⏰ Ejecutando revisión de recordatorios de prueba gratuita...');
    try {
      const now = new Date();
      const in48Hours = new Date(now.getTime() + (48 * 60 * 60 * 1000));

      // Buscar usuarios en trial cuyo fin sea en las próximas 48h y no se les haya notificado
      const { data: usersToRemind, error } = await supabase
        .from('users')
        .select('id, email, name, plan, trial_ends_at, trial_reminder_sent')
        .eq('subscription_status', 'trialing')
        .lte('trial_ends_at', in48Hours.toISOString())
        .gt('trial_ends_at', now.toISOString())
        .or('trial_reminder_sent.is.null,trial_reminder_sent.eq.false');

      if (error) {
        console.error('[CRON ERROR] Error consultando usuarios para recordatorio:', error.message);
        return;
      }

      if (!usersToRemind || usersToRemind.length === 0) {
        console.log('[CRON] No hay usuarios pendientes de recordatorio hoy.');
        return;
      }

      console.log(`[CRON] Enviando recordatorio a ${usersToRemind.length} usuarios...`);

      for (const u of usersToRemind) {
        if (!u.email) continue;
        const planKey = (u.plan || 'pro').toLowerCase();
        const planName = PLAN_NAMES[planKey] || 'Plan Máquina de Ventas Pro';
        const amountCOP = PLAN_PRICES[planKey] || 249000;

        await sendTrialReminderEmail({
          to: u.email,
          userName: u.name || '',
          planName,
          daysLeft: 2,
          amountCOP
        });

        // Marcar recordatorio como enviado para no duplicar
        await supabase.from('users').update({ trial_reminder_sent: true }).eq('id', u.id);
        console.log(`[CRON] ✅ Recordatorio enviado y registrado para: ${u.email}`);
      }
    } catch (err) {
      console.error('[CRON ERROR] Fallo inesperado en cron de recordatorios:', err.message);
    }
  });

  // ── Recordatorios de citas a los clientes del negocio ───────────────────────
  // Cada 5 minutos: el aviso más corto que ofrece el panel es 1 hora antes, así que el
  // recordatorio sale entre 55 y 60 minutos antes de la cita. Es una consulta pequeña a la
  // base, y solo envía a los negocios que lo activaron en su panel.
  let recordatoriosEnCurso = false;
  cron.schedule('*/5 * * * *', async () => {
    if (recordatoriosEnCurso) return; // un ciclo lento no se pisa con el siguiente
    recordatoriosEnCurso = true;
    try {
      await runAppointmentReminders();
    } catch (err) {
      console.error('[CRON ERROR] Fallo en recordatorios de citas:', err.message);
    } finally {
      recordatoriosEnCurso = false;
    }
  });

  console.log('[CRON] 🚀 Sistema de recordatorios de cobro, retención y citas inicializado.');
};

module.exports = { initCronJobs };
