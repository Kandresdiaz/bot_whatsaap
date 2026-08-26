const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Helper para obtener el business_id real a partir del user_id o business_id
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
    console.error('[Products] Error resolviendo businessId:', e.message);
  }
  return '00000000-0000-0000-0000-000000000001';
};

// ─── 1. Listar productos y servicios de un negocio ───────────────────────────
router.get('/:businessId', async (req, res) => {
  try {
    const { businessId: rawId } = req.params;
    const businessId = await resolveBusinessId(rawId);

    const { data, error } = await supabase
      .from('products_services')
      .select('*')
      .order('category', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET Products Error]:', error.message);
      return res.json({ success: true, products: [] });
    }

    // Filtrar en memoria para evitar sintaxisPostgREST invalida
    let filtered = data || [];
    if (businessId && Array.isArray(data)) {
      const matched = data.filter(p => p.business_id === businessId || !p.business_id);
      if (matched.length > 0) filtered = matched;
    }

    return res.json({ success: true, products: filtered });
  } catch (err) {
    console.error('[GET Products Crash Safe]:', err.message);
    return res.json({ success: true, products: [] });
  }
});

// ─── 2. Crear un nuevo producto o servicio ───────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { userId, businessId: rawId, name, description, price, currency, category, image_url, is_active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre del producto/servicio es obligatorio' });
    }

    const targetId = rawId || userId;
    const businessId = await resolveBusinessId(targetId);

    if (!businessId) {
      return res.status(400).json({ success: false, error: 'No se encontró un negocio asociado a este usuario' });
    }

    const newProduct = {
      business_id: businessId,
      name: name.trim(),
      description: description ? description.trim() : '',
      price: isNaN(parseFloat(price)) ? 0 : parseFloat(price),
      currency: currency || 'COP',
      category: category ? category.trim() : 'General',
      image_url: image_url ? image_url.trim() : null,
      is_active: typeof is_active === 'boolean' ? is_active : true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('products_services')
      .insert(newProduct)
      .select()
      .limit(1);

    if (error) {
      console.error('[POST Product Error]:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, product: data && data[0] });
  } catch (err) {
    console.error('[POST Product Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 3. Actualizar un producto o servicio ───────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, currency, category, image_url, is_active } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: 'id del producto es requerido' });
    }

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (price !== undefined) updates.price = isNaN(parseFloat(price)) ? 0 : parseFloat(price);
    if (currency !== undefined) updates.currency = currency;
    if (category !== undefined) updates.category = category.trim();
    if (image_url !== undefined) updates.image_url = image_url ? image_url.trim() : null;
    if (is_active !== undefined) updates.is_active = !!is_active;

    const { data, error } = await supabase
      .from('products_services')
      .update(updates)
      .eq('id', id)
      .select()
      .limit(1);

    if (error) {
      console.error('[PUT Product Error]:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, product: data && data[0] });
  } catch (err) {
    console.error('[PUT Product Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4. Activar / Desactivar producto (toggle) ───────────────────────────────
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const { data, error } = await supabase
      .from('products_services')
      .update({ is_active: !!is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .limit(1);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, product: data && data[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 5. Eliminar un producto o servicio ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('products_services')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DELETE Product Error]:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, message: 'Producto eliminado correctamente' });
  } catch (err) {
    console.error('[DELETE Product Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
