-- Migration: Add foreign key constraints
-- Description: Link tables together with referential integrity
-- Author: AI Radio Team
-- Date: 2025-01-05

-- Step 1: Create default voice and DJ for placeholder program
-- (Programs table created a default program that references dj_id '00000000-0000-0000-0000-000000000001')

-- Create default voice if it doesn't exist
INSERT INTO voices (
  id,
  name,
  slug,
  model_name,
  quality,
  lang,
  locale,
  gender,
  description,
  is_available
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'System Default Voice',
  'system-default',
  'system-default-placeholder',
  'medium',
  'en',
  'en_US',
  'neutral',
  'Placeholder voice for system-generated programs',
  false
)
ON CONFLICT (id) DO NOTHING;

-- Create default DJ if it doesn't exist
INSERT INTO djs (
  id,
  name,
  slug,
  bio_short,
  speaking_style,
  voice_id,
  primary_lang,
  is_active
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'System Default DJ',
  'system-default',
  'Placeholder DJ for system-generated programs',
  'formal',
  '00000000-0000-0000-0000-000000000001',
  'en',
  false
)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Add foreign key constraints (skip ones that already exist)

-- DJs → Voices (new constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_djs_voice'
  ) THEN
    ALTER TABLE djs
      ADD CONSTRAINT fk_djs_voice
      FOREIGN KEY (voice_id)
      REFERENCES voices(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Programs → DJs (new constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_programs_dj'
  ) THEN
    ALTER TABLE programs
      ADD CONSTRAINT fk_programs_dj
      FOREIGN KEY (dj_id)
      REFERENCES djs(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Programs → Format Clocks (new constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_programs_format_clock'
  ) THEN
    ALTER TABLE programs
      ADD CONSTRAINT fk_programs_format_clock
      FOREIGN KEY (format_clock_id)
      REFERENCES format_clocks(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Segments → Programs (need to recreate with CASCADE instead of RESTRICT)
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_segments_program'
  ) THEN
    ALTER TABLE segments DROP CONSTRAINT fk_segments_program;
  END IF;

  -- Add new constraint with CASCADE
  ALTER TABLE segments
    ADD CONSTRAINT fk_segments_program
    FOREIGN KEY (program_id)
    REFERENCES programs(id)
    ON DELETE CASCADE;
END $$;

-- Segments → Assets (already exists from migration 003 with SET NULL, which is correct)

-- Step 3: Add comments to constraints
DO $$
BEGIN
  EXECUTE 'COMMENT ON CONSTRAINT fk_djs_voice ON djs IS ''Ensures every DJ has a valid voice from the catalog''';
  EXECUTE 'COMMENT ON CONSTRAINT fk_programs_dj ON programs IS ''Ensures every program has a valid DJ host''';
  EXECUTE 'COMMENT ON CONSTRAINT fk_programs_format_clock ON programs IS ''Ensures every program follows a valid format clock''';
  EXECUTE 'COMMENT ON CONSTRAINT fk_segments_program ON segments IS ''Cascades deletion: removing program removes its segments''';
  EXECUTE 'COMMENT ON CONSTRAINT fk_segments_asset ON segments IS ''Nullifies on deletion: segment survives asset loss''';
END $$;
