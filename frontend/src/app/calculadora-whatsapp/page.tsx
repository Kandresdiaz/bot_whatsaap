import type { Metadata } from 'next';
import Link from 'next/link';
import { LANDING_CSS } from '@/components/landing/landingCss';
import { PublicNav, PublicFooter, JsonLd } from '@/components/landing/PublicChrome';
import LostSalesCalculator from '@/components/landing/LostSalesCalculator';
import { OG_DEFAULTS, absoluteUrl } from '@/lib/site';

const TITLE = 'Calculadora: cuánto pierdes por no responder el WhatsApp';
const DESCRIPTION =
  'Calcula gratis cuántas ventas, pedidos o citas pierde tu negocio cada mes por responder tarde el WhatsApp. Para restaurantes, consultorios y tiendas.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/calculadora-whatsapp' },
  openGraph: { ...OG_DEFAULTS, title: TITLE, description: DESCRIPTION, url: '/calculadora-whatsapp' },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Calculadora de ventas perdidas por WhatsApp',
  url: absoluteUrl('/calculadora-whatsapp'),
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: 0, priceCurrency: 'COP' },
};

export default function CalculatorPage() {
  return (
    <div className="lp">
      <style>{LANDING_CSS}</style>
      <JsonLd data={JSON_LD} />
      <PublicNav />
      <main className="lp-wrap" style={{ maxWidth: 860, paddingTop: 24 }}>
        <h1 className="lp-h1" style={{ fontSize: 'clamp(28px, 4.2vw, 42px)' }}>
          ¿Cuánto pierdes por no responder <span className="lp-grad">el WhatsApp a tiempo?</span>
        </h1>
        <p className="lp-lead">
          Cada cliente que pregunta y no recibe respuesta rápida termina comprando en otro lado. Pon tus números y mira
          cuánto suma en un mes.
        </p>

        <LostSalesCalculator />

        <section className="lp-article" style={{ padding: 0, maxWidth: 'none', marginTop: 48 }}>
          <h2>Cómo se calcula</h2>
          <p>
            Conversaciones al día × 30 días × % sin respuesta a tiempo = conversaciones perdidas al mes. De esas, el % que
            habría comprado te da las ventas perdidas, y multiplicado por tu valor promedio, el dinero que se va.
          </p>
          <h2>Cómo bajar ese número</h2>
          <p>
            Lee nuestras guías para{' '}
            <Link href="/guias/como-recibir-pedidos-por-whatsapp-restaurante" style={{ color: '#00CFFF' }}>recibir pedidos por WhatsApp</Link>{' '}
            y para{' '}
            <Link href="/guias/como-reducir-inasistencias-citas-consultorio" style={{ color: '#00CFFF' }}>reducir inasistencias a citas</Link>, o
            deja que un bot responda por ti las 24 horas.
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
