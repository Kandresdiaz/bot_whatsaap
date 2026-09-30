import type { Metadata } from 'next';
import Link from 'next/link';
import SessionRedirect from '@/components/SessionRedirect';
import { PLANS, FAQS, TRIAL_DAYS, TRIAL_MESSAGES, formatCOP, formatThousands, salesWhatsAppLink } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'BotWA — Tu WhatsApp responde solo, 24/7',
  description: 'Conecta tu WhatsApp a una IA que responde con la información de tu negocio: precios, horarios, catálogo, citas y pedidos. Prueba 7 días con $0 hoy.',
};

// Si hay sesión guardada (o vienen tokens de OAuth), se oculta la landing ANTES del primer
// pintado y se muestra el spinner mientras SessionRedirect lleva a la persona a su panel.
const SESSION_CHECK_SCRIPT = `(function(){try{var l=window.location;if(l.hash.indexOf('access_token')>-1||l.search.indexOf('code=')>-1||(localStorage.getItem('wbot_user')&&localStorage.getItem('wbot_token'))){var s=document.createElement('style');s.textContent='#botwa-landing{display:none!important}#botwa-landing-redirect{display:flex!important}';document.head.appendChild(s);}}catch(e){}})();`;

const STEPS = [
  {
    icon: '🔐',
    title: 'Entra con Google',
    text: 'Sin formularios largos ni contraseñas nuevas: un clic con tu cuenta de Google y ya tienes tu panel.',
  },
  {
    icon: '📱',
    title: 'Configura tu negocio y conecta WhatsApp',
    text: 'Cuéntale al bot qué vendes, tus precios y horarios. Luego escaneas un código QR desde tu WhatsApp, igual que WhatsApp Web.',
  },
  {
    icon: '🎁',
    title: `Activa tu prueba de ${TRIAL_DAYS} días`,
    text: `Registras tu tarjeta y pagas $0 hoy. Tienes ${TRIAL_MESSAGES} mensajes para probarlo con clientes reales y cancelas con 1 clic si no te sirve.`,
  },
];

const AUDIENCES = [
  { icon: '🍔', title: 'Restaurantes y comidas', text: 'Menú, precios, domicilios y pedidos a cualquier hora.' },
  { icon: '🦷', title: 'Clínicas y consultorios', text: 'Servicios, valores de consulta y agendamiento de citas.' },
  { icon: '🛍️', title: 'Tiendas y e-commerce', text: 'Catálogo con fotos, disponibilidad y link de pago.' },
  { icon: '💈', title: 'Peluquerías, barberías y spas', text: 'Turnos, servicios y recordatorio de horarios.' },
  { icon: '🏋️', title: 'Gimnasios y academias', text: 'Planes, horarios de clases e inscripciones.' },
  { icon: '💼', title: 'Asesorías y servicios', text: 'Resuelve dudas frecuentes y filtra clientes interesados.' },
];

const LANDING_FAQS = [
  {
    q: '¿Necesito saber de programación?',
    a: 'No. Llenas un formulario con los datos de tu negocio (qué vendes, precios, horarios y cómo cerrar la venta) y escaneas un código QR. El bot responde con esa información.',
  },
  {
    q: '¿Uso mi mismo número de WhatsApp?',
    a: 'Sí, conectas tu número escaneando un QR, como en WhatsApp Web. Te recomendamos usar una línea exclusiva para tu negocio en lugar de tu número personal.',
  },
  ...FAQS,
];

export default function HomePage() {
  const waLink = salesWhatsAppLink();

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SESSION_CHECK_SCRIPT }} />
      <SessionRedirect />

      <div
        id="botwa-landing-redirect"
        style={{ display: 'none', alignItems: 'center', justifyContent: 'center', height: '100vh' }}
      >
        <div className="spinner" style={{ width: 48, height: 48 }} />
      </div>

      <div id="botwa-landing" className="lp">
        <style>{LANDING_CSS}</style>

        {/* ── Navegación ─────────────────────────────────────────────── */}
        <header className="lp-nav lp-wrap">
          <Link href="/" className="lp-logo">
            <span className="lp-logo-icon">🤖</span>
            <span>BotWA</span>
          </Link>
          <nav className="lp-nav-links">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#planes">Planes</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <div className="lp-nav-actions">
            <Link href="/login" className="btn btn-ghost lp-btn-sm">Iniciar sesión</Link>
            <Link href="/pricing" className="btn btn-primary lp-btn-sm lp-hide-mobile">Probar gratis</Link>
          </div>
        </header>

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className="lp-hero lp-wrap">
          <div className="lp-hero-copy">
            <div className="lp-pill">🎉 BotWA ya salió de beta · versión oficial</div>
            <h1 className="lp-h1">
              Tu WhatsApp responde solo, <span className="lp-grad">24/7</span>, con la información de tu negocio
            </h1>
            <p className="lp-lead">
              BotWA conecta tu WhatsApp a una inteligencia artificial que contesta a tus clientes con tus precios,
              horarios y catálogo, agenda citas y toma pedidos mientras tú te ocupas de tu negocio.
            </p>
            <div className="lp-cta-row">
              <Link href="/pricing" className="btn btn-primary lp-btn-lg">
                Empieza tu prueba de {TRIAL_DAYS} días →
              </Link>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn lp-btn-lg lp-btn-wa">
                💬 Pruébalo por WhatsApp
              </a>
            </div>
            <p className="lp-fineprint">
              $0 hoy · {TRIAL_MESSAGES} mensajes incluidos en la prueba · Cancelas con 1 clic
            </p>
          </div>

          {/* Chat de ejemplo */}
          <div className="lp-phone" aria-hidden="true">
            <div className="lp-phone-head">
              <span className="lp-avatar">🍕</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Pizzería La Esquina</div>
                <div style={{ fontSize: 11, color: '#4ade80' }}>en línea</div>
              </div>
            </div>
            <div className="lp-chat">
              <div className="lp-msg lp-msg-in">Hola, ¿todavía tienen domicilios? 🙏<span>11:42 p. m.</span></div>
              <div className="lp-msg lp-msg-out">
                ¡Hola! Sí, hacemos domicilios hasta la 1:00 a. m. 🛵 La pizza familiar está en $45.000 y el envío es gratis desde $60.000. ¿Qué te gustaría pedir?
                <span>11:42 p. m.</span>
              </div>
              <div className="lp-msg lp-msg-in">Una familiar hawaiana a la calle 10 #43-12<span>11:43 p. m.</span></div>
              <div className="lp-msg lp-msg-out">
                ¡Listo! 🍍 Pizza familiar hawaiana a Calle 10 #43-12. Total $45.000. ¿Pagas en efectivo o por Nequi?
                <span>11:43 p. m.</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Cómo funciona ──────────────────────────────────────────── */}
        <section id="como-funciona" className="lp-section lp-wrap">
          <h2 className="lp-h2">Cómo funciona</h2>
          <p className="lp-sub">Tres pasos y tu WhatsApp empieza a responder solo.</p>
          <div className="lp-grid-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card lp-step">
                <div className="lp-step-num">{i + 1}</div>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{s.icon}</div>
                <h3 className="lp-h3">{s.title}</h3>
                <p className="lp-text">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Para quién es ──────────────────────────────────────────── */}
        <section className="lp-section lp-wrap">
          <h2 className="lp-h2">¿Para quién es BotWA?</h2>
          <p className="lp-sub">Para cualquier negocio que recibe las mismas preguntas por WhatsApp todos los días.</p>
          <div className="lp-grid-audience">
            {AUDIENCES.map(a => (
              <div key={a.title} className="card lp-audience">
                <span style={{ fontSize: 28 }}>{a.icon}</span>
                <div>
                  <h3 className="lp-h3" style={{ fontSize: 15, marginBottom: 4 }}>{a.title}</h3>
                  <p className="lp-text" style={{ fontSize: 13 }}>{a.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Planes ─────────────────────────────────────────────────── */}
        <section id="planes" className="lp-section lp-wrap">
          <h2 className="lp-h2">Planes</h2>
          <p className="lp-sub">
            Todos empiezan con {TRIAL_DAYS} días de prueba y {TRIAL_MESSAGES} mensajes incluidos. $0 hoy.
          </p>
          <div className="lp-grid-3">
            {Object.values(PLANS).map(plan => (
              <div key={plan.id} className={`card lp-plan${plan.isPopular ? ' lp-plan-popular' : ''}`}>
                {plan.isPopular && <div className="lp-plan-badge">Más popular</div>}
                <div style={{ fontSize: 12, fontWeight: 700, color: plan.isPopular ? '#00CFFF' : '#94a3b8' }}>{plan.tag}</div>
                <h3 className="lp-h3" style={{ fontSize: 20, margin: '6px 0' }}>{plan.name}</h3>
                <p className="lp-text" style={{ fontSize: 13, minHeight: 40 }}>{plan.description}</p>
                <div style={{ margin: '16px 0 4px' }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: '#fff' }}>{formatCOP(plan.priceCOP)}</span>
                  <span style={{ fontSize: 14, color: '#94a3b8' }}> / {plan.period}</span>
                </div>
                <div style={{ fontSize: 13, color: '#00CFFF', fontWeight: 700, marginBottom: 14 }}>
                  💬 {formatThousands(plan.messagesPerMonth)} mensajes IA / mes
                </div>
                <ul className="lp-list">
                  {plan.features.slice(0, 4).map(f => (
                    <li key={f}><span>✓</span>{f}</li>
                  ))}
                </ul>
                <Link
                  href={`/pricing?plan=${plan.id}`}
                  className={`btn ${plan.isPopular ? 'btn-primary' : 'lp-btn-outline'}`}
                  style={{ width: '100%', padding: '12px 16px', fontWeight: 800, marginTop: 'auto' }}
                >
                  Elegir {plan.name} →
                </Link>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', marginTop: 20 }}>
            <Link href="/pricing" style={{ color: '#00CFFF', fontSize: 14, fontWeight: 600 }}>
              Ver todo lo que incluye cada plan →
            </Link>
          </p>
        </section>

        {/* ── Preguntas frecuentes ───────────────────────────────────── */}
        <section id="preguntas" className="lp-section lp-wrap" style={{ maxWidth: 820 }}>
          <h2 className="lp-h2">Preguntas frecuentes</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
            {LANDING_FAQS.map(f => (
              <details key={f.q} className="card lp-faq">
                <summary>{f.q}</summary>
                <p className="lp-text" style={{ marginTop: 10 }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Cierre ─────────────────────────────────────────────────── */}
        <section className="lp-wrap">
          <div className="lp-final">
            <h2 className="lp-h2" style={{ marginBottom: 10 }}>¿Quieres ver cómo responde?</h2>
            <p className="lp-text" style={{ maxWidth: 560, margin: '0 auto 22px', fontSize: 15 }}>
              Escríbele a nuestro bot de ventas: es un bot de BotWA atendiendo de verdad. Pregúntale lo que quieras.
            </p>
            <div className="lp-cta-row" style={{ justifyContent: 'center' }}>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn lp-btn-lg lp-btn-wa">
                💬 Pruébalo por WhatsApp
              </a>
              <Link href="/pricing" className="btn btn-primary lp-btn-lg">
                Empezar prueba gratis →
              </Link>
            </div>
          </div>
        </section>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer className="lp-wrap lp-footer">
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
            <Link href="/pricing">Planes</Link>
            <Link href="/login">Iniciar sesión</Link>
            <a href={waLink} target="_blank" rel="noopener noreferrer">Contacto por WhatsApp</a>
          </div>
          <p>
            BotWA es un software independiente. No está afiliado ni respaldado por Meta Platforms, Inc. ni WhatsApp LLC.
            WhatsApp es una marca registrada de Meta Platforms, Inc.
          </p>
        </footer>

        {/* Botón flotante de WhatsApp */}
        <a href={waLink} target="_blank" rel="noopener noreferrer" className="lp-wa-float" aria-label="Pruébalo por WhatsApp">
          💬<span className="lp-hide-mobile"> Pruébalo por WhatsApp</span>
        </a>
      </div>
    </>
  );
}

const LANDING_CSS = `
.lp { min-height: 100vh; background: radial-gradient(ellipse at 50% 0%, rgba(26,107,255,0.16) 0%, #080E1F 60%); color: #f8fafc; padding-bottom: 40px; }
.lp-wrap { max-width: 1180px; margin: 0 auto; padding-left: 16px; padding-right: 16px; }
.lp a { text-decoration: none; }
.lp-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 18px; padding-bottom: 18px; }
.lp-logo { display: flex; align-items: center; gap: 10px; color: #fff; font-size: 22px; font-weight: 800; }
.lp-logo-icon { font-size: 22px; background: linear-gradient(135deg, #1A6BFF, #00CFFF); border-radius: 12px; padding: 6px 9px; line-height: 1; }
.lp-nav-links { display: flex; gap: 26px; }
.lp-nav-links a { color: #94a3b8; font-size: 14px; font-weight: 600; }
.lp-nav-links a:hover { color: #fff; }
.lp-nav-actions { display: flex; gap: 8px; }
.lp-btn-sm { padding: 8px 14px; font-size: 13px; }
.lp-btn-lg { padding: 14px 22px; font-size: 15px; font-weight: 800; border-radius: 12px; }
.lp-btn-wa { background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.45); }
.lp-btn-wa:hover { background: rgba(34,197,94,0.2); }
.lp-btn-outline { background: rgba(26,107,255,0.15); color: #fff; border: 1px solid rgba(26,107,255,0.6); }
.lp-btn-outline:hover { background: rgba(26,107,255,0.3); }

.lp-hero { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 48px; align-items: center; padding-top: 48px; padding-bottom: 40px; }
.lp-pill { display: inline-flex; background: rgba(0,207,255,0.1); border: 1px solid rgba(0,207,255,0.35); color: #00CFFF; border-radius: 30px; padding: 6px 16px; font-size: 13px; font-weight: 700; margin-bottom: 18px; }
.lp-h1 { font-size: clamp(32px, 5vw, 52px); font-weight: 900; line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 18px; }
.lp-grad { background: linear-gradient(135deg, #1A6BFF, #00CFFF); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.lp-lead { font-size: 17px; color: #cbd5e1; line-height: 1.6; max-width: 600px; margin-bottom: 26px; }
.lp-cta-row { display: flex; gap: 12px; flex-wrap: wrap; }
.lp-fineprint { margin-top: 14px; font-size: 13px; color: #94a3b8; }

.lp-phone { background: #0B132B; border: 1px solid rgba(0,207,255,0.3); border-radius: 24px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(26,107,255,0.2); max-width: 400px; width: 100%; justify-self: center; }
.lp-phone-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #0D1A36; border-bottom: 1px solid rgba(255,255,255,0.06); }
.lp-avatar { width: 36px; height: 36px; border-radius: 50%; background: rgba(26,107,255,0.25); display: flex; align-items: center; justify-content: center; font-size: 18px; }
.lp-chat { display: flex; flex-direction: column; gap: 10px; padding: 18px 14px; }
.lp-msg { max-width: 86%; padding: 9px 12px 18px; border-radius: 12px; font-size: 13px; line-height: 1.45; position: relative; }
.lp-msg span { position: absolute; right: 10px; bottom: 4px; font-size: 10px; color: #94a3b8; }
.lp-msg-in { align-self: flex-start; background: #16213F; border-top-left-radius: 4px; }
.lp-msg-out { align-self: flex-end; background: linear-gradient(135deg, rgba(26,107,255,0.45), rgba(0,207,255,0.3)); border-top-right-radius: 4px; }

.lp-section { padding-top: 64px; padding-bottom: 16px; }
.lp-h2 { font-size: clamp(24px, 3.4vw, 34px); font-weight: 900; text-align: center; color: #fff; }
.lp-sub { text-align: center; color: #94a3b8; font-size: 15px; margin-top: 8px; margin-bottom: 30px; }
.lp-h3 { font-size: 17px; font-weight: 800; color: #fff; margin-bottom: 8px; }
.lp-text { color: #cbd5e1; font-size: 14px; line-height: 1.6; }
.lp-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; }
.lp-step { position: relative; }
.lp-step-num { position: absolute; top: 18px; right: 20px; font-size: 13px; font-weight: 800; color: #00CFFF; border: 1px solid rgba(0,207,255,0.4); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
.lp-grid-audience { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.lp-audience { display: flex; gap: 14px; align-items: flex-start; padding: 18px; }

.lp-plan { display: flex; flex-direction: column; position: relative; }
.lp-plan-popular { border: 2px solid #00CFFF; background: linear-gradient(180deg, rgba(26,107,255,0.14) 0%, #0D1428 100%); }
.lp-plan-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #1A6BFF, #00CFFF); color: #080E1F; font-weight: 800; font-size: 11px; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; white-space: nowrap; }
.lp-list { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.lp-list li { display: flex; gap: 8px; font-size: 13px; color: #e2e8f0; }
.lp-list li span { color: #00CFFF; font-weight: 800; }

.lp-faq { padding: 18px 20px; }
.lp-faq summary { cursor: pointer; font-weight: 700; font-size: 15px; color: #fff; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
.lp-faq summary::-webkit-details-marker { display: none; }
.lp-faq summary::after { content: '+'; color: #00CFFF; font-size: 20px; line-height: 1; }
.lp-faq[open] summary::after { content: '−'; }

.lp-final { margin-top: 72px; text-align: center; padding: 44px 24px; border-radius: 20px; border: 1px solid rgba(0,207,255,0.3); background: linear-gradient(135deg, rgba(26,107,255,0.14) 0%, rgba(0,207,255,0.06) 100%); }
.lp-footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 12px; color: #64748b; line-height: 1.6; }
.lp-footer a { color: #94a3b8; font-size: 13px; }

.lp-wa-float { position: fixed; right: 18px; bottom: 18px; z-index: 50; background: #22c55e; color: #fff; font-weight: 800; font-size: 14px; padding: 12px 18px; border-radius: 30px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }

@media (max-width: 900px) {
  .lp-hero { grid-template-columns: 1fr; gap: 36px; padding-top: 24px; }
  .lp-grid-3, .lp-grid-audience { grid-template-columns: 1fr; }
  .lp-grid-audience { grid-template-columns: repeat(2, 1fr); }
  .lp-nav-links { display: none; }
  .lp-plan-popular { margin-top: 8px; }
}
@media (max-width: 560px) {
  .lp-grid-audience { grid-template-columns: 1fr; }
  .lp-hide-mobile { display: none; }
  .lp-cta-row .btn { width: 100%; }
  .lp-wa-float { padding: 12px 14px; font-size: 20px; }
}
`;
