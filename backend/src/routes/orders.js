const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Helper para resolver el business_id real a partir del user_id o business_id
const resolveBusinessId = async (idOrUserId) => {
  if (!idOrUserId) return null;
  const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  try {
    if (idOrUserId === 'admin' || !isUuid(idOrUserId)) {
      const { data: firstBus } = await supabase.from('businesses').select('id').order('created_at', { ascending: true }).limit(1);
      if (firstBus && firstBus[0]?.id) return firstBus[0].id;
      return '00000000-0000-0000-0000-000000000001';
    }

    const { data: bById } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', idOrUserId)
      .limit(1);

    if (bById && bById[0]?.id) return bById[0].id;

    const { data: bByUser } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', idOrUserId)
      .limit(1);

    if (bByUser && bByUser[0]?.id) return bByUser[0].id;

    const { data: fallback } = await supabase.from('businesses').select('id').limit(1);
    if (fallback && fallback[0]?.id) return fallback[0].id;
  } catch (e) {
    console.error('[Orders] Error resolviendo businessId:', e.message);
  }
  return '00000000-0000-0000-0000-000000000001';
};

// ─── 1. Listar pedidos de un negocio ─────────────────────────────────────────
router.get('/:businessId', async (req, res) => {
  try {
    const { businessId: rawId } = req.params;
    const { status, search, limit = 100 } = req.query;

    const businessId = await resolveBusinessId(rawId);

    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit) || 100);

    if (businessId && businessId !== '00000000-0000-0000-0000-000000000001') {
      query = query.eq('business_id', businessId);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('[GET Orders Error]:', error.message);
      return res.json({ success: true, orders: [] });
    }

    let ordersList = data || [];

    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      ordersList = ordersList.filter(o =>
        (o.client_name && o.client_name.toLowerCase().includes(term)) ||
        (o.client_phone && o.client_phone.includes(term)) ||
        (o.items && o.items.toLowerCase().includes(term)) ||
        (o.shipping_address && o.shipping_address.toLowerCase().includes(term)) ||
        (o.city && o.city.toLowerCase().includes(term)) ||
        (o.notes && o.notes.toLowerCase().includes(term))
      );
    }

    return res.json({ success: true, orders: ordersList });
  } catch (err) {
    console.error('[GET Orders Crash Safe]:', err.message);
    return res.json({ success: true, orders: [] });
  }
});

// ─── 2. Crear un nuevo pedido manualmente o por bot ──────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      businessId: rawId,
      conversation_id,
      client_name,
      client_phone,
      items,
      total_amount,
      currency = 'COP',
      shipping_address,
      city,
      payment_method = 'Nequi / Transferencia',
      status = 'pending',
      notes = '',
    } = req.body;

    if (!client_name || !client_name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre del cliente es obligatorio' });
    }
    if (!items || !items.trim()) {
      return res.status(400).json({ success: false, error: 'El detalle de los productos/ítems es obligatorio' });
    }

    const targetId = rawId || userId;
    const businessId = await resolveBusinessId(targetId);

    const cleanPhone = (client_phone || '').replace(/[^\d]/g, '');

    const newOrder = {
      business_id: businessId || '00000000-0000-0000-0000-000000000001',
      conversation_id: conversation_id || null,
      client_name: client_name.trim(),
      client_phone: cleanPhone || 'Sin número',
      items: items.trim(),
      total_amount: isNaN(parseFloat(total_amount)) ? 0 : parseFloat(total_amount),
      currency: currency || 'COP',
      shipping_address: shipping_address ? shipping_address.trim() : '',
      city: city ? city.trim() : '',
      payment_method: payment_method || 'Nequi / Transferencia',
      status: status || 'pending',
      notes: notes ? notes.trim() : '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('orders')
      .insert(newOrder)
      .select()
      .limit(1);

    if (error) {
      console.error('[POST Order Error]:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    const createdOrder = data && data[0];

    // Emitir evento Socket.io en tiempo real al usuario
    if (global.io && createdOrder) {
      try {
        const { emitToUserRooms } = require('../whatsapp/sessionManager');
        emitToUserRooms(global.io, targetId, 'new_order', createdOrder);
      } catch (_) {
        global.io.emit('new_order', createdOrder);
      }
    }

    return res.json({ success: true, order: createdOrder });
  } catch (err) {
    console.error('[POST Order Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 3. Actualizar pedido completo (PUT) ────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      client_name,
      client_phone,
      items,
      total_amount,
      currency,
      shipping_address,
      city,
      payment_method,
      status,
      notes,
    } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: 'ID de pedido requerido' });
    }

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (client_name !== undefined) updates.client_name = client_name.trim();
    if (client_phone !== undefined) updates.client_phone = client_phone.replace(/[^\d]/g, '');
    if (items !== undefined) updates.items = items.trim();
    if (total_amount !== undefined) updates.total_amount = isNaN(parseFloat(total_amount)) ? 0 : parseFloat(total_amount);
    if (currency !== undefined) updates.currency = currency;
    if (shipping_address !== undefined) updates.shipping_address = shipping_address ? shipping_address.trim() : '';
    if (city !== undefined) updates.city = city ? city.trim() : '';
    if (payment_method !== undefined) updates.payment_method = payment_method;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes ? notes.trim() : '';

    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .limit(1);

    if (error) {
      console.error('[PUT Order Error]:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    const updatedOrder = data && data[0];
    if (global.io && updatedOrder) {
      global.io.emit('order_updated', updatedOrder);
    }

    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('[PUT Order Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4. Actualizar estado rápidamente (PATCH) ───────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, tracking_number } = req.body;

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (tracking_number !== undefined) updates.notes = `${notes || ''} (Guía: ${tracking_number})`.trim();

    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .limit(1);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const updatedOrder = data && data[0];
    if (global.io && updatedOrder) {
      global.io.emit('order_updated', updatedOrder);
    }

    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 5. Eliminar pedido (DELETE) ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('orders').delete().eq('id', id);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    if (global.io) {
      global.io.emit('order_deleted', { id });
    }

    return res.json({ success: true, message: 'Pedido eliminado correctamente' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;