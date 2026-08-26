'use client';
import { useEffect, useState } from 'react';

type Payment = {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  paid_at: string;
  note?: string;
  users?: { name: string; email: string };
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-key': process.env.NEXT_PUBLIC_ADMIN_KEY || 'admin123'
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/payments`, { headers });
      const data = await res.json();
      setPayments(data.payments || []);
    } catch (e) {
      console.error('Error cargando pagos:', e);
    } finally {
      setLoading(false);
    }
  };

  const totalCOP = payments.filter(p => p.currency === 'COP').reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>💳 Historial de Pagos</h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>Registro contable de transacciones y pagos manuales en COP (Nequi, Transferencia, Efectivo)</p>
        </div>
      </div>

      {/* Metric Card Total Revenue */}
      <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(34,197,94,0.3)', padding: 20, maxWidth: 360 }}>
        <div style={{ fontSize: 13, color: '#4ade80', marginBottom: 4 }}>Ingresos Totales Recaudados</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#4ade80' }}>
          ${Number(totalCOP).toLocaleString('es-CO')} COP
        </div>
      </div>

      {/* Tabla Pagos */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', background: '#0C1527', borderColor: '#1E293B' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando historial de pagos...</div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#080E1F', color: '#94a3b8' }}>
                  <th style={{ padding: '12px 16px' }}>Fecha</th>
                  <th style={{ padding: '12px 16px' }}>Cliente</th>
                  <th style={{ padding: '12px 16px' }}>Monto (COP)</th>
                  <th style={{ padding: '12px 16px' }}>Método</th>
                  <th style={{ padding: '12px 16px' }}>Nota / Detalle</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {new Date(p.paid_at || p.id).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f8fafc' }}>
                      {p.users?.name || p.user_id}
                      {p.users?.email && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.users.email}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#4ade80' }}>
                      ${Number(p.amount || 0).toLocaleString('es-CO')} {p.currency}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge badge-purple" style={{ textTransform: 'uppercase', fontSize: 10 }}>{p.method}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {p.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && payments.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin pagos registrados</div>
        )}
      </div>
    </div>
  );
}
