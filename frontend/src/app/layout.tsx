import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import AttributionCapture from "@/components/AttributionCapture";
import { SITE_URL, SITE_NAME } from "@/lib/site";

// Versión del Frontend: 1.1.3 (Persistencia F5 absoluta: consulta global de DB e hidratación inmediata de RAM)
const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BotWA — Bot de WhatsApp con IA 24/7",
    template: "%s | BotWA",
  },
  description: "Automatiza tu WhatsApp con IA. Responde clientes 24/7 como un empleado real. Para restaurantes, dentistas, consultorías y más.",
  applicationName: SITE_NAME,
  // Código de Google Search Console (método "etiqueta HTML"): se pega en la variable de Vercel.
  verification: process.env.NEXT_PUBLIC_GSC_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION }
    : undefined,
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png', sizes: '512x512' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'BotWA — Bot de WhatsApp con IA',
    description: 'Automatiza tu WhatsApp con IA. Responde clientes 24/7.',
    type: 'website',
    siteName: SITE_NAME,
    locale: 'es_CO',
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <meta name="theme-color" content="#080E1F" />
      </head>
      <body className={inter.className}>
        <AttributionCapture />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
