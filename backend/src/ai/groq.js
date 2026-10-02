const Groq = require('groq-sdk');

// Sin 'groq/compound*': esos modelos buscan en internet por su cuenta y traen datos
// que el dueño nunca configuró. El bot solo puede responder con la información del negocio.
const CANDIDATE_MODELS = [
  'qwen/qwen3.8-27b',
  'allam-2-7b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
];

let cachedActiveModels = null;
let lastFetchTime = 0;

const cleanApiKey = (key) => {
  if (!key) return '';
  return key.trim().replace(/^['"]|['"]$/g, '');
};

const getGroqClient = () => {
  const rawKey = process.env.GROQ_API_KEY;
  const apiKey = cleanApiKey(rawKey);
  if (!apiKey) return null;
  try {
    return new Groq({ apiKey });
  } catch (e) {
    console.error('[Groq] Error instanciando SDK:', e.message);
    return null;
  }
};

const getActiveModels = async (client) => {
  const now = Date.now();
  if (cachedActiveModels && (now - lastFetchTime < 15 * 60 * 1000)) {
    return cachedActiveModels;
  }

  if (!client) return CANDIDATE_MODELS;

  try {
    const list = await client.models.list();
    const all = (list?.data || []).map(m => m.id).filter(Boolean);
    const validChatModels = all.filter(id =>
      !id.includes('compound') &&
      !id.includes('whisper') &&
      !id.includes('guard') &&
      !id.includes('orpheus') &&
      !id.includes('3.6') && // Excluir qwen3.6 / deepseek que emiten tags de razonamiento <think>
      !id.includes('reasoning')
    );

    if (validChatModels.length > 0) {
      validChatModels.sort((a, b) => {
        const getPriority = (id) => {
          if (id.includes('qwen3.8')) return 2;
          if (id.includes('allam')) return 3;
          if (id.includes('qwen') && !id.includes('3.6')) return 4;
          if (id.includes('gpt-oss')) return 5;
          if (id.includes('llama-3.3')) return 6;
          if (id.includes('llama-3.1')) return 7;
          return 99;
        };
        return getPriority(a) - getPriority(b);
      });

      cachedActiveModels = validChatModels;
      lastFetchTime = now;
      console.log('[Groq] Modelos de chat detectados:', cachedActiveModels);
      return cachedActiveModels;
    }
  } catch (e) {
    console.warn('[Groq] Error detectando modelos (usando fallback estático):', e.message);
  }

  return CANDIDATE_MODELS;
};

// ─── 0. Normalización de Texto para Búsqueda RAG ─────────────────────────────
const normalizeSearchText = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Distancia de Levenshtein para tolerancia a faltas ortográficas y typos
const levenshteinDistance = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

// Coincidencia difusa (Fuzzy Match) para palabras con errores tipográficos
const isFuzzyWordMatch = (wordA, wordB) => {
  if (wordA === wordB) return true;
  if (wordA.length >= 4 && wordB.length >= 4) {
    if (wordA.includes(wordB) || wordB.includes(wordA)) return true;
    const maxDist = wordA.length > 6 ? 2 : 1;
    return levenshteinDistance(wordA, wordB) <= maxDist;
  }
  return false;
};

// Lista de palabras vacías (stopwords) en español para no contaminar búsquedas RAG
const SPANISH_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'a', 'al', 'en', 'con', 'por', 'para', 'y', 'o', 'u',
  'que', 'como', 'si', 'no', 'es', 'son', 'se', 'su', 'sus',
  'mi', 'mis', 'tu', 'tus', 'me', 'te', 'le', 'les', 'lo', 'nos',
  'tiene', 'tienen', 'hay', 'este', 'esta', 'estos', 'estas',
  'mas', 'pero', 'bien', 'bueno', 'sobre', 'todo', 'todos', 'toda', 'todas',
  'dime', 'cuentame', 'favor'
]);

// ─── 1. RAG: Buscar chunks relevantes de la knowledge base ───────────────────
const searchKnowledge = (query, knowledge) => {
  if (!knowledge?.length) return [];

  const normQuery = normalizeSearchText(query);
  const queryTokens = normQuery.split(/\s+/).filter(w => w.length >= 2);
  const meaningfulWords = queryTokens.filter(w => !SPANISH_STOPWORDS.has(w));
  const queryWords = meaningfulWords.length > 0 ? meaningfulWords : queryTokens;
  if (queryWords.length === 0) return [];

  const scored = knowledge.map(item => {
    const normTitle = normalizeSearchText(item.title || '');
    const normContent = normalizeSearchText(item.content || '');

    let score = 0;
    // Coincidencia exacta o casi exacta de frase
    if (normTitle.includes(normQuery)) score += 10;
    if (normContent.includes(normQuery)) score += 5;

    const titleWords = normTitle.split(/\s+/);
    const contentWords = normContent.split(/\s+/);

    // Coincidencia por palabras individuales significativas y similitud difusa (typos)
    for (const word of queryWords) {
      if (normTitle.includes(word)) {
        score += item.type === 'faq' ? 5 : 4;
      } else if (titleWords.some(tw => isFuzzyWordMatch(word, tw))) {
        score += item.type === 'faq' ? 3.5 : 2.5;
      }

      if (normContent.includes(word)) {
        score += 1.5;
      } else if (contentWords.some(cw => isFuzzyWordMatch(word, cw))) {
        score += 1.0;
      }
    }

    // Boost prioritario si es FAQ oficial
    if (item.type === 'faq' && score > 0) score += 1.5;

    return { ...item, score };
  });

  return scored
    .filter(i => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
};

// ─── 2. Generar sub-consultas contextuales con IA ────────────────────────────
const generateSubQueries = async (userMessage, business = null, chatHistory = []) => {
  const client = getGroqClient();
  if (!client) return [userMessage];

  const busName = business?.name || 'Negocio';
  const busCategory = business?.category || 'Atención y Servicios';
  const busGoal = business?.main_goal || 'vender';

  const lastAssistantMsg = Array.isArray(chatHistory)
    ? chatHistory.filter(m => m.direction === 'outbound').slice(-1)[0]?.content || ''
    : '';

  try {
    const models = await getActiveModels(client);
    const modelToUse = models[0] || CANDIDATE_MODELS[0];

    const response = await client.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: `Eres un motor de búsqueda RAG para la base de conocimiento y catálogo del negocio "${busName}" (Giro: ${busCategory}, Objetivo: ${busGoal}).
Dado el mensaje de un cliente de WhatsApp y el contexto previo de la conversación, genera de 2 a 3 consultas o términos clave alternativos (ej: nombre exacto del plan o producto al que hace referencia, sinónimos, dudas sobre límites o funciones) para buscar en la base de datos.
Responde ÚNICAMENTE con las consultas separadas por "|", sin texto adicional ni números.`
        },
        ...(lastAssistantMsg ? [{ role: 'assistant', content: lastAssistantMsg.slice(0, 300) }] : []),
        { role: 'user', content: userMessage }
      ],
      max_tokens: 100,
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content || '';
    const queries = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .split('|')
      .map(q => q.trim())
      .filter(q => q.length > 0);
    return queries.length > 0 ? queries : [userMessage];
  } catch (e) {
    return [userMessage];
  }
};

// ─── 3. RAG Multi-Query ───────────────────────────────────────────────────────
// `precomputedSubQueries` evita pedirle a Groq las mismas sub-consultas dos veces por mensaje
const ragSearch = async (userMessage, knowledge, business = null, chatHistory = [], precomputedSubQueries = null) => {
  if (!knowledge?.length) return [];

  const subQueries = precomputedSubQueries || await generateSubQueries(userMessage, business, chatHistory);
  const allQueries = [userMessage, ...subQueries];

  const seenIds = new Set();
  const allResults = [];

  for (const query of allQueries) {
    const results = searchKnowledge(query, knowledge);
    for (const item of results) {
      const key = item.id || item.title;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        allResults.push(item);
      }
    }
  }

  return allResults
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 8);
};

// ─── 4. Formatear contexto RAG ────────────────────────────────────────────────
const isSimpleGreeting = (text) => {
  if (!text || typeof text !== 'string') return false;
  const norm = normalizeSearchText(text);
  const greetings = ['hola', 'buenas', 'bueno dia', 'buenos dias', 'buenas tarde', 'buenas tardes', 'buenas noche', 'buenas noches', 'hola buenas', 'hola que mas', 'que mas'];
  return greetings.includes(norm) || norm.length <= 4;
};

const rankAndFilterProducts = (query, products, subQueries = []) => {
  if (!Array.isArray(products) || products.length <= 10) return products || [];
  if (!query || typeof query !== 'string') return products.slice(0, 10);

  const allSearchTerms = [query, ...(Array.isArray(subQueries) ? subQueries : [])];
  const allWords = new Set();

  for (const term of allSearchTerms) {
    const norm = normalizeSearchText(term);
    const tokens = norm.split(/\s+/).filter(w => w.length >= 2);
    const meaningful = tokens.filter(w => !SPANISH_STOPWORDS.has(w));
    (meaningful.length > 0 ? meaningful : tokens).forEach(w => allWords.add(w));
  }

  if (allWords.size === 0) return products.slice(0, 10);

  const scored = products.map(item => {
    const normName = normalizeSearchText(item.name || '');
    const normCat = normalizeSearchText(item.category || '');
    const normDesc = normalizeSearchText(item.description || '');

    const nameWords = normName.split(/\s+/);
    const catWords = normCat.split(/\s+/);
    const descWords = normDesc.split(/\s+/);

    let score = 0;
    for (const word of allWords) {
      if (normName.includes(word)) {
        score += 4;
      } else if (nameWords.some(nw => isFuzzyWordMatch(word, nw))) {
        score += 3.2;
      }

      if (normCat.includes(word)) {
        score += 2.5;
      } else if (catWords.some(cw => isFuzzyWordMatch(word, cw))) {
        score += 2.0;
      }

      if (normDesc.includes(word)) {
        score += 1;
      } else if (descWords.some(dw => isFuzzyWordMatch(word, dw))) {
        score += 0.8;
      }
    }
    return { ...item, score };
  });

  const matched = scored.filter(i => i.score > 0).sort((a, b) => b.score - a.score);
  if (matched.length > 0) return matched.slice(0, 8);
  return products.slice(0, 10);
};

// Topes del contexto: un documento largo (p. ej. un PDF subido antes de partirse en
// bloques) no puede desbordar el límite de tokens del modelo y dejar al bot sin IA.
const MAX_ITEM_CHARS = 2000;
const MAX_KNOWLEDGE_CONTEXT_CHARS = 9000;

const buildKnowledgeContext = (knowledge) => {
  if (!knowledge?.length) return null;

  const blocks = [];
  let used = 0;
  knowledge.forEach((k, i) => {
    const content = (k.content || '').length > MAX_ITEM_CHARS ? `${k.content.slice(0, MAX_ITEM_CHARS)}…` : (k.content || '');
    let block;
    if (k.type === 'faq') block = `[PREGUNTA FRECUENTE (FAQ) OFICIAL ${i+1}]\nPregunta: ${k.title}\nRespuesta Autorizada: ${content}`;
    else if (k.type === 'image') block = `[PRODUCTO CON IMAGEN/FOTO ${i+1}: ${k.title}]\nDescripción: ${content}${k.file_url ? `\nURL Foto: ${k.file_url}` : ''}`;
    else if (k.type === 'file') block = `[GUÍA / DOCUMENTO ${i+1}: ${k.title}]\nContenido: ${content}`;
    else block = `[INFORMACIÓN OFICIAL ${i+1}: ${k.title}]\n${content}`;

    if (used + block.length > MAX_KNOWLEDGE_CONTEXT_CHARS && blocks.length > 0) return;
    blocks.push(block);
    used += block.length;
  });
  return blocks.join('\n\n---\n\n');
};

// ─── 5. System prompt con info del negocio ────────────────────────────────────
const FULL_KNOWLEDGE_MAX_CHARS = 8000;

const buildSystemPrompt = (business, relevantKnowledge, allKnowledge, products = [], isFirstMessage = true, userMessage = '', subQueries = [], hasAlreadyGreeted = false) => {
  const busName = business?.name || 'BotWA';
  const busCategory = business?.category || 'Atención Comercial y Servicios';
  // Datos opcionales: si el dueño no los configuró NO se rellenan con valores supuestos
  const busCity = business?.city || '';
  const hoursStart = business?.active_hours_start?.toString().slice(0, 5) || '';
  const hoursEnd = business?.active_hours_end?.toString().slice(0, 5) || '';
  const hoursText = hoursStart && hoursEnd ? `${hoursStart} - ${hoursEnd}` : '';
  const busGoal = business?.main_goal || 'vender';
  const isSales = busGoal !== 'agendar_citas';
  const personality = business?.bot_personality || 'persuasivo, cercano, profesional y entusiasta';
  const tz = business?.timezone || 'America/Bogota';

  // Fecha y hora real actual del negocio para agendamiento inteligente
  const now = new Date();
  const currentDateStr = now.toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz
  });
  const currentTimeStr = now.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz
  });
  const isoDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now); // YYYY-MM-DD

  const distinctCategories = Array.from(new Set(
    (products || []).map(p => p.category?.trim()).filter(Boolean)
  ));
  const categoriesOverview = distinctCategories.length > 0
    ? `=== COLECCIONES Y CATEGORÍAS REGISTRADAS EN EL CATÁLOGO ===\n${distinctCategories.map(c => `• ${c}`).join('\n')}\n=== FIN DE COLECCIONES ===`
    : '';

  // Si la base de conocimiento es pequeña va completa: el buscador por palabras falla con
  // preguntas redactadas distinto y, sin contexto, el modelo termina rellenando con inventos.
  const allKnowledgeChars = (allKnowledge || []).reduce((n, k) => n + (k.title?.length || 0) + (k.content?.length || 0), 0);
  const knowledgeForPrompt = allKnowledge?.length && allKnowledgeChars <= FULL_KNOWLEDGE_MAX_CHARS
    ? allKnowledge
    : relevantKnowledge;
  const relevantContext = buildKnowledgeContext(knowledgeForPrompt);
  const hasKnowledge = !!relevantContext;

  const filteredProducts = rankAndFilterProducts(userMessage, products, subQueries);
  const hasProducts = Array.isArray(filteredProducts) && filteredProducts.length > 0;
  const productsContext = hasProducts
    ? filteredProducts.map(p => `- [${p.category || 'General'}] ${p.name}: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}${p.image_url ? ` | Foto/Imagen: ${p.image_url}` : ''}`).join('\n')
    : null;

  const mainGoalText = isSales
    ? `BRINDAR ASESORÍA, ATENCIÓN Y ACOMPAÑAMIENTO en los productos y servicios de "${busName}". Responde dudas con calidez y cercanía, presenta las opciones del catálogo oficial y acompaña al cliente en su decisión de compra o pedido.`
    : `BRINDAR ATENCIÓN Y COORDINAR CITAS O RESERVAS para "${busName}". Atiende todas las dudas con cortesía, consulta el calendario y horarios disponibles y facilita el agendamiento del cliente.`;

  const isGreetingOnly = isFirstMessage && !hasAlreadyGreeted && isSimpleGreeting(userMessage);

  const greetingInstruction = (hasAlreadyGreeted || !isFirstMessage)
    ? `CONVERSACIÓN EN CURSO (ESTRICTAMENTE PROHIBIDO SALUDAR): Ya estás en conversación activa con este cliente y el bot ya se presentó. ESTÁ 100% PROHIBIDO decir "¡Hola!", "Te damos la bienvenida a...", "Bienvenido a...", o volver a presentarte. Responde DIRECTAMENTE a lo que dijo el cliente sin ningún saludo ni introducción.`
    : isGreetingOnly
    ? `PRIMERA INTERACCIÓN (SOLO SALUDO): El cliente recién inicia la conversación diciendo hola. Responde amablemente con su saludo en máximo 2 a 3 líneas: "${business?.greeting_msg || '¡Hola! 👋 Te damos la bienvenida a ' + busName + '. ¿En qué te podemos ayudar hoy?'}" sin mostrar catálogo completo aún.`
    : `PRIMERA INTERACCIÓN (CON PREGUNTA DIRECTA): Di únicamente "¡Hola! 👋" y responde de inmediato a su consulta en menos de 4 líneas totales. NO pegues un discurso largo de bienvenida.`;

  const businessInfo = `
Nombre del Negocio: ${busName}
Categoría / Giro: ${busCategory}
${busCity ? `Ubicación / Ciudad: ${busCity}` : ''}
${business?.description ? `Descripción / Servicios: ${business.description}` : ''}
${hoursText ? `Horario de Atención: ${hoursText}` : ''}
${business?.isOutsideHours ? `Estado de Atención: El local físico está fuera de su horario regular, pero tú atiendes amablemente 24/7 en WhatsApp, resuelves dudas sobre el catálogo y puedes agendar citas o tomar pedidos para el horario laboral.` : ''}
${business?.phone ? `Teléfono de Contacto: ${business.phone}` : ''}
${business?.address ? `Dirección Física: ${business.address}` : ''}
${business?.payment_or_booking_link ? `Enlace o Método de Pago / Agenda: ${business.payment_or_booking_link}` : ''}
`.replace(/\n{2,}/g, '\n').trim();

  const isBotwa = busName === 'BotWA' || business?.id === '8fd9a59d-77d7-4db7-8637-9aaebca1158e';

  const orderRules = isBotwa
    ? `- Nunca pidas nombre, dirección ni cuentas bancarias. Para cerrar, envía siempre el link de la prueba de 7 días gratis: https://bot-whatsaap.vercel.app/pricing
- Si el cliente elige un plan: "¡Excelente elección! Activa tus 7 días gratis ($0 hoy) aquí: https://bot-whatsaap.vercel.app/pricing [LEAD_CALIENTE]"`
    : `- Cuando el cliente decida comprar: confirma producto y precio en $ COP y pide ${business?.closing_instructions
        ? 'SOLO los datos que piden las INSTRUCCIONES DE CIERRE DEL DUEÑO (no pidas dirección, ciudad ni cantidad si ellas no lo piden)'
        : 'nombre completo, ciudad y dirección (o correo si es digital) y cantidad'}. Pídelos en un solo mensaje corto.
- Medios de pago: ${business?.payment_or_booking_link
        ? `indica este: ${business.payment_or_booking_link}`
        : 'solo los que aparezcan en las instrucciones del dueño o la base de conocimiento; si no hay ninguno, no inventes: di que un asesor le confirma cómo pagar'}.
- Cuando entregue sus datos, confírmale el pedido con entusiasmo y añade al final (una sola vez: no repitas las etiquetas en mensajes siguientes del mismo pedido):
[LEAD_CALIENTE]
[NUEVO_PEDIDO: {"nombre": "...", "telefono": "...", "producto": "...", "cantidad": 1, "total": 0, "direccion": "...", "ciudad": "...", "metodo_pago": "...", "notas": "..."}]
("total" = precio del catálogo × cantidad, solo números. Usa solo datos que el cliente dio; deja "" lo que no dio: nunca valores de ejemplo ni supuestos. En "notas" pon lo relevante: contado/financiado, color, versión, etc.)`;

  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  let activeDays = business?.active_days;
  if (typeof activeDays === 'string') {
    try { activeDays = JSON.parse(activeDays); } catch (_) { activeDays = null; }
  }
  const daysText = Array.isArray(activeDays) && activeDays.length > 0 && activeDays.length < 7
    ? activeDays.slice().sort((a, b) => a - b).map(d => dayNames[d]).filter(Boolean).join(', ')
    : '';
  const closedDaysText = daysText
    ? dayNames.filter((_, i) => !activeDays.includes(i)).join(', ')
    : '';
  const duration = parseInt(business?.appointment_duration, 10);

  return `Eres el asesor de atención por WhatsApp de "${busName}" (${busCategory}).
Misión: ${mainGoalText}
Tono: ${personality}. Cercano, servicial y humano. Nunca digas que te dedicas a vender ni que eres un vendedor; habla desde la asesoría.

## FUENTE ÚNICA DE VERDAD (regla por encima de todas)
Solo sabes lo que aparece en: DATOS DEL NEGOCIO, CATÁLOGO, BASE DE CONOCIMIENTO e INSTRUCCIONES DEL DUEÑO.
- No inventes ni deduzcas precios, productos, marcas, modelos, características, stock, promociones, envíos, tiempos, garantías, horarios, dirección, medios de pago ni políticas.
- Nada de adornos no registrados ("opciones económicas y premium", "tenemos para todos los gustos").
- Si falta el dato: "Eso te lo confirmo con un asesor del equipo en un momento 🙏" y retoma con algo que sí esté registrado.
- Los ejemplos de este prompt son solo de estilo, nunca información del negocio.
- Si preguntan algo ajeno al negocio (tareas, política, recetas, bromas), responde con humor en 1 línea y vuelve al negocio, sin volver a saludar.

## FECHA ACTUAL (${tz})
Hoy es ${currentDateStr} (${isoDateStr}), hora ${currentTimeStr}. Úsala para calcular "mañana", "el jueves", etc.
${business?.custom_instructions ? `
## INSTRUCCIONES DEL DUEÑO (máxima prioridad, cúmplelas al pie de la letra)
${business.custom_instructions}
` : ''}
## ESTILO DE RESPUESTA
- Máximo 4 líneas cortas, 1 o 2 emojis, que se lea sin hacer scroll en el celular.
- Estructura: valida lo que dijo el cliente → solución, precio o dato clave → UNA sola pregunta al final.
- Nunca hagas dos preguntas en el mismo mensaje. Prefiere preguntas fáciles de opción ("¿mañana o tarde?", "¿domicilio o recoges?").
- No sueltes el catálogo completo ni precios de golpe si el cliente aún no dice qué busca.
${hasProducts
  ? '- Con catálogo: presenta 2 o 3 opciones relevantes con precio y beneficio; si alguna dice "⭐ Más Recomendado/Popular", recomiéndala.'
  : '- No hay productos cargados: no inventes modelos ni precios. Usa las FAQs si responden la duda; si no, pregunta qué necesita y ofrece confirmarlo con un asesor.'}
- Si el cliente responde corto ("el segundo", "el pro", "qué incluye"), deduce del historial a qué opción se refiere.

## ESTADO DE LA CONVERSACIÓN
${greetingInstruction}

## DATOS DEL NEGOCIO
${businessInfo}

${categoriesOverview ? `${categoriesOverview}\n\n` : ''}${hasProducts
  ? `## CATÁLOGO OFICIAL\n${productsContext}`
  : `## CATÁLOGO\nNo hay productos individuales registrados. El negocio atiende en ${busCategory}.${business?.description ? ` ${business.description}` : ''}`}
${hasKnowledge ? `
## BASE DE CONOCIMIENTO (respuestas autorizadas: úsalas fielmente, con tus palabras, sin contradecirlas)
${relevantContext}
` : ''}${business?.closing_instructions ? `
## INSTRUCCIONES DE CIERRE DEL DUEÑO (qué datos pedir y qué medios de pago indicar)
${business.closing_instructions}
` : ''}
## PEDIDOS
${orderRules}

## CITAS (${isSales ? 'visitas al punto de venta, demostraciones, servicio técnico o asesorías' : 'objetivo principal del negocio'})
- Horario: ${hoursText || 'NO configurado: no propongas horas; pregunta su preferencia y aclara que un asesor la confirma'}.
${daysText ? `- Días de atención: ${daysText}. Cerrado: ${closedDaysText}. Nunca agendes en un día cerrado: ofrece el día hábil más cercano.\n` : ''}${duration > 0 ? `- Cada cita dura ${duration} minutos: la última debe terminar antes del cierre.\n` : ''}- Nunca agendes en una fecha u hora que ya pasó.
${isSales ? '- Si el cliente quiere ver, probar o revisar algo en persona, ofrécele agendar la visita.\n' : ''}- Acuerda día y hora dentro del horario y pide su nombre si no lo tienes. Al confirmar, repite día y hora, felicítalo y añade al final (una sola vez por cita):
[LEAD_CALIENTE]
[NUEVA_CITA: {"nombre": "...", "servicio": "...", "fecha": "YYYY-MM-DD", "hora": "HH:MM:00"}]
- Si pide cancelar su cita, confírmalo con calidez en menos de 3 líneas y añade al final:
[CANCELAR_CITA: {"nombre": "...", "fecha": "YYYY-MM-DD", "servicio": "..."}]

## FOTOS
Si pide foto de un producto del catálogo que tenga imagen, añade al final: [ENVIAR_IMAGEN: Nombre del Producto]`;
};

// ─── Respuesta Asistente Humana (Fallback Contextual de Alto Nivel) ───────────
const buildHumanAssistantReply = (userMessage, business, products = [], chatHistory = [], knowledge = []) => {
  const busName = business?.name || 'BotWA';
  // "Otro"/"General" son opciones del formulario, no un giro: dicho al cliente suena roto
  const busCategory = business?.category && !/^(otro|otros|general)$/i.test(business.category.trim())
    ? business.category
    : 'nuestros productos y servicios';
  const isSales = business?.main_goal !== 'agendar_citas';
  const validHistory = Array.isArray(chatHistory) ? chatHistory.filter(m => m && m.content) : [];
  const hasHistory = validHistory.length > 0;
  const norm = normalizeSearchText(userMessage);

  // 0. Respaldo RAG Oficial: Si hay una FAQ autorizada que responda la duda del cliente
  if (Array.isArray(knowledge) && knowledge.length > 0) {
    const matchedFaqs = searchKnowledge(userMessage, knowledge);
    if (matchedFaqs.length > 0 && matchedFaqs[0].score >= 7.5 && matchedFaqs[0].content) {
      return matchedFaqs[0].content;
    }
  }

  // 1. Saludo simple inicial sin historial
  if (!hasHistory && isSimpleGreeting(userMessage)) {
    return business?.greeting_msg || `¡Hola! 👋 Te damos la bienvenida a ${busName}. ¿En qué te podemos asesorar hoy?`;
  }

  // 1.1 Consultas fuera de tema (recetas, pizza, bromas, tareas)
  if (norm.includes('pizza') || norm.includes('receta') || norm.includes('cocina') || norm.includes('chiste') || norm.includes('tarea')) {
    if (busName === 'BotWA') {
      return `😄 ¡Esa te la debo! En ${busName} te ayudamos a automatizar la atención y citas en WhatsApp. ¿Te gustaría conocer cómo funciona para tu empresa? 😊`;
    }
    return `😄 ¡Esa te la debo! Aquí en ${busName} te asesoro con gusto en todo lo relacionado a ${busCategory}. ¿En qué te podemos colaborar hoy? 😊`;
  }

  const hasProds = Array.isArray(products) && products.length > 0;
  const isBotWASaaS = (busName === 'BotWA' && business?.id === '8fd9a59d-77d7-4db7-8637-9aaebca1158e');

  if (isBotWASaaS) {
    const pricingLink = 'https://bot-whatsaap.vercel.app/pricing';
    // Consultas específicas del SaaS BotWA
    if (norm.includes('acaban') || norm.includes('limite') || norm.includes('tope') || norm.includes('mas mensajes')) {
      return `En ${busName} nunca dejas de atender. Si llegas al límite, pasas al plan superior pagando solo la diferencia desde tu panel. Además, tienes 7 días gratis ($0 hoy). Pruébalo aquí: ${pricingLink} 😊`;
    }
    if (norm.includes('pro') || norm.includes('medio') || norm.includes('segundo') || norm.includes('foto')) {
      return `El *Plan Máquina de Ventas Pro ($249.000 COP/mes)* incluye hasta 5.000 msgs/mes, envío de fotos de catálogo y agendador de citas/pedidos. ¡Empieza tus 7 días gratis ($0 hoy) aquí: ${pricingLink}?plan=pro 🚀`;
    }
    if (norm.includes('basico') || norm.includes('starter') || norm.includes('primero') || norm.includes('economico') || norm.includes('automatico')) {
      return `El *Plan Vendedor Automático ($120.000 COP/mes)* incluye hasta 1.500 msgs/mes, catálogo 24/7 y respuestas en <2s. Activa tus 7 días gratis ($0 hoy) aquí: ${pricingLink}?plan=starter 😊`;
    }
    if (norm.includes('vip') || norm.includes('agencia') || norm.includes('grande') || norm.includes('empresa')) {
      return `El *Plan Dominio Agencia / VIP ($490.000 COP/mes)* incluye hasta 20.000 msgs/mes, multi-línea y marca blanca. Activa tus 7 días gratis ($0 hoy) aquí: ${pricingLink}?plan=business 👑`;
    }
    if (norm.includes('plan') || norm.includes('precio') || norm.includes('costo') || norm.includes('oferta') || norm.includes('tarifa') || norm.includes('cuanto') || norm.includes('opcion')) {
      return `Tenemos 3 planes con 7 Días Gratis ($0 hoy):\n• *Vendedor Automático ($120k/mes):* 1.500 msgs/mes (hasta 50 chats/día).\n• *Máquina de Ventas Pro ($249k/mes - ⭐ Recomendado):* 5.000 msgs/mes con fotos y citas.\n• *Dominio VIP ($490k/mes):* 20.000 msgs/mes multi-línea.\n\nPuedes probar cualquiera 7 días gratis aquí: ${pricingLink} 😊`;
    }
    if (norm.includes('prueba') || norm.includes('interesa') || norm.includes('activar') || norm.includes('empezar') || norm.includes('comprar') || norm.includes('contratar') || norm.includes('link') || norm.includes('pagina') || norm.includes('registro')) {
      return `¡Excelente decisión! 🚀 Activa tus 7 Días de Prueba Gratis ($0 COP hoy) en solo 5 minutos ingresando aquí: ${pricingLink}\n\nConectas tu WhatsApp escaneando el código QR y comienzas a vender 24/7. ¡Te esperamos dentro! ✨ [LEAD_CALIENTE]`;
    }
  }

  // Para negocios con Catálogo de Productos / Servicios
  if (Array.isArray(products) && products.length > 0) {
    const matched = products.filter(p => norm.includes(p.name.toLowerCase()));
    if (matched.length > 0) {
      const top = matched.slice(0, 3).map(p => `• *${p.name}*: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}`).join('\n');
      return `¡Con gusto! Contamos con las siguientes opciones disponibles en ${busName}:\n\n${top}\n\n¿Te gustaría apartar tu pedido o que coordinemos los detalles? 😊`;
    }

    // Consulta general de planes, catálogo, precios, menú o servicios del negocio
    if (norm.includes('plan') || norm.includes('precio') || norm.includes('opcion') || norm.includes('menu') || norm.includes('carta') || norm.includes('catalogo') || norm.includes('cuanto') || norm.includes('costo') || norm.includes('oferta') || norm.includes('servicio')) {
      const top = products.slice(0, 3).map(p => `• *${p.name}*: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}`).join('\n');
      if (!isSales) {
        return `Contamos con las siguientes opciones en ${busName}:\n\n${top}\n\n¿Para qué día y hora te gustaría agendar tu cita? 📅`;
      }
      return `Contamos con las siguientes opciones en ${busName}:\n\n${top}\n\n¿Cuál de estas opciones te gustaría apartar el día de hoy? 😊`;
    }

    return `¡Hola! 👋 Con gusto te asesoro. En ${busName} nos especializamos en ${busCategory}. Cuéntame, ¿qué producto o servicio específico estás buscando el día de hoy? 😊`;
  }

  if (!isSales) {
    return `¡Hola! En ${busName} te asesoramos con gusto en ${busCategory}. ¿Para qué día y hora te gustaría agendar tu cita? 📅`;
  }

  return `¡Hola! En ${busName} estamos para asesorarte en ${busCategory}. ¿Qué necesidad puntual te gustaría consultar hoy? 😊`;
};

// ─── 6. Función principal RAG + Groq ─────────────────────────────────────────
const { getCachedAiResponse, setCachedAiResponse, normalizeText } = require('./aiCache');

const askGroq = async (userMessage, business, knowledge, chatHistory = [], products = []) => {
  const safeBusiness = business || {
    name: 'Asistente Virtual',
    category: 'General',
    city: 'Colombia',
    bot_personality: 'amigable, profesional, atento y experto',
  };

  const normQuery = normalizeText(userMessage);

  // ── 0. Coincidencia Directa de FAQ (0 Tokens Gastados) ───────────────────
  if (Array.isArray(knowledge) && knowledge.length > 0) {
    const normSearch = normalizeSearchText(userMessage);
    const directFaq = knowledge.find(k =>
      k.type === 'faq' &&
      k.title &&
      (normalizeText(k.title) === normQuery || normalizeSearchText(k.title) === normSearch)
    );
    if (directFaq && directFaq.content) {
      console.log(`[RAG FAQ] ⚡ Coincidencia directa de FAQ: "${directFaq.title}" (0 tokens gastados)`);
      return {
        reply: directFaq.content,
        isLeadHot: false,
        tokensUsed: 0,
        imageName: null,
        newAppointmentData: null,
        cancelAppointmentData: null,
        newOrderData: null,
        clientData: null,
        ragChunksUsed: 1,
      };
    }
  }

  // ── 1. Caché Redis / RAM (0 Tokens Gastados) ────────────────────────────
  const validHistory = Array.isArray(chatHistory) ? chatHistory.filter(m => m && m.content) : [];
  const isFirstOrIsolated = validHistory.length <= 2;

  if (isFirstOrIsolated) {
    try {
      const cached = await getCachedAiResponse(safeBusiness?.id, userMessage);
      if (cached) {
        return { ...cached, tokensUsed: 0 };
      }
    } catch (_) {}
  }

  try {
    let formattedHistory = validHistory;
    if (formattedHistory.length > 0) {
      const lastMsg = formattedHistory[formattedHistory.length - 1];
      if (lastMsg.direction === 'inbound' && lastMsg.content.trim().toLowerCase() === userMessage.trim().toLowerCase()) {
        formattedHistory = formattedHistory.slice(0, -1);
      }
    }

    const isFirstMessage = formattedHistory.length === 0;

    // Detectar si el bot ya saludó al usuario en mensajes previos salientes
    const hasAlreadyGreeted = formattedHistory.some(m =>
      m.direction === 'outbound' &&
      (m.content.toLowerCase().includes('hola') || m.content.toLowerCase().includes('bienvenid'))
    );

    const subQueries = await generateSubQueries(userMessage, safeBusiness, formattedHistory);
    const relevantKnowledge = await ragSearch(userMessage, knowledge, safeBusiness, formattedHistory, subQueries);
    const systemPrompt = buildSystemPrompt(safeBusiness, relevantKnowledge, knowledge, products, isFirstMessage, userMessage, subQueries, hasAlreadyGreeted);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory.slice(-8).map(m => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const client = getGroqClient();
    let fullReply = null;
    let tokensUsed = 0;

    if (client) {
      const activeModels = await getActiveModels(client);
      for (const modelName of activeModels) {
        try {
          const response = await client.chat.completions.create({
            model: modelName,
            messages,
            max_tokens: 350,
            temperature: 0.25,
          });

          if (response?.choices?.[0]?.message?.content) {
            let candidateReply = response.choices[0].message.content;
            // Purgar de raíz cualquier bloque <think> completo o truncado
            candidateReply = candidateReply
              .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
              .replace(/<\/?think>/gi, '')
              .trim();

            // Si quedó vacío porque el modelo solo gastó tokens pensando, descartar y pasar al siguiente
            if (!candidateReply || candidateReply.length < 2) {
              console.warn(`[Groq] Modelo ${modelName} solo emitió tokens de pensamiento, probando siguiente modelo...`);
              continue;
            }

            fullReply = candidateReply;
            tokensUsed = response.usage?.total_tokens || 0;
            console.log(`[Groq] ✅ Respuesta IA generada con modelo: ${modelName}`);
            break;
          }
        } catch (modelErr) {
          console.warn(`[Groq] Modelo ${modelName} no disponible:`, modelErr.message);
        }
      }
    }

    const usedFallback = !fullReply;
    if (usedFallback) {
      fullReply = buildHumanAssistantReply(userMessage, safeBusiness, products, chatHistory, knowledge);
    }

    // Doble sanitización de seguridad para etiquetas internas y tags de razonamiento
    fullReply = (fullReply || '')
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/<\/?think>/gi, '')
      .trim();

    const isLeadHotFlag = fullReply.includes('[LEAD_CALIENTE]');
    const imageMatch = fullReply.match(/\[ENVIAR_IMAGEN:\s*(.+?)\]/i);
    const imageName = imageMatch ? imageMatch[1].trim() : null;

    const apptMatch = fullReply.match(/\[NUEVA_CITA:\s*(\{[\s\S]*?\})\]/i);
    let newAppointmentData = null;
    if (apptMatch) {
      try {
        newAppointmentData = JSON.parse(apptMatch[1]);
      } catch (_) {}
    }

    const cancelMatch = fullReply.match(/\[CANCELAR_CITA:\s*(\{[\s\S]*?\})\]/i);
    let cancelAppointmentData = null;
    if (cancelMatch) {
      try {
        cancelAppointmentData = JSON.parse(cancelMatch[1]);
      } catch (_) {}
    }

    const orderMatch = fullReply.match(/\[NUEVO_PEDIDO:\s*(\{[\s\S]*?\})\]/i);
    let newOrderData = null;
    if (orderMatch) {
      try {
        newOrderData = JSON.parse(orderMatch[1]);
      } catch (_) {}
    }

    const clientDataMatch = fullReply.match(/\[DATOS_CLIENTE:\s*(\{[\s\S]*?\})\]/i);
    let clientData = null;
    if (clientDataMatch) {
      try {
        clientData = JSON.parse(clientDataMatch[1]);
      } catch (_) {}
    }

    const isLeadHot = isLeadHotFlag || Boolean(newAppointmentData) || Boolean(newOrderData) || Boolean(clientData) || Boolean(cancelAppointmentData);

    const reply = fullReply
      .replace(/\[LEAD_CALIENTE\]/gi, '')
      .replace(/\[ENVIAR_IMAGEN:[^\]]+\]/gi, '')
      .replace(/\[NUEVA_CITA:[^\]]+\]/gi, '')
      .replace(/\[CANCELAR_CITA:[^\]]+\]/gi, '')
      .replace(/\[NUEVO_PEDIDO:[^\]]+\]/gi, '')
      .replace(/\[DATOS_CLIENTE:[^\]]+\]/gi, '')
      .trim();

    // Guardar respuesta en caché Redis/RAM para consumo 0 tokens en siguientes consultas iguales
    if (reply && isFirstOrIsolated && !usedFallback) {
      setCachedAiResponse(safeBusiness?.id, userMessage, {
        reply,
        isLeadHot,
        imageName,
        newAppointmentData,
        newOrderData,
        clientData,
        ragChunksUsed: relevantKnowledge.length,
      }).catch(() => {});
    }

    return {
      reply,
      isLeadHot,
      tokensUsed,
      imageName,
      newAppointmentData,
      cancelAppointmentData,
      newOrderData,
      clientData,
      ragChunksUsed: relevantKnowledge.length,
      usedFallback,
    };
  } catch (err) {
    console.error('[Groq] Error en askGroq:', err.message);
    try {
      const { notifySystemAlert } = require('../whatsapp/notifier');
      notifySystemAlert('GROQ_API_ERROR', {
        message: err.message,
        businessName: safeBusiness?.name
      });
    } catch (_) {}

    const reply = buildHumanAssistantReply(userMessage, safeBusiness, products, chatHistory, knowledge);
    return {
      reply,
      isLeadHot: false,
      tokensUsed: 0,
      imageName: null,
      newAppointmentData: null,
      clientData: null,
      ragChunksUsed: 0,
      usedFallback: true,
    };
  }
};

module.exports = { askGroq, ragSearch, searchKnowledge, rankAndFilterProducts };
