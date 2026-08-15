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
  const [globalBotEnabled, setGlobalBotEnabled] = useState<boolean>(true);
  const [togglingGlobal, setTogglingGlobal] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

  const [syncing, setSyncing] = useState(false);

  // Cargar sesión del usuario y Bot Global
  useEffect(() => {
    if (!user) return;
    setSessionId(user.id);
    fetch(`${BACKEND}/api/sessions/status/${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.session?.id) setSessionId(d.session.id);
        if (d.session && typeof d.session.bot_enabled === 'boolean') {
          setGlobalBotEnabled(d.session.bot_enabled);
        }
      });

    fetch(`${BACKEND}/api/sessions/global-bot/${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && typeof d.bot_enabled === 'boolean') {
          setGlobalBotEnabled(d.bot_enabled);
        }
      })
      .catch(() => {});
  }, [user, BACKEND]);

  const loadConversations = (targetId: string) => {
    const ids = Array.from(new Set([targetId, sessionId, user?.id, 'admin', '00000000-0000-0000-0000-000000000001'])).filter(Boolean) as string[];
    
    let found = false;
    for (const id of ids) {
      fetch(`${BACKEND}/api/conversations/${id}`)
        .then(r => r.json())
        .then(d => {
          const list = d.conversations || [];
          if (list.length > 0) {
            found = true;
            setConversations(list);
          } else if (!found && id === ids[ids.length - 1]) {
            setConversations([]);
          }
        })
        .catch(() => {});
    }
  };

  // Cargar conversaciones y escuchar eventos socket
  useEffect(() => {
    const targetId = sessionId || user?.id;
    if (!targetId) return;

    loadConversations(targetId);

    // Sondeo automático continuo
    const interval = setInterval(() => {
      loadConversations(targetId);
      if (user?.id && user.id !== targetId) {
        loadConversations(user.id);
      }
    }, 4000);

    // Socket para mensajes en tiempo real
    const socket = io(BACKEND!);
    socketRef.current = socket;
    socket.emit('join_session', targetId);
    if (user?.id) socket.emit('join_session', user.id);
    if (user?.id === 'admin' || !user?.id) socket.emit('join_session', '00000000-0000-0000-0000-000000000001');
    socket.emit('join_session', 'admin');

    socket.on('chats_synced', () => {
      loadConversations(targetId);
      if (user?.id && user.id !== targetId) loadConversations(user.id);
    });

    socket.on('conversation_updated', () => {
      loadConversations(targetId);
      if (user?.id && user.id !== targetId) loadConversations(user.id);
    });

    socket.on('connected', () => {
      loadConversations(targetId);
      if (user?.id && user.id !== targetId) loadConversations(user.id);
    });

    socket.on('global_bot_updated', ({ bot_enabled }: { bot_enabled: boolean }) => {
      if (typeof bot_enabled === 'boolean') {
        setGlobalBotEnabled(bot_enabled);
      }
    });

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

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [sessionId, user, BACKEND]);

  const handleManualSync = async () => {
    const targetId = sessionId || user?.id;
    if (!targetId) return;
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
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '4px 8px' }}
                onClick={handleManualSync}
                disabled={syncing}
                title="Sincronizar chats de WhatsApp"
              >
                {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar'}
              </button>
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
                  Para traer tus chats anteriores, es necesario escanear un <strong>QR fresco</strong>. Haz clic abajo para generar el QR y descargar tu historial de WhatsApp:
                </p>
                <a
                  href="/dashboard/connect"
                  className="btn btn-primary"
                  style={{ fontSize: 12, display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none' }}
                >
                  🔌 Ir a Conectar / Re-vincular QR
                </a>
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
                    <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                      {conv.contact_name || conv.contact_phone}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(conv.last_message_at)}</span>
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
                <div className="avatar">{initials(active.contact_name || active.contact_phone)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{active.contact_name || active.contact_phone}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{active.contact_phone}</div>
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
    </div>
  );
}
