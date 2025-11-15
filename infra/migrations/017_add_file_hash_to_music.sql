-- Migration: Add file_hash column for deduplication
-- Description: Adds content hash to music_tracks for duplicate detection during upload

ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Add index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_music_tracks_file_hash ON music_tracks(file_hash);

-- Update license_type constraint to include more types
ALTER TABLE music_tracks DROP CONSTRAINT IF EXISTS music_tracks_license_type_check;
ALTER TABLE music_tracks ADD CONSTRAINT music_tracks_license_type_check
  CHECK (license_type IN (
    'cc0',
    'cc-by',
    'cc-by-sa',
    'cc-by-nc',
    'proprietary',
    'public-domain',
    'royalty_free',
    'creative_commons',
    'purchased',
    'original',
    'unknown'
  ));

COMMENT ON COLUMN music_tracks.file_hash IS 'SHA-256 hash of audio file content for deduplication';
