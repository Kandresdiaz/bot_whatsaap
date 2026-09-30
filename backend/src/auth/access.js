const { supabase } = require('../db/supabase');
const { verifyToken, bearerFrom } = require('./token');

// Control de acceso de las rutas del panel: exige el token de sesión (Bearer, el que el panel
// guarda en localStorage 'wbot_token') y que el recurso pedido sea del usuario del token.
// El admin (adm) puede operar sobre cualquier negocio porque configura los de sus clientes.
// El bot de WhatsApp y los webhooks no pasan por aquí: usan los módulos directamente.

const PRIMARY_ADMIN_ID = '0b8c0710-b97a-4e2d-acf8-b7f33dcd5b3d';
const ADMIN_ALIASES = ['admin', '00000000-0000-0000-0000-000000000001'];

const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const unauthorized = (res) => res.status(401).json({ success: false, error: 'Sesión no válida o vencida. Vuelve a iniciar sesión.' });
const forbidden = (res) => res.status(403).json({ success: false, error: 'No tienes permiso sobre este negocio.' });

// Token válido obligatorio; deja la sesión ({ uid, adm }) en req.auth.
const requireAuth = (req, res, next) => {
  const session = verifyToken(bearerFrom(req));
  if (!session) return unauthorized(res);
  req.auth = session;
  next();
};

const requireAdmin = (req, res, next) => requireAuth(req, res, () => (req.auth.adm ? next() : forbidden(res)));

// Devuelve el user_id dueño de un identificador que las rutas aceptan indistintamente:
// alias 'admin', user_id, id de negocio o id de sesión de WhatsApp.
const ownerOf = async (id) => {
  if (!id || ADMIN_ALIASES.includes(id) || !isUuid(id)) return PRIMARY_ADMIN_ID;

  const { data: bus } = await supabase.from('businesses').select('user_id').eq('id', id).limit(1);
  if (bus && bus[0]?.user_id) return bus[0].user_id;

  const { data: sess } = await supabase.from('whatsapp_sessions').select('user_id').eq('id', id).limit(1);
  if (sess && sess[0]?.user_id) return sess[0].user_id;

  return id;
};

const canAccess = async (auth, id) => {
  if (auth.adm) return true;
  if (id === auth.uid) return true;
  return (await ownerOf(id)) === auth.uid;
};

const guard = (check) => (req, res, next) => requireAuth(req, res, async () => {
  try {
    if (await check(req)) return next();
    return forbidden(res);
  } catch (e) {
    console.error('[ACCESS] Error verificando permisos:', e.message);
    return res.status(500).json({ success: false, error: 'No se pudo verificar el permiso.' });
  }
});

// El identificador del dueño viene en req.params[name].
const ownsParam = (name) => guard((req) => canAccess(req.auth, req.params[name]));

// El identificador viene en el body o en el query (userId / businessId / sessionId).
// Si un cliente no manda ninguno, se usa el suyo: antes caía por defecto en 'admin'.
const ownsFields = (source) => guard(async (req) => {
  const bag = req[source] || {};
  const keys = ['userId', 'businessId', 'sessionId'].filter((k) => bag[k]);
  if (keys.length === 0) {
    if (!req.auth.adm) bag.userId = req.auth.uid;
    return true;
  }
  for (const k of keys) {
    if (!(await canAccess(req.auth, bag[k]))) return false;
  }
  return true;
});

const ownsBody = () => ownsFields('body');
const ownsQuery = () => ownsFields('query');

// El recurso es una fila (pedido, cita, producto, FAQ o conversación) identificada por req.params[param].
// Si la fila no existe se deja pasar: la ruta responde como siempre y no hay nada ajeno que tocar.
const ownsRow = (table, param = 'id') => guard(async (req) => {
  const id = req.params[param];
  if (req.auth.adm) return true;
  if (!isUuid(id)) return table === 'conversations'; // conversaciones: puede venir un teléfono, la ruta ya acota por usuario

  const ownerColumn = table === 'conversations' ? 'session_id' : 'business_id';
  const { data } = await supabase.from(table).select(ownerColumn).eq('id', id).limit(1);
  const row = data && data[0];
  if (!row) return true;
  return canAccess(req.auth, row[ownerColumn]);
});

module.exports = { requireAuth, requireAdmin, ownsParam, ownsBody, ownsQuery, ownsRow };
