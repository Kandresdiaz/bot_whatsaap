const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

const ADMIN_UUID = '00000000-0000-0000-0000-000000000001';

// Helper para verificar si un email es Super Admin
const checkIsAdmin = (email, dbUserIsAdmin) => {
  if (dbUserIsAdmin === true) return true;
  if (!email) return false;
  const rawAdminEmails = process.env.SUPER_ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'admin@bot.com,kevina0416@gmail.com';
  const adminList = rawAdminEmails.split(',').map(e => e.trim().toLowerCase());
  return adminList.includes(email.trim().toLowerCase());
};

// ── Login con Email/Password ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });

  // Admin hardcodeado legacy o email configurado
  if ((email === 'admin@bot.com' || checkIsAdmin(email, false)) && password === (process.env.ADMIN_PASSWORD || 'admin123')) {
    try {
      const { data: u } = await supabase.from('users').select('id').eq('id', ADMIN_UUID).maybeSingle();
      if (!u) {
        await supabase.from('users').insert({
          id: ADMIN_UUID,
          email: 'admin@bot.com',
          name: 'Admin BotWA',
          plan: 'business',
          status: 'active',
          is_admin: true
        });
      }

      const { data: bus } = await supabase.from('businesses').select('id').eq('user_id', ADMIN_UUID).maybeSingle();
      if (!bus) {
        await supabase.from('businesses').insert({
          user_id: ADMIN_UUID,
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
      console.error('[AUTH] Error creando usuario/negocio admin (no crítico):', e.message);
    }

    return res.json({
      success: true,
      user: { id: ADMIN_UUID, email, name: 'Admin BotWA', is_admin: true, plan: 'business' },
      token: Buffer.from(`${ADMIN_UUID}:${Date.now()}`).toString('base64'),
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

    const isAdmin = checkIsAdmin(user.email, user.is_admin);
    const finalUser = { ...user, is_admin: isAdmin };
    const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
    return res.json({ success: true, user: finalUser, token });
  } catch (e) {
    console.error('[AUTH] Error en login:', e.message);
    return res.status(500).json({ success: false, error: 'Error del servidor' });
  }
});

// ── Google OAuth Sync ─────────────────────────────────────────────────────────
router.post('/google', async (req, res) => {
  const { id, email, name } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email es requerido para iniciar sesión con Google' });
  }

  try {
    // 1. Buscar si el usuario ya existe por email
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    const isAdmin = checkIsAdmin(email, user?.is_admin);

    if (!user) {
      // 2. Si no existe en la BD `users`, lo creamos
      const insertPayload = {
        email,
        name: name || email.split('@')[0],
        plan: isAdmin ? 'business' : 'starter',
        status: 'active',
        is_admin: isAdmin,
      };
      if (id && id.length > 10) insertPayload.id = id;

      const { data: newUser, error: createErr } = await supabase
        .from('users')
        .insert(insertPayload)
        .select()
        .maybeSingle();

      if (createErr) {
        console.error('[AUTH] Error insertando usuario Google en DB:', createErr.message);
        // Fallback en memoria si falla la BD
        user = {
          id: id || 'g_' + Date.now(),
          email,
          name: name || email.split('@')[0],
          plan: isAdmin ? 'business' : 'starter',
          status: 'active',
          is_admin: isAdmin
        };
      } else {
        user = newUser;
      }
    } else {
      // Si ya existe pero ahora es admin via env variable
      if (isAdmin && !user.is_admin) {
        user.is_admin = true;
        try {
          await supabase.from('users').update({ is_admin: true }).eq('id', user.id);
        } catch (_) {}
      }
    }

    // 3. Asegurar que tenga un negocio creado en `businesses`
    if (user && user.id) {
      try {
        const { data: bus } = await supabase
          .from('businesses')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!bus) {
          await supabase.from('businesses').insert({
            user_id: user.id,
            name: `Negocio de ${user.name || email.split('@')[0]}`,
            category: 'General',
            city: 'Medellín',
            timezone: 'America/Bogota',
            bot_personality: 'amigable, profesional y experto en IA para WhatsApp',
            active_hours_start: '08:00',
            active_hours_end: '22:00',
            active_days: [1, 2, 3, 4, 5, 6],
          });
          console.log('[AUTH] Negocio creado automáticamente para usuario Google:', user.email);
        }
      } catch (busErr) {
        console.error('[AUTH] Error comprobando negocio de usuario Google:', busErr.message);
      }
    }

    const finalUser = {
      ...user,
      is_admin: isAdmin || user?.is_admin === true
    };

    const token = Buffer.from(`${finalUser.id}:${Date.now()}`).toString('base64');
    return res.json({ success: true, user: finalUser, token });
  } catch (e) {
    console.error('[AUTH] Error en /google route:', e.message);
    return res.status(500).json({ success: false, error: 'Error al procesar autenticación con Google: ' + e.message });
  }
});

// ── Registrar usuario (solo admin) ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, name, phone, plan, adminKey } = req.body;

  if (adminKey !== (process.env.ADMIN_PASSWORD || 'admin123')) {
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
