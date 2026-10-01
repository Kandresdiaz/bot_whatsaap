// Leer un catálogo de 60 páginas con el modelo de visión tarda minutos: no cabe en la
// petición HTTP de subida (el proxy del panel corta antes). Se procesa en segundo plano
// y el panel consulta el avance.
//
// El estado vive en memoria: el backend corre en un solo proceso y, si se reinicia, los
// productos que ya alcanzó a guardar quedan igual en la base.
const { buildCatalogFromPdfImages } = require('./catalogVision');
const { clearBusinessAiCache } = require('./aiCache');

const jobs = new Map(); // businessId -> estado
const KEEP_FINISHED_MS = 30 * 60 * 1000;

// Un catálogo a la vez en todo el servidor: cada uno abre el PDF completo en memoria y
// los 512 MB se comparten con las sesiones de WhatsApp de todos los clientes.
let running = false;

const isBusy = () => running;

const getJob = (businessId) => jobs.get(businessId) || null;

const cleanup = () => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > KEEP_FINISHED_MS) jobs.delete(id);
  }
};

/**
 * Arranca la lectura del catálogo. No espera a que termine.
 * @returns {{started:boolean, reason?:string}}
 */
const startCatalogJob = (businessId, pdfBuffer, sourceName, totalPages = null) => {
  cleanup();
  const current = jobs.get(businessId);
  if (current?.status === 'procesando') return { started: false, reason: 'ya_en_curso' };
  if (running) return { started: false, reason: 'servidor_ocupado' };

  const job = {
    status: 'procesando',
    source: sourceName,
    done: 0,
    total: totalPages || 0,
    products: 0,
    photos: 0,
    faqs: 0,
    info: 0,
    skipped: 0,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(businessId, job);
  running = true;

  buildCatalogFromPdfImages(businessId, pdfBuffer, sourceName, (p) => {
    job.done = p.done;
    job.total = p.total;
    job.products = p.products;
    job.photos = p.photos;
  }, totalPages)
    .then((stats) => {
      Object.assign(job, stats, { status: 'listo' });
      job.done = job.total || stats.pages;
      clearBusinessAiCache(businessId).catch(() => {});
      console.log(`[CATALOGO] "${sourceName}": ${stats.products} productos (${stats.photos} con foto), ${stats.faqs} FAQs, ${stats.info} datos.`);
    })
    .catch((e) => {
      job.status = 'error';
      job.error = e.message;
      console.error('[CATALOGO] El trabajo falló:', e.message);
    })
    .finally(() => {
      job.finishedAt = Date.now();
      running = false;
    });

  return { started: true };
};

module.exports = { startCatalogJob, getJob, isBusy };
