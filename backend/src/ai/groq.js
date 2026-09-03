const Groq = require('groq-sdk');

const CANDIDATE_MODELS = [
  'groq/compound',
  'groq/compound-mini',
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
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
    const all = (list.data || []).map(m => m.id);
    const validChatModels = all.filter(id =>
      !id.includes('whisper') &&
      !id.includes('guard') &&
      !id.includes('orpheus')
    );

    if (validChatModels.length > 0) {
      validChatModels.sort((a, b) => {
        const getPriority = (id) => {
          if (id.includes('groq/compound')) return 1;
          if (id.includes('qwen3.8')) return 2;
          if (id.includes('qwen3.6')) return 3;
          if (id.includes('qwen')) return 4;
          if (id.includes('allam')) return 5;
          if (id.includes('gpt-oss')) return 6;
          if (id.includes('llama-3.3')) return 7;
          if (id.includes('llama-3.1')) return 8;
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

// ─── 1. RAG: Buscar chunks relevantes de la knowledge base ───────────────────
const searchKnowledge = (query, knowledge) => {
  if (!knowledge?.length) return [];

  const normQuery = normalizeSearchText(query);
  const queryWords = normQuery.split(/\s+/).filter(w => w.length >= 2);
  if (queryWords.length === 0) return [];

  const scored = knowledge.map(item => {
    const normTitle = normalizeSearchText(item.title || '');
    const normContent = normalizeSearchText(item.content || '');

    let score = 0;
    // Coincidencia exacta de frase
    if (normTitle.includes(normQuery)) score += 8;
    if (normContent.includes(normQuery)) score += 4;

    const titleWords = normTitle.split(/\s+/);
    const contentWords = normContent.split(/\s+/);

    // Coincidencia por palabras individuales y similitud difusa (typos)
    for (const word of queryWords) {
      if (normTitle.includes(word)) {
        score += item.type === 'faq' ? 4 : 3;
      } else if (titleWords.some(tw => isFuzzyWordMatch(word, tw))) {
        score += item.type === 'faq' ? 3 : 2.2;
      }

      if (normContent.includes(word)) {
        score += 1.5;
      } else if (contentWords.some(cw => isFuzzyWordMatch(word, cw))) {
        score += 1.0;
      }
    }

    // Boost prioritario si es FAQ
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
    const modelToUse = models[0] || 'groq/compound';

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
const ragSearch = async (userMessage, knowledge, business = null, chatHistory = []) => {
  if (!knowledge?.length) return [];

  const subQueries = await generateSubQueries(userMessage, business, chatHistory);
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
    norm.split(/\s+/).filter(w => w.length >= 2).forEach(w => allWords.add(w));
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

const buildKnowledgeContext = (knowledge) => {
  if (!knowledge?.length) return null;

  return knowledge.map((k, i) => {
    if (k.type === 'faq') return `[PREGUNTA FRECUENTE (FAQ) OFICIAL ${i+1}]\nPregunta: ${k.title}\nRespuesta Autorizada: ${k.content}`;
    if (k.type === 'image') return `[PRODUCTO CON IMAGEN/FOTO ${i+1}: ${k.title}]\nDescripción: ${k.content}${k.file_url ? `\nURL Foto: ${k.file_url}` : ''}`;
    if (k.type === 'file') return `[GUÍA / DOCUMENTO ${i+1}: ${k.title}]\nContenido: ${k.content}`;
    return `[INFORMACIÓN OFICIAL ${i+1}: ${k.title}]\n${k.content}`;
  }).join('\n\n---\n\n');
};

// ─── 5. System prompt con info del negocio ────────────────────────────────────
const buildSystemPrompt = (business, relevantKnowledge, allKnowledge, products = [], isFirstMessage = true, userMessage = '', subQueries = [], hasAlreadyGreeted = false) => {
  const busName = business?.name || 'BotWA';
  const busCategory = business?.category || 'Atención Comercial y Servicios';
  const busCity = business?.city || 'Colombia';
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

  const relevantContext = buildKnowledgeContext(relevantKnowledge);
  const hasKnowledge = !!relevantContext;

  const filteredProducts = rankAndFilterProducts(userMessage, products, subQueries);
  const hasProducts = Array.isArray(filteredProducts) && filteredProducts.length > 0;
  const productsContext = hasProducts
    ? filteredProducts.map(p => `- [${p.category || 'General'}] ${p.name}: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}${p.image_url ? ` | Foto/Imagen: ${p.image_url}` : ''}`).join('\n')
    : null;

  const mainGoalText = isSales
    ? `ASESORAR Y VENDER LOS PRODUCTOS O SERVICIOS DE "${busName}". Responde dudas comerciales con entusiasmo y cercanía, presenta las opciones del catálogo oficial y guía al cliente hacia la compra o pedido de los productos o servicios del catálogo.`
    : `ASESORAR Y AGENDAR CITAS O RESERVAS PARA "${busName}". Atiende todas las dudas del cliente con cortesía, consulta el calendario y horarios disponibles e invítalo a agendar su cita o turno disponible (o venta de productos si lo solicita).`;

  const isGreetingOnly = isFirstMessage && !hasAlreadyGreeted && isSimpleGreeting(userMessage);

  const greetingInstruction = (hasAlreadyGreeted || !isFirstMessage)
    ? `CONVERSACIÓN EN CURSO (ESTRICTAMENTE PROHIBIDO SALUDAR): Ya estás en conversación activa con este cliente y el bot ya se presentó. ESTÁ 100% PROHIBIDO decir "¡Hola!", "Te damos la bienvenida a...", "Bienvenido a...", o volver a presentarte. Responde DIRECTAMENTE a lo que dijo el cliente sin ningún saludo ni introducción.`
    : isGreetingOnly
    ? `PRIMERA INTERACCIÓN (SOLO SALUDO): El cliente recién inicia la conversación diciendo hola. Responde amablemente con su saludo en máximo 2 a 3 líneas: "${business?.greeting_msg || '¡Hola! 👋 Te damos la bienvenida a ' + busName + '. ¿En qué te podemos ayudar hoy?'}" sin mostrar catálogo completo aún.`
    : `PRIMERA INTERACCIÓN (CON PREGUNTA DIRECTA): Di únicamente "¡Hola! 👋" y responde de inmediato a su consulta en menos de 4 líneas totales. NO pegues un discurso largo de bienvenida.`;

  const businessInfo = `
Nombre del Negocio: ${busName}
Categoría / Giro: ${busCategory}
Ubicación / Ciudad: ${busCity}
${business?.description ? `Descripción / Servicios: ${business.description}` : `Servicios y atención comercial oficial de ${busName}.`}
Horario de Atención: ${business?.active_hours_start || '08:00'} - ${business?.active_hours_end || '20:00'}
${business?.phone ? `Teléfono de Contacto: ${business.phone}` : ''}
${business?.address ? `Dirección Física: ${business.address}` : ''}
${business?.payment_or_booking_link ? `Enlace o Método de Pago / Agenda: ${business.payment_or_booking_link}` : ''}
`.trim();

  return `Eres el ASESOR Y VENDEDOR VIRTUAL OFICIAL Y EXCLUSIVO por WhatsApp del negocio "${busName}".
Tu misión principal es: ${mainGoalText}

=== 📅 FECHA Y HORA ACTUAL DEL SISTEMA (ZONA HORARIA ${tz}) ===
Hoy es: ${currentDateStr}
Fecha ISO actual: ${isoDateStr} (YYYY-MM-DD)
Hora actual: ${currentTimeStr}
Usa esta fecha para calcular con precisión días como "hoy", "mañana", "el jueves", "la próxima semana", etc.

================================================================================
📏 REGLA CRÍTICA #1: MENOS DE 5 LÍNEAS POR MENSAJE (CERO TEXTOS LARGOS)
================================================================================
1. LONGITUD OBLIGATORIA: Cada respuesta debe tener ESTRICTAMENTE MENOS DE 5 LÍNEAS (ideal 2 a 4 líneas). Prohibido escribir parrafadas, textos largos o respuestas que aburran al cliente en su celular.
2. ESTRUCTURA PERSUASIVA DIRECTA:
   - Línea 1-2: Respuesta directa, concisa y empática a lo que preguntó el cliente (con 1 emoji).
   - Línea 3: Beneficio clave, precio o solución del negocio.
   - Línea 4: Pregunta de cierre persuasiva que empuje a la acción (CTA).
3. CONSULTAS FUERA DE TEMA (ej: recetas, pizza, bromas, deportes, temas no relacionados al negocio):
   - NUNCA saludes de nuevo ni te presentes como un robot.
   - Responde con humor persuasivo en 2 líneas redirigiendo al negocio.
     Ejemplo: "😄 ¡Esa te la debo! Aquí en ${busName} mi especialidad es ayudarte con ${busCategory}. ¿En qué te puedo colaborar hoy?"

================================================================================
🤝 REGLA FUNDAMENTAL #2: ASESOR COMERCIAL CONSULTIVO (SEGUIR LA CUERDA Y PREGUNTAR ANTES DE SUPONER)
================================================================================
1. SEGUIRLE LA CUERDA AL CLIENTE (RAPPORT Y ESCUCHA ACTIVA):
   - Fluye con la vibra del cliente. Valida siempre lo que dice antes de responder.
   - ⛔ PROHIBIDO ESCUPIR CATÁLOGOS COMPLETOS O SOLTAR PRECIOS DE GOLPE sin saber qué busca el cliente. No suenes como un volante publicitario ni como un bot desesperado por vender.
   - Actúa como un asesor comercial humano de alto nivel: profesional, empático, atento y enfocado en escuchar, asesorar y entender primero.

2. PREGUNTAR ANTES DE SUPONER (DIAGNÓSTICO ANTES DE COTIZAR):
   - Si el cliente hace preguntas abiertas o informales (ej: "hola", "qué ofertas tienen?", "qué vendes?", "de qué se trata?", "cuéntame", "tienes servicios?", "ayuda"):
     * NO supongas lo que necesita ni le recites todo el catálogo de productos de una vez.
     * Explica brevemente en 1 sola línea a qué se dedica "${busName}" (${busCategory}) y HAZLE UNA PREGUNTA DE DIAGNÓSTICO para entender su necesidad:
       Ejemplo: "¡Hola! 👋 Con gusto te asesoro. En ${busName} somos especialistas en ${busCategory}. Para recomendarte la opción perfecta, cuéntame: ¿qué necesidad puntual te gustaría resolver o qué producto/servicio tienes en mente?"
   - Si el cliente YA pregunta por un producto, plan o servicio específico (o pide el precio de algo puntual):
     * Dale la respuesta concreta, el precio exacto del catálogo oficial en $ COP y el beneficio clave en 2 líneas.
     * Remata con una pregunta consultiva que avance hacia el cierre (ej: "¿Te gustaría apartar tu pedido o que te tomemos los datos de entrega?").

3. MEMORIA Y CONTINUIDAD DEL HILO CONVERSACIONAL:
   - Si el cliente habla con frases breves (ej: "el segundo", "el pro", "el del medio", "el más económico", "qué incluye", "cuál es la diferencia?", "y si se acaban los mensajes?"):
     * Identifica INMEDIATAMENTE a qué opción del catálogo se refiere según el contexto y explícale con entusiasmo y claridad, sin evasivas ni repeticiones.

================================================================================
🚨 REGLAS CRÍTICAS DE ANTI-ALUCINACIÓN Y FIDELIDAD A LA INFORMACIÓN (ZERO HALLUCINATION)
================================================================================
1. VERACIDAD ABSOLUTA EN PRECIOS Y PRODUCTOS:
   - Solo puedes ofrecer los productos, planes o servicios que aparezcan explícitamente en el === CATÁLOGO OFICIAL === o en la Base de Conocimiento.
   - ⛔ ESTÁ TOTALMENTE PROHIBIDO INVENTAR: No inventes electrodomésticos, repuestos, comidas ni productos que no existan en el catálogo. Si el negocio no vende eso, dilo con amabilidad y enfócate en lo que sí ofrece "${busName}".
   - Si el cliente solicita un producto o servicio no listado, ofrece amablemente las alternativas reales disponibles en el catálogo o indica que un asesor humano lo verificará.

2. FIDELIDAD A PREGUNTAS FRECUENTES (FAQs):
   - Utiliza la información autorizada de la Base de Conocimiento para responder dudas sobre funcionamiento, requerimientos, garantías y métodos de pago.

=== PERSONALIDAD Y TONO DE VOZ ===
Tono configurado: ${personality} (cercano, consultivo, empático, seguro y enfocado en cerrar ventas o agendar citas).

=== DATOS DEL NEGOCIO CONFIGURADO ===
${businessInfo}

=== ESTADO DE LA CONVERSACIÓN ===
${greetingInstruction}

${business?.custom_instructions ? `=== REGLAS E INSTRUCCIONES PERSONALIZADAS DE LA EMPRESA (PROMPT) ===
${business.custom_instructions}
=== FIN DE REGLAS PERSONALIZADAS ===\n` : ''}
${categoriesOverview ? `${categoriesOverview}\n` : ''}
${hasProducts
  ? `=== CATÁLOGO OFICIAL DE PRODUCTOS / SERVICIOS Y PRECIOS DISPONIBLES ===\n${productsContext}\n=== FIN DEL CATÁLOGO ===`
  : `=== CATÁLOGO DE PRODUCTOS / SERVICIOS ===\nEl negocio atiende en el área de ${busCategory}. ${business?.description ? business.description : 'Consulta al cliente qué servicio o producto específico requiere para brindarle asesoría personalizada.'}\n=== FIN DEL CATÁLOGO ===`
}

${hasKnowledge
  ? `=== BASE DE CONOCIMIENTO (FAQS E INFORMACIÓN DEL NEGOCIO) ===\n${relevantContext}\n=== FIN DE LA INFORMACIÓN ===`
  : ''
}

=== ESTRATEGIA DE CIERRE PERSUASIVO Y CAPTURA DE DATOS (PEDIDOS Y CITAS) ===
Tu rol es actuar como un asesor comercial y cerrador de alto nivel. Conduce cada conversación hacia el cierre adecuado:

${business?.closing_instructions ? `=== INSTRUCCIONES ESPECÍFICAS DE CIERRE CONFIGURADAS POR EL DUEÑO ===
${business.closing_instructions}
Sigue estrictamente estas indicaciones sobre qué datos pedir o qué cuentas/métodos de pago indicar al cerrar.
=== FIN DE INSTRUCCIONES DE CIERRE ===\n` : ''}
1. POLÍTICAS DE META Y HUMANIZACIÓN (CERO SPAM):
   - Responde de forma directa, ágil y atractiva (ESTRICTAMENTE MENOS DE 5 LÍNEAS) con 1 o 2 emojis.
   - Termina SIEMPRE con UN SOLO llamado a la acción (CTA) claro y persuasivo.

2. PROCESO DE TOMA DE PEDIDOS Y VENTAS (${busName}):
   - Cuando el cliente decida comprar o contratar cualquier producto, plan o servicio del catálogo:
     1. Confirma el producto/plan y su precio en $ COP.
     2. Solicita con amabilidad los datos indispensables:
        • Nombre completo
        • Ciudad y Dirección de entrega (o correo si es servicio digital)
        • Cantidad y Método de pago preferido (${business?.payment_or_booking_link || 'Nequi / Bancolombia / Transferencia'}).
     3. Cuando el cliente entregue sus datos o confirme la compra, felicítalo con entusiasmo ("¡Excelente [Nombre]! Tu solicitud de [Producto] ha sido registrada con éxito ✨") e incluye SIEMPRE al final de tu respuesta:
        [LEAD_CALIENTE]
        [NUEVO_PEDIDO: {"nombre": "Nombre Cliente", "producto": "Producto Confirmado", "cantidad": 1, "total": 120000, "direccion": "Dirección completa", "ciudad": "Ciudad", "metodo_pago": "Nequi / Transferencia", "notas": "Detalles del pedido"}]
        [DATOS_CLIENTE: {"nombre": "Nombre Cliente", "producto": "Producto Confirmado", "ciudad": "Ciudad/Dirección", "metodo_pago": "Método de Pago"}]

3. PROCESO DE AGENDAMIENTO DE CITAS Y RESERVAS EN CALENDARIO (${busName}):
   - Cuando el cliente requiera un servicio presencial, cita o reserva:
     1. Usa la fecha actual (${isoDateStr}) para calcular fechas exactas (ej: "mañana", "el viernes", "el lunes").
     2. Horario de atención: ${business?.active_hours_start || '08:00'} a ${business?.active_hours_end || '20:00'}.
     3. Coordina qué día y hora prefiere dentro del horario hábil.
     4. Pide con cortesía su Nombre completo si aún no lo ha proporcionado.
     5. Al confirmar, felicítalo con entusiasmo ("¡Excelente [Nombre]! Te he reservado tu cita para [Servicio] el [Fecha] a las [Hora] 📅✨") e incluye SIEMPRE al final de tu respuesta:
        [LEAD_CALIENTE]
        [NUEVA_CITA: {"nombre": "Nombre Cliente", "servicio": "Servicio Agendado", "fecha": "YYYY-MM-DD", "hora": "HH:MM:00"}]

4. ENVÍO DE FOTOS O IMÁGENES:
   - Si el cliente solicita fotos o imágenes de un producto que tenga imagen_url en el catálogo, incluye al final de tu respuesta: [ENVIAR_IMAGEN: Nombre del Producto].

=== REGLAS DE ORO EN WHATSAPP ===
1. Responde de forma directa, ágil y concisa (ESTRICTAMENTE MENOS DE 5 LÍNEAS) con 1 o 2 emojis apropiados.
2. NUNCA inventes información o precios que no existan en el catálogo.
3. NUNCA repitas el saludo de bienvenida ni te presentes de nuevo si ya estás conversando activamente.
4. Conduce siempre al cliente con amabilidad hacia la compra, prueba gratis o agendamiento en el calendario.`;
};

// ─── Respuesta Asistente Humana (Fallback Contextual de Alto Nivel) ───────────
const buildHumanAssistantReply = (userMessage, business, products = [], chatHistory = []) => {
  const busName = business?.name || 'BotWA';
  const busCategory = business?.category || 'nuestros servicios';
  const isSales = business?.main_goal !== 'agendar_citas';
  const validHistory = Array.isArray(chatHistory) ? chatHistory.filter(m => m && m.content) : [];
  const hasHistory = validHistory.length > 0;
  const norm = normalizeSearchText(userMessage);

  // 1. Saludo simple inicial sin historial
  if (!hasHistory && isSimpleGreeting(userMessage)) {
    return business?.greeting_msg || `¡Hola! 👋 Te damos la bienvenida a ${busName}. ¿En qué te podemos asesorar hoy?`;
  }

  // 1.1 Consultas fuera de tema (recetas, pizza, bromas, tareas)
  if (norm.includes('pizza') || norm.includes('receta') || norm.includes('cocina') || norm.includes('chiste') || norm.includes('tarea')) {
    return `😄 ¡Esa te la debo! Mi especialidad es asesorarte y atender clientes 24/7 en ${busName}. ¿Te gustaría conocer cómo funciona para tu negocio?`;
  }

  const hasProds = Array.isArray(products) && products.length > 0;
  const isBotWASaaS = busName === 'BotWA' || (!hasProds && busCategory.includes('Consultoría'));

  if (isBotWASaaS) {
    // Consultas específicas del SaaS BotWA
    if (norm.includes('acaban') || norm.includes('limite') || norm.includes('tope') || norm.includes('mas mensajes')) {
      return `En ${busName} nunca dejas de atender. Si llegas al límite, pasas al plan superior pagando la diferencia o compras mensajes extra desde tu panel. ¿Activamos tus 7 días gratis ($0 hoy)? 😊`;
    }
    if (norm.includes('pro') || norm.includes('medio') || norm.includes('segundo') || norm.includes('foto')) {
      return `El *Plan Máquina de Ventas Pro ($249.000 COP/mes)* incluye fotos automáticas, agendador de citas/pedidos y hasta 5.000 msgs/mes con 7 días gratis ($0 hoy). ¿Te gustaría activarlo? 😊`;
    }
    if (norm.includes('basico') || norm.includes('starter') || norm.includes('primero') || norm.includes('economico')) {
      return `El *Plan Vendedor Automático ($120.000 COP/mes)* incluye catálogo 24/7, respuestas en <2s y hasta 1.500 msgs/mes con 7 días gratis ($0 hoy). ¿Deseas activarlo? 😊`;
    }
    if (norm.includes('prueba') || norm.includes('interesa') || norm.includes('activar') || norm.includes('empezar')) {
      return `¡Excelente! 🎉 Te conectamos en 10 minutos con 7 Días de Prueba Gratis ($0 COP hoy). ¿Cuál es el nombre de tu negocio y qué vendes? 😊 [LEAD_CALIENTE]`;
    }
  }

  // Para negocios con Catálogo de Productos / Servicios
  if (Array.isArray(products) && products.length > 0) {
    const matched = products.filter(p => norm.includes(p.name.toLowerCase()));
    if (matched.length > 0) {
      const top = matched.slice(0, 3).map(p => `• *${p.name}*: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}`).join('\n');
      return `¡Con gusto! Contamos con las siguientes opciones disponibles en ${busName}:\n\n${top}\n\n¿Te gustaría apartar tu pedido o que coordinemos los detalles? 😊`;
    }

    return `¡Hola! 👋 Con gusto te asesoro. En ${busName} nos especializamos en ${busCategory}. Cuéntame, ¿qué producto o servicio específico estás buscando el día de hoy? 😊`;
  }

  if (!isSales) {
    return hasHistory
      ? `Horario de atención: ${business?.active_hours_start || '08:00'} a ${business?.active_hours_end || '20:00'}. ¿Qué día y hora te queda bien para tu cita? 📅`
      : `¡Hola! En ${busName} te atendemos en ${busCategory}. Horario: ${business?.active_hours_start || '08:00'} a ${business?.active_hours_end || '20:00'}. ¿Qué día y hora te gustaría reservar? 📅`;
  }

  return hasHistory
    ? `Con gusto te colaboro en ${busCategory}. ¿Qué producto, repuesto o duda específica tienes? 😊`
    : `¡Hola! En ${busName} estamos para brindarte la mejor atención en ${busCategory}. ¿En qué te podemos colaborar hoy? 😊`;
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
    const directFaq = knowledge.find(k =>
      k.type === 'faq' &&
      k.title &&
      normalizeText(k.title) === normQuery
    );
    if (directFaq && directFaq.content) {
      console.log(`[RAG FAQ] ⚡ Coincidencia directa de FAQ: "${directFaq.title}" (0 tokens gastados)`);
      return {
        reply: directFaq.content,
        isLeadHot: false,
        tokensUsed: 0,
        imageName: null,
        newAppointmentData: null,
        clientData: null,
        ragChunksUsed: 1,
      };
    }
  }

  // ── 1. Caché Redis / RAM (Solo para preguntas aisladas sin historial previo) ──
  const validHistory = Array.isArray(chatHistory) ? chatHistory.filter(m => m && m.content) : [];
  const isFirstOrIsolated = validHistory.length === 0;

  if (isFirstOrIsolated && normQuery.length > 5) {
    try {
      const cached = await getCachedAiResponse(safeBusiness?.id, userMessage);
      if (cached && cached.reply) {
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

    const hasAlreadyGreeted = formattedHistory.some(m => m.direction === 'outbound');
    const isFirstMessage = !hasAlreadyGreeted && formattedHistory.length === 0;

    const subQueries = await generateSubQueries(userMessage, safeBusiness, formattedHistory);
    const relevantKnowledge = await ragSearch(userMessage, knowledge, safeBusiness, formattedHistory);
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
            max_tokens: 150,
            temperature: 0.25,
          });

          if (response?.choices?.[0]?.message?.content) {
            fullReply = response.choices[0].message.content;
            tokensUsed = response.usage?.total_tokens || 0;
            console.log(`[Groq] ✅ Respuesta IA generada con modelo: ${modelName}`);
            break;
          }
        } catch (modelErr) {
          console.warn(`[Groq] Modelo ${modelName} no disponible:`, modelErr.message);
        }
      }
    }

    if (!fullReply) {
      fullReply = buildHumanAssistantReply(userMessage, safeBusiness, products, chatHistory);
    }

    // Sanitizar etiquetas internas y tags <think> de modelos de razonamiento
    fullReply = fullReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

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

    const isLeadHot = isLeadHotFlag || Boolean(newAppointmentData) || Boolean(newOrderData) || Boolean(clientData);

    const reply = fullReply
      .replace(/\[LEAD_CALIENTE\]/gi, '')
      .replace(/\[ENVIAR_IMAGEN:[^\]]+\]/gi, '')
      .replace(/\[NUEVA_CITA:[^\]]+\]/gi, '')
      .replace(/\[NUEVO_PEDIDO:[^\]]+\]/gi, '')
      .replace(/\[DATOS_CLIENTE:[^\]]+\]/gi, '')
      .trim();

    // Guardar respuesta en caché Redis/RAM para consumo 0 tokens en siguientes consultas iguales
    if (reply && isFirstOrIsolated) {
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
      newOrderData,
      clientData,
      ragChunksUsed: relevantKnowledge.length
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

    const reply = buildHumanAssistantReply(userMessage, safeBusiness, products, chatHistory);
    return {
      reply,
      isLeadHot: false,
      tokensUsed: 0,
      imageName: null,
      newAppointmentData: null,
      clientData: null,
      ragChunksUsed: 0,
    };
  }
};

module.exports = { askGroq, ragSearch, searchKnowledge, rankAndFilterProducts };
