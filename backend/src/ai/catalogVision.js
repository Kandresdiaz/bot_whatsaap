// Lee un catálogo "de diseño" (PDF donde el nombre, el precio y las fichas técnicas están
// dentro de la imagen y no como texto) y lo convierte en catálogo del bot:
//   1. saca la foto de cada página del PDF,
//   2. un modelo de visión lee lo que está escrito en esa página,
//   3. guarda el producto con su foto, más las FAQs e información que encuentre.
//
// Solo AGREGA: lo que el usuario ya tenía configurado no se toca.
const crypto = require('crypto');
const { supabase } = require('../db/supabase');
const { uploadPublicImage } = require('../db/storage');
const { forEachPageImage, countPageImages } = require('./pdfPageImages');
const { norm, parseJson, loadExistingKeys, buildProductRow } = require('./catalogUtils');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';
const TIMEOUT_MS = 45000;

// Google AI Studio (Gemini directo): tiene plan gratuito, con límites por minuto y por día.
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const MAX_PAGES = 300;

// Corte de seguridad: si las páginas fallan una tras otra, o fallan en una proporción alta,
// seguir llamando al modelo es pagar (o gastar cuota) por nada. Se detiene el trabajo, lo ya
// leído queda guardado y al volver a subir el mismo PDF se continúa sin repetir lo hecho.
const MAX_CONSECUTIVE_FAILS = () => Number(process.env.VISION_MAX_CONSECUTIVE_FAILS) || 4;
const FAIL_RATE_MIN_PAGES = 12;   // no se mide la proporción antes de esto
const FAIL_RATE_LIMIT = 0.4;      // 40 % de las páginas intentadas
const PAGE_CONCURRENCY = 3;
const MAX_PRODUCTS = 300;
const MAX_FAQS = 25;
const MAX_INFO = 15;

const cleanKey = (k) => (k || '').trim().replace(/^['"]|['"]$/g, '');
// Si hay llave de Google se usa esa (plan gratuito); si no, OpenRouter (de pago).
const provider = () => {
  if (cleanKey(process.env.GEMINI_API_KEY)) return 'google';
  if (cleanKey(process.env.OPENROUTER_API_KEY)) return 'openrouter';
  return null;
};
const isVisionEnabled = () => provider() !== null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageHash = (buffer) => crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16);

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
const readPageOpenRouter = async (buffer, business) => {
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

// El plan gratuito de Google permite unas 10 peticiones por minuto: se espacian las llamadas
// para no toparse con el límite en vez de fallar y reintentar. VISION_RPM lo ajusta.
let nextSlot = 0;
const throttle = async () => {
  const rpm = Number(process.env.VISION_RPM) || 8;
  const interval = Math.ceil(60000 / rpm);
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + interval;
  if (wait) await sleep(wait);
};

// ── Elección del modelo de Google ───────────────────────────────────────────────────────
// Google retira modelos y los quita a las cuentas nuevas (gemini-2.5-flash ya devuelve 404
// para llaves recientes), y las cuotas gratuitas son POR MODELO. Fijar un nombre en el
// código lo rompe tarde o temprano, así que se le pregunta a Google qué modelos tiene esta
// llave, se usa el Flash más nuevo y, si uno no sirve (retirado, sin plan gratuito o con la
// cuota del día agotada), se pasa al siguiente en vez de detener el trabajo.
const COOLDOWN_QUOTA_MS = 3 * 60 * 60 * 1000;
const COOLDOWN_GONE_MS = 24 * 60 * 60 * 1000;
const MSG_QUOTA = 'Se agotó la cuota gratuita de Gemini de hoy (o tu cuenta no tiene plan gratuito para estos modelos). Lo ya leído quedó guardado: vuelve a subir el mismo PDF mañana y continúa donde quedó, sin repetir lo hecho.';
// Saturación temporal (503 "alta demanda"): el modelo descansa un rato y se usa otro, o se espera.
const timing = { overloadMs: 90 * 1000, maxWaitMs: 30 * 1000 };
const MSG_BUSY = 'Los modelos de Google están saturados en este momento (alta demanda). Lo ya leído quedó guardado: vuelve a subir el mismo PDF en unos minutos y continúa donde quedó, sin repetir lo hecho.';
const MSG_GONE = 'Google no ofrece ningún modelo Gemini Flash disponible para esta llave. Revisa la llave en aistudio.google.com/apikey.';
const MSG_KEY = 'Google rechazó la llave (GEMINI_API_KEY). Revisa que sea correcta y esté activa en aistudio.google.com/apikey.';

let googleModel = null;
let modelsCache = null;
const unusable = new Map();   // modelo -> momento hasta el que no se vuelve a intentar
const overloaded = new Map(); // modelo -> hasta cuándo descansa por saturación (temporal)
let lastModelProblem = MSG_GONE;

const isUsable = (name) => (unusable.get(name) || 0) <= Date.now() && (overloaded.get(name) || 0) <= Date.now();
const markUnusable = (name, ms, why) => {
  unusable.set(name, Date.now() + ms);
  lastModelProblem = why;
  if (googleModel === name) googleModel = null;
};

const markOverloaded = (name, ms) => {
  overloaded.set(name, Date.now() + ms);
  if (googleModel === name) googleModel = null;
};

const listGoogleModels = async (apiKey) => {
  if (modelsCache && Date.now() - modelsCache.at < 10 * 60 * 1000) return modelsCache.models;
  const res = await fetch(`${GEMINI_BASE}?pageSize=1000`, {
    headers: { 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = (await res.text()).replace(/\s+/g, ' ');
    const err = new Error(`Google respondió ${res.status} al listar modelos: ${body.slice(0, 160)}`);
    if ((res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) || res.status === 401 || res.status === 403) err.fatal = MSG_KEY;
    throw err;
  }
  const json = await res.json();
  modelsCache = { models: json.models || [], at: Date.now() };
  return modelsCache.models;
};

// Flash primero (de la versión más nueva a la más vieja) y Flash-Lite al final: suele tener
// más cuota gratuita, así que sirve de respaldo.
const pickGoogleModel = (models) => {
  const found = [];
  for (const m of models) {
    if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
    const name = String(m.name || '').replace(/^models\//, '');
    const hit = name.match(/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/);
    if (!hit || !isUsable(name)) continue;
    found.push({ name, version: parseFloat(hit[1]), tier: hit[2] ? 1 : 0 });
  }
  found.sort((a, b) => a.tier - b.tier || b.version - a.version);
  return found[0]?.name || null;
};

const resolveGoogleModel = async (apiKey) => {
  const forced = (process.env.GEMINI_VISION_MODEL || '').trim();
  if (forced) return forced;
  if (googleModel && isUsable(googleModel)) return googleModel;

  let models = null;
  try {
    models = await listGoogleModels(apiKey);
  } catch (e) {
    if (e.fatal) throw e;
    console.error(`[CATALOGO] No se pudo consultar la lista de modelos de Google: ${e.message}`);
  }
  // Sin lista (falla de red): el alias de Google que siempre apunta al Flash vigente.
  if (!models) return 'gemini-flash-latest';

  for (let espera = 0; ; espera++) {
    const picked = pickGoogleModel(models);
    if (picked) {
      googleModel = picked;
      console.log(`[CATALOGO] Modelo de Google elegido: ${picked}`);
      return picked;
    }
    // Sin modelos libres. Si alguno está solo saturado (algo temporal) se espera a que se
    // libere en vez de rendirse; si no, ya no hay nada que probar.
    const libera = [...overloaded.values()].filter(t => t > Date.now());
    if (libera.length && espera < 8) {
      await sleep(Math.min(timing.maxWaitMs, Math.max(50, Math.min(...libera) - Date.now() + 50)));
      continue;
    }
    const err = new Error('no queda ningún modelo Gemini utilizable');
    err.fatal = libera.length ? MSG_BUSY : lastModelProblem;
    throw err;
  }
};

const callGoogle = async (apiKey, model, buffer, business) => {
  await throttle();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const generationConfig = { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' };
    // Leer texto de una imagen no necesita "pensar": se apaga para ahorrar cuota y evitar cortes.
    if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      // La llave va en un encabezado, no en la URL, para que no quede en ningún registro.
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: buildPrompt(business) },
          { inline_data: { mime_type: 'image/jpeg', data: buffer.toString('base64') } },
        ] }],
        generationConfig,
      }),
    });

    if (!res.ok) {
      const body = (await res.text()).replace(/\s+/g, ' ');
      const err = new Error(`Google respondió ${res.status} (${model}): ${body.slice(0, 200)}`);
      const forced = Boolean((process.env.GEMINI_VISION_MODEL || '').trim());

      if (res.status === 404) {
        // Modelo retirado o no disponible para esta cuenta: se pasa al siguiente.
        if (forced) err.fatal = `El modelo ${model} (GEMINI_VISION_MODEL) no está disponible para tu llave. Quita esa variable para que se elija uno automáticamente.`;
        else { markUnusable(model, COOLDOWN_GONE_MS, MSG_GONE); err.switchModel = true; }
      } else if (res.status === 429) {
        if (/PerDay/i.test(body) || /limit:\s*0/i.test(body)) {
          // Cuota del día agotada, o este modelo no tiene plan gratuito: las cuotas son por modelo.
          if (forced) err.fatal = MSG_QUOTA;
          else { markUnusable(model, COOLDOWN_QUOTA_MS, MSG_QUOTA); err.switchModel = true; }
        } else {
          // Límite por minuto: basta esperar lo que el propio Google indica.
          const m = body.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
          err.retryAfterMs = Math.min(65000, (m ? Number(m[1]) : 20) * 1000 + 1000);
        }
      } else if (res.status >= 500) {
        // 503 "alta demanda" y similares: es temporal. Ese modelo descansa un rato y se usa otro.
        if (forced) err.retryAfterMs = 8000;
        else { markOverloaded(model, timing.overloadMs); err.switchModel = true; }
      } else if ((res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) || res.status === 401 || res.status === 403) {
        err.fatal = MSG_KEY;
      }
      throw err;
    }

    const json = await res.json();
    const cand = json?.candidates?.[0];
    const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
    const parsed = parseJson(text);
    if (!parsed) {
      const raw = text.replace(/\s+/g, ' ');
      throw new Error(`respuesta sin JSON válido (finishReason=${cand?.finishReason || json?.promptFeedback?.blockReason || '?'}, ${raw.length} caracteres: "${raw.slice(0, 80)}")`);
    }
    return parsed;
  } catch (e) {
    throw e.name === 'AbortError' ? new Error(`el modelo no respondió en ${TIMEOUT_MS / 1000} s`) : e;
  } finally {
    clearTimeout(timer);
  }
};

// Cambiar de modelo no cuenta como un intento fallido de la página: se prueba el siguiente
// de inmediato, hasta 4 veces, y solo entonces se da el error.
const readPageGoogle = async (buffer, business) => {
  const apiKey = cleanKey(process.env.GEMINI_API_KEY);
  for (let cambios = 0; ; cambios++) {
    const model = await resolveGoogleModel(apiKey);
    try {
      return await callGoogle(apiKey, model, buffer, business);
    } catch (e) {
      if (e.switchModel && cambios < 6) continue;
      throw e;
    }
  }
};

const _resetGoogleState = (t) => {
  googleModel = null; modelsCache = null; unusable.clear(); overloaded.clear(); lastModelProblem = MSG_GONE; nextSlot = 0;
  timing.overloadMs = t?.overloadMs ?? 90 * 1000;
  timing.maxWaitMs = t?.maxWaitMs ?? 30 * 1000;
};

const readPage = (buffer, business) => (provider() === 'google' ? readPageGoogle(buffer, business) : readPageOpenRouter(buffer, business));

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

  const stats = { products: 0, photos: 0, faqs: 0, info: 0, pages: 0, skipped: 0, failed: 0, failedPages: [], lastError: null, enriched: 0, noPrice: 0, alreadyRead: 0 };
  let done = 0;
  let fatal = null;
  let seguidas = 0;     // páginas seguidas que fallaron
  let intentadas = 0;   // páginas en las que sí se llamó al modelo
  const report = () => onProgress({
    done, total, products: stats.products, photos: stats.photos, failed: stats.failed,
    lastError: stats.lastError, enriched: stats.enriched, noPrice: stats.noPrice, alreadyRead: stats.alreadyRead,
  });

  // Los productos se guardan página por página: si el proceso se corta a la mitad,
  // lo ya leído queda en el catálogo.
  const savePage = async (page, parsed, imageBuffer, hash) => {
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
      imageUrl = await uploadPublicImage(`${businessId}/${hash}.jpg`, imageBuffer, 'image/jpeg');
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

  await forEachPageImage(pdfBuffer, { maxPages: MAX_PAGES, concurrency: PAGE_CONCURRENCY, shouldStop: () => Boolean(fatal) }, async ({ page, buffer }) => {
    // Con un error que no se arregla reintentando se deja de llamar al modelo: las demás
    // páginas se saltan al instante en vez de gastar 3 intentos y esperas cada una.
    if (fatal) return;
    stats.pages++;

    // Página ya leída en una subida anterior: la foto de su producto ya está en el catálogo
    // con el hash de la imagen en el nombre. No se vuelve a gastar IA en ella.
    const hash = pageHash(buffer);
    if (existing.pageHashes.has(hash)) {
      stats.alreadyRead++;
      done++;
      report();
      return;
    }
    // Casi todos los fallos son pasajeros (timeout, un 429 del proveedor), así que la
    // página se reintenta una vez antes de darla por perdida. Y si se pierde, se anota:
    // una página que no se leyó es un producto que no está en el catálogo, y eso el
    // usuario tiene que saberlo en vez de quedarse contando a mano.
    let parsed = null;
    let lastWait = 0;
    for (let intento = 1; intento <= 3 && !parsed && !fatal; intento++) {
      try {
        parsed = await readPage(buffer, business);
      } catch (e) {
        stats.lastError = e.message;
        lastWait = e.retryAfterMs || 0;
        console.error(`[CATALOGO] Página ${page}, intento ${intento}: ${e.message}`);
        if (e.fatal) { fatal = fatal || e.fatal; break; }
      }
      // Espera creciente: un límite de velocidad del proveedor (429) se pasa esperando.
      if (!parsed && intento < 3 && !fatal) await sleep(lastWait || intento * 3000);
    }

    if (parsed) {
      try {
        await savePage(page, parsed, buffer, hash);
      } catch (e) {
        console.error(`[CATALOGO] Página ${page}: error guardando:`, e.message);
        stats.failed++;
        if (stats.failedPages.length < 30) stats.failedPages.push(page);
      }
    } else {
      stats.failed++;
      if (stats.failedPages.length < 30) stats.failedPages.push(page);
    }

    // ¿Se está gastando IA en vano? Cuenta solo las páginas en las que de verdad se llamó al modelo.
    intentadas++;
    const falloEstaPagina = !parsed || stats.failedPages.includes(page);
    seguidas = falloEstaPagina ? seguidas + 1 : 0;
    if (!fatal) {
      const porTasa = intentadas >= FAIL_RATE_MIN_PAGES && stats.failed / intentadas >= FAIL_RATE_LIMIT;
      if (seguidas >= MAX_CONSECUTIVE_FAILS() || porTasa) {
        const motivo = seguidas >= MAX_CONSECUTIVE_FAILS()
          ? `${seguidas} páginas seguidas fallaron`
          : `fallaron ${stats.failed} de ${intentadas} páginas`;
        fatal = `Se detuvo para no gastar IA en vano: ${motivo}. Último error: ${String(stats.lastError || 'desconocido').slice(0, 220)}. Lo ya leído quedó guardado: cuando se resuelva, vuelve a subir el mismo PDF y continúa donde quedó, sin repetir lo hecho.`;
        console.error(`[CATALOGO] ${fatal}`);
      }
    }

    done++;
    report();
  });

  stats.failedPages.sort((a, b) => a - b);
  stats.fatalError = fatal;
  return stats;
};

module.exports = { buildCatalogFromPdfImages, isVisionEnabled, MAX_PAGES, _resetGoogleState };
