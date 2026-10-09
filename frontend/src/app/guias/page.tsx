import type { Metadata } from 'next';
import Link from 'next/link';
import { GUIDES } from '@/lib/guides';
import { NICHES } from '@/lib/niches';
import { LANDING_CSS } from '@/components/landing/landingCss';
import { PublicNav, PublicFooter } from '@/components/landing/PublicChrome';

export const metadata: Metadata = {
  title: 'Guías para vender y atender por WhatsApp',
  description:
    'Guías prácticas para restaurantes, clínicas y consultorios: cómo recibir pedidos, agendar citas y automatizar la atención por WhatsApp.',
  alternates: { canonical: '/guias' },
};

const SECTIONS = [
  { niche: NICHES.restaurantes, label: '🍔 Restaurantes y domicilios' },
  { niche: NICHES.clinicas, label: '🦷 Clínicas y consultorios' },
];

export default function GuidesIndexPage() {
  return (
    <div className="lp">
      <style>{LANDING_CSS}</style>
      <PublicNav />
      <main className="lp-wrap" style={{ maxWidth: 820 }}>
        <h1 className="lp-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginTop: 32 }}>
          Guías para vender y atender por WhatsApp
        </h1>
        <p className="lp-lead">Consejos prácticos para negocios que reciben pedidos y citas por WhatsApp todos los días.</p>

        {SECTIONS.map(({ niche, label }) => (
          <section key={niche.key} style={{ marginTop: 40 }}>
            <h2 className="lp-h3" style={{ fontSize: 20 }}>{label}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {GUIDES.filter(g => g.niche === niche.key).map(g => (
                <Link key={g.slug} href={`/guias/${g.slug}`} className="card lp-guide-card">
                  <h3 className="lp-h3" style={{ fontSize: 16 }}>{g.title}</h3>
                  <p className="lp-text" style={{ fontSize: 13 }}>{g.description}</p>
                </Link>
              ))}
            </div>
            <p style={{ marginTop: 12 }}>
              <Link href={`/${niche.slug}`} style={{ color: '#00CFFF', fontSize: 14, fontWeight: 600 }}>
                Ver BotWA para {niche.key === 'restaurantes' ? 'restaurantes' : 'clínicas y consultorios'} →
              </Link>
            </p>
          </section>
        ))}
      </main>
      <PublicFooter />
    </div>
  );
}
