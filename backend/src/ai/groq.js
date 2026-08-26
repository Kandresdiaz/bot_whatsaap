const Groq = require('groq-sdk');

const CANDIDATE_MODELS = [
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
  'llama-3.2-11b-vision-preview',
  'llama-3.2-3b-preview',
  'llama-3.2-1b-preview',
  'deepseek-r1-distill-llama-70b',
  'qwen-2.5-coder-32b'
];

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
    const response = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
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
const buildSystemPrompt = (business, relevantKnowledge, allKnowledge, products = []) => {
  const relevantContext = buildKnowledgeContext(relevantKnowledge);
  const hasKnowledge = !!relevantContext;

  const hasProducts = Array.isArray(products) && products.length > 0;
  const productsContext = hasProducts
    ? products.map(p => `- [${p.category || 'General'}] ${p.name}: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}`).join('\n')
    : null;

  const isSales = business.main_goal === 'vender';
  const isBooking = business.main_goal === 'agendar_citas';
  const mainGoalText = isSales
    ? 'VENDER Y CERRAR COMPRAS. Atiende todas las dudas del cliente con cortesía, y guía sutilmente la conversación hacia concretar la venta o pago.'
    : isBooking
    ? 'AGENDAR CITAS Y RESERVAS. Atiende todas las dudas del cliente con cortesía, e invita a agendar su cita o reservar horario.'
    : 'ATENCIÓN AL CLIENTE Y CIERRE DE LEADS.';

  const businessInfo = `
Nombre: ${business.name || 'Nuestro Negocio'}
Tipo / Categoría: ${business.category || 'Negocio'}
Ciudad: ${business.city || 'Colombia'}
${business.description ? `Descripción / Servicios: ${business.description}` : ''}
Horario de Atención: ${business.active_hours_start || '08:00'} - ${business.active_hours_end || '18:00'}
${business.phone ? `Teléfono: ${business.phone}` : ''}
${business.address ? `Dirección: ${business.address}` : ''}
${business.payment_or_booking_link ? `Enlace / Método de Cierre: ${business.payment_or_booking_link}` : ''}
`.trim();

  return `Eres el empleado estrella y asistente virtual oficial en WhatsApp de "${business.name || 'nuestro negocio'}".

=== ROL Y OBJETIVO PRINCIPAL ===
${mainGoalText}
Tu tono de voz: ${business.bot_personality || 'amigable, profesional, atento y persuasivo'}.

=== DATOS DEL NEGOCIO ===
${businessInfo}

${hasProducts
  ? `=== CATÁLOGO OFICIAL DE PRODUCTOS Y SERVICIOS DISPONIBLES ===\n${productsContext}\n=== FIN DEL CATÁLOGO ===`
  : ''
}

${hasKnowledge
  ? `=== INFORMACIÓN ADICIONAL ENCONTRADA (KNOWLEDGE BASE) ===\n${relevantContext}\n=== FIN DE LA INFORMACIÓN ===`
  : ''
}

REGLAS ABSOLUTAS:
1. Eres un EMPLEADO VIRTUAL FIDEL: Atiendes cualquier pregunta con amabilidad y mantienes el enfoque en atender al cliente.
2. PRECISIÓN TOTAL: SOLO cotizas productos/servicios de tu negocio. NUNCA inventes productos ni precios.
3. Si no tienes la información exacta, responde amablemente indicando que consultarás con el equipo.
4. Respuestas breves, directas y profesionales (máximo 4 líneas). Usa máximo 1 o 2 emojis por mensaje.`;
};

// ─── Respuesta Asistente Humana (Sin Excusas Técnicas) ───────────────────────
const buildHumanAssistantReply = (userMessage, business, products = []) => {
  const busName = business?.name || 'nuestro negocio';
  const greeting = business?.greeting_msg || `¡Hola! 👋 Te damos la bienvenida a ${busName}.`;

  if (Array.isArray(products) && products.length > 0) {
    const top = products.map(p => `• *${p.name}*: $${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'}${p.description ? ` (${p.description})` : ''}`).join('\n');
    return `${greeting}\n\nCon gusto te presento nuestros productos/servicios disponibles:\n\n${top}\n\n¿Deseas cotizar o adquirir alguno de nuestros planes?`;
  }

  return `${greeting} ¿En qué te puedo ayudar hoy? Con gusto te brindo toda la información que necesites.`;
};

// ─── 6. Función principal RAG + Groq ─────────────────────────────────────────
const askGroq = async (userMessage, business, knowledge, chatHistory = [], products = []) => {
  const safeBusiness = business || {
    name: 'Asistente Virtual',
    category: 'General',
    city: 'Medellín',
    bot_personality: 'amigable, profesional, atento y experto',
  };

  try {
    const relevantKnowledge = await ragSearch(userMessage, knowledge);
    const systemPrompt = buildSystemPrompt(safeBusiness, relevantKnowledge, knowledge, products);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-8).map(m => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const client = getGroqClient();
    let fullReply = null;
    let tokensUsed = 0;

    if (client) {
      for (const modelName of CANDIDATE_MODELS) {
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
            break;
          }
        } catch (modelErr) {
          console.warn(`[Groq] Modelo ${modelName} no disponible:`, modelErr.message);
        }
      }
    }

    if (!fullReply) {
      fullReply = buildHumanAssistantReply(userMessage, safeBusiness, products);
    }

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

    const reply = buildHumanAssistantReply(userMessage, safeBusiness, products);
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
