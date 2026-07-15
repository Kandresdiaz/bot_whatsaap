'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io } from 'socket.io-client';
import Link from 'next/link';

export default function ConnectPage() {
  const { user } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('disconnected');
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://bot-whatsaap-tkjd.onrender.com';

  // Obtener estado actual de la sesión
  useEffect(() => {
    if (!user) return;
    fetch(`${BACKEND}/api/sessions/status/${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.session) {
          setSession(d.session);
          setStatus(d.session.status);
        }
      });
  }, [user, BACKEND]);

  // Socket.io para QR en tiempo real
  useEffect(() => {
    if (!session?.id) return;
    const socket = io(BACKEND!);
    socket.emit('join_session', session.id);

    socket.on('qr', ({ qr: qrData }) => {
      setQr(qrData);
      setStatus('connecting');
    });

    socket.on('session_ready', ({ phone }) => {
      setQr(null);
      setStatus('connected');
      setSession((prev: any) => ({ ...prev, phone_number: phone, status: 'connected' }));
    });

    socket.on('session_disconnected', () => {
      setStatus('disconnected');
      setQr(null);
    });

    return () => { socket.disconnect(); };
  }, [session?.id, BACKEND]);

  const startSession = async () => {
    setLoading(true);
    const res = await fetch(`${BACKEND}/api/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user!.id }),
    });
    const data = await res.json();
    if (data.success) setSession({ id: data.sessionId });
    setLoading(false);
  };

  const stopSession = async () => {
    if (!session?.id) return;
    await fetch(`${BACKEND}/api/sessions/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    });
    setStatus('disconnected');
    setQr(null);
  };

  const statusColor = { connected: 'green', connecting: 'yellow', disconnected: 'red' }[status] || 'red';
  const statusLabel = { connected: 'Conectado', connecting: 'Conectando...', disconnected: 'Desconectado' }[status] || 'Desconectado';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📱 Conectar WhatsApp</h1>
        <p className="page-subtitle">Escanea el QR con tu WhatsApp para activar el bot</p>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Estado</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`dot dot-${statusColor}`} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>{statusLabel}</span>
          </div>
          {session?.phone_number && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              +{session.phone_number}
            </div>
          )}
        </div>

        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Acciones</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {status === 'disconnected' && (
              <button className="btn btn-primary" onClick={startSession} disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Iniciando...</> : '🔌 Conectar'}
              </button>
            )}
            {status !== 'disconnected' && (
              <button className="btn btn-danger" onClick={stopSession}>
                ⏹ Desconectar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code */}
      {qr && (
        <div className="qr-container" style={{ maxWidth: 400 }}>
          <div style={{ fontSize: 40 }}>📷</div>
          <h2 style={{ fontWeight: 700 }}>Escanea con WhatsApp</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR WhatsApp" style={{ width: 260, height: 260, borderRadius: 12 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <span className="dot dot-yellow" />
            Esperando escaneo...
          </div>
        </div>
      )}

      {status === 'connected' && (
        <div className="card" style={{ maxWidth: 500, borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.05)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h3 style={{ fontWeight: 700, marginBottom: 8, color: 'var(--green)' }}>¡Bot Activo!</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
            Tu WhatsApp está conectado y el bot está respondiendo automáticamente.
          </p>
          <Link href="/dashboard/conversations" className="btn btn-success">
            Ver conversaciones →
          </Link>
        </div>
      )}

      {/* Instructions */}
      <div className="card" style={{ marginTop: 24, maxWidth: 500 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>📋 Cómo conectar</h3>
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 20 }}>
          {[
            'Haz clic en "Conectar"',
            'Espera que aparezca el código QR',
            'Abre WhatsApp en tu celular',
            'Ve a Ajustes → Dispositivos vinculados',
            'Toca "Vincular dispositivo" y escanea el QR',
            '¡Listo! El bot queda activo 24/7',
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
