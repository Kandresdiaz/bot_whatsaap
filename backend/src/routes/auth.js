const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });

  // Admin hardcodeado
  if (email === 'admin@bot.com' && password === process.env.ADMIN_PASSWORD) {
    // Crear negocio de admin si no existe (sin bloquear login si falla)
    try {
      const { data: bus } = await supabase.from('businesses').select('id').eq('user_id', 'admin').maybeSingle();
      if (!bus) {
        await supabase.from('businesses').insert({
          user_id: 'admin',
          name: 'BotWA Ventas',
          category: 'Tecnología',
          city: 'Medellín',
          timezone: 'America/Bogota',
          bot_personality: 'amigable, profesional y experto en IA para WhatsApp',
          active_hours_start: '08:00',
          active_hours_end: '22:00',
          active_days: [1, 2, 3, 4, 5, 6],
        });
        console.log('[AUTH] Negocio de admin creado');
      }
    } catch (e) {
      console.error('[AUTH] Error creando negocio admin (no crítico):', e.message);
    }

    return res.json({
      success: true,
      user: { id: 'admin', email, name: 'Admin BotWA', is_admin: true, plan: 'business' },
      token: Buffer.from(`admin:${Date.now()}`).toString('base64'),
    });
  }

  // Usuario normal desde Supabase
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!user || error) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    if (user.status === 'paused' || user.status === 'cancelled') {
      return res.status(403).json({ success: false, error: 'Cuenta pausada. Contacta al administrador.' });
    }

    const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
    return res.json({ success: true, user, token });
  } catch (e) {
    console.error('[AUTH] Error en login:', e.message);
    return res.status(500).json({ success: false, error: 'Error del servidor' });
  }
});

// ── Registrar usuario (solo admin) ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, name, phone, plan, adminKey } = req.body;

  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'No autorizado' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .insert({ email, name, phone, plan: plan || 'trial', status: 'trial' })
      .select()
      .maybeSingle();

    if (error) return res.status(400).json({ success: false, error: error.message });

    const tempPassword = Math.random().toString(36).slice(-8);
    return res.json({ success: true, user, tempPassword });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
