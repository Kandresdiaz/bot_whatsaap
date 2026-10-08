-- ============================================================================
-- 007 · Último número de WhatsApp vinculado
-- ============================================================================
--
-- POR QUÉ
-- Al cerrar sesión o escanear un QR nuevo, whatsapp_sessions.phone_number se
-- pone en null. Al vincular OTRO número, el backend ya no sabía que había
-- cambiado y los chats del número anterior se mezclaban con los del nuevo.
--
-- QUÉ HACE
-- Agrega last_phone: el último número que estuvo conectado. No se borra al
-- cerrar sesión. Si el número que se conecta es distinto, el backend borra los
-- chats del número anterior (como WhatsApp Web). No toca citas ni pedidos.
--
-- ES SEGURO EJECUTARLO ANTES O DESPUÉS DEL DEPLOY
-- Sin la columna el backend sigue igual que antes (no limpia al cambiar de
-- número, pero tampoco falla).
--
-- CÓMO EJECUTAR
--   Supabase Dashboard → SQL Editor → pegar esto → Run.
--
-- CÓMO REVERTIR
--   ALTER TABLE public.whatsapp_sessions DROP COLUMN last_phone;
-- ============================================================================

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS last_phone text;

-- Para sesiones conectadas hoy, el último número es el actual.
UPDATE public.whatsapp_sessions
   SET last_phone = phone_number
 WHERE last_phone IS NULL AND phone_number IS NOT NULL;
