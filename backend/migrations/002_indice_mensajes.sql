-- ============================================================================
-- 002 · Índice único de mensajes (opcional, pero recomendado)
-- ============================================================================
--
-- POR QUÉ
-- syncChatsAndMessagesToDb hace upsert con onConflict (conversation_id, content,
-- timestamp). Si ese índice no existe, el upsert falla y se pierde el lote entero.
-- El código ya tiene reintento con insert plano, así que esto no es obligatorio,
-- pero con el índice la deduplicación la hace Postgres y sale mucho más barato.
--
-- CONCURRENTLY evita bloquear la tabla; no puede ir dentro de una transacción,
-- así que ejecútalo solo, sin envolver en BEGIN/COMMIT.
-- ============================================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS messages_conv_content_ts_idx
  ON public.messages (conversation_id, content, "timestamp");

-- Acelera el listado de un chat (ORDER BY timestamp DESC por conversación).
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_conv_ts_idx
  ON public.messages (conversation_id, "timestamp" DESC);
