'use client';
// Banner global persistente del estado de conexión de WhatsApp.
// Aparece en todo el panel (menos en la propia página "Conectar WhatsApp") para
// que, si el bot se cae o está reconectando, se vea sin tener que entrar a revisar.
// Escucha los mismos eventos de socket que connect/page.tsx y, además, consulta
// el estado al cargar por si la caída ocurrió antes de abrir el panel.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { io } from 'socket.io-client';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { BACKEND_URL } from '@/lib/config';
import { apiFetch } from '@/lib/api';

const BACKEND = BACKEND_URL;
const CONNECTED_FLAG = 'botwa_connected_once';

type ConnState = 'connected' | 'reconnecting' | 'disconnected' | 'unknown';

export default function ConnectionBanner() {
  const { user, effectiveUserId } = useAuth();
  const pathname = usePathname();
  const [state, setState] = useState<ConnState>('unknown');

  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;

    const markConnectedOnce = () => {
      try { localStorage.setItem(CONNECTED_FLAG, '1'); } catch (_) {}
    };
    const connectedBefore = () => {
      try { return localStorage.getItem(CONNECTED_FLAG) === '1'; } catch (_) { return false; }
    };

    const socket = io(BACKEND, {
      transports: BACKEND ? ['websocket', 'polling'] : ['polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    const joinRooms = () => {
      socket.emit('join_session', effectiveUserId);
      if (user?.id) socket.emit('join_session', user.id);
      if (user?.is_admin) {
        socket.emit('join_session', '00000000-0000-0000-0000-000000000001');
        socket.emit('join_session', 'admin');
      }
    };
    socket.on('connect', joinRooms);
    joinRooms();

    const onConnected = () => { markConnectedOnce(); if (!cancelled) setState('connected'); };
    socket.on('connected', onConnected);
    socket.on('session_ready', onConnected);
    socket.on('reconnecting', () => { if (!cancelled) setState('reconnecting'); });
    socket.on('disconnected', (payload?: any) => {
      // Ignorar el caso "número duplicado": eso es un error de alta, no una caída.
      if (payload?.isDuplicate) return;
      if (!cancelled) setState('disconnected');
    });

    // Estado inicial al cargar (por si la caída pasó antes de abrir el panel)
    const loadInitial = async () => {
      try {
        const r = await apiFetch(`${BACKEND}/api/sessions/status/${effectiveUserId}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        const s = d?.session?.status;
        if (s === 'connected') { markConnectedOnce(); setState('connected'); }
        else if (s === 'reconnecting' || s === 'connecting') setState('reconnecting');
        else if (s === 'disconnected') {
          // Solo alarmar si este navegador ya vio el bot conectado alguna vez,
          // para no molestar a quien aún no ha hecho la conexión inicial.
          setState(connectedBefore() ? 'disconnected' : 'unknown');
        }
      } catch (_) {}
    };
    loadInitial();

    return () => {
      cancelled = true;
      try { socket.off(); socket.disconnect(); } catch (_) {}
    };
  }, [effectiveUserId, user?.id, user?.is_admin]);

  // No mostrar en la página de conexión (ahí ya se ve el estado en grande).
  if (pathname?.startsWith('/dashboard/connect')) return null;
  if (state !== 'reconnecting' && state !== 'disconnected') return null;

  const isReconnecting = state === 'reconnecting';

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '10px 16px',
        fontSize: 14,
        fontWeight: 600,
        color: isReconnecting ? '#78350F' : '#7F1D1D',
        background: isReconnecting ? '#FEF3C7' : '#FEE2E2',
        borderBottom: `1px solid ${isReconnecting ? '#FCD34D' : '#FCA5A5'}`,
      }}
    >
      <span style={{ fontSize: 16 }}>{isReconnecting ? '🟡' : '🔴'}</span>
      <span>
        {isReconnecting
          ? 'Reconectando WhatsApp… el bot puede no responder por unos segundos.'
          : 'WhatsApp desconectado. Tu bot no está respondiendo a tus clientes.'}
      </span>
      {!isReconnecting && (
        <Link
          href="/dashboard/connect"
          style={{
            marginLeft: 'auto',
            background: '#DC2626',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Reconectar ahora →
        </Link>
      )}
    </div>
  );
}
