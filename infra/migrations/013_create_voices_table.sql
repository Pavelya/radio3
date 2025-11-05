-- Migration: Create voices table
-- Description: Maps voice names to Piper TTS model identifiers
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create quality enum
CREATE TYPE voice_quality AS ENUM ('low', 'medium', 'high');

-- Create voices table
CREATE TABLE voices (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Friendly name
  name TEXT NOT NULL UNIQUE,           -- 'Lessac (US Male)'
  slug TEXT NOT NULL UNIQUE,           -- 'lessac-us-male'

  -- Piper TTS configuration
  model_name TEXT NOT NULL UNIQUE,     -- 'en_US-lessac-medium'
  quality voice_quality NOT NULL DEFAULT 'medium',

  -- Characteristics
  lang TEXT NOT NULL,                  -- 'en', 'es', 'fr', etc.
  locale TEXT NOT NULL,                -- 'en_US', 'en_GB', 'es_ES', etc.
  gender TEXT NOT NULL,                -- 'male', 'female', 'neutral'

  -- Description
  description TEXT,                    -- 'Clear, professional American male voice'

  -- Availability
  is_available BOOLEAN DEFAULT true,   -- Can be used for new DJs
  requires_download BOOLEAN DEFAULT false,  -- Model needs to be downloaded

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_voices_lang ON voices(lang);
CREATE INDEX idx_voices_locale ON voices(locale);
CREATE INDEX idx_voices_gender ON voices(gender);
CREATE INDEX idx_voices_available ON voices(is_available) WHERE is_available = true;
CREATE INDEX idx_voices_slug ON voices(slug);

-- Constraints
ALTER TABLE voices
  ADD CONSTRAINT chk_voices_gender
  CHECK (gender IN ('male', 'female', 'neutral'));

-- Trigger for updated_at
CREATE TRIGGER voices_updated_at
  BEFORE UPDATE ON voices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE voices IS 'Piper TTS voice model catalog';
COMMENT ON COLUMN voices.model_name IS 'Exact Piper TTS model identifier';
COMMENT ON COLUMN voices.quality IS 'Audio quality level (affects model size)';
COMMENT ON COLUMN voices.requires_download IS 'Whether model needs downloading before use';

-- Insert common voices (for immediate use)
INSERT INTO voices (name, slug, model_name, quality, lang, locale, gender, description) VALUES
  -- English (US)
  ('Lessac (US Male)', 'lessac-us-male', 'en_US-lessac-medium', 'medium', 'en', 'en_US', 'male',
   'Clear, professional American male voice'),
  ('Amy (US Female)', 'amy-us-female', 'en_US-amy-medium', 'medium', 'en', 'en_US', 'female',
   'Friendly, warm American female voice'),
  ('Ryan (US Male)', 'ryan-us-male', 'en_US-ryan-medium', 'medium', 'en', 'en_US', 'male',
   'Energetic American male voice'),
  ('Kimberly (US Female)', 'kimberly-us-female', 'en_US-kimberly-medium', 'medium', 'en', 'en_US', 'female',
   'Professional American female voice'),

  -- English (GB)
  ('Alan (UK Male)', 'alan-uk-male', 'en_GB-alan-medium', 'medium', 'en', 'en_GB', 'male',
   'British male voice with RP accent'),
  ('Alba (UK Female)', 'alba-uk-female', 'en_GB-alba-medium', 'medium', 'en', 'en_GB', 'female',
   'British female voice with clear diction'),

  -- High quality alternatives (if needed later)
  ('Lessac High (US Male)', 'lessac-us-male-hq', 'en_US-lessac-high', 'high', 'en', 'en_US', 'male',
   'High-quality professional American male voice'),
  ('Amy High (US Female)', 'amy-us-female-hq', 'en_US-amy-high', 'high', 'en', 'en_US', 'female',
   'High-quality warm American female voice')
ON CONFLICT (model_name) DO NOTHING;
