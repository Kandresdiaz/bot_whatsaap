// Notificar al admin cuando hay un lead caliente (Baileys)
const notifyLead = async (business, contactPhone, contactName, lastMessage, conversationId, sock, fromJid) => {
  try {
    const adminPhone = process.env.ADMIN_WHATSAPP;
    if (!adminPhone) return;

    const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard/conversations/${conversationId}`;

    const message = `🔔 *LEAD CALIENTE*\n\n` +
      `🏢 Negocio: ${business.name}\n` +
      `📱 Contacto: ${contactName} (${contactPhone})\n` +
      `💬 Dijo: "${lastMessage}"\n\n` +
      `👉 Ver conversación:\n${dashboardUrl}`;

    const adminChatId = `${adminPhone}@s.whatsapp.net`;
    await sock.sendMessage(adminChatId, { text: message });
    console.log(`✅ Lead notificado al admin: ${contactPhone}`);
  } catch (err) {
    console.error('Error notificando lead:', err);
  }
};

module.exports = { notifyLead };
