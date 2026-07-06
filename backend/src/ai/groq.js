const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const buildKnowledgeContext = (knowledge) => {
  if (!knowledge?.length) return null;

  return knowledge.map((k) => {
    if (k.type === 'faq') return `PREGUNTA FRECUENTE:\nP: ${k.title}\nR: ${k.content}`;
    if (k.type === 'image') return `IMAGEN/PRODUCTO [${k.title}]:\nDescripción: ${k.content}\nURL imagen: ${k.file_url || 'sin url'}`;
    return `[${k.title.toUpperCase()}]:\n${k.content}`;
  }).join('\n\n---\n\n');
};

const buildSystemPrompt = (business, knowledge) => {
  const knowledgeText = buildKnowledgeContext(knowledge);

  const hasKnowledge = !!knowledgeText;

  return `Eres el asistente de WhatsApp de "${business.name}" (${business.category || 'negocio'} en ${business.city || 'Colombia'}).
Tu tono es: ${business.bot_personality || 'amigable y profesional'}.

${hasKnowledge ? `=== INFORMACIÓN OFICIAL DEL NEGOCIO ===
${knowledgeText}
=== FIN DE LA INFORMACIÓN ===` : '=== AÚN NO HAY INFORMACIÓN CARGADA DEL NEGOCIO ==='}

REGLAS ESTRICTAS (MUY IMPORTANTE):
1. SOLO responde con información que esté TEXTUALMENTE en la sección "INFORMACIÓN OFICIAL DEL NEGOCIO".
2. Si te preguntan algo que NO está en esa información, di EXACTAMENTE: "Esa información no la tengo disponible, pero puedo comunicarte con alguien del equipo para que te ayude 😊"
3. NUNCA inventes precios, fechas, disponibilidad ni ningún dato.
4. NUNCA digas que tienes información que no tienes.
5. Si hay una imagen disponible para el producto preguntado, indica: [ENVIAR_IMAGEN: nombre_del_producto]
6. Respuestas cortas y claras, máximo 4 líneas.
7. Si el cliente menciona querer comprar, contratar, pagar o agendar, escribe al final: [LEAD_CALIENTE]
8. Usa emojis con moderación, máximo 2 por mensaje.
9. Habla en español natural colombiano.
10. Saluda solo si es el primer mensaje del historial.`;
};

const askGroq = async (userMessage, business, knowledge, chatHistory = []) => {
  try {
    const systemPrompt = buildSystemPrompt(business, knowledge);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-8).map((m) => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: 350,
      temperature: 0.3, // MUY bajo para evitar alucinaciones
    });

    const fullReply = response.choices[0]?.message?.content || 
      'Disculpa, no puedo responder en este momento. Intenta de nuevo en un momento 🙏';
    const tokensUsed = response.usage?.total_tokens || 0;

    const isLeadHot = fullReply.includes('[LEAD_CALIENTE]');
    // Detectar si hay imagen para enviar
    const imageMatch = fullReply.match(/\[ENVIAR_IMAGEN:\s*(.+?)\]/i);
    const imageName = imageMatch ? imageMatch[1].trim() : null;

    // Limpiar marcadores del mensaje visible
    const reply = fullReply
      .replace('[LEAD_CALIENTE]', '')
      .replace(/\[ENVIAR_IMAGEN:[^\]]+\]/gi, '')
      .trim();

    return { reply, isLeadHot, tokensUsed, imageName };
  } catch (err) {
    console.error('Error con Groq:', err.message);
    return {
      reply: 'Disculpa, tengo un problema técnico momentáneo. Por favor intenta de nuevo en unos minutos 🙏',
      isLeadHot: false,
      tokensUsed: 0,
      imageName: null,
    };
  }
};

module.exports = { askGroq };
