-- Migration: Programs and format clocks
-- Description: Program scheduling and format definitions

-- Format clocks define hourly structure
CREATE TABLE format_clocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  slots JSONB NOT NULL,  -- Array of {minute: 0, slot_type: 'news', duration: 45}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Programs define shows with assigned DJs and format
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dj_id UUID REFERENCES djs(id),
  format_clock_id UUID REFERENCES format_clocks(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to segments
ALTER TABLE segments
  DROP CONSTRAINT IF EXISTS fk_segments_program;

ALTER TABLE segments
  ADD CONSTRAINT fk_segments_program
  FOREIGN KEY (program_id)
  REFERENCES programs(id);

-- Insert default format clock
INSERT INTO format_clocks (name, description, slots) VALUES (
  'Standard Hour',
  'Default hourly format',
  '[
    {"minute": 0, "slot_type": "station_id", "duration": 15},
    {"minute": 1, "slot_type": "news", "duration": 45},
    {"minute": 2, "slot_type": "music", "duration": 180},
    {"minute": 5, "slot_type": "culture", "duration": 60},
    {"minute": 6, "slot_type": "music", "duration": 240},
    {"minute": 10, "slot_type": "tech", "duration": 60},
    {"minute": 11, "slot_type": "music", "duration": 180},
    {"minute": 14, "slot_type": "interview", "duration": 120},
    {"minute": 16, "slot_type": "music", "duration": 240}
  ]'::jsonb
);

COMMENT ON TABLE format_clocks IS 'Hourly format definitions with slot timing';
COMMENT ON TABLE programs IS 'Radio programs with DJ and format assignments';
