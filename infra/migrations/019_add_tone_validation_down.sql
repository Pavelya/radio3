-- Migration 019 Down: Remove tone validation fields

-- Drop indexes
DROP INDEX IF EXISTS idx_segments_with_issues;
DROP INDEX IF EXISTS idx_segments_tone_score;

-- Drop columns
ALTER TABLE segments
  DROP COLUMN IF EXISTS validation_suggestions,
  DROP COLUMN IF EXISTS validation_issues,
  DROP COLUMN IF EXISTS tone_balance,
  DROP COLUMN IF EXISTS tone_score;
