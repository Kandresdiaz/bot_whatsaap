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

    // Coincidencia por palabras individuales
    for (const word of queryWords) {
      if (normTitle.includes(word)) score += item.type === 'faq' ? 4 : 3;
      if (normContent.includes(word)) score += 1.5;
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
const generateSubQueries = async (userMessage, business = null) => {
  const client = getGroqClient();
  if (!client) return [userMessage];

  const busName = business?.name || 'Negocio';
  const busCategory = business?.category || 'Atención y Servicios';
  const busGoal = business?.main_goal || 'vender';

  try {
    const models = await getActiveModels(client);
    const modelToUse = models[0] || 'groq/compound';

    const response = await client.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: `Eres un motor de búsqueda RAG para la base de conocimiento y catálogo del negocio "${busName}" (Giro: ${busCategory}, Objetivo: ${busGoal}).
Dado el mensaje de un cliente de WhatsApp, genera de 2 a 3 consultas o términos clave alternativos (sinónimos comerciales, productos relacionados, dudas frecuentes o intención de compra/agenda) para buscar en la base de datos.
Responde ÚNICAMENTE con las consultas separadas por "|", sin texto adicional ni números.`
        },
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
const ragSearch = async (userMessage, knowledge, business = null) => {
  if (!knowledge?.length) return [];

  const subQueries = await generateSubQueries(userMessage, business);
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

    let score = 0;
    for (const word of allWords) {
      if (normName.includes(word)) score += 4;
      if (normCat.includes(word)) score += 2.5;
      if (normDesc.includes(word)) score += 1;
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
const buildSystemPrompt = (business, relevantKnowledge, allKnowledge, products = [], isFirstMessage = true, userMessage = '', subQueries = []) => {
  const busName = business?.name || 'BotWA';
  const busCategory = business?.category || 'Atención Comercial y Servicios';
  const busCity = business?.city || 'Colombia';
  const busGoal = business?.main_goal || 'vender';
  const isSales = busGoal !== 'agendar_citas';
  const personality = business?.bot_personality || 'persuasivo, cercano, profesional y entusiasta';

  const relevantContext = buildKnowledgeContext(relevantKnowledge);
  const hasKnowledge = !!relevantContext;

  const filteredProducts = rankAndFilterProducts(userMessage, products, subQueries);
  const hasProducts = Array.isArray(filteredProducts) && filteredProducts.length > 0;
  const productsContext = hasProducts
    ? filteredProducts.map(p => `- [${p.category || 'General'}] ${p.name}: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}${p.image_url ? ` | Foto/Imagen: ${p.image_url}` : ''}`).join('\n')
    : null;

  const mainGoalText = isSales
    ? `ASESORAR Y VENDER LOS PRODUCTOS O SERVICIOS DE "${busName}". Responde dudas comerciales con entusiasmo y cercanía, presenta las opciones del catálogo oficial y guía al cliente hacia la compra o pedido.`
    : `ASESORAR Y AGENDAR CITAS O RESERVAS PARA "${busName}". Atiende todas las dudas del cliente con cortesía e invítalo a agendar su cita, horario o turno disponible.`;

  const isGreetingOnly = isFirstMessage && isSimpleGreeting(userMessage);

  const greetingInstruction = isGreetingOnly
    ? `PRIMERA INTERACCIÓN (SALUDO SIMPLE): El cliente solo saludó. Usa EXACTAMENTE su mensaje de saludo configurado: "${business?.greeting_msg || '¡Hola! 👋 Te damos la bienvenida a ' + busName + '. ¿En qué te podemos ayudar hoy?'}" y pregúntale en qué le puedes colaborar. NO muestres el catálogo completo de precios todavía a menos que lo pida.`
    : isFirstMessage
    ? `PRIMERA INTERACCIÓN (CON PREGUNTA): Saluda brevemente con "${business?.greeting_msg || '¡Hola! Bienvenido a ' + busName}" y responde directamente a la consulta del cliente sobre el negocio.`
    : `CONVERSACIÓN EN CURSO: El cliente YA está en conversación contigo. NUNCA repitas la bienvenida ni digas "¡Hola! Bienvenido a...". Responde DIRECTAMENTE y avanza con agilidad.`;

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

================================================================================
🚨 REGLA DE ORO #1: ENFOQUE 100% EN "${busName}" (CERO DESVIACIONES / ZERO OFF-TOPIC)
================================================================================
1. TU IDENTIDAD Y LÍMITES ESTRICTOS DE DOMINIO:
   - Representas ÚNICA Y EXCLUSIVAMENTE al negocio "${busName}" (${busCategory}).
   - Tu labor es atender, responder preguntas, brindar precios, asesorar y cerrar ventas o agendar citas de los servicios y productos de "${busName}".
   - ⛔ PROHIBICIÓN TOTAL: NO eres un asistente de inteligencia artificial para preguntas generales, NO eres ChatGPT, NO eres Google, NO eres una enciclopedia, NO eres asesor gastronómico/cocinero (a menos que "${busName}" sea expresamente un restaurante y esté en su catálogo), NO resuelves tareas escolares ni de matemáticas, NO hablas de deportes, política, chismes, farándula ni cultura general.
   - ⛔ ESTÁ ESTRICTAMENTE PROHIBIDO dar respuestas informativas sobre temas que no pertenezcan al negocio "${busName}".

2. CÓMO REACCIONAR ANTE PREGUNTAS AJENAS, BROMAS O DISTRACTORES (EMPATÍA + REORIENTACIÓN OBLIGATORIA):
   - Si el cliente te pregunta sobre temas ajenos al negocio (por ejemplo: recetas, comidas ajenas, noticias, deportes, chistes, problemas personales o tareas):
     * 1) Muestra empatía, calidez y buen humor en UNA frase corta (1 sola línea).
     * 2) En esa MISMA respuesta, aclara con amabilidad que tu labor en "${busName}" es atender consultas sobre "${busCategory}", y pregúntale de inmediato cómo le puedes asesorar con los servicios o productos de "${busName}".
     * ⛔ NUNCA te quedes hablando del tema ajeno ni des listas o explicaciones fuera de "${busName}".

   EJEMPLOS OBLIGATORIOS DE REORIENTACIÓN PARA "${busName}":
   - Si el cliente pregunta: "¿Qué pizzas son ricas?" (o cualquier comida no vendida por ${busName}):
     ❌ MAL (PROHIBIDO): "¡Claro! Las mejores pizzas son Margarita, Pepperoni, Hawaiana..."
     ✅ BIEN (CORRECTO): "¡Jaja, suena delicioso! 🍕 Pero aquí en ${busName} soy tu asesor especializado en ${busCategory}. ¿En qué te puedo asesorar hoy sobre nuestros servicios/planes?"

   - Si el cliente pregunta: "¿Quién es el mejor futbolista del mundo?" (o temas de deportes/noticias):
     ❌ MAL (PROHIBIDO): "Messi y Cristiano Ronaldo son los mejores porque..."
     ✅ BIEN (CORRECTO): "¡Un debate legendario! ⚽ Aunque aquí en ${busName} estoy 100% enfocado en ayudarte con ${busCategory}. ¿Qué información te gustaría cotizar o consultar?"

   - Si el cliente pide ayuda con una tarea o cálculo:
     ❌ MAL (PROHIBIDO): Resolver el problema o dar la fórmula.
     ✅ BIEN (CORRECTO): "¡Uff, recuerdos del colegio! 📚 Pero aquí en ${busName} mi especialidad es brindarte la mejor atención en ${busCategory}. ¿Te gustaría conocer nuestros servicios?"

================================================================================
🚨 REGLAS CRÍTICAS DE ANTI-ALUCINACIÓN Y FIDELIDAD A LA INFORMACIÓN (ZERO HALLUCINATION)
================================================================================
1. VERACIDAD ABSOLUTA EN PRECIOS Y PRODUCTOS:
   - Solo puedes ofrecer los productos, planes o servicios que aparezcan en el === CATÁLOGO OFICIAL === o en la Base de Conocimiento.
   - NUNCA inventes precios, descuentos, características técnicas o productos inexistentes.
   - Si el cliente solicita un producto o servicio que no está listado, dile con cortesía: "Por el momento no contamos con ese producto/servicio específico en nuestro catálogo de ${busName}, pero con gusto te puedo ofrecer [mencionar alternativa del catálogo si existe]."

2. FIDELIDAD A PREGUNTAS FRECUENTES (FAQs) Y BASE DE CONOCIMIENTO:
   - Cuando el cliente haga una pregunta cuya respuesta esté en el bloque === BASE DE CONOCIMIENTO (FAQS E INFORMACIÓN DEL NEGOCIO) ===, responde utilizando con precisión la información oficial autorizada, redactándola en un tono natural, amable y fluido para WhatsApp.
   - Si una pregunta del cliente NO se encuentra respondida en la base de datos ni en el catálogo, NO inventes una respuesta; indícale con amabilidad que consultarás con el equipo de ${busName} para confirmarle el dato exacto.

=== PERSONALIDAD Y TONO DE VOZ ===
Tono configurado: ${personality}.

=== DATOS DEL NEGOCIO CONFIGURADO ===
${businessInfo}

=== ESTADO DE LA CONVERSACIÓN ===
${greetingInstruction}

${hasProducts
  ? `=== CATÁLOGO OFICIAL DE PRODUCTOS / SERVICIOS Y PRECIOS DISPONIBLES ===\n${productsContext}\n=== FIN DEL CATÁLOGO ===`
  : `=== CATÁLOGO DE PRODUCTOS / SERVICIOS ===\nEl negocio atiende en el área de ${busCategory}. ${business?.description ? business.description : 'Consulta al cliente qué servicio o producto específico requiere para brindarle asesoría personalizada.'}\n=== FIN DEL CATÁLOGO ===`
}

${hasKnowledge
  ? `=== BASE DE CONOCIMIENTO (FAQS E INFORMACIÓN DEL NEGOCIO) ===\n${relevantContext}\n=== FIN DE LA INFORMACIÓN ===`
  : ''
}

=== ESTRATEGIA DE CIERRE PERSUASIVO Y CAPTURA DE DATOS (CONVERSIÓN Y CITAS) ===
Tu rol es actuar como un asesor comercial y de atención de alto nivel. Cada interacción debe avanzar con empatía hacia un cierre concreto sin ser invasivo:

1. POLÍTICAS DE META Y PREVENCIÓN DE BANEOS (CERO SPAM / HUMANIZACIÓN):
   - Nunca seas insistente, agresivo o desesperado ("no ser intenso").
   - Mantén un tono cordial, servicial, consultivo y profesional.
   - Responde SIEMPRE de forma directa (máximo 3 a 4 líneas por mensaje).
   - Termina SIEMPRE con UN SOLO llamado a la acción (CTA) claro en forma de pregunta amable.

${isSales ? `2. PROCESO DE CIERRE DE VENTAS PARA "${busName}":
   - PASO 1 (Asesorar y presentar): Explica los beneficios clave del producto o plan adecuado del catálogo oficial de "${busName}" con su precio exacto en $ COP.
   - PASO 2 (Pregunta de cierre): Invita al cliente a tomar una decisión con una pregunta suave y persuasiva.
     * Ejemplos: "¿Te gustaría apartar tu pedido hoy mismo?", "¿Prefieres cancelar por transferencia bancaria o en línea?", "¿Te parece bien si tomamos tus datos para coordinar la entrega?"
   - PASO 3 (Toma de datos para cerrar): Solicita los datos necesarios de forma ordenada:
     1. Nombre completo
     2. Ciudad / Dirección de entrega (o Correo si es servicio digital)
     3. Método de pago preferido (o comparte el enlace: ${business?.payment_or_booking_link || 'disponible'})
   - PASO 4 (Confirmación y registro): Cuando el cliente confirme la compra o entregue sus datos, felicítalo con calidez por su elección, confirma el resumen y añade al final de tu respuesta:
     [LEAD_CALIENTE]
     [DATOS_CLIENTE: {"nombre": "Nombre Cliente", "producto": "Producto Confirmado", "ciudad": "Ciudad/Dirección", "metodo_pago": "Método de Pago"}]`
: `2. PROCESO DE AGENDAMIENTO DE CITAS / RESERVAS PARA "${busName}":
   - PASO 1 (Identificar servicio): Confirma con amabilidad qué servicio del catálogo requiere.
   - PASO 2 (Coordinar fecha y hora): Pregunta qué día y hora le queda más conveniente, dentro de los horarios de atención (${business?.active_hours_start || '08:00'} a ${business?.active_hours_end || '20:00'}).
     * Ejemplos: "¿Qué día de esta semana te quedaría mejor?", "¿Te apartamos el turno para el jueves en la mañana o en la tarde?"
   - PASO 3 (Toma de datos para apartar el cupo): Pide con cortesía su Nombre completo para registrar la reserva en la agenda.
   - PASO 4 (Confirmación y registro): Al confirmar día, hora y nombre, dale una confirmación alegre y oficial ("¡Listo [Nombre]! Te hemos agendado para [Servicio] el [Fecha] a las [Hora] en ${busName} 🎉") e incluye al final:
     [LEAD_CALIENTE]
     [NUEVA_CITA: {"nombre": "Nombre Cliente", "servicio": "Servicio Agendado", "fecha": "YYYY-MM-DD", "hora": "HH:MM:SS"}]`}

3. ENVÍO DE FOTOS O IMÁGENES:
   - Si el cliente solicita fotos o imágenes de un producto listado que cuente con foto, incluye al final de tu respuesta la etiqueta EXACTA: [ENVIAR_IMAGEN: Nombre del Producto].

=== REGLAS DE ORO EN WHATSAPP ===
1. Responde de forma directa, ágil y concisa (máximo 3 a 4 líneas por mensaje) con 1 o 2 emojis apropiados.
2. NUNCA inventes información, precios o condiciones que no existan en el catálogo o configuración.
3. NUNCA repitas el saludo de bienvenida si ya estás conversando activamente con el cliente.
4. Mantén SIEMPRE la lealtad y el enfoque comercial exclusivo de "${busName}".`;
};

// ─── Respuesta Asistente Humana (Fallback Sin Excusas Técnicas) ─────────────
const buildHumanAssistantReply = (userMessage, business, products = [], chatHistory = []) => {
  const busName = business?.name || 'BotWA';
  const busCategory = business?.category || 'nuestros servicios';
  const isSales = business?.main_goal !== 'agendar_citas';
  const validHistory = Array.isArray(chatHistory) ? chatHistory.filter(m => m && m.content) : [];
  const hasHistory = validHistory.length > 1;

  if (!hasHistory && isSimpleGreeting(userMessage)) {
    return business?.greeting_msg || `¡Hola! 👋 Te damos la bienvenida a ${busName}. ¿En qué te podemos ayudar hoy?`;
  }

  if (Array.isArray(products) && products.length > 0) {
    const top = products.slice(0, 4).map(p => `• *${p.name}*: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}`).join('\n');
    return `¡Con gusto te comparto nuestras opciones disponibles en ${busName}!\n\n${top}\n\n¿Cuál de estas opciones te gustaría consultar o adquirir? 😊`;
  }

  if (!isSales) {
    return `¡Hola! En ${busName} te ayudamos con ${busCategory}. ¿Te gustaría consultar disponibilidad para agendar tu cita o servicio? 📅`;
  }

  return `¡Hola! En ${busName} estamos para brindarte la mejor atención en ${busCategory}. ¿En qué te podemos asesorar hoy sobre nuestros servicios? 😊`;
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

    const subQueries = await generateSubQueries(userMessage, safeBusiness);
    const relevantKnowledge = await ragSearch(userMessage, knowledge, safeBusiness);
    const systemPrompt = buildSystemPrompt(safeBusiness, relevantKnowledge, knowledge, products, isFirstMessage, userMessage, subQueries);

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
            max_tokens: 400,
            temperature: 0.2,
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

    const clientDataMatch = fullReply.match(/\[DATOS_CLIENTE:\s*(\{[\s\S]*?\})\]/i);
    let clientData = null;
    if (clientDataMatch) {
      try {
        clientData = JSON.parse(clientDataMatch[1]);
      } catch (_) {}
    }

    const isLeadHot = isLeadHotFlag || Boolean(newAppointmentData) || Boolean(clientData);

    const reply = fullReply
      .replace(/\[LEAD_CALIENTE\]/gi, '')
      .replace(/\[ENVIAR_IMAGEN:[^\]]+\]/gi, '')
      .replace(/\[NUEVA_CITA:[^\]]+\]/gi, '')
      .replace(/\[DATOS_CLIENTE:[^\]]+\]/gi, '')
      .trim();

    // Guardar respuesta en caché Redis/RAM para consumo 0 tokens en siguientes consultas iguales
    if (reply && isFirstOrIsolated) {
      setCachedAiResponse(safeBusiness?.id, userMessage, {
        reply,
        isLeadHot,
        imageName,
        newAppointmentData,
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

module.exports = { askGroq, ragSearch, searchKnowledge };
