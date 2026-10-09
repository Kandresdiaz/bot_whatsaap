import Link from 'next/link';
import type { Niche } from '@/lib/niches';
import { guidesForNiche } from '@/lib/guides';
import { TRIAL_DAYS, TRIAL_MESSAGES, salesWhatsAppLink } from '@/lib/plans';
import { absoluteUrl } from '@/lib/site';
import { LANDING_CSS } from './landingCss';
import { PublicNav, PublicFooter, JsonLd } from './PublicChrome';

export default function NicheLanding({ niche }: { niche: Niche }) {
  const waLink = salesWhatsAppLink(niche.waText);
  const guides = guidesForNiche(niche.key);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'BotWA', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: niche.metaTitle, item: absoluteUrl(`/${niche.slug}`) },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: niche.faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <div className="lp">
      <style>{LANDING_CSS}</style>
      <JsonLd data={jsonLd} />
      <PublicNav />

      <main>
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className="lp-hero lp-wrap">
          <div className="lp-hero-copy">
            <div className="lp-pill">{niche.pill}</div>
            <h1 className="lp-h1">
              {niche.h1}, <span className="lp-grad">{niche.h1Highlight}</span>
            </h1>
            <p className="lp-lead">{niche.lead}</p>
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

          <div className="lp-phone" aria-hidden="true">
            <div className="lp-phone-head">
              <span className="lp-avatar">{niche.chatAvatar}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{niche.chatName}</div>
                <div style={{ fontSize: 11, color: '#4ade80' }}>en línea</div>
              </div>
            </div>
            <div className="lp-chat">
              {niche.chat.map((m, i) => (
                <div key={i} className={`lp-msg ${m.from === 'in' ? 'lp-msg-in' : 'lp-msg-out'}`}>
                  {m.text}<span>{m.time}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Problemas ──────────────────────────────────────────────── */}
        <section className="lp-section lp-wrap">
          <h2 className="lp-h2">{niche.painsTitle}</h2>
          <div className="lp-grid-3" style={{ marginTop: 30 }}>
            {niche.pains.map(p => (
              <div key={p.title} className="card">
                <div style={{ fontSize: 28, marginBottom: 10 }}>{p.icon}</div>
                <h3 className="lp-h3">{p.title}</h3>
                <p className="lp-text">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Funciones ──────────────────────────────────────────────── */}
        <section className="lp-section lp-wrap">
          <h2 className="lp-h2">{niche.featuresTitle}</h2>
          <div className="lp-grid-audience" style={{ marginTop: 30 }}>
            {niche.features.map(f => (
              <div key={f.title} className="card lp-audience">
                <span style={{ fontSize: 28 }}>{f.icon}</span>
                <div>
                  <h3 className="lp-h3" style={{ fontSize: 15, marginBottom: 4 }}>{f.title}</h3>
                  <p className="lp-text" style={{ fontSize: 13 }}>{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Configuración ──────────────────────────────────────────── */}
        <section className="lp-section lp-wrap" style={{ maxWidth: 820 }}>
          <h2 className="lp-h2">{niche.setupTitle}</h2>
          <ol className="lp-steps-list">
            {niche.setup.map((s, i) => (
              <li key={s} className="card"><span>{i + 1}</span>{s}</li>
            ))}
          </ol>
        </section>

        {/* ── Preguntas ──────────────────────────────────────────────── */}
        <section className="lp-section lp-wrap" style={{ maxWidth: 820 }}>
          <h2 className="lp-h2">Preguntas frecuentes</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
            {niche.faqs.map(f => (
              <details key={f.q} className="card lp-faq">
                <summary>{f.q}</summary>
                <p className="lp-text" style={{ marginTop: 10 }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Guías relacionadas ─────────────────────────────────────── */}
        {guides.length > 0 && (
          <section className="lp-section lp-wrap" style={{ maxWidth: 820 }}>
            <h2 className="lp-h2">Guías para tu negocio</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
              {guides.map(g => (
                <Link key={g.slug} href={`/guias/${g.slug}`} className="card lp-guide-card">
                  <h3 className="lp-h3" style={{ fontSize: 16 }}>{g.title}</h3>
                  <p className="lp-text" style={{ fontSize: 13 }}>{g.description}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Cierre ─────────────────────────────────────────────────── */}
        <section className="lp-wrap">
          <div className="lp-final">
            <h2 className="lp-h2" style={{ marginBottom: 10 }}>{niche.ctaText}</h2>
            <p className="lp-text" style={{ maxWidth: 560, margin: '0 auto 22px', fontSize: 15 }}>
              O escríbele a nuestro bot de ventas: es un bot de BotWA atendiendo de verdad.
            </p>
            <div className="lp-cta-row" style={{ justifyContent: 'center' }}>
              <Link href="/pricing" className="btn btn-primary lp-btn-lg">Empezar prueba gratis →</Link>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn lp-btn-lg lp-btn-wa">
                💬 Pruébalo por WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />

      <a href={waLink} target="_blank" rel="noopener noreferrer" className="lp-wa-float" aria-label="Pruébalo por WhatsApp">
        💬<span className="lp-hide-mobile"> Pruébalo por WhatsApp</span>
      </a>
    </div>
  );
}
