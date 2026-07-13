const { supabase } = require('../db/supabase');

const appointmentFlows = new Map();

const isAppointmentIntent = (text) => {
  const keywords = ['cita', 'agendar', 'reservar', 'turno', 'disponibilidad', 'cuando puedo', 'quiero ir', 'quiero una cita'];
  return keywords.some(k => text.toLowerCase().includes(k));
};

const sendText = async (sock, jid, text) => {
  await sock.sendMessage(jid, { text });
};

const handleAppointmentFlow = async (sock, msg, conversation, business, jid) => {
  const phone = conversation.contact_phone;
  const name = conversation.contact_name || phone;

  // Extraer texto del mensaje Baileys
  const m = msg.message;
  const text = (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    ''
  ).trim();

  if (!text) return false;

  let flow = appointmentFlows.get(phone);

  // ¿Quiere agendar y no hay flujo activo?
  if (!flow && isAppointmentIntent(text)) {
    flow = { step: 'service', data: { clientName: name, clientPhone: phone } };
    appointmentFlows.set(phone, flow);
    await sendText(sock, jid,
      `📅 ¡Con gusto te agendo una cita!\n\n¿Qué servicio necesitas?\n_(Ej: "corte de cabello", "consulta", "revisión")_`
    );
    return true;
  }

  if (!flow) return false;

  if (flow.step === 'service') {
    flow.data.service = text;
    flow.step = 'date';
    appointmentFlows.set(phone, flow);
    await sendText(sock, jid, `✅ *${text}*\n\n📆 ¿Qué día prefieres?\n_(Ej: "lunes 14 de julio" o "15/07/2026")_`);
    return true;
  }

  if (flow.step === 'date') {
    flow.data.dateRaw = text;
    flow.data.date = parseDate(text);
    flow.step = 'time';
    appointmentFlows.set(phone, flow);
    await sendText(sock, jid, `✅ Anotado para *${text}*\n\n🕐 ¿A qué hora?\n_(Ej: "10am", "3:30pm", "15:00")_`);
    return true;
  }

  if (flow.step === 'time') {
    flow.data.timeRaw = text;
    flow.data.time = parseTime(text);
    flow.step = 'confirm';
    appointmentFlows.set(phone, flow);
    const { service, dateRaw, timeRaw } = flow.data;
    await sendText(sock, jid,
      `📋 *Resumen de tu cita:*\n\n` +
      `🏥 Servicio: *${service}*\n` +
      `📆 Fecha: *${dateRaw}*\n` +
      `🕐 Hora: *${timeRaw}*\n\n` +
      `¿Confirmamos? Responde *SÍ* para confirmar o *NO* para cancelar.`
    );
    return true;
  }

  if (flow.step === 'confirm') {
    const ans = text.toLowerCase();
    if (ans.includes('sí') || ans.includes('si') || ans === 's') {
      const { service, date, time, dateRaw, timeRaw, clientName, clientPhone } = flow.data;

      const { data: appt } = await supabase.from('appointments').insert({
        conversation_id: conversation.id,
        business_id: business.id,
        client_name: clientName,
        client_phone: clientPhone,
        service,
        appointment_date: date,
        appointment_time: time,
        status: 'confirmed',
      }).select().single();

      appointmentFlows.delete(phone);
      await sendText(sock, jid,
        `🎉 *¡Cita confirmada!*\n\n📋 ${service}\n📆 ${dateRaw} a las ${timeRaw}\n\nTe esperamos. Si necesitas cambiarla, escríbenos con anticipación 😊`
      );
      if (global.io) global.io.to(`user_${business.user_id}`).emit('new_appointment', appt);
      return true;
    }
    if (ans.includes('no') || ans === 'n') {
      appointmentFlows.delete(phone);
      await sendText(sock, jid, `Entendido, cita cancelada. Si necesitas agendar en otro momento, escríbenos 😊`);
      return true;
    }
    await sendText(sock, jid, `Responde *SÍ* para confirmar o *NO* para cancelar.`);
    return true;
  }

  return false;
};

const parseDate = (text) => {
  const match = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (match) {
    const [, d, m, y] = match;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
};

const parseTime = (text) => {
  const t = text.toLowerCase().replace(/\s/g,'');
  const pm = t.match(/(\d{1,2})(?::(\d{2}))?pm/);
  const am = t.match(/(\d{1,2})(?::(\d{2}))?am/);
  const h24 = t.match(/(\d{1,2}):(\d{2})/);
  if (pm) { let h = parseInt(pm[1]); if (h!==12) h+=12; return `${String(h).padStart(2,'0')}:${pm[2]||'00'}:00`; }
  if (am) { let h = parseInt(am[1]); if (h===12) h=0; return `${String(h).padStart(2,'0')}:${am[2]||'00'}:00`; }
  if (h24) return `${h24[1].padStart(2,'0')}:${h24[2]}:00`;
  return null;
};

module.exports = { handleAppointmentFlow, isAppointmentIntent };
