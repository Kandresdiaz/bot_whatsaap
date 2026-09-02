'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  status: string;
  paid_until: string;
  businesses?: { name: string; category: string }[];
  whatsapp_sessions?: { status: string; phone_number: string }[];
};

type Payment = {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  method: string;
  paid_at: string;
  users?: { name: string };
};

type Stats = { totalClients: number; activeClients: number; activeBots: number; totalRevenueCOP: number };

export default function AdminDashboardPage() {
  const { setSelectedClientContext } = useAuth();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://bot-whatsaap-tkjd.onrender.com';
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-key': process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin123'
  };

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [cRes, sRes, pRes] = await Promise.all([
        fetch(`${BACKEND}/api/admin/clients`, { headers }),
        fetch(`${BACKEND}/api/admin/stats`, { headers }),
        fetch(`${BACKEND}/api/admin/payments`, { headers }),
      ]);
      const cData = await cRes.json();
      const sData = await sRes.json();
      const pData = await pRes.json();

      if (cData.success) setClients(cData.clients || []);
      else setErrorMsg(cData.error || 'Error al cargar clientes');

      if (sData.success) setStats(sData.stats || null);
      if (pData.success) setPayments(pData.payments || []);
    } catch (e: any) {
      console.error('Error cargando datos admin:', e);
      setErrorMsg(`Error de conexión con el servidor backend: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const inspectClientDashboard = (client: Client) => {
    setSelectedClientContext(client.id, client.name);
    router.push('/dashboard');
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: 'badge-green', paused: 'badge-red', trial: 'badge-yellow', cancelled: 'badge-red' };
    const labels: Record<string, string> = { active: '✅ Activo', paused: '⏸ Pausado', trial: '🆓 Trial', cancelled: '❌ Cancelado' };
    return <span className={`badge ${map[s] || 'badge-purple'}`}>{labels[s] || s}</span>;
  };

  const botStatus = (sessions?: { status: string }[]) => {
    const s = sessions?.[0]?.status;
    if (s === 'connected') return <span className="badge badge-green">🟢 Conectado</span>;
    return <span className="badge badge-red">🔴 Off</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>📊 Dashboard Administrador</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>Resumen general de métricas, bots activos y acceso rápido</p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/admin/clients" className="btn btn-primary" style={{ fontSize: 13, textDecoration: 'none' }}>
            👥 Gestionar Clientes
          </Link>
          <Link href="/dashboard" className="btn btn-ghost" style={{ fontSize: 13, textDecoration: 'none', border: '1px solid rgba(0,207,255,0.3)', color: '#00CFFF' }}>
            🤖 Vista Dashboard Bot
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 12,
          padding: '12px 18px',
          color: '#f87171',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
          <button
            className="btn btn-primary"
            onClick={loadAll}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            🔄 Reintentar
          </button>
        </div>
      )}

      {/* Metric Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total Clientes Registrados</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-light)' }}>{stats.totalClients}</div>
          </div>
          <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(34,197,94,0.3)', padding: 16 }}>
            <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 4 }}>Clientes Activos</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#4ade80' }}>{stats.activeClients}</div>
          </div>
          <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(0,207,255,0.3)', padding: 16 }}>
            <div style={{ fontSize: 12, color: '#00CFFF', marginBottom: 4 }}>Bots Conectados</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#00CFFF' }}>{stats.activeBots}</div>
          </div>
          <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(34,197,94,0.3)', padding: 16 }}>
            <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 4 }}>Ingresos Totales COP</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#4ade80' }}>
              ${Number(stats.totalRevenueCOP || 0).toLocaleString('es-CO')}
            </div>
          </div>
        </div>
      )}

      {/* Acceso Rápido Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <Link href="/admin/clients" className="card card-hover" style={{ background: '#0C1527', borderColor: '#1E293B', textDecoration: 'none', padding: 18 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0', color: '#f8fafc' }}>Gestión de Clientes</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Crear clientes, renovaciones en días/meses, pausar o desvincular QR.</p>
        </Link>

        <Link href="/admin/payments" className="card card-hover" style={{ background: '#0C1527', borderColor: '#1E293B', textDecoration: 'none', padding: 18 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0', color: '#4ade80' }}>Historial de Pagos</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Registro contable de recaudos Nequi, transferencias y efectivo.</p>
        </Link>

        <Link href="/dashboard" className="card card-hover" style={{ background: '#0C1527', borderColor: 'rgba(0,207,255,0.3)', textDecoration: 'none', padding: 18 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0', color: '#00CFFF' }}>Dashboard Multicliente</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Controlar y ver chats/QR de cualquier cliente con el selector.</p>
        </Link>
      </div>

      {/* Resumen de Clientes Recientes */}
      <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>👥 Clientes Recientes</h3>
          <Link href="/admin/clients" style={{ fontSize: 12, color: '#00CFFF', fontWeight: 600, textDecoration: 'none' }}>
            Ver todos ({clients.length}) →
          </Link>
        </div>

        <div className="table-responsive">
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#080E1F', color: '#94a3b8' }}>
                <th style={{ padding: '10px 14px' }}>Cliente</th>
                <th style={{ padding: '10px 14px' }}>Negocio</th>
                <th style={{ padding: '10px 14px' }}>Plan</th>
                <th style={{ padding: '10px 14px' }}>Estado</th>
                <th style={{ padding: '10px 14px' }}>Bot</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {clients.slice(0, 5).map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#f8fafc' }}>{c.name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{c.businesses?.[0]?.name || '—'}</td>
                  <td style={{ padding: '10px 14px' }}><span className="badge badge-purple" style={{ fontSize: 10 }}>{c.plan}</span></td>
                  <td style={{ padding: '10px 14px' }}>{statusBadge(c.status)}</td>
                  <td style={{ padding: '10px 14px' }}>{botStatus(c.whatsapp_sessions)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '3px 8px', color: '#00CFFF' }}
                      onClick={() => inspectClientDashboard(c)}
                    >
                      👁️ Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
