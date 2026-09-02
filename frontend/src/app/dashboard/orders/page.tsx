'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io as socketIO } from 'socket.io-client';

export type Order = {
  id: string;
  business_id?: string;
  conversation_id?: string;
  client_name: string;
  client_phone: string;
  items: string;
  total_amount: number;
  currency: string;
  shipping_address?: string;
  city?: string;
  payment_method?: string;
  status: 'pending' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

const STATUS_CONFIG: Record<Order['status'], { label: string; bg: string; color: string; dot: string; icon: string }> = {
  pending: { label: 'Pendiente', bg: 'rgba(234, 179, 8, 0.15)', color: '#facc15', dot: '#facc15', icon: '⏳' },
  preparing: { label: 'En Preparación', bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', dot: '#60a5fa', icon: '📦' },
  shipped: { label: 'En Camino', bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', dot: '#c084fc', icon: '🚚' },
  delivered: { label: 'Entregado', bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', dot: '#4ade80', icon: '✅' },
  cancelled: { label: 'Cancelado', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', dot: '#f87171', icon: '❌' },
};

const PAYMENT_METHODS = [
  'Nequi / Daviplata',
  'Pago Contraentrega',
  'Transferencia Bancaria',
  'Tarjeta Débito / Crédito',
  'Efectivo',
  'Otro',
];

export default function OrdersPage() {
  const { user, effectiveUserId } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [business, setBusiness] = useState<any>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [productsList, setProductsList] = useState<{ id: string; name: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Vistas y Filtros
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Formulario
  const [formData, setFormData] = useState({
    client_name: '',
    client_phone: '',
    items: '',
    total_amount: 0,
    currency: 'COP',
    shipping_address: '',
    city: '',
    payment_method: 'Nequi / Daviplata',
    status: 'pending' as Order['status'],
    notes: '',
  });

  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  // 1. Cargar Negocio y Catálogo de Productos
  useEffect(() => {
    const targetId = effectiveUserId || user?.id || 'admin';
    if (!targetId) return;

    fetch(`${BACKEND}/api/business/${targetId}`)
      .then(r => r.json())
      .then(d => {
        if (d.business?.id) {
          setBusiness(d.business);
          setBusinessId(d.business.id);
          loadOrders(d.business.id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));

    fetch(`${BACKEND}/api/products/${targetId}`)
      .then(r => r.json())
      .then(d => {
        if (d.products && Array.isArray(d.products)) {
          setProductsList(d.products.map((p: any) => ({ id: p.id, name: p.name, price: p.price || 0 })));
        }
      })
      .catch(() => {});
  }, [effectiveUserId, user, BACKEND]);

  // 2. Cargar Pedidos
  const loadOrders = async (bId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/orders/${bId}`);
      const data = await res.json();
      if (data.orders && Array.isArray(data.orders)) {
        setOrders(data.orders);
      }
    } catch (e) {
      console.error('Error cargando pedidos:', e);
    } finally {
      setLoading(false);
    }
  };

  // 3. Conectar WebSockets para Tiempo Real (Socket.io)
  useEffect(() => {
    const socket = socketIO(BACKEND, { transports: ['websocket', 'polling'] });

    socket.on('new_order', (newOrd: Order) => {
      if (!newOrd || !newOrd.id) return;
      setOrders(prev => {
        const exists = prev.some(o => o.id === newOrd.id);
        if (exists) return prev;
        return [newOrd, ...prev];
      });
      showToastMsg(`🛍️ ¡Nuevo pedido recibido por WhatsApp de ${newOrd.client_name}!`);
    });

    socket.on('order_updated', (updated: Order) => {
      if (!updated || !updated.id) return;
      setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
    });

    socket.on('order_deleted', ({ id }: { id: string }) => {
      if (!id) return;
      setOrders(prev => prev.filter(o => o.id !== id));
    });

    return () => {
      socket.disconnect();
    };
  }, [BACKEND]);

  // Formateadores
  const formatCurrency = (amount: number, currency = 'COP') => {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: currency || 'COP',
        maximumFractionDigits: 0,
      }).format(amount || 0);
    } catch (_) {
      return `$ ${amount || 0}`;
    }
  };

  const formatDateSpanish = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const dt = new Date(dateStr);
      return dt.toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return dateStr;
    }
  };

  // Abrir Modal para Crear
  const handleOpenCreateModal = () => {
    setFormData({
      client_name: '',
      client_phone: '',
      items: productsList[0]?.name || '',
      total_amount: productsList[0]?.price || 0,
      currency: 'COP',
      shipping_address: '',
      city: '',
      payment_method: 'Nequi / Daviplata',
      status: 'pending',
      notes: '',
    });
    setIsCreateModalOpen(true);
  };

  // Abrir Modal para Editar
  const handleOpenEditModal = (order: Order) => {
    setEditingOrder(order);
    setFormData({
      client_name: order.client_name || '',
      client_phone: order.client_phone || '',
      items: order.items || '',
      total_amount: order.total_amount || 0,
      currency: order.currency || 'COP',
      shipping_address: order.shipping_address || '',
      city: order.city || '',
      payment_method: order.payment_method || 'Nequi / Daviplata',
      status: order.status || 'pending',
      notes: order.notes || '',
    });
    setIsEditModalOpen(true);
  };

  // Guardar Pedido (Crear o Editar)
  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_name.trim()) {
      alert('Ingresa el nombre del cliente');
      return;
    }
    if (!formData.items.trim()) {
      alert('Especifica los productos o ítems del pedido');
      return;
    }

    setSaving(true);
    try {
      const targetId = effectiveUserId || user?.id || 'admin';
      const payload = {
        userId: targetId,
        businessId: businessId || targetId,
        ...formData,
      };

      let res;
      if (editingOrder) {
        res = await fetch(`${BACKEND}/api/orders/${editingOrder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${BACKEND}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success && data.order) {
        const savedOrder = data.order;
        if (editingOrder) {
          setOrders(prev => prev.map(o => o.id === savedOrder.id ? savedOrder : o));
          showToastMsg('✅ Pedido actualizado con éxito');
          setIsEditModalOpen(false);
        } else {
          setOrders(prev => [savedOrder, ...prev]);
          showToastMsg('🎉 Pedido registrado correctamente');
          setIsCreateModalOpen(false);
        }
      } else {
        alert('Error: ' + (data.error || 'No se pudo guardar el pedido'));
      }
    } catch (err: any) {
      alert('Error de conexión: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Cambio rápido de estado
  const handleQuickStatusChange = async (id: string, newStatus: Order['status']) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    try {
      await fetch(`${BACKEND}/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      showToastMsg(`Estado cambiado a ${STATUS_CONFIG[newStatus].label}`);
    } catch (e) {
      console.error('Error actualizando estado:', e);
    }
  };

  // Eliminar Pedido
  const handleDeleteOrder = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar el pedido de "${name}"?`)) return;
    setOrders(prev => prev.filter(o => o.id !== id));
    if (isEditModalOpen) setIsEditModalOpen(false);

    try {
      await fetch(`${BACKEND}/api/orders/${id}`, { method: 'DELETE' });
      showToastMsg('🗑️ Pedido eliminado');
    } catch (_) {}
  };

  // Enviar Notificación de Estado por WhatsApp al Cliente
  const handleSendWhatsAppUpdate = (order: Order) => {
    const cleanPhone = (order.client_phone || '').replace(/[^\d]/g, '');
    if (!cleanPhone) {
      alert('Este pedido no tiene un número de teléfono registrado');
      return;
    }

    const busName = business?.name || 'nuestro equipo';
    const statusLabel = STATUS_CONFIG[order.status]?.label || order.status;
    const formattedTotal = formatCurrency(order.total_amount, order.currency);

    let statusMsg = '';
    if (order.status === 'pending') {
      statusMsg = `tu pedido de *${order.items}* ha sido recibido y está *pendiente de confirmación*. Total: *${formattedTotal}*. En breve te contactaremos para coordinar la entrega.`;
    } else if (order.status === 'preparing') {
      statusMsg = `estamos *preparando y alistando* tu pedido de *${order.items}* 📦✨ Te avisaremos en cuanto salga a despacho.`;
    } else if (order.status === 'shipped') {
      statusMsg = `tu pedido de *${order.items}* ya va *en camino / despachado* 🚚💨 a la dirección: ${order.shipping_address ? `*${order.shipping_address}*` : 'tu ubicación'}. ${order.city ? `(${order.city})` : ''}`;
    } else if (order.status === 'delivered') {
      statusMsg = `tu pedido de *${order.items}* figura como *entregado con éxito* ✅🎉 ¡Esperamos que lo disfrutes mucho! Gracias por tu confianza.`;
    } else {
      statusMsg = `te informamos que el estado de tu pedido de *${order.items}* es: *${statusLabel}*.`;
    }

    const msg = `¡Hola ${order.client_name}! 👋 Te saludamos de *${busName}*.\n\nTe informamos que ${statusMsg}\n\n¿Tienes alguna duda o consulta? ¡Quedamos atentos!`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  };

  // Métricas
  const totalSales = useMemo(() => {
    return orders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  }, [orders]);

  const pendingCount = useMemo(() => orders.filter(o => o.status === 'pending').length, [orders]);
  const preparingCount = useMemo(() => orders.filter(o => o.status === 'preparing').length, [orders]);
  const shippedCount = useMemo(() => orders.filter(o => o.status === 'shipped').length, [orders]);
  const deliveredCount = useMemo(() => orders.filter(o => o.status === 'delivered').length, [orders]);

  // Pedidos filtrados
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        o.client_name.toLowerCase().includes(term) ||
        (o.client_phone && o.client_phone.includes(term)) ||
        (o.items && o.items.toLowerCase().includes(term)) ||
        (o.shipping_address && o.shipping_address.toLowerCase().includes(term)) ||
        (o.city && o.city.toLowerCase().includes(term)) ||
        (o.notes && o.notes.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200, margin: '0 auto', color: '#f8fafc' }}>
      {/* Toast Notificador */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#0F172A', color: '#00CFFF', border: '1px solid #00CFFF',
          borderRadius: 12, padding: '12px 20px', fontSize: 13, fontWeight: 700,
          boxShadow: '0 10px 30px rgba(0,207,255,0.25)',
        }}>
          {toast}
        </div>
      )}

      {/* Header Principal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🛍️</span> Pedidos y Ventas de Clientes
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0 0' }}>
            Gestiona los pedidos de tus productos (relojes, ropa, calzado, comida, etc.). El Bot de WhatsApp toma los datos, crea el pedido y te avisa en tiempo real.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-mobile-full"
            onClick={handleOpenCreateModal}
            style={{ fontSize: 13, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            ➕ Registrar Nuevo Pedido
          </button>
        </div>
      </div>

      {/* Métricas Rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 14 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>📦 Total Pedidos</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc' }}>{orders.length}</div>
        </div>
        <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(234,179,8,0.3)', padding: 14 }}>
          <div style={{ fontSize: 12, color: '#facc15', marginBottom: 4 }}>⏳ Pendientes por Despachar</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#facc15' }}>{pendingCount}</div>
        </div>
        <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(168,85,247,0.3)', padding: 14 }}>
          <div style={{ fontSize: 12, color: '#c084fc', marginBottom: 4 }}>🚚 En Camino / Preparación</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#c084fc' }}>{preparingCount + shippedCount}</div>
        </div>
        <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(34,197,94,0.3)', padding: 14 }}>
          <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 4 }}>💰 Total Ventas ($ COP)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80' }}>{formatCurrency(totalSales)}</div>
        </div>
      </div>

      {/* Barra de Controles y Selector de Vistas */}
      <div className="card filter-bar-responsive" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Switch Vista Tarjetas / Tabla */}
        <div style={{ display: 'flex', gap: 6, background: '#080E1F', padding: 4, borderRadius: 8, border: '1px solid #1E293B' }}>
          <button
            onClick={() => setViewMode('cards')}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: viewMode === 'cards' ? '#00CFFF' : 'transparent',
              color: viewMode === 'cards' ? '#080E1F' : '#94a3b8', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>🗂️</span> Vista Tarjetas
          </button>
          <button
            onClick={() => setViewMode('table')}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: viewMode === 'table' ? '#00CFFF' : 'transparent',
              color: viewMode === 'table' ? '#080E1F' : '#94a3b8', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>📋</span> Vista Lista / Tabla
          </button>
        </div>

        {/* Buscador y Filtro por Estado */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          <input
            type="text"
            className="input"
            placeholder="🔍 Buscar cliente, teléfono, producto, ciudad..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 12, maxWidth: 280 }}
          />
          <select
            className="input"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ fontSize: 12, width: 'auto' }}
          >
            <option value="all">Todos los Estados ({orders.length})</option>
            <option value="pending">⏳ Pendientes ({pendingCount})</option>
            <option value="preparing">📦 En Preparación ({preparingCount})</option>
            <option value="shipped">🚚 En Camino ({shippedCount})</option>
            <option value="delivered">✅ Entregados ({deliveredCount})</option>
            <option value="cancelled">❌ Cancelados</option>
          </select>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto' }} />
          <p style={{ marginTop: 12, color: '#94a3b8', fontSize: 13 }}>Cargando pedidos de tus clientes...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 50, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛍️</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' }}>No hay pedidos para mostrar</h2>
          <p style={{ fontSize: 13, margin: '0 0 20px 0' }}>
            Los pedidos que el bot de WhatsApp concrete o los que crees manualmente aparecerán organizados aquí.
          </p>
          <button className="btn btn-primary" onClick={handleOpenCreateModal} style={{ fontSize: 13 }}>
            ➕ Registrar Primer Pedido
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* VISTA 1: GRID DE TARJETAS / PIPELINE */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filteredOrders.map(order => {
            const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            return (
              <div
                key={order.id}
                className="card"
                style={{
                  background: '#0C1527',
                  borderColor: order.status === 'pending' ? 'rgba(234,179,8,0.4)' : order.status === 'delivered' ? 'rgba(34,197,94,0.3)' : '#1E293B',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  boxShadow: order.status === 'pending' ? '0 4px 20px rgba(234,179,8,0.08)' : 'none',
                }}
              >
                {/* Cabecera Tarjeta: Estado + Fecha */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
                    background: st.bg, color: st.color, display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <span>{st.icon}</span> {st.label}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {formatDateSpanish(order.created_at)}
                  </span>
                </div>

                {/* Info del Cliente */}
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#f8fafc' }}>
                    {order.client_name}
                  </h3>
                  {order.client_phone && (
                    <div style={{ fontSize: 12, color: '#00CFFF', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>📞</span> +{order.client_phone}
                    </div>
                  )}
                </div>

                {/* Detalle de Productos & Total */}
                <div style={{ background: '#080E1F', border: '1px solid #1E293B', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                    📦 Ítems / Productos:
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', whiteSpace: 'pre-line' }}>
                    {order.items}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Total a Pagar:</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#4ade80' }}>
                      {formatCurrency(order.total_amount, order.currency)}
                    </span>
                  </div>
                </div>

                {/* Dirección / Despacho / Pago */}
                {(order.shipping_address || order.city || order.payment_method) && (
                  <div style={{ fontSize: 12, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {order.shipping_address && (
                      <div>📍 <strong>Dirección:</strong> {order.shipping_address} {order.city ? `(${order.city})` : ''}</div>
                    )}
                    {order.payment_method && (
                      <div>💳 <strong>Pago:</strong> {order.payment_method}</div>
                    )}
                    {order.notes && (
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>📝 {order.notes}</div>
                    )}
                  </div>
                )}

                {/* Selector Rápido de Estado */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #1E293B' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>Estado:</span>
                  <select
                    className="input"
                    value={order.status}
                    onChange={e => handleQuickStatusChange(order.id, e.target.value as Order['status'])}
                    style={{ fontSize: 11, padding: '4px 8px', height: 'auto', flex: 1 }}
                  >
                    <option value="pending">⏳ Pendiente</option>
                    <option value="preparing">📦 En Preparación</option>
                    <option value="shipped">🚚 En Camino / Despachado</option>
                    <option value="delivered">✅ Entregado / Pagado</option>
                    <option value="cancelled">❌ Cancelado</option>
                  </select>
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={() => handleSendWhatsAppUpdate(order)}
                    className="btn btn-ghost"
                    style={{ fontSize: 11, color: '#4ade80', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Notificar estado por WhatsApp al cliente"
                  >
                    <span>📲</span> Actualizar por WhatsApp
                  </button>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleOpenEditModal(order)}
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '6px 10px' }}
                      title="Editar Pedido"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDeleteOrder(order.id, order.client_name)}
                      className="btn btn-ghost"
                      style={{ fontSize: 11, color: '#f87171', padding: '6px 8px' }}
                      title="Eliminar"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VISTA 2: TABLA DETALLADA */
        <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left', minWidth: 750 }}>
              <thead>
                <tr style={{ background: '#080E1F', borderBottom: '1px solid #1E293B', color: '#94a3b8' }}>
                  <th style={{ padding: '12px 16px' }}>Cliente</th>
                  <th style={{ padding: '12px 16px' }}>Productos / Ítems</th>
                  <th style={{ padding: '12px 16px' }}>Total</th>
                  <th style={{ padding: '12px 16px' }}>Destino / Ciudad</th>
                  <th style={{ padding: '12px 16px' }}>Método Pago</th>
                  <th style={{ padding: '12px 16px' }}>Estado</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr key={order.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>{order.client_name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>+{order.client_phone}</div>
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: 240 }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {order.items}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{formatDateSpanish(order.created_at)}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#4ade80' }}>
                      {formatCurrency(order.total_amount, order.currency)}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#cbd5e1', fontSize: 12 }}>
                      {order.shipping_address || order.city ? (
                        <>
                          <div>{order.shipping_address || '—'}</div>
                          {order.city && <div style={{ fontSize: 11, color: '#94a3b8' }}>{order.city}</div>}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#cbd5e1' }}>
                      {order.payment_method || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <select
                        className="input"
                        value={order.status}
                        onChange={e => handleQuickStatusChange(order.id, e.target.value as Order['status'])}
                        style={{ fontSize: 11, padding: '2px 6px', height: 'auto', background: STATUS_CONFIG[order.status]?.bg, color: STATUS_CONFIG[order.status]?.color, border: 'none' }}
                      >
                        <option value="pending">⏳ Pendiente</option>
                        <option value="preparing">📦 En Prep.</option>
                        <option value="shipped">🚚 En Camino</option>
                        <option value="delivered">✅ Entregado</option>
                        <option value="cancelled">❌ Cancelado</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleSendWhatsAppUpdate(order)}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '4px 8px', color: '#4ade80' }}
                          title="Enviar estado por WhatsApp"
                        >
                          📲
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(order)}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteOrder(order.id, order.client_name)}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, color: '#f87171', padding: '4px 8px' }}
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL CREAR PEDIDO */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5,10,24,0.85)', backdropFilter: 'blur(8px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
        }}>
          <div className="card" style={{ background: '#0C1527', borderColor: '#00CFFF', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 20, color: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>➕</span> Registrar Nuevo Pedido
              </h2>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSaveOrder} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Nombre del Cliente *
                </label>
                <input
                  type="text" className="input" placeholder="Ej. Camila Restrepo"
                  value={formData.client_name} onChange={e => setFormData({ ...formData, client_name: e.target.value })} required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Teléfono de WhatsApp (con código de país) *
                </label>
                <input
                  type="tel" className="input" placeholder="Ej. 573001234567"
                  value={formData.client_phone} onChange={e => setFormData({ ...formData, client_phone: e.target.value })} required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Productos / Ítems Ordenados *
                </label>
                <textarea
                  className="input" rows={2} placeholder="Ej. Reloj Cronógrafo Dorado (1x), Pulsera de Cuero (1x)..."
                  value={formData.items} onChange={e => setFormData({ ...formData, items: e.target.value })} required
                />
                {productsList.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Sugerencias:</span>
                    {productsList.slice(0, 4).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          const current = formData.items ? `${formData.items}, ${p.name} (1x)` : `${p.name} (1x)`;
                          setFormData({
                            ...formData,
                            items: current,
                            total_amount: (formData.total_amount || 0) + (p.price || 0),
                          });
                        }}
                        style={{ fontSize: 10, background: '#1E293B', color: '#00CFFF', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}
                      >
                        + {p.name} (${p.price?.toLocaleString()})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Monto Total ($ COP)
                  </label>
                  <input
                    type="number" className="input" placeholder="Ej. 180000"
                    value={formData.total_amount || ''} onChange={e => setFormData({ ...formData, total_amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Método de Pago
                  </label>
                  <select
                    className="input"
                    value={formData.payment_method}
                    onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                  >
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Dirección de Entrega
                  </label>
                  <input
                    type="text" className="input" placeholder="Ej. Carrera 15 # 85-30 Apto 402"
                    value={formData.shipping_address} onChange={e => setFormData({ ...formData, shipping_address: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Ciudad / Municipio
                  </label>
                  <input
                    type="text" className="input" placeholder="Ej. Bogotá, Medellín..."
                    value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Estado Inicial
                </label>
                <select
                  className="input"
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as Order['status'] })}
                >
                  <option value="pending">⏳ Pendiente</option>
                  <option value="preparing">📦 En Preparación</option>
                  <option value="shipped">🚚 En Camino</option>
                  <option value="delivered">✅ Entregado</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Notas / Observaciones
                </label>
                <textarea
                  className="input" rows={2} placeholder="Ej. Dejar en portería, cliente paga contraentrega en efectivo..."
                  value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="action-buttons-row" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsCreateModalOpen(false)} style={{ fontSize: 13 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: 13 }}>
                  {saving ? 'Guardando...' : 'Registrar Pedido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR PEDIDO */}
      {isEditModalOpen && editingOrder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5,10,24,0.85)', backdropFilter: 'blur(8px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
        }}>
          <div className="card" style={{ background: '#0C1527', borderColor: '#00CFFF', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 20, color: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✏️</span> Editar Pedido
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSaveOrder} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Nombre del Cliente *
                </label>
                <input
                  type="text" className="input"
                  value={formData.client_name} onChange={e => setFormData({ ...formData, client_name: e.target.value })} required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Teléfono de WhatsApp
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="tel" className="input" style={{ flex: 1 }}
                    value={formData.client_phone} onChange={e => setFormData({ ...formData, client_phone: e.target.value })}
                  />
                  {formData.client_phone && (
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppUpdate(editingOrder)}
                      className="btn btn-ghost"
                      style={{ fontSize: 12, color: '#4ade80', whiteSpace: 'nowrap' }}
                    >
                      📲 Enviar WA
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Productos / Ítems *
                </label>
                <textarea
                  className="input" rows={2}
                  value={formData.items} onChange={e => setFormData({ ...formData, items: e.target.value })} required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Monto Total ($ COP)
                  </label>
                  <input
                    type="number" className="input"
                    value={formData.total_amount || ''} onChange={e => setFormData({ ...formData, total_amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Método de Pago
                  </label>
                  <select
                    className="input"
                    value={formData.payment_method}
                    onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                  >
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Dirección de Entrega
                  </label>
                  <input
                    type="text" className="input"
                    value={formData.shipping_address} onChange={e => setFormData({ ...formData, shipping_address: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Ciudad / Municipio
                  </label>
                  <input
                    type="text" className="input"
                    value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Estado del Pedido
                </label>
                <select
                  className="input"
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as Order['status'] })}
                >
                  <option value="pending">⏳ Pendiente</option>
                  <option value="preparing">📦 En Preparación</option>
                  <option value="shipped">🚚 En Camino / Despachado</option>
                  <option value="delivered">✅ Entregado / Pagado</option>
                  <option value="cancelled">❌ Cancelado</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Notas / Observaciones
                </label>
                <textarea
                  className="input" rows={2}
                  value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="action-buttons-row" style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => handleDeleteOrder(editingOrder.id, editingOrder.client_name)}
                  className="btn btn-ghost"
                  style={{ color: '#f87171', fontSize: 12 }}
                >
                  🗑️ Eliminar Pedido
                </button>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setIsEditModalOpen(false)} style={{ fontSize: 13 }}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: 13 }}>
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}