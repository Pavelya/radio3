-- Migration 024: Multi-DJ Programs Support
-- Description: Enable programs to have multiple DJs and conversation formats
-- Author: AI Radio Team
-- Date: 2025-01-17

-- Create program_djs join table (many-to-many)
CREATE TABLE program_djs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  dj_id UUID NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('host', 'co-host', 'guest', 'panelist')) DEFAULT 'host',
  speaking_order INT, -- Order in conversations (1, 2, 3...)
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(program_id, dj_id) -- Prevent duplicate DJ assignments
);

-- Indexes for efficient queries
CREATE INDEX idx_program_djs_program ON program_djs(program_id);
CREATE INDEX idx_program_djs_dj ON program_djs(dj_id);
CREATE INDEX idx_program_djs_order ON program_djs(program_id, speaking_order);

-- Add conversation_format to programs table
ALTER TABLE programs
  ADD COLUMN conversation_format TEXT CHECK (conversation_format IN ('interview', 'panel', 'dialogue', 'debate'));

-- Comments
COMMENT ON TABLE program_djs IS 'Many-to-many relationship between programs and DJs';
COMMENT ON COLUMN program_djs.role IS 'Role of DJ in this program (host, co-host, guest, panelist)';
COMMENT ON COLUMN program_djs.speaking_order IS 'Order for multi-speaker programs (1=primary host, 2=secondary, etc)';
COMMENT ON COLUMN programs.conversation_format IS 'Format for multi-DJ programs: interview (2 people), panel (3-5), dialogue (2 DJs chatting), debate';

-- Migrate existing single-DJ programs to program_djs table
INSERT INTO program_djs (program_id, dj_id, role, speaking_order)
SELECT id, dj_id, 'host', 1
FROM programs
WHERE dj_id IS NOT NULL;

-- Make dj_id nullable (will be removed in future migration after full transition)
ALTER TABLE programs
  ALTER COLUMN dj_id DROP NOT NULL;

-- Add helper comment
COMMENT ON COLUMN programs.dj_id IS 'DEPRECATED: Use program_djs table instead. Will be removed in future version.';
