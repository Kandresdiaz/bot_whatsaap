const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { seedDefaultProductsAndKB } = require('../db/seedHelper');

const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const PRIMARY_ADMIN_ID = '0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d';

const resolveTargetUserId = (userId) => {
  if (!userId || userId === 'admin' || userId === '00000000-0000-0000-0000-000000000001') {
    return PRIMARY_ADMIN_ID;
  }
  return userId;
};

const DEFAULT_BOTWA_BUSINESS = {
  id: '8fd9a59d-77d7-4db7-8637-9aaebca1158e',
  user_id: PRIMARY_ADMIN_ID,
  name: 'BotWA',
  category: 'Automatización de WhatsApp con IA',
  city: 'Colombia',
  description: 'Plataforma SaaS de bots de WhatsApp con Inteligencia Artificial 24/7 para atención al cliente, ventas y agendamiento comercial.',
  greeting_msg: '¡Hola! 👋 Bienvenido a BotWA. Te ayudamos a automatizar tus ventas en WhatsApp 24/7 con Inteligencia Artificial por menos del 10% del costo de un empleado. ¿Te gustaría conocer nuestros precios o probar una demostración?',
  away_msg: '¡Hola! Gracias por escribir a BotWA. 🌙 En este momento nuestros asesores están fuera del horario de oficina, pero yo estoy activo 24/7. Dime qué duda tienes o cuál plan te interesa y te daré toda la información. 😊',
  active_hours_start: '08:00:00',
  active_hours_end: '20:00:00',
  active_days: [1, 2, 3, 4, 5, 6],
  timezone: 'America/Bogota',
  bot_personality: 'persuasivo',
  bot_enabled: true,
  main_goal: 'vender',
  closing_instructions: 'Para cerrar, solicita con entusiasmo: Nombre completo, correo o ciudad y método de pago preferido.',
  custom_instructions: 'Actúa como asesor comercial consultivo: sigue la cuerda al cliente, valida sus necesidades, pregunta antes de suponer y responde en menos de 4 líneas.',
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

// Obtener o crear business del usuario (AISLAMIENTO TOTAL POR USUARIO)
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const targetUserId = resolveTargetUserId(userId);

  try {
    // 1. Buscar el negocio propio de este usuario exacto
    let { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1);

    let business = (data && data.length > 0) ? data[0] : null;

    // 2. Si no existe aún registro para este usuario, crearlo con su propio user_id
    if (!business) {
      const isPrimaryAdmin = targetUserId === PRIMARY_ADMIN_ID;
      const initialName = isPrimaryAdmin ? 'BotWA' : 'Mi Negocio';
      const initialCategory = isPrimaryAdmin ? 'Automatización de WhatsApp con IA' : 'General';
      const initialDesc = isPrimaryAdmin ? DEFAULT_BOTWA_BUSINESS.description : 'Atención comercial y asesoría para clientes.';

      const { data: newBus } = await supabase.from('businesses').insert({
        user_id: targetUserId,
        name: initialName,
        category: initialCategory,
        description: initialDesc,
        city: 'Colombia',
        timezone: 'America/Bogota',
        bot_personality: 'persuasivo',
        greeting_msg: isPrimaryAdmin ? DEFAULT_BOTWA_BUSINESS.greeting_msg : `¡Hola! 👋 Bienvenido a ${initialName}. ¿En qué te podemos ayudar hoy?`,
        away_msg: isPrimaryAdmin ? DEFAULT_BOTWA_BUSINESS.away_msg : 'Gracias por escribirnos 🙏 En este momento estamos fuera de horario. Te respondemos pronto.',
        active_hours_start: '08:00:00',
        active_hours_end: '20:00:00',
        active_days: [1, 2, 3, 4, 5, 6],
        main_goal: 'vender',
        bot_enabled: true,
      }).select().single();

      if (newBus) {
        business = newBus;
      }
    }

    if (!business) {
      business = { ...DEFAULT_BOTWA_BUSINESS, user_id: targetUserId };
    }

    if (business?.id && business.name === 'BotWA') {
      seedDefaultProductsAndKB(business.id).catch(e => console.error('[BUSINESS GET] Auto-seed error:', e.message));
    }

    return res.json({ success: true, business });
  } catch (e) {
    console.error('[BUSINESS GET] Exception:', e.message);
    return res.json({ success: true, business: { ...DEFAULT_BOTWA_BUSINESS, user_id: targetUserId } });
  }
});

// Crear o actualizar business del usuario
router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const targetUserId = resolveTargetUserId(userId);
  const fields = { ...req.body };
  delete fields.is_configured;

  try {
    // Buscar si este usuario ya tiene un negocio registrado
    const { data: existing } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1);

    let result;
    const configData = { ...fields, user_id: targetUserId };

    if (existing && existing.length > 0) {
      result = await supabase.from('businesses').update(configData).eq('id', existing[0].id).select().single();
    } else {
      result = await supabase.from('businesses').insert(configData).select().single();
    }

    const resBus = result.data || { ...DEFAULT_BOTWA_BUSINESS, ...configData };
    if (resBus?.id) {
      const { clearBusinessAiCache } = require('../ai/aiCache');
      clearBusinessAiCache(resBus.id).catch(() => {});
      if (resBus.name === 'BotWA') {
        seedDefaultProductsAndKB(resBus.id).catch(e => console.error('[BUSINESS POST] Auto-seed error:', e.message));
      }
    }

    return res.json({ success: true, business: resBus, error: result.error?.message });
  } catch (e) {
    console.error('[BUSINESS POST] Exception:', e.message);
    return res.json({ success: true, business: { ...DEFAULT_BOTWA_BUSINESS, user_id: targetUserId } });
  }
});

module.exports = router;
