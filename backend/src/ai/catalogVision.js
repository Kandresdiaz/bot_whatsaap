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

const MAX_PAGES = 300;
const PAGE_CONCURRENCY = 3;
const MAX_PRODUCTS = 300;
const MAX_FAQS = 25;
const MAX_INFO = 15;

const cleanKey = (k) => (k || '').trim().replace(/^['"]|['"]$/g, '');
const isVisionEnabled = () => Boolean(cleanKey(process.env.OPENROUTER_API_KEY));

const buildPrompt = (business) => `Esta imagen es UNA página de un catálogo de "${business?.name || 'un negocio'}"${business?.category ? ` (${business.category})` : ''}. Lee TODO lo que está escrito en ella: título, referencia, precios y fichas técnicas.

Responde SOLO un JSON:
{"tipo":"producto|portada|informacion|otro",
 "distribucion":"un_modelo|varios_modelos",
 "productos":[{"nombre":"","variante":"","descripcion":"","precio":<número o 0>,"categoria":""}],
 "faqs":[{"pregunta":"","respuesta":""}],
 "info":[{"titulo":"","contenido":""}]}

Reglas:
- Una página suele presentar UN modelo (un título grande, ej. "CAMELLITO") con una foto principal y, a veces, fotos pequeñas del mismo modelo en otros colores: eso es "un_modelo". Si la página muestra varios modelos distintos, cada uno con su propio título, es "varios_modelos".
- "nombre": el título grande del modelo, con su referencia si la tiene (ej. "ELFO EB-1S", "CAMELLITO PLUS", "WH2001"). Sin palabras genéricas como "Bicimoto eléctrica" o "Patineta eléctrica": eso va en "categoria".
- Si el mismo modelo se ofrece en versiones con precio propio (por ejemplo batería de plomo ácido y batería de litio), devuelve UN producto por versión: mismo "nombre", y en "variante" lo que las distingue (ej. "Batería de plomo ácido 48V/20AH"). Cada versión lleva SU precio y SUS especificaciones: no mezcles los datos de una con los de otra. Si hay una sola versión, "variante" va vacía.
- "precio": solo el número impreso para ESA versión, sin puntos ni símbolos (1'560.000 → 1560000). Si la página no muestra precio, 0.
- "descripcion": todas las especificaciones visibles de esa versión (batería, motor, autonomía, velocidad, tiempo de carga, peso, medidas, carga máxima, llantas, colores...). Copia los valores exactos. NUNCA inventes ni completes datos que no estén en la imagen.
- "categoria": el tipo de producto según la página (ej. "Bicimoto eléctrica", "Patineta eléctrica").
- Si la página es una portada, un separador o solo publicidad, devuelve tipo "portada" y todas las listas vacías.
- "faqs" e "info": solo si la página trae condiciones, garantías, requisitos, sedes o políticas escritas. Si no, listas vacías.`;

/**
 * Lee una página del catálogo con el modelo de visión.
 * Si algo sale mal LANZA un error con la causa en claro (en vez de devolver null), para
 * que el reintento la registre y el panel pueda decirle al usuario por qué faltan productos.
 */
const readPage = async (buffer, business) => {
  const apiKey = cleanKey(process.env.OPENROUTER_API_KEY);
  if (!apiKey) throw new Error('falta OPENROUTER_API_KEY');

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
        // Gemini 2.5 "piensa" antes de responder y esos tokens salen del mismo tope: con
        // un tope justo la respuesta se corta a la mitad y el JSON queda ilegible.
        max_tokens: 4000,
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
      const err = new Error(`OpenRouter respondió ${res.status}: ${(await res.text()).replace(/\s+/g, ' ').slice(0, 160)}`);
      // Sin saldo (402) o llave rechazada (401/403): reintentar no sirve y solo gasta tiempo.
      if (res.status === 402) {
        err.fatal = 'La cuenta de OpenRouter no tiene saldo. Recarga créditos en openrouter.ai → Settings → Credits y vuelve a subir el PDF.';
      } else if (res.status === 401 || res.status === 403) {
        err.fatal = 'OpenRouter rechazó la llave (OPENROUTER_API_KEY). Revisa que sea correcta y esté activa.';
      }
      throw err;
    }
    const json = await res.json();
    const choice = json?.choices?.[0];
    const parsed = parseJson(choice?.message?.content);
    if (!parsed) {
      const raw = String(choice?.message?.content || '').replace(/\s+/g, ' ');
      throw new Error(`respuesta sin JSON válido (finish_reason=${choice?.finish_reason || '?'}, ${raw.length} caracteres: "${raw.slice(0, 80)}")`);
    }
    return parsed;
  } catch (e) {
    throw e.name === 'AbortError' ? new Error(`el modelo no respondió en ${TIMEOUT_MS / 1000} s`) : e;
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

  const stats = { products: 0, photos: 0, faqs: 0, info: 0, pages: 0, skipped: 0, failed: 0, failedPages: [], lastError: null, enriched: 0, noPrice: 0 };
  let done = 0;
  let fatal = null;

  // Los productos se guardan página por página: si el proceso se corta a la mitad,
  // lo ya leído queda en el catálogo.
  const savePage = async (page, parsed, imageBuffer) => {
    const productos = Array.isArray(parsed?.productos) ? parsed.productos : [];
    const faqs = Array.isArray(parsed?.faqs) ? parsed.faqs : [];
    const info = Array.isArray(parsed?.info) ? parsed.info : [];

    // Nombre visible: si la página trae varias versiones del mismo modelo (plomo / litio),
    // cada una lleva su variante en el nombre; sin eso la segunda se descartaría por repetida.
    const visible = productos.map(p => {
      const base = String(p?.nombre || '').trim();
      const variante = String(p?.variante || '').trim();
      return { ...p, nombre: variante && !norm(base).includes(norm(variante)) ? `${base} (${variante.slice(0, 50)})` : base };
    });

    // Cada producto de la página es nuevo, o ya existe. Si ya existe y no tiene foto, se
    // le completa; nunca se cambia una foto que ya tenga.
    const nuevos = [];
    const sinFoto = [];
    for (const p of visible) {
      const key = norm(p.nombre);
      if (!key) continue;
      if (existing.products.has(key)) {
        const info = existing.productInfo.get(key);
        if (info && !info.image_url) sinFoto.push({ key, info }); else stats.skipped++;
        continue;
      }
      if (stats.products + nuevos.length >= MAX_PRODUCTS) break;
      existing.products.add(key);
      nuevos.push(p);
    }

    // La foto es de la PÁGINA. Se comparte entre todos los productos de la página solo
    // cuando la página es de un único modelo (sus versiones se ven igual). Con varios
    // modelos distintos no se sabe cuál es cuál, y una foto equivocada en una venta es
    // peor que no tener foto.
    const comparteFoto = parsed?.distribucion === 'un_modelo' || visible.length === 1;
    let imageUrl = null;
    if (comparteFoto && imageBuffer && (nuevos.length || sinFoto.length)) {
      imageUrl = await uploadPublicImage(`${businessId}/${Date.now()}-p${page}.jpg`, imageBuffer, 'image/jpeg');
    }

    if (nuevos.length) {
      const rows = nuevos.map(p => buildProductRow(businessId, p, imageUrl));
      const { error } = await supabase.from('products_services').insert(rows);
      if (error) {
        console.error(`[CATALOGO] Página ${page}: error guardando productos:`, error.message);
        rows.forEach(r => existing.products.delete(norm(r.name)));
      } else {
        stats.products += rows.length;
        if (imageUrl) stats.photos += rows.length;
        if (parsed?.tipo === 'producto') stats.noPrice += rows.filter(r => !r.price).length;
      }
    }

    if (imageUrl) {
      for (const { info } of sinFoto) {
        const { error } = await supabase.from('products_services')
          .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
          .eq('id', info.id).eq('business_id', businessId);
        if (error) { console.error(`[CATALOGO] Página ${page}: no se pudo completar la foto:`, error.message); continue; }
        info.image_url = imageUrl;
        stats.enriched++;
        stats.photos++;
      }
    } else {
      stats.skipped += sinFoto.length;
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
    // Con un error que no se arregla reintentando se deja de llamar al modelo: las demás
    // páginas se saltan al instante en vez de gastar 3 intentos y esperas cada una.
    if (fatal) return;
    stats.pages++;
    // Casi todos los fallos son pasajeros (timeout, un 429 del proveedor), así que la
    // página se reintenta una vez antes de darla por perdida. Y si se pierde, se anota:
    // una página que no se leyó es un producto que no está en el catálogo, y eso el
    // usuario tiene que saberlo en vez de quedarse contando a mano.
    let parsed = null;
    for (let intento = 1; intento <= 3 && !parsed; intento++) {
      try {
        parsed = await readPage(buffer, business);
      } catch (e) {
        stats.lastError = e.message;
        console.error(`[CATALOGO] Página ${page}, intento ${intento}: ${e.message}`);
        if (e.fatal) { fatal = fatal || e.fatal; break; }
      }
      // Espera creciente: un límite de velocidad del proveedor (429) se pasa esperando.
      if (!parsed && intento < 3) await new Promise(r => setTimeout(r, intento * 3000));
    }

    if (parsed) {
      try {
        await savePage(page, parsed, buffer);
      } catch (e) {
        console.error(`[CATALOGO] Página ${page}: error guardando:`, e.message);
        stats.failed++;
        if (stats.failedPages.length < 30) stats.failedPages.push(page);
      }
    } else {
      stats.failed++;
      if (stats.failedPages.length < 30) stats.failedPages.push(page);
    }

    done++;
    onProgress({ done, total, products: stats.products, photos: stats.photos, failed: stats.failed, lastError: stats.lastError, enriched: stats.enriched, noPrice: stats.noPrice });
  });

  stats.failedPages.sort((a, b) => a - b);
  stats.fatalError = fatal;
  return stats;
};

module.exports = { buildCatalogFromPdfImages, isVisionEnabled, MAX_PAGES };
