-- Migration: Create format clocks tables
-- Description: Defines hourly broadcast structure templates
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create format clocks table
CREATE TABLE format_clocks (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clock metadata
  name TEXT NOT NULL UNIQUE,
  description TEXT,

  -- Total duration should equal 3600 seconds (1 hour)
  total_duration_sec INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create format slots table
CREATE TABLE format_slots (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key
  format_clock_id UUID NOT NULL REFERENCES format_clocks(id) ON DELETE CASCADE,

  -- Slot configuration
  slot_type TEXT NOT NULL,  -- 'news', 'music', 'culture', 'interview', 'station_id', etc.
  duration_sec INT NOT NULL CHECK (duration_sec > 0),
  order_index INT NOT NULL,  -- Position within the hour

  -- Optional constraints
  required BOOLEAN DEFAULT true,  -- Can this slot be skipped?

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique ordering within a clock
  UNIQUE(format_clock_id, order_index)
);

-- Indexes
CREATE INDEX idx_format_slots_clock ON format_slots(format_clock_id, order_index);

-- Triggers
CREATE TRIGGER format_clocks_updated_at
  BEFORE UPDATE ON format_clocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER format_slots_updated_at
  BEFORE UPDATE ON format_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE format_clocks IS 'Templates defining hourly broadcast structure';
COMMENT ON TABLE format_slots IS 'Individual slots within a format clock';
COMMENT ON COLUMN format_slots.slot_type IS 'Type of content for this slot';
COMMENT ON COLUMN format_slots.order_index IS 'Position within the hour (0-based)';
