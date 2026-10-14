-- ============================================================================
-- 008 · Cada chat pertenece al número de WhatsApp que lo atendió
-- ============================================================================
--
-- POR QUÉ
-- El panel listaba los chats de TODAS las sesiones de la cuenta. Una cuenta
-- acumula varias filas en whatsapp_sessions (al reconectar o al cambiar de
-- número), así que al vincular otro WhatsApp seguían apareciendo los chats del
-- anterior. Filtrar por session_id no alcanza: hace falta saber qué número
-- atendió cada chat.
--
-- QUÉ HACE
-- Agrega conversations.owner_phone con el número (solo dígitos) del WhatsApp
-- dueño del chat, y rellena las filas que ya existen usando el número de su
-- sesión. A partir del deploy, el backend marca cada chat nuevo y el panel
-- muestra únicamente los del número conectado en ese momento.
--
-- ES SEGURO EJECUTARLO ANTES O DESPUÉS DEL DEPLOY
-- Sin la columna el backend detecta que falta y se comporta como antes. Con la
-- columna pero sin el deploy, nadie la lee ni la escribe.
--
-- OJO CON EL RELLENO
-- Un chat cuya sesión no tiene phone_number ni last_phone se queda en NULL y
-- deja de verse en el panel: no hay forma de saber qué WhatsApp lo atendió.
-- Para revisarlo antes de ejecutar:
--
--   SELECT count(*) FROM conversations c
--     LEFT JOIN whatsapp_sessions s ON s.id = c.session_id
--    WHERE coalesce(s.phone_number, s.last_phone) IS NULL;
--
-- Si ese número no es 0, conecta el WhatsApp de esas cuentas (así se guarda
-- phone_number) y vuelve a ejecutar el UPDATE de abajo.
--
-- CÓMO EJECUTAR
--   Supabase Dashboard → SQL Editor → pegar esto → Run.
--
-- CÓMO REVERTIR
--   ALTER TABLE public.conversations DROP COLUMN owner_phone;
-- ============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS owner_phone text;

-- Relleno: el número de la sesión dueña del chat, solo dígitos.
UPDATE public.conversations c
   SET owner_phone = regexp_replace(coalesce(s.phone_number, s.last_phone), '[^0-9]', '', 'g')
  FROM public.whatsapp_sessions s
 WHERE s.id = c.session_id
   AND c.owner_phone IS NULL
   AND coalesce(s.phone_number, s.last_phone) IS NOT NULL;

-- El listado del panel filtra por sesión y número en cada refresco.
CREATE INDEX IF NOT EXISTS idx_conversations_session_owner_phone
  ON public.conversations (session_id, owner_phone);
