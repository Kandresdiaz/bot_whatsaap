'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { BACKEND_URL } from '@/lib/config';

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

const PLAN_PRICES: Record<string, number> = { starter: 120000, pro: 249000, business: 490000 };

export default function AdminClientsPage() {
  const { setSelectedClientContext } = useAuth();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Modales
  const [payModalClient, setPayModalClient] = useState<Client | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Formulario Pago / Activacion
  const [payForm, setPayForm] = useState({
    durationType: 'preset',
    presetDays: 30,
    customDays: 30,
    months: 1,
    plan: 'starter',
    amount: 120000,
    method: 'nequi',
    note: ''
  });

  // Formulario Crear Cliente
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    plan: 'starter',
    businessName: '',
    category: 'General',
    durationDays: 30,
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const BACKEND = BACKEND_URL;

  const getHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wbot_token') || '' : '';
    const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin123';
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${BACKEND}/api/admin/clients`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setClients(data.clients || []);
      } else {
        setErrorMsg(data.error || 'Error al obtener clientes del servidor');
      }
    } catch (e: any) {
      console.error('Error cargando clientes:', e);
      setErrorMsg(`Error de conexión con el servidor backend: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const inspectClientDashboard = (client: Client) => {
    setSelectedClientContext(client.id, client.name);
    router.push('/dashboard');
  };

  const activateClient = async (client: Client) => {
    let daysToApply = payForm.presetDays;
    if (payForm.durationType === 'custom_days') {
      daysToApply = payForm.customDays;
    }

    const payload = {
      plan: payForm.plan,
      days: daysToApply,
      months: Math.ceil(daysToApply / 30),
      amount: payForm.amount,
      method: payForm.method,
      note: payForm.note,
    };

    setActionLoading(true);
    try {
      const resAct = await fetch(`${BACKEND}/api/admin/clients/${client.id}/activate`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      const dataAct = await resAct.json();
      if (!dataAct.success) {
        alert('Error al activar cliente: ' + (dataAct.error || 'Error desconocido'));
        setActionLoading(false);
        return;
      }

      await fetch(`${BACKEND}/api/admin/payments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ userId: client.id, ...payload }),
      });

      alert(`✅ Cliente "${client.name}" activado correctamente por ${daysToApply} días.`);
      setPayModalClient(null);
      await loadClients();
    } catch (err: any) {
      alert('Error de conexión al activar cliente: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const pauseClient = async (id: string) => {
    if (!confirm('¿Estás seguro de pausar la cuenta y el bot de este cliente?')) return;
    try {
      const res = await fetch(`${BACKEND}/api/admin/clients/${id}/pause`, { method: 'PATCH', headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        alert('Cliente pausado correctamente.');
        await loadClients();
      } else {
        alert('Error al pausar: ' + (data.error || 'Error desconocido'));
      }
    } catch (err: any) {
      alert('Error de conexión al pausar: ' + err.message);
    }
  };

  const resetClientSession = async (client: Client) => {
    if (!confirm(`¿Resetear la conexión de WhatsApp de ${client.name}? El cliente deberá escanear un nuevo QR.`)) return;
    try {
      const res = await fetch(`${BACKEND}/api/admin/clients/${client.id}/reset-session`, { method: 'POST', headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        alert('Sesión de WhatsApp desvinculada exitosamente.');
        await loadClients();
      } else {
        alert('Error al resetear sesión: ' + (data.error || 'Error desconocido'));
      }
    } catch (err: any) {
      alert('Error de conexión al resetear sesión: ' + err.message);
    }
  };

  const deleteClient = async (client: Client) => {
    if (!confirm(`⚠️ ¡ATENCIÓN! ¿Eliminar permanentemente a "${client.name}" y todos sus datos?`)) return;
    try {
      const res = await fetch(`${BACKEND}/api/admin/clients/${client.id}`, { method: 'DELETE', headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        alert('Cliente eliminado correctamente.');
        await loadClients();
      } else {
        alert('Error al eliminar cliente: ' + (data.error || 'Error desconocido'));
      }
    } catch (err: any) {
      alert('Error de conexión al eliminar cliente: ' + err.message);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientForm.name.trim() || !newClientForm.email.trim()) {
      alert('Nombre y Email son obligatorios');
      return;
    }

    try {
      const res = await fetch(`${BACKEND}/api/admin/clients`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...newClientForm,
          days: newClientForm.durationDays,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsCreateModalOpen(false);
        setNewClientForm({
          name: '',
          email: '',
          phone: '',
          plan: 'starter',
          businessName: '',
          category: 'General',
          durationDays: 30,
        });
        await loadClients();
      } else {
        alert('Error al crear cliente: ' + (data.error || 'Intenta de nuevo'));
      }
    } catch (err: any) {
      alert('Error de conexión: ' + err.message);
    }
  };

  const filteredClients = clients.filter(c => {
    const q = search.toLowerCase();
    const matchesSearch = c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.phone && c.phone.includes(q));
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
          <h1 className="page-title" style={{ margin: 0 }}>👥 Gestión de Clientes</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>Administra suscripciones, activa bots con duraciones flexibles y gestiona cuentas</p>
        </div>

        <button
          className="btn btn-primary btn-mobile-full"
          onClick={() => setIsCreateModalOpen(true)}
          style={{ fontSize: 13, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          ➕ Crear Nuevo Cliente
        </button>
      </div>

      {/* Buscador y Filtros */}
      <div className="card filter-bar-responsive" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          type="text"
          className="input"
          placeholder="🔍 Buscar cliente por nombre, email o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160, fontSize: 13 }}
        />

        <select
          className="input"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ flex: '1 1 140px', minWidth: 130, fontSize: 13 }}
        >
          <option value="all">Todos los Estados</option>
          <option value="active">🟢 Activos</option>
          <option value="paused">⏸ Pausados</option>
          <option value="trial">🆓 Trial</option>
        </select>
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
            onClick={loadClients}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            🔄 Reintentar
          </button>
        </div>
      )}

      {/* Tabla Clientes */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', background: '#0C1527', borderColor: '#1E293B' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando clientes...</div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#080E1F', color: '#94a3b8' }}>
                  <th style={{ padding: '12px 16px' }}>Cliente</th>
                  <th style={{ padding: '12px 16px' }}>Negocio</th>
                  <th style={{ padding: '12px 16px' }}>Plan</th>
                  <th style={{ padding: '12px 16px' }}>Estado</th>
                  <th style={{ padding: '12px 16px' }}>Bot WA</th>
                  <th style={{ padding: '12px 16px' }}>Vence el</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acciones Admin</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}</div>
                      {c.phone && <div style={{ fontSize: 11, color: '#00CFFF' }}>📞 {c.phone}</div>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.businesses?.[0]?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.businesses?.[0]?.category || ''}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge badge-purple" style={{ textTransform: 'uppercase', fontSize: 10 }}>{c.plan}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{statusBadge(c.status)}</td>
                    <td style={{ padding: '12px 16px' }}>{botStatus(c.whatsapp_sessions)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {c.paid_until ? new Date(c.paid_until).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '5px 10px', fontSize: 11, color: '#00CFFF', border: '1px solid rgba(0,207,255,0.3)' }}
                          onClick={() => inspectClientDashboard(c)}
                          title="Inspeccionar y controlar este bot en el Dashboard"
                        >
                          👁️ Ver Dashboard
                        </button>
                        <button
                          className="btn btn-success"
                          style={{ padding: '5px 10px', fontSize: 11 }}
                          onClick={() => {
                            setPayModalClient(c);
                            setPayForm(p => ({ ...p, plan: c.plan || 'starter', amount: PLAN_PRICES[c.plan] || 120000 }));
                          }}
                        >
                          💳 Activar / Pago
                        </button>
                        {c.status === 'active' ? (
                          <button
                            className="btn btn-danger"
                            style={{ padding: '5px 10px', fontSize: 11 }}
                            onClick={() => pauseClient(c.id)}
                            title="Pausar Bot"
                          >
                            ⏸ Pausar
                          </button>
                        ) : (
                          <button
                            className="btn btn-success"
                            style={{ padding: '5px 10px', fontSize: 11 }}
                            onClick={() => {
                              setPayModalClient(c);
                              setPayForm(p => ({ ...p, plan: c.plan || 'starter', amount: PLAN_PRICES[c.plan] || 120000 }));
                            }}
                          >
                            ▶️ Activar
                          </button>
                        )}
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '5px 8px', fontSize: 11 }}
                          onClick={() => resetClientSession(c)}
                          title="Resetear QR / Conexión de WhatsApp"
                        >
                          🔄 QR
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '5px 8px', fontSize: 11, color: '#f87171' }}
                          onClick={() => deleteClient(c)}
                          title="Eliminar Cliente"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredClients.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron clientes</div>
        )}
      </div>

      {/* Modal: Registrar Pago / Activar Bot con Duración Flexible */}
      {payModalClient && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5,10,24,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: '#0C1527', borderColor: '#00CFFF', padding: 20 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 4, color: '#f8fafc' }}>💳 Activar Bot / Registrar Pago</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Cliente: <strong>{payModalClient.name}</strong> ({payModalClient.email})</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Plan del Servicio</label>
                <select
                  className="input"
                  value={payForm.plan}
                  onChange={e => setPayForm(p => ({ ...p, plan: e.target.value, amount: PLAN_PRICES[e.target.value] || 120000 }))}
                >
                  <option value="starter">Básico - $120.000 COP / mes (Vender O Agendar + Captura de Datos)</option>
                  <option value="pro">Profesional - $250.000 COP / mes (Vender Y Agendar + Catálogo RAG + Lead Alert)</option>
                  <option value="business">Business / Agencia - $450.000 COP / mes (Multi-número + White-Label + Done-For-You)</option>
                </select>
              </div>

              {/* Selección de Duración Flexible */}
              <div>
                <label style={{ fontSize: 12, color: '#00CFFF', fontWeight: 700, marginBottom: 8, display: 'block' }}>
                  ⏳ Selección de Duración del Bot
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8, marginBottom: 10 }}>
                  {[
                    { days: 30, label: '30 días' },
                    { days: 90, label: '90 días' },
                    { days: 180, label: '180 días' },
                    { days: 365, label: '365 días' },
                  ].map(item => (
                    <button
                      key={item.days}
                      type="button"
                      onClick={() => setPayForm(p => ({ ...p, durationType: 'preset', presetDays: item.days }))}
                      style={{
                        padding: '8px 4px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: (payForm.durationType === 'preset' && payForm.presetDays === item.days) ? '#00CFFF' : 'rgba(255,255,255,0.06)',
                        color: (payForm.durationType === 'preset' && payForm.presetDays === item.days) ? '#080E1F' : '#94a3b8',
                      }}
                    >
                      ⚡ {item.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setPayForm(p => ({ ...p, durationType: 'custom_days' }))}
                    style={{
                      padding: '6px 12px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: payForm.durationType === 'custom_days' ? '#00CFFF' : 'rgba(255,255,255,0.06)',
                      color: payForm.durationType === 'custom_days' ? '#080E1F' : '#94a3b8', fontWeight: 600,
                    }}
                  >
                    ✏️ Días Personalizados
                  </button>
                  {payForm.durationType === 'custom_days' && (
                    <input
                      type="number"
                      className="input"
                      style={{ width: 120, height: 32, fontSize: 13 }}
                      min={1}
                      max={1000}
                      value={payForm.customDays}
                      onChange={e => setPayForm(p => ({ ...p, customDays: parseInt(e.target.value) || 1 }))}
                      placeholder="Días"
                    />
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Monto Recibido (COP)</label>
                  <input
                    className="input"
                    type="number"
                    value={payForm.amount}
                    onChange={e => setPayForm(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Método de Pago</label>
                  <select className="input" value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}>
                    <option value="nequi">Nequi</option>
                    <option value="transfer">Transferencia Bancaria</option>
                    <option value="cash">Efectivo</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Nota / Referencia</label>
                <input
                  className="input"
                  placeholder="Ej: Pago adelantado 90 días Nequi..."
                  value={payForm.note}
                  onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))}
                />
              </div>

              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#4ade80' }}>
                ✅ Activará el bot por <strong>{payForm.durationType === 'custom_days' ? payForm.customDays : payForm.presetDays} días</strong> con el plan <strong>{payForm.plan.toUpperCase()}</strong>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => activateClient(payModalClient)}>
                  ✅ Confirmar Pago y Activar Bot
                </button>
                <button className="btn btn-ghost" onClick={() => setPayModalClient(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear Nuevo Cliente */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5,10,24,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: '#0C1527', borderColor: '#00CFFF', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, margin: 0, color: '#f8fafc' }}>➕ Registrar Nuevo Cliente</h3>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleCreateClient} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Nombre Completo del Dueño / Cliente *</label>
                <input
                  type="text" className="input" placeholder="Ej. Carlos Pérez"
                  value={newClientForm.name} onChange={e => setNewClientForm({ ...newClientForm, name: e.target.value })} required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Email *</label>
                  <input
                    type="email" className="input" placeholder="cliente@negocio.com"
                    value={newClientForm.email} onChange={e => setNewClientForm({ ...newClientForm, email: e.target.value })} required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>WhatsApp / Teléfono</label>
                  <input
                    type="text" className="input" placeholder="573001234567"
                    value={newClientForm.phone} onChange={e => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Nombre del Negocio</label>
                  <input
                    type="text" className="input" placeholder="Ej. Odontología Sonrisas"
                    value={newClientForm.businessName} onChange={e => setNewClientForm({ ...newClientForm, businessName: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Categoría</label>
                  <input
                    type="text" className="input" placeholder="Ej. Salud / Servicios"
                    value={newClientForm.category} onChange={e => setNewClientForm({ ...newClientForm, category: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Plan</label>
                  <select className="input" value={newClientForm.plan} onChange={e => setNewClientForm({ ...newClientForm, plan: e.target.value })}>
                    <option value="starter">Básico ($120k - Vender O Agendar + Captura Datos)</option>
                    <option value="pro">Profesional ($250k - Vender Y Agendar + Catálogo RAG)</option>
                    <option value="business">Business / Agencia ($450k - Multi-línea + Done-For-You)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Duración Inicial (Días)</label>
                  <input
                    type="number" className="input" min={1} max={1000}
                    value={newClientForm.durationDays} onChange={e => setNewClientForm({ ...newClientForm, durationDays: parseInt(e.target.value) || 30 })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsCreateModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">🎉 Registrar Cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
