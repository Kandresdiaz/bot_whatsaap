-- ============================================================================
-- 001 · Cerrar el acceso público a la base de datos
-- ============================================================================
--
-- POR QUÉ
-- El repo es público y la llave anon estaba incrustada en backend/src/db/supabase.js
-- (y sigue en el historial de git). Con RLS desactivado, esa llave daba lectura y
-- escritura sobre TODO. Comprobado el 2026-09-09: se leían 1.535 conversaciones,
-- 16.578 mensajes, y las tablas users, businesses y whatsapp_sessions.
--
-- QUÉ HACE
-- Activa RLS en todas las tablas SIN crear políticas. Sin políticas, nadie que use
-- las llaves públicas (anon / publishable) puede leer ni escribir. La llave
-- service_role omite RLS por diseño, así que el backend sigue funcionando igual.
--
-- ANTES DE EJECUTAR — comprobar las dos cosas, en este orden:
--   1. Render → Environment: SUPABASE_SERVICE_KEY existe y es la service_role real.
--      Si el backend está corriendo con la llave anon, esto lo tumba.
--      Para verificarlo, mira los logs al arrancar: debe decir "rol: service_role".
--   2. El frontend solo usa Supabase para login (auth), nunca hace .from() a tablas,
--      así que no le afecta. Verificado en frontend/src/lib/supabase.ts.
--
-- CÓMO EJECUTAR
--   Supabase Dashboard → SQL Editor → pegar esto → Run.
--
-- CÓMO REVERTIR (si algo se rompe)
--   ALTER TABLE <tabla> DISABLE ROW LEVEL SECURITY;  -- para cada tabla
-- ============================================================================

ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_services  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;

-- Defensa en profundidad: quitar también los permisos de tabla a los roles públicos,
-- para que ni siquiera dependa de que RLS esté bien configurado.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Y que las tablas futuras nazcan cerradas.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
