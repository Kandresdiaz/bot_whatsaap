import { ImageResponse } from 'next/og';

// Imagen al compartir el enlace en WhatsApp, Facebook, LinkedIn, etc. Aplica a todas las páginas.
export const alt = 'BotWA — Bot de WhatsApp con IA que responde 24/7';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: 'radial-gradient(ellipse at 50% 0%, #12306b 0%, #080E1F 65%)',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, color: '#00CFFF' }}>BotWA</div>
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 900, lineHeight: 1.1, marginTop: 24 }}>
          Tu WhatsApp responde solo, 24/7
        </div>
        <div style={{ display: 'flex', fontSize: 34, color: '#cbd5e1', marginTop: 28 }}>
          Pedidos para restaurantes · Citas para clínicas y consultorios
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#4ade80', marginTop: 40, fontWeight: 700 }}>
          Prueba 7 días · $0 hoy
        </div>
      </div>
    ),
    size,
  );
}
