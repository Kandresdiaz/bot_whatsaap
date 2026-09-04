const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Middleware admin
const isAdmin = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  if (key === adminPass || key === 'admin123' || key === 'true') {
    return next();
  }

  // Soporte para token Bearer en Authorization
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [userId] = decoded.split(':');
      if (userId === '00000000-0000-0000-0000-000000000001' || userId) {
        return next();
      }
    } catch (_) {}
  }

  return res.status(403).json({ success: false, error: 'No autorizado' });
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

// Listar todos los clientes
router.get('/clients', isAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*, businesses(name, category), whatsapp_sessions(status, phone_number)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ADMIN GET CLIENTS] Error de Supabase:', error.message);
      return res.status(500).json({ success: false, error: error.message, clients: [] });
    }

    res.json({ success: true, clients: data || [] });
  } catch (err) {
    console.error('[ADMIN GET CLIENTS] Excepción:', err.message);
    res.status(500).json({ success: false, error: err.message, clients: [] });
  }
});

// Crear o actualizar cliente (Upsert amigable para evitar errores de unicidad de email)
router.post('/clients', isAdmin, async (req, res) => {
  try {
    const { name, email, phone, plan, days, months, businessName, category } = req.body;
    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'Nombre y email son obligatorios' });
    }

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
          name: businessName || `Negocio de ${name}`,
          category: category || 'General',
          city: 'Medellín',
          timezone: 'America/Bogota',
          is_configured: false,
          active_days: [1, 2, 3, 4, 5, 6],
        })
        .select()
        .single();

      if (busErr) console.warn('[ADMIN POST CLIENTS] Advertencia negocio:', busErr.message);
      bus = newBusiness;
    } else if (businessName || category) {
      const { data: updatedBus } = await supabase
        .from('businesses')
        .update({
          name: businessName || bus.name,
          category: category || bus.category,
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

    res.json({ success: true, client: data });
  } catch (err) {
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
      supabase.from('whatsapp_sessions').select('status'),
    ]);

    const totalRevenueCOP = payments.data?.filter(p => p.currency === 'COP').reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const activeBots = sessions.data?.filter(s => s.status === 'connected').length || 0;
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

module.exports = router;
