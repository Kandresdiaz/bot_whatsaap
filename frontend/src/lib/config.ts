// El backend se alcanza por el mismo origen del panel: vercel.json reenvía
// /api, /socket.io y /ping al servidor real. Así el navegador solo habla https
// con Vercel y no hay bloqueo por contenido mixto (http) ni problemas de CORS.
// Para desarrollo local, define NEXT_PUBLIC_BACKEND_URL=http://localhost:3001.
export const getBackendUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  // Ignorar URLs de hosts anteriores (Replit, Render suspendido) que pudieran
  // seguir configuradas en las variables de entorno de Vercel.
  if (envUrl && !envUrl.includes('replit.app') && !envUrl.includes('onrender.com')) {
    return envUrl.replace(/\/$/, '');
  }
  return '';
};

export const BACKEND_URL = getBackendUrl();
