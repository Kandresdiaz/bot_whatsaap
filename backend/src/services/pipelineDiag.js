// Radiografía de los últimos mensajes que respondió el bot, sin contenido ni teléfonos.
// Sirve para saber, sin entrar a la base, en qué paso falla un chat: si encontró la
// conversación, cuánto historial tuvo, si la IA dejó la etiqueta de la cita y si se guardó.
// Vive en memoria: se borra cuando Render reinicia (cada despliegue).

const MAX = 40;
const entries = [];

const recordPipeline = (entry) => {
  entries.push({ at: new Date().toISOString(), ...entry });
  if (entries.length > MAX) entries.shift();
};

const getPipeline = () => entries.slice().reverse();

module.exports = { recordPipeline, getPipeline };
