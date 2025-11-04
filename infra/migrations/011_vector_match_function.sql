-- Migration: Vector similarity search function
-- Description: pgvector cosine similarity search

CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1024),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  chunk_id uuid,
  source_id uuid,
  source_type text,
  chunk_text text,
  lang text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.source_id,
    c.source_type,
    c.chunk_text,
    c.lang,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM kb_embeddings e
  JOIN kb_chunks c ON c.id = e.chunk_id
  WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
