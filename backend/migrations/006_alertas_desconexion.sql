-- ============================================================================
-- 006 · Avisos de desconexión de WhatsApp
-- ============================================================================
--
-- POR QUÉ
-- Cuando WhatsApp (Meta) cierra la sesión de un bot, antes nadie se enteraba
-- hasta abrir el panel. Ahora cada usuario puede configurar un número donde
-- recibir una alerta por WhatsApp si su bot se cae o necesita reescanear el QR.
-- La alerta se ENVÍA desde un número maestro (sesión admin), no desde el número
-- del propio cliente (que es justo el que se cayó).
--
-- QUÉ HACE
-- Agrega dos columnas opcionales a users. No toca datos existentes.
--   alert_phone     número (solo dígitos, ej. 573001112233) donde recibir avisos.
--                   Si es null o vacío, no se envían alertas por WhatsApp.
--   alert_enabled   interruptor para pausar los avisos sin borrar el número.
--
-- ES SEGURO EJECUTARLO ANTES O DESPUÉS DEL DEPLOY
-- Si el backend nuevo corre sin estas columnas, el guardado del número falla en
-- silencio y el resto del sistema sigue funcionando igual.
--
-- CÓMO EJECUTAR
--   Supabase Dashboard → SQL Editor → pegar esto → Run.
--
-- CÓMO REVERTIR
--   ALTER TABLE public.users DROP COLUMN alert_phone, DROP COLUMN alert_enabled;
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS alert_phone   text,
  ADD COLUMN IF NOT EXISTS alert_enabled boolean NOT NULL DEFAULT true;
