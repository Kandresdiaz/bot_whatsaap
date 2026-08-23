'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
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
  created_at?: string;
};

type Message = {
  id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  sent_by: string;
  timestamp: string;
};

const COMMON_EMOJIS = [
  '😊', '👍', '❤️', '🙏', '😂', '🔥', '📍', '✅', '📱', '🤖',
  '💼', '🗓️', '🎉', '👋', '👏', '💬', '💡', '✨', '📌', '🙋‍♂️',
  '👌', '💯', '🚀', '⏳', '⭐', '🤝', '📞', '💵', '🎯', '😃'
];

export default function ConversationsPage() {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'bot' | 'personal'>('all');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
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
  const [sessionStatus, setSessionStatus] = useState<string>('connecting');

  // Generador de color de avatar determinista por contacto estilo WhatsApp Web
  const getAvatarBg = (identifier: string) => {
    const colors = [
      '#00a884', '#008069', '#34b7f1', '#a855f7',
      '#f97316', '#e11d48', '#3b82f6', '#059669',
      '#0891b2', '#d97706'
    ];
    let hash = 0;
    const str = identifier || 'WA';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getInitials = (name: string, phone: string) => {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const cleanName = (name || '').replace(/[^0-9]/g, '');
    if (!name || cleanName === cleanPhone) {
      return cleanPhone ? cleanPhone.slice(-2) : 'WA';
    }
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '';
    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean) return '';
    if (clean.length === 12 && clean.startsWith('57')) {
      return `+57 ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
    }
    return `+${clean}`;
  };

  const getContactDisplayTitle = (conv: Conversation) => {
    if (!conv) return '';
    const cleanPhone = conv.contact_phone ? conv.contact_phone.replace(/[^0-9]/g, '') : '';
    const cleanName = conv.contact_name ? conv.contact_name.replace(/[^0-9]/g, '') : '';
    if (conv.contact_name && cleanName !== cleanPhone && conv.contact_name.trim() !== '') {
      return conv.contact_name;
    }
    return formatPhoneNumber(conv.contact_phone) || 'Contacto WhatsApp';
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

  const handleCreateNewChat = async () => {
    const clean = newPhoneInput.replace(/[^0-9]/g, '');
    if (!clean) return;
    const targetId = user?.id || sessionId || 'admin';

    const tempConv: Conversation = {
      id: `conv_${clean}`,
      contact_phone: clean,
      contact_name: formatPhoneNumber(clean) || clean,
      bot_active: true,
      is_blacklisted: false,
      is_lead: false,
      last_message_at: new Date().toISOString(),
      unread_count: 0,
      status: 'open',
      last_message: 'Nuevo chat creado',
    };

    // Agregar localmente de inmediato para respuesta instantánea
    setConversations(prev => [tempConv, ...prev.filter(c => c.contact_phone !== clean && c.id !== tempConv.id)]);
    setActive(tempConv);
    setNewPhoneInput('');
    setNewPhoneModal(false);

    try {
      const res = await fetch(`${BACKEND}/api/conversations/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetId, phone: clean, contactName: clean }),
      });
      const data = await res.json();
      if (data.success && data.conversation) {
        setConversations(prev => [data.conversation, ...prev.filter(c => c.contact_phone !== clean && c.id !== data.conversation.id)]);
        setActive(data.conversation);
      }
    } catch (e) {
      console.warn('Aviso backend creando chat, usando chat local:', e);
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
      })
      .catch(() => {});

    fetch(`${BACKEND}/api/sessions/global-bot/${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && typeof d.bot_enabled === 'boolean') {
          setGlobalBotEnabled(d.bot_enabled);
        }
      })
      .catch(() => setGlobalBotEnabled(false));
  }, [user, BACKEND]);

  const loadConversations = async (targetId: string) => {
    const idToFetch = user?.id || targetId || 'admin';
    if (!idToFetch) return;
    try {
      const res = await fetch(`${BACKEND}/api/conversations/${idToFetch}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.conversations && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
      }
    } catch (_) {}
  };

  const activeRef = useRef<Conversation | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Sincronización en tiempo real vía WebSockets
  useEffect(() => {
    const userIdToUse = user?.id || 'admin';
    loadConversations(userIdToUse);

    const interval = setInterval(() => {
      loadConversations(userIdToUse);
    }, 15000);

    const socket = io(BACKEND, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    const joinRooms = () => {
      socket.emit('join_session', userIdToUse);
      if (user?.id) socket.emit('join_session', user.id);
      if (sessionId) socket.emit('join_session', sessionId);
      socket.emit('join_session', '00000000-0000-0000-0000-000000000001');
      socket.emit('join_session', 'admin');
    };

    socket.on('connect', () => {
      joinRooms();
    });

    joinRooms();

    socket.on('chats_synced', () => {
      loadConversations(userIdToUse);
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

    socket.on('connected', (payload: any) => {
      const isConn = payload && (payload.status === 'connected' || payload === 'connected');
      if (isConn) setSessionStatus('connected');
      loadConversations(userIdToUse);
    });

    socket.on('session_ready', (payload: any) => {
      if (payload?.status === 'connected' || !payload?.status) setSessionStatus('connected');
      loadConversations(userIdToUse);
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

      const currentActive = activeRef.current;
      const cleanIncomingPhone = contactPhone ? contactPhone.replace(/[^0-9]/g, '') : '';

      if (currentActive) {
        const cleanActivePhone = currentActive.contact_phone ? currentActive.contact_phone.replace(/[^0-9]/g, '') : '';
        const isMatch = (
          currentActive.id === conversationId ||
          (cleanActivePhone && cleanIncomingPhone && cleanActivePhone === cleanIncomingPhone) ||
          (cleanActivePhone && cleanIncomingPhone && (cleanActivePhone.includes(cleanIncomingPhone) || cleanIncomingPhone.includes(cleanActivePhone)))
        );

        if (isMatch) {
          setMessages(prevMsgs => {
            const exists = prevMsgs.some(m => m.id === message.id || (m.content === message.content && m.direction === message.direction && Math.abs(new Date(m.timestamp).getTime() - new Date(message.timestamp).getTime()) < 3000));
            if (exists) return prevMsgs;
            return [...prevMsgs, message];
          });
        }
      }

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
  }, [user?.id, BACKEND]);

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
    activeRef.current = conv;
    setMessages([]); // Limpieza instantánea para evitar que se pegue la conversación previa
    setShowEmojiPicker(false);

    const targetId = user?.id || sessionId || 'admin';
    const cleanP = conv.contact_phone ? conv.contact_phone.replace(/[^0-9]/g, '') : '';
    try {
      const res = await fetch(`${BACKEND}/api/conversations/${conv.id}/messages?phone=${cleanP}&userId=${targetId}`);
      const data = await res.json();
      
      // Validar que el usuario siga viendo este mismo chat
      if (activeRef.current?.id === conv.id || (cleanP && activeRef.current?.contact_phone?.replace(/[^0-9]/g, '') === cleanP)) {
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
        } else {
          setMessages([]);
        }
      }
    } catch (_) {
      if (activeRef.current?.id === conv.id) setMessages([]);
    }
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
      setShowEmojiPicker(false);
      setSendSuccessToast(true);
      setTimeout(() => setSendSuccessToast(false), 3000);

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
      setTimeout(() => setSendErrorToast(null), 5000);
    } finally {
      setSending(false);
    }
  };

  const filtered = useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    return conversations
      .filter(c => {
        if (!c) return false;
        const q = (search || '').toLowerCase();
        const phone = c.contact_phone || '';
        const name = c.contact_name || '';
        const lastMsg = c.last_message || '';

        const matchesSearch =
          name.toLowerCase().includes(q) ||
          phone.includes(q) ||
          lastMsg.toLowerCase().includes(q);

        if (!matchesSearch) return false;

        if (filterTab === 'unread') return (c.unread_count || 0) > 0;
        if (filterTab === 'bot') return c.bot_active && !c.is_blacklisted;
        if (filterTab === 'personal') return !c.bot_active || c.is_blacklisted;
        return true;
      })
      .sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
  }, [conversations, search, filterTab]);

  return (
    <div className="conversations-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', gap: 8, background: '#080E1F' }}>
      {/* Alerta de WhatsApp Desconectado / Pendiente */}
      {sessionStatus !== 'connected' && (
        <div style={{
          background: 'rgba(234,179,8,0.12)',
          border: '1px solid rgba(234,179,8,0.3)',
          borderRadius: 10,
          padding: '8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 13,
          color: '#fbbf24',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>📱</span>
            <span><strong>WhatsApp no vinculado:</strong> Para ver tus chats y permitir que el bot responda, debes vincular tu WhatsApp escaneando el QR.</span>
          </div>
          <a href="/dashboard/connect" className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px', textDecoration: 'none' }}>
            🔌 Escanear QR Ahora
          </a>
        </div>
      )}

      {/* Alerta de Bot Global Pausado */}
      {!globalBotEnabled && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10,
          padding: '8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 13,
          color: '#f87171',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⏸️</span>
            <span><strong>Bot Global Pausado:</strong> La IA no responderá automáticamente en ningún chat. WhatsApp sigue totalmente activo.</span>
          </div>
          <button className="btn btn-success" style={{ fontSize: 12, padding: '4px 12px' }} onClick={toggleGlobalBot} disabled={togglingGlobal}>
            ▶️ Reanudar Bot Global
          </button>
        </div>
      )}

      <div className="conversations-layout" style={{ display: 'flex', flex: 1, gap: 12, minHeight: 0 }}>
        {/* Columna Izquierda: Lista de chats estilo WhatsApp Web */}
        <div className={`conversations-sidebar card ${active ? 'hidden-mobile' : ''}`} style={{ width: 380, flexShrink: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#0c1527', borderColor: '#1e293b' }}>
          
          {/* Header de la lista de chats */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', background: '#0f1b2f' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontWeight: 700, margin: 0, fontSize: 18, color: '#f8fafc' }}>Chats</h2>
                <span style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontWeight: 600,
                  background: sessionStatus === 'connected' ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                  color: sessionStatus === 'connected' ? '#4ade80' : '#eab308',
                  border: `1px solid ${sessionStatus === 'connected' ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`
                }}>
                  {sessionStatus === 'connected' ? '🟢 Conectado' : '🟡 Verificando'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 11, padding: '5px 9px', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setNewPhoneModal(true)}
                  title="Abrir conversación con un número"
                >
                  ➕ Nuevo
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '5px 9px' }}
                  onClick={handleManualSync}
                  disabled={syncing}
                  title="Sincronizar contactos y chats de WhatsApp"
                >
                  {syncing ? '🔄...' : '🔄 Sync'}
                </button>
              </div>
            </div>

            {/* Global Bot Switch compacto */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: globalBotEnabled ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${globalBotEnabled ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              borderRadius: 8,
              padding: '6px 12px',
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: globalBotEnabled ? '#4ade80' : '#f87171' }}>
                {globalBotEnabled ? '🤖 Bot IA: ACTIVADO' : '⏸ Bot IA: PAUSADO'}
              </span>
              <label className="toggle" style={{ transform: 'scale(0.75)' }}>
                <input type="checkbox" checked={globalBotEnabled} onChange={toggleGlobalBot} disabled={togglingGlobal} />
                <span className="toggle-slider" />
              </label>
            </div>

            {/* Input de Búsqueda estilo WhatsApp Web */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                className="input"
                placeholder="🔍 Buscar o empezar un chat..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ fontSize: 13, background: '#080E1F', borderColor: '#1e293b', paddingLeft: 12, height: 36 }}
              />
            </div>

            {/* Pestañas de Filtros estilo WhatsApp Web */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {[
                { id: 'all', label: 'Todos' },
                { id: 'unread', label: 'No leídos' },
                { id: 'bot', label: 'Bot Activo' },
                { id: 'personal', label: 'Personal' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilterTab(t.id as any)}
                  style={{
                    fontSize: 11,
                    fontWeight: filterTab === t.id ? 700 : 500,
                    padding: '4px 10px',
                    borderRadius: 16,
                    border: 'none',
                    cursor: 'pointer',
                    background: filterTab === t.id ? '#00CFFF' : 'rgba(255,255,255,0.06)',
                    color: filterTab === t.id ? '#080E1F' : '#94a3b8',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista scrolleable de chats */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📲</div>
                <strong style={{ display: 'block', color: '#f1f5f9', marginBottom: 6 }}>No hay chats disponibles</strong>
                
                {sessionStatus !== 'connected' ? (
                  <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 10, padding: 14, marginTop: 12, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, color: '#fbbf24', marginBottom: 6, fontSize: 13 }}>⚠️ Estado: WhatsApp Desconectado</div>
                    <p style={{ fontSize: 12, color: '#cbd5e1', margin: '0 0 10px 0' }}>
                      El motor del bot aún no ha sido vinculado con tu cuenta de WhatsApp.
                    </p>
                    <a href="/dashboard/connect" className="btn btn-primary" style={{ fontSize: 12, width: '100%', textDecoration: 'none', textAlign: 'center', display: 'block', padding: '8px 0' }}>
                      🔌 Ir a Conectar WhatsApp y Escanear QR
                    </a>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, marginBottom: 12 }}>
                    Si recién vinculaste tu WhatsApp o quieres actualizar tus chats recientes, haz clic en <strong>Sync</strong>.
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 12, width: '100%', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => setNewPhoneModal(true)}
                  >
                    ➕ Iniciar Nuevo Chat por Número
                  </button>

                  <button className="btn btn-ghost" style={{ fontSize: 12, width: '100%' }} onClick={handleManualSync} disabled={syncing}>
                    {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar Chats'}
                  </button>
                </div>
              </div>
            )}

            {filtered.map(conv => {
              const displayTitle = getContactDisplayTitle(conv);
              const isPhoneOnly = displayTitle.startsWith('+');
              const avatarBg = getAvatarBg(conv.contact_phone || conv.contact_name);
              const initials = getInitials(conv.contact_name, conv.contact_phone);

              return (
                <div
                  key={conv.id}
                  className={`chat-item ${active?.id === conv.id ? 'active' : ''}`}
                  onClick={() => openConversation(conv)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    background: active?.id === conv.id ? 'rgba(0,207,255,0.08)' : 'transparent',
                    borderLeft: active?.id === conv.id ? '3px solid #00CFFF' : '3px solid transparent',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {/* Avatar circular WhatsApp con color determinista */}
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: avatarBg,
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 15,
                    flexShrink: 0,
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                  }}>
                    {initials}
                  </div>

                  {/* Contenido del chat item */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: '#f8fafc',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 180
                      }}>
                        {displayTitle}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        {formatWhatsAppTime(conv.last_message_at)}
                      </span>
                    </div>

                    {/* Subtítulo si el título es un nombre guardado */}
                    {!isPhoneOnly && (
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                        {formatPhoneNumber(conv.contact_phone)}
                      </div>
                    )}

                    {/* Vista previa del último mensaje */}
                    <div style={{
                      fontSize: 12,
                      color: '#94a3b8',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <span>{conv.last_message || 'Sin mensajes aún'}</span>
                    </div>

                    {/* Insignias e indicadores */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {conv.is_lead && <span className="badge badge-purple" style={{ fontSize: 9, padding: '1px 5px' }}>🔥 Lead</span>}
                        {conv.is_blacklisted && <span className="badge badge-red" style={{ fontSize: 9, padding: '1px 5px' }}>🚫 Silenciado</span>}
                        {!conv.bot_active && !conv.is_blacklisted && <span className="badge badge-yellow" style={{ fontSize: 9, padding: '1px 5px' }}>⏸ Personal</span>}
                      </div>

                      {/* Pill de mensajes no leídos */}
                      {conv.unread_count > 0 && (
                        <span style={{
                          background: '#00a884',
                          color: '#ffffff',
                          borderRadius: 10,
                          padding: '1px 6px',
                          fontSize: 10,
                          fontWeight: 700,
                        }}>
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Columna Derecha: Panel de Conversación Activa estilo WhatsApp Web */}
        <div className={`conversations-chatview card ${!active ? 'hidden-mobile' : ''}`} style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#0b141a', borderColor: '#1e293b' }}>
          {!active ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 72, marginBottom: 16, opacity: 0.8 }}>💬</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#f1f5f9', fontWeight: 600 }}>WhatsApp Web Dashboard</h3>
              <p style={{ fontSize: 13, maxWidth: 360, lineHeight: 1.5, margin: 0 }}>
                Selecciona una conversación de la izquierda o inicia un <strong>Nuevo Chat</strong> para enviar mensajes directamente por WhatsApp.
              </p>
            </div>
          ) : (
            <>
              {/* Header del Chat estilo WhatsApp Web */}
              <div style={{
                padding: '10px 14px',
                borderBottom: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#111b21',
                zIndex: 10,
                flexWrap: 'wrap',
                gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <button
                    className="btn btn-ghost mobile-back-btn"
                    style={{ fontSize: 12, padding: '4px 8px' }}
                    onClick={() => setActive(null)}
                    title="Volver a la lista de chats"
                  >
                    ← Volver
                  </button>

                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 0 }}
                    onClick={() => setShowInfoDrawer(!showInfoDrawer)}
                    title="Ver información del contacto"
                  >
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: getAvatarBg(active.contact_phone || active.contact_name),
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 14,
                      flexShrink: 0,
                    }}>
                      {getInitials(active.contact_name, active.contact_phone)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getContactDisplayTitle(active)}
                      </div>
                      <div style={{ fontSize: 11, color: '#00CFFF', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span>{formatPhoneNumber(active.contact_phone)}</span>
                        <span>•</span>
                        <span>{active.bot_active ? '🤖 IA Activa' : '👤 Manual'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Acciones de la cabecera del chat */}
                <div className="chat-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: active.bot_active ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    border: `1px solid ${active.bot_active ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: active.bot_active ? '#4ade80' : '#eab308' }}>
                      {active.bot_active ? 'Bot: ON' : 'Bot: OFF'}
                    </span>
                    <label className="toggle" style={{ transform: 'scale(0.75)' }}>
                      <input type="checkbox" checked={active.bot_active} onChange={() => toggleBot(active)} />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <button
                    className={`btn ${active.is_blacklisted ? 'btn-success' : 'btn-ghost'}`}
                    style={{ fontSize: 11, padding: '5px 10px' }}
                    onClick={() => blacklist(active, 'manual')}
                  >
                    {active.is_blacklisted ? '✅ Activar' : '🚫 Silenciar'}
                  </button>

                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 14, padding: '4px 8px' }}
                    onClick={() => setShowInfoDrawer(!showInfoDrawer)}
                    title="Información del contacto"
                  >
                    ℹ️
                  </button>
                </div>
              </div>

              {/* Banner de Chat Personal */}
              {!active.bot_active && !active.is_blacklisted && (
                <div style={{ background: 'rgba(234,179,8,0.12)', borderBottom: '1px solid rgba(234,179,8,0.2)', padding: '6px 20px', fontSize: 12, color: '#eab308', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⏸️</span>
                  <span><strong>Modo Personal:</strong> La IA está desactivada para este contacto. Responde manualmente desde abajo.</span>
                </div>
              )}

              <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {/* Historial de Mensajes */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10, background: '#0b141a' }}>
                  {messages.map(msg => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isOutbound ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div style={{
                          maxWidth: '70%',
                          padding: '8px 12px',
                          borderRadius: isOutbound ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                          background: isOutbound ? '#005c4b' : '#202c33',
                          color: '#e9edef',
                          fontSize: 14,
                          lineHeight: 1.45,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                          wordBreak: 'break-word',
                          position: 'relative'
                        }}>
                          <div>{msg.content}</div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 4,
                            marginTop: 4,
                            fontSize: 10,
                            color: 'rgba(241,245,249,0.6)',
                          }}>
                            <span>
                              {msg.sent_by === 'bot' ? '🤖 Bot' : msg.sent_by === 'human' ? '👤 Tú' : ''}
                            </span>
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isOutbound && (
                              <span style={{ color: '#53bdeb', fontWeight: 700 }}>✓✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Panel Lateral de Información del Contacto (Info Drawer) */}
                {showInfoDrawer && (
                  <div style={{ width: 280, borderLeft: '1px solid #1e293b', background: '#0f1b2f', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>Info del contacto</h4>
                      <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => setShowInfoDrawer(false)}>✕</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
                      <div style={{
                        width: 70, height: 70, borderRadius: '50%', background: getAvatarBg(active.contact_phone),
                        color: '#fff', fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10
                      }}>
                        {getInitials(active.contact_name, active.contact_phone)}
                      </div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: 16, color: '#f8fafc' }}>{getContactDisplayTitle(active)}</h3>
                      <span style={{ fontSize: 13, color: '#00CFFF' }}>{formatPhoneNumber(active.contact_phone)}</span>
                    </div>

                    <div style={{ background: '#080E1F', padding: 12, borderRadius: 8, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div><strong style={{ color: '#94a3b8' }}>Estado del Bot:</strong> <span style={{ color: active.bot_active ? '#4ade80' : '#eab308' }}>{active.bot_active ? 'Activo' : 'Desactivado'}</span></div>
                      <div><strong style={{ color: '#94a3b8' }}>Silenciado:</strong> <span>{active.is_blacklisted ? 'Sí' : 'No'}</span></div>
                      <div><strong style={{ color: '#94a3b8' }}>Último Mensaje:</strong> <span>{formatWhatsAppTime(active.last_message_at)}</span></div>
                    </div>

                    <button
                      className={`btn ${active.bot_active ? 'btn-ghost' : 'btn-success'}`}
                      style={{ fontSize: 12, width: '100%' }}
                      onClick={() => toggleBot(active)}
                    >
                      {active.bot_active ? '⏸ Pausar Bot en este chat' : '▶️ Activar Bot en este chat'}
                    </button>
                  </div>
                )}
              </div>

              {/* Banners de estado de envío */}
              {sendErrorToast && (
                <div style={{ background: 'rgba(239,68,68,0.15)', borderTop: '1px solid rgba(239,68,68,0.3)', padding: '8px 20px', fontSize: 13, color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>⚠️ <strong>Error al enviar:</strong> {sendErrorToast}</span>
                  <a href="/dashboard/connect" style={{ color: '#00CFFF', textDecoration: 'underline', fontWeight: 600, fontSize: 12 }}>Conectar QR</a>
                </div>
              )}

              {sendSuccessToast && (
                <div style={{ background: 'rgba(34,197,94,0.15)', borderTop: '1px solid rgba(34,197,94,0.3)', padding: '8px 20px', fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>✅</span>
                  <span><strong>¡Mensaje entregado por WhatsApp!</strong></span>
                </div>
              )}

              {/* Popover selector de Emojis */}
              {showEmojiPicker && (
                <div style={{
                  padding: 12,
                  background: '#111b21',
                  borderTop: '1px solid #1e293b',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(10, 1fr)',
                  gap: 8,
                  maxHeight: 120,
                  overflowY: 'auto'
                }}>
                  {COMMON_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setReply(prev => prev + emoji)}
                      style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4 }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Barra de entrada de mensajes estilo WhatsApp Web */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b', background: '#111b21', display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#8696a0' }}
                  title="Emojis"
                >
                  😊
                </button>

                <input
                  className="input"
                  placeholder={sending ? "Enviando mensaje..." : "Escribe un mensaje... (Presiona Enter para enviar)"}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={sending}
                  style={{ flex: 1, background: '#2a3942', borderColor: '#2a3942', color: '#e9edef', borderRadius: 8, height: 42, paddingLeft: 14 }}
                />

                <button
                  className="btn btn-primary"
                  onClick={sendMessage}
                  disabled={!reply.trim() || sending}
                  style={{ height: 42, padding: '0 20px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}
                >
                  {sending ? '⏳' : '✈️ Enviar'}
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
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <div className="card" style={{ width: 380, padding: 24, borderRadius: 16, background: '#0c1527', border: '1px solid #1e293b' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>📱 Abrir Nuevo Chat</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              Ingresa el número con código de país (ej. 573001234567) para chatear directamente por WhatsApp:
            </p>
            <input
              className="input"
              placeholder="Ej: 573001234567"
              value={newPhoneInput}
              onChange={e => setNewPhoneInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateNewChat()}
              style={{ width: '100%', marginBottom: 16, fontSize: 14, background: '#080E1F', borderColor: '#1e293b' }}
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
