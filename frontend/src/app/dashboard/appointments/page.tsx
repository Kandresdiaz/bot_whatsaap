'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

type Appointment = {
  id: string;
  client_name: string;
  client_phone: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes: string;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'badge-yellow',
  confirmed: 'badge-green',
  cancelled: 'badge-red',
  completed: 'badge-purple',
};
const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Pendiente',
  confirmed: '✅ Confirmada',
  cancelled: '❌ Cancelada',
  completed: '🎉 Completada',
};

export default function AppointmentsPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;

  useEffect(() => {
    if (!user) return;
    fetch(`${BACKEND}/api/business/${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.business?.id) {
          setBusinessId(d.business.id);
          loadAppointments(d.business.id);
        } else {
          setLoading(false);
        }
      });
  }, [user, BACKEND]);

  const loadAppointments = async (bId: string) => {
    setLoading(true);
    const url = filter !== 'all'
      ? `${BACKEND}/api/appointments/${bId}?status=${filter}`
      : `${BACKEND}/api/appointments/${bId}`;
    const res = await fetch(url);
    const data = await res.json();
    setAppointments(data.appointments || []);
    setLoading(false);
  };

  useEffect(() => {
    if (businessId) loadAppointments(businessId);
  }, [filter, businessId]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`${BACKEND}/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: status as Appointment['status'] } : a));
  };

  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const formatTime = (t: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  const today = appointments.filter(a => a.appointment_date === new Date().toISOString().split('T')[0]);
  const pending = appointments.filter(a => a.status === 'pending').length;
  const confirmed = appointments.filter(a => a.status === 'confirmed').length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📅 Citas agendadas por el bot</h1>
        <p className="page-subtitle">El bot agenda automáticamente cuando los clientes lo solicitan por WhatsApp</p>
      </div>

      {/* Stats rápidas */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-light)' }}>{appointments.length}</div>
          <div className="stat-label">Total citas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--yellow)' }}>{pending}</div>
          <div className="stat-label">Pendientes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{confirmed}</div>
          <div className="stat-label">Confirmadas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#22d3ee' }}>{today.length}</div>
          <div className="stat-label">Citas hoy</div>
        </div>
      </div>

      {/* Citas de hoy destacadas */}
      {today.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.03)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 14, color: 'var(--green)' }}>🗓️ Citas de hoy ({today.length})</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {today.map(a => (
              <div key={a.id} style={{ background: 'var(--bg-card2)', borderRadius: 12, padding: '14px 16px', minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{a.client_name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0' }}>📋 {a.service}</div>
                <div style={{ fontSize: 13, color: 'var(--accent-light)', fontWeight: 600 }}>🕐 {formatTime(a.appointment_time)}</div>
                <div style={{ marginTop: 8 }}>
                  <span className={`badge ${STATUS_COLORS[a.status]}`} style={{ fontSize: 11 }}>{STATUS_LABELS[a.status]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { value: 'all', label: '📋 Todas' },
          { value: 'pending', label: '⏳ Pendientes' },
          { value: 'confirmed', label: '✅ Confirmadas' },
          { value: 'completed', label: '🎉 Completadas' },
          { value: 'cancelled', label: '❌ Canceladas' },
        ].map(f => (
          <button
            key={f.value}
            className={`btn ${filter === f.value ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px' }}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
          </div>
        ) : appointments.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
            <p>No hay citas aún. El bot las agendará automáticamente cuando los clientes lo soliciten.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map(a => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{a.client_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{a.client_phone}</div>
                  </td>
                  <td style={{ fontSize: 14 }}>{a.service || '—'}</td>
                  <td style={{ fontSize: 14 }}>{formatDate(a.appointment_date)}</td>
                  <td style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-light)' }}>{formatTime(a.appointment_time)}</td>
                  <td><span className={`badge ${STATUS_COLORS[a.status]}`}>{STATUS_LABELS[a.status]}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {a.status === 'pending' && (
                        <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => updateStatus(a.id, 'confirmed')}>✅</button>
                      )}
                      {a.status === 'confirmed' && (
                        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => updateStatus(a.id, 'completed')}>🎉 Completar</button>
                      )}
                      {(a.status === 'pending' || a.status === 'confirmed') && (
                        <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => updateStatus(a.id, 'cancelled')}>❌</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
