'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function DashboardHome() {
  const { user, effectiveUserId, selectedClientName } = useAuth();
  const [session, setSession] = useState<any>(null);
  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

  useEffect(() => {
    if (!effectiveUserId) return;
    fetch(`${BACKEND}/api/sessions/status/${effectiveUserId}`)
      .then(r => r.json())
      .then(d => setSession(d.session))
      .catch(() => setSession(null));
  }, [effectiveUserId, BACKEND]);

  const isConnected = session?.status === 'connected';

  const titleName = selectedClientName
    ? selectedClientName
    : user?.name?.split(' ')[0] || 'Usuario';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">👋 Hola, {titleName}</h1>
        <p className="page-subtitle">
          {selectedClientName
            ? `Panel de control para ${selectedClientName}`
            : 'Panel de control de tu bot de WhatsApp'}
        </p>
      </div>

      {/* Status del bot */}
      <div className="card" style={{ marginBottom: 24, borderColor: isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)', background: isConnected ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.03)' }}>
        <div className="action-buttons-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
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
          <Link href={isConnected ? '/dashboard/conversations' : '/dashboard/connect'} className="btn btn-primary btn-mobile-full">
            {isConnected ? '💬 Ver conversaciones' : '📱 Conectar ahora'}
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { href: '/dashboard/connect', icon: '📱', title: 'Conectar WhatsApp', desc: 'Escanea el QR', color: '#00CFFF' },
          { href: '/dashboard/conversations', icon: '💬', title: 'Conversaciones', desc: 'Ver todos los chats', color: '#0ea5e9' },
          { href: '/dashboard/products', icon: '📦', title: 'Productos y Servicios', desc: 'Gestión de catálogo', color: '#38bdf8' },
          { href: '/dashboard/knowledge', icon: '🧠', title: 'Knowledge Base', desc: 'Alimentar el bot', color: '#818cf8' },
          { href: '/dashboard/bot-config', icon: '⚙️', title: 'Configurar Bot', desc: 'Personalidad y horarios', color: '#f59e0b' },
        ].map(item => (
          <Link key={item.href} href={item.href} className="card card-hover" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 14 }}>
            <div>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: item.color, wordBreak: 'break-word' }}>{item.title}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.desc}</div>
          </Link>
        ))}
      </div>

      {/* Plan info */}
      <div className="card" style={{ maxWidth: 600 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 12 }}>📋 Info del Plan y Cuotas</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span className="badge badge-purple" style={{ fontSize: 13, padding: '5px 12px' }}>
                {user?.plan === 'starter' ? 'Plan Básico ($120.000 COP / mes)' :
                 user?.plan === 'pro' ? 'Plan Profesional ($250.000 COP / mes)' :
                 user?.plan === 'business' ? 'Plan Business / Agencia ($450.000 COP / mes)' :
                 user?.plan?.toUpperCase() || 'PLAN BÁSICO'}
              </span>
              {user?.paid_until && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Activo hasta: <strong>{new Date(user.paid_until).toLocaleDateString('es-CO')}</strong>
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>
              ¿Modificar plan o vigencia?<br />
              {user?.is_admin ? (
                <Link href="/admin" style={{ color: '#00CFFF', fontWeight: 600 }}>Gestionar desde Admin</Link>
              ) : (
                <span style={{ color: 'var(--accent-light)' }}>Contacta al administrador</span>
              )}
            </div>
          </div>

          {/* Desglose de límites por plan */}
          <div style={{ background: '#080E1F', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, fontSize: 12 }}>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>💬 Mensajes IA Incluidos</div>
              <div style={{ fontWeight: 700, color: '#00CFFF', fontSize: 14 }}>
                {user?.plan === 'starter' ? '1.000 / mes' : user?.plan === 'pro' ? '5.000 / mes' : '15.000 / mes'}
              </div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>🧠 Docs Knowledge Base</div>
              <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: 14 }}>
                {user?.plan === 'starter' ? 'Hasta 20 docs' : user?.plan === 'pro' ? 'Hasta 100 docs' : 'Ilimitados'}
              </div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>⚡ Funcionalidades Activas</div>
              <div style={{ fontWeight: 700, color: '#4ade80', fontSize: 12 }}>
                {user?.plan === 'starter' ? 'Vender O Agendar' : user?.plan === 'pro' ? 'Vender + Agendar + RAG' : 'White-Label VIP'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
