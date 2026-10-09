// Las llamadas a la IA pasan por llmPool: reparte entre Groq, Gemini y OpenRouter, limita las
// llamadas simultáneas y respeta los límites de cada proveedor. Los modelos 'groq/compound*' se
// excluyen allí: buscan en internet y traen datos que el dueño nunca configuró.
const { chatComplete } = require('./llmPool');
const { verifyReplyAmounts, verifyReplyCodes, reconcileOrderTotal } = require('./grounding');
const { parseJsonTag, stripInternalTags } = require('./replyTags');
const { isBrowseRequest } = require('./catalogIntent');
const { validateSlot } = require('../services/bookingActions');

// Lo que el cliente va a leer (sin etiquetas internas) debe ser una respuesta de verdad: una de
// dos letras ("EM") es una respuesta cortada, no una respuesta.
const MIN_REPLY_CHARS = 6;
const visibleText = (text) => stripInternalTags(text);
const isUsableReply = (text) => visibleText(text).length >= MIN_REPLY_CHARS;

// Un producto sin precio (una página del catálogo que no lo traía se guarda con 0) NO es gratis:
// mostrar "$0 COP" le dice al cliente que cuesta nada.
const priceLabel = (p) => Number(p?.price) > 0
  ? `$${Number(p.price).toLocaleString('es-CO')} ${p.currency || 'COP'}`
  : 'precio no registrado (confírmalo con un asesor, no digas que es gratis)';

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
  'dime', 'cuentame', 'favor',
  // Palabras que solo enmarcan una necesidad ("necesito algo para dormir"): lo que se busca es
  // "dormir", no "necesito" ni "algo", que de otro modo emparejarían con cualquier producto.
  'necesito', 'necesita', 'necesitamos', 'necesitaba', 'busco', 'buscando', 'buscamos',
  'quiero', 'quisiera', 'queria', 'algo', 'alguna', 'alguno', 'algun', 'cosa', 'cosas',
  'opcion', 'opciones', 'recomienda', 'recomiendan', 'recomiendas', 'recomiendame', 'recomendar',
  'ayuda', 'ayudame', 'tengan', 'tendran', 'tendra', 'saber', 'informacion', 'info',
  'puedo', 'puede', 'pueden', 'quiere', 'me', 'sirve', 'sirva'
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
// Cortesías y continuaciones: no buscan nada en el catálogo, no justifican gastar IA.
const CHITCHAT_WORDS = new Set([
  'hola', 'buenas', 'buenos', 'buen', 'dia', 'dias', 'tarde', 'tardes', 'noche', 'noches',
  'gracias', 'muchas', 'mil', 'ok', 'okay', 'vale', 'listo', 'lista', 'dale', 'perfecto', 'claro',
  'si', 'sii', 'no', 'bueno', 'genial', 'excelente', 'entendido', 'acuerdo', 'de', 'que', 'mas',
  'tal', 'como', 'estas', 'esta', 'bien', 'chao', 'adios', 'hasta', 'luego', 'por', 'favor',
]);

const STRONG_KNOWLEDGE_SCORE = 10; // frase en el título, o varias palabras del título
const STRONG_PRODUCT_SCORE = 4;    // al menos una palabra exacta en el nombre de un producto

// ¿El mensaje tiene algo que buscar? Cortesías ("gracias", "ok dale") y puro relleno no
// justifican gastar una llamada a la IA.
const shouldExpandForSearch = (userMessage) => {
  const tokens = normalizeSearchText(userMessage).split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.every(t => CHITCHAT_WORDS.has(t))) return false;
  return tokens.some(t => t.length >= 2 && !SPANISH_STOPWORDS.has(t) && !CHITCHAT_WORDS.has(t));
};

// ¿Vale la pena gastar una llamada a la IA para generar sub-consultas? Casi nunca: solo cuando
// el buscador local no encuentra nada claro y el contexto no cabe completo en el prompt.
const shouldExpandWithLLM = (userMessage, knowledge = [], products = []) => {
  if (!shouldExpandForSearch(userMessage)) return false;

  // Si el catálogo y la base de conocimiento caben completos en el prompt, el modelo ya ve todo
  const knowledgeChars = (knowledge || []).reduce((n, k) => n + (k.title?.length || 0) + (k.content?.length || 0), 0);
  if (knowledgeChars <= FULL_KNOWLEDGE_MAX_CHARS && (products || []).length <= 15) return false;

  // Coincidencia local fuerte: el buscador ya encontró lo que el cliente pide
  const knowledgeTop = searchKnowledge(userMessage, knowledge)[0]?.score || 0;
  if (knowledgeTop >= STRONG_KNOWLEDGE_SCORE) return false;
  const productTop = rankAndFilterProducts(userMessage, products, []).topScore || 0;
  if (productTop >= STRONG_PRODUCT_SCORE) return false;

  return true;
};

// Vocabulario real del negocio: la IA traduce la necesidad del cliente a estos términos
// ("algo para dormir" → "colchón") en vez de adivinar palabras que el catálogo no usa.
const buildVocabulary = (knowledge = [], products = [], extraCategories = []) => {
  const clip = (s, n) => (s || '').toString().trim().slice(0, n);
  const categories = Array.from(new Set([...(extraCategories || []), ...(products || []).map(p => p.category)]
    .map(c => clip(c, 40)).filter(Boolean))).slice(0, 40);
  const names = (products || []).map(p => clip(p.name, 45)).filter(Boolean).slice(0, 60);
  const titles = (knowledge || []).map(k => clip(k.title, 60)).filter(Boolean).slice(0, 30);
  const parts = [];
  if (categories.length) parts.push(`Categorías: ${categories.join(', ')}`);
  if (names.length) parts.push(`Productos: ${names.join(' | ')}`);
  if (titles.length) parts.push(`Temas de la base de conocimiento: ${titles.join(' | ')}`);
  return parts.join('\n');
};

// Sub-consultas ya calculadas: el mismo mensaje en el mismo contexto no se vuelve a pagar.
const SUBQUERY_TTL_MS = 30 * 60 * 1000;
const SUBQUERY_MAX_ENTRIES = 500;
const subQueryCache = new Map();

const generateSubQueries = async (userMessage, business = null, chatHistory = [], vocabulary = '') => {
  const busName = business?.name || 'Negocio';
  const busCategory = business?.category || 'Atención y Servicios';
  const busGoal = business?.main_goal || 'vender';

  const lastAssistantMsg = Array.isArray(chatHistory)
    ? chatHistory.filter(m => m.direction === 'outbound').slice(-1)[0]?.content || ''
    : '';

  const cacheKey = `${business?.id || 'x'}|${normalizeSearchText(userMessage)}|${normalizeSearchText(lastAssistantMsg).slice(0, 80)}`;
  const hit = subQueryCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  try {
    const response = await chatComplete({
      lowPriority: true,
      allowTruncated: true, // una lista de consultas cortada sigue sirviendo
      messages: [
        {
          role: 'system',
          content: `Eres un motor de búsqueda RAG para el catálogo y la base de conocimiento del negocio "${busName}" (Giro: ${busCategory}, Objetivo: ${busGoal}).
Tu trabajo es SOLO ayudar a ENCONTRAR información, nunca responder al cliente.
Dado el mensaje del cliente y el contexto previo, traduce lo que necesita (nombre de producto, para qué lo quiere, sinónimos, una duda de envíos/pagos/garantía) a 2 o 3 consultas cortas, usando de preferencia palabras que EXISTAN en este vocabulario del negocio:
${vocabulary || '(sin vocabulario disponible)'}
Si nada del vocabulario se relaciona con lo que pide, responde exactamente: NINGUNA
Responde ÚNICAMENTE con las consultas separadas por "|", sin texto adicional ni números.`
        },
        ...(lastAssistantMsg ? [{ role: 'assistant', content: lastAssistantMsg.slice(0, 300) }] : []),
        { role: 'user', content: userMessage }
      ],
      max_tokens: 100,
      temperature: 0.2,
    });

    if (!response) return [];
    const raw = (response.content || '').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
    const queries = /^ninguna\.?$/i.test(raw)
      ? []
      : raw.split('|').map(q => q.trim()).filter(q => q.length > 0 && q.length <= 80 && !/^ninguna\.?$/i.test(q)).slice(0, 3);

    if (subQueryCache.size >= SUBQUERY_MAX_ENTRIES) subQueryCache.delete(subQueryCache.keys().next().value);
    subQueryCache.set(cacheKey, { value: queries, expiresAt: Date.now() + SUBQUERY_TTL_MS });
    return queries;
  } catch (e) {
    return [];
  }
};

// Punto único de entrada: decide si hace falta la IA y, si no, no la usa.
const getSubQueries = async (userMessage, business, chatHistory, knowledge, products) => {
  if (!shouldExpandWithLLM(userMessage, knowledge, products)) return [];
  return generateSubQueries(userMessage, business, chatHistory, buildVocabulary(knowledge, products));
};

// ─── Catálogos grandes: búsqueda en SQL (migración 005) ──────────────────────
// Lo que el cliente pide además de "qué producto": ordenar por precio o ver algo parecido.
const PRICE_ASC_RE = /\b(barat[oa]s?|economic[oa]s?|menor precio|precio mas bajo|menos costos[oa])\b/;
const PRICE_DESC_RE = /\b(mas car[oa]s?|mayor precio|precio mas alto|mas costos[oa]|de lujo|premium)\b/;
const SIMILAR_RE = /\b(parecid[oa]s?|similar(es)?|alternativ[oa]s?|algo asi|otr[oa]s? (opcion|opciones|modelo|modelos|marca|marcas|referencia|referencias)|mas opciones)\b/;
// Palabras de esas peticiones: no son parte del nombre de ningún producto
const INTENT_WORDS = new Set([
  'barato', 'barata', 'baratos', 'baratas', 'economico', 'economica', 'economicos', 'economicas',
  'parecido', 'parecida', 'parecidos', 'parecidas', 'similar', 'similares', 'alternativa', 'alternativas',
  'premium', 'lujo', 'costoso', 'costosa', 'caro', 'cara', 'caros', 'caras',
]);

// Términos de búsqueda: solo palabras con contenido (sin relleno, sin presupuestos como "150000")
const extractSearchTerms = (queries = []) => {
  const out = new Set();
  for (const q of queries) {
    for (const w of normalizeSearchText(q).split(' ')) {
      if (w.length < 2 || SPANISH_STOPWORDS.has(w) || INTENT_WORDS.has(w) || /^\d{5,}$/.test(w)) continue;
      out.add(w);
    }
  }
  return [...out].slice(0, 12);
};

const MAX_PRODUCTS_IN_PROMPT = 15;
const SEARCH_CANDIDATES = 30; // candidatos que se piden a la búsqueda SQL antes de repartir entre categorías
// El bot acaba de pedir datos personales o de entrega
const DATA_REQUEST_RE = /\b(direccion|ciudad|barrio|telefono|celular|correo|email|nombre completo|cedula|datos|cantidad|cuantas unidades)\b/;

// Busca en SQL lo que el cliente pide. La IA solo se usa para traducir una necesidad a términos
// del catálogo ("algo para dormir" → "colchón") cuando la búsqueda directa no encontró algo claro.
const retrieveFromLargeCatalog = async ({ userMessage, business, history, knowledge, options }) => {
  const norm = normalizeSearchText(userMessage);
  const orden = PRICE_ASC_RE.test(norm) ? 'precio_asc' : PRICE_DESC_RE.test(norm) ? 'precio_desc' : 'relevancia';
  const wantsSimilar = SIMILAR_RE.test(norm);
  const lastBotMessages = [...history].filter(m => m.direction === 'outbound').slice(-2).map(m => m.content || '');
  // Si el bot acaba de pedirle datos al cliente ("¿tu dirección?"), lo que contesta ("calle 1")
  // no es una búsqueda de productos: no se gasta IA en expandirlo.
  const answeringDataRequest = DATA_REQUEST_RE.test(normalizeSearchText(lastBotMessages[lastBotMessages.length - 1] || ''));

  let terms = extractSearchTerms([userMessage]);
  // "hola", "gracias", "ok dale" no piden ningún producto
  if (!shouldExpandForSearch(userMessage)) terms = [];
  // En una dirección o un teléfono los números ("calle 10 # 5-20") no son modelos de producto
  if (answeringDataRequest) terms = terms.filter(t => !/^\d+$/.test(t));

  const sampleResult = (extra = {}) => ({ products: options.sample || [], noMatch: false, contextProducts: [], subQueries: [], mode: 'sample', orden: 'relevancia', ...extra });
  // Productos de los que ya se venía hablando en la conversación (p. ej. el pedido en curso)
  const fetchContext = async () => {
    const contextTerms = extractSearchTerms(lastBotMessages).slice(0, 10);
    return contextTerms.length ? (await options.searchProducts(contextTerms, { limit: 6 })) || [] : [];
  };

  // Charla o consulta genérica ("hola", "qué venden"): una muestra basta, no hay nada que buscar
  if (!terms.length && orden === 'relevancia' && !wantsSimilar) {
    if (answeringDataRequest) {
      const ctx = await fetchContext();
      if (ctx.length) return { products: ctx, noMatch: false, contextProducts: [], subQueries: [], mode: 'context', orden: 'relevancia' };
    }
    return sampleResult();
  }

  // Se piden más de las que caben en el prompt para poder repartirlas entre categorías
  let rows = await options.searchProducts(terms, { orden, limit: SEARCH_CANDIDATES });
  if (rows === null) return sampleResult(); // la búsqueda SQL no respondió: se queda con la muestra

  let subQueries = [];
  const topScore = rows[0]?.score || 0;
  if (terms.length && topScore < STRONG_PRODUCT_SCORE && !answeringDataRequest && shouldExpandForSearch(userMessage)) {
    const vocabulary = buildVocabulary(knowledge, options.sample || [], options.categories || []);
    subQueries = await generateSubQueries(userMessage, business, history, vocabulary);
    const extraTerms = extractSearchTerms(subQueries).filter(t => !terms.includes(t));
    if (extraTerms.length) {
      const widened = await options.searchProducts([...terms, ...extraTerms], { orden, limit: SEARCH_CANDIDATES });
      if (widened && widened.length) rows = widened;
    }
  }

  let finalOrden = orden;
  if (wantsSimilar && typeof options.similarProducts === 'function') {
    // El producto de referencia es el que pide el cliente o, si dice solo "algo parecido", el
    // que el bot acaba de mostrar.
    let anchor = terms.length ? rows[0] : null;
    if (!anchor) {
      const lastBot = [...history].reverse().find(m => m.direction === 'outbound')?.content || '';
      const lastTerms = extractSearchTerms([lastBot]);
      if (lastTerms.length) anchor = (await options.searchProducts(lastTerms.slice(0, 8), { limit: 1 }))?.[0] || null;
    }
    if (anchor?.id) {
      const similar = await options.similarProducts(anchor.id, 8);
      if (similar && similar.length) {
        rows = [anchor, ...similar.filter(p => p.id !== anchor.id)];
        finalOrden = 'similares';
      }
    }
  }

  // Nada coincide con el último mensaje, o el cliente está dando datos de un pedido en curso: se
  // conservan, aparte, los productos de los que ya se hablaba.
  let contextProducts = [];
  if ((rows.length === 0 || answeringDataRequest) && lastBotMessages.length) {
    const seen = new Set(rows.map(p => p.id));
    contextProducts = (await fetchContext()).filter(p => !seen.has(p.id));
  }

  // Por relevancia: sin lo que solo comparte una palabra común, y repartido entre categorías para que
  // una categoría grande no desplace a una pequeña. Por precio o similares el orden ya es el pedido.
  const shown = finalOrden === 'relevancia'
    ? diversifyByCategory(dropWeakMatches(rows), MAX_PRODUCTS_IN_PROMPT)
    : rows.slice(0, MAX_PRODUCTS_IN_PROMPT);

  return {
    products: shown,
    noMatch: rows.length === 0,
    contextProducts,
    subQueries,
    mode: 'search',
    orden: finalOrden,
  };
};

// ─── Lista completa ("el catálogo", "la lista de precios", "qué más hay") ────────
// No es una búsqueda: se entrega la categoría de la que habla el cliente (o de la que se venía
// hablando) completa y en orden de precio. Sin sub-consultas a la IA: sale de reglas y SQL.
const BROWSE_MAX = 20;

// Categoría del catálogo que nombra el mensaje o, si no nombra ninguna, la de la conversación.
const detectCategory = (texts, categories) => {
  const cats = (categories || []).filter(Boolean).map(c => ({
    c, words: [...new Set(normalizeSearchText(c).split(' ').filter(w => w.length >= 4 && !SPANISH_STOPWORDS.has(w)))],
  }));
  if (!cats.length) return null;
  // Una palabra presente en más de la mitad de las categorías ("eléctricas") no distingue ninguna
  const freq = new Map();
  cats.forEach(x => x.words.forEach(w => freq.set(w, (freq.get(w) || 0) + 1)));
  const maxFreq = cats.length < 3 ? Infinity : Math.floor(cats.length / 2);
  for (const text of texts) {
    const tokens = normalizeSearchText(text || '').split(' ').filter(w => w.length >= 4);
    if (!tokens.length) continue;
    let best = null;
    let bestScore = 0;
    for (const x of cats) {
      const score = x.words.filter(w => freq.get(w) <= maxFreq && tokens.some(t => isFuzzyWordMatch(t, w))).length;
      if (score > bestScore) { best = x.c; bestScore = score; }
    }
    if (best) return best;
  }
  return null;
};

// { mode: 'category' | 'all' | 'categories', list, category, total, categoryCounts }, o null si
// no se pudo armar (el llamador sigue con la búsqueda normal).
const buildBrowse = async ({ userMessage, history, products, options }) => {
  const recent = [...history].reverse();
  const texts = [
    userMessage,
    ...recent.filter(m => m.direction === 'inbound').slice(0, 2).map(m => m.content),
    ...recent.filter(m => m.direction === 'outbound').slice(0, 1).map(m => m.content),
  ];

  if (typeof options?.listCategory === 'function') {
    const counts = options.categoryCounts || {};
    const category = detectCategory(texts, options.categories || []);
    if (!category) return { mode: 'categories', list: [], category: null, total: options.catalogTotal, categoryCounts: counts };
    const list = await options.listCategory(category, BROWSE_MAX);
    if (!list) return null;
    return { mode: 'category', list, category, total: counts[category] || list.length, categoryCounts: counts };
  }

  const all = Array.isArray(products) ? products : [];
  if (!all.length) return null;
  const counts = {};
  all.forEach(p => { const c = (p.category || '').trim(); if (c) counts[c] = (counts[c] || 0) + 1; });
  const byPrice = (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0);
  const category = detectCategory(texts, Object.keys(counts));
  if (category) {
    const inCategory = all.filter(p => (p.category || '').trim() === category).sort(byPrice);
    return { mode: 'category', list: inCategory.slice(0, BROWSE_MAX), category, total: inCategory.length, categoryCounts: counts };
  }
  if (all.length <= BROWSE_MAX) return { mode: 'all', list: all, category: null, total: all.length, categoryCounts: counts };
  return { mode: 'categories', list: [], category: null, total: all.length, categoryCounts: counts };
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

// Puntúa cada producto por las palabras de la consulta: nombre 4 · categoría 2.5 · descripción 1
// (con tolerancia a errores de tipeo). Un producto sin ninguna coincidencia queda en 0.
// Peso de cada palabra según qué tan poco común es en el catálogo: "eléctrica" (en todos los
// productos) no distingue nada; "bicicleta" (en pocos) sí. Va de 0.05 a 1.
const wordWeights = (words, products) => {
  const n = products.length;
  const haystacks = products.map(p => normalizeSearchText(`${p.name || ''} ${p.category || ''} ${p.description || ''}`));
  const weights = new Map();
  for (const word of words) {
    const df = haystacks.reduce((count, h) => count + (h.includes(word) ? 1 : 0), 0);
    const w = n > 1 ? Math.log((n + 1) / (df + 0.5)) / Math.log((n + 1) / 1.5) : 1;
    weights.set(word, Math.max(0.05, Math.min(1, w)));
  }
  return weights;
};

// `score` = cuánto coincide (para decidir si hay coincidencia); `rank` = lo mismo pero dándole
// menos peso a las palabras comunes (para ordenar y para no llenar la lista con un solo tipo).
const scoreProductsByWords = (words, products) => {
  const weights = wordWeights(words, products);
  return products.map(item => {
    const normName = normalizeSearchText(item.name || '');
    const normCat = normalizeSearchText(item.category || '');
    const normDesc = normalizeSearchText(item.description || '');

    const nameWords = normName.split(/\s+/);
    const catWords = normCat.split(/\s+/);
    const descWords = normDesc.split(/\s+/);

    let score = 0;
    let rank = 0;
    for (const word of words) {
      let part = 0;
      if (normName.includes(word)) {
        part += 4;
      } else if (nameWords.some(nw => isFuzzyWordMatch(word, nw))) {
        part += 3.2;
      }

      if (normCat.includes(word)) {
        part += 2.5;
      } else if (catWords.some(cw => isFuzzyWordMatch(word, cw))) {
        part += 2.0;
      }

      if (normDesc.includes(word)) {
        part += 1;
      } else if (descWords.some(dw => isFuzzyWordMatch(word, dw))) {
        part += 0.8;
      }
      score += part;
      rank += part * weights.get(word);
    }
    return { ...item, score, rank };
  });
};

// Reparte los resultados entre categorías en vez de agotar una sola: si piden "bici eléctrica" y
// hay 30 bicimotos y 6 bicicletas, el modelo tiene que ver las dos clases, no solo las primeras 15.
// Se toma uno de cada categoría por turnos (empezando por la que mejor puntúa), así una categoría
// grande no desplaza a una pequeña. Los `items` ya vienen ordenados por relevancia.
const diversifyByCategory = (items, max, perCategory = Infinity) => {
  const groups = new Map();
  items.forEach((item, index) => {
    const category = (item.category || '').trim().toLowerCase();
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(index);
  });
  const queues = [...groups.values()];
  const picked = [];
  for (let round = 0; picked.length < max && round < perCategory; round++) {
    let tookAny = false;
    for (const queue of queues) {
      if (picked.length >= max) break;
      if (round < queue.length) { picked.push(queue[round]); tookAny = true; }
    }
    if (!tookAny) break;
  }
  return picked.sort((a, b) => a - b).map(i => items[i]);
};

// Descarta lo que solo comparte una palabra común con lo pedido (frente a lo mejor encontrado)
const RELEVANCE_FLOOR = 0.35;
const dropWeakMatches = (items) => {
  const top = items.reduce((m, p) => Math.max(m, p.rank ?? p.score ?? 0), 0);
  return top > 0 ? items.filter(p => (p.rank ?? p.score ?? 0) >= top * RELEVANCE_FLOOR) : items;
};

// Devuelve { list, specific, catalogHasProducts, noMatch }:
// - specific: la lista son productos que SÍ coinciden con la consulta puntual del cliente.
// - noMatch: hay catálogo pero NINGÚN producto coincide con la consulta puntual → no entregamos
//   productos al azar, para que el modelo no los presente como si fueran lo que el cliente pidió.
const rankAndFilterProducts = (query, products, subQueries = []) => {
  const all = Array.isArray(products) ? products : [];
  if (all.length === 0) return { list: [], specific: false, catalogHasProducts: false, noMatch: false };
  // Catálogo pequeño: cabe completo, el modelo ve TODO y no tiene que adivinar nada.
  if (all.length <= 15) return { list: all, specific: false, catalogHasProducts: true, noMatch: false };
  if (!query || typeof query !== 'string') return { list: all.slice(0, 12), specific: false, catalogHasProducts: true, noMatch: false };
  // "hola", "gracias", "ok dale": no piden ningún producto, no es una búsqueda sin resultados
  if (!shouldExpandForSearch(query)) return { list: all.slice(0, 12), specific: false, catalogHasProducts: true, noMatch: false };

  const allSearchTerms = [query, ...(Array.isArray(subQueries) ? subQueries : [])];
  const allWords = new Set();

  // Solo usamos palabras CON contenido (sin stopwords) para puntuar. Si la consulta son puras
  // stopwords ("¿qué tienen?", "hola, me cuentas"), es navegación genérica → muestra, no "sin match".
  for (const term of allSearchTerms) {
    const norm = normalizeSearchText(term);
    const tokens = norm.split(/\s+/).filter(w => w.length >= 2);
    const meaningful = tokens.filter(w => !SPANISH_STOPWORDS.has(w));
    meaningful.forEach(w => allWords.add(w));
  }

  // Consulta genérica (sin palabras de contenido): mostramos una muestra para que explore.
  if (allWords.size === 0) return { list: all.slice(0, 12), specific: false, catalogHasProducts: true, noMatch: false };

  const scored = scoreProductsByWords(allWords, all);

  const found = scored.filter(i => i.score > 0).sort((a, b) => b.rank - a.rank || b.score - a.score);
  const matched = dropWeakMatches(found);
  if (matched.length > 0) {
    return {
      list: diversifyByCategory(matched, 15),
      specific: true, catalogHasProducts: true, noMatch: false,
      topScore: Math.max(...matched.map(m => m.score)),
      totalMatched: matched.length,
    };
  }
  // Catálogo grande + consulta puntual sin ninguna coincidencia: NO devolvemos productos al azar.
  return { list: [], specific: false, catalogHasProducts: true, noMatch: true };
};

// Topes del contexto: un documento largo (p. ej. un PDF subido antes de partirse en
// bloques) no puede desbordar el límite de tokens del modelo y dejar al bot sin IA.
const MAX_ITEM_CHARS = 2000;
const MAX_KNOWLEDGE_CONTEXT_CHARS = 9000;

const buildKnowledgeContext = (knowledge) => {
  if (!knowledge?.length) return null;

  const blocks = [];
  let used = 0;
  let dropped = 0;
  knowledge.forEach((k, i) => {
    const content = (k.content || '').length > MAX_ITEM_CHARS ? `${k.content.slice(0, MAX_ITEM_CHARS)}…` : (k.content || '');
    let block;
    if (k.type === 'faq') block = `[PREGUNTA FRECUENTE (FAQ) OFICIAL ${i+1}]\nPregunta: ${k.title}\nRespuesta Autorizada: ${content}`;
    else if (k.type === 'image') block = `[PRODUCTO CON IMAGEN/FOTO ${i+1}: ${k.title}]\nDescripción: ${content}${k.file_url ? `\nURL Foto: ${k.file_url}` : ''}`;
    else if (k.type === 'file') block = `[GUÍA / DOCUMENTO ${i+1}: ${k.title}]\nContenido: ${content}`;
    else block = `[INFORMACIÓN OFICIAL ${i+1}: ${k.title}]\n${content}`;

    if (used + block.length > MAX_KNOWLEDGE_CONTEXT_CHARS && blocks.length > 0) { dropped++; return; }
    blocks.push(block);
    used += block.length;
  });
  let out = blocks.join('\n\n---\n\n');
  // Si quedó información por fuera, avísale al modelo para que no rellene lo que no ve.
  if (dropped > 0) out += `\n\n(Hay ${dropped} documento(s) más en la base de conocimiento que no caben en este contexto. Si el cliente pregunta algo que no aparece arriba, NO lo inventes: ofrece confirmarlo con un asesor del equipo.)`;
  return out;
};

// ─── 5. System prompt con info del negocio ────────────────────────────────────
const FULL_KNOWLEDGE_MAX_CHARS = 8000;

// catalogInfo (solo catálogos grandes, buscados en SQL): { total, categories, noMatch, mode, orden }
const buildSystemPrompt = (business, relevantKnowledge, allKnowledge, products = [], isFirstMessage = true, userMessage = '', subQueries = [], hasAlreadyGreeted = false, catalogInfo = null, contactPhoneUnknown = false, busySlots = [], browseInfo = null, catalogPdf = null) => {
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

  // En catálogos grandes la lista de productos es solo lo encontrado: las categorías son las de TODO el catálogo
  const distinctCategories = catalogInfo?.categories?.length
    ? catalogInfo.categories
    : browseInfo?.categoryCounts && Object.keys(browseInfo.categoryCounts).length
    ? Object.keys(browseInfo.categoryCounts)
    : Array.from(new Set((products || []).map(p => p.category?.trim()).filter(Boolean)));
  // En modo lista se muestran cuántos productos tiene cada categoría, para que el cliente elija
  const browseCounts = browseInfo?.categoryCounts || {};
  const categoriesOverview = distinctCategories.length > 0
    ? `=== COLECCIONES Y CATEGORÍAS REGISTRADAS EN EL CATÁLOGO ===\n${distinctCategories.map(c => `• ${c}${browseInfo && browseCounts[c] ? ` (${browseCounts[c]})` : ''}`).join('\n')}\n=== FIN DE COLECCIONES ===`
    : '';
  const browseCategories = browseInfo?.mode === 'categories';

  // Si la base de conocimiento es pequeña va completa: el buscador por palabras falla con
  // preguntas redactadas distinto y, sin contexto, el modelo termina rellenando con inventos.
  const allKnowledgeChars = (allKnowledge || []).reduce((n, k) => n + (k.title?.length || 0) + (k.content?.length || 0), 0);
  const knowledgeForPrompt = allKnowledge?.length && allKnowledgeChars <= FULL_KNOWLEDGE_MAX_CHARS
    ? allKnowledge
    : relevantKnowledge;
  const relevantContext = buildKnowledgeContext(knowledgeForPrompt);
  const hasKnowledge = !!relevantContext;

  // En catálogo grande, los "de contexto" no son resultados de la búsqueda: se muestran aparte
  const contextProducts = catalogInfo?.contextProducts || [];
  if (contextProducts.length) products = products.filter(p => !contextProducts.includes(p));
  // En modo lista los productos ya vienen escogidos (toda la categoría): no se vuelven a filtrar
  const prodResult = browseInfo
    ? { list: products, specific: true, noMatch: false, totalMatched: products.length }
    : rankAndFilterProducts(userMessage, products, subQueries);
  const filteredProducts = prodResult.list;
  const hasProducts = Array.isArray(filteredProducts) && filteredProducts.length > 0;
  const noProductMatch = prodResult.noMatch === true || (!hasProducts && catalogInfo?.noMatch === true);
  const isPartialSample = hasProducts && !catalogInfo && !prodResult.specific && Array.isArray(products) && products.length > filteredProducts.length;
  // Hay más coincidencias de las que caben: el modelo no debe creer que lo mostrado es todo lo que hay
  const moreMatchesNote = hasProducts && !catalogInfo && !browseInfo && prodResult.specific && prodResult.totalMatched > filteredProducts.length
    ? `\n(Se muestran ${filteredProducts.length} de ${prodResult.totalMatched} productos que coinciden, repartidos entre las categorías. Hay más: si el cliente quiere ver otros o afinar, pregúntale por modelo, uso o presupuesto.)`
    : '';
  const ordenLabel = { precio_asc: 'de menor a mayor precio', precio_desc: 'de mayor a menor precio', similares: 'por parecido al producto de referencia (el primero)' }[catalogInfo?.orden] || 'por relevancia';
  const contextBlock = contextProducts.length
    ? `\nProductos de los que ya se venía hablando en esta conversación (datos oficiales; si el cliente continúa con ellos, úsalos):\n${contextProducts.map(p => `- [${p.category || 'General'}] ${p.name}: ${priceLabel(p)}${p.description ? ` (${p.description})` : ''}`).join('\n')}`
    : '';
  const browseNote = !browseInfo || !hasProducts
    ? ''
    : `\n(El cliente pidió ver la lista. ${browseInfo.mode === 'all'
      ? `Este es el catálogo COMPLETO (${filteredProducts.length} productos).`
      : `Son ${filteredProducts.length} de los ${browseInfo.total} productos de "${browseInfo.category}", de menor a mayor precio.`} Preséntalos TODOS en lista compacta, uno por línea: "• Nombre – $precio", sin descripciones.${browseInfo.total > filteredProducts.length ? ` Aclara que hay ${browseInfo.total - filteredProducts.length} más y pregunta por presupuesto o modelo para mostrárselos.` : ''} Cierra con UNA pregunta que le ayude a elegir.)`;
  const catalogNote = browseInfo
    ? browseNote
    : !hasProducts || !catalogInfo
    ? ''
    : catalogInfo.mode === 'context'
      ? '\n(Son los productos de los que ya se venía hablando: el cliente está respondiendo datos de su pedido. No presentes otros productos.)'
    : catalogInfo.mode === 'sample'
      ? `\n(Es solo una MUESTRA de un catálogo de ${catalogInfo.total} productos, no está completo. Si el cliente busca algo puntual que no aparezca aquí, pídele el nombre/modelo para ubicarlo; no asumas que no existe.)`
      : `\n(Resultado de buscar lo que pide el cliente entre los ${catalogInfo.total} productos del negocio, ordenados ${ordenLabel}. Preséntalos solo si responden a lo que pidió; el resto del catálogo no se muestra aquí. No afirmes que no hay más: ofrécele precisar nombre, modelo o característica.)`;
  // La lista va sin descripción ni foto: son más productos y no hacen falta para listarlos
  const productsContext = hasProducts && browseInfo
    ? filteredProducts.map(p => `- [${p.category || 'General'}] ${p.name}: ${priceLabel(p)}`).join('\n')
    : hasProducts
    ? filteredProducts.map(p => `- [${p.category || 'General'}] ${p.name}: ${priceLabel(p)}${p.description ? ` (${p.description})` : ''}${p.image_url ? ` | Foto/Imagen: ${p.image_url}` : ''}`).join('\n')
    : null;

  const mainGoalText = isSales
    ? `llevar a cada cliente de "${busName}" de la duda a la compra: entiende qué necesita, recomiéndale la opción del catálogo oficial que mejor le sirve y guíalo hasta cerrar el pedido.`
    : `convertir cada consulta de "${busName}" en una cita o reserva confirmada: resuelve sus dudas, entiende qué servicio necesita y agéndalo en un horario disponible.`;

  // Método comercial según el objetivo del negocio: qué hacer en cada etapa de la conversación
  const playbook = isSales
    ? `1. DIAGNOSTICA: si la consulta es amplia ("motos", "qué tienen", "precios"), muestra 2 o 3 opciones representativas (de rangos de precio distintos) y haz UNA pregunta que filtre: uso, presupuesto o preferencia (ej. "¿la buscas para ciudad o para trabajo?").
2. RECOMIENDA CON RAZÓN: conecta la opción con lo que el cliente dijo ("como la usarás para X, te sirve Y porque Z"), usando solo características registradas. Si hay un "⭐ Más Recomendado/Popular" que encaja, destácalo.
3. LO QUE PIDE EL CLIENTE MANDA: si pide "el catálogo completo", "todas", "más opciones", "la lista" o "qué más hay", entrégale la lista de lo que tienes en el CATÁLOGO OFICIAL (de la categoría que le interesa) en formato compacto, una por línea: "• Nombre – $precio", sin descripciones. Aquí sí puedes pasar de 4 líneas. Si lo que ves es solo una muestra o parte del catálogo, dilo y pregunta por categoría o presupuesto para mostrarle el resto.
4. NO TE REPITAS: nunca respondas un pedido nuevo con las mismas opciones del mensaje anterior. Si ya mostraste unos productos, avanza: otros distintos, la comparación que pide o el siguiente paso.
5. OBJECIONES: "está caro" → resalta el valor y ofrece la alternativa más económica del catálogo (financiación o descuentos solo si están registrados). "Lo voy a pensar" → pregunta qué duda le queda y resuélvela; ofrece apartarlo o agendar una visita, sin presionar.
6. CIERRA: ante señales de compra (pregunta por pago, envío, disponibilidad, "me gusta", "cuál me recomiendas") deja de mostrar opciones y propón el paso concreto: confirmar producto y pedir los datos del pedido.`
    : `1. ENTIENDE EL MOTIVO: qué servicio necesita, para quién y si tiene urgencia o preferencia de día. Una pregunta a la vez.
2. RESUELVE CON DATOS OFICIALES: precio, duración, preparación o requisitos solo si están registrados.
3. PROPÓN HORARIOS CONCRETOS: ofrece 2 opciones dentro del horario y que no estén ocupadas ("¿te sirve el jueves 10:00 am o el viernes 3:00 pm?"), no un "¿cuándo puedes?" abierto.
4. CONFIRMA: repite servicio, día y hora y lo que debe traer o saber (solo si está registrado).
5. Si duda o pospone, pregunta qué le frena, resuélvelo y deja la puerta abierta con una opción de horario.`;

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
("total" = precio del catálogo × cantidad, solo números. Usa solo datos que el cliente dio; deja "" lo que no dio: nunca valores de ejemplo ni supuestos. En "notas" pon lo relevante: contado/financiado, color, versión, etc.)
(Si las INSTRUCCIONES DE CIERRE del dueño piden datos que no tienen campo propio —fecha y hora de entrega, quién recibe, dedicatoria, referencia, alergias, etc.— agrégalos al mismo JSON como campos extra con nombre corto, por ejemplo "fecha_entrega": "sábado 14 8:00 am", "recibe": "Laura", "dedicatoria": "...". Solo lo que el cliente dijo; nunca los inventes.)
- Si pide cambiar un pedido ya tomado (cantidad, producto, dirección, ciudad o medio de pago), confírmale el cambio en 1 o 2 líneas y añade al final (una sola vez):
[MODIFICAR_PEDIDO: {"producto": "...", "cantidad": 1, "total": 0, "direccion": "...", "ciudad": "...", "metodo_pago": "...", "notas": "..."}]
(Incluye SOLO los campos que cambian; deja "" u omite lo que no cambia. "total" = precio del catálogo × cantidad, solo números; nunca inventes precios.)
- Si pide cancelar su pedido ("ya no lo quiero", "cancela mi pedido"), confírmalo con calidez en 1 o 2 líneas y añade al final (una sola vez):
[CANCELAR_PEDIDO: {"motivo": "..."}]
("motivo" solo si el cliente lo dijo.) Cambiar algo del pedido NO es cancelarlo: usa [MODIFICAR_PEDIDO]. Si el negocio ya lo tiene en proceso, el equipo lo revisa: no prometas que quedó cancelado de inmediato.`;

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

  return `Eres el asesor comercial experto de "${busName}" (${busCategory}) por WhatsApp: conoces el catálogo a fondo, atiendes como el mejor asesor de tienda y ayudas al cliente a decidir.
Misión: ${mainGoalText}
Tono: ${personality}. Cercano, seguro y humano, como una persona del equipo. No te presentes como vendedor ni como bot: eres un asesor que ayuda a elegir.

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
## MÉTODO COMERCIAL
${playbook}

## ATENCIÓN AL CLIENTE
- Lee la intención aunque el cliente escriba con errores o abreviado ("manden e catlog comple" = quiere el catálogo completo).
- Si sabes su nombre, úsalo de vez en cuando. Adapta tu registro al suyo (formal o informal).
- Quejas, reclamos, garantías o estado de un pedido: primero empatía ("Lamento mucho eso, te ayudo"), pide el dato que falte (producto, fecha, número de pedido) y ofrece que un asesor lo revise. Nunca discutas ni prometas soluciones no registradas.
- Si pide hablar con una persona, acéptalo con amabilidad y di que un asesor del equipo le escribe.

## ESTILO DE RESPUESTA
- Máximo 4 líneas cortas, 1 o 2 emojis, que se lea sin hacer scroll en el celular (excepción: la lista que el cliente pidió).
- Estructura: valida lo que dijo el cliente → solución, precio o dato clave → UNA sola pregunta al final que lo acerque al siguiente paso.
- Nunca hagas dos preguntas en el mismo mensaje. Prefiere preguntas fáciles de opción ("¿mañana o tarde?", "¿domicilio o recoges?").
- Evita cierres genéricos que no avanzan ("¿te gustaría ver alguna en detalle?", "¿te llama la atención alguna?"): pregunta algo que filtre (uso, presupuesto, preferencia) o que cierre (cuál se lleva, cómo paga, cuándo viene).
- No sueltes el catálogo completo ni precios de golpe si el cliente aún no dice qué busca (salvo que él lo pida).
${hasProducts
  ? (browseInfo ? '- El cliente pidió la lista: entrégala completa (ver CATÁLOGO OFICIAL).' : '- Con catálogo: presenta 2 o 3 opciones relevantes con precio y un beneficio concreto de cada una.')
  : browseCategories
  ? '- El cliente pidió ver todo el catálogo: muéstrale las categorías con cuántos productos tiene cada una y pregúntale cuál quiere ver.'
  : noProductMatch
  ? '- No encontraste ese producto en el catálogo: no inventes modelos, precios ni características. Pregunta el nombre o modelo, ofrece las categorías o confirma con un asesor.'
  : '- No hay productos cargados: no inventes modelos ni precios. Usa las FAQs si responden la duda; si no, pregunta qué necesita y ofrece confirmarlo con un asesor.'}
- Si el cliente responde corto ("el segundo", "el pro", "qué incluye"), deduce del historial a qué opción se refiere.

## ESTADO DE LA CONVERSACIÓN
${greetingInstruction}

## DATOS DEL NEGOCIO
${businessInfo}

${categoriesOverview ? `${categoriesOverview}\n\n` : ''}${hasProducts
  ? `## CATÁLOGO OFICIAL\n${productsContext}${catalogNote}${moreMatchesNote}${contextBlock}${isPartialSample ? '\n(Es solo una MUESTRA del catálogo, no está completo. Si el cliente busca algo puntual que no aparezca aquí, pídele el nombre/modelo para ubicarlo; no asumas que no existe.)' : ''}`
  : browseCategories
  ? `## CATÁLOGO\nEl cliente pidió ver el catálogo completo, pero tiene ${browseInfo.total} productos y no caben en un mensaje. Muéstrale las categorías de arriba (con su número de productos) y pregúntale cuál quiere ver. No inventes productos.`
  : noProductMatch
  ? `## CATÁLOGO\nEl negocio SÍ tiene catálogo, pero NINGÚN producto coincide con lo que el cliente pregunta. NO afirmes que existe ni que no existe, y NO inventes nombre, precio, stock ni características. Pídele que precise el nombre o modelo, muéstrale las categorías de arriba, u ofrece confirmarlo con un asesor.${contextBlock}`
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
${catalogPdf ? `
## CATÁLOGO EN PDF
- El negocio tiene su catálogo en PDF. Si el cliente pide el catálogo, el PDF o "todo lo que tienen", añade al final [ENVIAR_CATALOGO] y dile en 1 línea que ahí va y que le ayudas a elegir.
- El PDF se envía SOLO con esa etiqueta: nunca prometas mandarlo después. Si en el historial ya aparece "📄 Catálogo", ya lo tiene: no lo reenvíes salvo que lo pida de nuevo.
` : ''}
${contactPhoneUnknown ? `
## CELULAR DEL CLIENTE (importante)
- De este cliente NO tienes su número de celular (su WhatsApp lo oculta). Antes de confirmar una cita o un pedido, pídeselo ("¿a qué número de celular te contactamos?") y no cierres sin tenerlo.
- Inclúyelo SIEMPRE como "telefono" (solo dígitos, con indicativo de país si lo dio) dentro de [NUEVA_CITA: ...] y [NUEVO_PEDIDO: ...].
` : ''}
## CITAS (${isSales ? 'visitas al punto de venta, demostraciones, servicio técnico o asesorías' : 'objetivo principal del negocio'})
- Horario: ${hoursText || 'NO configurado: no propongas horas; pregunta su preferencia y aclara que un asesor la confirma'}.
${daysText ? `- Días de atención: ${daysText}. Cerrado: ${closedDaysText}. Nunca agendes en un día cerrado: ofrece el día hábil más cercano.\n` : ''}${duration > 0 ? `- Cada cita dura ${duration} minutos: la última debe terminar antes del cierre.\n` : ''}- Nunca agendes en una fecha u hora que ya pasó.
${isSales ? '- Si el cliente quiere ver, probar o revisar algo en persona, ofrécele agendar la visita.\n' : ''}- Acuerda día y hora dentro del horario y pide su nombre si no lo tienes. Al confirmar, repite día y hora, felicítalo y añade al final (una sola vez por cita):
[LEAD_CALIENTE]
[NUEVA_CITA: {"nombre": "...", ${contactPhoneUnknown ? '"telefono": "...", ' : ''}"servicio": "...", "fecha": "YYYY-MM-DD", "hora": "HH:MM:00"}]
- Si pide cancelar su cita, confírmalo con calidez en menos de 3 líneas y añade al final:
[CANCELAR_CITA: {"nombre": "...", "fecha": "YYYY-MM-DD", "servicio": "..."}]
- Si pide cambiar, mover o reprogramar su cita a otra fecha u hora ("no puedo ese día, ponla para el sábado", "cámbiala a las 3", "mejor para otro día"), confírmale los NUEVOS datos en menos de 3 líneas y añade al final (una sola vez):
[MODIFICAR_CITA: {"nombre": "...", "fecha_anterior": "YYYY-MM-DD", "fecha": "YYYY-MM-DD", "hora": "HH:MM:00", "servicio": "..."}]
("fecha" y "hora" son los NUEVOS; incluye "fecha_anterior" solo si la conoces. Respeta horario, días hábiles y no uses fechas pasadas.) Mover la cita NO es cancelarla: no uses [CANCELAR_CITA] si el cliente quiere otra fecha. Nunca digas que quedó cambiada sin añadir la etiqueta: sin ella no se guarda.
${busySlots.length ? `- HORARIOS YA OCUPADOS (otras citas; NO los ofrezcas ni los aceptes): ${busySlots.slice(0, 60).join(', ')}.\n` : ''}

## FOTOS / IMÁGENES (importante)
- En el CATÁLOGO, cada producto con foto trae "Foto/Imagen: <url>". Si el cliente quiere VER un producto —aunque lo pida mal o informal ("mándame una foto", "la puedo ver?", "cómo se ve", "muéstrame", "y una imagen?")— identifica de cuál habla (si no lo nombra, es el que están viendo en la conversación) y añade al final: [ENVIAR_IMAGEN: Nombre exacto del producto del catálogo].
- La foto se envía SOLA con esa etiqueta. ESTÁ PROHIBIDO decir "te la envío en un momento", "ya te la mando", "enseguida te la paso" o prometer mandarla después: si la vas a enviar, pon la etiqueta AHORA y acompáñala de una frase corta ("¡Claro! Mira 👇").
- Usa el nombre tal como aparece en el catálogo. Solo usa la etiqueta si ese producto tiene "Foto/Imagen" registrada; si no la tiene, dile con calidez que un asesor se la comparte y NO uses la etiqueta.
- La foto llega con el nombre y el precio en su pie: NO preguntes si quiere conocer el precio ni lo repitas. Escribe el nombre del producto EXACTAMENTE como está en el catálogo (sin cambiar letras ni números de la referencia) y pregunta si le gustaría comprarlo o ver más detalles.`;
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

  // Productos del catálogo que coinciden con lo que pregunta (nombre, categoría o descripción)
  const queryWords = [...new Set(normalizeSearchText(userMessage).split(' ')
    .filter(w => w.length >= 2 && !SPANISH_STOPWORDS.has(w) && !INTENT_WORDS.has(w)))];
  const rankedProducts = Array.isArray(products) && products.length > 0 && queryWords.length > 0
    ? scoreProductsByWords(queryWords, products).filter(p => p.score >= 3.2).sort((a, b) => b.rank - a.rank || b.score - a.score)
    : [];

  // 1.1 Consultas fuera de tema (recetas, bromas, tareas). Si el catálogo tiene lo que nombra
  // (una pizzería con "pizza"), NO es fuera de tema.
  if (!rankedProducts.length && (norm.includes('pizza') || norm.includes('receta') || norm.includes('cocina') || norm.includes('chiste') || norm.includes('tarea'))) {
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
  // Respuesta de emergencia (la IA no está disponible): solo datos EXACTOS del catálogo, y si no
  // hay coincidencia se dice, nunca se muestran productos al azar.
  if (Array.isArray(products) && products.length > 0) {
    const fmt = (p) => {
      const desc = (p.description || '').trim();
      const price = Number(p.price) > 0 ? `$${Number(p.price).toLocaleString('es-CO')} ${p.currency || 'COP'}` : 'precio por confirmar con un asesor';
      return `• *${p.name}*: ${price}${desc ?` (${desc.length > 120 ? `${desc.slice(0, 120)}…` : desc})` : ''}`;
    };
    const categories = [...new Set(products.map(p => (p.category || '').trim()).filter(Boolean))].slice(0, 8);
    const categoriesText = categories.length ? ` Manejamos: ${categories.join(', ')}.` : '';
    const closing = isSales
      ? '¿Te gustaría apartar alguno? 😊'
      : '¿Para qué día y hora te gustaría agendar tu cita? 📅';

    // "la más barata" / "la más cara": se ordena el catálogo REAL por precio (entre lo que nombra, si nombra algo)
    const byPrice = PRICE_ASC_RE.test(norm) ? 1 : PRICE_DESC_RE.test(norm) ? -1 : 0;
    if (byPrice) {
      const pool = (rankedProducts.length ? rankedProducts : products).filter(p => Number(p.price) > 0);
      if (pool.length) {
        const top = [...pool].sort((a, b) => byPrice * (Number(a.price) - Number(b.price))).slice(0, 3).map(fmt).join('\n');
        return `${byPrice > 0 ? 'Los más económicos' : 'Los de mayor precio'} que tengo registrados en ${busName}:\n\n${top}\n\n${closing}`;
      }
    }

    if (rankedProducts.length > 0) {
      // Solo los que de verdad se parecen a lo pedido (no uno que comparte una sola sílaba)
      const cut = rankedProducts[0].rank * 0.8;
      const top = diversifyByCategory(rankedProducts.filter(p => p.rank >= cut), 3, 2).map(fmt).join('\n');
      return `Esto es lo que tengo registrado en ${busName} relacionado con tu consulta:\n\n${top}\n\nSi buscas otro modelo, marca o dato que no aparezca aquí (medidas, colores, garantía, disponibilidad...), un asesor del equipo te lo confirma. ${closing}`;
    }

    // "quiero esa", "me gusta, ¿cómo la compro?": no nombra el producto, pero el bot acaba de hablar de uno
    const wantsToContinue = /\b(quiero|comprar\w*|me gusta|llevo|llevar\w*|pedido|apartar\w*|esa|ese|esta|este)\b/.test(norm);
    if (hasHistory && wantsToContinue) {
      const lastBot = [...validHistory].reverse().find(m => m.direction === 'outbound')?.content || '';
      const lastWords = [...new Set(normalizeSearchText(lastBot).split(' ').filter(w => w.length >= 2 && !SPANISH_STOPWORDS.has(w)))];
      const discussed = lastWords.length
        ? scoreProductsByWords(lastWords, products).filter(p => p.score >= 3.2).sort((a, b) => b.rank - a.rank || b.score - a.score)
        : [];
      if (discussed.length) {
        return `¡Excelente elección! 🙌 Tengo registrado:\n\n${fmt(discussed[0])}\n\nUn asesor del equipo continúa contigo para confirmar los datos de tu compra en un momento. 🙏`;
      }
    }

    // Pide ver el catálogo o los precios en general, sin nombrar nada. Envíos, pagos, garantía... no son catálogo.
    const asksOtherTopic = /\b(envios?|domicilios?|garantia|financi\w*|cuotas?|pagos?|devoluci\w*|cambios?|horarios?|ubicacion|direccion)\b/.test(norm);
    if (!asksOtherTopic && /\b(catalogo|menu|carta|productos|servicios|opciones|que (venden|tienen|ofrecen|manejan)|precios?|cuanto)\b/.test(norm)) {
      return `¡Con gusto! ¿De qué producto o servicio te cuento el precio?${categoriesText} Dime el nombre y te doy el dato exacto. 😊`;
    }

    return `Ese dato no lo tengo registrado, así que te lo confirma un asesor del equipo en un momento 🙏${categoriesText} Mientras tanto, dime qué producto te interesa y te doy el precio exacto.`;
  }

  if (!isSales) {
    return `¡Hola! En ${busName} te asesoramos con gusto en ${busCategory}. ¿Para qué día y hora te gustaría agendar tu cita? 📅`;
  }

  return `¡Hola! En ${busName} estamos para asesorarte en ${busCategory}. ¿Qué necesidad puntual te gustaría consultar hoy? 😊`;
};

// ─── 6. Función principal RAG + Groq ─────────────────────────────────────────
const { getCachedAiResponse, setCachedAiResponse, normalizeText } = require('./aiCache');

// options (solo catálogos grandes, ver services/catalogContext.js): { catalogTotal, categories, sample,
// searchProducts(terms, opts), similarProducts(id, limit), listCategory(cat, limit) }, más
// contactPhoneUnknown, busySlots y catalogPdf (el PDF que el bot puede enviar, o null). Sin options, `products` es el catálogo completo.
const askGroq = async (userMessage, business, knowledge, chatHistory = [], products = [], options = {}) => {
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

    // Catálogo grande → se busca en SQL lo que pide el cliente; si no, el catálogo completo ya está en `products`
    const largeCatalog = typeof options?.searchProducts === 'function';
    let catalogProducts = products;
    let catalogInfo = null;
    let subQueries;
    // "El catálogo", "la lista", "qué más hay": se entrega la categoría completa, sin buscar ni gastar IA
    const browseInfo = isBrowseRequest(userMessage)
      ? await buildBrowse({ userMessage, history: formattedHistory, products, options }).catch(() => null)
      : null;
    if (browseInfo) {
      subQueries = [];
      catalogProducts = browseInfo.list;
      if (largeCatalog) {
        catalogInfo = { total: options.catalogTotal, categories: options.categories || [], noMatch: false, mode: 'browse', orden: 'precio_asc', contextProducts: [] };
      }
    } else if (largeCatalog) {
      const found = await retrieveFromLargeCatalog({ userMessage, business: safeBusiness, history: formattedHistory, knowledge, options });
      subQueries = found.subQueries;
      catalogInfo = { total: options.catalogTotal, categories: options.categories || [], noMatch: found.noMatch, mode: found.mode, orden: found.orden, contextProducts: found.contextProducts || [] };
      // Los productos "de contexto" (de los que ya se hablaba) también cuentan como vistos: respaldan precios y fotos
      catalogProducts = [...found.products, ...catalogInfo.contextProducts];
    } else {
      subQueries = await getSubQueries(userMessage, safeBusiness, formattedHistory, knowledge, products);
    }
    const relevantKnowledge = await ragSearch(userMessage, knowledge, safeBusiness, formattedHistory, subQueries);
    const systemPrompt = buildSystemPrompt(safeBusiness, relevantKnowledge, knowledge, catalogProducts, isFirstMessage, userMessage, subQueries, hasAlreadyGreeted, catalogInfo, Boolean(options.contactPhoneUnknown), Array.isArray(options.busySlots) ? options.busySlots : [], browseInfo, options.catalogPdf || null);

    // Total de un pedido: se recalcula con precios reales. En catálogo grande el producto del pedido
    // puede no estar en lo recuperado este turno, así que se busca por su nombre.
    const reconcileWithCatalog = async (order) => {
      if (!order || typeof order !== 'object') return order;
      let known = catalogProducts;
      if (largeCatalog && (order.producto || order.items)) {
        try {
          const rows = await options.searchProducts(extractSearchTerms([order.producto || order.items]), { limit: 5 });
          if (rows?.length) known = [...rows, ...catalogProducts];
        } catch (_) {}
      }
      return reconcileOrderTotal(order, known);
    };

    const messages = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory.slice(-8).map(m => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    // Purga cualquier bloque <think> completo o truncado
    const stripThink = (t) => (t || '')
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/<\/?think>/gi, '')
      .trim();

    let fullReply = null;
    let tokensUsed = 0;
    // Una lista de hasta BROWSE_MAX productos no cabe en el tope normal sin quedar cortada
    const replyMaxTokens = browseInfo?.list?.length ? 550 : 350;

    const response = await chatComplete({
      messages,
      max_tokens: replyMaxTokens,
      temperature: 0.25,
      // Si el modelo solo gastó tokens pensando, la respuesta queda vacía: probar el siguiente
      accept: (text) => isUsableReply(stripThink(text)),
    });
    if (response) {
      fullReply = stripThink(response.content);
      tokensUsed = response.tokens;
      console.log(`[IA] ✅ Respuesta generada con ${response.provider}:${response.model}`);
    }

    // ── Verificación anti-invención: todo valor en dinero debe salir de lo configurado ──
    let groundingBlocked = false;
    if (fullReply) {
      const groundingCtx = {
        products: catalogProducts,
        knowledge,
        business: safeBusiness,
        texts: [userMessage, ...formattedHistory.map(m => m.content)],
        allowZero: safeBusiness?.name === 'BotWA' || safeBusiness?.id === '8fd9a59d-77d7-4db7-8637-9aaebca1158e',
      };
      // Valores en dinero Y códigos de modelo: todo lo que el bot afirma tiene que salir del negocio
      const verifyAll = (text) => {
        const amounts = verifyReplyAmounts(text, groundingCtx);
        const codes = verifyReplyCodes(text, groundingCtx);
        // Una cita que el modelo confirma debe poder agendarse: día abierto, dentro del horario, no pasada, no ocupada
        const slots = [];
        for (const name of ['NUEVA_CITA', 'MODIFICAR_CITA']) {
          const tag = parseJsonTag(text, name);
          if (tag?.fecha && tag?.hora) {
            const slot = validateSlot(safeBusiness, tag.fecha, tag.hora, { busy: options.busySlots || [] });
            if (!slot.ok) slots.push(slot.reason);
          }
        }
        return {
          ok: amounts.ok && codes.ok && slots.length === 0,
          amounts: amounts.invalid, codes: codes.invalid, slots,
          invalid: [...amounts.invalid, ...codes.invalid, ...slots],
        };
      };
      let check = verifyAll(fullReply);
      if (!check.ok && largeCatalog) {
        // El producto de un pedido en curso puede no estar en lo buscado este turno: se ubica por
        // lo que se habló antes en la conversación y se vuelve a verificar, sin gastar otra llamada a la IA.
        try {
          const recent = formattedHistory.slice(-4).map(m => m.content);
          const extra = await options.searchProducts(extractSearchTerms([...recent, userMessage]).slice(0, 10), { limit: 8 });
          if (extra?.length) {
            groundingCtx.products = [...extra, ...catalogProducts];
            check = verifyAll(fullReply);
          }
        } catch (_) {}
      }
      if (!check.ok) {
        console.warn(`[GROUNDING] ⚠️ Datos sin respaldo en la respuesta: ${check.invalid.join(', ')} → reintentando una vez`);
        const listed = [
          ...check.amounts.map(v => `$${v.toLocaleString('es-CO')}`),
          ...check.codes.map(c => `"${c}"`),
        ].join(', ');
        const slotsNote = check.slots.length
          ? `\nLa cita que confirmaste NO se puede agendar: ${check.slots.join('; ')}. No la confirmes ni añadas la etiqueta de cita: explícale al cliente con amabilidad por qué y ofrécele otro día y hora válidos dentro del horario.`
          : '';
        const correction = `\n\n## CORRECCIÓN OBLIGATORIA${listed ? `\nTu respuesta anterior mencionó datos que NO están registrados en el negocio: ${listed}. Responde de nuevo SIN inventar, calcular ni cambiar nada: copia los nombres, referencias y precios EXACTOS del catálogo o de la base de conocimiento; si no tienes el dato, di que lo confirmas con un asesor.` : ''}${slotsNote}`;
        const retry = await chatComplete({
          messages: [{ role: 'system', content: systemPrompt + correction }, ...messages.slice(1)],
          max_tokens: replyMaxTokens,
          temperature: 0.1,
          accept: (text) => isUsableReply(stripThink(text)),
        });
        if (retry) {
          tokensUsed += retry.tokens || 0;
          fullReply = stripThink(retry.content);
          check = verifyAll(fullReply);
        }
        if (!retry || !check.ok) {
          console.warn('[GROUNDING] 🛑 El reintento sigue con valores sin respaldo: se deriva a un asesor');
          groundingBlocked = true;
          fullReply = check.slots.length && !check.amounts.length && !check.codes.length
            ? 'Ese horario no lo puedo confirmar yo: un asesor del equipo te lo confirma en un momento 🙏 Si quieres, dime otro día y hora y lo reviso.'
            : 'Ese dato te lo confirmo con un asesor del equipo en un momento 🙏 ¿Mientras tanto, te ayudo con algo más del catálogo?';
        }
      }
    }

    // Sin respuesta, o con una que queda en nada una vez quitadas las etiquetas internas
    const usedFallback = !fullReply || !isUsableReply(fullReply);
    // Contadores para /api/debug/version: permiten ver desde fuera cuánto responde la emergencia
    try {
      const pool = require('./llmPool');
      if (usedFallback) pool.recordOutcome?.('fallbacks');
      if (groundingBlocked) pool.recordOutcome?.('blocked');
    } catch (_) {}
    if (usedFallback) {
      fullReply = buildHumanAssistantReply(userMessage, safeBusiness, catalogProducts, chatHistory, knowledge);
    }

    // Doble sanitización de seguridad para etiquetas internas y tags de razonamiento
    fullReply = (fullReply || '')
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/<\/?think>/gi, '')
      .trim();

    const isLeadHotFlag = fullReply.includes('[LEAD_CALIENTE]');
    const imageMatch = fullReply.match(/\[ENVIAR_IMAGEN:\s*(.+?)\]/i);
    const imageName = imageMatch ? imageMatch[1].trim() : null;
    // Solo cuenta si el negocio tiene PDF: si no, la etiqueta se borra y no pasa nada
    const sendCatalog = Boolean(options.catalogPdf) && /\[\s*ENVIAR_CATALOGO\s*\]?/i.test(fullReply);

    // Las etiquetas se leen aunque el modelo olvide el "]" final o la respuesta quede cortada
    const newAppointmentData = parseJsonTag(fullReply, 'NUEVA_CITA');
    const cancelAppointmentData = parseJsonTag(fullReply, 'CANCELAR_CITA');
    const clientData = parseJsonTag(fullReply, 'DATOS_CLIENTE');
    const modifyAppointmentData = parseJsonTag(fullReply, 'MODIFICAR_CITA');

    let newOrderData = null;
    const rawOrder = parseJsonTag(fullReply, 'NUEVO_PEDIDO');
    if (rawOrder) {
      try {
        // El total se recalcula con los precios reales del catálogo: el del modelo no se guarda a ciegas
        newOrderData = await reconcileWithCatalog(rawOrder);
      } catch (_) {}
    }

    let modifyOrderData = null;
    const rawModifyOrder = parseJsonTag(fullReply, 'MODIFICAR_PEDIDO');
    if (rawModifyOrder) {
      try {
        modifyOrderData = await reconcileWithCatalog(rawModifyOrder);
      } catch (_) {}
    }

    // Cancelar un pedido (no marca al cliente como interesado, pero sí es una acción: no se cachea)
    const cancelOrderData = parseJsonTag(fullReply, 'CANCELAR_PEDIDO');

    const isLeadHot = isLeadHotFlag || Boolean(newAppointmentData) || Boolean(newOrderData) || Boolean(clientData) || Boolean(cancelAppointmentData) || Boolean(modifyAppointmentData) || Boolean(modifyOrderData);

    const reply = stripInternalTags(fullReply);

    // Guardar respuesta en caché Redis/RAM para consumo 0 tokens en siguientes consultas iguales.
    // Solo respuestas informativas: una que crea pedido o cita lleva datos de ESE cliente y no
    // puede entregarse a otro que escriba lo mismo.
    if (reply && isFirstOrIsolated && !usedFallback && !groundingBlocked && !isLeadHot && !cancelOrderData) {
      setCachedAiResponse(safeBusiness?.id, userMessage, {
        reply,
        isLeadHot,
        imageName,
        sendCatalog,
        ragChunksUsed: relevantKnowledge.length,
      }).catch(() => {});
    }

    return {
      reply,
      isLeadHot,
      tokensUsed,
      imageName,
      sendCatalog,
      newAppointmentData,
      cancelAppointmentData,
      modifyAppointmentData,
      newOrderData,
      modifyOrderData,
      cancelOrderData,
      clientData,
      ragChunksUsed: relevantKnowledge.length,
      usedFallback,
      groundingBlocked,
      // Productos que el bot tuvo a la vista este turno (para enviar la foto del que mencionó)
      productsUsed: catalogProducts,
      // Para "Probar bot": qué vio y qué modelo respondió
      debugInfo: {
        catalogMode: browseInfo ? `lista completa (${browseInfo.mode}${browseInfo.category ? `: ${browseInfo.category}` : ''})` : largeCatalog ? (catalogInfo?.mode === 'sample' ? 'muestra del catálogo (búsqueda SQL)' : 'búsqueda SQL') : 'catálogo en memoria',
        subQueries: subQueries || [],
        noMatch: Boolean(catalogInfo?.noMatch),
        aiModel: response ? `${response.provider}:${response.model}` : null,
      },
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
      cancelAppointmentData: null,
      modifyAppointmentData: null,
      newOrderData: null,
      modifyOrderData: null,
      cancelOrderData: null,
      clientData: null,
      ragChunksUsed: 0,
      usedFallback: true,
    };
  }
};

module.exports = { askGroq, ragSearch, searchKnowledge, rankAndFilterProducts, shouldExpandWithLLM, buildVocabulary, getSubQueries, extractSearchTerms, retrieveFromLargeCatalog, detectCategory, buildBrowse, isBrowseRequest, buildSystemPrompt };
