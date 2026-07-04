const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { supabase } = require('../db/supabase');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Listar knowledge base de un business
router.get('/:businessId', async (req, res) => {
  const { businessId } = req.params;
  const { data } = await supabase
    .from('knowledge_base')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  res.json({ success: true, items: data || [] });
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

module.exports = router;
