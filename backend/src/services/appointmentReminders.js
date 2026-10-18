// Recordatorios automáticos de citas.
//
// Hasta ahora el panel solo tenía el botón "📲 WhatsApp" de cada cita: abre wa.me con el
// texto escrito y el dueño lo manda a mano, cita por cita. Aquí el bot lo hace solo, pero
// ÚNICAMENTE si el dueño lo activó en Panel → Citas (businesses.appointment_reminders_enabled).
// Apagado es el estado inicial: nadie le escribe a los clientes de un negocio sin que su
// dueño lo haya pedido.
//
// Reglas:
//  · Se avisa una sola vez por cita (appointments.reminder_sent_at). Si la cita se reprograma,
//    el endpoint de citas borra esa marca y el cliente recibe el aviso de la fecha nueva.
//  · Solo citas pendientes o confirmadas: las canceladas y completadas no se recuerdan.
//  · La ventana se calcula en la zona horaria del negocio, no en la del servidor.
//  · Si el WhatsApp de ese negocio no está conectado, la cita NO se marca: se reintenta en el
//    siguiente ciclo (así el cliente alcanza a recibir el aviso cuando vuelva la sesión).
//  · Si la base de datos todavía no tiene las columnas de la migración 009, todo esto se apaga
//    solo y el resto del sistema sigue igual.

const { supabase } = require('../db/supabase');
const { nowInZone } = require('./bookingActions');
const { emitToBusinessOwner } = require('./ownerEvents');

const HORAS_PERMITIDAS = [2, 4, 24, 48];
const HORAS_POR_DEFECTO = 24;
const PAUSA_ENTRE_ENVIOS_MS = 1500;

// Se enciende si la BD no tiene las columnas de la 009: así no se repite la consulta fallida
// cada diez minutos ni se llena el log.
let faltaLaMigracion = false;

const esColumnaFaltante = (error) => {
  if (!error) return false;
  const texto = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  return error.code === '42703'
    || error.code === 'PGRST204'
    || texto.includes('reminder_sent_at')
    || texto.includes('appointment_reminders_enabled')
    || texto.includes('appointment_reminder_hours');
};

const faltanLasColumnas = () => faltaLaMigracion;

const horasDeAviso = (business) => {
  const horas = parseInt(business?.appointment_reminder_hours, 10);
  if (!Number.isFinite(horas)) return HORAS_POR_DEFECTO;
  // La más cercana de las que ofrece el panel: una hora rara en la BD no rompe el envío.
  return HORAS_PERMITIDAS.reduce(
    (mejor, h) => (Math.abs(h - horas) < Math.abs(mejor - horas) ? h : mejor),
    HORAS_POR_DEFECTO
  );
};

const toHHMM = (t) => String(t || '').slice(0, 5);
const clave = (fecha, hora) => `${fecha} ${toHHMM(hora)}`;
const soloDigitos = (t) => String(t || '').replace(/[^0-9]/g, '');

const fechaEnEspanol = (fecha) => {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
    }).format(new Date(`${fecha}T12:00:00Z`));
  } catch (_) {
    return fecha;
  }
};

const hora12h = (hora) => {
  const [h, m] = toHHMM(hora).split(':');
  const num = parseInt(h, 10);
  if (!Number.isFinite(num)) return toHHMM(hora);
  const periodo = num >= 12 ? 'PM' : 'AM';
  const h12 = num % 12 === 0 ? 12 : num % 12;
  return `${h12}:${m || '00'} ${periodo}`;
};

const textoRecordatorio = (business, appt) => {
  const negocio = (business?.name || '').trim() || 'nuestro equipo';
  const servicio = (appt.service || '').trim() || 'tu cita';
  return `¡Hola ${appt.client_name || ''}! 👋 Te escribimos de *${negocio}*.\n\n` +
    `Te recordamos tu cita de *${servicio}*:\n` +
    `📅 ${fechaEnEspanol(appt.appointment_date)}\n` +
    `🕐 ${hora12h(appt.appointment_time)}\n\n` +
    `¿Nos confirmas que puedes asistir? Si necesitas cambiarla o cancelarla, escríbenos por aquí y lo ajustamos. ¡Te esperamos! ✨`;
};

// El dueño ve el recordatorio dentro del chat del cliente, igual que cualquier mensaje del bot.
// Es un extra: si falla, el recordatorio ya salió y no se reenvía por esto.
const registrarEnElChat = async (appt, texto) => {
  if (!appt.conversation_id) return;
  try {
    const ahora = new Date().toISOString();
    await supabase.from('messages').insert({
      conversation_id: appt.conversation_id,
      content: texto,
      direction: 'outbound',
      sent_by: 'bot',
      timestamp: ahora,
    });
    await supabase.from('conversations')
      .update({ last_message: texto, last_message_at: ahora })
      .eq('id', appt.conversation_id);
  } catch (e) {
    console.warn('[Recordatorios] No se pudo guardar el recordatorio en el chat:', e.message);
  }
};

const rangoDeFechas = (now) => {
  // Margen amplio en UTC (la ventana fina se calcula después en la zona de cada negocio):
  // desde ayer, para no perder citas por diferencia de huso, hasta 3 días adelante, que cubre
  // el aviso más lejano que ofrece el panel (48 h).
  const dia = (desplazamiento) => {
    const d = new Date(now.getTime() + desplazamiento * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  };
  return { desde: dia(-1), hasta: dia(3) };
};

/**
 * Revisa las citas próximas y envía los recordatorios que estén pendientes.
 * @param {object} [opts]
 * @param {Date} [opts.now]
 * @returns {Promise<{enviados: number, omitidos: number}>}
 */
const runAppointmentReminders = async ({ now = new Date() } = {}) => {
  const resumen = { enviados: 0, omitidos: 0 };
  if (!supabase || faltaLaMigracion) return resumen;

  const { desde, hasta } = rangoDeFechas(now);

  const { data: citas, error } = await supabase
    .from('appointments')
    .select('id, business_id, conversation_id, client_name, client_phone, service, appointment_date, appointment_time, status')
    .in('status', ['pending', 'confirmed'])
    .gte('appointment_date', desde)
    .lte('appointment_date', hasta)
    .is('reminder_sent_at', null)
    .order('appointment_date', { ascending: true })
    .limit(500);

  if (error) {
    if (esColumnaFaltante(error)) {
      faltaLaMigracion = true;
      console.warn('[Recordatorios] Falta la migración 009 (reminder_sent_at): recordatorios automáticos desactivados.');
      return resumen;
    }
    console.error('[Recordatorios] Error consultando citas:', error.message);
    return resumen;
  }

  if (!citas || citas.length === 0) return resumen;

  const negocioIds = [...new Set(citas.map(c => c.business_id).filter(Boolean))];
  if (negocioIds.length === 0) return resumen;

  // select('*'): si las columnas de la 009 no existen llegan como undefined y el negocio queda
  // con los recordatorios apagados, en vez de que falle la consulta entera.
  const { data: negocios, error: errorNegocios } = await supabase
    .from('businesses')
    .select('*')
    .in('id', negocioIds);

  if (errorNegocios) {
    console.error('[Recordatorios] Error consultando negocios:', errorNegocios.message);
    return resumen;
  }

  const { getSession, getValidUserId, sendMessage } = require('../whatsapp/sessionManager');

  for (const business of negocios || []) {
    if (business.appointment_reminders_enabled !== true) continue;
    if (!business.user_id) continue;

    const horas = horasDeAviso(business);
    const ahoraLocal = nowInZone(business.timezone, now);
    const limiteLocal = nowInZone(business.timezone, new Date(now.getTime() + horas * 60 * 60 * 1000));
    const claveAhora = clave(ahoraLocal.date, ahoraLocal.time);
    const claveLimite = clave(limiteLocal.date, limiteLocal.time);

    const pendientes = citas.filter(c => {
      if (c.business_id !== business.id) return false;
      const k = clave(c.appointment_date, c.appointment_time);
      return k > claveAhora && k <= claveLimite;
    });

    if (pendientes.length === 0) continue;

    // Sin WhatsApp conectado no se envía ni se marca: se reintenta en el siguiente ciclo.
    const sesion = getSession(business.user_id) || getSession(getValidUserId(business.user_id));
    if (!sesion?.sock) {
      resumen.omitidos += pendientes.length;
      console.log(`[Recordatorios] ${business.name || business.id}: ${pendientes.length} recordatorio(s) en espera (WhatsApp desconectado).`);
      continue;
    }

    for (const appt of pendientes) {
      const telefono = soloDigitos(appt.client_phone);
      if (telefono.length < 7) {
        resumen.omitidos++;
        // Sin número no hay a quién escribirle: se marca para no revisarla en cada ciclo.
        await supabase.from('appointments')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', appt.id);
        continue;
      }

      const texto = textoRecordatorio(business, appt);
      try {
        await sendMessage(business.user_id, telefono, texto);
        const enviadoEn = new Date().toISOString();
        await supabase.from('appointments')
          .update({ reminder_sent_at: enviadoEn })
          .eq('id', appt.id);
        await registrarEnElChat(appt, texto);
        // Para que el panel marque la cita como avisada sin esperar un refresco.
        await emitToBusinessOwner('appointment_updated', business.id, { ...appt, reminder_sent_at: enviadoEn });
        resumen.enviados++;
        console.log(`[Recordatorios] ✅ Aviso enviado a ${appt.client_name} (+${telefono}) · cita ${appt.appointment_date} ${toHHMM(appt.appointment_time)}`);
      } catch (e) {
        resumen.omitidos++;
        console.warn(`[Recordatorios] No se pudo avisar a +${telefono}: ${e.message}`);
      }
      // WhatsApp castiga las ráfagas: se envía uno por uno.
      await new Promise(r => setTimeout(r, PAUSA_ENTRE_ENVIOS_MS));
    }
  }

  if (resumen.enviados > 0 || resumen.omitidos > 0) {
    console.log(`[Recordatorios] Ciclo terminado: ${resumen.enviados} enviado(s), ${resumen.omitidos} en espera/omitido(s).`);
  }
  return resumen;
};

module.exports = {
  runAppointmentReminders,
  faltanLasColumnas,
  esColumnaFaltante,
  HORAS_PERMITIDAS,
  HORAS_POR_DEFECTO,
};
