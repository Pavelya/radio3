-- Migration: Add priority to segments
-- Description: Support urgent/priority segments

ALTER TABLE segments
  ADD COLUMN priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10);

CREATE INDEX idx_segments_priority ON segments(priority DESC, scheduled_start_ts ASC)
  WHERE state = 'ready';

COMMENT ON COLUMN segments.priority IS 'Priority level: 1-10, higher = more urgent';
