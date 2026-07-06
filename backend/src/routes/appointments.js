const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Listar citas de un negocio
router.get('/:businessId', async (req, res) => {
  const { businessId } = req.params;
  const { status, date } = req.query;

  let query = supabase
    .from('appointments')
    .select('*')
    .eq('business_id', businessId)
    .order('appointment_date', { ascending: true })
    .order('appointment_time', { ascending: true });

  if (status) query = query.eq('status', status);
  if (date) query = query.eq('appointment_date', date);

  const { data, error } = await query;
  res.json({ success: true, appointments: data || [] });
});

// Actualizar estado de cita
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const updates = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  await supabase.from('appointments').update(updates).eq('id', id);
  res.json({ success: true });
});

// Eliminar cita
router.delete('/:id', async (req, res) => {
  await supabase.from('appointments').delete().eq('id', req.params.id);
  res.json({ success: true });
});

module.exports = router;
