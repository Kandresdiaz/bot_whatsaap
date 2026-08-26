'use client';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

import { useState } from 'react';

const navItems = [
  { href: '/admin', icon: '📊', label: 'Dashboard Admin' },
  { href: '/admin/clients', icon: '👥', label: 'Clientes' },
  { href: '/admin/payments', icon: '💳', label: 'Historial de Pagos' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && (!user || !user.is_admin)) router.push('/login');
  }, [user, loading, router]);

  if (loading || !user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  );

  return (
    <div>
      {/* Mobile Topbar */}
      <div className="mobile-topbar">
        <div style={{ fontWeight: 800, fontSize: 16, color: '#00CFFF' }}>🛡️ Admin BotWA</div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={{ background: 'none', border: 'none', color: '#00CFFF', fontSize: 24, cursor: 'pointer', padding: '4px 8px' }}
        >
          {isMobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">🛡️ Admin BotWA</div>
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
        <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)' }}>
          <Link href="/dashboard" className="nav-link" style={{ color: '#00CFFF', marginBottom: 8 }} onClick={() => setIsMobileMenuOpen(false)}>
            <span>🤖</span> Vista Dashboard Bot
          </Link>
          <button className="nav-link" onClick={logout} style={{ color: '#ef4444' }}>
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
