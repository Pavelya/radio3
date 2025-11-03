-- Rollback: Drop KB tables
-- Description: Removes knowledge base tables, triggers, and enums

DROP TRIGGER IF EXISTS kb_index_status_updated_at ON kb_index_status;
DROP TRIGGER IF EXISTS events_updated_at ON events;
DROP TRIGGER IF EXISTS universe_docs_updated_at ON universe_docs;

DROP TABLE IF EXISTS kb_index_status;
DROP TABLE IF EXISTS kb_embeddings;
DROP TABLE IF EXISTS kb_chunks;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS universe_docs;

DROP TYPE IF EXISTS kb_index_state;
