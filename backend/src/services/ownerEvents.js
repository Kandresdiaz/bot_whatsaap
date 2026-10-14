const { supabase } = require('../db/supabase');

// Pedidos y citas llevan datos del cliente final (nombre, teléfono, notas). Antes se enviaban
// con global.io.emit, que los reparte a TODOS los paneles conectados del SaaS: cada negocio
// veía los pedidos y las citas de los demás. Aquí se resuelve el dueño del negocio y el evento
// se manda solo a sus salas.

const businessOwnerCache = new Map(); // business_id → user_id

const ownerOfBusiness = async (businessId) => {
  if (!businessId || !supabase) return null;
  if (businessOwnerCache.has(businessId)) return businessOwnerCache.get(businessId);
  try {
    const { data } = await supabase.from('businesses').select('user_id').eq('id', businessId).limit(1);
    const userId = data && data[0]?.user_id;
    if (userId) businessOwnerCache.set(businessId, userId);
    return userId || null;
  } catch (e) {
    console.warn('[Eventos] No se pudo resolver el dueño del negocio:', e.message);
    return null;
  }
};

/**
 * Emite un evento solo a las salas del dueño de ese negocio.
 * Si no se puede resolver el dueño NO se emite: es preferible que el panel se entere
 * en el siguiente refresco a que el dato salga hacia otras cuentas.
 */
const emitToBusinessOwner = async (event, businessId, payload) => {
  if (!global.io || !event) return;
  const userId = await ownerOfBusiness(businessId);
  if (!userId) {
    console.warn(`[Eventos] ${event} sin dueño resuelto (negocio ${businessId}): no se emite.`);
    return;
  }
  try {
    const { emitToUserRooms } = require('../whatsapp/sessionManager');
    emitToUserRooms(global.io, userId, event, payload);
  } catch (e) {
    console.warn(`[Eventos] Error emitiendo ${event}:`, e.message);
  }
};

module.exports = { emitToBusinessOwner, ownerOfBusiness };
