'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

type KBItem = { id: string; type: string; title: string; content: string; is_active: boolean; created_at: string };

export default function KnowledgePage() {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [items, setItems] = useState<KBItem[]>([]);
  const [tab, setTab] = useState<'text' | 'faq' | 'file' | 'image'>('text');
  const [form, setForm] = useState({ title: '', content: '', question: '', answer: '', imageUrl: '', imageDesc: '' });
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;

  useEffect(() => {
    if (!user) return;
    fetch(`${BACKEND}/api/business/${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.business?.id) {
          setBusinessId(d.business.id);
          loadItems(d.business.id);
        }
      });
  }, [user, BACKEND]);

  const loadItems = async (bId: string) => {
    const res = await fetch(`${BACKEND}/api/knowledge/${bId}`);
    const data = await res.json();
    setItems(data.items || []);
  };

  const addText = async () => {
    if (!businessId || !form.title || !form.content) return;
    setLoading(true);
    await fetch(`${BACKEND}/api/knowledge/${businessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', title: form.title, content: form.content }),
    });
    setForm({ title: '', content: '', question: '', answer: '' });
    await loadItems(businessId);
    setLoading(false);
  };

  const addFaq = async () => {
    if (!businessId || !form.question || !form.answer) return;
    setLoading(true);
    await fetch(`${BACKEND}/api/knowledge/${businessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'faq', title: form.question, content: form.answer }),
    });
    setForm({ title: '', content: '', question: '', answer: '' });
    await loadItems(businessId);
    setLoading(false);
  };

  const addImage = async () => {
    if (!businessId || !form.title || !form.imageUrl) return;
    setLoading(true);
    await fetch(`${BACKEND}/api/knowledge/${businessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'image', title: form.title, content: form.imageDesc || form.title, file_url: form.imageUrl }),
    });
    setForm(p => ({ ...p, title: '', imageUrl: '', imageDesc: '' }));
    await loadItems(businessId);
    setLoading(false);
  };

  const uploadPdf = async () => {
    if (!businessId || !file) return;
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    await fetch(`${BACKEND}/api/knowledge/${businessId}/upload`, { method: 'POST', body: fd });
    setFile(null);
    await loadItems(businessId);
    setLoading(false);
  };

  const toggleItem = async (id: string, current: boolean) => {
    await fetch(`${BACKEND}/api/knowledge/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    });
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !current } : i));
  };

  const deleteItem = async (id: string) => {
    await fetch(`${BACKEND}/api/knowledge/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const typeIcon = { text: '📝', faq: '❓', file: '📄', image: '🖼️' };
  const typeLabel = { text: 'Texto', faq: 'FAQ', file: 'PDF', image: 'Imagen' };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🧠 Knowledge Base</h1>
        <p className="page-subtitle">Alimenta al bot con información de tu negocio — como NotebookLM</p>
      </div>

      {!businessId && (
        <div className="card" style={{ borderColor: 'rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.05)', marginBottom: 24 }}>
          <p style={{ color: 'var(--yellow)', fontSize: 14 }}>⚠️ Primero configura tu negocio en <a href="/dashboard/bot-config" style={{ color: 'var(--accent-light)', textDecoration: 'underline' }}>Configurar Bot</a></p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Panel agregar */}
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>➕ Agregar conocimiento</h3>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['text', 'faq', 'file', 'image'] as const).map(t => (
              <button
                key={t}
                className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, justifyContent: 'center', padding: '8px', fontSize: 13 }}
                onClick={() => setTab(t)}
              >
                {typeIcon[t]} {typeLabel[t]}
              </button>
            ))}
          </div>

          {tab === 'text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="input" placeholder="Título (ej: Sobre el negocio)" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              <textarea className="input" placeholder="Pega aquí toda la información del negocio: descripción, servicios, precios, horarios, ubicación, etc." value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} style={{ minHeight: 150 }} />
              <button className="btn btn-primary" onClick={addText} disabled={loading || !businessId}>
                {loading ? 'Guardando...' : 'Guardar texto'}
              </button>
            </div>
          )}

          {tab === 'faq' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="input" placeholder="Pregunta (ej: ¿Cuál es el precio?)" value={form.question} onChange={e => setForm(p => ({ ...p, question: e.target.value }))} />
              <textarea className="input" placeholder="Respuesta completa..." value={form.answer} onChange={e => setForm(p => ({ ...p, answer: e.target.value }))} />
              <button className="btn btn-primary" onClick={addFaq} disabled={loading || !businessId}>
                {loading ? 'Guardando...' : 'Agregar FAQ'}
              </button>
            </div>
          )}

          {tab === 'file' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  border: '2px dashed var(--accent)', borderRadius: 12, padding: 32,
                  textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                  background: file ? 'rgba(124,58,237,0.1)' : 'transparent'
                }}
                onClick={() => document.getElementById('pdf-input')?.click()}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>{file ? '📄' : '📁'}</div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {file ? file.name : 'Haz clic para subir un PDF (menú, catálogo, tarifas, etc.)'}
                </p>
                <input id="pdf-input" type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
              <button className="btn btn-primary" onClick={uploadPdf} disabled={loading || !file || !businessId}>
                {loading ? 'Procesando PDF...' : 'Subir y procesar PDF'}
              </button>
            </div>
          )}

          {tab === 'image' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                💡 El bot enviará automáticamente la imagen cuando el cliente pregunte por este producto/propiedad.
              </div>
              <input className="input" placeholder="Nombre (ej: Apartamento 301, Pizza Especial, Corte de Cabello)" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              <input className="input" placeholder="URL de la imagen (sube a Imgur, Google Drive, etc.)" value={form.imageUrl} onChange={e => setForm(p => ({ ...p, imageUrl: e.target.value }))} />
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="preview" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} onError={e => (e.currentTarget.style.display = 'none')} />
              )}
              <textarea className="input" placeholder="Descripción detallada (precio, características, disponibilidad...)" value={form.imageDesc} onChange={e => setForm(p => ({ ...p, imageDesc: e.target.value }))} style={{ minHeight: 80 }} />
              <button className="btn btn-primary" onClick={addImage} disabled={loading || !businessId || !form.title || !form.imageUrl}>
                {loading ? 'Guardando...' : '🖼️ Guardar imagen'}
              </button>
            </div>
          )}
        </div>

        {/* Lista de conocimiento */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontWeight: 700 }}>📚 Base de conocimiento ({items.length})</h3>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 480 }}>
            {items.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                Sin información aún. Agrega contenido para que el bot responda bien.
              </div>
            )}
            {items.map(item => (
              <div key={item.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 20, marginTop: 2 }}>{typeIcon[item.type as keyof typeof typeIcon]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.content.slice(0, 80)}...
                  </div>
                  <span className={`badge ${item.is_active ? 'badge-green' : 'badge-red'}`} style={{ marginTop: 6, fontSize: 10 }}>
                    {item.is_active ? '✅ Activo' : '⏸ Inactivo'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => toggleItem(item.id, item.is_active)}>
                    {item.is_active ? '⏸' : '▶️'}
                  </button>
                  <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => deleteItem(item.id)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
