const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Login simple con email + password
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Admin hardcoded
  if (email === 'admin@bot.com' && password === process.env.ADMIN_PASSWORD) {
    // Asegurar que el administrador tenga un registro de negocio en Supabase para sus pruebas
    try {
      const { data: bus } = await supabase.from('businesses').select('id').eq('user_id', 'admin').single();
      if (!bus) {
        await supabase.from('businesses').insert({
          user_id: 'admin',
          name: 'BotWA Ventas',
          category: 'Tecnología',
          city: 'Medellín',
          timezone: 'America/Bogota'
        });
      }
    } catch (e) {
      console.error('Error asegurando negocio de admin:', e.message);
    }

    return res.json({
      success: true,
      user: { id: 'admin', email, name: 'Admin', is_admin: true, plan: 'business' },
      token: Buffer.from(`admin:${Date.now()}`).toString('base64'),
    });
  }

  // Usuario normal
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (!user || error) {
    return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
  }

  // Verificar estado
  if (user.status === 'paused' || user.status === 'cancelled') {
    return res.status(403).json({ success: false, error: 'Cuenta pausada. Contacta al administrador.' });
  }

  const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
  res.json({ success: true, user, token });
});

// Registrar nuevo usuario (solo admin puede crear)
router.post('/register', async (req, res) => {
  const { email, name, phone, plan, adminKey } = req.body;

  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'No autorizado' });
  }

  const tempPassword = Math.random().toString(36).slice(-8);

  const { data: user, error } = await supabase
    .from('users')
    .insert({ email, name, phone, plan: plan || 'trial', status: 'trial' })
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, error: error.message });

  res.json({ success: true, user, tempPassword });
});

module.exports = router;
