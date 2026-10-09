// ¿El cliente quiere ver el catálogo o la lista completa? Se decide con reglas, sin IA, para que
// estas peticiones no gasten una llamada extra ni se confundan con la búsqueda de un producto
// ("catálogo" y "completo" no son nombres de producto: antes se buscaban como si lo fueran).

const normalize = (text) => (text || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Incluye los errores de tipeo frecuentes: "catlog", "catalgo", "catalago"
const CATALOG_WORD_RE = /\b(catalog\w*|catalg\w*|catlog\w*|catalag\w*|katalog\w*|portafolio|brochure|folleto)\b/;
// Pedirlo: "mándame", "me pasas", "tienen catálogo?", "quiero ver", "el catálogo completo"
const ASK_RE = /\b(mand\w*|envi\w*|pas[ae]\w*|compart\w*|regal\w*|ver|veo|mostr\w*|muestr\w*|quiero|quisiera|tienen|tienes|manejan|hay|das|dan|dame|facilit\w*|adjunt\w*|complet\w*|comple|pdf|link|enlace)\b/;
// Pregunta por algo DEL catálogo, no por el catálogo: "¿la EM22 del catálogo tiene garantía?"
const ABOUT_ITEM_RE = /\b(garantia|cuanto|vale|cuesta|precio de|envio|envian a|disponib\w*|stock|color|colores|talla|medidas|bateria|autonomia|descuento)\b/;
// Ya lo tiene, o no lo quiere
const DECLINE_RE = /\b(no (me )?(lo |la )?(mand|envi|pas|necesit|quier)\w*|ya (lo |la )?(tengo|vi|revise|mire|descargue|recibi)|sin (el )?catalogo)\b/;

// Lista de lo que hay (de todo o de una categoría), con o sin la palabra "catálogo"
const LIST_RE = /\b(lista\w*|listado|inventario|portafolio|todo lo que (hay|tienen|tienes|venden|manejan)|(ver|mostrar|muestrame|ensename) todo|(ver|mostrar|muestrame|ensename|cuales son|que) tod[oa]s (los|las) \w{3,}|tod[oa]s (los|las) (referencias|modelos|productos|opciones|tipos|precios)|que (mas|otras cosas) (hay|tienen|tienes|manejan|venden|ofrecen)|(el|la|su) (menu|carta))\b/;

/** Pide el catálogo en sí ("mándame el catálogo", "tienen catálogo?", "manden e catlog comple"). */
const isCatalogRequest = (text) => {
  const norm = normalize(text);
  if (!norm || !CATALOG_WORD_RE.test(norm) || DECLINE_RE.test(norm) || ABOUT_ITEM_RE.test(norm)) return false;
  const words = norm.split(' ').length;
  // Mensajes largos con "catálogo" suelen ser otra cosa ("¿la EM22 que vi en el catálogo tiene garantía?")
  return words <= 4 || (words <= 14 && ASK_RE.test(norm));
};

/** Quiere ver la lista completa (de todo o de una categoría): "la lista de precios", "qué más hay". */
const isBrowseRequest = (text) => {
  const norm = normalize(text);
  if (!norm || DECLINE_RE.test(norm)) return false;
  return isCatalogRequest(text) || LIST_RE.test(norm);
};

// Pide TODO, no una categoría ni "más opciones": "la lista de precios", "muéstrame todo"
const FULL_LIST_RE = /\b(lista de precios|listado (completo|de precios)|lista completa|todo lo que (hay|tienen|tienes|venden|manejan)|(ver|mostrar|muestrame|ensename|mandame|enviame) todo)\b/;

/** Pide el catálogo o la lista completa: se responde con el PDF o la lista entera, sin IA. */
const isFullListRequest = (text) => {
  const norm = normalize(text);
  if (!norm || DECLINE_RE.test(norm)) return false;
  return isCatalogRequest(text) || FULL_LIST_RE.test(norm);
};

module.exports = { isCatalogRequest, isBrowseRequest, isFullListRequest, normalizeIntentText: normalize };
