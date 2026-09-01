'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function DashboardHome() {
  const { user, effectiveUserId, selectedClientName } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [billingData, setBillingData] = useState<any>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

  useEffect(() => {
    if (!effectiveUserId) return;
    fetch(`${BACKEND}/api/sessions/status/${effectiveUserId}`)
      .then(r => r.json())
      .then(d => setSession(d.session))
      .catch(() => setSession(null));

    fetch(`${BACKEND}/api/billing/status/${effectiveUserId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setBillingData(d);
        }
      })
      .catch(() => setBillingData(null))
      .finally(() => setLoadingUsage(false));
  }, [effectiveUserId, BACKEND]);

  const isConnected = session?.status === 'connected';

  const titleName = selectedClientName
    ? selectedClientName
    : user?.name?.split(' ')[0] || 'Usuario';

  // Métricas de uso de mensajes
  const activePlanKey = billingData?.subscription?.plan || user?.plan || 'starter';
  const planLimitsMap: Record<string, number> = { starter: 1500, pro: 5000, business: 20000 };
  const messageLimit = billingData?.usage?.message_limit || planLimitsMap[activePlanKey] || 1500;
  const messagesUsed = billingData?.usage?.messages_used_this_month ?? 0;
  const percentageUsed = Math.min(100, Math.round((messagesUsed / messageLimit) * 100));
  const tokensUsed = billingData?.usage?.tokens_used_this_month ?? 0;
  const isApproaching = percentageUsed >= 80;
  const hasReached = messagesUsed >= messageLimit;

  // Color de barra según consumo
  const progressBarColor = hasReached
    ? 'linear-gradient(90deg, #ef4444, #dc2626)'
    : isApproaching
    ? 'linear-gradient(90deg, #f59e0b, #d97706)'
    : 'linear-gradient(90deg, #1A6BFF, #00CFFF)';

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

      {/* Widget de Consumo de Mensajes IA y Plan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Tarjeta de Consumo Mensual de Mensajes IA */}
        <div className="card" style={{ borderColor: hasReached ? 'rgba(239,68,68,0.4)' : isApproaching ? 'rgba(245,158,11,0.4)' : 'rgba(0,207,255,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>📊</span>
              <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Consumo de Mensajes IA este Mes</h3>
            </div>
            {hasReached ? (
              <span className="badge badge-red" style={{ fontSize: 11 }}>⚠️ Límite Alcanzado</span>
            ) : isApproaching ? (
              <span className="badge badge-yellow" style={{ fontSize: 11 }}>⚠️ 80%+ Usado</span>
            ) : (
              <span className="badge badge-green" style={{ fontSize: 11 }}>🟢 Capacidad Óptima</span>
            )}
          </div>

          {/* Barra de Progreso */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>
                <strong>{messagesUsed.toLocaleString('es-CO')}</strong> / {messageLimit.toLocaleString('es-CO')} mensajes
              </span>
              <span style={{ fontWeight: 700, color: hasReached ? '#ef4444' : isApproaching ? '#f59e0b' : '#00CFFF' }}>
                {percentageUsed}%
              </span>
            </div>
            <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(percentageUsed, 3)}%`,
                  height: '100%',
                  background: progressBarColor,
                  borderRadius: 99,
                  transition: 'width 0.6s ease-in-out',
                }}
              />
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
            💡 Tu cuota se reinicia el 1° de cada mes. Las preguntas frecuentes repetidas usan <strong>0 tokens</strong> gracias a la caché inteligente en RAM.
          </p>

          <div style={{ background: '#080E1F', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <div>
              <span style={{ color: '#94a3b8' }}>Tokens IA Usados: </span>
              <strong style={{ color: '#38bdf8' }}>{tokensUsed.toLocaleString('es-CO')}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Disponibles: </span>
              <strong style={{ color: '#4ade80' }}>{Math.max(0, messageLimit - messagesUsed).toLocaleString('es-CO')} msgs</strong>
            </div>
          </div>
        </div>

        {/* Tarjeta de Info del Plan y Límites */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>📋 Plan Activo</h3>
            {user?.is_admin ? (
              <Link href="/admin" style={{ color: '#00CFFF', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                ⚙️ Admin Panel
              </Link>
            ) : (
              <Link href="/pricing" style={{ color: '#00CFFF', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                🔄 Cambiar Plan
              </Link>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <span className="badge badge-purple" style={{ fontSize: 13, padding: '5px 12px' }}>
              {activePlanKey === 'starter' ? 'Plan Vendedor Automático ($120.000 COP / mes)' :
               activePlanKey === 'pro' ? 'Plan Máquina de Ventas Pro ($249.000 COP / mes)' :
               activePlanKey === 'business' ? 'Plan Dominio Agencia / VIP ($490.000 COP / mes)' :
               activePlanKey.toUpperCase()}
            </span>
            {user?.paid_until && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                Suscripción activa hasta: <strong>{new Date(user.paid_until).toLocaleDateString('es-CO')}</strong>
              </div>
            )}
          </div>

          {/* Desglose de cuotas y beneficios incluidos */}
          <div style={{ background: '#080E1F', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, fontSize: 12 }}>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>💬 Límite Mensual</div>
              <div style={{ fontWeight: 700, color: '#00CFFF', fontSize: 13 }}>
                {activePlanKey === 'starter' ? '1.500 msgs/mes' : activePlanKey === 'pro' ? '5.000 msgs/mes' : '20.000 msgs/mes'}
              </div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>🧠 Knowledge Base</div>
              <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: 13 }}>
                {activePlanKey === 'starter' ? 'Hasta 20 docs' : activePlanKey === 'pro' ? 'Hasta 100 docs' : 'Ilimitados'}
              </div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>⚡ Funciones</div>
              <div style={{ fontWeight: 700, color: '#4ade80', fontSize: 11 }}>
                {activePlanKey === 'starter' ? 'Catálogo RAG 24/7' : activePlanKey === 'pro' ? 'Fotos + Citas' : 'Multi-Línea VIP'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

