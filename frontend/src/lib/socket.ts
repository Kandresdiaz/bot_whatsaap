import { io, Socket } from 'socket.io-client';

// Conexión a Socket.io con el token del panel. El backend rechaza los sockets sin token y
// solo deja entrar a las salas del negocio dueño de ese token: sin esto cualquiera podía
// unirse a la sala de otra cuenta y recibir sus mensajes de WhatsApp en vivo.
export const connectSocket = (backend: string, opts: Partial<Parameters<typeof io>[1]> = {}): Socket => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('wbot_token') : null;

  return io(backend, {
    // El proxy de Vercel no soporta WebSockets: con BACKEND relativo solo polling.
    transports: backend ? ['websocket', 'polling'] : ['polling'],
    auth: { token },
    query: { token: token || '' },
    ...opts,
  });
};
