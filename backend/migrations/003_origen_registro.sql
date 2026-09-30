-- ============================================================================
-- 003 · Origen de cada registro (cómo llegó cada usuario)
-- ============================================================================
--
-- POR QUÉ
-- Saber qué canal trae clientes (Instagram, TikTok, recomendación...). El panel
-- guarda utm_* y document.referrer en la primera visita y los manda al registrarse
-- (POST /api/auth/google). Además, el onboarding pregunta "¿Cómo nos conociste?".
--
-- QUÉ HACE
-- Agrega columnas opcionales a users. No toca datos existentes.
--   signup_source     utm_source (o null si llegó sin UTM)
--   signup_medium     utm_medium
--   signup_campaign   utm_campaign
--   signup_referrer   document.referrer externo de la primera visita
--   heard_about       respuesta a "¿Cómo nos conociste?" (instagram, tiktok, ...)
--
-- ES SEGURO EJECUTARLO ANTES O DESPUÉS DEL DEPLOY
-- Si el backend nuevo corre sin estas columnas, el registro sigue funcionando
-- (reintenta sin el origen) y solo se pierde ese dato.
--
-- CÓMO EJECUTAR
--   Supabase Dashboard → SQL Editor → pegar esto → Run.
--
-- CÓMO REVERTIR
--   ALTER TABLE public.users DROP COLUMN signup_source, DROP COLUMN signup_medium,
--     DROP COLUMN signup_campaign, DROP COLUMN signup_referrer, DROP COLUMN heard_about;
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_source   text,
  ADD COLUMN IF NOT EXISTS signup_medium   text,
  ADD COLUMN IF NOT EXISTS signup_campaign text,
  ADD COLUMN IF NOT EXISTS signup_referrer text,
  ADD COLUMN IF NOT EXISTS heard_about     text;
