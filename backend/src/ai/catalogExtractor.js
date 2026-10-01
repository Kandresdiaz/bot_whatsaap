// Lee el texto de un PDF (catálogo, lista de precios, brochure) y lo reparte en
// productos, preguntas frecuentes e información del negocio. Solo AGREGA: nunca
// modifica ni borra lo que el usuario ya configuró.
const Groq = require('groq-sdk');
const { supabase } = require('../db/supabase');
const { norm, parseJson, loadExistingKeys, buildProductRow } = require('./catalogUtils');

const MODEL = 'llama-3.3-70b-versatile';
const WINDOW_CHARS = 9000;
const MAX_WINDOWS = 4;
const MAX_PRODUCTS = 80;
const MAX_FAQS = 20;
const MAX_INFO = 10;

const extractWindow = async (client, text, business) => {
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `Del siguiente texto, extraído de un PDF de "${business?.name || 'un negocio'}" (${business?.category || 'negocio'}), organiza la información para un bot de ventas por WhatsApp.

TEXTO:
"""
${text}
"""

Responde SOLO un JSON:
{"productos":[{"nombre":"","descripcion":"","precio":<número en pesos o 0 si no aparece>,"categoria":""}],
 "faqs":[{"pregunta":"","respuesta":""}],
 "info":[{"titulo":"","contenido":""}]}

Reglas:
- "productos": cada producto/servicio con nombre propio. Incluye en "descripcion" las especificaciones reales que aparezcan (motor, batería, autonomía, medidas, etc.). Precio solo si está escrito; si no, 0. NUNCA inventes datos.
- "faqs": solo preguntas que el texto responda de forma explícita (garantía, envíos, formas de pago, horarios, requisitos...).
- "info": datos generales del negocio que no sean un producto (quiénes son, políticas, sedes, condiciones).
- Si una sección no aplica, devuelve lista vacía. No repitas el mismo dato en dos secciones.`,
    }],
  });
  return parseJson(res.choices?.[0]?.message?.content);
};

/**
 * @returns {Promise<{products:number, faqs:number, info:number, skipped:number}|null>}
 *          null si la IA no está disponible (el llamador conserva el texto crudo del PDF).
 */
const distributePdfKnowledge = async (businessId, text, sourceName = 'PDF') => {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey || !text?.trim()) return null;
  const client = new Groq({ apiKey });

  const { data: business } = await supabase.from('businesses').select('name, category').eq('id', businessId).maybeSingle();

  const windows = [];
  for (let i = 0; i < text.length && windows.length < MAX_WINDOWS; i += WINDOW_CHARS) {
    windows.push(text.slice(i, i + WINDOW_CHARS));
  }

  const found = { productos: [], faqs: [], info: [] };
  let okWindows = 0;
  for (const w of windows) {
    try {
      const parsed = await extractWindow(client, w, business);
      if (!parsed) continue;
      okWindows++;
      for (const k of Object.keys(found)) if (Array.isArray(parsed[k])) found[k].push(...parsed[k]);
    } catch (e) {
      console.error('[CATALOGO] Error extrayendo ventana:', e.message);
    }
  }
  if (okWindows === 0) return null;

  const existing = await loadExistingKeys(businessId);

  let skipped = 0;
  const productRows = [];
  for (const p of found.productos) {
    const key = norm(p?.nombre);
    if (!key) continue;
    if (existing.products.has(key)) { skipped++; continue; }
    existing.products.add(key);
    productRows.push(buildProductRow(businessId, p));
    if (productRows.length >= MAX_PRODUCTS) break;
  }

  const kbRows = [];
  const pushKb = (type, title, content) => {
    const t = String(title || '').trim().slice(0, 200);
    const c = String(content || '').trim().slice(0, 1500);
    const key = norm(t);
    if (!key || !c) return;
    if (existing.kb.has(key)) { skipped++; return; }
    existing.kb.add(key);
    kbRows.push({ business_id: businessId, type, title: t, content: c });
  };
  found.faqs.slice(0, MAX_FAQS).forEach(f => pushKb('faq', f?.pregunta, f?.respuesta));
  found.info.slice(0, MAX_INFO).forEach(i => pushKb('text', `${i?.titulo || 'Información'} (${sourceName})`, i?.contenido));

  if (productRows.length) {
    const { error } = await supabase.from('products_services').insert(productRows);
    if (error) { console.error('[CATALOGO] Error guardando productos:', error.message); productRows.length = 0; }
  }
  if (kbRows.length) {
    const { error } = await supabase.from('knowledge_base').insert(kbRows);
    if (error) { console.error('[CATALOGO] Error guardando conocimiento:', error.message); kbRows.length = 0; }
  }

  return {
    products: productRows.length,
    faqs: kbRows.filter(r => r.type === 'faq').length,
    info: kbRows.filter(r => r.type === 'text').length,
    skipped,
  };
};

module.exports = { distributePdfKnowledge };
