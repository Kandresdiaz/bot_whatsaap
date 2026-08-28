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

// ─── 1. RAG: Buscar chunks relevantes de la knowledge base ───────────────────
const searchKnowledge = (query, knowledge) => {
  if (!knowledge?.length) return [];

  const queryWords = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);

  const scored = knowledge.map(item => {
    const text = `${item.title} ${item.content}`.toLowerCase();
    const score = queryWords.reduce((acc, word) => {
      if (item.title.toLowerCase().includes(word)) return acc + 2;
      if (text.includes(word)) return acc + 1;
      return acc;
    }, 0);
    return { ...item, score };
  });

  return scored
    .filter(i => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};

// ─── 2. Generar sub-consultas para encontrar más contexto ────────────────────
const generateSubQueries = async (userMessage) => {
  const client = getGroqClient();
  if (!client) return [userMessage];

  try {
    const models = await getActiveModels(client);
    const modelToUse = models[0] || 'groq/compound';

    const response = await client.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: `Eres un asistente que genera consultas de búsqueda.
Dado un mensaje de usuario, genera 2-3 sub-consultas alternativas que ayuden a buscar información relevante en una base de conocimiento.
Responde SOLO con las sub-consultas separadas por "|", sin numeración ni explicación.`
        },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 80,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content || '';
    const queries = raw.split('|').map(q => q.trim()).filter(q => q.length > 0);
    return queries.length > 0 ? queries : [userMessage];
  } catch (e) {
    return [userMessage];
  }
};

// ─── 3. RAG Multi-Query ───────────────────────────────────────────────────────
const ragSearch = async (userMessage, knowledge) => {
  if (!knowledge?.length) return [];

  const subQueries = await generateSubQueries(userMessage);
  const allQueries = [userMessage, ...subQueries];

  const seenIds = new Set();
  const allResults = [];

  for (const query of allQueries) {
    const results = searchKnowledge(query, knowledge);
    for (const item of results) {
      if (!seenIds.has(item.id || item.title)) {
        seenIds.add(item.id || item.title);
        allResults.push(item);
      }
    }
  }

  return allResults
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 6);
};

// ─── 4. Formatear contexto RAG ────────────────────────────────────────────────
const isSimpleGreeting = (text) => {
  if (!text || typeof text !== 'string') return false;
  const norm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
  const greetings = ['hola', 'buenas', 'bueno dia', 'buenos dias', 'buenas tarde', 'buenas tardes', 'buenas noche', 'buenas noches', 'hola buenas', 'hola que mas', 'que mas'];
  return greetings.includes(norm) || norm.length <= 4;
};

const rankAndFilterProducts = (query, products) => {
  if (!Array.isArray(products) || products.length <= 10) return products || [];
  if (!query || typeof query !== 'string') return products.slice(0, 10);

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return products.slice(0, 10);

  const scored = products.map(item => {
    const text = `${item.name} ${item.category} ${item.description}`.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (item.name.toLowerCase().includes(word)) score += 3;
      if ((item.category || '').toLowerCase().includes(word)) score += 2;
      if (text.includes(word)) score += 1;
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
    if (k.type === 'faq') return `[FAQ ${i+1}]\nPregunta: ${k.title}\nRespuesta: ${k.content}`;
    if (k.type === 'image') return `[PRODUCTO/IMAGEN ${i+1}: ${k.title}]\n${k.content}${k.file_url ? `\nURL: ${k.file_url}` : ''}`;
    return `[INFO ${i+1}: ${k.title}]\n${k.content}`;
  }).join('\n\n---\n\n');
};

// ─── 5. System prompt con info del negocio ────────────────────────────────────
const buildSystemPrompt = (business, relevantKnowledge, allKnowledge, products = [], isFirstMessage = true, userMessage = '') => {
  const busName = business?.name || 'BotWA';
  const busCategory = business?.category || 'Atención Comercial y Servicios';
  const busCity = business?.city || 'Colombia';
  const busGoal = business?.main_goal || 'vender';
  const isSales = busGoal !== 'agendar_citas';
  const personality = business?.bot_personality || 'persuasivo, cercano, profesional y entusiasta';

  const relevantContext = buildKnowledgeContext(relevantKnowledge);
  const hasKnowledge = !!relevantContext;

  const filteredProducts = rankAndFilterProducts(userMessage, products);
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
🚨 REGLA DE ORO INQUEBRANTABLE: ENFOQUE 100% EN "${busName}" (CERO DESVIACIONES / ZERO OFF-TOPIC)
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

=== ESTRATEGIA COMERCIAL Y CIERRE ===
1. ASESORÍA OFICIAL:
   - Responde siempre basado en la información, productos y base de conocimiento de "${busName}".
   - Si el cliente pregunta por precios o servicios, entrégale las opciones disponibles con claridad, precisión y amabilidad.

2. CIERRE DE VENTA O AGENDAMIENTO:
   - Cuando el cliente confirme que desea comprar, contratar o agendar ("me interesa", "lo quiero", "cómo compro", "dónde pago", "quiero agendar"):
     * Guíalo con entusiasmo al siguiente paso.
     * Si existe enlace de pago o reserva (${business?.payment_or_booking_link || 'disponible'}), compártelo para facilitar su compra o cita.
     * Si se procesa manualmente o por transferencia, solicita con amabilidad sus datos necesarios (ej. Nombre completo, confirmación del pedido).
     * Añade la etiqueta [LEAD_CALIENTE] al final de tu mensaje para alertar al panel del negocio.

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

    const relevantKnowledge = await ragSearch(userMessage, knowledge);
    const systemPrompt = buildSystemPrompt(safeBusiness, relevantKnowledge, knowledge, products, isFirstMessage, userMessage);

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

    const isLeadHot = fullReply.includes('[LEAD_CALIENTE]');
    const imageMatch = fullReply.match(/\[ENVIAR_IMAGEN:\s*(.+?)\]/i);
    const imageName = imageMatch ? imageMatch[1].trim() : null;

    const reply = fullReply
      .replace('[LEAD_CALIENTE]', '')
      .replace(/\[ENVIAR_IMAGEN:[^\]]+\]/gi, '')
      .trim();

    // Guardar respuesta en caché Redis/RAM para consumo 0 tokens en siguientes consultas iguales
    if (reply && isFirstOrIsolated) {
      setCachedAiResponse(safeBusiness?.id, userMessage, {
        reply,
        isLeadHot,
        imageName,
        ragChunksUsed: relevantKnowledge.length,
      }).catch(() => {});
    }

    return { reply, isLeadHot, tokensUsed, imageName, ragChunksUsed: relevantKnowledge.length };
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
      ragChunksUsed: 0,
    };
  }
};

module.exports = { askGroq, ragSearch, searchKnowledge };
