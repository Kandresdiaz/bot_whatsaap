// Transcribe las notas de voz que manda el cliente. En Colombia pedir comida por audio es lo
// normal: "hola, me regalas dos hamburguesas y una gaseosa para el barrio Laureles". Antes el bot
// contestaba "por aquí no puedo escuchar audios" y el pedido se caía ahí mismo.
//
// Usa Whisper en Groq (las mismas llaves que el chat, así que no hace falta configurar nada nuevo).
// Si no hay llave o el servicio falla, devuelve null y el handler responde lo de siempre: pedirle
// al cliente que escriba. Nunca se inventa lo que dijo el audio.

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];
const TIMEOUT_MS = 30000;
// Un audio de voz de WhatsApp pesa ~1 KB por segundo. 8 MB son más de 2 horas: pasado eso no es
// un pedido, y subirlo gastaría la cuota sin sentido.
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CHARS = 1200;

const cleanKey = (k) => (k || '').trim().replace(/^['"]|['"]$/g, '');

// GROQ_API_KEY + GROQ_API_KEYS (lista) + GROQ_API_KEY_2..5, igual que el pool de chat
const getKeys = () => {
  const keys = [cleanKey(process.env.GROQ_API_KEY)];
  (process.env.GROQ_API_KEYS || '').split(',').forEach(k => keys.push(cleanKey(k)));
  for (let i = 2; i <= 5; i++) keys.push(cleanKey(process.env[`GROQ_API_KEY_${i}`]));
  return [...new Set(keys.filter(Boolean))];
};

const isAudioEnabled = () => getKeys().length > 0;

// WhatsApp manda las notas de voz en ogg/opus; el nombre del archivo le dice el formato a la API.
const extFor = (mimeType) => {
  const type = String(mimeType || '').toLowerCase();
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('wav')) return 'wav';
  if (type.includes('webm')) return 'webm';
  return 'ogg';
};

const callGroq = async (apiKey, model, buffer, mimeType) => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'audio/ogg' }), `nota.${extFor(mimeType)}`);
  form.append('model', model);
  form.append('language', 'es');
  form.append('response_format', 'text');
  // Orienta al modelo al vocabulario del negocio en vez de dejarlo adivinar
  form.append('prompt', 'Pedido por WhatsApp a un negocio en Colombia: platos, cantidades, dirección, barrio y forma de pago (efectivo, Nequi, Daviplata, transferencia).');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return (await res.text() || '').trim();
  } finally {
    clearTimeout(timer);
  }
};

/**
 * @param {Buffer} buffer    nota de voz descargada
 * @param {string} mimeType  ej. audio/ogg; codecs=opus
 * @returns {Promise<string|null>}  lo que dijo el cliente, o null si no se pudo transcribir
 */
const transcribeAudio = async (buffer, mimeType) => {
  if (!buffer?.length) return null;
  if (buffer.length > MAX_BYTES) {
    console.warn(`[AUDIO] Nota de voz demasiado grande (${Math.round(buffer.length / 1024)} KB): no se transcribe`);
    return null;
  }
  const keys = getKeys();
  if (keys.length === 0) {
    console.warn('[AUDIO] Sin GROQ_API_KEY: no se puede transcribir la nota de voz');
    return null;
  }

  for (const model of MODELS) {
    for (const apiKey of keys) {
      try {
        const text = await callGroq(apiKey, model, buffer, mimeType);
        if (text) {
          console.log(`[AUDIO] ✅ Nota de voz transcrita con ${model} (${text.length} caracteres)`);
          return text.slice(0, MAX_CHARS);
        }
        console.warn(`[AUDIO] ${model} devolvió una transcripción vacía`);
      } catch (e) {
        // 429 = cuota: probar la siguiente llave. 404/400 = el modelo no está: probar el siguiente.
        console.warn(`[AUDIO] Falló ${model}: ${e.message}`);
        if (e.status === 404 || e.status === 400) break;
      }
    }
  }
  return null;
};

module.exports = { transcribeAudio, isAudioEnabled };
