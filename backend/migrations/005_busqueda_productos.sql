-- ============================================================================
-- 005 · Búsqueda de productos en la base de datos (catálogos grandes)
-- ============================================================================
--
-- POR QUÉ
-- Hoy el bot carga como máximo 150 productos por mensaje y los ordena en memoria: en un
-- catálogo más grande, los productos del 151 en adelante no existen para el bot. Estas
-- funciones buscan DENTRO de Postgres, así que el catálogo puede ser de cualquier tamaño y
-- de cualquier giro (relojes, motos, comida, servicios): no hay palabras ni categorías
-- fijas en el código.
--
-- QUÉ HACE
--   buscar_productos(negocio, términos, límite, orden, precio_máximo)
--     Puntúa cada producto por cuántos términos del cliente coinciden, con distinto peso en
--     nombre (4), categoría (2.5), descripción (1.5) y raíz de palabra en español (1):
--       · sin importar acentos ni mayúsculas
--       · singular/plural y variantes ("relojes" ≈ "reloj") con el stemmer español
--       · errores de tipeo en términos de 4+ letras ("motto" ≈ "moto") con trigramas
--     Cuantos más términos/características coinciden ("reloj negro sumergible"), más arriba.
--     orden: 'relevancia' (por defecto), 'precio_asc' ("el más barato"), 'precio_desc'.
--   productos_similares(negocio, id_producto, límite)
--     Para "algo parecido": misma categoría + nombre y descripción parecidos + precio cercano.
--
-- SEGURIDAD
--   Cada función filtra por negocio (nunca mezcla clientes) y solo la ejecuta service_role,
--   que es la llave que usa el backend. anon/authenticated no pueden llamarlas.
--
-- ES SEGURO EJECUTARLO ANTES O DESPUÉS DEL DEPLOY
-- Si el backend nuevo corre sin esta migración, detecta que la función no existe y sigue
-- con el comportamiento de antes (hasta 150 productos en memoria). No se pierde nada.
--
-- CÓMO EJECUTAR
--   Supabase Dashboard → SQL Editor → pegar esto → Run.
--
-- CÓMO REVERTIR
--   DROP FUNCTION public.buscar_productos(uuid, text[], int, text, numeric);
--   DROP FUNCTION public.productos_similares(uuid, text, int);
--   DROP INDEX IF EXISTS public.products_services_biz_text_idx;
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- Las funciones usan unaccent/word_similarity del esquema "extensions": el rol del backend
-- necesita poder verlo. Supabase ya lo concede; repetirlo no hace daño.
GRANT USAGE ON SCHEMA extensions TO service_role;

-- Acelera "los productos activos de este negocio". Se indexa el texto del id de negocio
-- para que las funciones no dependan de si la columna es uuid o text.
CREATE INDEX IF NOT EXISTS products_services_biz_text_idx
  ON public.products_services ((business_id::text))
  WHERE is_active IS NOT FALSE;

-- ─── buscar_productos ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buscar_productos(
  p_business_id uuid,
  p_terms       text[]  DEFAULT '{}',
  p_limit       int     DEFAULT 12,
  p_orden       text    DEFAULT 'relevancia',
  p_max_price   numeric DEFAULT NULL
)
RETURNS TABLE (
  id          text,
  name        text,
  description text,
  price       numeric,
  currency    text,
  category    text,
  image_url   text,
  score       real
)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  WITH t AS (
    SELECT DISTINCT lower(unaccent(btrim(x))) AS term
    FROM unnest(coalesce(p_terms, '{}'::text[])) AS x
    WHERE length(btrim(x)) >= 2
  ),
  base AS (
    SELECT p.id::text AS id, p.name, p.description, p.price::numeric AS price, p.currency,
           p.category, p.image_url,
           lower(unaccent(coalesce(p.name, '')))        AS n,
           lower(unaccent(coalesce(p.category, '')))    AS c,
           lower(unaccent(coalesce(p.description, ''))) AS d
    FROM public.products_services p
    WHERE p.business_id::text = p_business_id::text
      AND p.is_active IS NOT FALSE
      AND (p_max_price IS NULL OR p.price <= p_max_price)
  ),
  scored AS (
    SELECT b.*,
      coalesce((
        SELECT sum(4.0 * m.name_hit + 2.5 * m.cat_hit + 1.5 * m.desc_hit + 1.0 * m.fts_hit)
        FROM t
        CROSS JOIN LATERAL (
          SELECT
            -- términos de 2 letras ("tv"): solo como palabra completa, para no coincidir con todo
            CASE WHEN length(t.term) = 2 THEN (b.n ~ ('(^| )' || t.term || '( |$)'))::int::float8
                 WHEN strpos(b.n, t.term) > 0 THEN 1.0
                 WHEN length(t.term) >= 4 AND word_similarity(t.term, b.n) >= 0.45
                      THEN 0.8 * word_similarity(t.term, b.n)
                 ELSE 0.0 END AS name_hit,
            CASE WHEN length(t.term) = 2 THEN (b.c ~ ('(^| )' || t.term || '( |$)'))::int::float8
                 WHEN strpos(b.c, t.term) > 0 THEN 1.0
                 WHEN length(t.term) >= 4 AND word_similarity(t.term, b.c) >= 0.45
                      THEN 0.8 * word_similarity(t.term, b.c)
                 ELSE 0.0 END AS cat_hit,
            CASE WHEN length(t.term) = 2 THEN (b.d ~ ('(^| )' || t.term || '( |$)'))::int::float8
                 WHEN strpos(b.d, t.term) > 0 THEN 1.0
                 ELSE 0.0 END AS desc_hit,
            CASE WHEN to_tsvector('spanish', b.n || ' ' || b.c || ' ' || b.d)
                      @@ plainto_tsquery('spanish', t.term) THEN 1.0 ELSE 0.0 END AS fts_hit
        ) m
      ), 0)::real AS score
    FROM base b
  )
  SELECT s.id, s.name, s.description, s.price, s.currency, s.category, s.image_url, s.score
  FROM scored s
  WHERE (SELECT count(*) FROM t) = 0
     OR s.score >= CASE
          -- "el más barato de los relojes": ordenar por precio SOLO entre los que de verdad
          -- son relojes, no entre cualquier cosa que mencione la palabra
          WHEN p_orden IN ('precio_asc', 'precio_desc') THEN 0.5 * (SELECT max(score) FROM scored)
          ELSE 1.0 END
  ORDER BY
    CASE WHEN p_orden = 'precio_asc'  THEN s.price END ASC  NULLS LAST,
    CASE WHEN p_orden = 'precio_desc' THEN s.price END DESC NULLS LAST,
    s.score DESC, s.category NULLS LAST, s.name
  LIMIT greatest(1, least(coalesce(p_limit, 12), 30));
$$;

-- ─── productos_similares ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.productos_similares(
  p_business_id uuid,
  p_product_id  text,
  p_limit       int DEFAULT 6
)
RETURNS TABLE (
  id          text,
  name        text,
  description text,
  price       numeric,
  currency    text,
  category    text,
  image_url   text,
  score       real
)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  WITH a AS (
    SELECT lower(unaccent(coalesce(p.name, '')))        AS n,
           lower(unaccent(coalesce(p.category, '')))    AS c,
           left(lower(unaccent(coalesce(p.description, ''))), 300) AS d,
           coalesce(p.price::numeric, 0)                AS price
    FROM public.products_services p
    WHERE p.business_id::text = p_business_id::text AND p.id::text = p_product_id
    LIMIT 1
  )
  SELECT p.id::text, p.name, p.description, p.price::numeric, p.currency, p.category, p.image_url,
         ( CASE WHEN a.c <> '' AND lower(unaccent(coalesce(p.category, ''))) = a.c THEN 3.0 ELSE 0.0 END
         + 2.0 * similarity(lower(unaccent(coalesce(p.name, ''))), a.n)
         + 1.5 * similarity(left(lower(unaccent(coalesce(p.description, ''))), 300), a.d)
         + 2.0 / (1.0 + abs(coalesce(p.price::numeric, 0) - a.price) / greatest(a.price, 1.0))
         )::real AS score
  FROM public.products_services p
  CROSS JOIN a
  WHERE p.business_id::text = p_business_id::text
    AND p.is_active IS NOT FALSE
    AND p.id::text <> p_product_id
  ORDER BY score DESC, p.name
  LIMIT greatest(1, least(coalesce(p_limit, 6), 20));
$$;

-- Solo el backend (service_role) puede llamarlas.
REVOKE ALL ON FUNCTION public.buscar_productos(uuid, text[], int, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.productos_similares(uuid, text, int)               FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_productos(uuid, text[], int, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.productos_similares(uuid, text, int)               TO service_role;
