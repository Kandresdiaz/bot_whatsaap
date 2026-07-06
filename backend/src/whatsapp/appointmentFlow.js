const { supabase } = require('../db/supabase');

/**
 * Flujo de agendamiento paso a paso.
 * Estado guardado en memoria por conversación:
 * { step: 'service'|'date'|'time'|'confirm', data: {...} }
 */
const appointmentFlows = new Map();

const STEPS = {
  START: 'service',
  SERVICE: 'date',
  DATE: 'time',
  TIME: 'confirm',
  CONFIRM: 'done',
};

const isAppointmentIntent = (text) => {
  const keywords = ['cita', 'agendar', 'reservar', 'turno', 'appointment', 'horario', 'disponibilidad', 'cuando puedo', 'quiero ir'];
  return keywords.some(k => text.toLowerCase().includes(k));
};

const handleAppointmentFlow = async (client, msg, conversation, business) => {
  const phone = conversation.contact_phone;
  const name = conversation.contact_name || phone;
  const text = msg.body?.trim() || '';
  const to = msg.from;

  let flow = appointmentFlows.get(phone);

  // ¿Quiere agendar y no hay flujo activo?
  if (!flow && isAppointmentIntent(text)) {
    flow = { step: 'service', data: { clientName: name, clientPhone: phone } };
    appointmentFlows.set(phone, flow);

    await client.sendMessage(to,
      `📅 ¡Con gusto te agendo una cita!\n\n¿Qué servicio necesitas?\n_(Escríbelo, por ejemplo: "corte de cabello", "consulta médica", etc.)_`
    );
    return true; // indica que el flujo tomó control
  }

  if (!flow) return false; // no hay flujo activo

  // ─── Paso 1: servicio ────────────────────────────────────────────────────
  if (flow.step === 'service') {
    flow.data.service = text;
    flow.step = 'date';
    appointmentFlows.set(phone, flow);

    await client.sendMessage(to,
      `✅ Perfecto, *${text}*.\n\n📆 ¿Qué día prefieres?\n_(Escribe la fecha, ej: "lunes 14 de julio" o "15/07/2026")_`
    );
    return true;
  }

  // ─── Paso 2: fecha ──────────────────────────────────────────────────────
  if (flow.step === 'date') {
    flow.data.dateRaw = text;
    flow.data.date = parseDate(text);
    flow.step = 'time';
    appointmentFlows.set(phone, flow);

    await client.sendMessage(to,
      `✅ Anotado para *${text}*.\n\n🕐 ¿A qué hora te queda mejor?\n_(Ej: "10am", "3:30pm", "15:00")_`
    );
    return true;
  }

  // ─── Paso 3: hora ───────────────────────────────────────────────────────
  if (flow.step === 'time') {
    flow.data.timeRaw = text;
    flow.data.time = parseTime(text);
    flow.step = 'confirm';
    appointmentFlows.set(phone, flow);

    const { service, dateRaw, timeRaw } = flow.data;
    await client.sendMessage(to,
      `📋 *Resumen de tu cita:*\n\n` +
      `🏥 Servicio: *${service}*\n` +
      `📆 Fecha: *${dateRaw}*\n` +
      `🕐 Hora: *${timeRaw}*\n\n` +
      `¿Confirmamos? Responde *SÍ* para confirmar o *NO* para cancelar.`
    );
    return true;
  }

  // ─── Paso 4: confirmación ───────────────────────────────────────────────
  if (flow.step === 'confirm') {
    const answer = text.toLowerCase();

    if (answer.includes('sí') || answer.includes('si') || answer === 's' || answer === 'yes') {
      const { service, date, time, dateRaw, timeRaw, clientName, clientPhone } = flow.data;

      // Guardar cita en BD
      const { data: appt } = await supabase
        .from('appointments')
        .insert({
          conversation_id: conversation.id,
          business_id: business.id,
          client_name: clientName,
          client_phone: clientPhone,
          service,
          appointment_date: date,
          appointment_time: time,
          status: 'confirmed',
        })
        .select()
        .single();

      appointmentFlows.delete(phone);

      await client.sendMessage(to,
        `🎉 *¡Cita confirmada!*\n\n` +
        `📋 ${service}\n` +
        `📆 ${dateRaw} a las ${timeRaw}\n\n` +
        `Te esperamos. Si necesitas cancelar o cambiar, escríbenos con anticipación. ¡Hasta pronto! 😊`
      );

      // Notificar al dueño del negocio
      if (global.io) {
        global.io.to(`business_${business.id}`).emit('new_appointment', appt);
      }

      return true;
    }

    if (answer.includes('no') || answer === 'n') {
      appointmentFlows.delete(phone);
      await client.sendMessage(to, `Entendido, cita cancelada. Si necesitas agendar en otro momento, escríbenos 😊`);
      return true;
    }

    // No entendió
    await client.sendMessage(to, `Por favor responde *SÍ* para confirmar o *NO* para cancelar.`);
    return true;
  }

  return false;
};

// ─── Parsers simples de fecha/hora ──────────────────────────────────────────
const parseDate = (text) => {
  // Intentar parsear fechas en formato dd/mm/yyyy o dd-mm-yyyy
  const dmyMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null; // si no parsea, guarda null
};

const parseTime = (text) => {
  const t = text.toLowerCase().replace(/\s/g, '');
  const pmMatch = t.match(/(\d{1,2})(?::(\d{2}))?pm/);
  const amMatch = t.match(/(\d{1,2})(?::(\d{2}))?am/);
  const h24Match = t.match(/(\d{1,2}):(\d{2})/);

  if (pmMatch) {
    let h = parseInt(pmMatch[1]);
    const m = pmMatch[2] || '00';
    if (h !== 12) h += 12;
    return `${String(h).padStart(2, '0')}:${m}:00`;
  }
  if (amMatch) {
    let h = parseInt(amMatch[1]);
    const m = amMatch[2] || '00';
    if (h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}:00`;
  }
  if (h24Match) {
    return `${h24Match[1].padStart(2, '0')}:${h24Match[2]}:00`;
  }
  return null;
};

module.exports = { handleAppointmentFlow, isAppointmentIntent };
