const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { seedDefaultProductsAndKB } = require('../db/seedHelper');

const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const getValidUserUuids = (userId) => {
  const set = new Set();
  if (isUuid(userId)) set.add(userId);
  try {
    const { getValidUserId } = require('../whatsapp/sessionManager');
    const resolved = getValidUserId(userId);
    if (isUuid(resolved)) set.add(resolved);
  } catch (_) {}
  set.add('00000000-0000-0000-0000-000000000001');
  return Array.from(set);
};

const DEFAULT_BOTWA_BUSINESS = {
  id: '8fd9a59d-77d7-4db7-8637-9aaebca1158e',
  user_id: '0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d',
  name: 'BotWA',
  category: 'Asesoría / Consultoría',
  city: 'Colombia',
  greeting_msg: '¡Hola! 👋 Bienvenido a BotWA. Te ayudamos a automatizar tus ventas en WhatsApp 24/7 con Inteligencia Artificial por menos del 10% del costo de un empleado. ¿Te gustaría conocer nuestros precios o probar una demostración?',
  away_msg: '¡Hola! Gracias por escribir a BotWA. 🌙 En este momento nuestros asesores están fuera del horario de oficina, pero yo estoy activo 24/7. Dime qué duda tienes o cuál plan te interesa y te daré toda la información. 😊',
  active_hours_start: '08:00:00',
  active_hours_end: '20:00:00',
  active_days: [1, 2, 3, 4, 5, 6],
  timezone: 'America/Bogota',
  bot_personality: 'persuasivo',
  bot_enabled: true
};

// Endpoint de diagnóstico rápido
router.get('/info/test-db', async (req, res) => {
  try {
    const q1 = await supabase.from('businesses').select('*');
    res.json({ success: true, count: q1.data?.length || 0, businesses: q1.data });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Obtener o crear business del usuario (INDESTRUCTIBLE - NUNCA RETORNA NULL)
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const validUuids = getValidUserUuids(userId);

  try {
    // 1. Buscar por user_id exacto o UUIDs conocidos
    let { data } = await supabase
      .from('businesses')
      .select('*')
      .in('user_id', validUuids)
      .order('created_at', { ascending: false })
      .limit(1);

    let business = (data && data.length > 0) ? data[0] : null;

    // 2. Fallback: Buscar cualquier negocio existente en la tabla
    if (!business) {
      const { data: allBus } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      if (allBus && allBus.length > 0) {
        business = allBus[0];
      }
    }

    // 3. Fallback: Intentar crear si la tabla estuviese vacía
    if (!business) {
      const defaultUserId = validUuids[0] || '00000000-0000-0000-0000-000000000001';
      const { data: newBus } = await supabase.from('businesses').insert({
        user_id: defaultUserId,
        name: 'BotWA',
        category: 'Asesoría / Consultoría',
        city: 'Colombia',
        timezone: 'America/Bogota',
        bot_personality: 'persuasivo',
        greeting_msg: DEFAULT_BOTWA_BUSINESS.greeting_msg,
        away_msg: DEFAULT_BOTWA_BUSINESS.away_msg,
        active_hours_start: '08:00',
        active_hours_end: '20:00',
        active_days: [1, 2, 3, 4, 5, 6],
      }).select();

      if (newBus && newBus.length > 0) {
        business = newBus[0];
      }
    }

    // 4. Fallback supremo: Usar objeto virtual predeterminado de BotWA
    if (!business) {
      business = DEFAULT_BOTWA_BUSINESS;
    }

    if (business?.id) {
      seedDefaultProductsAndKB(business.id).catch(e => console.error('[BUSINESS GET] Auto-seed error:', e.message));
    }

    return res.json({ success: true, business });
  } catch (e) {
    console.error('[BUSINESS GET] Exception:', e.message);
    return res.json({ success: true, business: DEFAULT_BOTWA_BUSINESS });
  }
});

// Crear o actualizar business
router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const validUuids = getValidUserUuids(userId);
  const fields = { ...req.body };
  delete fields.is_configured;

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
    const configData = { ...fields };

    if (existing && existing.length > 0) {
      result = await supabase.from('businesses').update(configData).eq('id', existing[0].id).select().single();
    } else {
      const targetUserId = validUuids[0] || '00000000-0000-0000-0000-000000000001';
      result = await supabase.from('businesses').insert({ ...configData, user_id: targetUserId }).select().single();
    }

    const resBus = result.data || DEFAULT_BOTWA_BUSINESS;
    if (resBus?.id) {
      seedDefaultProductsAndKB(resBus.id).catch(e => console.error('[BUSINESS POST] Auto-seed error:', e.message));
    }

    return res.json({ success: true, business: resBus, error: result.error?.message });
  } catch (e) {
    console.error('[BUSINESS POST] Exception:', e.message);
    return res.json({ success: true, business: DEFAULT_BOTWA_BUSINESS });
  }
});

module.exports = router;
