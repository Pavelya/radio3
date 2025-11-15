-- Migration rollback: Multi-speaker conversations
-- Description: Remove multi-speaker support

-- Drop columns from segments
ALTER TABLE segments DROP COLUMN IF EXISTS participant_count;
ALTER TABLE segments DROP COLUMN IF EXISTS conversation_format;

-- Drop tables (CASCADE will handle foreign keys)
DROP TABLE IF EXISTS conversation_turns CASCADE;
DROP TABLE IF EXISTS conversation_participants CASCADE;
