'use client';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

const navItems = [
  { href: '/admin', icon: '📊', label: 'Dashboard Admin' },
  { href: '/admin/clients', icon: '👥', label: 'Clientes' },
  { href: '/admin/payments', icon: '💳', label: 'Historial de Pagos' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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
      <aside className="sidebar">
        <div className="sidebar-logo">🛡️ Admin BotWA</div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`nav-link ${pathname === item.href ? 'active' : ''}`}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)' }}>
          <Link href="/dashboard" className="nav-link" style={{ color: '#00CFFF', marginBottom: 8 }}>
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
