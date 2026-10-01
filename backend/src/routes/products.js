const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');
const { ownsBody, ownsParam, ownsRow } = require('../auth/access');
const { clearBusinessAiCache } = require('../ai/aiCache');

// Helper para obtener el business_id real a partir del user_id o business_id
const resolveBusinessId = async (idOrUserId) => {
  if (!idOrUserId) return null;
  const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  try {
    if (idOrUserId === 'admin' || !isUuid(idOrUserId)) {
      const { data: firstBus } = await supabase.from('businesses').select('id').eq('name', 'BotWA').limit(1);
      if (firstBus && firstBus[0]?.id) return firstBus[0].id;
      return '8fd9a59d-77d7-4db7-8637-9aaebca1158e';
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
  } catch (e) {
    console.error('[Products] Error resolviendo businessId:', e.message);
  }
  return null;
};

// ─── 1. Listar productos y servicios de un negocio ───────────────────────────
router.get('/:businessId', ownsParam('businessId'), async (req, res) => {
  try {
    const { businessId: rawId } = req.params;
    const businessId = await resolveBusinessId(rawId);

    if (!businessId) {
      return res.json({ success: true, products: [] });
    }

    const { data: bus } = await supabase.from('businesses').select('name').eq('id', businessId).limit(1);
    const isBotWaBusiness = bus && bus[0]?.name === 'BotWA';

    const { data, error } = await supabase.from('products_services').select('*').eq('business_id', businessId);
    let products = data || [];

    // Retornar lista de productos del negocio sin mutaciones
    return res.json({ success: true, products });
  } catch (err) {
    console.error('[GET Products Crash Safe]:', err.message);
    return res.json({ success: true, products: [] });
  }
});

// ─── 2. Crear un nuevo producto o servicio ───────────────────────────────────
router.post('/', ownsBody(), async (req, res) => {
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

    clearBusinessAiCache(businessId).catch(() => {});
    return res.json({ success: true, product: data && data[0] });
  } catch (err) {
    console.error('[POST Product Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 3. Actualizar un producto o servicio ───────────────────────────────────
router.put('/:id', ownsRow('products_services'), async (req, res) => {
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

    const updatedProd = data && data[0];
    if (updatedProd?.business_id) {
      clearBusinessAiCache(updatedProd.business_id).catch(() => {});
    }

    return res.json({ success: true, product: updatedProd });
  } catch (err) {
    console.error('[PUT Product Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4. Activar / Desactivar producto (toggle) ───────────────────────────────
router.patch('/:id/toggle', ownsRow('products_services'), async (req, res) => {
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

    const toggledProd = data && data[0];
    if (toggledProd?.business_id) {
      clearBusinessAiCache(toggledProd.business_id).catch(() => {});
    }

    return res.json({ success: true, product: toggledProd });
  } catch (err) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 5. Eliminar un producto o servicio ──────────────────────────────────────
// Vaciar el catálogo completo de un negocio (para volver a importar un PDF desde cero).
// Borra SOLO productos: las preguntas frecuentes y el conocimiento no se tocan. Exige la
// palabra BORRAR en el cuerpo para que ninguna llamada accidental pueda vaciar un catálogo.
router.delete('/all/:businessId', ownsParam('businessId'), async (req, res) => {
  try {
    if (req.body?.confirm !== 'BORRAR') {
      return res.status(400).json({ success: false, error: 'Falta la confirmación.' });
    }
    const businessId = await resolveBusinessId(req.params.businessId);
    if (!businessId) return res.status(404).json({ success: false, error: 'Negocio no encontrado.' });

    const { data, error } = await supabase
      .from('products_services')
      .delete()
      .eq('business_id', businessId)
      .select('id');

    if (error) {
      console.error('[DELETE Catálogo Error]:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    clearBusinessAiCache(businessId).catch(() => {});
    console.log(`[CATALOGO] Catálogo vaciado: ${data?.length || 0} productos del negocio ${businessId}`);
    return res.json({ success: true, deleted: data?.length || 0 });
  } catch (err) {
    console.error('[DELETE Catálogo Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', ownsRow('products_services'), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: prod } = await supabase.from('products_services').select('business_id').eq('id', id).single();
    const { error } = await supabase
      .from('products_services')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DELETE Product Error]:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    if (prod?.business_id) {
      clearBusinessAiCache(prod.business_id).catch(() => {});
    }

    return res.json({ success: true, message: 'Producto eliminado correctamente' });
  } catch (err) {
    console.error('[DELETE Product Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
