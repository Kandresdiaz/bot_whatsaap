import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';
import { NICHE_LIST } from '@/lib/niches';
import { GUIDES } from '@/lib/guides';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/pricing'), lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    ...NICHE_LIST.map(n => ({
      url: absoluteUrl(`/${n.slug}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    { url: absoluteUrl('/guias'), lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    ...GUIDES.map(g => ({
      url: absoluteUrl(`/guias/${g.slug}`),
      lastModified: new Date(g.updated),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
