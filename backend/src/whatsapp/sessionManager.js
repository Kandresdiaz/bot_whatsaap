const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { supabase } = require('../db/supabase');
const { handleIncomingMessage } = require('./messageHandler');

// Mapa en memoria: sessionId -> client de whatsapp-web.js
const activeSessions = new Map();

const createWhatsAppClient = (sessionId, userId) => {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
    },
  });

  // QR generado
  client.on('qr', async (qr) => {
    console.log(`QR generado para sesión ${sessionId}`);
    try {
      const qrDataUrl = await qrcode.toDataURL(qr);
      // Guardar QR en DB
      await supabase
        .from('whatsapp_sessions')
        .update({ qr_code: qrDataUrl, status: 'connecting' })
        .eq('id', sessionId);

      // Emitir QR al frontend via Socket.io
      if (global.io) {
        global.io.to(`session_${sessionId}`).emit('qr', { sessionId, qr: qrDataUrl });
      }
    } catch (err) {
      console.error('Error guardando QR:', err);
    }
  });

  // Listo y autenticado
  client.on('ready', async () => {
    console.log(`✅ WhatsApp conectado - sesión ${sessionId}`);
    const info = client.info;
    const phone = info?.wid?.user || 'unknown';

    await supabase
      .from('whatsapp_sessions')
      .update({
        status: 'connected',
        phone_number: phone,
        qr_code: null,
        last_seen: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (global.io) {
      global.io.to(`session_${sessionId}`).emit('session_ready', { sessionId, phone });
    }
  });

  // Mensaje entrante
  client.on('message', async (msg) => {
    if (msg.fromMe) return; // Ignorar mensajes enviados por nosotros
    await handleIncomingMessage(client, msg, sessionId, userId);
  });

  // Desconectado
  client.on('disconnected', async (reason) => {
    console.log(`❌ WhatsApp desconectado: ${sessionId} - ${reason}`);
    activeSessions.delete(sessionId);

    await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected' })
      .eq('id', sessionId);

    if (global.io) {
      global.io.to(`session_${sessionId}`).emit('session_disconnected', { sessionId, reason });
    }
  });

  return client;
};

const SessionManager = {
  // Iniciar una nueva sesión (genera QR)
  async startSession(sessionId, userId) {
    if (activeSessions.has(sessionId)) {
      return { success: true, message: 'Sesión ya activa' };
    }

    const client = createWhatsAppClient(sessionId, userId);
    activeSessions.set(sessionId, client);

    await client.initialize();
    return { success: true, message: 'Sesión iniciando, espera el QR' };
  },

  // Cerrar sesión
  async stopSession(sessionId) {
    const client = activeSessions.get(sessionId);
    if (client) {
      await client.destroy();
      activeSessions.delete(sessionId);
    }

    await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected' })
      .eq('id', sessionId);

    return { success: true };
  },

  // Obtener cliente activo
  getClient(sessionId) {
    return activeSessions.get(sessionId);
  },

  // Restaurar sesiones activas al reiniciar el servidor
  async restoreAllSessions() {
    const { data: sessions } = await supabase
      .from('whatsapp_sessions')
      .select('id, user_id, status')
      .eq('status', 'connected');

    if (!sessions?.length) return;

    console.log(`Restaurando ${sessions.length} sesiones...`);
    for (const session of sessions) {
      await this.startSession(session.id, session.user_id);
    }
  },

  // Enviar mensaje desde el dueño (intervención humana)
  async sendMessage(sessionId, phone, message) {
    const client = activeSessions.get(sessionId);
    if (!client) return { success: false, error: 'Sesión no activa' };

    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    return { success: true };
  },

  activeSessions,
};

module.exports = { SessionManager };
