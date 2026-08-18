'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io, Socket } from 'socket.io-client';

type Conversation = {
  id: string;
  contact_phone: string;
  contact_name: string;
  bot_active: boolean;
  is_blacklisted: boolean;
  is_lead: boolean;
  last_message_at: string;
  unread_count: number;
  status: string;
  last_message?: string;
};

type Message = {
  id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  sent_by: string;
  timestamp: string;
};

export default function ConversationsPage() {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [globalBotEnabled, setGlobalBotEnabled] = useState<boolean>(false);
  const [togglingGlobal, setTogglingGlobal] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

  const [syncing, setSyncing] = useState(false);
  const [newPhoneModal, setNewPhoneModal] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendSuccessToast, setSendSuccessToast] = useState(false);
  const [sendErrorToast, setSendErrorToast] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('unknown');

  const handleCreateNewChat = async () => {
    const clean = newPhoneInput.replace(/[^0-9]/g, '');
    if (!clean) return;
    const targetId = sessionId || user?.id || 'admin';
    try {
      const res = await fetch(`${BACKEND}/api/conversations/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetId, phone: clean, contactName: clean }),
      });
      const data = await res.json();
      if (data.success && data.conversation) {
        setConversations(prev => [data.conversation, ...prev.filter(c => c.id !== data.conversation.id)]);
        setActive(data.conversation);
      }
    } catch (e) {
      console.error('Error creando nuevo chat:', e);
    } finally {
      setNewPhoneInput('');
      setNewPhoneModal(false);
    }
  };

  // Cargar sesión del usuario y Bot Global
  useEffect(() => {
    if (!user) return;
    setSessionId(user.id);
    fetch(`${BACKEND}/api/sessions/status/${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.session?.id) setSessionId(d.session.id);
        if (d.session?.status) setSessionStatus(d.session.status);
        if (d.session && typeof d.session.bot_enabled === 'boolean') {
          setGlobalBotEnabled(d.session.bot_enabled);
        }
      });

    fetch(`${BACKEND}/api/sessions/global-bot/${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && typeof d.bot_enabled === 'boolean') {
          setGlobalBotEnabled(d.bot_enabled);
        } else {
          setGlobalBotEnabled(false);
        }
      })
      .catch(() => setGlobalBotEnabled(false));
  }, [user, BACKEND]);

  const loadConversations = async (targetId: string) => {
    if (!targetId) return;
    try {
      const res = await fetch(`${BACKEND}/api/conversations/${targetId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.conversations && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
      }
    } catch (_) {}
  };

  // Cargar conversaciones y escuchar eventos socket
  useEffect(() => {
    const targetId = sessionId || user?.id || 'admin';

    loadConversations(targetId);

    // Sondeo de respaldo pasivo cada 15s para evitar saturación y lentitud en la interfaz
    const interval = setInterval(() => {
      loadConversations(targetId);
    }, 15000);

    // Socket para mensajes en tiempo real
    const socket = io(BACKEND!);
    socketRef.current = socket;
    socket.emit('join_session', targetId);
    if (user?.id) socket.emit('join_session', user.id);
    if (user?.id === 'admin' || !user?.id) socket.emit('join_session', '00000000-0000-0000-0000-000000000001');
    socket.emit('join_session', 'admin');

    socket.on('chats_synced', () => {
      loadConversations(targetId);
    });

    socket.on('conversation_updated', (payload: { conversationId?: string; contactPhone?: string; contactName?: string; lastMessage?: string; timestamp?: string }) => {
      const { conversationId, contactPhone, contactName, lastMessage, timestamp } = payload || {};
      const cleanIncomingPhone = contactPhone ? contactPhone.replace(/[^0-9]/g, '') : '';

      setConversations(prevConvs => {
        const index = prevConvs.findIndex(c => c.id === conversationId || (cleanIncomingPhone && c.contact_phone.replace(/[^0-9]/g, '') === cleanIncomingPhone));
        if (index !== -1) {
          const updatedConv = {
            ...prevConvs[index],
            contact_name: contactName || prevConvs[index].contact_name,
            last_message: lastMessage || prevConvs[index].last_message,
            last_message_at: timestamp || new Date().toISOString(),
          };
          const rest = prevConvs.filter((_, i) => i !== index);
          return [updatedConv, ...rest];
        }
        return prevConvs;
      });
    });

    socket.on('manual_needed', () => {
      loadConversations(targetId);
    });

    socket.on('connected', () => {
      setSessionStatus('connected');
      loadConversations(targetId);
    });

    socket.on('disconnected', () => {
      setSessionStatus('disconnected');
    });

    socket.on('global_bot_updated', ({ bot_enabled }: { bot_enabled: boolean }) => {
      if (typeof bot_enabled === 'boolean') {
        setGlobalBotEnabled(bot_enabled);
      }
    });

    socket.on('new_message', (payload: { conversationId?: string; contactPhone?: string; message?: Message }) => {
      const { conversationId, contactPhone, message } = payload || {};
      if (!message || !message.content) return;

      const cleanIncomingPhone = contactPhone ? contactPhone.replace(/[^0-9]/g, '') : '';

      // 1. Agregar mensaje a la pantalla de chat si la conversación está abierta
      setActive(prevActive => {
        if (!prevActive) return prevActive;
        const cleanActivePhone = prevActive.contact_phone ? prevActive.contact_phone.replace(/[^0-9]/g, '') : '';
        const isMatch = (
          prevActive.id === conversationId ||
          (cleanActivePhone && cleanIncomingPhone && cleanActivePhone === cleanIncomingPhone)
        );

        if (isMatch) {
          setMessages(prevMsgs => {
            const exists = prevMsgs.some(m => m.id === message.id || (m.content === message.content && m.direction === message.direction && Math.abs(new Date(m.timestamp).getTime() - new Date(message.timestamp).getTime()) < 3000));
            if (exists) return prevMsgs;
            return [...prevMsgs, message];
          });
        }
        return prevActive;
      });

      // 2. Mover la conversación al inicio de la lista de la izquierda
      setConversations(prevConvs => {
        const index = prevConvs.findIndex(c => c.id === conversationId || (cleanIncomingPhone && c.contact_phone.replace(/[^0-9]/g, '') === cleanIncomingPhone));
        const nowTs = message.timestamp || new Date().toISOString();

        if (index !== -1) {
          const updatedConv = {
            ...prevConvs[index],
            last_message: message.content,
            last_message_at: nowTs,
          };
          const rest = prevConvs.filter((_, i) => i !== index);
          return [updatedConv, ...rest];
        } else {
          // Si el contacto no estaba en la lista, crearlo e insertarlo arriba de primero
          const newConvItem: Conversation = {
            id: conversationId || `conv_${cleanIncomingPhone}`,
            contact_phone: cleanIncomingPhone,
            contact_name: cleanIncomingPhone,
            bot_active: true,
            is_blacklisted: false,
            is_lead: false,
            last_message_at: nowTs,
            unread_count: 1,
            status: 'open',
            last_message: message.content,
          };
          return [newConvItem, ...prevConvs];
        }
      });
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [sessionId, user, BACKEND, active?.id]);

  const handleManualSync = async () => {
    const targetId = sessionId || user?.id || 'admin';
    setSyncing(true);
    try {
      await fetch(`${BACKEND}/api/conversations/sync/${targetId}`, { method: 'POST' });
      loadConversations(targetId);
    } catch (e) {
      console.error('Error al sincronizar:', e);
    } finally {
      setTimeout(() => setSyncing(false), 1000);
    }
  };

  const toggleGlobalBot = async () => {
    if (!user?.id || togglingGlobal) return;
    const nextVal = !globalBotEnabled;
    setTogglingGlobal(true);
    setGlobalBotEnabled(nextVal);
    try {
      await fetch(`${BACKEND}/api/sessions/global-bot/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_enabled: nextVal }),
      });
    } catch (e) {
      console.error('Error cambiando estado global:', e);
      setGlobalBotEnabled(!nextVal);
    } finally {
      setTogglingGlobal(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openConversation = async (conv: Conversation) => {
    setActive(conv);
    const res = await fetch(`${BACKEND}/api/conversations/${conv.id}/messages`);
    const data = await res.json();
    setMessages(data.messages || []);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
  };

  const toggleBot = async (conv: Conversation, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newVal = !conv.bot_active;
    await fetch(`${BACKEND}/api/conversations/${conv.id}/toggle-bot`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_active: newVal }),
    });
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, bot_active: newVal } : c));
    if (active?.id === conv.id) setActive({ ...conv, bot_active: newVal });
  };

  const blacklist = async (conv: Conversation, reason: string) => {
    const newVal = !conv.is_blacklisted;
    await fetch(`${BACKEND}/api/conversations/${conv.id}/blacklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blacklisted: newVal, reason }),
    });
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, is_blacklisted: newVal } : c));
    if (active?.id === conv.id) setActive({ ...conv, is_blacklisted: newVal });
  };

  const sendMessage = async () => {
    if (!reply.trim() || !active || sending) return;
    const targetId = sessionId || user?.id || 'admin';
    const messageText = reply.trim();
    setSending(true);
    setSendErrorToast(null);

    try {
      const res = await fetch(`${BACKEND}/api/sessions/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetId,
          sessionId: targetId,
          phone: active.contact_phone,
          message: messageText,
          conversationId: active.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo enviar el mensaje por WhatsApp. Verifica que tu WhatsApp esté conectado.');
      }

      setReply('');
      setSendSuccessToast(true);
      setTimeout(() => setSendSuccessToast(false), 4000);

      setMessages(prev => {
        const exists = prev.some(m => m.content === messageText && m.direction === 'outbound');
        if (exists) return prev;
        return [...prev, {
          id: Date.now().toString(),
          content: messageText,
          direction: 'outbound',
          sent_by: 'human',
          timestamp: new Date().toISOString()
        }];
      });

      loadConversations(targetId);
    } catch (e: any) {
      console.error('Error enviando mensaje:', e);
      setSendErrorToast(e.message || 'Error al enviar el mensaje por WhatsApp');
      setTimeout(() => setSendErrorToast(null), 6000);
    } finally {
      setSending(false);
    }
  };

  const filtered = conversations
    .filter(c =>
      c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_phone.includes(search)
    )
    .sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());

  const initials = (name: string) => name ? name.slice(0, 2).toUpperCase() : '?';

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '';
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.length === 12 && clean.startsWith('57')) {
      return `+57 ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
    }
    if (clean.length > 8) {
      return `+${clean}`;
    }
    return clean;
  };

  const getContactDisplayTitle = (conv: Conversation) => {
    if (!conv) return '';
    const cleanPhone = conv.contact_phone ? conv.contact_phone.replace(/[^0-9]/g, '') : '';
    const cleanName = conv.contact_name ? conv.contact_name.replace(/[^0-9]/g, '') : '';
    if (conv.contact_name && cleanName !== cleanPhone && conv.contact_name.trim() !== '') {
      return conv.contact_name;
    }
    return formatPhoneNumber(conv.contact_phone);
  };

  const formatWhatsAppTime = (ts: string) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (isYesterday) {
      return 'Ayer';
    }
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', gap: 12 }}>
      {/* Alerta de Bot Global Pausado */}
      {!globalBotEnabled && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12,
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 13,
          color: '#f87171',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⏸️</span>
            <span><strong>Bot Global Pausado:</strong> El asistente de IA no enviará respuestas en ninguna conversación. WhatsApp sigue conectado.</span>
          </div>
          <button className="btn btn-success" style={{ fontSize: 12, padding: '6px 14px' }} onClick={toggleGlobalBot} disabled={togglingGlobal}>
            ▶️ Reanudar Bot Global
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: 20, minHeight: 0 }}>
        {/* Lista de conversaciones */}
        <div className="card" style={{ width: 360, flexShrink: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontWeight: 700, margin: 0, fontSize: 18 }}>💬 Conversaciones</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => setNewPhoneModal(true)}
                  title="Abrir conversación con un número"
                >
                  ➕ Nuevo Chat
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={handleManualSync}
                  disabled={syncing}
                  title="Sincronizar chats de WhatsApp"
                >
                  {syncing ? '🔄 Sync...' : '🔄 Sincronizar'}
                </button>
              </div>
            </div>

            {/* Switch de Bot Global en cabecera de lista */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: globalBotEnabled ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${globalBotEnabled ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 12,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: globalBotEnabled ? '#4ade80' : '#f87171' }}>
                {globalBotEnabled ? '🤖 Bot Global: ACTIVADO' : '⏸️ Bot Global: PAUSADO'}
              </span>
              <label className="toggle" style={{ transform: 'scale(0.8)' }}>
                <input type="checkbox" checked={globalBotEnabled} onChange={toggleGlobalBot} disabled={togglingGlobal} />
                <span className="toggle-slider" />
              </label>
            </div>

            <input
              className="input"
              placeholder="Buscar por nombre o teléfono..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📲</div>
                <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 6 }}>Sin conversaciones cargadas</strong>
                <p style={{ fontSize: 12, marginBottom: 12 }}>
                  Si recién conectaste tu WhatsApp o quieres descargar tus chats recientes, presiona <strong>Sincronizar</strong> abajo. Si deseas chatear con un número en específico, usa <strong>Nuevo Chat</strong>.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, width: '100%' }}
                    onClick={handleManualSync}
                    disabled={syncing}
                  >
                    {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar Chats'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, width: '100%' }}
                    onClick={() => setNewPhoneModal(true)}
                  >
                    ➕ Abrir Nuevo Chat por Número
                  </button>
                  <a
                    href="/dashboard/connect"
                    className="btn btn-primary"
                    style={{ fontSize: 12, display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none', marginTop: 4 }}
                  >
                    🔌 Ir a Conectar / Re-vincular QR
                  </a>
                </div>
              </div>
            )}
            {filtered.map(conv => (
              <div
                key={conv.id}
                className={`chat-item ${active?.id === conv.id ? 'active' : ''}`}
                onClick={() => openConversation(conv)}
              >
                <div className="avatar">{initials(getContactDisplayTitle(conv))}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                      {getContactDisplayTitle(conv)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatWhatsAppTime(conv.last_message_at)}</span>
                  </div>
                  {/* Vista previa del último mensaje */}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {conv.last_message || formatPhoneNumber(conv.contact_phone)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {conv.is_lead && <span className="badge badge-purple" style={{ fontSize: 9, padding: '1px 5px' }}>🔥 Lead</span>}
                      {conv.is_blacklisted && <span className="badge badge-red" style={{ fontSize: 9, padding: '1px 5px' }}>🚫 Silenciado</span>}
                      {!conv.bot_active && !conv.is_blacklisted && <span className="badge badge-yellow" style={{ fontSize: 9, padding: '1px 5px' }}>⏸ Chat Personal</span>}
                    </div>
                    {/* Toggle Bot individual por chat */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={conv.bot_active ? 'Desactivar bot en este chat personal' : 'Activar bot en este chat'}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{conv.bot_active ? 'Bot' : 'Off'}</span>
                      <label className="toggle" style={{ transform: 'scale(0.7)' }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={conv.bot_active} onChange={() => toggleBot(conv)} />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel de chat */}
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!active ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>💬</div>
              <p>Selecciona una conversación</p>
            </div>
          ) : (
            <>
              {/* Header del chat */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)' }}>
                <div className="avatar">{initials(getContactDisplayTitle(active))}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{getContactDisplayTitle(active)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatPhoneNumber(active.contact_phone)}</div>
                </div>
                {/* Controles del chat */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: active.bot_active ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)', padding: '6px 12px', borderRadius: 8, border: `1px solid ${active.bot_active ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}` }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: active.bot_active ? '#4ade80' : '#eab308' }}>
                      {active.bot_active ? '🤖 Bot en este Chat: ON' : '⏸ Chat Personal: Bot OFF'}
                    </span>
                    <label className="toggle" style={{ transform: 'scale(0.85)' }}>
                      <input type="checkbox" checked={active.bot_active} onChange={() => toggleBot(active)} />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                  <button
                    className={`btn ${active.is_blacklisted ? 'btn-success' : 'btn-ghost'}`}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    onClick={() => blacklist(active, 'manual')}
                    title={active.is_blacklisted ? 'Quitar de blacklist' : 'Silenciar (amigo/familiar)'}
                  >
                    {active.is_blacklisted ? '✅ Activar' : '🚫 Silenciar'}
                  </button>
                </div>
              </div>

              {/* Banner de Chat Personal si bot_active es false */}
              {!active.bot_active && !active.is_blacklisted && (
                <div style={{ background: 'rgba(234,179,8,0.1)', borderBottom: '1px solid rgba(234,179,8,0.2)', padding: '8px 20px', fontSize: 12, color: '#eab308', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⏸️</span>
                  <span><strong>Conversación Personal:</strong> El bot está desactivado para este contacto. Las respuestas deben enviarse manualmente.</span>
                </div>
              )}

              {/* Mensajes */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                    <div className={`msg-bubble ${msg.direction === 'outbound' ? 'msg-out' : 'msg-in'}`}>
                      {msg.content}
                    </div>
                    <div className="msg-time" style={{ textAlign: msg.direction === 'outbound' ? 'right' : 'left' }}>
                      {msg.sent_by === 'bot' ? '🤖 ' : msg.sent_by === 'human' ? '👤 ' : ''}
                      {new Date(msg.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Banners de estado de envío */}
              {sendErrorToast && (
                <div style={{ background: 'rgba(239,68,68,0.15)', borderTop: '1px solid rgba(239,68,68,0.3)', borderBottom: '1px solid rgba(239,68,68,0.3)', padding: '8px 20px', fontSize: 13, color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>⚠️ <strong>Error al enviar:</strong> {sendErrorToast}</span>
                  <a href="/dashboard/connect" style={{ color: '#00CFFF', textDecoration: 'underline', fontWeight: 600, fontSize: 12 }}>Ir a Conectar QR</a>
                </div>
              )}

              {sendSuccessToast && (
                <div style={{ background: 'rgba(34,197,94,0.15)', borderTop: '1px solid rgba(34,197,94,0.3)', borderBottom: '1px solid rgba(34,197,94,0.3)', padding: '8px 20px', fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>✅</span>
                  <span><strong>¡Mensaje enviado correctamente por WhatsApp!</strong></span>
                </div>
              )}

              {sessionStatus === 'disconnected' && !sendErrorToast && (
                <div style={{ background: 'rgba(234,179,8,0.15)', borderTop: '1px solid rgba(234,179,8,0.3)', borderBottom: '1px solid rgba(234,179,8,0.3)', padding: '8px 20px', fontSize: 12, color: '#eab308', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>⚠️ <strong>WhatsApp desconectado:</strong> Escanea el código QR en Conectar para enviar mensajes.</span>
                  <a href="/dashboard/connect" className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}>Conectar WA</a>
                </div>
              )}

              {/* Input para responder */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
                <input
                  className="input"
                  placeholder={sending ? "Enviando por WhatsApp..." : "Escribe tu respuesta (intervención manual)..."}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !sending && sendMessage()}
                  disabled={sending}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={sendMessage} disabled={!reply.trim() || sending}>
                  {sending ? '⏳ Enviando...' : 'Enviar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal para Abrir Nuevo Chat por Número */}
      {newPhoneModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <div className="card" style={{ width: 380, padding: 24, borderRadius: 16 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700 }}>📱 Abrir Nuevo Chat</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Ingresa el número de teléfono con código de país (ej. 573001234567) para iniciar o chatear directamente:
            </p>
            <input
              className="input"
              placeholder="Ej: 573001234567"
              value={newPhoneInput}
              onChange={e => setNewPhoneInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateNewChat()}
              style={{ width: '100%', marginBottom: 16, fontSize: 14 }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setNewPhoneModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateNewChat} disabled={!newPhoneInput.trim()}>
                Abrir Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
