// "Reiniciar conversación del bot": el dueño quiere que el bot atienda a un cliente como si
// fuera la primera vez, SIN borrar el registro (mensajes, citas, pedidos).
// Se guarda un mensaje marcador en la conversación; al armar el historial para la IA solo se
// usa lo que vino después del último marcador. El marcador nunca se envía por WhatsApp.

const RESET_MARK = '🔄 Conversación reiniciada';

const isResetMark = (m) => typeof m?.content === 'string' && m.content.startsWith(RESET_MARK);

// Historial a partir del último reinicio (sin incluir el marcador)
const cutAtReset = (history) => {
  if (!Array.isArray(history)) return { history: [], wasReset: false };
  let last = -1;
  history.forEach((m, i) => { if (isResetMark(m)) last = i; });
  return last === -1
    ? { history, wasReset: false }
    : { history: history.slice(last + 1), wasReset: true };
};

module.exports = { RESET_MARK, isResetMark, cutAtReset };
