const Redis = require('ioredis');

// Intentar conectar a Redis si la variable REDIS_URL existe en el entorno
let redisClient = null;
let isRedisConnected = false;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.warn('[Redis Queue] Máximo de reintentos alcanzado, usando Cola en Memoria como fallback.');
          return null;
        }
        return Math.min(times * 500, 2000);
      },
    });

    redisClient.on('connect', () => {
      isRedisConnected = true;
      console.log('[Redis Queue] ✅ Conectado a Redis de Alto Flujo correctamente');
    });

    redisClient.on('error', (err) => {
      isRedisConnected = false;
      console.warn('[Redis Queue] Aviso Redis (usando fallback en memoria):', err.message);
    });
  } catch (e) {
    console.warn('[Redis Queue] Error inicializando cliente Redis:', e.message);
  }
}

// ─── Cola de Procesamiento Asíncrona (Resiliencia Anti-Colapso) ───────────────
// Mantiene listas de mensajes por teléfono para garantizar orden secuencial
const memoryQueue = new Map(); // contactPhone -> Array of message tasks
const activeProcessing = new Set(); // contactPhone

/**
 * Encola un mensaje entrante para procesamiento seguro anti-colapso
 * @param {string} contactPhone - Teléfono del cliente
 * @param {Function} taskFn - Función asíncrona a ejecutar (IA, RAG, Envío)
 */
const enqueueIncomingMessage = async (contactPhone, taskFn) => {
  if (!contactPhone) {
    return taskFn();
  }

  // 1. Si Redis está conectado, registrar en Redis
  if (isRedisConnected && redisClient) {
    try {
      const queueKey = `queue:messages:${contactPhone}`;
      await redisClient.lpush(queueKey, JSON.stringify({ timestamp: Date.now() }));
      await redisClient.expire(queueKey, 300); // 5 minutos de expiración
    } catch (_) {}
  }

  // 2. Encolar tarea en memoria para asegurar procesamiento en orden
  if (!memoryQueue.has(contactPhone)) {
    memoryQueue.set(contactPhone, []);
  }

  const queue = memoryQueue.get(contactPhone);

  return new Promise((resolve, reject) => {
    queue.push({ taskFn, resolve, reject });
    processNextMessage(contactPhone);
  });
};

const processNextMessage = async (contactPhone) => {
  if (activeProcessing.has(contactPhone)) return;

  const queue = memoryQueue.get(contactPhone);
  if (!queue || queue.length === 0) {
    memoryQueue.delete(contactPhone);
    activeProcessing.delete(contactPhone);
    return;
  }

  activeProcessing.add(contactPhone);
  const { taskFn, resolve, reject } = queue.shift();

  try {
    const result = await taskFn();
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    activeProcessing.delete(contactPhone);
    // Procesar el siguiente mensaje en la cola de este contacto
    setTimeout(() => processNextMessage(contactPhone), 100);
  }
};

const getQueueStatus = () => {
  let pendingCount = 0;
  for (const q of memoryQueue.values()) {
    pendingCount += q.length;
  }
  return {
    isRedisActive: isRedisConnected,
    contactsInQueue: memoryQueue.size,
    pendingMessagesCount: pendingCount,
    activeWorkersCount: activeProcessing.size,
  };
};

module.exports = {
  enqueueIncomingMessage,
  getQueueStatus,
};
