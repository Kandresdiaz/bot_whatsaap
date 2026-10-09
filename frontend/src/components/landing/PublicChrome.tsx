import Link from 'next/link';
import { salesWhatsAppLink } from '@/lib/plans';
import { NICHE_LIST } from '@/lib/niches';

// Navegación y pie de las páginas públicas (nichos y guías). La landing tiene su propia barra con anclas.
export function PublicNav() {
  return (
    <header className="lp-nav lp-wrap">
      <Link href="/" className="lp-logo">
        <span className="lp-logo-icon">🤖</span>
        <span>BotWA</span>
      </Link>
      <nav className="lp-nav-links">
        <Link href="/bot-whatsapp-restaurantes">Restaurantes</Link>
        <Link href="/bot-whatsapp-clinicas">Clínicas</Link>
        <Link href="/guias">Guías</Link>
        <Link href="/pricing">Planes</Link>
      </nav>
      <div className="lp-nav-actions">
        <Link href="/login" className="btn btn-ghost lp-btn-sm">Iniciar sesión</Link>
        <Link href="/pricing" className="btn btn-primary lp-btn-sm lp-hide-mobile">Probar gratis</Link>
      </div>
    </header>
  );
}

const NICHE_LABELS: Record<string, string> = {
  restaurantes: 'Bot de WhatsApp para restaurantes',
  clinicas: 'Bot de WhatsApp para clínicas',
};

export function PublicFooter() {
  const waLink = salesWhatsAppLink();
  return (
    <footer className="lp-wrap lp-footer">
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
        {NICHE_LIST.map(n => (
          <Link key={n.slug} href={`/${n.slug}`}>{NICHE_LABELS[n.key]}</Link>
        ))}
        <Link href="/guias">Guías</Link>
        <Link href="/pricing">Planes</Link>
        <Link href="/login">Iniciar sesión</Link>
        <a href={waLink} target="_blank" rel="noopener noreferrer">Contacto por WhatsApp</a>
      </div>
      <p>
        BotWA es un software independiente. No está afiliado ni respaldado por Meta Platforms, Inc. ni WhatsApp LLC.
        WhatsApp es una marca registrada de Meta Platforms, Inc.
      </p>
    </footer>
  );
}

// Datos estructurados (schema.org) para que Google entienda la página.
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // `<` escapado para que ningún texto pueda cerrar la etiqueta script.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
