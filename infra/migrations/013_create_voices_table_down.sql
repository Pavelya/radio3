-- Rollback: Drop voices table
-- Description: Removes voices table and enum

DROP TRIGGER IF EXISTS voices_updated_at ON voices;
DROP TABLE IF EXISTS voices CASCADE;
DROP TYPE IF EXISTS voice_quality;
