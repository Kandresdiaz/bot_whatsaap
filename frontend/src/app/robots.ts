import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Paneles privados, callback de OAuth y el proxy al backend no aportan nada al buscador.
      disallow: ['/dashboard', '/admin', '/auth', '/api', '/socket.io', '/ping'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
