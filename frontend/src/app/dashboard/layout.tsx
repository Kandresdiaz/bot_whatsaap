'use client';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

const navItems = [
  { href: '/dashboard', icon: '🏠', label: 'Inicio' },
  { href: '/dashboard/connect', icon: '📱', label: 'Conectar WhatsApp' },
  { href: '/dashboard/conversations', icon: '💬', label: 'Conversaciones' },
  { href: '/dashboard/appointments', icon: '📅', label: 'Citas' },
  { href: '/dashboard/knowledge', icon: '🧠', label: 'Knowledge Base' },
  { href: '/dashboard/bot-config', icon: '⚙️', label: 'Configurar Bot' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading || !user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  );

  return (
    <div>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          {/* Logo: chat bubble + rayo, gradiente azul/cyan */}
          <svg className="logo-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1A6BFF"/>
                <stop offset="100%" stopColor="#00CFFF"/>
              </linearGradient>
            </defs>
            {/* Burbuja de chat */}
            <path d="M4 8C4 5.8 5.8 4 8 4H32C34.2 4 36 5.8 36 8V26C36 28.2 34.2 30 32 30H22L14 37V30H8C5.8 30 4 28.2 4 26V8Z" fill="url(#logoGrad)" opacity="0.15" stroke="url(#logoGrad)" strokeWidth="1.5"/>
            {/* Rayo/IA */}
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
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '10px 14px', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</div>
            <div style={{ marginTop: 6 }}>
              <span className="badge badge-blue">{user.plan}</span>
            </div>
          </div>
          {user.is_admin && (
            <Link href="/admin" className="nav-link" style={{ color: '#22d3ee', marginBottom: 8 }}>
              <span>🛡️</span> Volver a Admin
            </Link>
          )}
          <button className="nav-link" onClick={logout} style={{ color: '#ef4444' }}>
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="main">{children}</main>
    </div>
  );
}
