'use client';
import { useEffect, useState } from 'react';

type Client = {
  id: string; name: string; email: string; phone: string;
  plan: string; status: string; paid_until: string;
  businesses?: { name: string; category: string }[];
  whatsapp_sessions?: { status: string; phone_number: string }[];
};

type Stats = { totalClients: number; activeClients: number; activeBots: number; totalRevenueCOP: number };

const PLAN_PRICES: Record<string, number> = { starter: 75000, pro: 160000, business: 320000 };

export default function AdminPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeTab, setActiveTab] = useState<'clients' | 'payments'>('clients');
  const [modal, setModal] = useState<{ type: string; client?: Client } | null>(null);
  const [payForm, setPayForm] = useState({ months: 1, plan: 'starter', amount: 75000, method: 'nequi', note: '' });
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;
  const ADMIN_KEY = typeof window !== 'undefined' ? localStorage.getItem('wbot_token') || '' : '';

  const headers = { 'Content-Type': 'application/json', 'x-admin-key': process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin123' };

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const [cRes, sRes] = await Promise.all([
      fetch(`${BACKEND}/api/admin/clients`, { headers }),
      fetch(`${BACKEND}/api/admin/stats`, { headers }),
    ]);
    const cData = await cRes.json();
    const sData = await sRes.json();
    setClients(cData.clients || []);
    setStats(sData.stats || null);
  };

  const activate = async (client: Client) => {
    await fetch(`${BACKEND}/api/admin/clients/${client.id}/activate`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ plan: payForm.plan, months: payForm.months }),
    });
    await fetch(`${BACKEND}/api/admin/payments`, {
      method: 'POST', headers,
      body: JSON.stringify({ userId: client.id, ...payForm }),
    });
    setModal(null);
    await loadAll();
  };

  const pause = async (id: string) => {
    await fetch(`${BACKEND}/api/admin/clients/${id}/pause`, { method: 'PATCH', headers });
    await loadAll();
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
    <div>
      <div className="page-header">
        <h1 className="page-title">🛡️ Panel Admin</h1>
        <p className="page-subtitle">Gestión de clientes, pagos y bots activos</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 28 }}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--accent-light)' }}>{stats.totalClients}</div>
            <div className="stat-label">Total clientes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.activeClients}</div>
            <div className="stat-label">Activos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#22d3ee' }}>{stats.activeBots}</div>
            <div className="stat-label">Bots en línea</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--green)' }}>
              ${(stats.totalRevenueCOP / 1000).toFixed(0)}k
            </div>
            <div className="stat-label">Ingresos COP (total)</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button className={`btn ${activeTab === 'clients' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('clients')}>
          👥 Clientes ({clients.length})
        </button>
        <button className={`btn ${activeTab === 'payments' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('payments')}>
          💳 Registrar pago
        </button>
      </div>

      {/* Tabla clientes */}
      {activeTab === 'clients' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Negocio</th>
                <th>Plan</th>
                <th>Estado</th>
                <th>Bot</th>
                <th>Vence</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.email}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{c.businesses?.[0]?.name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.businesses?.[0]?.category || ''}</div>
                  </td>
                  <td><span className="badge badge-purple">{c.plan}</span></td>
                  <td>{statusBadge(c.status)}</td>
                  <td>{botStatus(c.whatsapp_sessions)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {c.paid_until ? new Date(c.paid_until).toLocaleDateString('es-CO') : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-success" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { setModal({ type: 'pay', client: c }); setPayForm(p => ({ ...p, plan: c.plan })); }}>
                        💳 Pago
                      </button>
                      {c.status === 'active' && (
                        <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => pause(c.id)}>
                          ⏸
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin clientes registrados</div>
          )}
        </div>
      )}

      {/* Modal pago */}
      {modal?.type === 'pay' && modal.client && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 480 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 4 }}>💳 Registrar pago</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Cliente: <strong>{modal.client.name}</strong></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Plan</label>
                  <select className="input" value={payForm.plan} onChange={e => setPayForm(p => ({ ...p, plan: e.target.value, amount: PLAN_PRICES[e.target.value] || 0 }))}>
                    <option value="starter">Starter - $75.000</option>
                    <option value="pro">Pro - $160.000</option>
                    <option value="business">Business - $320.000</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Meses</label>
                  <input className="input" type="number" min={1} max={12} value={payForm.months} onChange={e => setPayForm(p => ({ ...p, months: parseInt(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Monto recibido (COP)</label>
                <input className="input" type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: parseInt(e.target.value) }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Método</label>
                <select className="input" value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}>
                  <option value="nequi">Nequi</option>
                  <option value="transfer">Transferencia</option>
                  <option value="cash">Efectivo</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Nota (opcional)</label>
                <input className="input" placeholder="Ej: Pago mes julio 2026" value={payForm.note} onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))} />
              </div>
              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                ✅ Activará el bot por <strong>{payForm.months} mes(es)</strong> con plan <strong>{payForm.plan}</strong>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => activate(modal.client!)}>
                  ✅ Confirmar pago y activar
                </button>
                <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
