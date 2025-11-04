-- Rollback: Drop programs table

-- Remove foreign key from segments
ALTER TABLE segments DROP CONSTRAINT IF EXISTS fk_segments_program;

DROP TRIGGER IF EXISTS programs_updated_at ON programs;
DROP TABLE IF EXISTS programs;
