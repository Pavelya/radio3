-- Rollback: Remove file_hash column
-- Description: Removes file_hash column and index

DROP INDEX IF EXISTS idx_music_tracks_file_hash;
ALTER TABLE music_tracks DROP COLUMN IF EXISTS file_hash;

-- Restore original license_type constraint
ALTER TABLE music_tracks DROP CONSTRAINT IF EXISTS music_tracks_license_type_check;
ALTER TABLE music_tracks ADD CONSTRAINT music_tracks_license_type_check
  CHECK (license_type IN ('cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'proprietary', 'public-domain'));
