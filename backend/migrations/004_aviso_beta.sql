-- ============================================================================
-- 004 · Registro del correo "BotWA ya salió de beta"
-- ============================================================================
--
-- POR QUÉ
-- El admin (Correos) envía el aviso a los usuarios de la beta. Con esta columna
-- sabemos a quién ya le llegó y nadie lo recibe dos veces.
--
-- CÓMO EJECUTAR
--   Supabase Dashboard → SQL Editor → pegar esto → Run.
--
-- CÓMO REVERTIR
--   ALTER TABLE public.users DROP COLUMN beta_email_sent_at;
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS beta_email_sent_at timestamptz;
