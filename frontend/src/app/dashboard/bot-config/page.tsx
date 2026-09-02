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
  const [activeTab, setActiveTab] = useState<'prompt' | 'business' | 'personality'>('prompt');
  const [showPreview, setShowPreview] = useState(false);
  const [config, setConfig] = useState<any>({
    name: '', category: '', city: '',
    greeting_msg: 'Hola! 👋 Bienvenido a [Nombre negocio]. ¿En qué te puedo ayudar?',
    away_msg: 'Gracias por escribirnos 🙏 En este momento estamos fuera de horario. Te respondemos pronto.',
    active_hours_start: '08:00',
    active_hours_end: '18:00',
    active_days: [1, 2, 3, 4, 5],
    timezone: 'America/Bogota',
    bot_personality: 'persuasivo',
    main_goal: 'vender',
    closing_instructions: '',
    custom_instructions: '',
    payment_or_booking_link: '',
    appointment_duration: 30,
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

  useEffect(() => {
    const targetId = effectiveUserId || user?.id || 'admin';
    if (!targetId) return;
    fetch(`${BACKEND}/api/business/${targetId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.business) setConfig((prev: any) => ({ ...prev, ...d.business })); });
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

  const addChip = (phrase: string) => {
    setConfig((prev: any) => ({
      ...prev,
      custom_instructions: prev.custom_instructions
        ? `${prev.custom_instructions.trim()} ${phrase}`
        : phrase,
    }));
  };

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <h1 className="page-title">⚙️ Configurar Bot & Prompt IA</h1>
        <p className="page-subtitle">Controla cómo vende tu bot, las reglas del System Prompt y qué datos solicita para cerrar</p>
      </div>

      {/* Pestañas Principales */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('prompt')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: 'pointer', transition: 'all 0.2s',
            border: activeTab === 'prompt' ? '1px solid #00CFFF' : '1px solid var(--border)',
            background: activeTab === 'prompt' ? 'rgba(0, 207, 255, 0.12)' : 'var(--bg-card)',
            color: activeTab === 'prompt' ? '#00CFFF' : 'var(--text-muted)',
          }}
        >
          <span>🎯</span> Prompt & Cierre de Ventas
          <span style={{ fontSize: 10, background: '#00CFFF', color: '#000', padding: '2px 6px', borderRadius: 6, fontWeight: 800 }}>IA</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('business')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: 'pointer', transition: 'all 0.2s',
            border: activeTab === 'business' ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: activeTab === 'business' ? 'rgba(26,107,255,0.12)' : 'var(--bg-card)',
            color: activeTab === 'business' ? 'var(--accent-light)' : 'var(--text-muted)',
          }}
        >
          <span>🏢</span> Datos del Negocio & Horarios
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('personality')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: 'pointer', transition: 'all 0.2s',
            border: activeTab === 'personality' ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: activeTab === 'personality' ? 'rgba(26,107,255,0.12)' : 'var(--bg-card)',
            color: activeTab === 'personality' ? 'var(--accent-light)' : 'var(--text-muted)',
          }}
        >
          <span>🎭</span> Personalidad & Saludos
        </button>
      </div>

      {/* ── TAB 1: PROMPT & CIERRE DE VENTAS ────────────────────────────── */}
      {activeTab === 'prompt' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Card 1: Cierre de Ventas y Pedidos */}
          <div className="card" style={{ borderColor: 'rgba(0, 207, 255, 0.4)', background: 'linear-gradient(180deg, rgba(0, 207, 255, 0.04) 0%, var(--bg-card) 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0, 207, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                🎯
              </div>
              <div>
                <h3 style={{ fontWeight: 800, margin: 0, fontSize: 17, color: '#00CFFF' }}>
                  Cierre de Pedidos, Ventas y Citas
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  Configura qué datos pide el bot al cliente para cerrar la orden o agendar la cita en WhatsApp
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginBottom: 18 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                  🎯 Objetivo Principal de Conversión
                </label>
                <select className="input" value={config.main_goal || 'vender'} onChange={e => set('main_goal', e.target.value)} style={{ fontWeight: 600 }}>
                  <option value="vender">🛒 Vender Productos y Tomar Pedidos (Relojes, Ropa, Repuestos, Tiendas)</option>
                  <option value="agendar_citas">📅 Agendar Citas y Reservas (Talleres, Barberías, Spas, Consultorios)</option>
                </select>
                <div style={{ fontSize: 11, color: '#00CFFF', marginTop: 5 }}>
                  {config.main_goal === 'agendar_citas'
                    ? '✨ El bot consulta horarios hábiles y registra la cita en "📅 Calendario y Citas".'
                    : '✨ El bot solicita datos de envío y registra la orden en "🛍️ Pedidos y Ventas".'}
                </div>
              </div>

              {config.main_goal === 'agendar_citas' ? (
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                    ⏱️ Duración Estimada por Turno
                  </label>
                  <select className="input" value={config.appointment_duration || 30} onChange={e => set('appointment_duration', parseInt(e.target.value))}>
                    <option value={15}>15 minutos</option>
                    <option value={30}>30 minutos (Recomendado)</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>1 hora completa</option>
                    <option value={90}>1 hora y media</option>
                    <option value={120}>2 horas</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                    💳 Cuentas de Recaudo / Link de Pago
                  </label>
                  <input
                    className="input"
                    placeholder="Ej: Nequi 3144625381 (Kevin) / Contraentrega / Wompi"
                    value={config.payment_or_booking_link || ''}
                    onChange={e => set('payment_or_booking_link', e.target.value)}
                  />
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700, marginBottom: 6, display: 'block' }}>
                📝 Instrucciones Específicas de Cierre para el Asistente
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder={config.main_goal === 'agendar_citas'
                  ? 'Ej: Pide siempre: Nombre completo y motivo del servicio. Recuerda que para apartar el turno deben transferir $20.000 al Nequi 3144625381.'
                  : 'Ej: Para cerrar el pedido solicita: Nombre completo, Dirección exacta de entrega y Ciudad. Pregunta si pagan por Nequi o Contraentrega. Envíos gratis por compras superiores a $100.000.'}
                value={config.closing_instructions || ''}
                onChange={e => set('closing_instructions', e.target.value)}
                style={{ minHeight: 90, fontSize: 13, lineHeight: 1.4 }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                💡 El bot leerá estas instrucciones antes de tomar el pedido o apartar el turno del cliente.
              </span>
            </div>
          </div>

          {/* Card 2: Instrucciones Generales del Prompt (System Prompt Personalizado) */}
          <div className="card" style={{ borderColor: 'rgba(26, 107, 255, 0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(26, 107, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                🧠
              </div>
              <div>
                <h3 style={{ fontWeight: 800, margin: 0, fontSize: 17 }}>
                  Instrucciones del System Prompt (Comportamiento de la IA)
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  Reglas de atención al cliente, promociones vigentes, garantías o políticas comerciales del negocio
                </p>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <textarea
                className="input"
                rows={4}
                placeholder="Ej: Trata al cliente con cercanía y entusiasmo. Enfatiza que nuestros repuestos son 100% originales con 1 año de garantía. Si preguntan por envíos en la ciudad, aclara que llegan el mismo día si compran antes de las 3pm."
                value={config.custom_instructions || ''}
                onChange={e => set('custom_instructions', e.target.value)}
                style={{ minHeight: 110, fontSize: 13, lineHeight: 1.5 }}
              />
            </div>

            {/* Chips de sugerencias rápidas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Sugerencias rápidas:</span>
              <button
                type="button"
                onClick={() => addChip('Garantía de 1 año en todos los repuestos y mano de obra.')}
                style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, background: 'var(--bg-card2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
              >
                + 🛡️ Garantía de 1 año
              </button>
              <button
                type="button"
                onClick={() => addChip('Envíos gratis a nivel nacional por compras superiores a $120.000 COP.')}
                style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, background: 'var(--bg-card2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
              >
                + 🚚 Envíos gratis &gt; $120k
              </button>
              <button
                type="button"
                onClick={() => addChip('Si el cliente tiene dudas de compatibilidad, pide marca, modelo y año del vehículo.')}
                style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, background: 'var(--bg-card2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
              >
                + 🏍️ Pedir modelo y año
              </button>
              <button
                type="button"
                onClick={() => addChip('Menciona que los pedidos realizados antes de las 2:00 PM se despachan el mismo día.')}
                style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, background: 'var(--bg-card2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
              >
                + ⚡ Despacho el mismo día
              </button>
            </div>
          </div>

          {/* Card 3: Previsualizador del Prompt en Tiempo Real */}
          <div className="card" style={{ background: '#0a0d14', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setShowPreview(!showPreview)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>👁️</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                    Previsualizar el System Prompt que recibe la IA
                  </h4>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Ver cómo la IA combina tus datos, reglas de cierre y catálogo en tiempo real
                  </span>
                </div>
              </div>
              <button type="button" className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }}>
                {showPreview ? 'Ocultar' : 'Ver Prompt Completo'}
              </button>
            </div>

            {showPreview && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <pre style={{
                  background: '#04060a',
                  padding: 14,
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#00CFFF',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                  maxHeight: 280,
                  border: '1px solid rgba(0, 207, 255, 0.2)'
                }}>
                  {`Eres el ASESOR Y VENDEDOR VIRTUAL OFICIAL Y EXCLUSIVO por WhatsApp del negocio "${config.name || 'Tu Negocio'}".
Tu misión principal es: ${config.main_goal === 'agendar_citas' ? 'ASESORAR Y AGENDAR CITAS O RESERVAS' : 'ASESORAR Y VENDER PRODUCTOS O SERVICIOS'}.

📏 REGLA CRÍTICA: MENOS DE 5 LÍNEAS POR MENSAJE (2 a 4 líneas directo, persuasivo y comercial).
⛔ REGLA DE SALUDO ÚNICO: Si ya hay mensajes previos en la conversación, PROHIBIDO decir "Hola" o repetir la bienvenida.

=== DATOS DEL NEGOCIO ===
Nombre: ${config.name || 'Tu Negocio'}
Giro / Categoría: ${config.category || 'General'}
Ciudad: ${config.city || 'Colombia'}
Horario: ${config.active_hours_start || '08:00'} a ${config.active_hours_end || '20:00'}
Cuentas / Enlace de Pago o Agenda: ${config.payment_or_booking_link || 'Nequi / Daviplata / Contraentrega'}

${config.custom_instructions ? `=== INSTRUCCIONES PERSONALIZADAS DE LA EMPRESA ===\n${config.custom_instructions}\n` : ''}
${config.closing_instructions ? `=== INSTRUCCIONES ESPECÍFICAS DE CIERRE ===\n${config.closing_instructions}\n` : ''}`}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: DATOS DEL NEGOCIO & HORARIOS ─────────────────────────── */}
      {activeTab === 'business' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
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
                <input className="input" placeholder="Ej: Bogotá / Cali / Medellín" value={config.city || ''} onChange={e => set('city', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Descripción / Servicios</label>
                <input className="input" placeholder="Ej: Venta de repuestos y taller especializado en motos" value={config.description || ''} onChange={e => set('description', e.target.value)} />
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
                      type="button"
                      onClick={() => toggleDay(i)}
                      style={{
                        padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: `2px solid ${config.active_days?.includes(i) ? 'var(--accent)' : 'var(--border)'}`,
                        background: config.active_days?.includes(i) ? 'rgba(26,107,255,0.2)' : 'var(--bg-card2)',
                        color: config.active_days?.includes(i) ? 'var(--accent-light)' : 'var(--text-muted)',
                        cursor: 'pointer', transition: 'all 0.2s', flex: '1 1 40px', textAlign: 'center'
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
      )}

      {/* ── TAB 3: PERSONALIDAD & SALUDOS ───────────────────────────────── */}
      {activeTab === 'personality' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
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
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>💬 Mensajes de Saludo</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                  Saludo inicial (primer mensaje cuando el cliente escribe por primera vez)
                </label>
                <textarea className="input" value={config.greeting_msg} onChange={e => set('greeting_msg', e.target.value)} style={{ minHeight: 80 }} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                  Mensaje fuera de horario
                </label>
                <textarea className="input" value={config.away_msg} onChange={e => set('away_msg', e.target.value)} style={{ minHeight: 80 }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botón Guardar siempre accesible */}
      <div style={{ marginTop: 28, padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Los cambios se aplican de inmediato en la IA y se sincronizan con las conversaciones de WhatsApp.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saved && (
            <span style={{ color: 'var(--green)', fontSize: 13, fontWeight: 700 }}>
              ✅ ¡Configuración guardada con éxito!
            </span>
          )}
          <button className="btn btn-primary" onClick={save} disabled={loading} style={{ padding: '12px 24px', fontSize: 14, fontWeight: 700 }}>
            {loading ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Guardando...</> : '💾 Guardar Configuración'}
          </button>
        </div>
      </div>
    </div>
  );
}
