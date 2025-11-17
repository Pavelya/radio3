-- Migration 024 Down: Rollback multi-DJ programs

-- Restore dj_id for programs that only have one DJ
UPDATE programs p
SET dj_id = (
  SELECT dj_id
  FROM program_djs
  WHERE program_id = p.id
  LIMIT 1
)
WHERE dj_id IS NULL;

-- Make dj_id NOT NULL again
ALTER TABLE programs
  ALTER COLUMN dj_id SET NOT NULL;

-- Remove deprecation comment
COMMENT ON COLUMN programs.dj_id IS 'Host DJ for this program';

-- Drop conversation_format
ALTER TABLE programs
  DROP COLUMN conversation_format;

-- Drop program_djs table
DROP TABLE IF EXISTS program_djs CASCADE;
