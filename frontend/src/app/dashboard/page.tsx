'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function DashboardHome() {
  const { user } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [stats, setStats] = useState({ conversations: 0, messages: 0, leads: 0 });
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://bot-whatsaap-tkjd.onrender.com';

  useEffect(() => {
    if (!user) return;
    fetch(`${BACKEND}/api/sessions/status/${user.id}`)
      .then(r => r.json())
      .then(d => setSession(d.session));
  }, [user, BACKEND]);

  const isConnected = session?.status === 'connected';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">👋 Hola, {user?.name?.split(' ')[0]}</h1>
        <p className="page-subtitle">Panel de control de tu bot de WhatsApp</p>
      </div>

      {/* Status del bot */}
      <div className="card" style={{ marginBottom: 24, borderColor: isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)', background: isConnected ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 40 }}>{isConnected ? '🤖' : '😴'}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                {isConnected ? 'Bot activo y respondiendo' : 'Bot desconectado'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                {isConnected ? `Número: +${session.phone_number}` : 'Conecta tu WhatsApp para activar el bot'}
              </div>
            </div>
          </div>
          <Link href={isConnected ? '/dashboard/conversations' : '/dashboard/connect'} className="btn btn-primary">
            {isConnected ? '💬 Ver conversaciones' : '📱 Conectar ahora'}
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { href: '/dashboard/connect', icon: '📱', title: 'Conectar WhatsApp', desc: 'Escanea el QR', color: '#7c3aed' },
          { href: '/dashboard/conversations', icon: '💬', title: 'Conversaciones', desc: 'Ver todos los chats', color: '#0ea5e9' },
          { href: '/dashboard/knowledge', icon: '🧠', title: 'Knowledge Base', desc: 'Alimentar el bot', color: '#d946ef' },
          { href: '/dashboard/bot-config', icon: '⚙️', title: 'Configurar Bot', desc: 'Personalidad y horarios', color: '#f59e0b' },
        ].map(item => (
          <Link key={item.href} href={item.href} className="card card-hover" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>{item.icon}</div>
            <div style={{ fontWeight: 700, marginBottom: 4, color: item.color }}>{item.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.desc}</div>
          </Link>
        ))}
      </div>

      {/* Plan info */}
      <div className="card" style={{ maxWidth: 500 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 12 }}>📋 Tu plan</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge badge-purple" style={{ fontSize: 14, padding: '6px 14px' }}>{user?.plan?.toUpperCase()}</span>
            {user?.paid_until && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                Activo hasta: {new Date(user.paid_until).toLocaleDateString('es-CO')}
              </div>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'right' }}>
            ¿Renovar o mejorar?<br />
            <span style={{ color: 'var(--accent-light)' }}>Contacta al administrador</span>
          </div>
        </div>
      </div>
    </div>
  );
}
