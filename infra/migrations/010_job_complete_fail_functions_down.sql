-- Rollback: Drop completion functions

DROP FUNCTION IF EXISTS fail_job(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS complete_job(UUID);
