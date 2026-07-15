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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://bot-whatsaap-tkjd.onrender.com';

  // Cargar sesión del usuario
  useEffect(() => {
    if (!user) return;
    fetch(`${BACKEND}/api/sessions/status/${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.session?.id) setSessionId(d.session.id); });
  }, [user, BACKEND]);

  // Cargar conversaciones
  useEffect(() => {
    if (!sessionId) return;
    fetch(`${BACKEND}/api/conversations/${sessionId}`)
      .then(r => r.json())
      .then(d => setConversations(d.conversations || []));

    // Socket para mensajes en tiempo real
    const socket = io(BACKEND!);
    socketRef.current = socket;
    socket.emit('join_session', sessionId);

    socket.on('new_message', ({ conversationId, message }) => {
      if (active?.id === conversationId) {
        setMessages(prev => [...prev, message]);
      }
      setConversations(prev => prev.map(c =>
        c.id === conversationId
          ? { ...c, last_message_at: message.timestamp, unread_count: active?.id === conversationId ? 0 : c.unread_count + 1 }
          : c
      ).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()));
    });

    return () => { socket.disconnect(); };
  }, [sessionId, BACKEND]);

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

  const toggleBot = async (conv: Conversation) => {
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
    if (!reply.trim() || !active || !sessionId) return;
    await fetch(`${BACKEND}/api/sessions/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, phone: active.contact_phone, message: reply, conversationId: active.id }),
    });
    setMessages(prev => [...prev, { id: Date.now().toString(), content: reply, direction: 'outbound', sent_by: 'human', timestamp: new Date().toISOString() }]);
    setReply('');
  };

  const filtered = conversations.filter(c =>
    c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_phone.includes(search)
  );

  const initials = (name: string) => name ? name.slice(0, 2).toUpperCase() : '?';
  const timeAgo = (ts: string) => {
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', gap: 20, maxHeight: '100%' }}>
      {/* Lista de conversaciones */}
      <div className="card" style={{ width: 340, flexShrink: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontWeight: 700, marginBottom: 12 }}>💬 Conversaciones</h2>
          <input
            className="input"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 13 }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Sin conversaciones aún
            </div>
          )}
          {filtered.map(conv => (
            <div
              key={conv.id}
              className={`chat-item ${active?.id === conv.id ? 'active' : ''}`}
              onClick={() => openConversation(conv)}
            >
              <div className="avatar">{initials(conv.contact_name || conv.contact_phone)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{conv.contact_name || conv.contact_phone}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(conv.last_message_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {conv.is_lead && <span className="badge badge-purple" style={{ fontSize: 10, padding: '2px 6px' }}>🔥 Lead</span>}
                  {conv.is_blacklisted && <span className="badge badge-red" style={{ fontSize: 10, padding: '2px 6px' }}>🚫 Silenciado</span>}
                  {!conv.bot_active && !conv.is_blacklisted && <span className="badge badge-yellow" style={{ fontSize: 10, padding: '2px 6px' }}>⏸ Bot off</span>}
                  {conv.unread_count > 0 && (
                    <span style={{ background: 'var(--accent)', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                      {conv.unread_count}
                    </span>
                  )}
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
              <div className="avatar">{initials(active.contact_name || active.contact_phone)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{active.contact_name || active.contact_phone}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{active.contact_phone}</div>
              </div>
              {/* Controles */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Bot</span>
                  <label className="toggle">
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

            {/* Input para responder */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
              <input
                className="input"
                placeholder="Escribe tu respuesta (intervención manual)..."
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={sendMessage} disabled={!reply.trim()}>
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
