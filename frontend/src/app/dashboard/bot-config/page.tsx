'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const CATEGORIES = ['Peluquería', 'Consultorio médico', 'Restaurante', 'Tienda', 'Taller mecánico', 'Spa / Estética', 'Abogado', 'Psicólogo', 'Dentista', 'Otro'];
const PERSONALITIES = [
  { value: 'profesional', label: '💼 Profesional', desc: 'Formal, directo, eficiente' },
  { value: 'amigable', label: '😊 Amigable', desc: 'Cercano, cálido, conversacional' },
  { value: 'casual', label: '😎 Casual', desc: 'Relajado, informal, con humor' },
];

export default function BotConfigPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<any>({
    name: '', category: '', city: '',
    greeting_msg: 'Hola! 👋 Bienvenido a [Nombre negocio]. ¿En qué te puedo ayudar?',
    away_msg: 'Gracias por escribirnos 🙏 En este momento estamos fuera de horario. Te respondemos pronto.',
    active_hours_start: '08:00',
    active_hours_end: '18:00',
    active_days: [1, 2, 3, 4, 5],
    timezone: 'America/Bogota',
    bot_personality: 'amigable',
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://bot-whatsaap-tkjd.onrender.com';

  useEffect(() => {
    if (!user) return;
    fetch(`${BACKEND}/api/business/${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.business) setConfig(d.business); });
  }, [user, BACKEND]);

  const toggleDay = (day: number) => {
    setConfig((prev: any) => ({
      ...prev,
      active_days: prev.active_days.includes(day)
        ? prev.active_days.filter((d: number) => d !== day)
        : [...prev.active_days, day],
    }));
  };

  const save = async () => {
    setLoading(true);
    await fetch(`${BACKEND}/api/business/${user!.id}`, {
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
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
              <input className="input" placeholder="Ej: Bogotá" value={config.city} onChange={e => set('city', e.target.value)} />
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
                  background: config.bot_personality === p.value ? 'rgba(124,58,237,0.1)' : 'var(--bg-card2)',
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
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Apertura</label>
                <input className="input" type="time" value={config.active_hours_start} onChange={e => set('active_hours_start', e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Cierre</label>
                <input className="input" type="time" value={config.active_hours_end} onChange={e => set('active_hours_end', e.target.value)} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, display: 'block' }}>Días activos</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DAYS.map((day, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    style={{
                      padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                      border: `2px solid ${config.active_days?.includes(i) ? 'var(--accent)' : 'var(--border)'}`,
                      background: config.active_days?.includes(i) ? 'rgba(124,58,237,0.2)' : 'var(--bg-card2)',
                      color: config.active_days?.includes(i) ? 'var(--accent-light)' : 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.2s'
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
      <div style={{ marginTop: 24, display: 'flex', gap: 14, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={save} disabled={loading} style={{ padding: '13px 28px', fontSize: 15 }}>
          {loading ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Guardando...</> : '💾 Guardar configuración'}
        </button>
        {saved && (
          <span style={{ color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>
            ✅ Guardado correctamente
          </span>
        )}
      </div>
    </div>
  );
}
