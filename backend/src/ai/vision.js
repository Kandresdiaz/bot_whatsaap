// Interpreta las fotos que envían los clientes con un modelo de visión (OpenRouter) y las
// cruza con el catálogo. Va aparte de Groq: los modelos de chat de Groq solo leen texto.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';
const TIMEOUT_MS = 25000;
const MAX_CATALOG = 150;

const isVisionEnabled = () => Boolean((process.env.OPENROUTER_API_KEY || '').trim());

const cleanKey = (k) => (k || '').trim().replace(/^['"]|['"]$/g, '');

// Saca el primer objeto JSON de la respuesta (algunos modelos lo envuelven en ```json)
const parseJson = (raw) => {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
};

/**
 * @param {Buffer} buffer      imagen recibida
 * @param {string} mimeType    ej. image/jpeg
 * @param {Array}  products    filas de products_services (name, description, price, category)
 * @param {string} caption     texto que el cliente escribió junto a la foto (puede estar vacío)
 * @returns {Promise<{tipo:string, descripcion:string, producto:object|null, confianza:number, alternativas:object[]}|null>}
 *          null si el servicio falla (el llamador debe derivar a un asesor)
 */
const analyzeImage = async (buffer, mimeType, products = [], caption = '') => {
  const apiKey = cleanKey(process.env.OPENROUTER_API_KEY);
  if (!apiKey || !buffer?.length) return null;

  const catalog = products.slice(0, MAX_CATALOG);
  const catalogText = catalog.length
    ? catalog.map((p, i) => `${i + 1}. ${p.name}${p.category ? ` [${p.category}]` : ''}${p.description ? ` — ${String(p.description).slice(0, 140)}` : ''}`).join('\n')
    : '(catálogo vacío)';

  const prompt = `Eres el ojo de un bot de ventas por WhatsApp. El cliente envió una imagen${caption ? ` con este texto: "${caption}"` : ''}.
Analízala y compárala con el CATÁLOGO del negocio.

CATÁLOGO:
${catalogText}

Responde SOLO un JSON con esta forma:
{"tipo":"producto|comprobante_pago|captura_pantalla|otro","descripcion":"qué se ve (objeto, color, marca, modelo, texto visible)","match":<número del catálogo o null>,"confianza":<0 a 1>,"alternativas":[<números parecidos>]}

Reglas:
- "match" solo si el artículo de la foto es realmente el mismo del catálogo (mismo tipo, color y modelo). Si es parecido pero no igual, pon null y usa "alternativas".
- Si hay dudas, confianza baja. Nunca fuerces un match.
- Un comprobante o recibo de transferencia es "comprobante_pago".`;

  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${buffer.toString('base64')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: (process.env.OPENROUTER_VISION_MODEL || DEFAULT_MODEL).trim(),
        temperature: 0.1,
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      }),
    });

    if (!res.ok) {
      console.error(`[VISION] OpenRouter respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }

    const json = await res.json();
    const parsed = parseJson(json?.choices?.[0]?.message?.content);
    if (!parsed) {
      console.error('[VISION] Respuesta sin JSON válido');
      return null;
    }

    const pick = (n) => (Number.isInteger(n) && n >= 1 && n <= catalog.length ? catalog[n - 1] : null);
    const confianza = Math.max(0, Math.min(1, Number(parsed.confianza) || 0));

    return {
      tipo: String(parsed.tipo || 'otro'),
      descripcion: String(parsed.descripcion || '').slice(0, 400),
      producto: pick(parsed.match),
      confianza,
      alternativas: (Array.isArray(parsed.alternativas) ? parsed.alternativas : []).map(pick).filter(Boolean).slice(0, 3),
    };
  } catch (e) {
    console.error('[VISION] Error analizando imagen:', e.name === 'AbortError' ? 'timeout' : e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// Convierte el análisis en una nota para el modelo de chat, con la regla de no cerrar ventas dudosas
const buildImageContext = (analysis, caption = '') => {
  const fmt = (p) => `${p.name} ($${Number(p.price || 0).toLocaleString('es-CO')} ${p.currency || 'COP'})`;
  const lines = [`[El cliente envió una foto. Lo que se ve: ${analysis.descripcion}]`];

  if (analysis.producto && analysis.confianza >= 0.7) {
    lines.push(`[Coincide con el catálogo: ${fmt(analysis.producto)}. Confírmale al cliente si es ese producto antes de tomar pedido.]`);
  } else if (analysis.producto || analysis.alternativas.length) {
    const cands = [analysis.producto, ...analysis.alternativas].filter(Boolean).map(fmt).join('; ');
    lines.push(`[Coincidencia DUDOSA con: ${cands}. Pregúntale cuál de esos busca. NO registres pedido ni des la venta por cerrada.]`);
  } else {
    lines.push('[Nada del catálogo coincide con la foto. Dile con amabilidad que no lo encuentras y ofrece pasarlo con un asesor. NO inventes productos ni registres pedido.]');
  }
  lines.push('[Si lo que el cliente escribe no coincide con la foto, prevalece la foto y acláralo.]');
  if (caption) lines.push(`Texto del cliente: ${caption}`);
  return lines.join('\n');
};

module.exports = { analyzeImage, buildImageContext, isVisionEnabled };
