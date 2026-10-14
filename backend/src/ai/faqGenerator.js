const Groq = require('groq-sdk');
const { supabase } = require('../db/supabase');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL_SMART = 'llama-3.3-70b-versatile';

/**
 * Analiza las conversaciones y mensajes recientes del cliente para extraer
 * preguntas frecuentes repetitivas y generar plantillas FAQ sugeridas.
 */
const generateFaqsFromChats = async (userId) => {
  try {
    // 1. Obtener el negocio del usuario
    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!business) {
      return { success: false, error: 'No se encontró la configuración del negocio.' };
    }

    // 2. Obtener sesiones de WhatsApp del usuario
    const { data: sessions } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', userId);

    const sessionIds = (sessions || []).map(s => s.id);

    // 3. Obtener conversaciones asociadas
    let convIds = [];
    if (sessionIds.length > 0) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .in('session_id', sessionIds);
      convIds = (convs || []).map(c => c.id);
    }

    // Si este negocio todavía no tiene chats propios NO se consultan mensajes: antes se leían
    // los 60 mensajes entrantes más recientes de TODO el SaaS y se mandaban a la IA, así que
    // las FAQs de un negocio se generaban con lo que los clientes le escribían a otro.
    // Sin chats propios se responde con las FAQs estándar de su categoría.
    let recentMessages = [];
    let msgErr = null;

    if (convIds.length > 0) {
      const { data: msgs, error: qErr } = await supabase
        .from('messages')
        .select('content, timestamp, direction')
        .eq('direction', 'inbound')
        .in('conversation_id', convIds)
        .order('timestamp', { ascending: false })
        .limit(60);
      recentMessages = msgs || [];
      msgErr = qErr;
    }

    if (msgErr || !recentMessages || recentMessages.length === 0) {
      // Si aún no hay chats registrados, responder con FAQs sugeridas estándar para su categoría
      return generateDefaultFaqsForCategory(business);
    }

    // 4. Preparar el texto de mensajes para la IA
    const messagesText = recentMessages
      .map(m => m.content)
      .filter(t => t && t.length > 5)
      .slice(0, 40)
      .join('\n- ');

    const prompt = `Analiza estos mensajes reales que han enviado los clientes al WhatsApp de "${business.name}" (${business.category || 'Negocio'} en ${business.city || 'Colombia'}).

MENSAJES RECIENTES DE CLIENTES:
- ${messagesText}

DESCRIPCIÓN DEL NEGOCIO:
${business.description || business.name}

TAREA:
Identifica las 3 a 5 preguntas más frecuentes o dudas principales de los clientes. Para cada una, redacta una respuesta oficial corta, amable y directa que un empleado capacitado daría, respetando las políticas del negocio.

FORMATO DE RESPUESTA REQUERIDO:
Devuelve ÚNICAMENTE un JSON válido (sin markdown, sin bloques de código \`\`\`) con el siguiente formato:
[
  {
    "title": "¿Cuál es el horario de atención?",
    "content": "Atendemos de lunes a viernes de 8:00 AM a 6:00 PM."
  }
]`;

    const response = await groq.chat.completions.create({
      model: MODEL_SMART,
      messages: [
        { role: 'system', content: 'Eres un analista de datos de atención al cliente. Generas JSON estricto.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const raw = response.choices[0]?.message?.content || '[]';
    const cleanJson = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    let faqs = [];
    try {
      faqs = JSON.parse(cleanJson);
    } catch (_) {
      faqs = [];
    }

    if (!Array.isArray(faqs) || faqs.length === 0) {
      return generateDefaultFaqsForCategory(business);
    }

    return { success: true, faqs, source: 'real_chats' };
  } catch (err) {
    console.error('[FAQ Generator] Error:', err.message);
    return { success: false, error: err.message };
  }
};

const generateDefaultFaqsForCategory = (business) => {
  const isSales = business?.main_goal === 'vender';

  const defaultFaqs = [
    {
      title: '¿Cuáles son sus horarios de atención?',
      content: `Atendemos de lunes a viernes de ${business?.active_hours_start || '08:00'} a ${business?.active_hours_end || '18:00'}.`,
    },
    {
      title: isSales ? '¿Qué métodos de pago aceptan?' : '¿Cómo puedo agendar una cita?',
      content: isSales
        ? `Aceptamos Nequi, Daviplata, transferencias bancarias y tarjetas a través de nuestro enlace oficial.`
        : `Puedes agendar tu cita enviándonos tu nombre y el día/hora preferida o usando nuestro enlace de reservas.`,
    },
    {
      title: '¿Dónde están ubicados?',
      content: business?.address
        ? `Estamos ubicados en ${business.address}, ${business?.city || ''}.`
        : `Brindamos atención en ${business?.city || 'Colombia'} y a domicilio/online.`,
    },
  ];

  return { success: true, faqs: defaultFaqs, source: 'templates' };
};

module.exports = { generateFaqsFromChats };
