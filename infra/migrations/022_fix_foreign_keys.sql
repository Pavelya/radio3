-- Migration 022: Fix foreign key constraints
-- Purpose: Clean up data and ensure foreign keys exist

-- Step 1: Fix any programs with invalid dj_id references
-- Update programs that reference non-existent DJs to use the default DJ
UPDATE programs
SET dj_id = '00000000-0000-0000-0000-000000000001'
WHERE dj_id NOT IN (SELECT id FROM djs);

-- Step 2: Fix any segments with invalid asset_id references
-- Set to NULL for segments that reference non-existent assets
UPDATE segments
SET asset_id = NULL
WHERE asset_id IS NOT NULL AND asset_id NOT IN (SELECT id FROM assets);

-- Step 3: Try to add the foreign key constraints if they don't exist
DO $$
BEGIN
  -- Check and add fk_programs_dj
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_programs_dj'
  ) THEN
    ALTER TABLE programs
      ADD CONSTRAINT fk_programs_dj
      FOREIGN KEY (dj_id)
      REFERENCES djs(id)
      ON DELETE RESTRICT;

    RAISE NOTICE 'Created constraint fk_programs_dj';
  ELSE
    RAISE NOTICE 'Constraint fk_programs_dj already exists';
  END IF;

  -- Check and add fk_programs_format_clock
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_programs_format_clock'
  ) THEN
    ALTER TABLE programs
      ADD CONSTRAINT fk_programs_format_clock
      FOREIGN KEY (format_clock_id)
      REFERENCES format_clocks(id)
      ON DELETE RESTRICT;

    RAISE NOTICE 'Created constraint fk_programs_format_clock';
  ELSE
    RAISE NOTICE 'Constraint fk_programs_format_clock already exists';
  END IF;

  -- Check and add fk_segments_asset
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

COMMENT ON COLUMN programs.dj_id IS 'Foreign key to djs table';
COMMENT ON COLUMN programs.format_clock_id IS 'Foreign key to format_clocks table';
COMMENT ON COLUMN segments.asset_id IS 'Foreign key to assets table';
