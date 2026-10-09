import type { Metadata } from 'next';
import NicheLanding from '@/components/landing/NicheLanding';
import { NICHES } from '@/lib/niches';
import { OG_DEFAULTS } from '@/lib/site';

const niche = NICHES.restaurantes;

export const metadata: Metadata = {
  title: niche.metaTitle,
  description: niche.metaDescription,
  keywords: niche.keywords,
  alternates: { canonical: `/${niche.slug}` },
  openGraph: { ...OG_DEFAULTS, title: niche.metaTitle, description: niche.metaDescription, url: `/${niche.slug}` },
};

export default function Page() {
  return <NicheLanding niche={niche} />;
}
