import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, getGuide } from '@/lib/guides';
import { NICHES } from '@/lib/niches';
import { TRIAL_DAYS, salesWhatsAppLink } from '@/lib/plans';
import { absoluteUrl, SITE_NAME, OG_DEFAULTS } from '@/lib/site';
import { LANDING_CSS } from '@/components/landing/landingCss';
import { PublicNav, PublicFooter, JsonLd } from '@/components/landing/PublicChrome';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map(g => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guias/${guide.slug}` },
    openGraph: {
      ...OG_DEFAULTS,
      type: 'article',
      title: guide.title,
      description: guide.description,
      url: `/guias/${guide.slug}`,
      publishedTime: guide.published,
      modifiedTime: guide.updated,
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  const niche = NICHES[guide.niche];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.description,
    datePublished: guide.published,
    dateModified: guide.updated,
    mainEntityOfPage: absoluteUrl(`/guias/${guide.slug}`),
    author: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
  };

  return (
    <div className="lp">
      <style>{LANDING_CSS}</style>
      <JsonLd data={jsonLd} />
      <PublicNav />
      <main className="lp-wrap lp-article">
        <p className="lp-breadcrumb">
          <Link href="/guias">Guías</Link> · <Link href={`/${niche.slug}`}>{niche.pill}</Link>
        </p>
        <h1 className="lp-h1">{guide.title}</h1>
        <p className="lp-lead">{guide.intro}</p>

        {guide.sections.map(s => (
          <section key={s.h2}>
            <h2>{s.h2}</h2>
            {s.paragraphs?.map(p => <p key={p}>{p}</p>)}
            {s.list && (
              <ul>
                {s.list.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}
          </section>
        ))}

        <div className="lp-final" style={{ marginTop: 48 }}>
          <h2 className="lp-h2" style={{ marginBottom: 10 }}>Automatízalo con BotWA</h2>
          <p className="lp-text" style={{ maxWidth: 560, margin: '0 auto 22px', fontSize: 15 }}>
            Prueba {TRIAL_DAYS} días con $0 hoy, o escríbele a nuestro bot y mira cómo responde.
          </p>
          <div className="lp-cta-row" style={{ justifyContent: 'center' }}>
            <Link href={`/${niche.slug}`} className="btn btn-primary lp-btn-lg">Ver cómo funciona →</Link>
            <a href={salesWhatsAppLink(niche.waText)} target="_blank" rel="noopener noreferrer" className="btn lp-btn-lg lp-btn-wa">
              💬 Pruébalo por WhatsApp
            </a>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
