const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Obtener o crear business del usuario
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data } = await supabase.from('businesses').select('*').eq('user_id', userId).single();
  res.json({ success: true, business: data });
});

// Crear o actualizar business
router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const fields = req.body;

  const { data: existing } = await supabase.from('businesses').select('id').eq('user_id', userId).single();

  let result;
  if (existing) {
    result = await supabase.from('businesses').update(fields).eq('user_id', userId).select().single();
  } else {
    result = await supabase.from('businesses').insert({ ...fields, user_id: userId }).select().single();
  }

  res.json({ success: !result.error, business: result.data, error: result.error?.message });
});

module.exports = router;
