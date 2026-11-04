'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PLANS, formatCOP, salesWhatsAppLink } from '@/lib/plans';

type PresetKey = 'restaurantes' | 'clinicas' | 'otro';

interface Values { chatsPerDay: number; unansweredPct: number; closePct: number; ticket: number }

// Valores de partida razonables por tipo de negocio; la persona los cambia por los suyos.
const PRESETS: Record<PresetKey, { label: string; values: Values; link: string; ticketLabel: string }> = {
  restaurantes: {
    label: '🍔 Restaurante',
    values: { chatsPerDay: 30, unansweredPct: 20, closePct: 50, ticket: 32000 },
    link: '/bot-whatsapp-restaurantes',
    ticketLabel: 'Valor promedio de un pedido (COP)',
  },
  clinicas: {
    label: '🦷 Consultorio / clínica',
    values: { chatsPerDay: 10, unansweredPct: 30, closePct: 25, ticket: 150000 },
    link: '/bot-whatsapp-clinicas',
    ticketLabel: 'Valor promedio de una cita o tratamiento (COP)',
  },
  otro: {
    label: '🛍️ Otro negocio',
    values: { chatsPerDay: 20, unansweredPct: 25, closePct: 30, ticket: 80000 },
    link: '/',
    ticketLabel: 'Valor promedio de una venta (COP)',
  },
};

const PRO_PRICE = PLANS.pro.priceCOP;

// ?negocio=clinicas desde las guías y páginas de nicho: arranca con los valores de ese nicho.
// El HTML estático trae la versión de restaurante; al hidratar se ajusta al parámetro.
export default function LostSalesCalculator() {
  return (
    <Suspense fallback={<Calculator initial="restaurantes" />}>
      <CalculatorFromParams />
    </Suspense>
  );
}

function CalculatorFromParams() {
  const param = useSearchParams().get('negocio');
  const initial: PresetKey = param === 'clinicas' || param === 'otro' ? param : 'restaurantes';
  return <Calculator key={initial} initial={initial} />;
}

function Calculator({ initial }: { initial: PresetKey }) {
  const [preset, setPreset] = useState<PresetKey>(initial);
  const [v, setV] = useState<Values>(PRESETS[initial].values);

  const choose = (key: PresetKey) => {
    setPreset(key);
    setV(PRESETS[key].values);
  };
  const set = (field: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0);
    setV(prev => ({ ...prev, [field]: field.endsWith('Pct') ? Math.min(100, n) : n }));
  };

  const lostChats = Math.round(v.chatsPerDay * 30 * (v.unansweredPct / 100));
  const lostSales = Math.round(lostChats * (v.closePct / 100));
  const lostMoney = lostSales * v.ticket;
  const halfRecovered = Math.round(lostMoney / 2);
  const roi = halfRecovered / PRO_PRICE;
  const p = PRESETS[preset];

  return (
    <div>
      <div className="lp-tabs" role="tablist" aria-label="Tipo de negocio">
        {(Object.keys(PRESETS) as PresetKey[]).map(k => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={preset === k}
            className={`lp-tab${preset === k ? ' lp-tab-on' : ''}`}
            onClick={() => choose(k)}
          >
            {PRESETS[k].label}
          </button>
        ))}
      </div>

      <div className="lp-calc">
        <label>
          Clientes nuevos que te escriben al día
          <input inputMode="numeric" value={v.chatsPerDay} onChange={set('chatsPerDay')} />
          <small>Conversaciones de personas preguntando, no mensajes sueltos.</small>
        </label>
        <label>
          % que no recibe respuesta a tiempo
          <input inputMode="numeric" value={v.unansweredPct} onChange={set('unansweredPct')} />
          <small>Respuestas después de 15 minutos, en la noche o en hora pico.</small>
        </label>
        <label>
          % de esos que habrían comprado
          <input inputMode="numeric" value={v.closePct} onChange={set('closePct')} />
          <small>De cada 10 que preguntan y reciben respuesta, ¿cuántos compran o agendan?</small>
        </label>
        <label>
          {p.ticketLabel}
          <input inputMode="numeric" value={v.ticket} onChange={set('ticket')} />
          <small>Lo que paga un cliente en promedio.</small>
        </label>
      </div>

      <div className="lp-result" aria-live="polite">
        <div className="lp-text" style={{ fontSize: 14 }}>Estás dejando de vender aproximadamente</div>
        <div className="lp-big">{formatCOP(lostMoney)} <span style={{ fontSize: 18, color: '#94a3b8' }}>/ mes</span></div>
        <p className="lp-text" style={{ marginTop: 10 }}>
          {lostChats} conversaciones al mes se quedan sin respuesta a tiempo; unas {lostSales} habrían terminado en venta.
        </p>
        <p className="lp-text" style={{ marginTop: 10 }}>
          Si un bot recuperara <strong style={{ color: '#fff' }}>solo la mitad</strong>, serían{' '}
          <strong style={{ color: '#4ade80' }}>{formatCOP(halfRecovered)}</strong> al mes
          {roi >= 1
            ? <>: <strong style={{ color: '#4ade80' }}>{roi.toFixed(1).replace('.', ',')} veces</strong> lo que cuesta el plan Pro ({formatCOP(PRO_PRICE)}).</>
            : <>. Con estos números el plan Pro ({formatCOP(PRO_PRICE)}) no se paga solo: quizá el plan Vendedor Automático te sirva más.</>}
        </p>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
          Es una estimación con los datos que ingresaste, no una promesa de resultados.
        </p>
      </div>

      <div className="lp-cta-row" style={{ marginTop: 22 }}>
        <Link href="/pricing" className="btn btn-primary lp-btn-lg">Prueba 7 días con $0 hoy →</Link>
        <Link href={p.link} className="btn lp-btn-lg lp-btn-outline">Ver cómo funciona</Link>
        <a href={salesWhatsAppLink('Hola, usé la calculadora y quiero probar BotWA')} target="_blank" rel="noopener noreferrer" className="btn lp-btn-lg lp-btn-wa">
          💬 Pregúntale al bot
        </a>
      </div>
    </div>
  );
}
