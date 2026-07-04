const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const buildKnowledgeContext = (knowledge) => {
  if (!knowledge?.length) return 'No hay información específica del negocio disponible.';

  return knowledge.map((k) => {
    if (k.type === 'faq') return `P: ${k.title}\nR: ${k.content}`;
    return `[${k.title}]\n${k.content}`;
  }).join('\n\n');
};

const buildSystemPrompt = (business, knowledge) => {
  const knowledgeText = buildKnowledgeContext(knowledge);

  return `Eres el asistente virtual de "${business.name}", un negocio de ${business.category || 'servicios'} ubicado en ${business.city || 'Colombia'}.

Tu personalidad es: ${business.bot_personality || 'profesional y amigable'}.

=== INFORMACIÓN DEL NEGOCIO ===
${knowledgeText}
================================

REGLAS IMPORTANTES:
1. Responde ÚNICAMENTE con información del negocio proporcionada arriba.
2. Si te preguntan algo que no está en la información, di: "Para eso te puedo comunicar con alguien del equipo. ¿Me das un momento?"
3. Sé natural y conversacional, como un empleado real, NO como un robot.
4. Respuestas cortas y directas. Máximo 3-4 oraciones por respuesta.
5. Usa emojis ocasionalmente para ser más cercano 😊
6. Si el cliente quiere comprar, contratar, agendar o pagar, incluye exactamente la frase: [LEAD_CALIENTE] al FINAL de tu respuesta (oculta del cliente).
7. Idioma: español colombiano natural.
8. Nunca inventes precios ni información que no esté en el contexto.`;
};

const askGroq = async (userMessage, business, knowledge, chatHistory = []) => {
  try {
    const systemPrompt = buildSystemPrompt(business, knowledge);

    // Construir historial de mensajes para contexto
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
      max_tokens: 300,
      temperature: 0.7,
    });

    const fullReply = response.choices[0]?.message?.content || 'Disculpa, en este momento no puedo responder. ¿Puedes intentarlo de nuevo?';
    const tokensUsed = response.usage?.total_tokens || 0;

    // Detectar si es lead caliente
    const isLeadHot = fullReply.includes('[LEAD_CALIENTE]');

    // Limpiar la etiqueta del mensaje que verá el cliente
    const reply = fullReply.replace('[LEAD_CALIENTE]', '').trim();

    return { reply, isLeadHot, tokensUsed };
  } catch (err) {
    console.error('Error con Groq:', err);
    return {
      reply: 'Disculpa, tengo un problema técnico momentáneo. Por favor intenta de nuevo en unos minutos 🙏',
      isLeadHot: false,
      tokensUsed: 0,
    };
  }
};

module.exports = { askGroq };
