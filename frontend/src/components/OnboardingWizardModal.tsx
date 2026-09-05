'use client';
import { useState, useEffect } from 'react';

interface BusinessConfig {
  name: string;
  category: string;
  city: string;
  description: string;
  main_goal: 'vender' | 'agendar_citas';
  closing_objective: string;
  payment_or_booking_link: string;
  bot_personality: string;
  greeting_msg: string;
  away_msg: string;
  active_hours_start: string;
  active_hours_end: string;
  is_configured?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Partial<BusinessConfig>) => Promise<void>;
  initialConfig?: Partial<BusinessConfig>;
  isMandatory?: boolean;
}

const CATEGORIES = [
  'Restaurante / Comida',
  'Peluquería / Barbería',
  'Consultorio médico / Odontología',
  'Tienda / E-commerce',
  'Asesoría / Consultoría',
  'Taller mecánico',
  'Spa / Estética',
  'Gimnasio / Deporte',
  'Otro',
];

const PERSONALITIES = [
  { value: 'profesional', label: '💼 Profesional', desc: 'Formal, directo y respetuoso' },
  { value: 'amigable', label: '😊 Amigable', desc: 'Cercano, cálido y enfocado en servicio' },
  { value: 'persuasivo', label: '⚡ Vendedor Persuasivo', desc: 'Enfocado en cerrar ventas e incentivar' },
  { value: 'casual', label: '😎 Casual', desc: 'Relajado, fresco e informal' },
];

export default function OnboardingWizardModal({ isOpen, onClose, onSave, initialConfig, isMandatory = false }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const getCleanInitial = (cfg?: Partial<BusinessConfig>) => {
    const isConfigured = Boolean(cfg?.is_configured);
    return {
      name: isConfigured ? (cfg?.name || '') : (cfg?.name === 'BotWA' || cfg?.name?.startsWith('Negocio de ') ? '' : cfg?.name || ''),
      category: cfg?.category || 'Restaurante / Comida',
      city: isConfigured ? (cfg?.city || '') : '',
      description: isConfigured ? (cfg?.description || '') : '',
      main_goal: cfg?.main_goal || 'vender',
      closing_objective: isConfigured ? (cfg?.closing_objective || '') : '',
      payment_or_booking_link: isConfigured ? (cfg?.payment_or_booking_link || '') : '',
      bot_personality: cfg?.bot_personality || 'amigable',
      greeting_msg: cfg?.greeting_msg || '¡Hola! 👋 Bienvenido. ¿En qué te puedo ayudar hoy?',
      away_msg: cfg?.away_msg || 'Gracias por escribirnos 🙏 En este momento estamos fuera de horario. Te respondemos pronto.',
      active_hours_start: cfg?.active_hours_start || '08:00',
      active_hours_end: cfg?.active_hours_end || '18:00',
    };
  };

  const [config, setConfig] = useState<BusinessConfig>(getCleanInitial(initialConfig));

  useEffect(() => {
    if (initialConfig) {
      setConfig(getCleanInitial(initialConfig));
    }
  }, [initialConfig]);

  if (!isOpen) return null;

  const update = (key: keyof BusinessConfig, val: any) => {
    setConfig(prev => ({ ...prev, [key]: val }));
  };

  const handleFinish = async () => {
    if (!config.name.trim()) {
      alert('⚠️ Por favor ingresa el nombre de tu negocio para que el bot sepa presentarse.');
      setStep(1);
      return;
    }
    if (!config.description.trim() || config.description.trim().length < 6) {
      alert('⚠️ Por favor escribe qué ofrece tu negocio para que el bot pueda responder a las dudas de tus clientes.');
      setStep(1);
      return;
    }
    if (!config.payment_or_booking_link.trim() && !config.closing_objective.trim()) {
      alert('⚠️ Por favor ingresa la instrucción de cierre, precios o enlace de pago para que el bot sepa concretar ventas.');
      setStep(3);
      return;
    }

    setSaving(true);
    try {
      await onSave({ ...config, is_configured: true } as any);
      onClose();
    } catch (e: any) {
      alert('Error guardando la configuración: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(5, 10, 24, 0.88)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '10px 8px',
    }}>
      <div style={{
        background: '#0B132B',
        border: '1px solid rgba(0, 207, 255, 0.35)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 35px rgba(26, 107, 255, 0.25)',
        borderRadius: 16,
        width: '100%',
        maxWidth: 580,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '92vh',
        color: '#FFFFFF',
      }}>
        {/* Header del Modal */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(90deg, rgba(26, 107, 255, 0.12) 0%, rgba(0, 207, 255, 0.06) 100%)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 1.2,
                color: '#00CFFF',
              }}>
                Configuración Inicial • Paso {step} de 4
              </span>
              {isMandatory && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}>
                  🔒 Obligatorio para activar el bot
                </span>
              )}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0 0' }}>
              {step === 1 && '🏢 Datos de tu Negocio'}
              {step === 2 && '🎯 Objetivo Principal del Bot'}
              {step === 3 && '💰 Canal de Cierre y Conversión'}
              {step === 4 && '🎭 Empleado Virtual & Tono'}
            </h2>
          </div>
          {!isMandatory && (
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: '#94A3B8', fontSize: 20, cursor: 'pointer', padding: 4
              }}
              title="Cerrar"
            >
              ✕
            </button>
          )}
        </div>

        {/* Indicador de Progreso Minimalista */}
        <div style={{ display: 'flex', height: 3, background: 'rgba(255, 255, 255, 0.05)' }}>
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              style={{
                flex: 1,
                background: s <= step ? 'linear-gradient(90deg, #1A6BFF, #00CFFF)' : 'transparent',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Cuerpo / Contenido por Pasos */}
        <div style={{ padding: '18px 16px', overflowY: 'auto', flex: 1 }}>

          {/* PASO 1: DATOS DEL NEGOCIO */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: '#94A3B8', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  Nombre oficial de tu negocio *
                </label>
                <input
                  className="input"
                  placeholder="Ej: Odontología Smile / Hamburguesas Gourmet"
                  value={config.name}
                  onChange={e => update('name', e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={{ fontSize: 13, color: '#94A3B8', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    Categoría
                  </label>
                  <select
                    className="input"
                    value={config.category}
                    onChange={e => update('category', e.target.value)}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 13, color: '#94A3B8', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    Ciudad
                  </label>
                  <input
                    className="input"
                    placeholder="Ej: Bogotá, Medellín..."
                    value={config.city}
                    onChange={e => update('city', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#94A3B8', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  ¿Qué ofrece tu negocio? (Descripción corta para la IA)
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Ej: Vendemos pizzas artesanales a domicilio y combos familiares. / Ofrecemos limpieza dental, diseño de sonrisa y ortodoncia."
                  value={config.description}
                  onChange={e => update('description', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* PASO 2: OBJETIVO PRINCIPAL */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: 'rgba(0, 207, 255, 0.08)',
                border: '1px solid rgba(0, 207, 255, 0.2)',
                fontSize: 13,
                color: '#E2E8F0',
                lineHeight: 1.5,
              }}>
                💡 <strong>Atención 24/7 orientada a Cierre:</strong> El bot responderá todas las preguntas de tus clientes con amabilidad, pero mantendrá el enfoque en <strong>CERRAR</strong> (venta o cita).
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {/* Opción Vender */}
                <div
                  onClick={() => update('main_goal', 'vender')}
                  style={{
                    padding: 18,
                    borderRadius: 14,
                    cursor: 'pointer',
                    border: `2px solid ${config.main_goal === 'vender' ? '#00CFFF' : 'rgba(255, 255, 255, 0.1)'}`,
                    background: config.main_goal === 'vender' ? 'rgba(26, 107, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🛒</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#FFFFFF', marginBottom: 4 }}>
                    Vender Productos / Servicios
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.4 }}>
                    Brindar precios, enviar catálogo, cotizaciones y enviar link de pago para cerrar ventas.
                  </div>
                </div>

                {/* Opción Agendar Citas */}
                <div
                  onClick={() => update('main_goal', 'agendar_citas')}
                  style={{
                    padding: 18,
                    borderRadius: 14,
                    cursor: 'pointer',
                    border: `2px solid ${config.main_goal === 'agendar_citas' ? '#00CFFF' : 'rgba(255, 255, 255, 0.1)'}`,
                    background: config.main_goal === 'agendar_citas' ? 'rgba(26, 107, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#FFFFFF', marginBottom: 4 }}>
                    Agendar Citas / Reservas
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.4 }}>
                    Consultar disponibilidad, recopilar datos del cliente y agendar turnos o reservas.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASO 3: CANAL DE CIERRE */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: '#94A3B8', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  {config.main_goal === 'vender'
                    ? '💳 Enlace de Pago, Nequi o Instrucción para Comprar'
                    : '🔗 Enlace de Agenda / Calendario o Método de Reserva'}
                </label>
                <input
                  className="input"
                  placeholder={config.main_goal === 'vender'
                    ? 'Ej: Nequi 3001234567 o https://mipago.com/checkout'
                    : 'Ej: https://calendly.com/negocio o Escríbenos tu nombre y horario'}
                  value={config.payment_or_booking_link}
                  onChange={e => update('payment_or_booking_link', e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#94A3B8', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  Precios clave o Instrucción especial de cierre
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder={config.main_goal === 'vender'
                    ? 'Ej: Pizza personal $20.000, Familiar $45.000. Envío gratis por compras mayores a $60.000.'
                    : 'Ej: Consulta general $80.000 (45 min). Se requiere confirmar con 2 horas de anticipación.'}
                  value={config.closing_objective}
                  onChange={e => update('closing_objective', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* PASO 4: PERSONALIDAD Y CONFIRMACIÓN */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: '#94A3B8', display: 'block', marginBottom: 8, fontWeight: 600 }}>
                  Tono de voz de tu Empleado Virtual
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {PERSONALITIES.map(p => (
                    <div
                      key={p.value}
                      onClick={() => update('bot_personality', p.value)}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        cursor: 'pointer',
                        border: `1.5px solid ${config.bot_personality === p.value ? '#00CFFF' : 'rgba(255,255,255,0.08)'}`,
                        background: config.bot_personality === p.value ? 'rgba(26, 107, 255, 0.2)' : 'rgba(255,255,255,0.02)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.label}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{p.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#94A3B8', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  Saludo inicial (primer mensaje)
                </label>
                <input
                  className="input"
                  value={config.greeting_msg}
                  onChange={e => update('greeting_msg', e.target.value)}
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer con Botones de Navegación */}
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          background: '#080E1F',
        }}>
          {step > 1 ? (
            <button
              className="btn btn-ghost"
              onClick={() => setStep(step - 1)}
              style={{ fontSize: 13, color: '#94A3B8' }}
            >
              ‹ Anterior
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                if (step === 1) {
                  if (!config.name.trim()) {
                    alert('⚠️ Ingresa el nombre oficial de tu negocio para continuar.');
                    return;
                  }
                  if (!config.description.trim() || config.description.trim().length < 6) {
                    alert('⚠️ Por favor escribe qué ofrece tu negocio. Esta información es obligatoria para que el bot pueda atender y vender a tus clientes.');
                    return;
                  }
                }
                if (step === 3) {
                  if (!config.payment_or_booking_link.trim() && !config.closing_objective.trim()) {
                    alert('⚠️ Por favor ingresa el enlace de pago/agenda o los precios/instrucción de cierre para que tu bot sepa concretar ventas.');
                    return;
                  }
                }
                setStep(step + 1);
              }}
              style={{ padding: '10px 22px', fontSize: 14 }}
            >
              Siguiente ›
            </button>
          ) : (
            <button
              className="btn btn-success"
              onClick={handleFinish}
              disabled={saving}
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}
            >
              {saving ? 'Guardando...' : '🚀 Finalizar y Conectar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
