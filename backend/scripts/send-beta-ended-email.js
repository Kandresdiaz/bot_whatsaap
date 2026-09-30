// Envío único del correo "BotWA ya salió de beta" a los usuarios registrados antes del lanzamiento.
//
// Por defecto NO envía nada: solo lista a quién le llegaría.
//   node scripts/send-beta-ended-email.js                  → lista destinatarios (simulacro)
//   node scripts/send-beta-ended-email.js --to=tu@correo   → envía una prueba solo a ese correo
//   node scripts/send-beta-ended-email.js --send           → envía a todos los de la lista
//
// Se ejecuta desde backend/ con el mismo .env del servidor (SUPABASE_* y SMTP_*).
require('dotenv').config();
const { supabase } = require('../src/db/supabase');
const { sendBetaEndedEmail } = require('../src/services/emailService');

// Mismo corte que el aviso del panel (frontend/src/app/dashboard/layout.tsx).
const OFFICIAL_LAUNCH_DATE = '2026-09-30T00:00:00-05:00';
const DELAY_MS = 1500; // Gmail limita envíos seguidos

const args = process.argv.slice(2);
const sendAll = args.includes('--send');
const testTo = (args.find(a => a.startsWith('--to=')) || '').slice(5);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  if (testTo) {
    const r = await sendBetaEndedEmail({ to: testTo, userName: 'Kevin' });
    console.log('Prueba enviada a', testTo, r);
    return;
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, name, created_at, is_admin')
    .lt('created_at', new Date(OFFICIAL_LAUNCH_DATE).toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error leyendo usuarios:', error.message);
    process.exit(1);
  }

  const recipients = (users || []).filter(u => !u.is_admin && u.email && u.email.includes('@'));
  console.log(`${recipients.length} destinatarios (registrados antes de ${OFFICIAL_LAUNCH_DATE}):`);
  for (const u of recipients) console.log(`  ${u.email}  ${u.name || ''}  (${u.created_at?.slice(0, 10)})`);

  if (!sendAll) {
    console.log('\nSimulacro: no se envió nada. Usa --send para enviar de verdad.');
    return;
  }

  let ok = 0;
  for (const u of recipients) {
    const r = await sendBetaEndedEmail({ to: u.email, userName: u.name });
    if (r.simulated) {
      console.error('SMTP_USER / SMTP_PASS no configurados: no se envió ningún correo real.');
      process.exit(1);
    }
    if (r.success) ok++;
    await sleep(DELAY_MS);
  }
  console.log(`\nListo: ${ok}/${recipients.length} enviados.`);
})();
