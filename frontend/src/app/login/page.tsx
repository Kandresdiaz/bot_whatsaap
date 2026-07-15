'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || 'Error al iniciar sesión. Verifica tus datos.');
      }
    } catch (err: any) {
      setError(`Error de conexión con el servidor backend: ${err.message || err}. Asegúrate de que el backend en Render esté activo.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.15) 0%, var(--bg-dark) 60%)'
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            fontSize: 48, marginBottom: 12, display: 'inline-block',
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            borderRadius: 16, padding: '12px 16px', lineHeight: 1
          }}>🤖</div>
          <h1 style={{
            fontSize: 28, fontWeight: 800,
            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>BotWA</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            Tu empleado de WhatsApp 24/7
          </p>
        </div>

        {/* Form */}
        <div className="card" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Iniciar sesión</h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                Email
              </label>
              <input
                className="input"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                Contraseña
              </label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#ef4444'
              }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '13px' }}
            >
              {loading ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Entrando...</> : 'Entrar →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          ¿No tienes cuenta? Contacta al administrador.
        </p>
      </div>
    </div>
  );
}
