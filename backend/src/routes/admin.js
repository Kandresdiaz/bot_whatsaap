const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Middleware admin
const isAdmin = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  if (key !== adminPass) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
};

const calculatePaidUntil = (days, months) => {
  const paidUntil = new Date();
  if (days && !isNaN(parseInt(days))) {
    paidUntil.setDate(paidUntil.getDate() + parseInt(days));
  } else {
    paidUntil.setMonth(paidUntil.getMonth() + (parseInt(months) || 1));
  }
  return paidUntil;
};

// Listar todos los clientes
router.get('/clients', isAdmin, async (req, res) => {
  const { data } = await supabase
    .from('users')
    .select('*, businesses(name, category), whatsapp_sessions(status, phone_number)')
    .order('created_at', { ascending: false });
  res.json({ success: true, clients: data || [] });
});

// Crear nuevo cliente
router.post('/clients', isAdmin, async (req, res) => {
  try {
    const { name, email, phone, plan, days, months, businessName, category } = req.body;
    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'Nombre y email son obligatorios' });
    }

    const paidUntil = calculatePaidUntil(days, months);

    const { data: newUser, error: userErr } = await supabase
      .from('users')
      .insert({
        name,
        email,
        phone: phone || '',
        plan: plan || 'starter',
        status: 'active',
        paid_until: paidUntil.toISOString(),
      })
      .select()
      .single();

    if (userErr) {
      return res.status(400).json({ success: false, error: userErr.message });
    }

    // Crear negocio asociado
    const { data: newBusiness } = await supabase
      .from('businesses')
      .insert({
        user_id: newUser.id,
        name: businessName || `Negocio ${name}`,
        category: category || 'General',
        timezone: 'America/Bogota',
        is_configured: false,
      })
      .select()
      .single();

    res.json({ success: true, client: { ...newUser, businesses: [newBusiness] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Activar cliente (con duracion flexible en dias o meses)
router.patch('/clients/:id/activate', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { plan, months, days } = req.body;

  const paidUntil = calculatePaidUntil(days, months);

  await supabase
    .from('users')
    .update({ status: 'active', plan: plan || 'starter', paid_until: paidUntil.toISOString() })
    .eq('id', id);

  res.json({ success: true, paid_until: paidUntil });
});

// Pausar cliente
router.patch('/clients/:id/pause', isAdmin, async (req, res) => {
  const { id } = req.params;
  await supabase.from('users').update({ status: 'paused' }).eq('id', id);
  res.json({ success: true });
});

// Resetear sesion de WhatsApp de un cliente
router.post('/clients/:id/reset-session', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    try {
      const { stopSession } = require('../whatsapp/sessionManager');
      if (stopSession) await stopSession(id);
    } catch (_) {}
    await supabase.from('whatsapp_sessions').delete().eq('user_id', id);
    res.json({ success: true, message: 'Sesión desvinculada' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Eliminar cliente
router.delete('/clients/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await supabase.from('businesses').delete().eq('user_id', id);
    await supabase.from('whatsapp_sessions').delete().eq('user_id', id);
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Registrar pago manual
router.post('/payments', isAdmin, async (req, res) => {
  const { userId, amount, currency, method, note, months, days } = req.body;

  const { data: payment } = await supabase
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

  // Activar automáticamente al registrar pago
  const paidUntil = calculatePaidUntil(days, months);

  await supabase
    .from('users')
    .update({ status: 'active', paid_until: paidUntil.toISOString() })
    .eq('id', userId);

  res.json({ success: true, payment });
});

// Historial de pagos
router.get('/payments', isAdmin, async (req, res) => {
  const { data } = await supabase
    .from('payments')
    .select('*, users(name, email)')
    .order('created_at', { ascending: false });
  res.json({ success: true, payments: data || [] });
});

// Stats generales
router.get('/stats', isAdmin, async (req, res) => {
  const [clients, payments, sessions] = await Promise.all([
    supabase.from('users').select('status', { count: 'exact' }),
    supabase.from('payments').select('amount, currency').eq('status', 'confirmed'),
    supabase.from('whatsapp_sessions').select('status'),
  ]);

  const totalRevenueCOP = payments.data?.filter(p => p.currency === 'COP').reduce((sum, p) => sum + p.amount, 0) || 0;
  const activeBots = sessions.data?.filter(s => s.status === 'connected').length || 0;
  const activeClients = clients.data?.filter(c => c.status === 'active').length || 0;

  res.json({
    success: true,
    stats: {
      totalClients: clients.count || 0,
      activeClients,
      activeBots,
      totalRevenueCOP,
    },
  });
});

module.exports = router;
