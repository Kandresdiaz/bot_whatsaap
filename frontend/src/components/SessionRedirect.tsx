'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

// En "/": quien ya tiene sesión va directo a su panel; quien no, se queda en la landing.
// El script inline de page.tsx oculta la landing antes del primer pintado si hay sesión,
// así que aquí solo queda hacer la redirección.
export default function SessionRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Tokens de OAuth que Supabase a veces devuelve a la raíz en lugar de /auth/callback
    if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
      window.location.href = `/auth/callback${window.location.search}${window.location.hash}`;
      return;
    }
    if (loading || !user) return;
    router.replace(user.is_admin ? '/admin' : '/dashboard');
  }, [user, loading, router]);

  return null;
}
