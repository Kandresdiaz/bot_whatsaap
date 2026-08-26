const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { seedDefaultProductsAndKB } = require('../db/seedHelper');

const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Helper para obtener una lista de UUIDs válidos para buscar en Supabase
const getValidUserUuids = (userId) => {
  const set = new Set();

  if (isUuid(userId)) {
    set.add(userId);
  }

  try {
    const { getValidUserId } = require('../whatsapp/sessionManager');
    const resolved = getValidUserId(userId);
    if (isUuid(resolved)) set.add(resolved);
  } catch (_) {}

  // UUID por defecto de admin
  set.add('00000000-0000-0000-0000-000000000001');

  return Array.from(set);
};

// Obtener o crear business del usuario
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const validUuids = getValidUserUuids(userId);

  try {
    // Buscar negocio por cualquiera de los UUIDs válidos (nunca pasar strings no-UUID como 'admin')
    let { data } = await supabase
      .from('businesses')
      .select('*')
      .in('user_id', validUuids)
      .order('created_at', { ascending: false })
      .limit(1);

    let business = (data && data.length > 0) ? data[0] : null;

    // Fallback: si no encuentra por user_id, buscar el negocio más reciente configurado en la DB
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

    // Si aún así no existe ningún negocio en la DB, crear uno nuevo
    if (!business) {
      const defaultUserId = validUuids[0] || '00000000-0000-0000-0000-000000000001';
      const { data: newBus } = await supabase.from('businesses').insert({
        user_id: defaultUserId,
        name: 'BotWA',
        category: 'Asesoría / Consultoría',
        city: 'Colombia',
        timezone: 'America/Bogota',
        bot_personality: 'persuasivo',
        active_hours_start: '08:00',
        active_hours_end: '20:00',
        active_days: [1, 2, 3, 4, 5, 6],
        is_configured: true,
      }).select().single();
      business = newBus;
    }

    if (business?.id) {
      seedDefaultProductsAndKB(business.id).catch(e => console.error('[BUSINESS GET] Auto-seed error:', e.message));
    }

    res.json({ success: true, business });
  } catch (e) {
    console.error('[BUSINESS GET] Error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// Crear o actualizar business
router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const validUuids = getValidUserUuids(userId);
  const fields = req.body;

  try {
    let { data: existing } = await supabase
      .from('businesses')
      .select('id')
      .in('user_id', validUuids)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!existing || existing.length === 0) {
      const { data: fallback } = await supabase
        .from('businesses')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);
      existing = fallback;
    }

    let result;
    const configData = { ...fields, is_configured: true };

    if (existing && existing.length > 0) {
      result = await supabase.from('businesses').update(configData).eq('id', existing[0].id).select().single();
    } else {
      const targetUserId = validUuids[0] || '00000000-0000-0000-0000-000000000001';
      result = await supabase.from('businesses').insert({ ...configData, user_id: targetUserId }).select().single();
    }

    if (result.data?.id) {
      seedDefaultProductsAndKB(result.data.id).catch(e => console.error('[BUSINESS POST] Auto-seed error:', e.message));
    }

    res.json({ success: !result.error, business: result.data, error: result.error?.message });
  } catch (e) {
    console.error('[BUSINESS POST] Error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

module.exports = router;
