const Redis = require('ioredis');
const crypto = require('crypto');

let redisClient = null;
let isRedisConnected = false;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 2) return null;
        return 1000;
      },
    });

    redisClient.on('connect', () => {
      isRedisConnected = true;
      console.log('[AI Cache] ✅ Conectado a Redis para Caché de Tokens de IA');
    });

    redisClient.on('error', (err) => {
      isRedisConnected = false;
      console.warn('[AI Cache] Aviso Redis (usando memoria RAM):', err.message);
    });
  } catch (e) {
    console.warn('[AI Cache] Error instanciando Redis:', e.message);
  }
}

// Caché en memoria RAM como respaldo ultrarrápido
const memoryCache = new Map();

// Limpieza periódica de elementos expirados cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of memoryCache.entries()) {
    if (item.expiresAt < now) {
      memoryCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

const normalizeText = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
};

const getCacheKey = (businessId, text) => {
  const norm = normalizeText(text);
  const hash = crypto.createHash('md5').update(norm).digest('hex');
  return `ai_cache:${businessId || 'default'}:${hash}`;
};

/**
 * Obtener respuesta guardada en caché (Consumo: 0 Tokens)
 */
const getCachedAiResponse = async (businessId, userMessage) => {
  const norm = normalizeText(userMessage);
  if (norm.length < 3) return null;

  const key = getCacheKey(businessId, norm);

  // 1. Consultar Redis si está disponible
  if (isRedisConnected && redisClient) {
    try {
      const cached = await redisClient.get(key);
      if (cached) {
        console.log(`[AI Cache] ⚡ Hit en Redis para "${norm.slice(0, 35)}" (0 Tokens gastados)`);
        return JSON.parse(cached);
      }
    } catch (_) {}
  }

  // 2. Consultar Caché en Memoria RAM
  const inMem = memoryCache.get(key);
  if (inMem && inMem.expiresAt > Date.now()) {
    console.log(`[AI Cache] ⚡ Hit en RAM para "${norm.slice(0, 35)}" (0 Tokens gastados)`);
    return inMem.value;
  }

  return null;
};

const MAX_RAM_CACHE_ENTRIES = 1000;

/**
 * Guardar respuesta de IA en caché (TTL por defecto: 2 horas = 7200 seg)
 */
const setCachedAiResponse = async (businessId, userMessage, responseObj, ttlSeconds = 7200) => {
  const norm = normalizeText(userMessage);
  if (norm.length < 3) return;

  const key = getCacheKey(businessId, norm);

  // 1. Guardar en Redis
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(responseObj));
    } catch (_) {}
  }

  // 2. Guardar en Memoria RAM con límite estricto de elementos (previene fugas de memoria)
  if (memoryCache.size >= MAX_RAM_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }

  memoryCache.set(key, {
    value: responseObj,
    expiresAt: Date.now() + (ttlSeconds * 1000),
  });
};

/**
 * Limpiar caché de respuestas de un negocio específico
 */
const clearBusinessAiCache = async (businessId) => {
  if (!businessId) return;

  // Limpiar en RAM solo las entradas de este negocio
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`ai_cache:${businessId}:`)) {
      memoryCache.delete(key);
    }
  }

  if (isRedisConnected && redisClient) {
    try {
      const keys = await redisClient.keys(`ai_cache:${businessId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (_) {}
  }
};

module.exports = {
  getCachedAiResponse,
  setCachedAiResponse,
  clearBusinessAiCache,
  normalizeText,
};
