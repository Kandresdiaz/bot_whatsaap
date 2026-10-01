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

module.exports = { uploadPublicImage, BUCKET };
