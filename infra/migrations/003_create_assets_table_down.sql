-- Rollback: Drop assets table
-- Description: Removes assets table and validation_status enum

-- Remove foreign key from segments
ALTER TABLE segments DROP CONSTRAINT IF EXISTS fk_segments_asset;

-- Drop table
DROP TABLE IF EXISTS assets;
DROP TYPE IF EXISTS validation_status;
