-- Migration: Create broadcast schedule tables
-- Description: Defines which programs air at which times
-- Author: AI Radio Team
-- Date: 2025-01-06

CREATE TABLE broadcast_schedule (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,

  -- Day of week (0 = Sunday, 6 = Saturday, NULL = every day)
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),

  -- Time range
  start_time TIME NOT NULL,  -- e.g., '06:00:00' for 6 AM
  end_time TIME NOT NULL,    -- e.g., '09:00:00' for 9 AM

  -- Active status
  active BOOLEAN DEFAULT true,

  -- Priority (higher = takes precedence in conflicts)
  priority INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()

  -- Note: No CHECK constraint for end_time > start_time to allow midnight-crossing slots
  -- Conflicts are handled by check_schedule_conflicts() function
);

-- Indexes
CREATE INDEX idx_broadcast_schedule_program ON broadcast_schedule(program_id);
CREATE INDEX idx_broadcast_schedule_day ON broadcast_schedule(day_of_week);
CREATE INDEX idx_broadcast_schedule_time ON broadcast_schedule(start_time, end_time);
CREATE INDEX idx_broadcast_schedule_active ON broadcast_schedule(active) WHERE active = true;

-- Trigger
CREATE TRIGGER broadcast_schedule_updated_at
  BEFORE UPDATE ON broadcast_schedule
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to detect schedule conflicts
CREATE OR REPLACE FUNCTION check_schedule_conflicts(
  p_day_of_week INT,
  p_start_time TIME,
  p_end_time TIME,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE(
  conflict_id UUID,
  program_name TEXT,
  start_time TIME,
  end_time TIME
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    p.name,
    s.start_time,
    s.end_time
  FROM broadcast_schedule s
  JOIN programs p ON p.id = s.program_id
  WHERE s.active = true
    AND (s.day_of_week = p_day_of_week OR s.day_of_week IS NULL OR p_day_of_week IS NULL)
    AND (s.id != p_exclude_id OR p_exclude_id IS NULL)
    AND (
      (s.start_time <= p_start_time AND s.end_time > p_start_time) OR
      (s.start_time < p_end_time AND s.end_time >= p_end_time) OR
      (s.start_time >= p_start_time AND s.end_time <= p_end_time)
    );
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE broadcast_schedule IS 'Defines which programs air at which times/days';
COMMENT ON COLUMN broadcast_schedule.day_of_week IS '0=Sunday, 6=Saturday, NULL=every day';
COMMENT ON COLUMN broadcast_schedule.start_time IS 'Local time when program starts';
COMMENT ON COLUMN broadcast_schedule.priority IS 'Higher priority wins in conflicts';
