'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Procesando autenticación con Google...');
  const [logs, setLogs] = useState<string[]>([]);
  const [hasError, setHasError] = useState(false);

  const addLog = (msg: string) => {
    const entry = `${new Date().toLocaleTimeString()} - ${msg}`;
    console.log('[CALLBACK_DEBUG]', entry);
    setLogs(prev => [...prev, entry]);
  };

  useEffect(() => {
    let processed = false;

    const processSession = async (sessionUser: any) => {
      if (processed || !sessionUser) return;
      processed = true;

      try {
        const backendUrl = 'https://bot-whatsaap-tkjd.onrender.com';

        addLog(`Usuario detectado: ${sessionUser.email} (ID: ${sessionUser.id})`);
        setStatus('Sincronizando usuario con el servidor backend...');

        const res = await fetch(`${backendUrl}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: sessionUser.id,
            email: sessionUser.email,
            name: sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0],
          }),
        });

        addLog(`Respuesta Backend HTTP ${res.status}`);
        const data = await res.json();
        addLog(`Backend payload: ${JSON.stringify(data)}`);

        if (data.success) {
          localStorage.setItem('wbot_user', JSON.stringify(data.user));
          localStorage.setItem('wbot_token', data.token);

          addLog('Credenciales guardadas en localStorage. Redirigiendo a /dashboard...');
          setStatus('¡Bienvenido! Entrando a tu Dashboard...');

          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 300);
        } else {
          setHasError(true);
          const errText = data.error || 'No se pudo vincular la cuenta en el backend.';
          addLog(`Error backend: ${errText}`);
          setStatus(`Error de sincronización: ${errText}`);
        }
      } catch (err: any) {
        setHasError(true);
        const errMsg = err.message || String(err);
        console.error('Error al procesar callback:', err);
        addLog(`Excepción en fetch backend: ${errMsg}`);
        setStatus(`Error de conexión con el servidor: ${errMsg}`);
      }
    };

    const handleCallback = async () => {
      try {
        if (typeof window === 'undefined') return;

        addLog(`Inicio callback. URL actual: ${window.location.href}`);

        // 1. Si viene hash de la URL (#access_token=...&refresh_token=...)
        if (window.location.hash) {
          addLog(`Hash detectado: ${window.location.hash.substring(0, 40)}...`);
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            addLog('Tokens encontrados en el Hash. Estableciendo sesión en Supabase...');
            try {
              const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (sessionErr) addLog(`Error setSession: ${sessionErr.message}`);
              if (sessionData?.session?.user) {
                addLog('Sesión establecida correctamente desde Hash.');
                await processSession(sessionData.session.user);
                return;
              }
            } catch (hashErr: any) {
              addLog(`Excepción en setSession: ${hashErr.message}`);
            }
          }
        }

        // 2. Si viene código PKCE en la URL (?code=...)
        if (window.location.search) {
          addLog(`Search params detectados: ${window.location.search.substring(0, 40)}...`);
          const searchParams = new URLSearchParams(window.location.search);
          const code = searchParams.get('code');

          if (code) {
            addLog(`Código PKCE detectado. Intercambiando con Supabase...`);
            try {
              const { data: exchangeData, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
              if (exchangeErr) addLog(`Error PKCE exchange: ${exchangeErr.message}`);
              if (exchangeData?.session?.user) {
                addLog('Sesión obtenida correctamente via PKCE.');
                await processSession(exchangeData.session.user);
                return;
              }
            } catch (pkceErr: any) {
              addLog(`Excepción PKCE: ${pkceErr.message}`);
            }
          }
        }

        // 3. Obtener sesión de Supabase
        addLog('Consultando supabase.auth.getSession()...');
        const { data: { session }, error: getSessErr } = await supabase.auth.getSession();
        if (getSessErr) addLog(`Error getSession: ${getSessErr.message}`);
        if (session?.user) {
          addLog('Usuario obtenido desde getSession().');
          await processSession(session.user);
          return;
        }

        addLog('Consultando supabase.auth.getUser()...');
        const { data: { user }, error: getUsrErr } = await supabase.auth.getUser();
        if (getUsrErr) addLog(`Error getUser: ${getUsrErr.message}`);
        if (user) {
          addLog('Usuario obtenido desde getUser().');
          await processSession(user);
          return;
        }

        // 4. Listener asíncrono para cambios de autenticación
        addLog('Suscribiendo listener onAuthStateChange...');
        const { data: authSubscription } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          addLog(`Evento de Auth recibido: ${event}`);
          if (currentSession?.user && !processed) {
            await processSession(currentSession.user);
          }
        });

        // 5. Polling de respaldo por 6 segundos
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          addLog(`Intento de polling #${attempts}...`);
          if (processed) {
            clearInterval(interval);
            return;
          }
          const { data: { session: pollSession } } = await supabase.auth.getSession();
          if (pollSession?.user) {
            clearInterval(interval);
            addLog('Sesión encontrada en polling!');
            await processSession(pollSession.user);
          } else if (attempts >= 6) {
            clearInterval(interval);
            if (!processed) {
              setHasError(true);
              addLog('No se detectó sesión de Google tras 6 intentos.');
              setStatus('No se pudo confirmar la sesión de Google. Revisa el registro de diagnóstico abajo.');
            }
          }
        }, 1000);

      } catch (e: any) {
        setHasError(true);
        const errMsg = e.message || String(e);
        console.error('Error general en handleCallback:', e);
        addLog(`Error crítico en handleCallback: ${errMsg}`);
        setStatus(`Error al autenticar: ${errMsg}`);
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(26,107,255,0.18) 0%, var(--bg-dark) 70%)',
      color: '#fff',
      padding: 20,
      textAlign: 'center',
    }}>
      <div style={{
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1px solid rgba(26, 107, 255, 0.4)',
        borderRadius: 20,
        padding: '32px 24px',
        maxWidth: 540,
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: 42,
          marginBottom: 16,
          background: 'linear-gradient(135deg, #1A6BFF, #00CFFF)',
          borderRadius: 16,
          padding: '12px 16px',
          lineHeight: 1
        }}>🤖</div>

        {!hasError && <div className="spinner" style={{ width: 36, height: 36, marginBottom: 20, borderTopColor: '#00CFFF' }} />}

        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#fff' }}>BotWA - Autenticación</h3>
        <p style={{ fontSize: 14, color: hasError ? '#f87171' : 'var(--text-muted)', marginBottom: 20, fontWeight: hasError ? 600 : 400 }}>{status}</p>

        {/* Panel de diagnóstico en pantalla */}
        <div style={{
          width: '100%',
          textAlign: 'left',
          background: '#080E1F',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          padding: 14,
          fontSize: 11,
          fontFamily: 'monospace',
          maxHeight: 180,
          overflowY: 'auto',
          color: '#00CFFF',
          marginBottom: 20
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#94a3b8' }}>📋 Registro de Diagnóstico:</div>
          {logs.map((l, index) => (
            <div key={index} style={{ marginBottom: 3, wordBreak: 'break-all' }}>{l}</div>
          ))}
        </div>

        {hasError && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => window.location.href = '/login'}
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '8px 16px' }}
            >
              🔄 Volver a intentar Login
            </button>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="btn"
              style={{ fontSize: 13, padding: '8px 16px', background: 'rgba(255,255,255,0.1)' }}
            >
              🚀 Probar ir al Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
