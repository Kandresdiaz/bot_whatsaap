const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Helper para obtener el userId válido
const getTargetUserId = (userId) => {
  try {
    const { getValidUserId } = require('../whatsapp/sessionManager');
    return getValidUserId(userId);
  } catch (_) {
    return (!userId || userId === 'admin') ? '00000000-0000-0000-0000-000000000001' : userId;
  }
};

// Obtener o crear business del usuario
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const targetId = getTargetUserId(userId);
  
  try {
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .or(`user_id.eq.${userId},user_id.eq.${targetId}`)
      .limit(1);

    const business = (data && data.length > 0) ? data[0] : null;
    res.json({ success: true, business });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Crear o actualizar business
router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const targetId = getTargetUserId(userId);
  const fields = req.body;

  try {
    const { data: existing } = await supabase
      .from('businesses')
      .select('id')
      .or(`user_id.eq.${userId},user_id.eq.${targetId}`)
      .limit(1);

    let result;
    const configData = { ...fields, is_configured: true };

    if (existing && existing.length > 0) {
      result = await supabase.from('businesses').update(configData).eq('id', existing[0].id).select().single();
    } else {
      result = await supabase.from('businesses').insert({ ...configData, user_id: targetId }).select().single();
    }

    res.json({ success: !result.error, business: result.data, error: result.error?.message });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

module.exports = router;

