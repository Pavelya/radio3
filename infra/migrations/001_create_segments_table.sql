-- Migration: Create segments table
-- Description: Core table for all generated radio content
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create segment state enum
CREATE TYPE segment_state AS ENUM (
  'queued',       -- Initial state, waiting for generation
  'retrieving',   -- Fetching RAG context
  'generating',   -- LLM script generation in progress
  'rendering',    -- TTS synthesis in progress
  'normalizing',  -- Audio mastering in progress
  'ready',        -- Available for playout
  'airing',       -- Currently on-air
  'aired',        -- Completed broadcast
  'archived',     -- Moved to archive storage
  'failed'        -- Terminal failure state
);

-- Create segments table
CREATE TABLE segments (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  program_id UUID NOT NULL,  -- References programs(id) - added later
  asset_id UUID,              -- References assets(id) - NULL until audio generated

  -- Segment configuration
  slot_type TEXT NOT NULL,    -- 'news', 'culture', 'interview', 'station_id', etc.
  lang TEXT NOT NULL DEFAULT 'en',

  -- State management
  state segment_state NOT NULL DEFAULT 'queued',

  -- Content
  script_md TEXT,             -- Generated script in Markdown
  citations JSONB,            -- [{doc_id: UUID, chunk_id: UUID, title: string}]

  -- Audio metadata
  duration_sec NUMERIC(8,2),  -- Duration in seconds (e.g., 45.23)

  -- Scheduling
  scheduled_start_ts TIMESTAMPTZ,  -- When this should air
  aired_at TIMESTAMPTZ,            -- When it actually aired

  -- Idempotency
  idempotency_key TEXT UNIQUE,
  idempotency_ttl_sec INT DEFAULT 600,

  -- Retry management
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  last_error TEXT,

  -- Performance tracking
  generation_metrics JSONB,   -- {llm_tokens_in, llm_tokens_out, tts_duration_ms, etc.}

  -- Caching for segment reuse
  cache_key TEXT,
  parent_segment_id UUID,     -- References segments(id) for variations

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_segments_state ON segments(state);
CREATE INDEX idx_segments_scheduled ON segments(scheduled_start_ts)
  WHERE state = 'ready';
CREATE INDEX idx_segments_idempotency ON segments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_segments_cache_key ON segments(cache_key)
  WHERE cache_key IS NOT NULL;
CREATE INDEX idx_segments_retry ON segments(retry_count)
  WHERE state = 'failed';
CREATE INDEX idx_segments_program ON segments(program_id);
CREATE INDEX idx_segments_created ON segments(created_at DESC);

-- Self-referential foreign key for parent_segment_id
ALTER TABLE segments
  ADD CONSTRAINT fk_segments_parent
  FOREIGN KEY (parent_segment_id)
  REFERENCES segments(id)
  ON DELETE SET NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER segments_updated_at
  BEFORE UPDATE ON segments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE segments IS 'Generated radio content segments with state machine tracking';
COMMENT ON COLUMN segments.state IS 'Current state in generation pipeline';
COMMENT ON COLUMN segments.cache_key IS 'Hash for identifying identical segments for reuse';
COMMENT ON COLUMN segments.citations IS 'Array of source document references used in generation';
COMMENT ON COLUMN segments.generation_metrics IS 'Performance metrics from generation process';
