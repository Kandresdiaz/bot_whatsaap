const { supabase } = require('../db/supabase');

// Cada conversación queda marcada con el número de WhatsApp que la atendió (owner_phone).
// El panel muestra ÚNICAMENTE los chats del número que está conectado en ese momento.
//
// Por qué no basta con filtrar por session_id: una cuenta puede tener varias filas en
// whatsapp_sessions (se acumulan al reconectar o al cambiar de número) y el listado las
// juntaba todas, así que al vincular otro WhatsApp seguían apareciendo los chats del
// anterior. Con owner_phone el corte es por número real: si el WhatsApp conectado no es
// el que atendió ese chat, el chat no existe para el panel.
//
// Si la migración 008 todavía no se ejecutó, la columna no existe: todo sigue como antes
// (se detecta una sola vez y no se vuelve a intentar).

let soportaColumna = null; // null = sin comprobar todavía
let comprobacionEnCurso = null;

const soportaOwnerPhone = async () => {
  if (soportaColumna !== null) return soportaColumna;
  if (!supabase) return false;

  if (!comprobacionEnCurso) {
    comprobacionEnCurso = (async () => {
      const { error } = await supabase.from('conversations').select('owner_phone').limit(1);
      soportaColumna = !error;
      if (error) {
        console.warn('[Chats] Falta la migración 008 (owner_phone): los chats no se acotan al número conectado.');
      }
      return soportaColumna;
    })().catch(() => {
      soportaColumna = false;
      return false;
    });
  }
  return comprobacionEnCurso;
};

const limpiarTelefono = (valor) => (valor === null || valor === undefined ? '' : String(valor)).replace(/[^0-9]/g, '');

// Número de WhatsApp conectado para esa cuenta. Primero la sesión viva en memoria
// (es la verdad en caliente) y si no, lo último que quedó guardado en la base.
const telefonoDeLaSesion = async (userId) => {
  if (!userId) return '';

  try {
    const { getSession, getValidUserId } = require('../whatsapp/sessionManager');
    const sesion = getSession(userId);
    const enRam = limpiarTelefono(sesion?.phone).split(':')[0];
    if (enRam) return enRam;

    if (!supabase) return '';
    const validUserId = getValidUserId(userId);
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('phone_number, last_phone')
      .eq('user_id', validUserId)
      .order('created_at', { ascending: false })
      .limit(1);

    const fila = data && data[0];
    // last_phone solo como respaldo: phone_number se pone en null al cerrar sesión,
    // pero last_phone sobrevive y sigue siendo el número que atendió esos chats.
    return limpiarTelefono(fila?.phone_number) || limpiarTelefono(fila?.last_phone) || '';
  } catch (e) {
    console.warn('[Chats] No se pudo resolver el número de la sesión:', e.message);
    return '';
  }
};

// Añade owner_phone a la fila que se va a insertar, si la columna existe.
const marcarDueno = async (fila, telefono) => {
  const limpio = limpiarTelefono(telefono);
  if (!limpio) return fila;
  if (!(await soportaOwnerPhone())) return fila;
  return { ...fila, owner_phone: limpio };
};

// Acota una consulta de conversaciones al número conectado.
// Sin número conocido se devuelve la consulta tal cual: el que llama ya acotó por sesión.
const acotarAlNumero = async (query, telefono) => {
  const limpio = limpiarTelefono(telefono);
  if (!limpio) return query;
  if (!(await soportaOwnerPhone())) return query;
  return query.eq('owner_phone', limpio);
};

module.exports = {
  soportaOwnerPhone,
  telefonoDeLaSesion,
  marcarDueno,
  acotarAlNumero,
  limpiarTelefono,
};
