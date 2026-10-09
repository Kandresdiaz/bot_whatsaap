import type { Metadata } from 'next';

// La página de planes es un componente de cliente; sus metadatos viven aquí.
export const metadata: Metadata = {
  title: 'Planes y precios del bot de WhatsApp con IA',
  description:
    'Planes desde $120.000 COP al mes con 7 días de prueba y $0 hoy. Catálogo con fotos, pedidos, citas y hasta 20.000 mensajes IA al mes.',
  alternates: { canonical: '/pricing' },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
