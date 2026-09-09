const { createClient } = require('@supabase/supabase-js');

const cleanString = (val) => (val || '').trim().replace(/^['"]|['"]$/g, '');

// El proyecto al que deben pertenecer las llaves. La URL no es un secreto.
const DEFAULT_URL = 'https://rptxtzrwoyuedbjzpqhp.supabase.co';
const EXPECTED_REF = 'rptxtzrwoyuedbjzpqhp';

// NOTA DE SEGURIDAD
// Aquí había una llave anon de Supabase incrustada en el código como fallback. Este repo
// es público, así que esa llave quedó expuesta en GitHub y en todo el historial de git.
// Mientras RLS esté desactivado, esa llave da lectura y escritura sobre TODAS las tablas.
// Las llaves ahora se leen únicamente de variables de entorno; si faltan, el proceso
// falla de inmediato en vez de degradarse en silencio a una llave pública.

function getJwtClaims(token) {
  try {
    const parts = (token || '').split('.');
    if (parts.length === 3) {
      return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    }
  } catch (_) {}
  return null;
}

const isPlaceholder = (val) => !val || /your_|_here|xxx/i.test(val);

const rawUrl = cleanString(process.env.SUPABASE_URL);
const rawService = cleanString(process.env.SUPABASE_SERVICE_KEY);
const rawAnon = cleanString(process.env.SUPABASE_ANON_KEY);

const supabaseUrl = (!isPlaceholder(rawUrl) && rawUrl) || DEFAULT_URL;

// Elegir llave: service_role primero, anon como respaldo. Ambas deben ser del proyecto correcto.
let supabaseKey = null;
let keyRole = null;

for (const [label, candidate] of [['SUPABASE_SERVICE_KEY', rawService], ['SUPABASE_ANON_KEY', rawAnon]]) {
  if (isPlaceholder(candidate)) continue;

  const claims = getJwtClaims(candidate);
  if (claims?.ref && claims.ref !== EXPECTED_REF) {
    console.warn(`[SUPABASE] ${label} pertenece al proyecto "${claims.ref}" y no a "${EXPECTED_REF}". Ignorada.`);
    continue;
  }

  supabaseKey = candidate;
  keyRole = claims?.role || 'desconocido';
  break;
}

if (!supabaseKey) {
  console.error('');
  console.error('[SUPABASE] ERROR FATAL: no hay ninguna llave de Supabase utilizable.');
  console.error('  Define SUPABASE_SERVICE_KEY (recomendado) o SUPABASE_ANON_KEY en el entorno.');
  console.error('  En local: backend/.env   |   En producción: variables de entorno de Render.');
  console.error('  La llave service_role está en Supabase > Settings > API.');
  console.error('');
  throw new Error('SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY no configuradas');
}

if (keyRole !== 'service_role') {
  console.warn(`[SUPABASE] Usando una llave con rol "${keyRole}". El backend debería usar service_role.`);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Verificación asíncrona de conectividad sin bloquear inicio
supabase.from('users').select('id', { count: 'exact', head: true }).then(({ error }) => {
  if (error) {
    console.error('[SUPABASE] Error de conexión inicial:', error.message);
  } else {
    console.log(`[SUPABASE] Conexión verificada ✅ (rol: ${keyRole})`);
  }
}).catch(err => {
  console.error('[SUPABASE] Excepción en conexión:', err.message);
});

module.exports = { supabase };
