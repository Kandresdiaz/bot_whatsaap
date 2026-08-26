// Contexto global de auth + seleccion de cliente para modo admin
'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export type User = {
  id: string;
  email: string;
  name: string;
  plan: string;
  is_admin: boolean;
  paid_until?: string;
  status?: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  selectedClientId: string | null;
  selectedClientName: string | null;
  effectiveUserId: string;
  setSelectedClientContext: (id: string | null, name?: string | null) => void;
  clearSelectedClientContext: () => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  selectedClientId: null,
  selectedClientName: null,
  effectiveUserId: 'admin',
  setSelectedClientContext: () => {},
  clearSelectedClientContext: () => {},
  login: async () => ({ success: false }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('wbot_user');
    const token = localStorage.getItem('wbot_token');
    const storedSelId = localStorage.getItem('wbot_selected_client_id');
    const storedSelName = localStorage.getItem('wbot_selected_client_name');

    if (stored && token) {
      const u = JSON.parse(stored);
      setUser(u);
      if (u.is_admin && storedSelId) {
        setSelectedClientId(storedSelId);
        setSelectedClientName(storedSelName || null);
      }
    }
    setLoading(false);
  }, []);

  const setSelectedClientContext = (id: string | null, name?: string | null) => {
    if (id) {
      localStorage.setItem('wbot_selected_client_id', id);
      if (name) localStorage.setItem('wbot_selected_client_name', name);
      else localStorage.removeItem('wbot_selected_client_name');
      setSelectedClientId(id);
      setSelectedClientName(name || null);
    } else {
      localStorage.removeItem('wbot_selected_client_id');
      localStorage.removeItem('wbot_selected_client_name');
      setSelectedClientId(null);
      setSelectedClientName(null);
    }
  };

  const clearSelectedClientContext = () => {
    setSelectedClientContext(null);
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const backendUrl = 'https://bot-whatsaap-tkjd.onrender.com';
    const res = await fetch(`${backendUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('wbot_user', JSON.stringify(data.user));
      localStorage.setItem('wbot_token', data.token);
      setUser(data.user);
      if (data.user.is_admin) {
        window.location.href = '/admin';
      } else {
        window.location.href = '/dashboard';
      }
    }
    return data;
  };

  const logout = () => {
    localStorage.removeItem('wbot_user');
    localStorage.removeItem('wbot_token');
    localStorage.removeItem('wbot_selected_client_id');
    localStorage.removeItem('wbot_selected_client_name');
    setUser(null);
    setSelectedClientId(null);
    setSelectedClientName(null);
    router.push('/login');
  };

  const effectiveUserId = (user?.is_admin && selectedClientId) ? selectedClientId : (user?.id || 'admin');

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      selectedClientId,
      selectedClientName,
      effectiveUserId,
      setSelectedClientContext,
      clearSelectedClientContext,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
