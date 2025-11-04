-- Migration: Create programs table
-- Description: Defines radio shows/programs
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create programs table
CREATE TABLE programs (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  dj_id UUID NOT NULL,              -- References djs(id) - created in A4
  format_clock_id UUID NOT NULL REFERENCES format_clocks(id),

  -- Program metadata
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  genre TEXT,                       -- 'news', 'culture', 'music', 'talk', etc.

  -- Scheduling hints (used by scheduler worker)
  preferred_time_of_day TEXT,       -- 'morning', 'afternoon', 'evening', 'night'
  preferred_days JSONB,              -- ['monday', 'tuesday', ...] or null for any

  -- Active status
  active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_programs_dj ON programs(dj_id);
CREATE INDEX idx_programs_format_clock ON programs(format_clock_id);
CREATE INDEX idx_programs_active ON programs(active) WHERE active = true;

-- Create a default format clock for migration purposes
INSERT INTO format_clocks (id, name, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Format', 'Placeholder format clock for migration')
ON CONFLICT (id) DO NOTHING;

-- Create a default program for existing segments
INSERT INTO programs (id, dj_id, format_clock_id, name, description, active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',  -- Will be replaced when DJs table is created
  '00000000-0000-0000-0000-000000000001',
  'Default Program',
  'Placeholder program for segments created before programs table',
  false  -- Inactive by default
)
ON CONFLICT (id) DO NOTHING;

-- Add foreign key to segments table (created in D1)
ALTER TABLE segments
  ADD CONSTRAINT fk_segments_program
  FOREIGN KEY (program_id)
  REFERENCES programs(id)
  ON DELETE RESTRICT;

-- Trigger
CREATE TRIGGER programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE programs IS 'Radio shows/programs with assigned DJs and format clocks';
COMMENT ON COLUMN programs.dj_id IS 'Host DJ for this program';
COMMENT ON COLUMN programs.format_clock_id IS 'Hourly structure template for this program';
COMMENT ON COLUMN programs.preferred_time_of_day IS 'Scheduler hint for optimal broadcast time';
