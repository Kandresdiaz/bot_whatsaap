'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Procesando autenticación con Google...');

  useEffect(() => {
    let processed = false;

    const processSession = async (session: any) => {
      if (processed || !session?.user) return;
      processed = true;

      try {
        const googleUser = session.user;
        const backendUrl = 'https://bot-whatsaap-tkjd.onrender.com';

        setStatus('Cargando tu panel de control...');

        const res = await fetch(`${backendUrl}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: googleUser.id,
            email: googleUser.email,
            name: googleUser.user_metadata?.full_name || googleUser.user_metadata?.name || googleUser.email?.split('@')[0],
          }),
        });

        const data = await res.json();

        if (data.success) {
          localStorage.setItem('wbot_user', JSON.stringify(data.user));
          localStorage.setItem('wbot_token', data.token);

          setStatus('¡Bienvenido! Entrando a tu Dashboard...');

          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 300);
        } else {
          setStatus(`Error: ${data.error || 'No se pudo vincular la cuenta'}`);
          setTimeout(() => router.push('/login'), 3500);
        }
      } catch (err: any) {
        console.error('Error al procesar callback:', err);
        setStatus('Error de conexión con el servidor. Redirigiendo a login...');
        setTimeout(() => router.push('/login'), 3500);
      }
    };

    const handleCallback = async () => {
      try {
        // 1. Intercambiar código PKCE si viene en la URL (?code=...)
        if (typeof window !== 'undefined') {
          const searchParams = new URLSearchParams(window.location.search);
          const code = searchParams.get('code');

          if (code) {
            setStatus('Confirmando acceso con Google...');
            const { data: exchangeData } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeData?.session) {
              await processSession(exchangeData.session);
              return;
            }
          }
        }

        // 2. Obtener sesión de Supabase si ya existe o está en hash de la URL
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await processSession(session);
          return;
        }

        // 3. Listener asíncrono para cambios de autenticación
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          if (currentSession?.user && !processed) {
            await processSession(currentSession);
          }
        });

        // 4. Timeout amplio (15 segundos) para dar tiempo al servidor de responder
        setTimeout(() => {
          if (!processed) {
            setStatus('No se pudo completar el acceso. Redirigiendo a login...');
            router.push('/login');
          }
        }, 15000);
      } catch (e: any) {
        console.error('Error en handleCallback:', e);
        setStatus('Error al autenticar. Redirigiendo...');
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
