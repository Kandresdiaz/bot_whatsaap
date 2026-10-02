// Saca la foto de cada página de un PDF (catálogos "de diseño", donde todo —nombre,
// precio y especificaciones— está dentro de la imagen y pdf-parse no devuelve texto).
//
// No renderiza la página: toma las imágenes que el PDF ya trae incrustadas, así que no
// hace falta poppler, ni canvas, ni ningún binario externo. De cada página se queda con
// la imagen más grande, que es la foto del producto (los logos y adornos se descartan).
const zlib = require('zlib');
const { PDFDocument, PDFName, PDFDict, PDFRawStream } = require('pdf-lib');

// sharp llega como dependencia de Baileys. Si faltara, se usa el JPEG original.
let sharp = null;
try { sharp = require('sharp'); } catch (_) {}

// Por debajo de esto es un logo, un ícono o una marca de agua, no la foto del producto.
const MIN_PIXELS = 120000; // ~350x350

// Lo que se le manda al modelo de visión: suficiente para leer los precios impresos,
// pequeño para no disparar el ancho de banda del servidor.
const MAX_WIDTH = 1100;
const JPEG_QUALITY = 72;

const asString = (v) => (v == null ? '' : String(v));

const dictGet = (dict, key) => {
  try { return dict.get(PDFName.of(key)); } catch (_) { return undefined; }
};

// Cuántos bytes por píxel trae el mapa de bits cuando la imagen no es un JPEG.
const channelsOf = (dict, context) => {
  let cs = dictGet(dict, 'ColorSpace');
  try { if (cs && context) cs = context.lookupMaybe(cs, PDFDict) || cs; } catch (_) {}
  const txt = asString(cs);
  if (txt.includes('DeviceGray') || txt.includes('CalGray')) return 1;
  if (txt.includes('DeviceRGB') || txt.includes('CalRGB')) return 3;
  if (txt.includes('DeviceCMYK')) return 4;
  return 0; // indexada, ICC rara, etc.: no se reconstruye
};

/**
 * Convierte un XObject de imagen en un JPEG utilizable.
 * @returns {Promise<Buffer|null>}
 */
const streamToJpeg = async (stream, context) => {
  const dict = stream.dict;
  const filters = asString(dictGet(dict, 'Filter'));
  const width = Number(asString(dictGet(dict, 'Width'))) || 0;
  const height = Number(asString(dictGet(dict, 'Height'))) || 0;
  const bits = Number(asString(dictGet(dict, 'BitsPerComponent'))) || 8;
  if (width * height < MIN_PIXELS) return null;

  let bytes = Buffer.from(stream.getContents());

  // Muchos compresores de PDF guardan el JPEG dentro de un Flate: hay que desinflarlo
  // antes de encontrarse con el JPEG de verdad.
  if (filters.includes('FlateDecode')) {
    // Un Predictor significa que los bytes vienen filtrados fila por fila; eso solo
    // aparece en bitmaps crudos y reconstruirlo no vale la pena.
    if (asString(dictGet(dict, 'DecodeParms')).includes('Predictor')) return null;
    try { bytes = zlib.inflateSync(bytes); } catch (_) { return null; }
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (isJpeg || filters.includes('DCTDecode')) return isJpeg ? bytes : null;

  // Mapa de bits sin comprimir: se arma el JPEG a partir de los píxeles.
  if (!sharp || bits !== 8) return null;
  const channels = channelsOf(dict, context);
  if (channels !== 1 && channels !== 3) return null;
  if (bytes.length < width * height * channels) return null;
  try {
    return await sharp(bytes.subarray(0, width * height * channels), { raw: { width, height, channels } })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch (_) {
    return null;
  }
};

// Deja la foto en un tamaño razonable antes de subirla y de mandarla al modelo.
const shrink = async (jpeg) => {
  if (!sharp) return jpeg;
  try {
    const out = await sharp(jpeg)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return out.length < jpeg.length ? out : jpeg;
  } catch (_) {
    return jpeg;
  }
};

// La imagen más grande de la página = la foto del producto.
const pageImage = async (page) => {
  const context = page.node.context;
  let resources = null;
  try { resources = page.node.Resources(); } catch (_) {}
  const xobjects = resources && resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobjects) return null;

  let best = null;
  for (const [, ref] of xobjects.entries()) {
    let stream = null;
    try { stream = context.lookup(ref); } catch (_) { continue; }
    if (!(stream instanceof PDFRawStream)) continue;
    if (asString(dictGet(stream.dict, 'Subtype')) !== '/Image') continue;

    const area = (Number(asString(dictGet(stream.dict, 'Width'))) || 0) * (Number(asString(dictGet(stream.dict, 'Height'))) || 0);
    if (!best || area > best.area) best = { stream, area };
  }
  if (!best) return null;

  const jpeg = await streamToJpeg(best.stream, context);
  return jpeg ? shrink(jpeg) : null;
};

/**
 * Recorre las páginas del PDF y entrega la foto de cada una al callback.
 * Las páginas se leen de a pocas a la vez para no tener todo el catálogo en memoria:
 * el servidor comparte 512 MB con las sesiones de WhatsApp de todos los clientes.
 *
 * @param {Buffer} pdfBuffer
 * @param {{maxPages?:number, concurrency?:number}} opts
 * @param {(img:{page:number, buffer:Buffer}) => Promise<void>} onPage
 * @returns {Promise<{totalPages:number, processed:number}>}
 */
const forEachPageImage = async (pdfBuffer, opts, onPage) => {
  const { maxPages = 80, concurrency = 3, shouldStop = null } = opts || {};
  const doc = await PDFDocument.load(pdfBuffer, {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
  });
  const pages = doc.getPages();
  const limit = Math.min(pages.length, maxPages);

  let next = 0;
  let processed = 0;
  const worker = async () => {
    // shouldStop deja de sacar imágenes en cuanto el trabajo se cortó: no tiene sentido
    // extraer las páginas que ya no se van a leer.
    while (next < limit && !(shouldStop && shouldStop())) {
      const i = next++;
      let buffer = null;
      try {
        buffer = await pageImage(pages[i]);
      } catch (e) {
        console.error(`[CATALOGO] Página ${i + 1}: no se pudo leer la imagen (${e.message})`);
      }
      if (!buffer) continue;
      processed++;
      await onPage({ page: i + 1, buffer });
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { totalPages: pages.length, processed };
};

/** Cuántas páginas del PDF traen una imagen aprovechable (sin procesarlas). */
const countPageImages = async (pdfBuffer, maxPages = 80) => {
  try {
    const doc = await PDFDocument.load(pdfBuffer, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    const pages = doc.getPages();
    const limit = Math.min(pages.length, maxPages);
    let withImage = 0;
    for (let i = 0; i < limit; i++) {
      let resources = null;
      try { resources = pages[i].node.Resources(); } catch (_) { continue; }
      const xobjects = resources && resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
      if (!xobjects) continue;
      for (const [, ref] of xobjects.entries()) {
        let stream = null;
        try { stream = pages[i].node.context.lookup(ref); } catch (_) { continue; }
        if (!(stream instanceof PDFRawStream)) continue;
        if (asString(dictGet(stream.dict, 'Subtype')) !== '/Image') continue;
        const area = (Number(asString(dictGet(stream.dict, 'Width'))) || 0) * (Number(asString(dictGet(stream.dict, 'Height'))) || 0);
        if (area >= MIN_PIXELS) { withImage++; break; }
      }
    }
    return { totalPages: pages.length, withImage };
  } catch (e) {
    console.error('[CATALOGO] No se pudo abrir el PDF para contar imágenes:', e.message);
    return { totalPages: 0, withImage: 0 };
  }
};

module.exports = { forEachPageImage, countPageImages, MAX_WIDTH };
