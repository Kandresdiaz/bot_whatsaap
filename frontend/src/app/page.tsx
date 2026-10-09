import type { Metadata } from 'next';
import Link from 'next/link';
import SessionRedirect from '@/components/SessionRedirect';
import { PLANS, FAQS, TRIAL_DAYS, TRIAL_MESSAGES, formatCOP, formatThousands, salesWhatsAppLink } from '@/lib/plans';
import { SITE_NAME, absoluteUrl } from '@/lib/site';
import { LANDING_CSS } from '@/components/landing/landingCss';
import { PublicFooter, JsonLd } from '@/components/landing/PublicChrome';

export const metadata: Metadata = {
  title: { absolute: 'Bot de WhatsApp con IA para tu negocio, 24/7 | BotWA' },
  description: 'Conecta tu WhatsApp a una IA que responde con la información de tu negocio: precios, horarios, catálogo, citas y pedidos. Prueba 7 días con $0 hoy.',
  alternates: { canonical: '/' },
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

const AUDIENCES: { icon: string; title: string; text: string; href?: string }[] = [
  { icon: '🍔', title: 'Restaurantes y comidas', text: 'Menú, precios, domicilios y pedidos a cualquier hora.', href: '/bot-whatsapp-restaurantes' },
  { icon: '🦷', title: 'Clínicas y consultorios', text: 'Servicios, valores de consulta y agendamiento de citas.', href: '/bot-whatsapp-clinicas' },
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

const HOME_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: SITE_NAME,
      url: absoluteUrl('/'),
      logo: absoluteUrl('/favicon.png'),
    },
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: absoluteUrl('/'),
      description: 'Bot de WhatsApp con inteligencia artificial que responde a los clientes con la información del negocio, agenda citas y toma pedidos.',
      offers: Object.values(PLANS).map(p => ({
        '@type': 'Offer',
        name: p.name,
        price: p.priceCOP,
        priceCurrency: 'COP',
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: LANDING_FAQS.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
};

export default function HomePage() {
  const waLink = salesWhatsAppLink();

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SESSION_CHECK_SCRIPT }} />
      <JsonLd data={HOME_JSON_LD} />
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
            <Link href="/guias">Guías</Link>
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
            {AUDIENCES.map(a => {
              const body = (
                <>
                  <span style={{ fontSize: 28 }}>{a.icon}</span>
                  <div>
                    <h3 className="lp-h3" style={{ fontSize: 15, marginBottom: 4 }}>{a.title}</h3>
                    <p className="lp-text" style={{ fontSize: 13 }}>{a.text}</p>
                    {a.href && <span style={{ color: '#00CFFF', fontSize: 13, fontWeight: 700 }}>Ver más →</span>}
                  </div>
                </>
              );
              return a.href ? (
                <Link key={a.title} href={a.href} className="card lp-audience lp-guide-card">{body}</Link>
              ) : (
                <div key={a.title} className="card lp-audience">{body}</div>
              );
            })}
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

        <PublicFooter />

        {/* Botón flotante de WhatsApp */}
        <a href={waLink} target="_blank" rel="noopener noreferrer" className="lp-wa-float" aria-label="Pruébalo por WhatsApp">
          💬<span className="lp-hide-mobile"> Pruébalo por WhatsApp</span>
        </a>
      </div>
    </>
  );
}
