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

          setStatus('¡Sesión iniciada con éxito! Redirigiendo...');

          setTimeout(() => {
            if (data.user.is_admin) {
              window.location.href = '/admin';
            } else {
              window.location.href = '/dashboard';
            }
          }, 500);
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
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session) {
          await processSession(session);
        } else {
          // Escuchar cambios de estado en caso de hash/redirect diferido
          const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
            if (currentSession?.user) {
              await processSession(currentSession);
            }
          });

          // Timeout de seguridad si no hay sesión
          setTimeout(() => {
            if (!processed) {
              setStatus('No se encontró sesión activa de Google. Redirigiendo a login...');
              router.push('/login');
            }
          }, 5000);
        }
      } catch (e: any) {
        console.error(e);
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
