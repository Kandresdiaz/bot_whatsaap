const nodemailer = require('nodemailer');

// ── Transporter Configurable ──────────────────────────────────────────────────
const createTransporter = () => {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

const sendMailSafe = async (mailOptions) => {
  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_FROM || `"BotWA" <${process.env.SMTP_USER || 'soporte@botwa.com'}>`;
  const options = { from: fromAddress, ...mailOptions };

  if (!transporter) {
    console.log(`[EMAIL SIMULADO] (Configura SMTP_USER y SMTP_PASS en Render/env para enviar en vivo)`);
    console.log(`  -> Para: ${options.to}`);
    console.log(`  -> Asunto: ${options.subject}`);
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail(options);
    console.log(`[EMAIL ENVIADO] MessageId: ${info.messageId} | Para: ${options.to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL ERROR] Fallo al enviar a ${options.to}:`, error.message);
    return { success: false, error: error.message };
  }
};

// ── 1. Correo Día 0: Bienvenida al Trial de 7 Días ───────────────────────────
const sendTrialWelcomeEmail = async ({ to, userName, planName = 'Máquina de Ventas Pro', trialEndsAt }) => {
  const formattedDate = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'en 7 días';

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080E1F; color: #E2E8F0; margin: 0; padding: 24px; }
      .container { max-width: 580px; margin: 0 auto; background: #0B132B; border: 1px solid rgba(0, 207, 255, 0.25); border-radius: 16px; padding: 32px; }
      .logo { font-size: 26px; font-weight: 900; color: #00CFFF; margin-bottom: 20px; }
      h1 { font-size: 22px; color: #FFFFFF; margin-top: 0; }
      p { font-size: 15px; line-height: 1.6; color: #CBD5E1; }
      .card { background: rgba(26, 107, 255, 0.12); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 12px; padding: 20px; margin: 24px 0; }
      .badge { display: inline-block; background: #22C55E; color: #080E1F; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; }
      .btn { display: inline-block; background: linear-gradient(135deg, #1A6BFF, #00CFFF); color: #080E1F !important; font-weight: 800; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 10px; margin: 20px 0; text-align: center; }
      .footer { font-size: 12px; color: #64748B; margin-top: 32px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 16px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="logo">🤖 BotWA</div>
      <h1>¡Bienvenido a BotWA! Tu prueba de 7 días está activa 🚀</h1>
      <p>Hola${userName ? ` <strong>${userName}</strong>` : ''}, gracias por dar el paso para automatizar las ventas de tu negocio 24/7 con Inteligencia Artificial.</p>
      
      <div class="card">
        <div class="badge">Prueba Gratuita Activa</div>
        <h3 style="color: #FFFFFF; margin: 10px 0 6px 0;">Plan: ${planName}</h3>
        <p style="margin: 0; font-size: 14px; color: #94A3B8;">
          • Cobrado hoy: <strong>$0 COP</strong><br>
          • Tu prueba finaliza el: <strong>${formattedDate}</strong><br>
          • Tarjeta registrada para cobro automático al 7º día si decides continuar.
        </p>
      </div>

      <p><strong>El siguiente paso toma menos de 5 minutos:</strong></p>
      <ol style="color: #CBD5E1; font-size: 14px; line-height: 1.8;">
        <li>Entra a tu Dashboard de BotWA.</li>
        <li>Ve a la pestaña <strong>"Conectar WhatsApp"</strong>.</li>
        <li>Escanea el código QR con tu WhatsApp y tu bot comenzará a responder al instante.</li>
      </ol>

      <center>
        <a href="https://bot-whatsaap.vercel.app/dashboard" class="btn">Conectar mi WhatsApp Ahora →</a>
      </center>

      <div class="footer">
        <p>¿Tienes dudas o necesitas ayuda para configurar tu catálogo? Responde a este correo o escríbenos directamente a nuestro WhatsApp oficial.<br>BotWA — Tu negocio vendiendo las 24 horas.</p>
      </div>
    </div>
  </body>
  </html>
  `;

  return sendMailSafe({
    to,
    subject: '¡Bienvenido a BotWA! Tu prueba de 7 días gratis está activa 🚀',
    html,
  });
};

// ── 2. Correo Día 5: Recordatorio Previo al Cobro Automático (48h antes) ───────
const sendTrialReminderEmail = async ({ to, userName, planName = 'Máquina de Ventas Pro', daysLeft = 2, amountCOP = 249000 }) => {
  const formattedAmount = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amountCOP);

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080E1F; color: #E2E8F0; margin: 0; padding: 24px; }
      .container { max-width: 580px; margin: 0 auto; background: #0B132B; border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 16px; padding: 32px; }
      .logo { font-size: 26px; font-weight: 900; color: #00CFFF; margin-bottom: 20px; }
      h1 { font-size: 22px; color: #FFFFFF; margin-top: 0; }
      p { font-size: 15px; line-height: 1.6; color: #CBD5E1; }
      .card { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 20px; margin: 24px 0; }
      .btn { display: inline-block; background: linear-gradient(135deg, #1A6BFF, #00CFFF); color: #080E1F !important; font-weight: 800; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 10px; margin: 20px 0; text-align: center; }
      .footer { font-size: 12px; color: #64748B; margin-top: 32px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 16px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="logo">🤖 BotWA</div>
      <h1>Recordatorio: Te quedan ${daysLeft} días de tu prueba gratuita 💳</h1>
      <p>Hola${userName ? ` <strong>${userName}</strong>` : ''}, esperamos que tu bot de WhatsApp esté respondiendo clientes y cerrando oportunidades en automático.</p>
      
      <div class="card">
        <h3 style="color: #F59E0B; margin: 0 0 10px 0;">Aviso de Renovación Automática</h3>
        <p style="margin: 0; font-size: 14px; color: #CBD5E1;">
          En <strong>${daysLeft} días</strong> finalizan tus 7 días gratis. Si decides continuar disfrutando del bot sin interrupciones, el sistema procesará automáticamente el cobro mensual de <strong>${formattedAmount} COP</strong> en la tarjeta registrada para el <strong>${planName}</strong>.
        </p>
      </div>

      <p>No tienes que hacer nada si deseas mantener tu bot activo 24/7. Si deseas cambiar de plan o cancelar tu suscripción antes del cobro, puedes hacerlo con un solo clic desde tu panel:</p>

      <center>
        <a href="https://bot-whatsaap.vercel.app/dashboard/billing" class="btn">Gestionar Mi Suscripción →</a>
      </center>

      <div class="footer">
        <p>¿Preguntas sobre tu facturación o métricas de ventas? Estamos a tu disposición por WhatsApp para ayudarte en lo que necesites.<br>BotWA — Automatización Inteligente de WhatsApp.</p>
      </div>
    </div>
  </body>
  </html>
  `;

  return sendMailSafe({
    to,
    subject: `Recordatorio: Te quedan ${daysLeft} días de prueba gratuita en BotWA 💳`,
    html,
  });
};

// ── 3. Correo Día 7: Cobro Exitoso / Renovación Mensual ───────────────────────
const sendPaymentSuccessEmail = async ({ to, userName, planName = 'Máquina de Ventas Pro', amountCOP = 249000, nextBillingDate }) => {
  const formattedAmount = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amountCOP);
  const formattedDate = nextBillingDate
    ? new Date(nextBillingDate).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'en 30 días';

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080E1F; color: #E2E8F0; margin: 0; padding: 24px; }
      .container { max-width: 580px; margin: 0 auto; background: #0B132B; border: 1px solid rgba(34, 197, 94, 0.35); border-radius: 16px; padding: 32px; }
      .logo { font-size: 26px; font-weight: 900; color: #00CFFF; margin-bottom: 20px; }
      h1 { font-size: 22px; color: #FFFFFF; margin-top: 0; }
      p { font-size: 15px; line-height: 1.6; color: #CBD5E1; }
      .card { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 12px; padding: 20px; margin: 24px 0; }
      .btn { display: inline-block; background: linear-gradient(135deg, #1A6BFF, #00CFFF); color: #080E1F !important; font-weight: 800; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 10px; margin: 20px 0; text-align: center; }
      .footer { font-size: 12px; color: #64748B; margin-top: 32px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 16px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="logo">🤖 BotWA</div>
      <h1>¡Tu suscripción está activa! Recibo de pago ✨</h1>
      <p>Hola${userName ? ` <strong>${userName}</strong>` : ''}, confirmamos que el pago de tu plan se ha procesado exitosamente.</p>
      
      <div class="card">
        <h3 style="color: #22C55E; margin: 0 0 10px 0;">Detalle de Facturación</h3>
        <p style="margin: 0; font-size: 14px; color: #CBD5E1;">
          • Plan: <strong>${planName}</strong><br>
          • Monto cobrado: <strong>${formattedAmount} COP</strong><br>
          • Próxima fecha de renovación: <strong>${formattedDate}</strong><br>
          • Estado: <strong>100% Activo</strong>
        </p>
      </div>

      <p>Tu bot continuará respondiendo dudas, enviando fotos y agendando pedidos de forma ininterrumpida las 24 horas.</p>

      <center>
        <a href="https://bot-whatsaap.vercel.app/dashboard" class="btn">Ir a mi Panel de Control →</a>
      </center>

      <div class="footer">
        <p>Gracias por confiar en BotWA para potenciar tus ventas.<br>BotWA — El vendedor que nunca duerme.</p>
      </div>
    </div>
  </body>
  </html>
  `;

  return sendMailSafe({
    to,
    subject: '¡Tu suscripción a BotWA está activa! Recibo de pago ✨',
    html,
  });
};

module.exports = {
  sendTrialWelcomeEmail,
  sendTrialReminderEmail,
  sendPaymentSuccessEmail,
};
