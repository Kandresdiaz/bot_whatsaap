// Lee un catálogo "de diseño" (PDF donde el nombre, el precio y las fichas técnicas están
// dentro de la imagen y no como texto) y lo convierte en catálogo del bot:
//   1. saca la foto de cada página del PDF,
//   2. un modelo de visión lee lo que está escrito en esa página,
//   3. guarda el producto con su foto, más las FAQs e información que encuentre.
//
// Solo AGREGA: lo que el usuario ya tenía configurado no se toca.
const { supabase } = require('../db/supabase');
const { uploadPublicImage } = require('../db/storage');
const { forEachPageImage, countPageImages } = require('./pdfPageImages');
const { norm, parseJson, loadExistingKeys, buildProductRow } = require('./catalogUtils');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';
const TIMEOUT_MS = 45000;

const MAX_PAGES = 80;
const PAGE_CONCURRENCY = 3;
const MAX_PRODUCTS = 120;
const MAX_FAQS = 25;
const MAX_INFO = 15;

const cleanKey = (k) => (k || '').trim().replace(/^['"]|['"]$/g, '');
const isVisionEnabled = () => Boolean(cleanKey(process.env.OPENROUTER_API_KEY));

const buildPrompt = (business) => `Esta imagen es UNA página de un catálogo de "${business?.name || 'un negocio'}"${business?.category ? ` (${business.category})` : ''}. Lee TODO lo que está escrito en ella: títulos, referencias, precios y fichas técnicas.

Responde SOLO un JSON:
{"tipo":"producto|portada|informacion|otro",
 "productos":[{"nombre":"","descripcion":"","precio":<número o 0>,"categoria":""}],
 "faqs":[{"pregunta":"","respuesta":""}],
 "info":[{"titulo":"","contenido":""}]}

Reglas:
- "nombre": el nombre del producto tal como aparece, con su referencia o modelo si lo tiene (ej. "ELFO EB-1S", "WH2001").
- "precio": solo el número del precio impreso en la página, sin puntos ni símbolos (1'560.000 → 1560000). Si la página no muestra precio, 0.
- "descripcion": todas las especificaciones visibles (batería, motor, autonomía, velocidad, tiempo de carga, peso, medidas, carga máxima, llantas, colores disponibles...). Copia los valores exactos. NUNCA inventes ni completes datos que no estén en la imagen.
- "categoria": el tipo de producto según la página (ej. "Bicimoto eléctrica", "Bicicleta eléctrica", "Motocicleta eléctrica").
- Si la página es una portada, un separador o solo publicidad, devuelve tipo "portada" y todas las listas vacías.
- "faqs" e "info": solo si la página trae condiciones, garantías, requisitos, sedes o políticas escritas. Si no, listas vacías.
- Si en la página hay varios productos distintos con nombre propio, devuélvelos todos.`;

/** Lee una página del catálogo con el modelo de visión. */
const readPage = async (buffer, business) => {
  const apiKey = cleanKey(process.env.OPENROUTER_API_KEY);
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: (process.env.OPENROUTER_VISION_MODEL || DEFAULT_MODEL).trim(),
        temperature: 0.1,
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(business) },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` } },
          ],
        }],
      }),
    });
    if (!res.ok) {
      console.error(`[CATALOGO] OpenRouter respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = await res.json();
    return parseJson(json?.choices?.[0]?.message?.content);
  } catch (e) {
    console.error('[CATALOGO] Error leyendo página:', e.name === 'AbortError' ? 'timeout' : e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Procesa el PDF completo. Avisa el progreso por `onProgress` para que el panel pueda
 * mostrar una barra mientras tanto (el proceso tarda minutos, no cabe en una petición HTTP).
 *
 * @param {string} businessId
 * @param {Buffer} pdfBuffer
 * @param {string} sourceName   nombre del archivo, para titular la información general
 * @param {(p:{done:number,total:number,products:number,photos:number}) => void} onProgress
 * @param {number|null} knownPages  páginas con foto ya contadas por el llamador
 * @returns {Promise<{products:number, photos:number, faqs:number, info:number, pages:number, skipped:number}>}
 */
const buildCatalogFromPdfImages = async (businessId, pdfBuffer, sourceName = 'Catálogo', onProgress = () => {}, knownPages = null) => {
  const { data: business } = await supabase
    .from('businesses').select('name, category').eq('id', businessId).maybeSingle();

  // La ruta ya contó las páginas al validar el PDF; no se vuelve a abrir el archivo.
  const total = knownPages != null ? knownPages : (await countPageImages(pdfBuffer, MAX_PAGES)).withImage;
  const existing = await loadExistingKeys(businessId);

  const stats = { products: 0, photos: 0, faqs: 0, info: 0, pages: 0, skipped: 0 };
  let done = 0;

  // Los productos se guardan página por página: si el proceso se corta a la mitad,
  // lo ya leído queda en el catálogo.
  const savePage = async (page, parsed, imageBuffer) => {
    const productos = Array.isArray(parsed?.productos) ? parsed.productos : [];
    const faqs = Array.isArray(parsed?.faqs) ? parsed.faqs : [];
    const info = Array.isArray(parsed?.info) ? parsed.info : [];

    // Nuevos en esta página (los repetidos no gastan una subida de foto).
    const nuevos = [];
    for (const p of productos) {
      const key = norm(p?.nombre);
      if (!key) continue;
      if (existing.products.has(key)) { stats.skipped++; continue; }
      if (stats.products + nuevos.length >= MAX_PRODUCTS) break;
      existing.products.add(key);
      nuevos.push(p);
    }

    // La foto de la página solo se le asigna al producto cuando la página muestra uno
    // solo. Con varios no se sabe cuál es cuál, y una foto equivocada en una venta es
    // peor que no tener foto.
    let imageUrl = null;
    if (nuevos.length === 1 && imageBuffer) {
      imageUrl = await uploadPublicImage(
        `${businessId}/${Date.now()}-p${page}.jpg`,
        imageBuffer,
        'image/jpeg',
      );
    }

    if (nuevos.length) {
      const rows = nuevos.map(p => buildProductRow(businessId, p, imageUrl));
      const { error } = await supabase.from('products_services').insert(rows);
      if (error) {
        console.error(`[CATALOGO] Página ${page}: error guardando productos:`, error.message);
        rows.forEach(r => existing.products.delete(norm(r.name)));
      } else {
        stats.products += rows.length;
        if (imageUrl) stats.photos++;
      }
    }

    const kbRows = [];
    const pushKb = (type, title, content) => {
      const t = String(title || '').trim().slice(0, 200);
      const c = String(content || '').trim().slice(0, 1500);
      const key = norm(t);
      if (!key || !c) return;
      if (existing.kb.has(key)) { stats.skipped++; return; }
      existing.kb.add(key);
      kbRows.push({ business_id: businessId, type, title: t, content: c });
    };
    if (stats.faqs < MAX_FAQS) faqs.forEach(f => pushKb('faq', f?.pregunta, f?.respuesta));
    if (stats.info < MAX_INFO) info.forEach(i => pushKb('text', `${i?.titulo || 'Información'} (${sourceName})`, i?.contenido));

    if (kbRows.length) {
      const { error } = await supabase.from('knowledge_base').insert(kbRows);
      if (error) {
        console.error(`[CATALOGO] Página ${page}: error guardando conocimiento:`, error.message);
        kbRows.forEach(r => existing.kb.delete(norm(r.title)));
      } else {
        stats.faqs += kbRows.filter(r => r.type === 'faq').length;
        stats.info += kbRows.filter(r => r.type === 'text').length;
      }
    }
  };

  await forEachPageImage(pdfBuffer, { maxPages: MAX_PAGES, concurrency: PAGE_CONCURRENCY }, async ({ page, buffer }) => {
    stats.pages++;
    try {
      const parsed = await readPage(buffer, business);
      if (parsed) await savePage(page, parsed, buffer);
    } catch (e) {
      console.error(`[CATALOGO] Página ${page} falló:`, e.message);
    }
    done++;
    onProgress({ done, total, products: stats.products, photos: stats.photos });
  });

  return stats;
};

module.exports = { buildCatalogFromPdfImages, isVisionEnabled, MAX_PAGES };
