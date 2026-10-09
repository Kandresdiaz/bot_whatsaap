// Datos públicos del sitio para SEO (URLs absolutas, canonical, sitemap, Open Graph).
// Cuando haya dominio propio basta con definir NEXT_PUBLIC_SITE_URL en Vercel.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bot-whatsaap.vercel.app').replace(/\/$/, '');
export const SITE_NAME = 'BotWA';

export const absoluteUrl = (path = '/') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;

// Next reemplaza (no fusiona) el openGraph del layout cuando una página define el suyo:
// cada página lo extiende con esto para no perder la imagen, el nombre y el idioma.
export const OG_DEFAULTS = {
  siteName: SITE_NAME,
  locale: 'es_CO',
  images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'BotWA — Bot de WhatsApp con IA que responde 24/7' }],
};
