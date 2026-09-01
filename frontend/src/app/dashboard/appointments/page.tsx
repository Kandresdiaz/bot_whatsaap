'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io as socketIO } from 'socket.io-client';

type Appointment = {
  id: string;
  business_id?: string;
  conversation_id?: string;
  client_name: string;
  client_phone: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  created_at?: string;
};

const STATUS_CONFIG: Record<Appointment['status'], { label: string; bg: string; color: string; dot: string; icon: string }> = {
  pending: { label: 'Pendiente', bg: 'rgba(234, 179, 8, 0.15)', color: '#facc15', dot: '#facc15', icon: '⏳' },
  confirmed: { label: 'Confirmada', bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', dot: '#4ade80', icon: '✅' },
  completed: { label: 'Completada', bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', dot: '#c084fc', icon: '🎉' },
  cancelled: { label: 'Cancelada', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', dot: '#f87171', icon: '❌' },
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const TIME_PRESETS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'
];

export default function AppointmentsPage() {
  const { user, effectiveUserId } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [business, setBusiness] = useState<any>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [servicesList, setServicesList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Vistas y Navegación del Calendario
  const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Formulario
  const [formData, setFormData] = useState({
    client_name: '',
    client_phone: '',
    service: '',
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: '10:00',
    status: 'confirmed' as Appointment['status'],
    notes: '',
  });

  const BACKEND = 'https://bot-whatsaap-tkjd.onrender.com';

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Cargar Negocio y Catálogo de Servicios
  useEffect(() => {
    const targetId = effectiveUserId || user?.id || 'admin';
    if (!targetId) return;

    fetch(`${BACKEND}/api/business/${targetId}`)
      .then(r => r.json())
      .then(d => {
        if (d.business?.id) {
          setBusiness(d.business);
          setBusinessId(d.business.id);
          loadAppointments(d.business.id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));

    // Cargar nombres de servicios para sugerencias
    fetch(`${BACKEND}/api/products/${targetId}`)
      .then(r => r.json())
      .then(d => {
        if (d.products && Array.isArray(d.products)) {
          const names = d.products.map((p: any) => p.name).filter(Boolean);
          setServicesList(names);
        }
      })
      .catch(() => {});
  }, [effectiveUserId, user, BACKEND]);

  // 2. Cargar Citas
  const loadAppointments = async (bId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/appointments/${bId}`);
      const data = await res.json();
      if (data.appointments && Array.isArray(data.appointments)) {
        setAppointments(data.appointments);
      }
    } catch (e) {
      console.error('Error cargando citas:', e);
    } finally {
      setLoading(false);
    }
  };

  // 3. Conectar WebSockets para Tiempo Real (Socket.io)
  useEffect(() => {
    const socket = socketIO(BACKEND, { transports: ['websocket', 'polling'] });

    socket.on('new_appointment', (newAppt: Appointment) => {
      if (!newAppt || !newAppt.id) return;
      setAppointments(prev => {
        const exists = prev.some(a => a.id === newAppt.id);
        if (exists) return prev;
        return [...prev, newAppt].sort((a, b) => (a.appointment_date + a.appointment_time).localeCompare(b.appointment_date + b.appointment_time));
      });
      showToastMsg(`🔔 ¡Nueva cita agendada por WhatsApp para ${newAppt.client_name}!`);
    });

    socket.on('appointment_updated', (updated: Appointment) => {
      if (!updated || !updated.id) return;
      setAppointments(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
    });

    socket.on('appointment_deleted', ({ id }: { id: string }) => {
      if (!id) return;
      setAppointments(prev => prev.filter(a => a.id !== id));
    });

    return () => {
      socket.disconnect();
    };
  }, [BACKEND]);

  // Funciones de navegación de meses
  const prevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };
  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now.toISOString().split('T')[0]);
  };

  // Formateadores
  const formatDateSpanish = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const [y, m, d] = dateStr.split('-');
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
      return dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) {
      return dateStr;
    }
  };

  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const [y, m, d] = dateStr.split('-');
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
      return dt.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (_) {
      return dateStr;
    }
  };

  const formatTime12h = (timeStr: string) => {
    if (!timeStr) return '—';
    const parts = timeStr.split(':');
    const h = parseInt(parts[0]);
    const m = parts[1] || '00';
    if (isNaN(h)) return timeStr;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${period}`;
  };

  // Abrir Modal para Crear
  const handleOpenCreateModal = (prefillDate?: string) => {
    setFormData({
      client_name: '',
      client_phone: '',
      service: servicesList[0] || 'Servicio General',
      appointment_date: prefillDate || selectedDate || new Date().toISOString().split('T')[0],
      appointment_time: '10:00',
      status: 'confirmed',
      notes: '',
    });
    setIsCreateModalOpen(true);
  };

  // Abrir Modal para Editar
  const handleOpenEditModal = (appt: Appointment) => {
    setEditingAppt(appt);
    setFormData({
      client_name: appt.client_name || '',
      client_phone: appt.client_phone || '',
      service: appt.service || 'Servicio General',
      appointment_date: appt.appointment_date || new Date().toISOString().split('T')[0],
      appointment_time: (appt.appointment_time || '10:00:00').slice(0, 5),
      status: appt.status || 'confirmed',
      notes: appt.notes || '',
    });
    setIsEditModalOpen(true);
  };

  // Guardar Cita (Crear o Editar)
  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_name.trim()) {
      alert('Ingresa el nombre del cliente');
      return;
    }
    if (!formData.appointment_date || !formData.appointment_time) {
      alert('Selecciona fecha y hora para la cita');
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
      if (editingAppt) {
        res = await fetch(`${BACKEND}/api/appointments/${editingAppt.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${BACKEND}/api/appointments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success && data.appointment) {
        const savedAppt = data.appointment;
        if (editingAppt) {
          setAppointments(prev => prev.map(a => a.id === savedAppt.id ? savedAppt : a));
          showToastMsg('✅ Cita actualizada con éxito');
          setIsEditModalOpen(false);
        } else {
          setAppointments(prev => [...prev, savedAppt]);
          showToastMsg('🎉 Cita agendada correctamente');
          setIsCreateModalOpen(false);
          setSelectedDate(savedAppt.appointment_date);
        }
      } else {
        alert('Error: ' + (data.error || 'No se pudo guardar la cita'));
      }
    } catch (err: any) {
      alert('Error de conexión: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Cambio rápido de estado
  const handleQuickStatusChange = async (id: string, newStatus: Appointment['status']) => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    try {
      await fetch(`${BACKEND}/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      showToastMsg(`Estado cambiado a ${STATUS_CONFIG[newStatus].label}`);
    } catch (e) {
      console.error('Error actualizando estado:', e);
    }
  };

  // Eliminar Cita
  const handleDeleteAppointment = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar la cita de "${name}"?`)) return;
    setAppointments(prev => prev.filter(a => a.id !== id));
    if (isEditModalOpen) setIsEditModalOpen(false);

    try {
      await fetch(`${BACKEND}/api/appointments/${id}`, { method: 'DELETE' });
      showToastMsg('🗑️ Cita eliminada');
    } catch (_) {}
  };

  // Enviar Mensaje de WhatsApp Directo
  const handleSendWhatsAppReminder = (appt: Appointment) => {
    const cleanPhone = (appt.client_phone || '').replace(/[^\d]/g, '');
    if (!cleanPhone) {
      alert('Esta cita no tiene un número de teléfono registrado');
      return;
    }

    const busName = business?.name || 'nuestro equipo';
    const dateFormatted = formatShortDate(appt.appointment_date);
    const timeFormatted = formatTime12h(appt.appointment_time);
    const msg = `¡Hola ${appt.client_name}! 👋 Te saludamos de *${busName}*. Te recordamos tu cita para *${appt.service || 'tu atención'}* programada para el día *${dateFormatted}* a las *${timeFormatted}* 📅✨ ¿Nos confirmas tu asistencia? ¡Te esperamos!`;

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  };

  // Métricas
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayAppts = useMemo(() => appointments.filter(a => a.appointment_date === todayStr && a.status !== 'cancelled'), [appointments, todayStr]);
  const pendingCount = useMemo(() => appointments.filter(a => a.status === 'pending').length, [appointments]);
  const confirmedCount = useMemo(() => appointments.filter(a => a.status === 'confirmed').length, [appointments]);
  const completedCount = useMemo(() => appointments.filter(a => a.status === 'completed').length, [appointments]);

  // Citas agrupadas por fecha (para pintar en el calendario)
  const apptsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments.forEach(a => {
      if (!a.appointment_date) return;
      if (!map[a.appointment_date]) map[a.appointment_date] = [];
      map[a.appointment_date].push(a);
    });
    return map;
  }, [appointments]);

  // Citas del día seleccionado
  const selectedDayAppointments = useMemo(() => {
    const dayAppts = apptsByDate[selectedDate] || [];
    return [...dayAppts].sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''));
  }, [apptsByDate, selectedDate]);

  // Citas filtradas para la vista Tabla
  const filteredAppointments = useMemo(() => {
    return appointments.filter(a => {
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        a.client_name.toLowerCase().includes(term) ||
        (a.client_phone && a.client_phone.includes(term)) ||
        (a.service && a.service.toLowerCase().includes(term)) ||
        (a.notes && a.notes.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [appointments, statusFilter, search]);

  // Días del mes para construir la cuadrícula
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Dom, 1 = Lun, ...
    const shift = (firstDayIndex + 6) % 7; // Convertir a Lunes = 0

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: { dateStr: string; dayNumber: number; isCurrentMonth: boolean }[] = [];

    // Días del mes anterior
    for (let i = shift - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const mStr = String(month === 0 ? 12 : month).padStart(2, '0');
      const yStr = month === 0 ? year - 1 : year;
      cells.push({
        dateStr: `${yStr}-${mStr}-${String(d).padStart(2, '0')}`,
        dayNumber: d,
        isCurrentMonth: false,
      });
    }

    // Días del mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      cells.push({
        dateStr: `${year}-${mStr}-${String(d).padStart(2, '0')}`,
        dayNumber: d,
        isCurrentMonth: true,
      });
    }

    // Días del mes siguiente para completar múltiplos de 7
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const mStr = String(month === 11 ? 1 : month + 2).padStart(2, '0');
      const yStr = month === 11 ? year + 1 : year;
      cells.push({
        dateStr: `${yStr}-${mStr}-${String(d).padStart(2, '0')}`,
        dayNumber: d,
        isCurrentMonth: false,
      });
    }

    return cells;
  }, [currentMonth]);

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
            <span>📅</span> Calendario y Citas del Negocio
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0 0' }}>
            Gestiona la agenda y citas de tus clientes. El Bot de WhatsApp consulta este calendario y agenda automáticamente cuando los clientes lo solicitan.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-mobile-full"
            onClick={() => handleOpenCreateModal()}
            style={{ fontSize: 13, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            ➕ Agendar Nueva Cita
          </button>
        </div>
      </div>

      {/* Métricas Rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 14 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Total Citas Registradas</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc' }}>{appointments.length}</div>
        </div>
        <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(0,207,255,0.3)', padding: 14 }}>
          <div style={{ fontSize: 12, color: '#00CFFF', marginBottom: 4 }}>🗓️ Citas para Hoy</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#00CFFF' }}>{todayAppts.length}</div>
        </div>
        <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(234,179,8,0.3)', padding: 14 }}>
          <div style={{ fontSize: 12, color: '#facc15', marginBottom: 4 }}>⏳ Pendientes por Confirmar</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#facc15' }}>{pendingCount}</div>
        </div>
        <div className="card" style={{ background: '#0C1527', borderColor: 'rgba(34,197,94,0.3)', padding: 14 }}>
          <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 4 }}>✅ Confirmadas</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#4ade80' }}>{confirmedCount}</div>
        </div>
      </div>

      {/* Barra de Controles y Selector de Vistas */}
      <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Switch Vista Calendario / Tabla */}
        <div style={{ display: 'flex', gap: 6, background: '#080E1F', padding: 4, borderRadius: 8, border: '1px solid #1E293B' }}>
          <button
            onClick={() => setViewMode('calendar')}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: viewMode === 'calendar' ? '#00CFFF' : 'transparent',
              color: viewMode === 'calendar' ? '#080E1F' : '#94a3b8', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>🗓️</span> Vista Calendario
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

        {/* Navegación de Meses si está en Vista Calendario */}
        {viewMode === 'calendar' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-ghost" onClick={prevMonth} style={{ padding: '6px 12px', fontSize: 13 }}>
              ‹ Mes Anterior
            </button>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#00CFFF', minWidth: 160, textAlign: 'center' }}>
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </div>
            <button className="btn btn-ghost" onClick={nextMonth} style={{ padding: '6px 12px', fontSize: 13 }}>
              Mes Siguiente ›
            </button>
            <button className="btn btn-ghost" onClick={goToToday} style={{ padding: '6px 12px', fontSize: 12, color: '#4ade80' }}>
              🎯 Hoy
            </button>
          </div>
        ) : (
          /* Filtro y Búsqueda si está en Vista Tabla */
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
            <input
              type="text"
              className="input"
              placeholder="🔍 Buscar cliente, teléfono, servicio..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 12, maxWidth: 260 }}
            />
            <select
              className="input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ fontSize: 12, width: 'auto' }}
            >
              <option value="all">Todos los Estados</option>
              <option value="pending">⏳ Pendientes</option>
              <option value="confirmed">✅ Confirmadas</option>
              <option value="completed">🎉 Completadas</option>
              <option value="cancelled">❌ Canceladas</option>
            </select>
          </div>
        )}
      </div>

      {/* VISTA 1: CALENDARIO MENSUAL + AGENDA DEL DÍA */}
      {viewMode === 'calendar' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* Cuadrícula del Calendario (Izquierda / Principal) */}
          <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 16, flex: '2 1 500px' }}>
            {/* Cabecera de días de la semana */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8, textAlign: 'center' }}>
              {DAYS_SHORT.map(d => (
                <div key={d} style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', padding: '6px 0' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Días del Calendario */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {calendarDays.map(cell => {
                const dayAppts = apptsByDate[cell.dateStr] || [];
                const isSelected = cell.dateStr === selectedDate;
                const isToday = cell.dateStr === todayStr;

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => setSelectedDate(cell.dateStr)}
                    style={{
                      aspectRatio: '1',
                      minHeight: 64,
                      background: isSelected
                        ? 'rgba(0, 207, 255, 0.12)'
                        : isToday
                        ? 'rgba(34, 197, 94, 0.08)'
                        : cell.isCurrentMonth
                        ? '#080E1F'
                        : 'rgba(8, 14, 31, 0.4)',
                      border: isSelected
                        ? '2px solid #00CFFF'
                        : isToday
                        ? '1px solid #4ade80'
                        : '1px solid #1E293B',
                      borderRadius: 10,
                      padding: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      opacity: cell.isCurrentMonth ? 1 : 0.4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Número de día + badge Hoy */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: isSelected || isToday ? 800 : 600,
                        color: isSelected ? '#00CFFF' : isToday ? '#4ade80' : '#f8fafc',
                      }}>
                        {cell.dayNumber}
                      </span>
                      {isToday && (
                        <span style={{ fontSize: 9, background: '#4ade80', color: '#080E1F', fontWeight: 800, padding: '1px 4px', borderRadius: 4 }}>
                          HOY
                        </span>
                      )}
                    </div>

                    {/* Indicadores de Citas */}
                    {dayAppts.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                        <div style={{
                          fontSize: 10,
                          fontWeight: 700,
                          background: 'rgba(0, 207, 255, 0.18)',
                          color: '#00CFFF',
                          borderRadius: 4,
                          padding: '2px 4px',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          📅 {dayAppts.length} {dayAppts.length === 1 ? 'cita' : 'citas'}
                        </div>
                        {/* Puntos de estado */}
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 2 }}>
                          {dayAppts.slice(0, 4).map(a => (
                            <span
                              key={a.id}
                              style={{
                                width: 5, height: 5, borderRadius: '50%',
                                background: STATUS_CONFIG[a.status]?.dot || '#00CFFF',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agenda del Día Seleccionado (Derecha) */}
          <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #1E293B', paddingBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#00CFFF', textTransform: 'uppercase' }}>
                  🗓️ Agenda del Día
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: '2px 0 0 0', color: '#f8fafc' }}>
                  {formatDateSpanish(selectedDate)}
                </h2>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => handleOpenCreateModal(selectedDate)}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                ➕ Cita aquí
              </button>
            </div>

            {/* Lista de citas de este día */}
            {selectedDayAppointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>☕</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#f8fafc', marginBottom: 4 }}>No hay citas agendadas</div>
                <p style={{ fontSize: 12, margin: '0 0 16px 0' }}>
                  Este día está libre. Puedes agendar una cita manualmente o dejar que el bot la programe por WhatsApp.
                </p>
                <button
                  className="btn btn-ghost"
                  onClick={() => handleOpenCreateModal(selectedDate)}
                  style={{ fontSize: 12 }}
                >
                  ➕ Agendar Cita en esta Fecha
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto' }}>
                {selectedDayAppointments.map(a => (
                  <div
                    key={a.id}
                    style={{
                      background: '#080E1F',
                      border: `1px solid ${a.status === 'confirmed' ? 'rgba(34,197,94,0.3)' : a.status === 'pending' ? 'rgba(234,179,8,0.3)' : '#1E293B'}`,
                      borderRadius: 12,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#00CFFF', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>🕐</span> {formatTime12h(a.appointment_time)}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', marginTop: 2 }}>
                          {a.client_name}
                        </div>
                        {a.client_phone && (
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            📞 +{a.client_phone}
                          </div>
                        )}
                      </div>

                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                        background: STATUS_CONFIG[a.status]?.bg, color: STATUS_CONFIG[a.status]?.color,
                      }}>
                        {STATUS_CONFIG[a.status]?.icon} {STATUS_CONFIG[a.status]?.label}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6, color: '#cbd5e1' }}>
                      📋 <strong>Servicio:</strong> {a.service || 'Servicio General'}
                      {a.notes && <div style={{ marginTop: 2, color: '#94a3b8' }}>📝 {a.notes}</div>}
                    </div>

                    {/* Acciones Rápidas */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #1E293B', paddingTop: 8 }}>
                      <button
                        onClick={() => handleSendWhatsAppReminder(a)}
                        className="btn btn-ghost"
                        style={{ fontSize: 11, color: '#4ade80', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                        title="Enviar recordatorio por WhatsApp"
                      >
                        <span>📲</span> WhatsApp
                      </button>

                      <div style={{ display: 'flex', gap: 6 }}>
                        {a.status === 'pending' && (
                          <button
                            onClick={() => handleQuickStatusChange(a.id, 'confirmed')}
                            className="btn btn-ghost"
                            style={{ fontSize: 11, color: '#4ade80', padding: '4px 8px' }}
                          >
                            ✅ Confirmar
                          </button>
                        )}
                        {a.status === 'confirmed' && (
                          <button
                            onClick={() => handleQuickStatusChange(a.id, 'completed')}
                            className="btn btn-ghost"
                            style={{ fontSize: 11, color: '#c084fc', padding: '4px 8px' }}
                          >
                            🎉 Completar
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(a)}
                          className="btn btn-ghost"
                          style={{ fontSize: 11, padding: '4px 8px' }}
                        >
                          ✏️ Editar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VISTA 2: TABLA COMPLETA */
        <div className="card" style={{ background: '#0C1527', borderColor: '#1E293B', padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
              <p>No se encontraron citas con los filtros seleccionados.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left', minWidth: 650 }}>
                <thead>
                  <tr style={{ background: '#080E1F', borderBottom: '1px solid #1E293B', color: '#94a3b8' }}>
                    <th style={{ padding: '12px 16px' }}>Cliente</th>
                    <th style={{ padding: '12px 16px' }}>Servicio</th>
                    <th style={{ padding: '12px 16px' }}>Fecha</th>
                    <th style={{ padding: '12px 16px' }}>Hora</th>
                    <th style={{ padding: '12px 16px' }}>Estado</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#f8fafc' }}>{a.client_name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>+{a.client_phone}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>{a.service || '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#f8fafc' }}>{formatShortDate(a.appointment_date)}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#00CFFF' }}>{formatTime12h(a.appointment_time)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                          background: STATUS_CONFIG[a.status]?.bg, color: STATUS_CONFIG[a.status]?.color,
                        }}>
                          {STATUS_CONFIG[a.status]?.icon} {STATUS_CONFIG[a.status]?.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleSendWhatsAppReminder(a)}
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: '4px 8px', color: '#4ade80' }}
                            title="WhatsApp"
                          >
                            📲
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(a)}
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: '4px 8px' }}
                            title="Editar Cita"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteAppointment(a.id, a.client_name)}
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
          )}
        </div>
      )}

      {/* MODAL CREAR CITA */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5,10,24,0.85)', backdropFilter: 'blur(8px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
        }}>
          <div className="card" style={{ background: '#0C1527', borderColor: '#00CFFF', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: 20, color: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>➕</span> Agendar Nueva Cita
              </h2>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSaveAppointment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Nombre del Cliente *
                </label>
                <input
                  type="text" className="input" placeholder="Ej. Juan Pérez"
                  value={formData.client_name} onChange={e => setFormData({ ...formData, client_name: e.target.value })} required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Teléfono de WhatsApp (con código de país)
                </label>
                <input
                  type="tel" className="input" placeholder="Ej. 573001234567"
                  value={formData.client_phone} onChange={e => setFormData({ ...formData, client_phone: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Servicio o Motivo de la Cita
                </label>
                <input
                  type="text" className="input" list="services-suggestions" placeholder="Ej. Limpieza Facial, Corte de Cabello, Asesoría..."
                  value={formData.service} onChange={e => setFormData({ ...formData, service: e.target.value })}
                />
                <datalist id="services-suggestions">
                  {servicesList.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Fecha de la Cita *
                  </label>
                  <input
                    type="date" className="input"
                    value={formData.appointment_date} onChange={e => setFormData({ ...formData, appointment_date: e.target.value })} required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Hora *
                  </label>
                  <input
                    type="time" className="input"
                    value={formData.appointment_time} onChange={e => setFormData({ ...formData, appointment_time: e.target.value })} required
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
                  onChange={e => setFormData({ ...formData, status: e.target.value as Appointment['status'] })}
                >
                  <option value="confirmed">✅ Confirmada</option>
                  <option value="pending">⏳ Pendiente</option>
                  <option value="completed">🎉 Completada</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Notas / Observaciones
                </label>
                <textarea
                  className="input" rows={2} placeholder="Ej. Cliente solicitó atención con especialista..."
                  value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsCreateModalOpen(false)} style={{ fontSize: 13 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: 13 }}>
                  {saving ? 'Guardando...' : 'Agendar Cita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR / REPROGRAMAR CITA */}
      {isEditModalOpen && editingAppt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5,10,24,0.85)', backdropFilter: 'blur(8px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
        }}>
          <div className="card" style={{ background: '#0C1527', borderColor: '#00CFFF', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: 20, color: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✏️</span> Editar / Reprogramar Cita
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSaveAppointment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                      onClick={() => handleSendWhatsAppReminder(editingAppt)}
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
                  Servicio
                </label>
                <input
                  type="text" className="input" list="services-suggestions-edit"
                  value={formData.service} onChange={e => setFormData({ ...formData, service: e.target.value })}
                />
                <datalist id="services-suggestions-edit">
                  {servicesList.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Fecha
                  </label>
                  <input
                    type="date" className="input"
                    value={formData.appointment_date} onChange={e => setFormData({ ...formData, appointment_date: e.target.value })} required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Hora
                  </label>
                  <input
                    type="time" className="input"
                    value={formData.appointment_time} onChange={e => setFormData({ ...formData, appointment_time: e.target.value })} required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Estado de la Cita
                </label>
                <select
                  className="input"
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as Appointment['status'] })}
                >
                  <option value="confirmed">✅ Confirmada</option>
                  <option value="pending">⏳ Pendiente</option>
                  <option value="completed">🎉 Completada</option>
                  <option value="cancelled">❌ Cancelada</option>
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

              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => handleDeleteAppointment(editingAppt.id, editingAppt.client_name)}
                  className="btn btn-ghost"
                  style={{ color: '#f87171', fontSize: 12 }}
                >
                  🗑️ Eliminar Cita
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
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
