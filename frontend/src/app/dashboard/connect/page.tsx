'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://bot-whatsaap-tkjd.onrender.com';

type Status = 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';

export default function ConnectPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('disconnected');
  const [qr, setQr] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // ── Polling: pregunta al backend cada 3s el estado de la sesión ──────────
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/sessions/status/${user.id}`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;

        const s = d.session;
        if (!s) return;

        if (s.status === 'connected') {
          setStatus('connected');
          setPhone(s.phone_number || null);
          setQr(null);
          setError(null);
        } else if (s.qr_code && s.status !== 'connected') {
          setQr(s.qr_code);
          setStatus('qr_ready');
          setError(null);
        }
      } catch (_) {
        // silencioso — el polling sigue intentando
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.id, retryCount]);

  // ── Socket.io para QR en tiempo real ─────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    let socket: any = null;

    const connectSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        socket = io(BACKEND, {
          transports: ['polling', 'websocket'], // polling primero como fallback
          timeout: 10000,
          reconnectionAttempts: 5,
        });

        socket.emit('join_session', user!.id);

        socket.on('qr', ({ qr: qrData }: { qr: string }) => {
          setQr(qrData);
          setStatus('qr_ready');
          setError(null);
        });

        socket.on('connected', ({ phone: p }: { phone: string }) => {
          setQr(null);
          setStatus('connected');
          setPhone(p);
          setError(null);
        });

        socket.on('session_ready', ({ phone: p }: { phone: string }) => {
          setQr(null);
          setStatus('connected');
          setPhone(p);
        });

        socket.on('disconnected', () => {
          setStatus('disconnected');
          setQr(null);
        });

        socket.on('connect_error', (e: Error) => {
          console.warn('[Socket] Error de conexión (usando polling):', e.message);
        });
      } catch (e) {
        console.warn('[Socket] No se pudo conectar socket:', e);
      }
    };

    connectSocket();
    return () => { if (socket) socket.disconnect(); };
  }, [user?.id]);

  // ── Iniciar sesión / pedir QR ─────────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (!user?.id) return;
    setStatus('connecting');
    setError(null);
    setQr(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${BACKEND}/api/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      let data: any = {};
      try { data = await res.json(); } catch (_) {}

      if (res.ok && data.success) {
        // Éxito — el QR llegará por Socket.io o polling
        setError(null);
      } else {
        const msg = data.error || `Error del servidor (HTTP ${res.status})`;
        setError(`⚠️ ${msg}`);
        setStatus('error');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('⏱ El servidor tardó mucho. Puede estar iniciando, espera y vuelve a intentar.');
      } else {
        setError(`⚠️ No se pudo conectar al servidor: ${e.message}`);
      }
      setStatus('error');
    }
  }, [user?.id]);

  // ── Desconectar ───────────────────────────────────────────────────────────
  const stopSession = async () => {
    if (!user?.id) return;
    try {
      await fetch(`${BACKEND}/api/sessions/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch (_) {}
    setStatus('disconnected');
    setQr(null);
    setPhone(null);
    setError(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const statusMap = {
    disconnected: { color: 'red',    label: 'Desconectado',       dot: 'dot-red' },
    connecting:   { color: 'yellow', label: 'Iniciando...',        dot: 'dot-yellow' },
    qr_ready:     { color: 'yellow', label: 'Esperando escaneo',   dot: 'dot-yellow' },
    connected:    { color: 'green',  label: 'Conectado ✅',        dot: 'dot-green' },
    error:        { color: 'red',    label: 'Error — ver abajo',   dot: 'dot-red' },
  };
  const s = statusMap[status];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📱 Conectar WhatsApp</h1>
        <p className="page-subtitle">Escanea el QR con tu WhatsApp para activar el bot 24/7</p>
      </div>

      {/* Estado + Acciones */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>Estado del bot</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`dot ${s.dot}`} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>{s.label}</span>
          </div>
          {phone && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              📞 +{phone}
            </div>
          )}
        </div>

        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Acciones</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(status === 'disconnected' || status === 'error') && (
              <button className="btn btn-primary" onClick={startSession}>
                🔌 Conectar WhatsApp
              </button>
            )}
            {status === 'connecting' && (
              <button className="btn btn-primary" disabled>
                <span className="spinner" style={{ width: 16, height: 16 }} /> Iniciando...
              </button>
            )}
            {(status === 'qr_ready' || status === 'connected') && (
              <button className="btn btn-danger" onClick={stopSession}>
                ⏹ Desconectar
              </button>
            )}
            {(status === 'error' || status === 'connecting') && (
              <button
                className="btn btn-ghost"
                onClick={() => { setRetryCount(c => c + 1); setStatus('disconnected'); setError(null); }}
              >
                🔄 Reintentar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error visible */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 24,
          fontSize: 14,
          color: '#fca5a5',
          lineHeight: 1.6,
        }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>❌ Error de conexión</strong>
          {error}
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
            💡 Si el error dice "startSession" o "Cannot read", el servidor en Render necesita redespliegue manual.{' '}
            <a
              href="https://dashboard.render.com"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-light)', textDecoration: 'underline' }}
            >
              Ir a Render →
            </a>
          </div>
        </div>
      )}

      {/* QR Code */}
      {qr && (
        <div className="qr-container" style={{ maxWidth: 360, marginBottom: 24 }}>
          <div style={{ fontSize: 36 }}>📷</div>
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>Escanea con WhatsApp</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 260 }}>
            Abre WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR WhatsApp"
            style={{ width: 260, height: 260, borderRadius: 12, border: '4px solid rgba(26,107,255,0.3)' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <span className="dot dot-yellow" /> Esperando escaneo... (expira en ~60s)
          </div>
          <button className="btn btn-ghost" onClick={startSession} style={{ fontSize: 13 }}>
            🔄 Regenerar QR
          </button>
        </div>
      )}

      {/* Conectado */}
      {status === 'connected' && (
        <div className="card" style={{
          maxWidth: 500, marginBottom: 24,
          borderColor: 'rgba(34,197,94,0.3)',
          background: 'rgba(34,197,94,0.05)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h3 style={{ fontWeight: 700, marginBottom: 8, color: '#4ade80' }}>¡Bot Activo 24/7!</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
            WhatsApp conectado. El bot responde automáticamente con IA.
          </p>
          <a href="/dashboard/conversations" className="btn btn-success">
            Ver conversaciones →
          </a>
        </div>
      )}

      {/* Diagnóstico del servidor */}
      <div className="card" style={{ maxWidth: 520, borderColor: 'rgba(26,107,255,0.15)' }}>
        <h3 style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>🔧 Estado del servidor</h3>
        <ServerStatus backendUrl={BACKEND} />
      </div>

      {/* Instrucciones */}
      <div className="card" style={{ marginTop: 16, maxWidth: 520 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 14 }}>📋 Pasos para conectar</h3>
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 20 }}>
          {[
            'Haz clic en "🔌 Conectar WhatsApp"',
            'Espera que aparezca el código QR (5-15 segundos)',
            'Abre WhatsApp en tu celular',
            'Ve a Ajustes → Dispositivos vinculados',
            'Toca "Vincular dispositivo" y escanea el QR',
            '¡Listo! El bot queda activo 24/7 automáticamente',
          ].map((step, i) => (
            <li key={i} style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{step}</strong>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── Componente de diagnóstico del servidor ────────────────────────────────────
function ServerStatus({ backendUrl }: { backendUrl: string }) {
  const [info, setInfo] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      setChecking(true);
      try {
        // Probar ping
        const ping = await fetch(`${backendUrl}/ping`, { signal: AbortSignal.timeout(5000) });
        const pingOk = ping.ok;

        // Probar versión (solo disponible en nuevo deploy)
        let version = null;
        try {
          const vr = await fetch(`${backendUrl}/api/debug/version`, { signal: AbortSignal.timeout(5000) });
          if (vr.ok) version = await vr.json();
        } catch (_) {}

        setInfo({ pingOk, version });
      } catch (_) {
        setInfo({ pingOk: false, version: null });
      }
      setChecking(false);
    };
    check();
    const i = setInterval(check, 15000);
    return () => clearInterval(i);
  }, [backendUrl]);

  if (checking && !info) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Verificando servidor...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`dot ${info?.pingOk ? 'dot-green' : 'dot-red'}`} />
        <span>Servidor: {info?.pingOk ? 'En línea ✅' : 'Sin respuesta ❌'}</span>
      </div>
      {info?.version ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot dot-green" />
          <span>Versión desplegada: <code style={{ color: 'var(--accent-light)' }}>{info.version.commit?.slice(0, 7)}</code></span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot dot-yellow" />
          <span style={{ color: '#fbbf24' }}>
            ⚠️ Código viejo en Render. Redesplega en{' '}
            <a
              href="https://dashboard.render.com"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-light)', textDecoration: 'underline' }}
            >
              dashboard.render.com
            </a>
          </span>
        </div>
      )}
      {info?.version?.env && (
        <div style={{ marginTop: 4, padding: '8px 12px', background: 'rgba(26,107,255,0.06)', borderRadius: 8 }}>
          {Object.entries(info.version.env).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ color: v ? '#4ade80' : '#f87171' }}>{v ? '✅' : '❌ FALTA'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
