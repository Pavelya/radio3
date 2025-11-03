-- Migration: Create assets table
-- Description: Audio file storage with quality validation and deduplication
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create validation status enum
CREATE TYPE validation_status AS ENUM (
  'pending',    -- Not yet validated
  'passed',     -- Meets quality standards
  'failed'      -- Quality issues detected
);

-- Create assets table
CREATE TABLE assets (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Storage
  storage_path TEXT NOT NULL,  -- Supabase storage path

  -- Asset type
  content_type TEXT NOT NULL,  -- 'speech', 'bed', 'jingle', 'music', 'fx'

  -- Audio quality metrics
  lufs_integrated NUMERIC(5,2),  -- e.g., -16.00 LUFS
  peak_db NUMERIC(5,2),          -- e.g., -1.00 dBFS
  duration_sec NUMERIC(8,2),     -- e.g., 45.23 seconds

  -- Quality validation
  validation_status validation_status DEFAULT 'pending',
  validation_errors JSONB,

  -- Deduplication
  content_hash TEXT,  -- SHA256 of audio content

  -- Metadata
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_assets_content_hash ON assets(content_hash);
CREATE INDEX idx_assets_validation ON assets(validation_status);
CREATE INDEX idx_assets_content_type ON assets(content_type);
CREATE INDEX idx_assets_created ON assets(created_at DESC);

-- Unique constraint on content_hash (for deduplication)
CREATE UNIQUE INDEX idx_assets_content_hash_unique ON assets(content_hash)
  WHERE content_hash IS NOT NULL;

-- Foreign key from segments table
ALTER TABLE segments
  ADD CONSTRAINT fk_segments_asset
  FOREIGN KEY (asset_id)
  REFERENCES assets(id)
  ON DELETE SET NULL;

-- Comments
COMMENT ON TABLE assets IS 'Audio files with quality validation and deduplication';
COMMENT ON COLUMN assets.lufs_integrated IS 'Integrated loudness (LUFS) - target -16 for speech';
COMMENT ON COLUMN assets.peak_db IS 'Peak level (dBFS) - should be below -1.0';
COMMENT ON COLUMN assets.content_hash IS 'SHA256 hash for detecting duplicate audio';
