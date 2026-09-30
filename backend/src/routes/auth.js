const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { signToken, verifyToken, bearerFrom } = require('../auth/token');

const ADMIN_UUID = '00000000-0000-0000-0000-000000000001';

// Helper para verificar si un email es Super Admin
const checkIsAdmin = (email, dbUserIsAdmin) => {
  if (dbUserIsAdmin === true) return true;
  if (!email) return false;
  const rawAdminEmails = process.env.SUPER_ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'admin@bot.com,kevina0416@gmail.com';
  const adminList = rawAdminEmails.split(',').map(e => e.trim().toLowerCase());
  return adminList.includes(email.trim().toLowerCase());
};

// Origen del registro que manda el panel (utm_* y referrer de la primera visita).
// Viene del navegador: se recorta y solo se aceptan textos.
const cleanText = (val, max) => (typeof val === 'string' && val.trim() ? val.trim().slice(0, max) : null);
const attributionColumns = (attribution) => {
  if (!attribution || typeof attribution !== 'object') return {};
  const cols = {
    signup_source: cleanText(attribution.utm_source, 100),
    signup_medium: cleanText(attribution.utm_medium, 100),
    signup_campaign: cleanText(attribution.utm_campaign, 100),
    signup_referrer: cleanText(attribution.referrer, 300),
  };
  return Object.fromEntries(Object.entries(cols).filter(([, v]) => v));
};

const HEARD_ABOUT_OPTIONS = ['instagram', 'tiktok', 'facebook', 'recomendacion', 'google', 'otro'];

// ── Login con Email/Password ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });

  // Admin hardcodeado legacy o email configurado (sin ADMIN_PASSWORD en .env, este acceso queda cerrado)
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && (email === 'admin@bot.com' || checkIsAdmin(email, false)) && password === adminPassword) {
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
      token: signToken({ userId: ADMIN_UUID, isAdmin: true }),
    });
  }

  // Los clientes no tienen contraseña guardada: antes esta ruta dejaba entrar a cualquier
  // cuenta solo con el email. Los clientes entran siempre con Google.
  return res.status(401).json({ success: false, error: 'Credenciales inválidas. Si eres cliente, entra con el botón "Continuar con Google".' });
});

// ── Google OAuth Sync ─────────────────────────────────────────────────────────
router.post('/google', async (req, res) => {
  // El email sale del token verificado por Supabase, nunca del body: si no, cualquiera
  // podría enviar el email de otra persona (o del admin) y entrar a su cuenta.
  const accessToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) {
    return res.status(401).json({ success: false, error: 'Sesión de Google no válida. Vuelve a iniciar sesión.' });
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser(accessToken);
  const authUser = authData?.user;
  if (authErr || !authUser?.email) {
    return res.status(401).json({ success: false, error: 'Sesión de Google no válida. Vuelve a iniciar sesión.' });
  }

  const id = authUser.id;
  const email = authUser.email;
  const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || req.body?.name;

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
        status: isAdmin ? 'active' : 'trial',
        subscription_status: isAdmin ? 'active' : 'none',
        is_admin: isAdmin,
      };
      if (id && id.length > 10) insertPayload.id = id;

      const origin = attributionColumns(req.body?.attribution);
      let { data: newUser, error: createErr } = await supabase
        .from('users')
        .insert({ ...insertPayload, ...origin })
        .select()
        .maybeSingle();

      // Si aún no se corrió la migración 003 (columnas de origen), registrar sin el origen.
      if (createErr && Object.keys(origin).length > 0 && /signup_/.test(createErr.message || '')) {
        console.warn('[AUTH] Columnas de origen no existen (¿falta migración 003?). Registro sin origen.');
        ({ data: newUser, error: createErr } = await supabase
          .from('users')
          .insert(insertPayload)
          .select()
          .maybeSingle());
      }

      if (createErr) {
        console.error('[AUTH] Error insertando usuario Google en DB:', createErr.message);
        // Fallback en memoria si falla la BD
        user = {
          id: id || 'g_' + Date.now(),
          email,
          name: name || email.split('@')[0],
          plan: isAdmin ? 'business' : 'starter',
          status: isAdmin ? 'active' : 'trial',
          subscription_status: isAdmin ? 'active' : 'none',
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

    const token = signToken({ userId: finalUser.id, isAdmin: finalUser.is_admin });
    return res.json({ success: true, user: finalUser, token });
  } catch (e) {
    console.error('[AUTH] Error en /google route:', e.message);
    return res.status(500).json({ success: false, error: 'Error al procesar autenticación con Google: ' + e.message });
  }
});

// ── "¿Cómo nos conociste?" (onboarding, opcional) ─────────────────────────────
router.post('/heard-about', async (req, res) => {
  const session = verifyToken(bearerFrom(req));
  if (!session) return res.status(401).json({ success: false, error: 'Sesión no válida' });

  const answer = req.body?.heard_about;
  if (!HEARD_ABOUT_OPTIONS.includes(answer)) {
    return res.status(400).json({ success: false, error: 'Opción no válida' });
  }

  const { error } = await supabase.from('users').update({ heard_about: answer }).eq('id', session.uid);
  if (error) {
    console.error('[AUTH] Error guardando heard_about:', error.message);
    return res.status(500).json({ success: false, error: 'No se pudo guardar' });
  }
  return res.json({ success: true });
});

// ── Registrar usuario (solo admin) ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, name, phone, plan, adminKey } = req.body;

  if (!process.env.ADMIN_PASSWORD || adminKey !== process.env.ADMIN_PASSWORD) {
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
