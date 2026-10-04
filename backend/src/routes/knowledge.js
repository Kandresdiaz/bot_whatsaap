const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { supabase } = require('../db/supabase');
const { ownsParam, ownsRow } = require('../auth/access');
const { distributePdfKnowledge } = require('../ai/catalogExtractor');
const { isVisionEnabled, MAX_PAGES } = require('../ai/catalogVision');
const { countPageImages } = require('../ai/pdfPageImages');
const { startCatalogJob, getJob } = require('../ai/catalogJobs');

// El servidor tiene 512 MB compartidos con todas las sesiones de WhatsApp, así que los
// PDFs se procesan de a uno. Los topes salen de una medición real, no de un número al
// azar: un catálogo de 40 MB y 268 páginas llega a 182 MB de pico, porque las imágenes
// se leen de a tres y nunca se decodifica el PDF entero. Con 40 MB entra cualquier
// catálogo ilustrado normal sin que el usuario tenga que partirlo a mano.
const MAX_PDF_BYTES = 40 * 1024 * 1024;
const MAX_PDF_PAGES = 300;
const MAX_PDF_QUEUE = 5;
const CHUNK_CHARS = 1500;
const MAX_CHUNKS_PER_PDF = 40;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES } });

// Cola de un solo carril: leer un PDF ocupa CPU y RAM, y varios en paralelo
// pueden reiniciar el proceso y tumbar las sesiones de todos los clientes.
let pdfQueueTail = Promise.resolve();
let pdfQueueSize = 0;
const enqueuePdfJob = (job) => {
  pdfQueueSize++;
  const run = pdfQueueTail.then(job);
  pdfQueueTail = run.catch(() => {}).finally(() => { pdfQueueSize--; });
  return run;
};

// Parte el texto en bloques de ~CHUNK_CHARS respetando párrafos y frases, para que el
// buscador traiga solo la parte relevante y el prompt nunca reciba el PDF entero.
const splitIntoChunks = (text) => {
  const paragraphs = text.replace(/\r/g, '').split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const pieces = paragraphs.flatMap(p => p.length <= CHUNK_CHARS ? [p] : p.match(/[^.!?]+[.!?]*\s*/g) || [p]);

  const chunks = [];
  let current = '';
  for (const piece of pieces) {
    for (let i = 0; i < piece.length; i += CHUNK_CHARS) {
      const part = piece.slice(i, i + CHUNK_CHARS).trim();
      if (current && current.length + part.length + 1 > CHUNK_CHARS) {
        chunks.push(current);
        current = '';
      }
      current = current ? `${current} ${part}` : part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

const resolveBusinessId = async (idOrUserId) => {
  if (!idOrUserId) return null;
  const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  try {
    if (idOrUserId === 'admin' || !isUuid(idOrUserId)) {
      const { data: firstBus } = await supabase.from('businesses').select('id').eq('name', 'BotWA').limit(1);
      if (firstBus && firstBus[0]?.id) return firstBus[0].id;
      return '8fd9a59d-77d7-4db7-8637-9aaebca1158e';
    }

    const { data: bById } = await supabase.from('businesses').select('id').eq('id', idOrUserId).limit(1);
    if (bById && bById[0]?.id) return bById[0].id;

    // Mismo criterio que el bot: el negocio con datos cargados (ver businessResolver)
    const byUser = await resolveUserBusiness(supabase, idOrUserId, 'id');
    if (byUser?.id) return byUser.id;
  } catch (e) {}
  return null;
};

// Listar knowledge base de un business
router.get('/:businessId', ownsParam('businessId'), async (req, res) => {
  try {
    const { businessId: rawId } = req.params;
    const businessId = await resolveBusinessId(rawId);

    if (!businessId) {
      return res.json({ success: true, items: [] });
    }

    const { data: bus } = await supabase.from('businesses').select('name').eq('id', businessId).limit(1);
    const isBotWaBusiness = bus && bus[0]?.name === 'BotWA';

    const { data, error } = await supabase.from('knowledge_base').select('*').eq('business_id', businessId);
    let items = data || [];

    // Retornar FAQs sin mutaciones
    res.json({ success: true, items });
  } catch (err) {
    res.json({ success: true, items: [] });
  }
});

const { clearBusinessAiCache } = require('../ai/aiCache');
const { resolveUserBusiness } = require('../services/businessResolver');

// Agregar texto o FAQ
router.post('/:businessId', ownsParam('businessId'), async (req, res) => {
  const { businessId } = req.params;
  const { type, title, content, file_url } = req.body;

  const { data, error } = await supabase
    .from('knowledge_base')
    .insert({ business_id: businessId, type, title, content, file_url: file_url || null })
    .select()
    .single();

  if (!error) {
    clearBusinessAiCache(businessId).catch(() => {});
  }

  res.json({ success: !error, item: data, error: error?.message });
});

// Subir PDF y extraer texto
const uploadPdf = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: `El PDF pesa más de ${MAX_PDF_BYTES / 1024 / 1024} MB, que es lo máximo que el servidor puede abrir sin quedarse sin memoria. Si es un catálogo escaneado, vuelve a exportarlo con las imágenes comprimidas.` });
    }
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
};

router.post('/:businessId/upload', ownsParam('businessId'), uploadPdf, async (req, res) => {
  const { businessId } = req.params;

  if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió archivo' });
  if (req.file.mimetype !== 'application/pdf') {
    return res.status(400).json({ success: false, error: 'Solo se aceptan archivos PDF.' });
  }
  if (pdfQueueSize >= MAX_PDF_QUEUE) {
    return res.status(503).json({ success: false, error: 'Hay varios PDFs procesándose ahora mismo. Intenta de nuevo en un minuto.' });
  }

  try {
    const buffer = req.file.buffer;
    req.file.buffer = null;
    const parsed = await enqueuePdfJob(() => pdfParse(buffer, { max: MAX_PDF_PAGES }));

    const baseTitle = req.file.originalname.replace(/\.pdf$/i, '');
    const allChunks = splitIntoChunks(parsed.text || '');

    // Catálogos "de diseño": el nombre, el precio y la ficha técnica están dentro de la
    // imagen de cada página, así que pdf-parse no devuelve nada. Esas páginas las lee el
    // modelo de visión, que además deja la foto de cada producto en el catálogo.
    const { withImage } = await enqueuePdfJob(() => countPageImages(buffer, MAX_PAGES));
    const canReadImages = withImage > 0 && isVisionEnabled();

    if (allChunks.length === 0 && !canReadImages) {
      return res.status(422).json({
        success: false,
        error: withImage > 0
          ? 'El PDF es solo imágenes y la lectura por IA no está disponible (falta GEMINI_API_KEY u OPENROUTER_API_KEY).'
          : 'No se encontró texto ni imágenes aprovechables en el PDF.',
      });
    }

    const chunks = allChunks.slice(0, MAX_CHUNKS_PER_PDF);
    const truncated = allChunks.length > chunks.length || parsed.numpages > MAX_PDF_PAGES;

    const rows = chunks.map((content, i) => ({
      business_id: businessId,
      type: 'file',
      title: chunks.length > 1 ? `${baseTitle} (parte ${i + 1}/${chunks.length})` : baseTitle,
      content,
    }));

    let data = null;
    let error = null;
    if (rows.length) {
      ({ data, error } = await supabase.from('knowledge_base').insert(rows).select());
    }

    // Reparte el texto del catálogo en productos / FAQs / info sin tocar lo ya configurado.
    // Si la IA falla, igual quedan los bloques de texto crudo guardados arriba.
    let distributed = null;
    if (!error && rows.length) {
      try {
        distributed = await distributePdfKnowledge(businessId, parsed.text || '', baseTitle);
      } catch (e) {
        console.error('[CATALOGO] Falló el reparto del PDF:', e.message);
      }
    }
    if (!error) clearBusinessAiCache(businessId).catch(() => {});

    // La lectura de las páginas tarda minutos: se responde ya y el panel consulta el avance.
    let visionJob = null;
    if (canReadImages) {
      const pagesToRead = Math.min(withImage, MAX_PAGES);
      const { started, reason } = startCatalogJob(businessId, buffer, baseTitle, pagesToRead);
      visionJob = { started, reason: reason || null, pages: pagesToRead, pagesLeft: withImage - pagesToRead };
    }

    res.json({
      success: !error,
      items: data,
      item: data?.[0],
      distributed,
      visionJob,
      parts: rows.length,
      pages: parsed.numpages,
      truncated,
      error: error?.message,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error procesando PDF: ' + err.message });
  }
});

// Avance de la lectura del catálogo por imágenes (el panel lo consulta tras subir el PDF)
router.get('/:businessId/catalog-job', ownsParam('businessId'), (req, res) => {
  const job = getJob(req.params.businessId);
  if (!job) return res.json({ success: true, job: null });
  const { status, source, done, total, products, photos, faqs, info, skipped, failed, failedPages, lastError, enriched, noPrice, alreadyRead, error } = job;
  res.json({ success: true, job: { status, source, done, total, products, photos, faqs, info, skipped, failed, failedPages, lastError, enriched, noPrice, alreadyRead, error } });
});

// Activar/desactivar item
router.patch('/:id/toggle', ownsRow('knowledge_base'), async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const { data: item } = await supabase.from('knowledge_base').select('business_id').eq('id', id).single();
  await supabase.from('knowledge_base').update({ is_active }).eq('id', id);
  if (item?.business_id) {
    clearBusinessAiCache(item.business_id).catch(() => {});
  }
  res.json({ success: true });
});

// Eliminar item
router.delete('/:id', ownsRow('knowledge_base'), async (req, res) => {
  const { id } = req.params;
  const { data: item } = await supabase.from('knowledge_base').select('business_id').eq('id', id).single();
  await supabase.from('knowledge_base').delete().eq('id', id);
  if (item?.business_id) {
    clearBusinessAiCache(item.business_id).catch(() => {});
  }
  res.json({ success: true });
});

// Generar preguntas frecuentes con IA a demanda
const { generateFaqsFromChats } = require('../ai/faqGenerator');
router.post('/generate-faqs/:userId', ownsParam('userId'), async (req, res) => {
  const { userId } = req.params;
  const result = await generateFaqsFromChats(userId);
  res.json(result);
});

module.exports = router;
