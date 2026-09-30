const crypto = require('crypto');

// Token de sesión firmado con HMAC: nadie puede fabricar uno (ni marcarse admin) sin JWT_SECRET.
// Sin JWT_SECRET en .env se usa uno aleatorio por proceso: funciona, pero las sesiones
// se cierran en cada reinicio del servidor.
let secret = process.env.JWT_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[AUTH] JWT_SECRET no configurado: se usa uno temporal (las sesiones se cierran al reiniciar).');
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

const signToken = ({ userId, isAdmin }) => {
  const payload = Buffer.from(JSON.stringify({ uid: userId, adm: !!isAdmin, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

// Devuelve { uid, adm } si el token es válido y no venció; si no, null.
const verifyToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || !data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (_) {
    return null;
  }
};

const bearerFrom = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

module.exports = { signToken, verifyToken, bearerFrom };
