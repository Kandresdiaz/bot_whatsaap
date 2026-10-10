const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { verifyToken, bearerFrom } = require('../auth/token');
const { listNicheTemplates, buildTemplateFields } = require('../services/nicheTemplates');

// Middleware admin: token de sesión firmado de un admin, o la clave ADMIN_PASSWORD del servidor
// (para scripts). Antes aceptaba 'admin123' y cualquier token, y cualquiera podía activarse gratis.
const isAdmin = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (process.env.ADMIN_PASSWORD && key === process.env.ADMIN_PASSWORD) {
    return next();
  }

  const session = verifyToken(bearerFrom(req));
  if (session?.adm) {
    return next();
  }

  return res.status(403).json({ success: false, error: 'No autorizado. Vuelve a iniciar sesión.' });
};

const calculatePaidUntil = (days, months, currentPaidUntil) => {
  let baseDate = new Date();
  if (currentPaidUntil) {
    const existingDate = new Date(currentPaidUntil);
    if (!isNaN(existingDate.getTime()) && existingDate > baseDate) {
      baseDate = existingDate;
    }
  }

  const result = new Date(baseDate);
  if (days && !isNaN(parseInt(days))) {
    result.setDate(result.getDate() + parseInt(days));
  } else {
    result.setMonth(result.getMonth() + (parseInt(months) || 1));
  }
  return result;
};

// Plantillas de configuración por nicho para el formulario de crear cliente
router.get('/templates', isAdmin, (req, res) => {
  res.json({ success: true, templates: listNicheTemplates() });
});

// Listar todos los clientes enriquecidos con su estado de WhatsApp y QR
router.get('/clients', isAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*, businesses(name, category), whatsapp_sessions(id, status, phone_number, qr_code, connected_at, last_seen)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ADMIN GET CLIENTS] Error de Supabase:', error.message);
      return res.status(500).json({ success: false, error: error.message, clients: [] });
    }

    let activeMemorySessions = null;
    let getSession = null;
    try {
      const sm = require('../whatsapp/sessionManager');
      activeMemorySessions = sm.sessions;
      getSession = sm.getSession;
    } catch (_) {}

    const enrichedClients = (data || []).map(client => {
      const dbSession = Array.isArray(client.whatsapp_sessions) ? client.whatsapp_sessions[0] : client.whatsapp_sessions;
      const memSession = (activeMemorySessions && activeMemorySessions.get(client.id)) ||
                         (getSession && getSession(client.id)) || null;

      const liveStatus = (memSession && memSession.status) || (dbSession && dbSession.status) || 'disconnected';
      const livePhone = (memSession && memSession.phone) || (dbSession && dbSession.phone_number) || null;
      const hasQr = Boolean((memSession && memSession.qr) || (dbSession && dbSession.qr_code));
      const lastConnected = (dbSession && (dbSession.connected_at || dbSession.last_seen)) || null;

      return {
        ...client,
        whatsapp_status: liveStatus,
        whatsapp_phone: livePhone,
        whatsapp_has_qr: hasQr,
        last_connected_at: lastConnected,
        whatsapp_sessions: [{
          status: liveStatus,
          phone_number: livePhone,
          last_connected_at: lastConnected,
        }]
      };
    });

    res.json({ success: true, clients: enrichedClients });
  } catch (err) {
    console.error('[ADMIN GET CLIENTS] Excepción:', err.message);
    res.status(500).json({ success: false, error: err.message, clients: [] });
  }
});

// Crear o actualizar cliente (Upsert amigable para evitar errores de unicidad de email)
router.post('/clients', isAdmin, async (req, res) => {
  try {
    const { name, email, phone, plan, days, months, businessName, category, template } = req.body;
    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'Nombre y email son obligatorios' });
    }
    if (template && !buildTemplateFields(template, '')) {
      return res.status(400).json({ success: false, error: 'Plantilla de nicho desconocida' });
    }
    const hasOwnCategory = Boolean(category && category.trim() && category !== 'General');

    const cleanEmail = email.trim().toLowerCase();

    // 1. Verificar si el usuario ya existe
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    const paidUntil = calculatePaidUntil(days, months, existingUser?.paid_until);

    let clientUser;
    if (existingUser) {
      const { data: updatedUser, error: updErr } = await supabase
        .from('users')
        .update({
          name,
          phone: phone || existingUser.phone || '',
          plan: plan || existingUser.plan || 'starter',
          status: 'active',
          subscription_status: 'active',
          paid_until: paidUntil.toISOString(),
        })
        .eq('id', existingUser.id)
        .select()
        .maybeSingle();

      if (updErr) return res.status(400).json({ success: false, error: updErr.message });
      clientUser = updatedUser || existingUser;
    } else {
      const { data: newUser, error: userErr } = await supabase
        .from('users')
        .insert({
          name,
          email: cleanEmail,
          phone: phone || '',
          plan: plan || 'starter',
          status: 'active',
          subscription_status: 'active',
          paid_until: paidUntil.toISOString(),
        })
        .select()
        .single();

      if (userErr) {
        return res.status(400).json({ success: false, error: userErr.message });
      }
      clientUser = newUser;
    }

    // 2. Asegurar o actualizar negocio asociado
    let { data: bus } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', clientUser.id)
      .maybeSingle();

    if (!bus) {
      const { data: newBusiness, error: busErr } = await supabase
        .from('businesses')
        .insert({
          user_id: clientUser.id,
          name: businessName || '',
          category: category || 'General',
          city: '',
          timezone: 'America/Bogota',
          is_configured: false,
          bot_enabled: true,
          active_days: [1, 2, 3, 4, 5, 6],
          // La plantilla define mensajes, horario y cierre del nicho (y la categoría si no se escribió una)
          ...(template ? buildTemplateFields(template, businessName, hasOwnCategory ? { category } : null) : {}),
          // Con plantilla y nombre el negocio ya queda configurado; falta su catálogo
          ...(template && businessName?.trim() ? { is_configured: true } : {}),
        })
        .select()
        .single();

      if (busErr) console.warn('[ADMIN POST CLIENTS] Advertencia negocio:', busErr.message);
      bus = newBusiness;
    } else if (businessName || category || template) {
      const finalName = businessName || bus.name;
      const { data: updatedBus } = await supabase
        .from('businesses')
        .update({
          name: finalName,
          category: category || bus.category,
          // Si el negocio ya estaba configurado, la plantilla solo llena lo que esté vacío
          ...(template ? buildTemplateFields(template, finalName,
            bus.is_configured ? bus : (hasOwnCategory ? { category } : null)) : {}),
          ...(template && finalName?.trim() ? { is_configured: true } : {}),
        })
        .eq('id', bus.id)
        .select()
        .maybeSingle();
      bus = updatedBus || bus;
    }

    res.json({ success: true, client: { ...clientUser, businesses: bus ? [bus] : [] } });
  } catch (err) {
    console.error('[ADMIN POST CLIENTS] Excepción:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Activar cliente (con duracion flexible en dias o meses)
router.patch('/clients/:id/activate', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, months, days } = req.body;

    const { data: currentUser } = await supabase
      .from('users')
      .select('paid_until')
      .eq('id', id)
      .maybeSingle();

    const paidUntil = calculatePaidUntil(days, months, currentUser?.paid_until);

    const { data, error } = await supabase
      .from('users')
      .update({
        status: 'active',
        subscription_status: 'active',
        plan: plan || 'starter',
        paid_until: paidUntil.toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[ADMIN ACTIVATE CLIENT] Error:', error.message);
      return res.status(400).json({ success: false, error: error.message });
    }

    // Activar también el bot global, salvo que el negocio aún no tenga información cargada
    const { checkBotReadiness } = require('../services/botReadiness');
    const readiness = await checkBotReadiness(id).catch(() => ({ ready: false }));
    if (readiness.ready) {
      await supabase.from('businesses').update({ bot_enabled: true }).eq('user_id', id);
      await supabase.from('whatsapp_sessions').update({ bot_enabled: true }).eq('user_id', id);
      try {
        const { setGlobalBotStatus } = require('../whatsapp/sessionManager');
        await setGlobalBotStatus(id, true, global.io);
      } catch (_) {}
    }

    res.json({ success: true, paid_until: paidUntil, client: data });
  } catch (err) {
    console.error('[ADMIN ACTIVATE CLIENT] Exception:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pausar cliente
router.patch('/clients/:id/pause', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('users')
      .update({ status: 'paused', subscription_status: 'paused' })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Pausar también el bot en businesses y sesiones de WhatsApp
    await supabase.from('businesses').update({ bot_enabled: false }).eq('user_id', id);
    await supabase.from('whatsapp_sessions').update({ bot_enabled: false }).eq('user_id', id);
    try {
      const { setGlobalBotStatus } = require('../whatsapp/sessionManager');
      await setGlobalBotStatus(id, false, global.io);
    } catch (_) {}

    res.json({ success: true, client: data });
  } catch (err) {
    console.error('[ADMIN PAUSE CLIENT] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resetear sesion de WhatsApp de un cliente
router.post('/clients/:id/reset-session', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    try {
      const { stopSession } = require('../whatsapp/sessionManager');
      if (stopSession) await stopSession(id);
    } catch (_) {}
    const { error } = await supabase.from('whatsapp_sessions').delete().eq('user_id', id);
    if (error) console.warn('[ADMIN RESET SESSION] Advertencia delete session:', error.message);
    res.json({ success: true, message: 'Sesión desvinculada exitosamente' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Eliminar cliente
router.delete('/clients/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    try {
      const { stopSession } = require('../whatsapp/sessionManager');
      if (stopSession) await stopSession(id);
    } catch (_) {}

    await supabase.from('businesses').delete().eq('user_id', id);
    await supabase.from('whatsapp_sessions').delete().eq('user_id', id);
    await supabase.from('payments').delete().eq('user_id', id);

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Registrar pago manual
router.post('/payments', isAdmin, async (req, res) => {
  try {
    const { userId, amount, currency, method, note, months, days } = req.body;

    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        amount: amount || 0,
        currency: currency || 'COP',
        method: method || 'nequi',
        status: 'confirmed',
        paid_at: new Date().toISOString(),
        note,
      })
      .select()
      .single();

    if (payErr) {
      console.warn('[ADMIN PAYMENTS] Advertencia insert pago:', payErr.message);
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('paid_until')
      .eq('id', userId)
      .maybeSingle();

    const paidUntil = calculatePaidUntil(days, months, currentUser?.paid_until);

    await supabase
      .from('users')
      .update({
        status: 'active',
        subscription_status: 'active',
        paid_until: paidUntil.toISOString(),
      })
      .eq('id', userId);

    res.json({ success: true, payment, paid_until: paidUntil });
  } catch (err) {
    console.error('[ADMIN PAYMENTS] Exception:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Historial de pagos
router.get('/payments', isAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*, users(name, email)')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message, payments: [] });
    }

    res.json({ success: true, payments: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, payments: [] });
  }
});

// Stats generales
router.get('/stats', isAdmin, async (req, res) => {
  try {
    const [clients, payments, sessions] = await Promise.all([
      supabase.from('users').select('status', { count: 'exact' }),
      supabase.from('payments').select('amount, currency').eq('status', 'confirmed'),
      supabase.from('whatsapp_sessions').select('status, phone_number'),
    ]);

    let activeMemorySessions = null;
    try {
      activeMemorySessions = require('../whatsapp/sessionManager').sessions;
    } catch (_) {}

    let memConnectedCount = 0;
    if (activeMemorySessions) {
      for (const [_, s] of activeMemorySessions.entries()) {
        if (s?.status === 'connected') memConnectedCount++;
      }
    }

    const dbConnectedCount = sessions.data?.filter(s => s.status === 'connected').length || 0;
    const activeBots = Math.max(dbConnectedCount, memConnectedCount);
    const totalRevenueCOP = payments.data?.filter(p => p.currency === 'COP').reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const activeClients = clients.data?.filter(c => c.status === 'active').length || 0;

    res.json({
      success: true,
      stats: {
        totalClients: clients.count ?? (clients.data ? clients.data.length : 0),
        activeClients,
        activeBots,
        totalRevenueCOP,
      },
    });
  } catch (err) {
    console.error('[ADMIN STATS] Excepción:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Correos ───────────────────────────────────────────────────────────────────
const { isEmailConfigured, sendBetaEndedEmail, sendSignupWelcomeEmail } = require('../services/emailService');

// Mismo corte que el aviso del panel (frontend/src/app/dashboard/layout.tsx).
const OFFICIAL_LAUNCH_DATE = '2026-09-30T00:00:00-05:00';

// Usuarios de la beta: registrados antes del lanzamiento, sin contar admins.
const getBetaUsers = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, created_at, is_admin, beta_email_sent_at')
    .lt('created_at', new Date(OFFICIAL_LAUNCH_DATE).toISOString())
    .order('created_at', { ascending: true });
  if (error) {
    const migrationMissing = /beta_email_sent_at/.test(error.message || '');
    return { error: migrationMissing ? 'Falta ejecutar la migración 004_aviso_beta.sql en Supabase.' : error.message };
  }
  return { users: (data || []).filter(u => !u.is_admin && u.email && u.email.includes('@')) };
};

router.get('/emails', isAdmin, async (req, res) => {
  const beta = await getBetaUsers();
  res.json({
    success: true,
    smtpConfigured: isEmailConfigured(),
    launchDate: OFFICIAL_LAUNCH_DATE,
    betaUsers: beta.users || [],
    betaError: beta.error || null,
  });
});

// Envía una muestra de una plantilla a un correo (para revisarla antes de enviarla a clientes).
router.post('/emails/test', isAdmin, async (req, res) => {
  const { to, template } = req.body || {};
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ success: false, error: 'Correo no válido' });
  }
  if (!isEmailConfigured()) {
    return res.status(400).json({ success: false, error: 'El servidor no tiene SMTP_USER y SMTP_PASS configurados.' });
  }
  const send = template === 'welcome' ? sendSignupWelcomeEmail : sendBetaEndedEmail;
  const r = await send({ to, userName: 'Kevin' });
  res.status(r.success ? 200 : 500).json(r);
});

// Envía el aviso de fin de beta a los usuarios de la beta que aún no lo han recibido.
router.post('/emails/beta-announcement', isAdmin, async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(400).json({ success: false, error: 'El servidor no tiene SMTP_USER y SMTP_PASS configurados.' });
  }
  const beta = await getBetaUsers();
  if (beta.error) return res.status(500).json({ success: false, error: beta.error });

  const pending = beta.users.filter(u => !u.beta_email_sent_at);
  const results = [];
  for (const u of pending) {
    const r = await sendBetaEndedEmail({ to: u.email, userName: u.name });
    if (r.success) {
      await supabase.from('users').update({ beta_email_sent_at: new Date().toISOString() }).eq('id', u.id);
    }
    results.push({ email: u.email, success: r.success, error: r.error || null });
    await new Promise(resolve => setTimeout(resolve, 1500)); // Gmail limita envíos seguidos
  }
  res.json({ success: true, sent: results.filter(r => r.success).length, total: pending.length, results });
});

module.exports = router;
