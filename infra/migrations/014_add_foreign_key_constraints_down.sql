-- Rollback: Remove foreign key constraints
-- Description: Removes all cross-table foreign keys

-- Remove constraints added in this migration
ALTER TABLE programs DROP CONSTRAINT IF EXISTS fk_programs_format_clock;
ALTER TABLE programs DROP CONSTRAINT IF EXISTS fk_programs_dj;
ALTER TABLE djs DROP CONSTRAINT IF EXISTS fk_djs_voice;

-- Restore fk_segments_program to RESTRICT instead of CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_segments_program'
  ) THEN
    ALTER TABLE segments DROP CONSTRAINT fk_segments_program;
  END IF;

  ALTER TABLE segments
    ADD CONSTRAINT fk_segments_program
    FOREIGN KEY (program_id)
    REFERENCES programs(id)
    ON DELETE RESTRICT;
END $$;

-- Note: fk_segments_asset was created in migration 003, so we don't modify it here
-- Note: We don't delete the default voice/DJ as they may be referenced by data
