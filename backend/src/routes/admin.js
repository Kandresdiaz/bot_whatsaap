const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Middleware admin
const isAdmin = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (key !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
};

// Listar todos los clientes
router.get('/clients', isAdmin, async (req, res) => {
  const { data } = await supabase
    .from('users')
    .select('*, businesses(name, category), whatsapp_sessions(status, phone_number)')
    .order('created_at', { ascending: false });
  res.json({ success: true, clients: data || [] });
});

// Activar cliente (después de pago)
router.patch('/clients/:id/activate', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { plan, months } = req.body;

  const paidUntil = new Date();
  paidUntil.setMonth(paidUntil.getMonth() + (months || 1));

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

// Registrar pago manual
router.post('/payments', isAdmin, async (req, res) => {
  const { userId, amount, currency, method, note, months } = req.body;

  const { data: payment } = await supabase
    .from('payments')
    .insert({
      user_id: userId,
      amount,
      currency: currency || 'COP',
      method: method || 'nequi',
      status: 'confirmed',
      paid_at: new Date().toISOString(),
      note,
    })
    .select()
    .single();

  // Activar automáticamente al registrar pago
  const paidUntil = new Date();
  paidUntil.setMonth(paidUntil.getMonth() + (months || 1));

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
