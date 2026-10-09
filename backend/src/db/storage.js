// Subida de imágenes a Supabase Storage. El bot envía las fotos de producto con
// { image: { url } }, así que necesitan una URL pública y estable.
const { supabase } = require('./supabase');

const BUCKET = 'catalogo';

let ensured = null;

// Crea el bucket la primera vez. Si ya existe, Supabase responde error y se ignora.
const ensureBucket = async () => {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      const { data } = await supabase.storage.getBucket(BUCKET);
      if (data) return true;
      const { error } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 3 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      });
      if (error && !/exists/i.test(error.message)) {
        console.error('[STORAGE] No se pudo crear el bucket:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[STORAGE] Error verificando el bucket:', e.message);
      return false;
    }
  })();
  return ensured;
};

/**
 * @returns {Promise<string|null>} URL pública, o null si Storage no está disponible
 *          (el llamador debe seguir sin foto en vez de fallar).
 */
const uploadPublicImage = async (path, buffer, contentType = 'image/jpeg') => {
  if (!buffer?.length) return null;
  if (!(await ensureBucket())) return null;
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: true,
      cacheControl: '31536000',
    });
    if (error) {
      console.error('[STORAGE] Error subiendo imagen:', error.message);
      return null;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.error('[STORAGE] Excepción subiendo imagen:', e.message);
    return null;
  }
};

// ─── Catálogo en PDF que el bot le envía al cliente ──────────────────────────
// Un PDF por negocio en "<businessId>/<nombre>.pdf". Sin tabla nueva: lo que existe en
// Storage es la fuente de verdad, y se consulta con caché para no listar en cada mensaje.
const PDF_BUCKET = 'catalogos-pdf';
const PDF_CACHE_MS = 10 * 60 * 1000;
const pdfCache = new Map(); // businessId → { value, expiresAt }

let pdfEnsured = null;
const ensurePdfBucket = async () => {
  if (pdfEnsured) return pdfEnsured;
  pdfEnsured = (async () => {
    try {
      const { data } = await supabase.storage.getBucket(PDF_BUCKET);
      if (data) return true;
      const { error } = await supabase.storage.createBucket(PDF_BUCKET, {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024,
        allowedMimeTypes: ['application/pdf'],
      });
      if (error && !/exists/i.test(error.message)) {
        console.error('[STORAGE] No se pudo crear el bucket de PDFs:', error.message);
        pdfEnsured = null; // se reintenta en la próxima subida
        return false;
      }
      return true;
    } catch (e) {
      console.error('[STORAGE] Error verificando el bucket de PDFs:', e.message);
      pdfEnsured = null;
      return false;
    }
  })();
  return pdfEnsured;
};

const listCatalogPdfFiles = async (businessId) => {
  const { data, error } = await supabase.storage.from(PDF_BUCKET).list(businessId, { limit: 20 });
  if (error) throw error;
  return (data || []).filter(f => f.name && /\.pdf$/i.test(f.name));
};

/**
 * @returns {Promise<{url: string, fileName: string, size: number|null}|null>} El PDF del
 *          catálogo del negocio, o null si no subió ninguno (o Storage no responde).
 */
const getCatalogPdf = async (businessId) => {
  if (!businessId) return null;
  const hit = pdfCache.get(businessId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  let value = null;
  try {
    const [file] = await listCatalogPdfFiles(businessId);
    if (file) {
      const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(`${businessId}/${file.name}`);
      // La versión en la URL hace que un PDF nuevo no reuse la subida a WhatsApp del anterior
      const version = new Date(file.updated_at || file.created_at || 0).getTime();
      value = data?.publicUrl
        ? { url: `${data.publicUrl}?v=${version}`, fileName: file.name, size: file.metadata?.size ?? null }
        : null;
    }
  } catch (e) {
    console.error('[STORAGE] Error consultando el PDF del catálogo:', e.message);
  }
  pdfCache.set(businessId, { value, expiresAt: Date.now() + PDF_CACHE_MS });
  return value;
};

const removeCatalogPdf = async (businessId) => {
  pdfCache.delete(businessId);
  const files = await listCatalogPdfFiles(businessId).catch(() => []);
  if (files.length) await supabase.storage.from(PDF_BUCKET).remove(files.map(f => `${businessId}/${f.name}`));
  pdfCache.delete(businessId);
  return files.length;
};

// Reemplaza el PDF del catálogo del negocio (solo se guarda el último).
const saveCatalogPdf = async (businessId, buffer, title) => {
  if (!businessId || !buffer?.length) return null;
  if (!(await ensurePdfBucket())) return null;
  const safeName = `${(title || 'catalogo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'catalogo'}.pdf`;
  try {
    await removeCatalogPdf(businessId);
    const { error } = await supabase.storage.from(PDF_BUCKET).upload(`${businessId}/${safeName}`, buffer, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '86400',
    });
    if (error) {
      console.error('[STORAGE] Error guardando el PDF del catálogo:', error.message);
      return null;
    }
    pdfCache.delete(businessId);
    return getCatalogPdf(businessId);
  } catch (e) {
    console.error('[STORAGE] Excepción guardando el PDF del catálogo:', e.message);
    return null;
  }
};

module.exports = { uploadPublicImage, BUCKET, getCatalogPdf, saveCatalogPdf, removeCatalogPdf };
