const { SessionManager } = require('./sessionManager');

// Notificar al admin (tú) cuando hay un lead caliente
const notifyLead = async (business, contactPhone, contactName, lastMessage, conversationId, client, adminSessionId) => {
  try {
    const adminPhone = process.env.ADMIN_WHATSAPP;
    if (!adminPhone) return;

    const adminSessionId = process.env.ADMIN_SESSION_ID;
    const adminClient = adminSessionId ? SessionManager.getClient(adminSessionId) : null;

    // Buscar el cliente activo del admin para enviar notificación
    let notifyClient = adminClient || client;

    const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard/conversations/${conversationId}`;

    const message = `🔔 *LEAD CALIENTE*\n\n` +
      `🏢 Negocio: ${business.name}\n` +
      `📱 Contacto: ${contactName} (${contactPhone})\n` +
      `💬 Dijo: "${lastMessage}"\n\n` +
      `👉 Ver conversación:\n${dashboardUrl}`;

    const adminChatId = `${adminPhone}@c.us`;
    await notifyClient.sendMessage(adminChatId, message);
    console.log(`✅ Lead notificado al admin: ${contactPhone}`);
  } catch (err) {
    console.error('Error notificando lead:', err);
  }
};

module.exports = { notifyLead };
