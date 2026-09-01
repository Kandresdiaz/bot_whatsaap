const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase');

// Helper para resolver el business_id real a partir del user_id o business_id
const resolveBusinessId = async (idOrUserId) => {
  if (!idOrUserId) return null;
  const isUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  try {
    if (idOrUserId === 'admin' || !isUuid(idOrUserId)) {
      const { data: firstBus } = await supabase.from('businesses').select('id').order('created_at', { ascending: true }).limit(1);
      if (firstBus && firstBus[0]?.id) return firstBus[0].id;
      return '00000000-0000-0000-0000-000000000001';
    }

    const { data: bById } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', idOrUserId)
      .limit(1);

    if (bById && bById[0]?.id) return bById[0].id;

    const { data: bByUser } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', idOrUserId)
      .limit(1);

    if (bByUser && bByUser[0]?.id) return bByUser[0].id;

    const { data: fallback } = await supabase.from('businesses').select('id').limit(1);
    if (fallback && fallback[0]?.id) return fallback[0].id;
  } catch (e) {
    console.error('[Appointments] Error resolviendo businessId:', e.message);
  }
  return '00000000-0000-0000-0000-000000000001';
};

// ─── 1. Listar citas de un negocio ───────────────────────────────────────────
router.get('/:businessId', async (req, res) => {
  try {
    const { businessId: rawId } = req.params;
    const { status, date, month, start_date, end_date } = req.query;

    const businessId = await resolveBusinessId(rawId);

    let query = supabase
      .from('appointments')
      .select('*')
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });

    if (businessId && businessId !== '00000000-0000-0000-0000-000000000001') {
      query = query.eq('business_id', businessId);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (date) {
      query = query.eq('appointment_date', date);
    } else if (month) {
      const nextMonthDate = new Date(`${month}-01T00:00:00Z`);
      nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
      const nextMonthStr = nextMonthDate.toISOString().slice(0, 7);

      query = query
        .gte('appointment_date', `${month}-01`)
        .lt('appointment_date', `${nextMonthStr}-01`);
    } else if (start_date && end_date) {
      query = query
        .gte('appointment_date', start_date)
        .lte('appointment_date', end_date);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('[GET Appointments Error]:', error.message);
      return res.json({ success: true, appointments: [] });
    }

    return res.json({ success: true, appointments: data || [] });
  } catch (err) {
    console.error('[GET Appointments Crash Safe]:', err.message);
    return res.json({ success: true, appointments: [] });
  }
});

// ─── 2. Consultar disponibilidad para un día específico ───────────────────────
router.get('/availability/:businessId', async (req, res) => {
  try {
    const { businessId: rawId } = req.params;
    const { date, duration = 30 } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, error: 'Fecha (YYYY-MM-DD) es requerida' });
    }

    const businessId = await resolveBusinessId(rawId);

    let business = null;
    if (businessId) {
      const { data } = await supabase.from('businesses').select('*').eq('id', businessId).limit(1);
      business = data && data[0];
    }

    const activeDays = business?.active_days || [1, 2, 3, 4, 5, 6];
    const startTimeStr = business?.active_hours_start || '08:00';
    const endTimeStr = business?.active_hours_end || '18:00';

    const checkDate = new Date(`${date}T12:00:00Z`);
    const dayOfWeek = checkDate.getUTCDay();

    const isDayActive = Array.isArray(activeDays) ? activeDays.includes(dayOfWeek) : true;
    if (!isDayActive) {
      return res.json({
        success: true,
        is_open: false,
        message: 'El negocio no atiende en este día de la semana',
        slots: []
      });
    }

    let apptsQuery = supabase
      .from('appointments')
      .select('appointment_time, status, service, client_name')
      .eq('appointment_date', date)
      .neq('status', 'cancelled');

    if (businessId && businessId !== '00000000-0000-0000-0000-000000000001') {
      apptsQuery = apptsQuery.eq('business_id', businessId);
    }

    const { data: existingAppts } = await apptsQuery;
    const bookedTimes = new Set((existingAppts || []).map(a => a.appointment_time?.slice(0, 5)));

    const startHour = parseInt(startTimeStr.split(':')[0]) || 8;
    const startMin = parseInt(startTimeStr.split(':')[1]) || 0;
    const endHour = parseInt(endTimeStr.split(':')[0]) || 18;
    const endMin = parseInt(endTimeStr.split(':')[1]) || 0;

    const startTotalMinutes = startHour * 60 + startMin;
    const endTotalMinutes = endHour * 60 + endMin;
    const step = parseInt(duration) || 30;

    const slots = [];
    for (let m = startTotalMinutes; m < endTotalMinutes; m += step) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const timeStr = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      const isBooked = bookedTimes.has(timeStr);

      slots.push({
        time: timeStr,
        available: !isBooked,
      });
    }

    return res.json({
      success: true,
      is_open: true,
      date,
      slots,
      existingAppointmentsCount: existingAppts?.length || 0,
    });
  } catch (err) {
    console.error('[GET Availability Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 3. Crear una nueva cita manualmente ─────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      businessId: rawId,
      client_name,
      client_phone,
      service,
      appointment_date,
      appointment_time,
      status = 'confirmed',
      notes = '',
    } = req.body;

    if (!client_name || !client_name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre del cliente es obligatorio' });
    }
    if (!appointment_date || !appointment_time) {
      return res.status(400).json({ success: false, error: 'La fecha y hora de la cita son obligatorias' });
    }

    const targetId = rawId || userId;
    const businessId = await resolveBusinessId(targetId);

    let formattedTime = appointment_time.trim();
    if (formattedTime.length === 5) formattedTime += ':00';

    const cleanPhone = (client_phone || '').replace(/[^\d]/g, '');

    const newAppointment = {
      business_id: businessId || '00000000-0000-0000-0000-000000000001',
      client_name: client_name.trim(),
      client_phone: cleanPhone || 'Sin número',
      service: service ? service.trim() : 'Servicio General',
      appointment_date,
      appointment_time: formattedTime,
      status: status || 'confirmed',
      notes: notes ? notes.trim() : '',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('appointments')
      .insert(newAppointment)
      .select()
      .limit(1);

    if (error) {
      console.error('[POST Appointment Error]:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    const createdAppt = data && data[0];

    if (global.io && createdAppt) {
      try {
        const { emitToUserRooms } = require('../whatsapp/sessionManager');
        emitToUserRooms(global.io, targetId, 'new_appointment', createdAppt);
      } catch (_) {
        global.io.emit('new_appointment', createdAppt);
      }
    }

    return res.json({ success: true, appointment: createdAppt });
  } catch (err) {
    console.error('[POST Appointment Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4. Actualizar cita completa (PUT) ───────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      client_name,
      client_phone,
      service,
      appointment_date,
      appointment_time,
      status,
      notes,
    } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: 'ID de cita requerido' });
    }

    const updates = {};
    if (client_name !== undefined) updates.client_name = client_name.trim();
    if (client_phone !== undefined) updates.client_phone = client_phone.replace(/[^\d]/g, '');
    if (service !== undefined) updates.service = service.trim();
    if (appointment_date !== undefined) updates.appointment_date = appointment_date;
    if (appointment_time !== undefined) {
      let t = appointment_time.trim();
      if (t.length === 5) t += ':00';
      updates.appointment_time = t;
    }
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes.trim();

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .select()
      .limit(1);

    if (error) {
      console.error('[PUT Appointment Error]:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    const updatedAppt = data && data[0];
    if (global.io && updatedAppt) {
      global.io.emit('appointment_updated', updatedAppt);
    }

    return res.json({ success: true, appointment: updatedAppt });
  } catch (err) {
    console.error('[PUT Appointment Crash Safe]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 5. Actualizar estado o notas rápidamente (PATCH) ────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, appointment_date, appointment_time } = req.body;

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (appointment_date !== undefined) updates.appointment_date = appointment_date;
    if (appointment_time !== undefined) {
      let t = appointment_time.trim();
      if (t.length === 5) t += ':00';
      updates.appointment_time = t;
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .select()
      .limit(1);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const updatedAppt = data && data[0];
    if (global.io && updatedAppt) {
      global.io.emit('appointment_updated', updatedAppt);
    }

    return res.json({ success: true, appointment: updatedAppt });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 6. Eliminar cita (DELETE) ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('appointments').delete().eq('id', id);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    if (global.io) {
      global.io.emit('appointment_deleted', { id });
    }

    return res.json({ success: true, message: 'Cita eliminada correctamente' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
