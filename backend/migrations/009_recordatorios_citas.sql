-- ============================================================================
-- 009 · Recordatorios automáticos de citas (se activan desde el panel)
-- ============================================================================
--
-- POR QUÉ
-- En el panel de Citas el botón "📲 WhatsApp" solo abre wa.me con el texto ya
-- escrito: el dueño tiene que entrar, cita por cita, y enviarlo a mano. No
-- había forma de que el bot avisara a los clientes por su cuenta, ni forma de
-- impedirlo: cada negocio tiene su criterio y a algunos no les sirve que un bot
-- les escriba a sus clientes.
--
-- QUÉ HACE
-- Agrega tres columnas:
--
--   businesses.appointment_reminders_enabled  ¿el bot recuerda las citas?
--                                             Arranca en FALSE: nadie empieza a
--                                             escribirle a sus clientes sin
--                                             haberlo pedido desde el panel.
--   businesses.appointment_reminder_hours     cuántas horas antes avisa (24 por
--                                             defecto; el panel ofrece 2, 4, 24
--                                             y 48).
--   appointments.reminder_sent_at             cuándo se envió el recordatorio de
--                                             ESA cita. Es lo que evita que el
--                                             cron mande el mismo aviso cada
--                                             diez minutos. Al reprogramar una
--                                             cita el backend lo vuelve a NULL,
--                                             así el cliente recibe el aviso de
--                                             la fecha nueva.
--
-- ES SEGURO EJECUTARLO ANTES O DESPUÉS DEL DEPLOY
-- Sin las columnas el backend detecta que faltan, apaga los recordatorios
-- automáticos y el panel avisa que hace falta esta migración; todo lo demás
-- (agendar, editar, el botón manual de WhatsApp) sigue igual. Con las columnas
-- pero sin el deploy, nadie las lee ni las escribe.
--
-- LO QUE ESTA MIGRACIÓN *NO* HACE
-- No enciende nada. Después de ejecutarla, cada negocio tiene que activar el
-- interruptor en Panel → Citas → "Recordatorios automáticos". Mientras esté
-- apagado, el bot no le escribe a ningún cliente.
--
-- CÓMO EJECUTAR
--   Supabase Dashboard → SQL Editor → pegar esto → Run.
--
-- CÓMO REVERTIR
--   ALTER TABLE public.businesses   DROP COLUMN appointment_reminders_enabled;
--   ALTER TABLE public.businesses   DROP COLUMN appointment_reminder_hours;
--   ALTER TABLE public.appointments DROP COLUMN reminder_sent_at;
-- ============================================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS appointment_reminders_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS appointment_reminder_hours integer NOT NULL DEFAULT 24;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- El cron busca cada diez minutos las citas próximas que aún no tienen aviso.
CREATE INDEX IF NOT EXISTS idx_appointments_recordatorio_pendiente
  ON public.appointments (appointment_date, appointment_time)
  WHERE reminder_sent_at IS NULL;
