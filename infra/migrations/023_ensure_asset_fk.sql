-- Migration 023: Ensure asset foreign key constraint exists
-- Purpose: Fix segments->assets relationship for Supabase queries

-- Fix any segments with invalid asset_id references
UPDATE segments
SET asset_id = NULL
WHERE asset_id IS NOT NULL AND asset_id NOT IN (SELECT id FROM assets);

-- Ensure the foreign key constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_segments_asset'
  ) THEN
    ALTER TABLE segments
      ADD CONSTRAINT fk_segments_asset
      FOREIGN KEY (asset_id)
      REFERENCES assets(id)
      ON DELETE SET NULL;

    RAISE NOTICE 'Created constraint fk_segments_asset';
  ELSE
    RAISE NOTICE 'Constraint fk_segments_asset already exists';
  END IF;
END $$;
