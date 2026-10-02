// Reparte las llamadas de chat entre todas las IAs configuradas para aguantar picos de chats.
//
// - Limita cuántas llamadas salen a la vez (el resto espera turno en vez de chocar con el límite).
// - Si un proveedor responde 429 (límite), lo deja "enfriando" el tiempo que indique retry-after
//   y pasa al siguiente, sin volver a golpearlo mientras tanto.
// - Si todos están enfriando, espera al que se libere primero (con un tope) antes de rendirse.
//
// Orden: modelos fuertes de Groq (por cada llave) → Gemini → modelos pequeños de Groq → OpenRouter.
// OJO: en Groq y en Google los límites son por CUENTA/PROYECTO, no por llave. Varias llaves de la
// misma cuenta comparten el mismo cupo; solo suman si son de cuentas distintas.

const GROQ_URL = 'https://api.groq.com/openai/v1';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

const MAX_CONCURRENT = Math.max(1, parseInt(process.env.AI_MAX_CONCURRENT, 10) || 4);
const CALL_TIMEOUT_MS = 25000;
const MAX_WAIT_FOR_COOLDOWN_MS = 20000;

const GROQ_FALLBACK_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
];
// Modelos pequeños: responden peor, se usan después de Gemini
// (sin que "27b" o "120b" cuenten como "7b" o "20b")
const isWeakGroqModel = (id) => /allam|(^|[^0-9])(7|8|20)b/i.test(id);

const cleanKey = (k) => (k || '').trim().replace(/^['"]|['"]$/g, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// GROQ_API_KEY (una sola, la usan otros módulos) + GROQ_API_KEYS (lista separada por comas) + GROQ_API_KEY_2.._5
const getGroqKeys = () => {
  const keys = [cleanKey(process.env.GROQ_API_KEY)];
  (process.env.GROQ_API_KEYS || '').split(',').forEach(k => keys.push(cleanKey(k)));
  for (let i = 2; i <= 5; i++) keys.push(cleanKey(process.env[`GROQ_API_KEY_${i}`]));
  return [...new Set(keys.filter(Boolean))];
};

// ─── Modelos de Groq disponibles (se consultan cada 15 min) ──────────────────
let groqModels = null;
let groqModelsAt = 0;

const getGroqModels = async (apiKey) => {
  if (groqModels && Date.now() - groqModelsAt < 15 * 60 * 1000) return groqModels;
  try {
    const res = await fetch(`${GROQ_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const all = ((await res.json())?.data || []).map(m => m.id).filter(Boolean);
    const valid = all.filter(id =>
      !id.includes('compound') &&
      !id.includes('whisper') &&
      !id.includes('guard') &&
      !id.includes('orpheus') &&
      !id.includes('3.6') && // qwen3.6 / deepseek emiten tags de razonamiento <think>
      !id.includes('reasoning')
    );
    if (valid.length > 0) {
      const priority = (id) => {
        if (id.includes('qwen3.8')) return 2;
        if (id.includes('gpt-oss-120b')) return 3;
        if (id.includes('llama-3.3')) return 4;
        if (id.includes('qwen')) return 5;
        if (id.includes('gpt-oss')) return 6;
        if (id.includes('allam')) return 8;
        if (id.includes('llama-3.1')) return 9;
        return 99;
      };
      valid.sort((a, b) => priority(a) - priority(b));
      groqModels = valid;
      groqModelsAt = Date.now();
      console.log('[AI Pool] Modelos de Groq detectados:', groqModels);
      return groqModels;
    }
  } catch (e) {
    console.warn('[AI Pool] No se pudo listar modelos de Groq (uso lista fija):', e.message);
  }
  return GROQ_FALLBACK_MODELS;
};

// ─── Lista ordenada de destinos (proveedor + llave + modelo) ─────────────────
const buildTargets = async () => {
  const targets = [];
  const groqKeys = getGroqKeys();
  const models = groqKeys.length ? await getGroqModels(groqKeys[0]) : [];
  const groqTargets = (list) => {
    for (const model of list) {
      groqKeys.forEach((key, i) => {
        targets.push({ provider: 'groq', baseUrl: GROQ_URL, key, model, id: `groq#${i + 1}:${model}` });
      });
    }
  };

  groqTargets(models.filter(m => !isWeakGroqModel(m)));

  const geminiKey = cleanKey(process.env.GEMINI_API_KEY);
  if (geminiKey) {
    const geminiModels = (process.env.GEMINI_CHAT_MODELS || 'gemini-flash-lite-latest')
      .split(',').map(s => s.trim()).filter(Boolean);
    for (const model of geminiModels) {
      targets.push({ provider: 'gemini', baseUrl: GEMINI_URL, key: geminiKey, model, id: `gemini:${model}` });
    }
  }

  groqTargets(models.filter(isWeakGroqModel));

  const orKey = cleanKey(process.env.OPENROUTER_API_KEY);
  if (orKey) {
    const model = (process.env.OPENROUTER_CHAT_MODEL || 'google/gemini-2.5-flash-lite').trim();
    targets.push({ provider: 'openrouter', baseUrl: OPENROUTER_URL, key: orKey, model, id: `openrouter:${model}` });
  }
  return targets;
};

// ─── Enfriamiento por destino tras un 429 / error ────────────────────────────
const cooldownUntil = new Map(); // target.id -> timestamp
const stats = { calls: 0, ok: 0, rateLimited: 0, errors: 0, allBusy: 0, byTarget: {} };

const isCooling = (t) => (cooldownUntil.get(t.id) || 0) > Date.now();
const coolDown = (t, ms, why) => {
  cooldownUntil.set(t.id, Date.now() + ms);
  console.warn(`[AI Pool] ${t.id} en pausa ${Math.round(ms / 1000)}s (${why})`);
};

// retry-after viene en segundos; Groq a veces solo lo dice en el texto ("try again in 1m12.5s")
const parseRetryMs = (res, bodyText) => {
  const header = parseFloat(res.headers.get('retry-after'));
  if (!isNaN(header) && header > 0) return header * 1000;
  const m = (bodyText || '').match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  if (m && (m[1] || m[2] || m[3])) {
    return ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (parseFloat(m[3]) || 0)) * 1000;
  }
  return 30000;
};

// ─── Semáforo: máximo MAX_CONCURRENT llamadas a la vez ───────────────────────
let active = 0;
const waiting = [];
const acquire = () => new Promise(resolve => {
  if (active < MAX_CONCURRENT) { active++; resolve(); }
  else waiting.push(resolve);
});
const release = () => {
  const next = waiting.shift();
  if (next) next(); else active--;
};

const callTarget = async (t, { messages, max_tokens, temperature }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const body = { model: t.model, messages, temperature, max_tokens };
    // Los Gemini "piensan" antes de responder y eso sale del mismo tope de tokens
    if (t.provider !== 'groq') body.max_tokens = Math.max(max_tokens, 1024);

    const res = await fetch(`${t.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${t.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
      err.status = res.status;
      err.retryMs = res.status === 429 ? parseRetryMs(res, text) : null;
      throw err;
    }
    const data = await res.json();
    return {
      content: data?.choices?.[0]?.message?.content || '',
      tokens: data?.usage?.total_tokens || 0,
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Pide una respuesta de chat a la primera IA disponible.
 * @param {object} opts
 * @param {Array}  opts.messages
 * @param {number} [opts.max_tokens=350]
 * @param {number} [opts.temperature=0.25]
 * @param {boolean} [opts.lowPriority] si no hay cupo inmediato devuelve null en vez de esperar
 *                  (para llamadas opcionales como las sub-consultas del RAG)
 * @param {(text:string)=>boolean} [opts.accept] descarta respuestas inválidas y prueba el siguiente
 * @returns {Promise<{content:string, tokens:number, model:string, provider:string}|null>}
 */
const chatComplete = async ({ messages, max_tokens = 350, temperature = 0.25, lowPriority = false, accept } = {}) => {
  if (lowPriority && active >= MAX_CONCURRENT) return null;

  const targets = await buildTargets();
  if (targets.length === 0) return null;

  await acquire();
  const deadline = Date.now() + MAX_WAIT_FOR_COOLDOWN_MS;
  const rejected = new Set(); // dieron respuesta inválida en ESTA llamada: no repetirlos
  try {
    while (true) {
      for (const t of targets) {
        if (isCooling(t) || rejected.has(t.id)) continue;
        stats.calls++;
        try {
          const out = await callTarget(t, { messages, max_tokens, temperature });
          const content = (out.content || '').trim();
          if (accept && !accept(content)) {
            console.warn(`[AI Pool] ${t.id} devolvió una respuesta inválida, pruebo el siguiente`);
            rejected.add(t.id);
            continue;
          }
          stats.ok++;
          stats.byTarget[t.id] = (stats.byTarget[t.id] || 0) + 1;
          return { content, tokens: out.tokens, model: t.model, provider: t.provider };
        } catch (e) {
          if (e.status === 429) {
            stats.rateLimited++;
            coolDown(t, e.retryMs, 'límite alcanzado');
          } else if (e.status === 401 || e.status === 403 || e.status === 402) {
            stats.errors++;
            coolDown(t, 10 * 60 * 1000, `llave rechazada o sin saldo ${e.status}`);
          } else if (e.status === 404 || e.status === 400) {
            stats.errors++;
            coolDown(t, 15 * 60 * 1000, `modelo no disponible ${e.status}`);
          } else {
            stats.errors++;
            coolDown(t, 15000, e.name === 'AbortError' ? 'tardó demasiado' : e.message);
          }
        }
      }

      // Todos en pausa: esperar al que se libere primero, si cabe en el tope
      stats.allBusy++;
      if (lowPriority) return null;
      const pending = targets.filter(t => !rejected.has(t.id));
      if (pending.length === 0) return null;
      const nextFree = Math.min(...pending.map(t => cooldownUntil.get(t.id) || 0));
      const waitMs = nextFree - Date.now();
      if (waitMs <= 0) continue;
      if (Date.now() + waitMs > deadline) {
        console.warn(`[AI Pool] Todas las IAs están en su límite (la próxima se libera en ${Math.round(waitMs / 1000)}s)`);
        return null;
      }
      await sleep(waitMs + 200);
    }
  } finally {
    release();
  }
};

const getPoolStatus = () => ({
  maxConcurrent: MAX_CONCURRENT,
  activeCalls: active,
  waitingCalls: waiting.length,
  providers: {
    groqKeys: getGroqKeys().length,
    gemini: Boolean(cleanKey(process.env.GEMINI_API_KEY)),
    openrouter: Boolean(cleanKey(process.env.OPENROUTER_API_KEY)),
  },
  cooling: [...cooldownUntil.entries()]
    .filter(([, until]) => until > Date.now())
    .map(([id, until]) => ({ id, seconds: Math.round((until - Date.now()) / 1000) })),
  stats,
});

module.exports = { chatComplete, getPoolStatus };
