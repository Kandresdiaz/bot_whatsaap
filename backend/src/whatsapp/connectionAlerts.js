// ============================================================================
// Avisos de desconexión por WhatsApp
// ----------------------------------------------------------------------------
// Cuando el bot de un usuario se cae de una forma que requiere su atención
// (WhatsApp cerró la sesión, o lleva varios intentos sin reconectar), le
// mandamos un WhatsApp al número que ese usuario configuró en users.alert_phone.
//
// CLAVE: el aviso NO se envía desde el número del propio cliente (que es justo
// el que se cayó), sino desde un NÚMERO MAESTRO (la sesión admin), que debe
// estar siempre conectado. Se configura con ALERT_SENDER_USER_ID (por defecto,
// la cuenta admin principal).
//
// Para evitar dependencia circular, sessionManager se requiere de forma perezosa
// dentro de cada función (no en la cabecera del archivo).
// ============================================================================

const PRIMARY_ADMIN_ID = '0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d';

let supabase = null;
try { supabase = require('../db/supabase').supabase; } catch (_) {}

// Estado por usuario para no spamear: una sola alerta por caída, y un "ya volvió"
// cuando reconecta. validUserId -> 'ok' | 'alerted'
const alertState = new Map();

const onlyDigits = (s) => String(s || '').replace(/[^0-9]/g, '');

const getMasterSenderId = () => process.env.ALERT_SENDER_USER_ID || PRIMARY_ADMIN_ID;

const getPanelUrl = () =>
  process.env.PANEL_URL || 'https://bot-whatsaap.vercel.app/dashboard/connect';

// Lee el número de aviso del usuario cuya sesión cayó + el nombre del negocio.
const getAlertTargetInfo = async (validUserId) => {
  if (!supabase || !validUserId) return null;
  try {
    const { data: u } = await supabase
      .from('users')
      .select('id, name, alert_phone, alert_enabled')
      .eq('id', validUserId)
      .maybeSingle();

    if (!u) return null;
    const phone = onlyDigits(u.alert_phone);
    if (!phone || u.alert_enabled === false) return null; // sin número o avisos apagados

    let businessName = u.name || '';
    try {
      const { data: biz } = await supabase
        .from('businesses')
        .select('name')
        .eq('user_id', validUserId)
        .maybeSingle();
      if (biz?.name) businessName = biz.name;
    } catch (_) {}

    return { phone, businessName };
  } catch (_) {
    return null;
  }
};

// Envía el texto desde el número maestro. Devuelve true si salió.
const sendFromMaster = async (destPhone, text) => {
  const sm = require('./sessionManager');
  const senderId = getMasterSenderId();
  const senderSession =
    sm.getSession(senderId) || sm.getSession(sm.getValidUserId(senderId));

  if (!senderSession?.sock || senderSession.status !== 'connected') {
    console.warn(
      `[Alertas] ⚠️ El número maestro (${senderId}) no está conectado: no se pudo ` +
      `enviar la alerta a +${destPhone}. El banner del panel sigue mostrando el estado.`
    );
    return false;
  }

  try {
    await sm.sendMessage(senderId, destPhone, text);
    console.log(`[Alertas] 📨 Alerta enviada a +${destPhone}`);
    return true;
  } catch (e) {
    console.warn(`[Alertas] Error enviando alerta a +${destPhone}:`, e.message);
    return false;
  }
};

const REASON_TEXT = {
  logged_out:
    'WhatsApp cerró la sesión. Necesitas *escanear el código QR de nuevo* para reactivar tu bot.',
  reconnect_failed:
    'tu bot lleva varios intentos sin poder reconectarse. Revisa tu conexión o reescanea el QR.',
};

// Avisar que la sesión de un usuario se cayó (una sola vez por caída).
const notifyOwnerDisconnect = async (userId, reason = 'logged_out') => {
  const sm = require('./sessionManager');
  const validUserId = sm.getValidUserId(userId);

  if (alertState.get(validUserId) === 'alerted') return; // ya avisamos
  alertState.set(validUserId, 'alerted');

  const info = await getAlertTargetInfo(validUserId);
  if (!info) return; // sin número configurado o avisos apagados

  const bizLabel = info.businessName ? ` de *${info.businessName}*` : '';
  const motivo = REASON_TEXT[reason] || 'tu bot de WhatsApp se desconectó.';
  const text =
    `⚠️ *Alerta BotWA*\n\n` +
    `El bot de WhatsApp${bizLabel} se desconectó: ${motivo}\n\n` +
    `👉 Reconéctalo aquí: ${getPanelUrl()}`;

  await sendFromMaster(info.phone, text);
};

// Avisar que la sesión volvió, SOLO si antes habíamos mandado una alerta.
const notifyOwnerReconnect = async (userId) => {
  const sm = require('./sessionManager');
  const validUserId = sm.getValidUserId(userId);

  const wasAlerted = alertState.get(validUserId) === 'alerted';
  alertState.set(validUserId, 'ok');
  if (!wasAlerted) return;

  const info = await getAlertTargetInfo(validUserId);
  if (!info) return;

  const bizLabel = info.businessName ? ` de *${info.businessName}*` : '';
  const text =
    `✅ *BotWA reconectado*\n\n` +
    `El bot de WhatsApp${bizLabel} volvió a estar en línea. Todo normal. 🟢`;

  await sendFromMaster(info.phone, text);
};

module.exports = {
  notifyOwnerDisconnect,
  notifyOwnerReconnect,
};
