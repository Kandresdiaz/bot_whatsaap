'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { BACKEND_URL } from '@/lib/config';
import { apiFetch } from '@/lib/api';

type Fields = Record<string, string | number | undefined>;

type Detected = {
  lead: boolean;
  order: Fields | null;
  appointment: Fields | null;
  cancellation: Fields | null;
};

type ChatMsg = {
  from: 'client' | 'bot';
  text: string;
  image?: { url: string; caption: string } | null;
  usedFallback?: boolean;
  detected?: Detected;
};

const SALES_EXAMPLES = [
  '¿Qué tienen disponible?',
  '¿Cuánto cuesta el más económico?',
  'Me interesa, ¿cómo lo compro?',
  '¿Me muestras una foto?',
  'Quiero ir a verlo en persona el sábado',
];

const BOOKING_EXAMPLES = [
  '¿Qué servicios tienen?',
  '¿Cuánto cuesta?',
  'Quiero agendar una cita para mañana',
  '¿Qué horarios tienen el sábado?',
  'Necesito cancelar mi cita',
];

const fmtCOP = (v: string | number | undefined) => {
  const n = Number(v);
  return n > 0 ? `$${n.toLocaleString('es-CO')}` : 'Por liquidar';
};

function DetectedCard({ d }: { d: Detected }) {
  if (d.order) {
    const o = d.order;
    return (
      <div className="card" style={{ padding: 12, marginTop: 6, borderColor: 'rgba(34,197,94,0.4)', fontSize: 13, maxWidth: '85%' }}>
        <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>🛍️ Aquí el bot registraría un pedido</div>
        <div>Cliente: <b>{o.nombre || '—'}</b>{o.telefono ? ` · ${o.telefono}` : ''}</div>
        <div>Producto: <b>{o.producto || '—'}</b> × {o.cantidad || 1}</div>
        <div>Total: <b>{fmtCOP(o.total)}</b></div>
        {(o.direccion || o.ciudad) && <div>Entrega: {[o.direccion, o.ciudad].filter(Boolean).join(', ')}</div>}
        <div>Pago: {o.metodo_pago || 'Por confirmar'}</div>
        {o.notas && <div>Notas: {o.notas}</div>}
        <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>En WhatsApp quedaría en “Pedidos y Ventas”.</div>
      </div>
    );
  }
  if (d.appointment) {
    const a = d.appointment;
    return (
      <div className="card" style={{ padding: 12, marginTop: 6, borderColor: 'rgba(0,207,255,0.4)', fontSize: 13, maxWidth: '85%' }}>
        <div style={{ fontWeight: 700, color: '#00CFFF', marginBottom: 6 }}>📅 Aquí el bot agendaría una cita</div>
        <div>Cliente: <b>{a.nombre || '—'}</b></div>
        <div>Servicio: <b>{a.servicio || 'General'}</b></div>
        <div>Fecha: <b>{a.fecha || '—'}</b> a las <b>{String(a.hora || '').slice(0, 5) || '—'}</b></div>
        <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>En WhatsApp quedaría en “Calendario y Citas”.</div>
      </div>
    );
  }
  if (d.cancellation) {
    return (
      <div className="card" style={{ padding: 12, marginTop: 6, borderColor: 'rgba(239,68,68,0.4)', fontSize: 13, maxWidth: '85%' }}>
        <div style={{ fontWeight: 700, color: '#f87171' }}>🛑 Aquí el bot cancelaría la cita{d.cancellation.fecha ? ` del ${d.cancellation.fecha}` : ''}</div>
      </div>
    );
  }
  if (d.lead) {
    return <div style={{ fontSize: 12, color: '#facc15', marginTop: 4 }}>🔥 Cliente marcado como interesado (lead)</div>;
  }
  return null;
}

export default function TestBotPage() {
  const { effectiveUserId } = useAuth();
  const [business, setBusiness] = useState<{ name?: string; main_goal?: string } | null>(null);
  // El chat queda atado al negocio: si el admin cambia de cliente, arranca vacío
  const [chat, setChat] = useState<{ uid: string; msgs: ChatMsg[] }>({ uid: '', msgs: [] });
  const msgs = chat.uid === effectiveUserId ? chat.msgs : [];
  const setMsgs = (fn: (prev: ChatMsg[]) => ChatMsg[]) =>
    setChat(c => ({ uid: effectiveUserId, msgs: fn(c.uid === effectiveUserId ? c.msgs : []) }));
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!effectiveUserId) return;
    apiFetch(`${BACKEND_URL}/api/business/${effectiveUserId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setBusiness(d?.business || null))
      .catch(() => setBusiness(null));
  }, [effectiveUserId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat, sending]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || sending) return;
    setInput('');
    setError(null);
    const history = msgs.map(m => ({ from: m.from, text: m.text }));
    setMsgs(prev => [...prev, { from: 'client', text }]);
    setSending(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/business/simulate/${effectiveUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo generar la respuesta.');
      setMsgs(prev => [...prev, {
        from: 'bot', text: data.reply, image: data.image, usedFallback: data.usedFallback, detected: data.detected,
      }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la respuesta.');
    } finally {
      setSending(false);
    }
  };

  const examples = business?.main_goal === 'agendar_citas' ? BOOKING_EXAMPLES : SALES_EXAMPLES;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <h1 className="page-title">🧪 Probar mi bot</h1>
        <p className="page-subtitle">
          Escríbele como si fueras un cliente. Responde con tu catálogo, tus FAQ y tus instrucciones, igual que en WhatsApp.
          Nada de lo que pruebes aquí se guarda ni crea pedidos o citas reales.
        </p>
      </div>

      <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'min(70vh, 640px)', minHeight: 420 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{business?.name || 'Tu negocio'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {business?.main_goal === 'agendar_citas' ? '📅 Objetivo: agendar citas' : '🛒 Objetivo: vender'} · simulación
            </div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setMsgs(() => []); setError(null); }} disabled={sending || msgs.length === 0}>
            ↺ Empezar de nuevo
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msgs.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, maxWidth: 420 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              Empieza con un “Hola” o toca un ejemplo de abajo. Cuando el bot cierre una venta o agende una cita, verás cómo quedaría registrada.
            </div>
          )}

          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'client' ? 'flex-end' : 'flex-start' }}>
              <div className={`msg-bubble ${m.from === 'client' ? 'msg-out' : 'msg-in'}`} style={{ whiteSpace: 'pre-wrap' }}>
                {m.text}
              </div>
              {m.image && (
                <div className="msg-bubble msg-in" style={{ marginTop: 4, padding: 6 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.image.url} alt={m.image.caption} style={{ maxWidth: 220, borderRadius: 10, display: 'block' }} />
                  <div style={{ fontSize: 12, marginTop: 4 }}>{m.image.caption}</div>
                </div>
              )}
              {m.usedFallback && (
                <div style={{ fontSize: 12, color: '#facc15', marginTop: 4, maxWidth: '85%' }}>
                  ⚠️ La IA no respondió y salió una respuesta automática de respaldo. Prueba de nuevo en unos segundos.
                </div>
              )}
              {m.detected && <DetectedCard d={m.detected} />}
            </div>
          ))}

          {sending && (
            <div className="msg-bubble msg-in" style={{ color: 'var(--text-muted)' }}>escribiendo…</div>
          )}
          <div ref={endRef} />
        </div>

        {error && <div style={{ padding: '8px 16px', color: '#f87171', fontSize: 13 }}>{error}</div>}

        <div style={{ padding: '8px 16px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {examples.map(ex => (
            <button key={ex} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => send(ex)} disabled={sending}>
              {ex}
            </button>
          ))}
        </div>

        <form
          onSubmit={e => { e.preventDefault(); send(); }}
          style={{ padding: 16, display: 'flex', gap: 8 }}
        >
          <input
            className="input"
            placeholder="Escribe como si fueras un cliente…"
            value={input}
            onChange={e => setInput(e.target.value)}
            maxLength={1000}
            disabled={sending}
          />
          <button className="btn btn-primary" type="submit" disabled={sending || !input.trim()}>
            Enviar
          </button>
        </form>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
        ¿No responde como quieres? Ajusta las instrucciones en <Link href="/dashboard/bot-config" style={{ color: '#00CFFF' }}>Configurar Bot</Link>,
        el <Link href="/dashboard/products" style={{ color: '#00CFFF' }}>catálogo</Link> o la <Link href="/dashboard/knowledge" style={{ color: '#00CFFF' }}>base de conocimiento</Link> y vuelve a probar.
      </p>
    </div>
  );
}
