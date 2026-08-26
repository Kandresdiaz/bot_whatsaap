'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Procesando autenticación con Google...');

  useEffect(() => {
    let processed = false;

    const processSession = async (sessionUser: any) => {
      if (processed || !sessionUser) return;
      processed = true;

      try {
        const backendUrl = 'https://bot-whatsaap-tkjd.onrender.com';

        setStatus('Cargando tu panel de control...');

        const res = await fetch(`${backendUrl}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: sessionUser.id,
            email: sessionUser.email,
            name: sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0],
          }),
        });

        const data = await res.json();

        if (data.success) {
          localStorage.setItem('wbot_user', JSON.stringify(data.user));
          localStorage.setItem('wbot_token', data.token);

          setStatus('¡Bienvenido! Entrando a tu Dashboard...');

          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 200);
        } else {
          setStatus(`Error: ${data.error || 'No se pudo vincular la cuenta'}`);
          setTimeout(() => router.push('/login'), 3000);
        }
      } catch (err: any) {
        console.error('Error al procesar callback:', err);
        setStatus('Error de conexión con el servidor. Redirigiendo a login...');
        setTimeout(() => router.push('/login'), 3000);
      }
    };

    const handleCallback = async () => {
      try {
        if (typeof window === 'undefined') return;

        // 1. Si viene hash de la URL (#access_token=...&refresh_token=...)
        if (window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            setStatus('Estableciendo sesión segura...');
            try {
              const { data: sessionData } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (sessionData?.session?.user) {
                await processSession(sessionData.session.user);
                return;
              }
            } catch (hashErr) {
              console.error('Error en setSession desde hash:', hashErr);
            }
          }
        }

        // 2. Si viene código PKCE en la URL (?code=...)
        if (window.location.search) {
          const searchParams = new URLSearchParams(window.location.search);
          const code = searchParams.get('code');

          if (code) {
            setStatus('Confirmando acceso de Google...');
            try {
              const { data: exchangeData } = await supabase.auth.exchangeCodeForSession(code);
              if (exchangeData?.session?.user) {
                await processSession(exchangeData.session.user);
                return;
              }
            } catch (pkceErr) {
              console.error('Error en PKCE exchange:', pkceErr);
            }
          }
        }

        // 3. Obtener sesión de Supabase
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await processSession(session.user);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await processSession(user);
          return;
        }

        // 4. Listener asíncrono para cambios de autenticación
        const { data: authSubscription } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          if (currentSession?.user && !processed) {
            await processSession(currentSession.user);
          }
        });

        // 5. Polling de respaldo por 6 segundos
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          if (processed) {
            clearInterval(interval);
            return;
          }
          const { data: { session: pollSession } } = await supabase.auth.getSession();
          if (pollSession?.user) {
            clearInterval(interval);
            await processSession(pollSession.user);
          } else if (attempts >= 6) {
            clearInterval(interval);
            if (!processed) {
              setStatus('No se pudo verificar la sesión de Google. Redirigiendo...');
              router.push('/login');
            }
          }
        }, 1000);

      } catch (e: any) {
        console.error('Error general en handleCallback:', e);
        setStatus('Error al autenticar. Redirigiendo a login...');
        setTimeout(() => router.push('/login'), 3000);
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
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(26, 107, 255, 0.3)',
        borderRadius: 20,
        padding: '36px 28px',
        maxWidth: 400,
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
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

        <div className="spinner" style={{ width: 36, height: 36, marginBottom: 20, borderTopColor: '#00CFFF' }} />

        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#fff' }}>BotWA</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{status}</p>
      </div>
    </div>
  );
}
