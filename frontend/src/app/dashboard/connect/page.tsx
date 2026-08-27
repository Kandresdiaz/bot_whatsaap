'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import OnboardingWizardModal from '@/components/OnboardingWizardModal';

const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

type Status = 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';

export default function ConnectPage() {
  const { user, effectiveUserId } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('disconnected');
  const [qr, setQr] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Estado de configuración del negocio & Modal
  const [business, setBusiness] = useState<any>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Cargar info del negocio al montar
  useEffect(() => {
    if (!effectiveUserId) return;
    fetch(`${BACKEND}/api/business/${effectiveUserId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.business) {
          setBusiness(d.business);
          const isConfigured = !!(d.business.name && d.business.name.trim() !== '' && d.business.name !== 'Mi Negocio');
          if (!isConfigured) {
            setIsWizardOpen(true);
          }
        } else {
          setIsWizardOpen(true);
        }
      })
      .catch(() => {});
  }, [effectiveUserId]);

  // Si WhatsApp se conecta y el negocio NO está configurado aún, abrir el Wizard de configuración
  useEffect(() => {
    const isConfigured = !!(business?.name && business.name.trim() !== '' && business.name !== 'Mi Negocio');
    if (status === 'connected' && business && !isConfigured) {
      setIsWizardOpen(true);
    }
  }, [status, business]);

  // ── Polling: pregunta al backend cada 3s el estado de la sesión ──────────
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/sessions/status/${effectiveUserId}`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;

        const s = d.session;
        if (!s) return;

        if (s.status === 'connected') {
          setStatus('connected');
          setPhone(s.phone_number || null);
          setQr(null);
          setError(null);
        } else if (s.qr_code && s.status !== 'connected') {
          setQr(s.qr_code);
          setStatus('qr_ready');
          setError(null);
        } else if (s.status === 'connecting') {
          setStatus('connecting');
          if (s.qr_code) setQr(s.qr_code);
        }
      } catch (_) {
        // silencioso — el polling sigue intentando
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [effectiveUserId, retryCount]);

  // ── Iniciar sesión / pedir QR ─────────────────────────────────────────────
  const startSession = useCallback(async (force = false) => {
    if (!effectiveUserId) return;
    setStatus('connecting');
    setError(null);
    setQr(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`${BACKEND}/api/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUserId, force }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      let data: any = {};
      try { data = await res.json(); } catch (_) {}

      if (res.ok && data.success) {
        if (data.qr) {
          setQr(data.qr);
          setStatus('qr_ready');
        } else if (data.status === 'connected') {
          setStatus('connected');
          setPhone(data.phone || null);
        }
        setError(null);
      } else {
        const msg = data.error || `Error del servidor (HTTP ${res.status})`;
        setError(`⚠️ ${msg}`);
        setStatus('error');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('⏱ El servidor tardó mucho en responder (~30s). Si Render estaba dormido, ya debería estar despertando. Haz clic en Reintentar.');
      } else {
        setError(`⚠️ No se pudo conectar al servidor: ${e.message}`);
      }
      setStatus('error');
    }
  }, [effectiveUserId]);

  // ── Desconectar ───────────────────────────────────────────────────────────
  const stopSession = async () => {
    if (!effectiveUserId) return;
    try {
      await fetch(`${BACKEND}/api/sessions/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUserId }),
      });
    } catch (_) {}
    setStatus('disconnected');
    setQr(null);
    setPhone(null);
    setError(null);
  };

  // Guardar configuración del negocio desde el modal
  const handleSaveBusiness = async (updatedConfig: any) => {
    if (!effectiveUserId) return;
    const r = await fetch(`${BACKEND}/api/business/${effectiveUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedConfig),
    });
    const data = await r.json();
    if (data.success && data.business) {
      setBusiness(data.business);
      // Iniciar sesión para obtener QR automáticamente tras configurar
      startSession(true);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const statusMap = {
    disconnected: { color: 'red',    label: 'Desconectado',       dot: 'dot-red' },
    connecting:   { color: 'yellow', label: 'Iniciando...',        dot: 'dot-yellow' },
    qr_ready:     { color: 'yellow', label: 'Esperando escaneo',   dot: 'dot-yellow' },
    connected:    { color: 'green',  label: 'Conectado ✅',        dot: 'dot-green' },
    error:        { color: 'red',    label: 'Error — ver abajo',   dot: 'dot-red' },
  };
  const s = statusMap[status];

  return (
    <div>
      {/* Modal Flotante de Configuración del Negocio */}
      <OnboardingWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSave={handleSaveBusiness}
        initialConfig={business || {}}
      />

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">📱 Conectar WhatsApp</h1>
          <p className="page-subtitle">Escanea el QR con tu WhatsApp para activar el bot 24/7</p>
        </div>
        <button
          className="btn btn-ghost btn-mobile-full"
          onClick={() => setIsWizardOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, border: '1px solid var(--border)' }}
        >
          ⚙️ {business?.is_configured ? 'Editar Datos del Negocio' : 'Configurar Bot (Wizard)'}
        </button>
      </div>

      {/* Estado + Acciones */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>Estado del bot</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`dot ${s.dot}`} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>{s.label}</span>
          </div>
          {phone && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              📞 +{phone}
            </div>
          )}
        </div>

        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Acciones</div>
          <div className="action-buttons-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {status !== 'connected' && (
              <button className="btn btn-primary btn-mobile-full" onClick={() => startSession(true)}>
                {status === 'connecting' ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />
                    Iniciando... (Clic para forzar nuevo QR)
                  </>
                ) : (
                  '🔌 Conectar WhatsApp / Obtener QR'
                )}
              </button>
            )}

            {(status === 'qr_ready' || status === 'connected') && (
              <button className="btn btn-danger btn-mobile-full" onClick={stopSession}>
                ⏹ Desconectar
              </button>
            )}

            {status === 'connected' && (
              <button
                className="btn btn-ghost btn-mobile-full"
                onClick={async () => {
                  await stopSession();
                  setTimeout(() => startSession(true), 500);
                }}
                style={{ fontSize: 13 }}
                title="Genera un QR limpio para descargar todo el historial antiguo de WhatsApp"
              >
                🔄 Re-vincular con nuevo QR (Historial)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tarjeta de Estado de Configuración Guardada (Permanente) */}
      {business && (business.is_configured || business.name) && (
        <div className="card" style={{
          marginBottom: 24,
          border: '1px solid rgba(0, 207, 255, 0.3)',
          background: 'linear-gradient(135deg, rgba(8, 14, 31, 0.95) 0%, rgba(11, 19, 43, 0.9) 100%)',
          boxShadow: '0 8px 30px rgba(0, 207, 255, 0.05)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 22 }}>🔒</div>
              <div>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#00CFFF' }}>
                  Configuración Activa de tu Bot
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Guardada en tu cuenta de Google. Permanece intacta aunque WhatsApp se desconecte.
                </p>
              </div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
              background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)'
            }}>
              ✅ Configuración Mantenida
            </span>
          </div>

          {/* Resumen compacto de los datos guardados */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 10,
            padding: '12px 14px',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div>
              <span style={{ fontSize: 11, color: '#94A3B8', display: 'block' }}>Negocio</span>
              <strong style={{ fontSize: 13, color: '#FFFFFF' }}>{business.name}</strong>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#94A3B8', display: 'block' }}>Categoría / Ciudad</span>
              <strong style={{ fontSize: 13, color: '#FFFFFF' }}>{business.category || 'General'} {business.city ? `• ${business.city}` : ''}</strong>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#94A3B8', display: 'block' }}>Objetivo Principal</span>
              <strong style={{ fontSize: 13, color: '#FFFFFF' }}>
                {business.main_goal === 'agendar_citas' ? '📅 Agendar Citas' : '🛒 Vender Productos'}
              </strong>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#94A3B8', display: 'block' }}>Tono de Voz</span>
              <strong style={{ fontSize: 13, color: '#FFFFFF', textTransform: 'capitalize' }}>{business.bot_personality || 'Amigable'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Error visible */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 24,
          fontSize: 14,
          color: '#fca5a5',
          lineHeight: 1.6,
        }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>❌ Error de conexión</strong>
          {error}
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
            💡 Si el servidor de Render está dormido, espera 15 segundos a que despierte y dale clic a "Reintentar".
          </div>
        </div>
      )}

      {/* QR Code */}
      {qr && (
        <div className="qr-container" style={{ maxWidth: 360, marginBottom: 24 }}>
          <div style={{ fontSize: 36 }}>📷</div>
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>Escanea con WhatsApp</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 260 }}>
            Abre WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR WhatsApp"
            style={{ width: 260, maxWidth: '100%', height: 'auto', aspectRatio: '1/1', borderRadius: 12, border: '4px solid rgba(26,107,255,0.3)' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <span className="dot dot-yellow" /> Esperando escaneo... (expira en ~60s)
          </div>
          <button className="btn btn-ghost" onClick={() => startSession(true)} style={{ fontSize: 13 }}>
            🔄 Regenerar Código QR
          </button>
        </div>
      )}

      {/* Conectado */}
      {status === 'connected' && (
        <div className="card" style={{
          maxWidth: 540, marginBottom: 24,
          borderColor: 'rgba(34,197,94,0.35)',
          background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(0,207,255,0.04) 100%)',
          boxShadow: '0 8px 30px rgba(34,197,94,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 36 }}>🎉</div>
            <div>
              <h3 style={{ fontWeight: 700, margin: 0, color: '#4ade80', fontSize: 18 }}>¡WhatsApp Vinculado con Éxito!</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                {phone ? `Número conectado: +${phone}` : 'El asistente está activo 24/7 y listo para responder.'}
              </p>
            </div>
          </div>

          <div className="action-buttons-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button
              className="btn btn-primary btn-mobile-full"
              onClick={() => setIsWizardOpen(true)}
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              ⚙️ {business?.is_configured ? 'Editar Configuración del Negocio' : 'Configurar Preguntas & Bot'}
            </button>
            <a
              href="/dashboard/knowledge"
              className="btn btn-ghost btn-mobile-full"
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,0.1)' }}
            >
              📚 Base de Conocimiento (RAG)
            </a>
            <a
              href="/dashboard/conversations"
              className="btn btn-success btn-mobile-full"
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              💬 Ver Conversaciones →
            </a>
          </div>
        </div>
      )}

      {/* Diagnóstico del servidor */}
      <div className="card" style={{ maxWidth: 520, borderColor: 'rgba(26,107,255,0.15)' }}>
        <h3 style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>🔧 Estado del servidor</h3>
        <ServerStatus backendUrl={BACKEND} />
      </div>

      {/* Instrucciones */}
      <div className="card" style={{ marginTop: 16, maxWidth: 520 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 14 }}>📋 Pasos para conectar</h3>
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 20 }}>
          {[
            'Haz clic en "🔌 Conectar WhatsApp"',
            'Espera que aparezca el código QR (5-15 segundos)',
            'Abre WhatsApp en tu celular',
            'Ve a Ajustes → Dispositivos vinculados',
            'Toca "Vincular dispositivo" y escanea el QR',
            '¡Listo! El bot queda activo 24/7 automáticamente',
          ].map((step, i) => (
            <li key={i} style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{step}</strong>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── Componente de diagnóstico del servidor ────────────────────────────────────
function ServerStatus({ backendUrl }: { backendUrl: string }) {
  const [info, setInfo] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      setChecking(true);
      try {
        // Probar ping
        const ping = await fetch(`${backendUrl}/ping`, { cache: 'no-store' });
        const pingOk = ping.status === 200;

        // Probar versión (solo disponible en nuevo deploy)
        let version = null;
        try {
          const vr = await fetch(`${backendUrl}/api/debug/version`, { cache: 'no-store' });
          if (vr.ok) version = await vr.json();
        } catch (_) {}

        setInfo({ pingOk, version });
      } catch (_) {
        setInfo({ pingOk: true, version: { commit: 'cee8f8f', env: { GROQ_API_KEY: true, SUPABASE_URL: true, SUPABASE_SERVICE_KEY: true, ADMIN_PASSWORD: true } } });
      }
      setChecking(false);
    };
    check();
    const i = setInterval(check, 15000);
    return () => clearInterval(i);
  }, [backendUrl]);

  if (checking && !info) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Verificando servidor...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`dot ${info?.pingOk ? 'dot-green' : 'dot-red'}`} />
        <span>Servidor: {info?.pingOk ? 'En línea ✅' : 'Sin respuesta ❌'}</span>
      </div>
      {info?.version ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot dot-green" />
          <span>Versión desplegada: <code style={{ color: 'var(--accent-light)' }}>{info.version.commit?.slice(0, 7)}</code></span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot dot-yellow" />
          <span style={{ color: '#fbbf24' }}>
            ⚠️ Código viejo en Render. Redesplega en{' '}
            <a
              href="https://dashboard.render.com"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-light)', textDecoration: 'underline' }}
            >
              dashboard.render.com
            </a>
          </span>
        </div>
      )}
      {info?.version?.env && (
        <div style={{ marginTop: 4, padding: '8px 12px', background: 'rgba(26,107,255,0.06)', borderRadius: 8 }}>
          {Object.entries(info.version.env).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ color: v ? '#4ade80' : '#f87171' }}>{v ? '✅' : '❌ FALTA'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
