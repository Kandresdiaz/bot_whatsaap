const { createClient } = require('@supabase/supabase-js');

const cleanString = (val) => (val || '').trim().replace(/^['"]|['"]$/g, '');

const DEFAULT_URL = 'https://rptxtzrwoyuedbjzpqhp.supabase.co';
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwdHh0enJ3b3l1ZWRianpwcWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTQ2OTksImV4cCI6MjA5ODc3MDY5OX0.Mp-Hj5PcSZH-tVIhQNsDkdhWqMRUOFxH0pV8P23eM0E';
const EXPECTED_REF = 'rptxtzrwoyuedbjzpqhp';

function getJwtRef(token) {
  try {
    const parts = (token || '').split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      return payload.ref || null;
    }
  } catch (_) {}
  return null;
}

const rawUrl = cleanString(process.env.SUPABASE_URL);
const rawService = cleanString(process.env.SUPABASE_SERVICE_KEY);
const rawAnon = cleanString(process.env.SUPABASE_ANON_KEY);

const supabaseUrl = rawUrl || DEFAULT_URL;

let supabaseKey = DEFAULT_ANON;
if (rawService && !rawService.includes('your_service')) {
  const serviceRef = getJwtRef(rawService);
  if (serviceRef && serviceRef !== EXPECTED_REF) {
    console.warn(`[SUPABASE] ADVERTENCIA: SUPABASE_SERVICE_KEY pertenece al proyecto "${serviceRef}" en lugar de "${EXPECTED_REF}". Usando DEFAULT_ANON para prevenir error 401.`);
    supabaseKey = DEFAULT_ANON;
  } else {
    supabaseKey = rawService;
  }
} else if (rawAnon) {
  const anonRef = getJwtRef(rawAnon);
  if (anonRef && anonRef !== EXPECTED_REF) {
    console.warn(`[SUPABASE] ADVERTENCIA: SUPABASE_ANON_KEY pertenece a "${anonRef}". Usando DEFAULT_ANON.`);
    supabaseKey = DEFAULT_ANON;
  } else {
    supabaseKey = rawAnon;
  }
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Verificación asíncrona de conectividad sin bloquear inicio
supabase.from('users').select('id', { count: 'exact', head: true }).then(({ error }) => {
  if (error) {
    console.error('[SUPABASE] Error de conexión inicial:', error.message);
  } else {
    console.log('[SUPABASE] Conexión con base de datos verificada con éxito ✅');
  }
}).catch(err => {
  console.error('[SUPABASE] Excepción en conexión:', err.message);
});

module.exports = { supabase };
