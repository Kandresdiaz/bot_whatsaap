// fetch para las rutas del backend que exigen sesión: agrega el token Bearer que guarda
// el login ('wbot_token'). Si el backend responde 401 (token vencido o inválido, p. ej.
// porque cambió JWT_SECRET), se cierra la sesión local y se vuelve al login.
export const apiFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('wbot_token') : null;
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    localStorage.removeItem('wbot_user');
    localStorage.removeItem('wbot_token');
    window.location.href = '/login';
  }
  return res;
};
