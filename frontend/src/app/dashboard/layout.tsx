'use client';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type ClientItem = {
  id: string;
  name: string;
  email: string;
  businesses?: { name: string }[];
};

const navItems = [
  { href: '/dashboard', icon: '🏠', label: 'Inicio' },
  { href: '/dashboard/connect', icon: '📱', label: 'Conectar WhatsApp' },
  { href: '/dashboard/conversations', icon: '💬', label: 'Conversaciones' },
  { href: '/dashboard/products', icon: '📦', label: 'Productos y Servicios' },
  { href: '/dashboard/appointments', icon: '📅', label: 'Calendario y Citas' },
  { href: '/dashboard/knowledge', icon: '🧠', label: 'Knowledge Base' },
  { href: '/dashboard/bot-config', icon: '⚙️', label: 'Configurar Bot' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, selectedClientId, selectedClientName, setSelectedClientContext, effectiveUserId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [globalBotEnabled, setGlobalBotEnabled] = useState<boolean>(false);
  const [togglingGlobal, setTogglingGlobal] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const [clientsList, setClientsList] = useState<ClientItem[]>([]);
  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';
  const headers = { 'Content-Type': 'application/json', 'x-admin-key': process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin123' };

  // Cerrar menú móvil al navegar
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Redirigir a login si no hay usuario autenticado
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Cargar lista de clientes si es Admin
  useEffect(() => {
    if (!user?.is_admin) return;
    fetch(`${BACKEND}/api/admin/clients`, { headers })
      .then(r => r.json())
      .then(d => {
        if (d.clients && Array.isArray(d.clients)) {
          setClientsList(d.clients);
        }
      })
      .catch(() => {});
  }, [user?.is_admin]);

  // Cargar estado de bot global para el usuario efectivo
  useEffect(() => {
    if (!effectiveUserId) return;
    fetch(`${BACKEND}/api/sessions/global-bot/${effectiveUserId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && typeof d.bot_enabled === 'boolean') {
          setGlobalBotEnabled(d.bot_enabled);
        } else {
          setGlobalBotEnabled(false);
        }
      })
      .catch(() => setGlobalBotEnabled(false));
  }, [effectiveUserId]);

  const [subInfo, setSubInfo] = useState<any>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelingSub, setCancelingSub] = useState(false);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);

  // Cargar estado de suscripción de Mercado Pago
  useEffect(() => {
    if (!effectiveUserId || effectiveUserId === 'admin') return;
    fetch(`${BACKEND}/api/billing/status/${effectiveUserId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setSubInfo(d.subscription);
      })
      .catch(() => {});
  }, [effectiveUserId]);

  const handleCancelSubscription = async () => {
    if (!effectiveUserId) return;
    setCancelingSub(true);
    try {
      const res = await fetch(`${BACKEND}/api/billing/cancel-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUserId }),
      });
      const data = await res.json();
      if (data.success) {
        setCancelSuccessMsg('✅ Tu suscripción fue cancelada con éxito. No se realizará ningún cobro a tu tarjeta.');
        setSubInfo((prev: any) => prev ? { ...prev, status: 'canceled', is_trial_active: false } : null);
        setTimeout(() => {
          setIsCancelModalOpen(false);
          setCancelSuccessMsg(null);
        }, 2500);
      } else {
        alert(data.error || 'Error al cancelar la suscripción');
      }
    } catch (err: any) {
      alert('Error al conectar con el servidor: ' + err.message);
    } finally {
      setCancelingSub(false);
    }
  };

  const toggleGlobalBot = async () => {
    if (!effectiveUserId || togglingGlobal) return;
    const nextVal = !globalBotEnabled;
    setTogglingGlobal(true);
    setGlobalBotEnabled(nextVal);
    try {
      await fetch(`${BACKEND}/api/sessions/global-bot/${effectiveUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_enabled: nextVal }),
      });
    } catch (e) {
      console.error('Error al cambiar bot global:', e);
      setGlobalBotEnabled(!nextVal);
    } finally {
      setTogglingGlobal(false);
    }
  };

  if (loading || !user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  );

  return (
    <div>
      {/* Mobile Header Topbar */}
      <div className="mobile-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg className="logo-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logoGradMob" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1A6BFF"/>
                <stop offset="100%" stopColor="#00CFFF"/>
              </linearGradient>
            </defs>
            <path d="M4 8C4 5.8 5.8 4 8 4H32C34.2 4 36 5.8 36 8V26C36 28.2 34.2 30 32 30H22L14 37V30H8C5.8 30 4 28.2 4 26V8Z" fill="url(#logoGradMob)" opacity="0.15" stroke="url(#logoGradMob)" strokeWidth="1.5"/>
            <path d="M22 9L15 21H21L18 31L27 17H21L22 9Z" fill="url(#logoGradMob)"/>
          </svg>
          <span style={{ fontWeight: 800, fontSize: 18, color: '#f8fafc' }}>BotWA</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge" style={{ background: globalBotEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: globalBotEnabled ? '#4ade80' : '#f87171', fontSize: 11 }}>
            {globalBotEnabled ? '🤖 ON' : '⏸️ OFF'}
          </span>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            style={{ background: 'none', border: 'none', color: '#00CFFF', fontSize: 24, cursor: 'pointer', padding: '4px 8px' }}
            aria-label="Menú"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          {/* Logo: chat bubble + rayo, gradiente azul/cyan */}
          <svg className="logo-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1A6BFF"/>
                <stop offset="100%" stopColor="#00CFFF"/>
              </linearGradient>
            </defs>
            <path d="M4 8C4 5.8 5.8 4 8 4H32C34.2 4 36 5.8 36 8V26C36 28.2 34.2 30 32 30H22L14 37V30H8C5.8 30 4 28.2 4 26V8Z" fill="url(#logoGrad)" opacity="0.15" stroke="url(#logoGrad)" strokeWidth="1.5"/>
            <path d="M22 9L15 21H21L18 31L27 17H21L22 9Z" fill="url(#logoGrad)"/>
          </svg>
          BotWA
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname === item.href ? 'active' : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Global Bot Toggle Widget */}
        <div style={{
          margin: '12px 12px 0 12px',
          padding: '12px',
          borderRadius: 12,
          background: globalBotEnabled ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${globalBotEnabled ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          transition: 'all 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{globalBotEnabled ? '🤖' : '⏸️'}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: globalBotEnabled ? '#4ade80' : '#f87171' }}>
                  {globalBotEnabled ? 'Bot Global ON' : 'Bot PAUSADO'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {globalBotEnabled ? 'Responde 24/7' : 'IA congelada'}
                </div>
              </div>
            </div>
            <label className="toggle" style={{ transform: 'scale(0.85)' }}>
              <input type="checkbox" checked={globalBotEnabled} onChange={toggleGlobalBot} disabled={togglingGlobal} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '10px 14px', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span className="badge badge-blue">{user.plan}</span>
              {user.is_admin && <span className="badge badge-purple">🛡️ Admin</span>}
            </div>
          </div>
          {user.is_admin && (
            <Link href="/admin" className="nav-link" style={{ color: '#22d3ee', marginBottom: 8 }}>
              <span>🛡️</span> Panel Admin
            </Link>
          )}
          <button className="nav-link" onClick={logout} style={{ color: '#ef4444' }}>
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Admin Selector Bar */}
        {user.is_admin && (
          <div style={{
            background: 'linear-gradient(90deg, #0f1b2f 0%, #1e1b4b 100%)',
            borderBottom: '1px solid rgba(0,207,255,0.3)',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>👑</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#00CFFF' }}>
                MODO ADMINISTRADOR:
              </span>
              <span style={{ fontSize: 13, color: '#f8fafc' }}>
                {selectedClientId === 'all'
                  ? '🌐 Viendo Todos los Clientes'
                  : selectedClientId
                  ? `👤 Viendo a: ${selectedClientName || selectedClientId}`
                  : '👑 Viendo: Mi Cuenta Admin'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 12, color: '#94a3b8' }}>Cambiar Vista:</label>
              <select
                className="input"
                style={{ height: 32, fontSize: 12, padding: '0 8px', background: '#080E1F', color: '#00CFFF', borderColor: 'rgba(0,207,255,0.4)', width: 'auto' }}
                value={selectedClientId || 'admin'}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'admin') {
                    setSelectedClientContext(null);
                  } else if (val === 'all') {
                    setSelectedClientContext('all', 'Todos los Clientes');
                  } else {
                    const c = clientsList.find(item => item.id === val);
                    setSelectedClientContext(val, c ? (c.businesses?.[0]?.name || c.name) : val);
                  }
                }}
              >
                <option value="admin">👑 Mi Cuenta Admin</option>
                <option value="all">🌐 Ver Todo (Todos los Clientes)</option>
                {clientsList.map(c => (
                  <option key={c.id} value={c.id}>
                    👤 {c.name} ({c.businesses?.[0]?.name || c.email})
                  </option>
                ))}
              </select>

              <Link href="/admin" className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>
                🛡️ Volver a Admin
              </Link>
            </div>
          </div>
        )}

        {/* Trial Active Banner */}
        {subInfo?.is_trial_active && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(26,107,255,0.25) 0%, rgba(0,207,255,0.18) 100%)',
            borderBottom: '1px solid rgba(0,207,255,0.4)',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 13,
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <span>
                <strong>Prueba Gratuita de 7 Días Activa:</strong> Te quedan <strong>{subInfo.days_left_in_trial} días</strong> de tu plan <strong>{subInfo.plan_name}</strong>.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Link href="/pricing" style={{ color: '#00CFFF', fontWeight: 700, textDecoration: 'none', fontSize: 12 }}>
                Ver Beneficios y Planes →
              </Link>
              <button
                onClick={() => setIsCancelModalOpen(true)}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                🛑 Cancelar Suscripción
              </button>
            </div>
          </div>
        )}

        {/* Modal de Confirmación de Cancelación */}
        {isCancelModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(4, 9, 24, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}>
            <div style={{
              background: '#0B132B',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: 20,
              padding: '30px 24px',
              maxWidth: 480,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🛑</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
                ¿Deseas cancelar tu suscripción?
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
                Al cancelar, <strong>la renovación automática en Mercado Pago se anulará inmediatamente</strong> y no se realizará ningún cobro a tu tarjeta. Tu bot continuará respondiendo hasta el final de tu período actual.
              </p>

              {cancelSuccessMsg ? (
                <div style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  color: '#4ade80',
                  padding: '12px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 16
                }}>
                  {cancelSuccessMsg}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button
                    onClick={() => setIsCancelModalOpen(false)}
                    className="btn btn-ghost"
                    style={{ flex: 1, padding: '10px' }}
                    disabled={cancelingSub}
                  >
                    Mantener mi Bot
                  </button>
                  <button
                    onClick={handleCancelSubscription}
                    className="btn btn-danger"
                    style={{ flex: 1, padding: '10px' }}
                    disabled={cancelingSub}
                  >
                    {cancelingSub ? 'Cancelando...' : 'Confirmar Cancelación'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Expired / Past Due Warning Banner */}
        {(subInfo?.status === 'past_due' || (user?.status === 'paused' && !user?.is_admin)) && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.2)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 13,
            color: '#fca5a5',
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span>
                <strong>Tu prueba o suscripción ha finalizado.</strong> El bot está pausado hasta actualizar tu método de pago.
              </span>
            </div>
            <Link href="/pricing" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12, textDecoration: 'none' }}>
              Reactivar Servicio Ahora →
            </Link>
          </div>
        )}

        <div style={{ flex: 1 }}>{children}</div>
      </main>
    </div>
  );
}
