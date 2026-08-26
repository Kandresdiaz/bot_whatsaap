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

  // Info general del negocio siempre disponible
  const businessInfo = `
Nombre: ${business.name}
Tipo / Categoría: ${business.category || 'Negocio'}
Ciudad: ${business.city || 'Colombia'}
${business.description ? `Descripción / Servicios: ${business.description}` : ''}
Horario de Atención: ${business.active_hours_start || '08:00'} - ${business.active_hours_end || '18:00'}
${business.phone ? `Teléfono: ${business.phone}` : ''}
${business.address ? `Dirección: ${business.address}` : ''}
${business.payment_or_booking_link ? `Enlace / Método de Cierre (${isSales ? 'Pago/Catálogo' : 'Agenda'}): ${business.payment_or_booking_link}` : ''}
${business.closing_objective ? `Instrucción de Cierre: ${business.closing_objective}` : ''}
`.trim();

  return `Eres el empleado estrella y asistente virtual oficial en WhatsApp de "${business.name}".

=== ROL Y OBJETIVO PRINCIPAL ===
${mainGoalText}
Tu tono de voz: ${business.bot_personality || 'amigable, profesional y persuasivo'}.

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

REGLAS ABSOLUTAS (NO LAS ROMPES NUNCA POR NINGÚN MOTIVO):
1. Eres un EMPLEADO VIRTUAL FIDEL: Atiendes cualquier pregunta de atención al cliente con amabilidad, pero SIEMPRE mantienes el enfoque en CERRAR al cliente (${isSales ? 'Vender/Cotizar' : 'Agendar cita'}).
2. PRECISIÓN TOTAL DE PRODUCTOS Y PRECIOS: SOLO puedes cotizar, recomendar o mencionar los productos y servicios presentes en el CATÁLOGO OFICIAL de arriba. NUNCA inventes productos, platillos, promociones ni precios.
3. Si el usuario pregunta por un producto que NO está en el catálogo, responde amablemente: "Por el momento no ofrecemos [producto], pero con gusto te puedo recomendar: [opción disponible del catálogo]."
4. Si no tienes la información exacta sobre algo, responde amablemente: "Esa información no la tengo a la mano, pero con gusto te conecto con nuestro equipo para ayudarte 😊".
5. Si hay una imagen aplicable en el catálogo, escribe: [ENVIAR_IMAGEN: nombre_exacto]
6. Si el cliente muestra intención clara de comprar, pagar o agendar, incluye al final: [LEAD_CALIENTE]
7. Respuestas breves, directas y profesionales (máximo 4 líneas).
8. Usa máximo 1 o 2 emojis por mensaje.
9. Saluda solo en el primer mensaje de la conversación.
10. Si te preguntan sobre temas ajenos al negocio (política, chistes, etc.), redirige respetuosamente de vuelta a los servicios del negocio.`;
};

// ─── 6. Función principal RAG + Groq ─────────────────────────────────────────
const askGroq = async (userMessage, business, knowledge, chatHistory = [], products = []) => {
  try {
    // RAG: buscar los chunks más relevantes con multi-query
    const relevantKnowledge = await ragSearch(userMessage, knowledge);

    const systemPrompt = buildSystemPrompt(business, relevantKnowledge, knowledge, products);

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
    console.error('[Groq] Error completo:', err.message, err.stack);
    const busName = business?.name || 'nuestro negocio';
    const fallbackText = business?.greeting_msg || `¡Hola! 👋 Te damos la bienvenida a ${busName}. ¿En qué te podemos colaborar hoy?`;
    return {
      reply: fallbackText,
      isLeadHot: false,
      tokensUsed: 0,
      imageName: null,
      ragChunksUsed: 0,
    };
  }
};

module.exports = { askGroq, ragSearch, searchKnowledge };
