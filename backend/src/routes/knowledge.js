const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { supabase } = require('../db/supabase');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const resolveBusinessId = async (idOrUserId) => {
  if (!idOrUserId) return '00000000-0000-0000-0000-000000000001';
  const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  try {
    if (idOrUserId === 'admin' || !isUuid(idOrUserId)) {
      const { data: firstBus } = await supabase.from('businesses').select('id').order('created_at', { ascending: true }).limit(1);
      if (firstBus && firstBus[0]?.id) return firstBus[0].id;
      return '00000000-0000-0000-0000-000000000001';
    }

    const { data: bById } = await supabase.from('businesses').select('id').eq('id', idOrUserId).limit(1);
    if (bById && bById[0]?.id) return bById[0].id;

    const { data: bByUser } = await supabase.from('businesses').select('id').eq('user_id', idOrUserId).limit(1);
    if (bByUser && bByUser[0]?.id) return bByUser[0].id;

    const { data: fallback } = await supabase.from('businesses').select('id').limit(1);
    if (fallback && fallback[0]?.id) return fallback[0].id;
  } catch (e) {}
  return '00000000-0000-0000-0000-000000000001';
};

// Listar knowledge base de un business
router.get('/:businessId', async (req, res) => {
  try {
    const { businessId: rawId } = req.params;
    const businessId = await resolveBusinessId(rawId);

    const { data, error } = await supabase
      .from('knowledge_base')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.json({ success: true, items: [] });
    }

    let filtered = (data || []).filter(k => k.business_id === businessId);
    if (filtered.length === 0 && Array.isArray(data) && data.length > 0) {
      const defaultMatched = data.filter(k => k.business_id === '00000000-0000-0000-0000-000000000001' || !k.business_id);
      filtered = defaultMatched.length > 0 ? defaultMatched : data;
    }

    res.json({ success: true, items: filtered });
  } catch (err) {
    res.json({ success: true, items: [] });
  }
});

// Agregar texto o FAQ
router.post('/:businessId', async (req, res) => {
  const { businessId } = req.params;
  const { type, title, content } = req.body;

  const { data, error } = await supabase
    .from('knowledge_base')
    .insert({ business_id: businessId, type, title, content })
    .select()
    .single();

  res.json({ success: !error, item: data, error: error?.message });
});

// Subir PDF y extraer texto
router.post('/:businessId/upload', upload.single('file'), async (req, res) => {
  const { businessId } = req.params;

  if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió archivo' });

  try {
    const parsed = await pdfParse(req.file.buffer);
    const content = parsed.text.trim();

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        business_id: businessId,
        type: 'file',
        title: req.file.originalname,
        content,
      })
      .select()
      .single();

    res.json({ success: !error, item: data, pages: parsed.numpages });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error procesando PDF: ' + err.message });
  }
});

// Activar/desactivar item
router.patch('/:id/toggle', async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  await supabase.from('knowledge_base').update({ is_active }).eq('id', id);
  res.json({ success: true });
});

// Eliminar item
router.delete('/:id', async (req, res) => {
  await supabase.from('knowledge_base').delete().eq('id', id);
  res.json({ success: true });
});

// Generar preguntas frecuentes con IA a demanda
const { generateFaqsFromChats } = require('../ai/faqGenerator');
router.post('/generate-faqs/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = await generateFaqsFromChats(userId);
  res.json(result);
});

module.exports = router;
