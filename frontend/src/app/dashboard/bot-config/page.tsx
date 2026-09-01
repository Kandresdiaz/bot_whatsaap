'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const CATEGORIES = [
  'Asesoría / Consultoría',
  'Restaurante / Comida',
  'Peluquería / Barbería',
  'Consultorio médico / Odontología',
  'Tienda / E-commerce',
  'Taller mecánico',
  'Spa / Estética',
  'Gimnasio / Deporte',
  'Otro'
];
const PERSONALITIES = [
  { value: 'persuasivo', label: '⚡ Vendedor Persuasivo', desc: 'Enfocado en cerrar ventas e incentivar la compra' },
  { value: 'profesional', label: '💼 Profesional', desc: 'Formal, directo, eficiente' },
  { value: 'amigable', label: '😊 Amigable', desc: 'Cercano, cálido, conversacional' },
  { value: 'casual', label: '😎 Casual', desc: 'Relajado, informal, con humor' },
];

export default function BotConfigPage() {
  const { user, effectiveUserId } = useAuth();
  const [config, setConfig] = useState<any>({
    name: '', category: '', city: '',
    greeting_msg: 'Hola! 👋 Bienvenido a [Nombre negocio]. ¿En qué te puedo ayudar?',
    away_msg: 'Gracias por escribirnos 🙏 En este momento estamos fuera de horario. Te respondemos pronto.',
    active_hours_start: '08:00',
    active_hours_end: '18:00',
    active_days: [1, 2, 3, 4, 5],
    timezone: 'America/Bogota',
    bot_personality: 'persuasivo',
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

  useEffect(() => {
    const targetId = effectiveUserId || user?.id || 'admin';
    if (!targetId) return;
    fetch(`${BACKEND}/api/business/${targetId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.business) setConfig(d.business); });
  }, [effectiveUserId, user, BACKEND]);

  const toggleDay = (day: number) => {
    setConfig((prev: any) => ({
      ...prev,
      active_days: prev.active_days.includes(day)
        ? prev.active_days.filter((d: number) => d !== day)
        : [...prev.active_days, day],
    }));
  };

  const save = async () => {
    const targetId = effectiveUserId || user?.id || 'admin';
    if (!targetId) return;
    setLoading(true);
    await fetch(`${BACKEND}/api/business/${targetId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    setLoading(false);
  };

  const set = (key: string, val: any) => setConfig((prev: any) => ({ ...prev, [key]: val }));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚙️ Configurar Bot</h1>
        <p className="page-subtitle">Define cómo se comporta tu asistente virtual</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
        {/* Info del negocio */}
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>🏢 Información del negocio</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Nombre del negocio *</label>
              <input className="input" placeholder="Ej: Peluquería María" value={config.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Categoría</label>
              <select className="input" value={config.category} onChange={e => set('category', e.target.value)}>
                <option value="">Seleccionar...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Ciudad</label>
              <input className="input" placeholder="Ej: Bogotá" value={config.city || ''} onChange={e => set('city', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Objetivo Principal del Asistente</label>
              <select className="input" value={config.main_goal || 'vender'} onChange={e => set('main_goal', e.target.value)}>
                <option value="vender">🛒 Vender Productos / Servicios (Catálogo RAG)</option>
                <option value="agendar_citas">📅 Agendar Citas / Reservas (Calendario)</option>
              </select>
            </div>
            {config.main_goal === 'agendar_citas' && (
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Duración Promedio por Cita</label>
                <select className="input" value={config.appointment_duration || 30} onChange={e => set('appointment_duration', parseInt(e.target.value))}>
                  <option value={15}>⏱️ 15 minutos</option>
                  <option value={30}>⏱️ 30 minutos (Recomendado)</option>
                  <option value={45}>⏱️ 45 minutos</option>
                  <option value={60}>⏱️ 1 hora</option>
                  <option value={90}>⏱️ 1 hora y media</option>
                  <option value={120}>⏱️ 2 horas</option>
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                {config.main_goal === 'agendar_citas' ? 'Link / Método de Agenda Externo (Opcional)' : 'Link / Método de Pago o Catálogo'}
              </label>
              <input className="input" placeholder={config.main_goal === 'agendar_citas' ? 'Ej: Link Calendly o dejar vacío para agenda por bot' : 'Ej: Nequi / Wompi / Link de Pago'} value={config.payment_or_booking_link || ''} onChange={e => set('payment_or_booking_link', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Personalidad del bot */}
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>🎭 Personalidad del bot</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PERSONALITIES.map(p => (
              <div
                key={p.value}
                onClick={() => set('bot_personality', p.value)}
                style={{
                  padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                  border: `2px solid ${config.bot_personality === p.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: config.bot_personality === p.value ? 'rgba(26,107,255,0.12)' : 'var(--bg-card2)',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Mensajes */}
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>💬 Mensajes del bot</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Saludo inicial (primera vez que escribe)</label>
              <textarea className="input" value={config.greeting_msg} onChange={e => set('greeting_msg', e.target.value)} style={{ minHeight: 80 }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Mensaje fuera de horario</label>
              <textarea className="input" value={config.away_msg} onChange={e => set('away_msg', e.target.value)} style={{ minHeight: 80 }} />
            </div>
          </div>
        </div>

        {/* Horarios */}
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>🕐 Horario de atención</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Apertura</label>
                <input className="input" type="time" value={config.active_hours_start} onChange={e => set('active_hours_start', e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Cierre</label>
                <input className="input" type="time" value={config.active_hours_end} onChange={e => set('active_hours_end', e.target.value)} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, display: 'block' }}>Días activos</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DAYS.map((day, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    style={{
                      padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: `2px solid ${config.active_days?.includes(i) ? 'var(--accent)' : 'var(--border)'}`,
                      background: config.active_days?.includes(i) ? 'rgba(26,107,255,0.2)' : 'var(--bg-card2)',
                      color: config.active_days?.includes(i) ? 'var(--accent-light)' : 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.2s', flex: '1 1 36px', textAlign: 'center'
                    }}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Guardar */}
      <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save} disabled={loading} style={{ padding: '10px 20px', fontSize: 14 }}>
          {loading ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Guardando...</> : '💾 Guardar configuración'}
        </button>
        {saved && (
          <span style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
            ✅ Guardado correctamente
          </span>
        )}
      </div>
    </div>
  );
}
