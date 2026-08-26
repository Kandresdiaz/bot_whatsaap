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

const { seedDefaultProductsAndKB } = require('../db/seedHelper');

// Obtener o crear business del usuario
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const targetId = getTargetUserId(userId);
  
  try {
    let { data } = await supabase
      .from('businesses')
      .select('*')
      .or(`user_id.eq.${userId},user_id.eq.${targetId}`)
      .order('created_at', { ascending: false })
      .limit(1);

    let business = (data && data.length > 0) ? data[0] : null;

    if (!business) {
      const { data: fallback } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      if (fallback && fallback.length > 0) {
        business = fallback[0];
      }
    }

    if (!business && targetId && targetId !== 'admin') {
      const { data: newBus } = await supabase.from('businesses').insert({
        user_id: targetId,
        name: 'Mi Negocio',
        category: 'General',
        city: 'Colombia',
        timezone: 'America/Bogota',
        bot_personality: 'amigable, profesional y experto',
        active_hours_start: '08:00',
        active_hours_end: '22:00',
        active_days: [0, 1, 2, 3, 4, 5, 6],
        is_configured: false,
      }).select().single();
      business = newBus;
    }

    if (business?.id) {
      seedDefaultProductsAndKB(business.id).catch(e => console.error('[BUSINESS GET] Auto-seed error:', e.message));
    }

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

    if (result.data?.id) {
      seedDefaultProductsAndKB(result.data.id).catch(e => console.error('[BUSINESS POST] Auto-seed error:', e.message));
    }

    res.json({ success: !result.error, business: result.data, error: result.error?.message });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

module.exports = router;

