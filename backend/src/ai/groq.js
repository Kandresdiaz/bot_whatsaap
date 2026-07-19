const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Modelos disponibles en Groq ─────────────────────────────────────────────
const MODEL_FAST = 'llama-3.1-8b-instant';   // rápido, para búsqueda
const MODEL_SMART = 'llama-3.3-70b-versatile'; // inteligente, para respuesta final

// ─── 1. RAG: Buscar chunks relevantes de la knowledge base ───────────────────
// Búsqueda semántica simple por palabras clave (sin embeddings externos)
const searchKnowledge = (query, knowledge) => {
  if (!knowledge?.length) return [];

  const queryWords = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);

  // Score por coincidencia de palabras clave
  const scored = knowledge.map(item => {
    const text = `${item.title} ${item.content}`.toLowerCase();
    const score = queryWords.reduce((acc, word) => {
      // Peso doble si está en el título
      if (item.title.toLowerCase().includes(word)) return acc + 2;
      if (text.includes(word)) return acc + 1;
      return acc;
    }, 0);
    return { ...item, score };
  });

  // Devolver los top 5 más relevantes (score > 0)
  return scored
    .filter(i => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};

// ─── 2. Generar sub-consultas para encontrar más contexto ────────────────────
const generateSubQueries = async (userMessage) => {
  try {
    const response = await groq.chat.completions.create({
      model: MODEL_FAST,
      messages: [
        {
          role: 'system',
          content: `Eres un asistente que genera consultas de búsqueda.
Dado un mensaje de usuario, genera 2-3 sub-consultas alternativas que ayuden a buscar información relevante en una base de conocimiento.
Responde SOLO con las sub-consultas separadas por "|", sin numeración ni explicación.
Ejemplo: "precio pizza|costo pizza margherita|cuánto vale la pizza"`
        },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 80,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content || '';
    return raw.split('|').map(q => q.trim()).filter(q => q.length > 0);
  } catch (e) {
    // Si falla, simplemente usar la consulta original
    return [userMessage];
  }
};

// ─── 3. RAG Multi-Query: buscar con consulta original + sub-consultas ────────
const ragSearch = async (userMessage, knowledge) => {
  if (!knowledge?.length) return [];

  // Generar sub-consultas en paralelo
  const subQueries = await generateSubQueries(userMessage);
  const allQueries = [userMessage, ...subQueries];

  // Buscar con cada consulta y unir resultados únicos
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

  // Ordenar por score y tomar top 6
  return allResults
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 6);
};

// ─── 4. Formatear contexto RAG para el prompt ─────────────────────────────────
const buildKnowledgeContext = (knowledge) => {
  if (!knowledge?.length) return null;

  return knowledge.map((k, i) => {
    if (k.type === 'faq') return `[FAQ ${i+1}]\nPregunta: ${k.title}\nRespuesta: ${k.content}`;
    if (k.type === 'image') return `[PRODUCTO/IMAGEN ${i+1}: ${k.title}]\n${k.content}${k.file_url ? `\nURL: ${k.file_url}` : ''}`;
    return `[INFO ${i+1}: ${k.title}]\n${k.content}`;
  }).join('\n\n---\n\n');
};

// ─── 5. System prompt con toda la info del negocio ───────────────────────────
const buildSystemPrompt = (business, relevantKnowledge, allKnowledge) => {
  const relevantContext = buildKnowledgeContext(relevantKnowledge);
  const hasKnowledge = !!relevantContext;

  // Info general del negocio siempre disponible
  const businessInfo = `
Nombre: ${business.name}
Tipo: ${business.category || 'negocio'}
Ciudad: ${business.city || 'Colombia'}
Horario: ${business.active_hours_start || '8:00'} - ${business.active_hours_end || '18:00'}
${business.phone ? `Teléfono: ${business.phone}` : ''}
${business.address ? `Dirección: ${business.address}` : ''}
`.trim();

  return `Eres el asistente de WhatsApp de "${business.name}".
Tu personalidad: ${business.bot_personality || 'amigable, profesional y conciso'}.

=== DATOS DEL NEGOCIO ===
${businessInfo}

${hasKnowledge
  ? `=== INFORMACIÓN RELEVANTE ENCONTRADA ===\n${relevantContext}\n=== FIN DE LA INFORMACIÓN ===`
  : `=== NOTA: No encontré información específica sobre este tema en la base de conocimiento ===`
}

REGLAS ABSOLUTAS (no las rompes NUNCA):
1. SOLO usa información que esté en las secciones de arriba. JAMÁS inventes datos.
2. Si no tienes la información, di: "Esa información no la tengo disponible, pero puedo conectarte con alguien del equipo 😊"
3. NUNCA inventes precios, disponibilidad, fechas o servicios no mencionados.
4. Si hay imagen disponible para el producto, escribe: [ENVIAR_IMAGEN: nombre_exacto]
5. Si el cliente quiere comprar, pagar, agendar o contratar, escribe al final: [LEAD_CALIENTE]
6. Respuestas cortas (máximo 4 líneas). WhatsApp no es email.
7. Usa emojis con moderación (máximo 2 por mensaje).
8. Español natural. Saluda solo si es el primer mensaje.
9. Si te preguntan algo fuera del negocio (chistes, política, etc), redirige amablemente.`;
};

// ─── 6. Función principal RAG + Groq ─────────────────────────────────────────
const askGroq = async (userMessage, business, knowledge, chatHistory = []) => {
  try {
    // RAG: buscar los chunks más relevantes con multi-query
    const relevantKnowledge = await ragSearch(userMessage, knowledge);

    const systemPrompt = buildSystemPrompt(business, relevantKnowledge, knowledge);

    // Historial de conversación (últimos 8 intercambios)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-8).map(m => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    // Intentar con modelo inteligente, fallback a rápido
    let response;
    try {
      response = await groq.chat.completions.create({
        model: MODEL_SMART,
        messages,
        max_tokens: 400,
        temperature: 0.2, // muy bajo para evitar alucinaciones
      });
    } catch (modelErr) {
      // Fallback al modelo rápido si el inteligente falla
      console.warn('[Groq] Fallback a modelo fast:', modelErr.message);
      response = await groq.chat.completions.create({
        model: MODEL_FAST,
        messages,
        max_tokens: 350,
        temperature: 0.2,
      });
    }

    const fullReply = response.choices[0]?.message?.content ||
      'Disculpa, no puedo responder en este momento. Intenta de nuevo en un momento 🙏';
    const tokensUsed = response.usage?.total_tokens || 0;

    // Detectar marcadores especiales
    const isLeadHot = fullReply.includes('[LEAD_CALIENTE]');
    const imageMatch = fullReply.match(/\[ENVIAR_IMAGEN:\s*(.+?)\]/i);
    const imageName = imageMatch ? imageMatch[1].trim() : null;

    // Limpiar marcadores del mensaje visible
    const reply = fullReply
      .replace('[LEAD_CALIENTE]', '')
      .replace(/\[ENVIAR_IMAGEN:[^\]]+\]/gi, '')
      .trim();

    return { reply, isLeadHot, tokensUsed, imageName, ragChunksUsed: relevantKnowledge.length };
  } catch (err) {
    console.error('[Groq] Error:', err.message);
    return {
      reply: 'Disculpa, tengo un problema técnico momentáneo. Por favor intenta de nuevo en unos minutos 🙏',
      isLeadHot: false,
      tokensUsed: 0,
      imageName: null,
      ragChunksUsed: 0,
    };
  }
};

module.exports = { askGroq, ragSearch, searchKnowledge };
