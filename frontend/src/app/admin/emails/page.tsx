'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BACKEND_URL } from '@/lib/config';

type BetaUser = { id: string; email: string; name: string; created_at: string; beta_email_sent_at: string | null };

// Correos que el backend envía solos (ver backend/src/services/emailService.js).
const AUTOMATIC_EMAILS = [
  { icon: '👋', name: 'Bienvenida al registrarse', when: 'Apenas alguien entra por primera vez con Google. Le explica los 3 pasos para activar su bot.' },
  { icon: '🎁', name: 'Prueba de 7 días activada', when: 'Cuando registra la tarjeta en Mercado Pago y empieza la prueba.' },
  { icon: '⏰', name: 'Recordatorio antes del cobro', when: 'Cada día a las 9:00 a. m. a quienes les quedan pocos días de prueba.' },
  { icon: '✅', name: 'Pago confirmado', when: 'Cuando Mercado Pago confirma un cobro de la suscripción.' },
];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

export default function AdminEmailsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [betaUsers, setBetaUsers] = useState<BetaUser[]>([]);
  const [betaError, setBetaError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const getHeaders = () => {
    const token = localStorage.getItem('wbot_token') || '';
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/emails`, { headers: getHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'No se pudo cargar');
      setSmtpConfigured(data.smtpConfigured);
      setBetaUsers(data.betaUsers || []);
      setBetaError(data.betaError);
    } catch (e: any) {
      setNotice({ ok: false, text: `Error cargando correos: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (user?.email && !testTo) setTestTo(user.email); }, [user?.email]);

  const sendTest = async (template: 'welcome' | 'beta') => {
    setBusy(`test-${template}`);
    setNotice(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/emails/test`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ to: testTo.trim(), template }),
      });
      const data = await res.json();
      setNotice(data.success
        ? { ok: true, text: `Muestra enviada a ${testTo}. Revisa tu bandeja (y spam).` }
        : { ok: false, text: data.error || 'No se pudo enviar' });
    } catch (e: any) {
      setNotice({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const pending = betaUsers.filter(u => !u.beta_email_sent_at);

  const sendBetaAnnouncement = async () => {
    if (!confirm(`Se enviará el correo "BotWA ya salió de beta" a ${pending.length} cliente(s):\n\n${pending.map(u => u.email).join('\n')}\n\n¿Enviar ahora?`)) return;
    setBusy('beta');
    setNotice(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/emails/beta-announcement`, { method: 'POST', headers: getHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'No se pudo enviar');
      const failed = (data.results || []).filter((r: any) => !r.success);
      setNotice({
        ok: failed.length === 0,
        text: `Enviados ${data.sent} de ${data.total}.` + (failed.length ? ` Fallaron: ${failed.map((f: any) => f.email).join(', ')}` : ''),
      });
      await load();
    } catch (e: any) {
      setNotice({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
      <div>
        <h1 className="page-title" style={{ margin: 0 }}>✉️ Correos</h1>
        <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>Correos automáticos a clientes y avisos que envías tú.</p>
      </div>

      {!loading && !smtpConfigured && (
        <div className="card" style={{ borderColor: 'rgba(234,179,8,0.5)', background: 'rgba(234,179,8,0.08)', fontSize: 13, lineHeight: 1.6 }}>
          ⚠️ <strong>El servidor no tiene correo configurado</strong>, así que ningún correo sale de verdad (ni los automáticos).
          Agrega <code>SMTP_USER</code> (tu Gmail) y <code>SMTP_PASS</code> (una &quot;contraseña de aplicación&quot; de Google)
          en las variables de entorno del backend y reinícialo.
        </div>
      )}

      {notice && (
        <div className="card" style={{
          fontSize: 13,
          borderColor: notice.ok ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
          color: notice.ok ? '#4ade80' : '#f87171',
        }}>
          {notice.text}
        </div>
      )}

      {/* Automáticos */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>🤖 Automáticos</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Se envían solos, no tienes que hacer nada.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {AUTOMATIC_EMAILS.map(e => (
            <div key={e.name} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20 }}>{e.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{e.name}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{e.when}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Muestras */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>🧪 Enviarme una muestra</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Para ver cómo le llega el correo a un cliente.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 1, minWidth: 220 }} value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="tu@correo.com" />
          <button className="btn btn-ghost" disabled={!!busy || !smtpConfigured} onClick={() => sendTest('welcome')}>
            {busy === 'test-welcome' ? 'Enviando...' : 'Muestra: bienvenida'}
          </button>
          <button className="btn btn-ghost" disabled={!!busy || !smtpConfigured} onClick={() => sendTest('beta')}>
            {busy === 'test-beta' ? 'Enviando...' : 'Muestra: salimos de beta'}
          </button>
        </div>
      </div>

      {/* Aviso de fin de beta */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>🎉 Aviso: BotWA ya salió de beta</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Para los clientes que se registraron durante la beta. Cada uno lo recibe una sola vez.
        </p>
        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Cargando...</div>
        ) : betaError ? (
          <div style={{ color: '#f87171', fontSize: 13 }}>{betaError}</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {betaUsers.length === 0 && <div style={{ fontSize: 13, color: '#94a3b8' }}>No hay clientes de la beta.</div>}
              {betaUsers.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 6 }}>
                  <span><strong>{u.name || '—'}</strong> <span style={{ color: '#94a3b8' }}>{u.email}</span></span>
                  <span style={{ color: u.beta_email_sent_at ? '#4ade80' : '#94a3b8', fontSize: 12 }}>
                    {u.beta_email_sent_at ? `✓ Enviado ${formatDate(u.beta_email_sent_at)}` : `Registrado ${formatDate(u.created_at)} · pendiente`}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" disabled={!!busy || !smtpConfigured || pending.length === 0} onClick={sendBetaAnnouncement}>
              {busy === 'beta' ? 'Enviando...' : pending.length === 0 ? 'Ya se envió a todos' : `Enviar a ${pending.length} cliente(s)`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
