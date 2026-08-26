'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';

const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

interface Product {
  id: string;
  business_id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  image_url?: string | null;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES_PRESETS = [
  'General',
  'Comidas / Platillos',
  'Bebidas',
  'Postres',
  'Servicios',
  'Odontología / Salud',
  'Barbería / Estética',
  'Asesorías / Consultas',
  'Planes / Membresías',
  'Otro',
];

export default function ProductsPage() {
  const { user, effectiveUserId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Estado del Modal (Crear / Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Formulario
  const [formData, setFormData] = useState({
    name: '',
    category: 'General',
    price: '',
    currency: 'COP',
    description: '',
    image_url: '',
    is_active: true,
  });

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Cargar productos al montar
  const loadProducts = async () => {
    const targetId = effectiveUserId || user?.id || 'admin';
    if (!targetId) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/products/${targetId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.products && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      }
    } catch (e) {
      console.error('Error cargando productos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [effectiveUserId]);

  // Abrir modal para Crear
  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      category: 'General',
      price: '',
      currency: 'COP',
      description: '',
      image_url: '',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  // Abrir modal para Editar
  const openEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setFormData({
      name: prod.name,
      category: prod.category || 'General',
      price: prod.price ? prod.price.toString() : '0',
      currency: prod.currency || 'COP',
      description: prod.description || '',
      image_url: prod.image_url || '',
      is_active: prod.is_active,
    });
    setIsModalOpen(true);
  };

  // Guardar (Crear / Editar)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Ingresa el nombre del producto o servicio');
      return;
    }

    setSaving(true);
    try {
      const targetId = effectiveUserId || user?.id || 'admin';
      const payload = {
        userId: targetId,
        businessId: targetId,
        ...formData,
        price: parseFloat(formData.price) || 0,
      };

      let res;
      if (editingProduct) {
        res = await fetch(`${BACKEND}/api/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${BACKEND}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success && data.product) {
        showToastMsg(editingProduct ? '✅ Producto actualizado correctamente' : '🎉 Nuevo producto creado exitosamente');
        setIsModalOpen(false);
        loadProducts();
      } else {
        alert('Error guardando el producto: ' + (data.error || 'Intenta de nuevo'));
      }
    } catch (err: any) {
      alert('Error de conexión: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Toggle Activo / Agotado
  const toggleActive = async (prod: Product) => {
    const nextVal = !prod.is_active;
    setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, is_active: nextVal } : p));

    try {
      await fetch(`${BACKEND}/api/products/${prod.id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextVal }),
      });
      showToastMsg(nextVal ? `🟢 ${prod.name} activado` : `🟡 ${prod.name} marcado como agotado`);
    } catch (_) {}
  };

  // Eliminar producto
  const handleDelete = async (prod: Product) => {
    if (!confirm(`¿Estás seguro de eliminar "${prod.name}" del catálogo?`)) return;
    setProducts(prev => prev.filter(p => p.id !== prod.id));

    try {
      await fetch(`${BACKEND}/api/products/${prod.id}`, { method: 'DELETE' });
      showToastMsg('🗑️ Producto eliminado del catálogo');
    } catch (_) {}
  };

  // Categorías disponibles derivadas de productos + presets
  const categoriesList = useMemo(() => {
    const set = new Set<string>(['all']);
    products.forEach(p => { if (p.category) set.add(p.category); });
    return Array.from(set);
  }, [products]);

  // Filtrado de productos
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(search.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(search.toLowerCase()));

      const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [products, search, selectedCategory]);

  const activeCount = useMemo(() => products.filter(p => p.is_active).length, [products]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200, margin: '0 auto', color: '#f8fafc' }}>
      {/* Toast informativo */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#0F172A', color: '#00CFFF', border: '1px solid #00CFFF',
          borderRadius: 12, padding: '12px 20px', fontSize: 13, fontWeight: 600,
          boxShadow: '0 10px 30px rgba(0,207,255,0.2)',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>📦</span> Catálogo de Productos & Servicios
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0 0' }}>
            Gestiona tus platillos, servicios y precios. El bot utilizará este catálogo oficial para responder a tus clientes sin alucinaciones.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={openCreateModal}
          style={{ fontSize: 13, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          ➕ Agregar Producto / Servicio
        </button>
      </div>

      {/* Tarjetas de Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Total en Catálogo</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc' }}>{products.length}</div>
        </div>
        <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(34,197,94,0.3)', padding: 16 }}>
          <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 4 }}>Activos / Disponibles</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#4ade80' }}>{activeCount}</div>
        </div>
        <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(0,207,255,0.3)', padding: 16 }}>
          <div style={{ fontSize: 12, color: '#00CFFF', marginBottom: 4 }}>Categorías Únicas</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#00CFFF' }}>{categoriesList.length - 1 || 1}</div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 200, flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            placeholder="🔍 Buscar por nombre, descripción o categoría..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 13, flex: 1, minWidth: 160 }}
          />

          <select
            className="input"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            style={{ fontSize: 13, flex: '1 1 140px', minWidth: 130 }}
          >
            <option value="all">Todas las Categorías</option>
            {categoriesList.filter(c => c !== 'all').map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, background: '#080E1F', padding: 4, borderRadius: 8, border: '1px solid #1E293B' }}>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: viewMode === 'grid' ? '#00CFFF' : 'transparent',
              color: viewMode === 'grid' ? '#080E1F' : '#94a3b8', fontWeight: 600,
            }}
          >
            📱 Cuadrícula
          </button>
          <button
            onClick={() => setViewMode('table')}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: viewMode === 'table' ? '#00CFFF' : 'transparent',
              color: viewMode === 'table' ? '#080E1F' : '#94a3b8', fontWeight: 600,
            }}
          >
            📋 Tabla
          </button>
        </div>
      </div>

      {/* Lista de Productos (Grid / Table) */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
          Cargando catálogo...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
          <h3 style={{ margin: '0 0 6px 0', fontSize: 16, color: '#f8fafc' }}>No se encontraron productos</h3>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
            {products.length === 0 ? 'Aún no has agregado productos o servicios a tu catálogo.' : 'Ningún producto coincide con el filtro de búsqueda.'}
          </p>
          <button className="btn btn-primary" onClick={openCreateModal} style={{ fontSize: 13 }}>
            ➕ Agregar Mi Primer Producto / Servicio
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Vista Cuadrícula */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {filteredProducts.map(prod => (
            <div
              key={prod.id}
              className="card"
              style={{
                background: '#0C1527',
                borderColor: prod.is_active ? '#1E293B' : 'rgba(239,68,68,0.2)',
                opacity: prod.is_active ? 1 : 0.75,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                padding: 16, gap: 12, transition: 'all 0.2s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px',
                    borderRadius: 10, background: 'rgba(0,207,255,0.1)', color: '#00CFFF', border: '1px solid rgba(0,207,255,0.2)',
                  }}>
                    {prod.category || 'General'}
                  </span>
                  <button
                    onClick={() => toggleActive(prod)}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: prod.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: prod.is_active ? '#4ade80' : '#f87171',
                    }}
                  >
                    {prod.is_active ? '🟢 Disponible' : '🔴 Agotado'}
                  </button>
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px 0', color: '#f8fafc', wordBreak: 'break-word' }}>
                  {prod.name}
                </h3>

                <div style={{ fontSize: 17, fontWeight: 800, color: '#00CFFF', marginBottom: 8 }}>
                  ${Number(prod.price || 0).toLocaleString('es-CO')} <span style={{ fontSize: 11, color: '#94a3b8' }}>{prod.currency || 'COP'}</span>
                </div>

                {prod.description && (
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {prod.description}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button className="btn btn-ghost" onClick={() => openEditModal(prod)} style={{ flex: 1, fontSize: 12, padding: '6px 0' }}>
                  ✏️ Editar
                </button>
                <button className="btn btn-ghost" onClick={() => handleDelete(prod)} style={{ fontSize: 12, color: '#f87171', padding: '6px 12px' }}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Vista Tabla */
        <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left', minWidth: 500 }}>
              <thead>
                <tr style={{ background: '#080E1F', borderBottom: '1px solid #1E293B', color: '#94a3b8' }}>
                  <th style={{ padding: '12px 16px' }}>Producto / Servicio</th>
                  <th style={{ padding: '12px 16px' }}>Categoría</th>
                  <th style={{ padding: '12px 16px' }}>Precio</th>
                  <th style={{ padding: '12px 16px' }}>Estado</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(prod => (
                  <tr key={prod.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>{prod.name}</div>
                      {prod.description && <div style={{ fontSize: 11, color: '#94a3b8' }}>{prod.description.slice(0, 60)}...</div>}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#00CFFF' }}>{prod.category || 'General'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#f8fafc' }}>
                      ${Number(prod.price || 0).toLocaleString('es-CO')} {prod.currency}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span onClick={() => toggleActive(prod)} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: prod.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: prod.is_active ? '#4ade80' : '#f87171' }}>
                        {prod.is_active ? '🟢 Disponible' : '🔴 Agotado'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button className="btn btn-ghost" onClick={() => openEditModal(prod)} style={{ fontSize: 12, padding: '4px 8px', marginRight: 6 }}>✏️</button>
                      <button className="btn btn-ghost" onClick={() => handleDelete(prod)} style={{ fontSize: 12, color: '#f87171', padding: '4px 8px' }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Formulario (Crear / Editar) */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5,10,24,0.85)', backdropFilter: 'blur(8px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
        }}>
          <div className="card" style={{ background: '#0C1527', borderColor: '#00CFFF', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 20, color: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                {editingProduct ? '✏️ Editar Producto / Servicio' : '➕ Agregar Producto / Servicio'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Nombre del Producto o Servicio *
                </label>
                <input
                  type="text" className="input" placeholder="Ej. Hamburguesa Doble Carne, Limpieza Dental, Asesoría..."
                  value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Categoría</label>
                  <select className="input" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                    {CATEGORIES_PRESETS.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Precio</label>
                  <input
                    type="number" className="input" placeholder="Ej. 25000"
                    value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} step="any"
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Descripción / Detalles para la IA
                </label>
                <textarea
                  className="input" rows={3} placeholder="Ej. Incluye papas y gaseosa. Ingredientes: carne 200g, queso cheddar, tocineta..."
                  value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  URL de Imagen (Opcional)
                </label>
                <input
                  type="url" className="input" placeholder="https://ejemplo.com/foto.jpg"
                  value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
                <input
                  type="checkbox" id="is_active_chk" checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <label htmlFor="is_active_chk" style={{ fontSize: 13, color: '#f8fafc', cursor: 'pointer' }}>
                  Disponible para la venta / atención del bot
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)} style={{ fontSize: 13 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: 13 }}>
                  {saving ? 'Guardando...' : editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
