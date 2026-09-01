// Notificador de alertas de leads y alertas internas del sistema

const notifyLead = async (business, contactPhone, contactName, lastMessage, conversationId, sock, fromJid, extraData = null) => {
  try {
    const adminPhone = process.env.ADMIN_WHATSAPP;
    if (!adminPhone) return;

    const dashboardUrl = `${process.env.FRONTEND_URL || 'https://bot-whatsaap.vercel.app'}/dashboard/conversations`;

    let detailsText = '';
    if (extraData?.newOrderData) {
      const o = extraData.newOrderData;
      detailsText = `\n\n📦 *NUEVO PEDIDO REGISTRADO*\n• Cliente: ${o.nombre || contactName}\n• Producto/s: ${o.producto || 'Pedido'}\n• Cantidad: ${o.cantidad || 1}\n• Total: $${o.total || 'Por liquidar'}\n• Dirección: ${o.direccion || o.ciudad || 'No especificada'}\n• Pago: ${o.metodo_pago || 'Contraentrega / Nequi'}`;
    } else if (extraData?.newAppointmentData) {
      const a = extraData.newAppointmentData;
      detailsText = `\n\n📅 *NUEVA CITA AGENDADA*\n• Servicio: ${a.servicio || 'General'}\n• Fecha: ${a.fecha || 'Por coordinar'}\n• Hora: ${a.hora || 'Por coordinar'}\n• Nombre: ${a.nombre || contactName}`;
    } else if (extraData?.clientData) {
      const d = extraData.clientData;
      detailsText = `\n\n🛒 *CIERRE DE VENTA / DATOS*\n• Nombre: ${d.nombre || contactName}\n• Producto/Plan: ${d.producto || 'Interesado'}${d.ciudad ? `\n• Ubicación: ${d.ciudad}` : ''}${d.metodo_pago ? `\n• Método Pago: ${d.metodo_pago}` : ''}`;
    }

    const message = `🔔 *LEAD CALIENTE / CIERRE CONCRETADO*\n\n` +
      `🏢 Negocio: ${business?.name || 'BotWA'}\n` +
      `📱 Contacto: ${contactName} (+${contactPhone})\n` +
      `💬 Mensaje: "${lastMessage}"` +
      detailsText +
      `\n\n👉 *Ver en el Dashboard:*\n${dashboardUrl}`;

    const adminChatId = `${adminPhone}@s.whatsapp.net`;
    await sock.sendMessage(adminChatId, { text: message });
    console.log(`✅ Lead notificado al admin: ${contactPhone}`);
  } catch (err) {
    console.error('Error notificando lead:', err.message);
  }
};

const notifySystemAlert = async (type, details = {}) => {
  try {
    console.warn(`[SYSTEM ALERT] (${type}):`, details);

    // 1. Emitir Socket.io silencioso al dashboard
    if (global.io) {
      global.io.emit('system_alert', {
        type,
        details,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Notificar por WhatsApp al Admin si es alerta crítica (limitado a 1 alerta/hora para evitar spam)
    if (type === 'GROQ_API_ERROR' && process.env.ADMIN_WHATSAPP) {
      const now = Date.now();
      if (!global.lastAlertTime || (now - global.lastAlertTime > 3600000)) {
        global.lastAlertTime = now;
        const adminPhone = process.env.ADMIN_WHATSAPP;
        const message = `⚠️ *ALERTA TÉCNICA BOTWA*\n\n` +
          `La API de IA (Groq) presentó una interrupción o requiere revisión.\n` +
          `Detalle: ${details.message || 'Revisar API Key / Quota'}\n` +
          `Negocio: ${details.businessName || 'General'}\n\n` +
          `ℹ️ *Tranquilo:* Los clientes de WhatsApp continuaron recibiendo atención fluida en rol de empleado sin ver ningún error.`;

        const { sessions } = require('./sessionManager');
        for (const s of sessions.values()) {
          if (s?.sock) {
            try {
              await s.sock.sendMessage(`${adminPhone}@s.whatsapp.net`, { text: message });
              break;
            } catch (_) {}
          }
        }
      }
    }
  } catch (err) {
    console.error('[NOTIFIER] Error en notifySystemAlert:', err.message);
  }
};

module.exports = { notifyLead, notifySystemAlert };
