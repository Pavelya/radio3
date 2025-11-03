-- Migration: Create knowledge base tables
-- Description: RAG content and embeddings storage for universe docs and events
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Universe documents (worldbuilding)
CREATE TABLE universe_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  tags TEXT[],
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_universe_docs_lang ON universe_docs(lang);
CREATE INDEX idx_universe_docs_tags ON universe_docs USING GIN(tags);
CREATE INDEX idx_universe_docs_created ON universe_docs(created_at DESC);

-- Events (time-stamped happenings)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  importance INT DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  tags TEXT[],
  lang TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_date ON events(event_date DESC);
CREATE INDEX idx_events_importance ON events(importance DESC);
CREATE INDEX idx_events_lang ON events(lang);
CREATE INDEX idx_events_tags ON events USING GIN(tags);

-- Text chunks (from docs and events)
CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,  -- universe_doc or event id
  source_type TEXT NOT NULL CHECK (source_type IN ('universe_doc', 'event')),
  chunk_text TEXT NOT NULL,
  chunk_index INT NOT NULL,  -- Order within source
  token_count INT,
  lang TEXT NOT NULL DEFAULT 'en',
  content_hash TEXT,  -- For deduplication
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_chunks_source ON kb_chunks(source_id, source_type);
CREATE INDEX idx_kb_chunks_hash ON kb_chunks(content_hash);
CREATE INDEX idx_kb_chunks_lang ON kb_chunks(lang);

-- Vector embeddings
CREATE TABLE kb_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES kb_chunks(id) ON DELETE CASCADE,
  embedding vector(1024),  -- bge-m3 produces 1024-dim vectors
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_embeddings_chunk ON kb_embeddings(chunk_id);

-- Vector similarity index (CRITICAL for performance)
CREATE INDEX idx_kb_embeddings_vector ON kb_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index status tracking
CREATE TYPE kb_index_state AS ENUM (
  'pending',
  'processing',
  'complete',
  'failed'
);

CREATE TABLE kb_index_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('universe_doc', 'event')),
  state kb_index_state NOT NULL DEFAULT 'pending',
  chunks_created INT DEFAULT 0,
  embeddings_created INT DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_index_source ON kb_index_status(source_id, source_type);
CREATE INDEX idx_kb_index_state ON kb_index_status(state);

-- Updated_at triggers
CREATE TRIGGER universe_docs_updated_at
  BEFORE UPDATE ON universe_docs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER kb_index_status_updated_at
  BEFORE UPDATE ON kb_index_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE universe_docs IS 'Worldbuilding documents for RAG context';
COMMENT ON TABLE events IS 'Time-stamped happenings for RAG context';
COMMENT ON TABLE kb_chunks IS 'Chunked text from universe_docs and events for RAG';
COMMENT ON TABLE kb_embeddings IS 'Vector embeddings for semantic search';
COMMENT ON TABLE kb_index_status IS 'Tracks chunking and embedding progress';
COMMENT ON COLUMN kb_embeddings.embedding IS 'bge-m3 1024-dimensional vector';
COMMENT ON COLUMN kb_chunks.chunk_index IS 'Sequential order within source document';
