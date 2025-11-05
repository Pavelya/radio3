-- Migration: Create DJs table
-- Description: Stores AI radio personality information
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create DJs table
CREATE TABLE djs (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,  -- URL-friendly identifier (e.g., 'nova-chen')

  -- Biography and personality
  bio_short TEXT NOT NULL,     -- 1-2 sentence intro
  bio_long TEXT,               -- Full background story
  personality_traits JSONB,    -- ['enthusiastic', 'knowledgeable', 'witty']
  speaking_style TEXT,         -- 'formal', 'casual', 'energetic', etc.

  -- Voice configuration
  voice_id UUID NOT NULL,      -- References voices(id)
  speech_speed NUMERIC(3,2) DEFAULT 1.0,  -- 0.5 to 2.0

  -- Specializations
  specializations TEXT[],      -- ['space exploration', 'politics', 'culture']
  preferred_topics TEXT[],     -- Topics this DJ covers well

  -- Show preferences
  preferred_formats TEXT[],    -- ['news', 'interview', 'culture']
  energy_level TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'

  -- Language
  primary_lang TEXT NOT NULL DEFAULT 'en',
  supported_langs TEXT[] DEFAULT ARRAY['en'],

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_djs_slug ON djs(slug);
CREATE INDEX idx_djs_active ON djs(is_active) WHERE is_active = true;
CREATE INDEX idx_djs_voice ON djs(voice_id);
CREATE INDEX idx_djs_lang ON djs(primary_lang);

-- Constraints
ALTER TABLE djs
  ADD CONSTRAINT chk_djs_speech_speed
  CHECK (speech_speed BETWEEN 0.5 AND 2.0);

ALTER TABLE djs
  ADD CONSTRAINT chk_djs_energy_level
  CHECK (energy_level IN ('low', 'medium', 'high'));

ALTER TABLE djs
  ADD CONSTRAINT chk_djs_speaking_style
  CHECK (speaking_style IN ('formal', 'casual', 'energetic', 'relaxed', 'authoritative', 'friendly'));

-- Trigger for updated_at
CREATE TRIGGER djs_updated_at
  BEFORE UPDATE ON djs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE djs IS 'AI radio personalities with voice and style configurations';
COMMENT ON COLUMN djs.personality_traits IS 'JSON array of personality characteristics';
COMMENT ON COLUMN djs.specializations IS 'Areas of expertise for content generation';
COMMENT ON COLUMN djs.speech_speed IS 'TTS speed multiplier (0.5 = slow, 2.0 = fast)';
COMMENT ON COLUMN djs.energy_level IS 'Overall energy for script generation tone';
