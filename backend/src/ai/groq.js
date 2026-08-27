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
const buildKnowledgeContext = (knowledge) => {
  if (!knowledge?.length) return null;

  return knowledge.map((k, i) => {
    if (k.type === 'faq') return `[FAQ ${i+1}]\nPregunta: ${k.title}\nRespuesta: ${k.content}`;
    if (k.type === 'image') return `[PRODUCTO/IMAGEN ${i+1}: ${k.title}]\n${k.content}${k.file_url ? `\nURL: ${k.file_url}` : ''}`;
    return `[INFO ${i+1}: ${k.title}]\n${k.content}`;
  }).join('\n\n---\n\n');
};

// ─── 5. System prompt con info del negocio ────────────────────────────────────
const buildSystemPrompt = (business, relevantKnowledge, allKnowledge, products = [], isFirstMessage = true) => {
  const relevantContext = buildKnowledgeContext(relevantKnowledge);
  const hasKnowledge = !!relevantContext;

  const hasProducts = Array.isArray(products) && products.length > 0;
  const productsContext = hasProducts
    ? products.map(p => `- [${p.category || 'General'}] ${p.name}: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}`).join('\n')
    : null;

  const isSales = business.main_goal !== 'agendar_citas';
  const mainGoalText = isSales
    ? 'VENDER Y CERRAR VENTAS PERSUASIVAMENTE. Responde las preguntas destacando el valor, resolviendo dudas y empujando sutilmente al cliente a elegir un plan/servicio o concretar la compra.'
    : 'AGENDAR CITAS Y RESERVAS. Atiende todas las dudas del cliente con cortesía, e invita a agendar su cita o reservar horario.';

  const greetingInstruction = isFirstMessage
    ? `PRIMERA INTERACCIÓN: Saluda amablemente al cliente (ej: "${business.greeting_msg || '¡Hola! Te damos la bienvenida a ' + (business.name || 'BotWA')}") y atiende su duda inicial.`
    : `CONVERSACIÓN EN CURSO: El cliente YA está conversando contigo. NUNCA repitas la bienvenida ni digas "¡Hola! Bienvenido a...". Responde DIRECTAMENTE a lo que pregunta y avanza en el proceso de venta.`;

  const businessInfo = `
Nombre del Negocio: ${business.name || 'BotWA'}
Tipo / Categoría: ${business.category || 'Soluciones de Inteligencia Artificial para WhatsApp'}
Ciudad: ${business.city || 'Colombia'}
${business.description ? `Descripción / Servicios: ${business.description}` : 'Plataforma SaaS de bots de WhatsApp con Inteligencia Artificial para responder clientes 24/7, aumentar ventas y agendar citas automáticamente.'}
Horario de Atención: ${business.active_hours_start || '08:00'} - ${business.active_hours_end || '18:00'}
${business.phone ? `Teléfono de Contacto: ${business.phone}` : ''}
${business.address ? `Dirección Física: ${business.address}` : ''}
${business.payment_or_booking_link ? `Enlace o Método de Pago/Agenda: ${business.payment_or_booking_link}` : ''}
`.trim();

  return `Eres un VENDEDOR ESTRELLA, experto, persuasivo y muy atento en WhatsApp del negocio "${business.name || 'BotWA'}".

=== ROL Y OBJETIVO DE VENTAS ===
${mainGoalText}
Tono de voz: ${business.bot_personality || 'persuasivo, cercano, profesional y entusiasta'}.

=== CONFIGURACIÓN DEL NEGOCIO ===
${businessInfo}

=== ESTADO DEL CHAT ===
${greetingInstruction}

${hasProducts
  ? `=== CATÁLOGO DE PRODUCTOS / PLANES Y PRECIOS ===\n${productsContext}\n=== FIN DEL CATÁLOGO ===`
  : ''
}

${hasKnowledge
  ? `=== BASE DE CONOCIMIENTO (FAQS E INFORMACIÓN RELEVANTE) ===\n${relevantContext}\n=== FIN DE LA INFORMACIÓN ===`
  : ''
}

=== ESTRATEGIA DE VENTAS Y EMBUDO DE CONVERSIÓN ===
1. PREGUNTAS SOBRE QUÉ ES O CÓMO FUNCIONA ("Qué es eso", "A sí cómo", "De qué se trata"):
   - Explica brevemente y con impacto el beneficio principal (ej: automatiza la atención 24/7 de tu negocio, responde dudas de tus clientes al instante y cierra ventas sin que tengas que estar pegado al celular).
   - Menciona las opciones o planes principales disponibles.
   - Cierra con una pregunta orientada a la acción (ej: "¿Te gustaría ver una demostración o conocer nuestros planes de $120.000 y $250.000?").

2. PREGUNTAS DE PRECIOS O PLANES ("Cuánto cuesta", "Precios", "Planes"):
   - Cotiza exactamente con los precios oficiales del catálogo.
   - Pide amablemente su Nombre y el Nombre de su Negocio para ayudarle a activar su bot o enviar el enlace de pago.
   - Añade la etiqueta [LEAD_CALIENTE] al final de tu mensaje cuando el cliente pida precios o muestre interés directo.

REGLAS ESTRICTAS:
1. SIEMPRE responde a la pregunta concreta del usuario. NUNCA respondas con frases vacías como "¿En qué te puedo ayudar hoy?" si el cliente hizo una pregunta específica.
2. NUNCA inventes precios o servicios no listados.
3. SIEMPRE mantén respuestas concisas, dinámicas (máximo 4 líneas) y con 1 o 2 emojis.
4. NUNCA repitas el saludo de bienvenida si la conversación ya está iniciada.`;
};

// ─── Respuesta Asistente Humana (Fallback Sin Excusas Técnicas) ─────────────
const buildHumanAssistantReply = (userMessage, business, products = [], chatHistory = []) => {
  const busName = business?.name || 'BotWA';
  const validHistory = Array.isArray(chatHistory) ? chatHistory.filter(m => m && m.content) : [];
  const hasHistory = validHistory.length > 1;

  const greeting = (!hasHistory && business?.greeting_msg) ? business.greeting_msg : '';

  if (Array.isArray(products) && products.length > 0) {
    const top = products.map(p => `• *${p.name}*: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}`).join('\n');
    if (greeting) {
      return `${greeting}\n\nCon gusto te presento nuestros productos y planes disponibles:\n\n${top}\n\n¿Deseas cotizar o adquirir alguno?`;
    }
    return `Con gusto te presento nuestros productos y planes disponibles:\n\n${top}\n\n¿Cuál de nuestros planes se adapta mejor a tu negocio?`;
  }

  if (greeting) {
    return `${greeting} Te ayudamos a automatizar tus ventas por WhatsApp 24/7. ¿Te gustaría conocer nuestros planes o ver cómo funciona?`;
  }

  return `En ${busName} te ayudamos a responder clientes 24/7 y cerrar ventas automáticamente por WhatsApp. ¿Te gustaría conocer nuestros planes o probar el servicio?`;
};

// ─── 6. Función principal RAG + Groq ─────────────────────────────────────────
const askGroq = async (userMessage, business, knowledge, chatHistory = [], products = []) => {
  const safeBusiness = business || {
    name: 'Asistente Virtual',
    category: 'General',
    city: 'Colombia',
    bot_personality: 'amigable, profesional, atento y experto',
  };

  try {
    const validHistory = Array.isArray(chatHistory) ? chatHistory.filter(m => m && m.content) : [];
    
    let formattedHistory = validHistory;
    if (formattedHistory.length > 0) {
      const lastMsg = formattedHistory[formattedHistory.length - 1];
      if (lastMsg.direction === 'inbound' && lastMsg.content.trim().toLowerCase() === userMessage.trim().toLowerCase()) {
        formattedHistory = formattedHistory.slice(0, -1);
      }
    }

    const isFirstMessage = formattedHistory.length === 0;

    const relevantKnowledge = await ragSearch(userMessage, knowledge);
    const systemPrompt = buildSystemPrompt(safeBusiness, relevantKnowledge, knowledge, products, isFirstMessage);

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
