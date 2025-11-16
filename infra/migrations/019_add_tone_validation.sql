-- Migration 019: Add tone validation fields to segments table
-- Purpose: Support automated style guide enforcement and tone analysis

-- Add tone validation columns
ALTER TABLE segments
  ADD COLUMN tone_score INTEGER CHECK (tone_score >= 0 AND tone_score <= 100),
  ADD COLUMN tone_balance TEXT,
  ADD COLUMN validation_issues JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN validation_suggestions JSONB DEFAULT '[]'::jsonb;

-- Add index for filtering segments with low tone scores
CREATE INDEX idx_segments_tone_score ON segments(tone_score) WHERE tone_score IS NOT NULL;

-- Add index for segments with validation issues
CREATE INDEX idx_segments_with_issues ON segments((jsonb_array_length(validation_issues)))
  WHERE jsonb_array_length(validation_issues) > 0;

-- Add column comments
COMMENT ON COLUMN segments.tone_score IS 'Automated tone validation score (0-100, target: 70+)';
COMMENT ON COLUMN segments.tone_balance IS 'Optimism/Realism/Wonder ratio, e.g., "60/30/10"';
COMMENT ON COLUMN segments.validation_issues IS 'Array of tone/style issues detected (dystopian keywords, anachronisms, etc.)';
COMMENT ON COLUMN segments.validation_suggestions IS 'Array of suggestions for improving tone and style';
