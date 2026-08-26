'use client';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Redirigir al callback si vienen tokens de OAuth en la URL de inicio
      if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
        window.location.href = `/auth/callback${window.location.search}${window.location.hash}`;
        return;
      }
    }

    if (!loading) {
      if (!user) router.push('/login');
      else if (user.is_admin) router.push('/admin');
      else router.push('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" style={{ width: 48, height: 48 }} />
    </div>
  );
}
