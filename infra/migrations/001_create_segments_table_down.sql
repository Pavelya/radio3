-- Rollback: Drop segments table
-- Description: Removes segments table and enum

DROP TRIGGER IF EXISTS segments_updated_at ON segments;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TABLE IF EXISTS segments;
DROP TYPE IF EXISTS segment_state;
