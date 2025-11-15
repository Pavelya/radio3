-- Migration: Multi-speaker conversations
-- Description: Support for interviews, panel discussions, multi-DJ segments
-- Author: AI Radio Team
-- Date: 2025-01-15

-- Conversation participants
CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  dj_id UUID NOT NULL REFERENCES djs(id),

  -- Role in conversation
  role TEXT NOT NULL CHECK (role IN ('host', 'guest', 'co-host', 'panelist', 'interviewer', 'interviewee')),
  speaking_order INT, -- Order of speakers (1, 2, 3...)

  -- Character (if guest is fictional character)
  character_name TEXT,
  character_background TEXT,
  character_expertise TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation turns (for dialogue)
CREATE TABLE conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES conversation_participants(id) ON DELETE CASCADE,

  -- Turn metadata
  turn_number INT NOT NULL,
  speaker_name TEXT NOT NULL,

  -- Content
  text_content TEXT NOT NULL,
  duration_sec FLOAT,

  -- Audio (synthesized per turn)
  audio_path TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(segment_id, turn_number)
);

-- Update segments to support conversation format
ALTER TABLE segments
  ADD COLUMN conversation_format TEXT CHECK (conversation_format IN ('monologue', 'interview', 'panel', 'debate', 'dialogue'));

ALTER TABLE segments
  ADD COLUMN participant_count INT DEFAULT 1;

-- Indexes
CREATE INDEX idx_conversation_participants_segment ON conversation_participants(segment_id);
CREATE INDEX idx_conversation_participants_dj ON conversation_participants(dj_id);
CREATE INDEX idx_conversation_turns_segment ON conversation_turns(segment_id);
CREATE INDEX idx_conversation_turns_participant ON conversation_turns(participant_id);
CREATE INDEX idx_conversation_turns_order ON conversation_turns(segment_id, turn_number);

-- Comments
COMMENT ON TABLE conversation_participants IS 'Speakers participating in multi-speaker segments';
COMMENT ON TABLE conversation_turns IS 'Individual dialogue turns in conversations';
COMMENT ON COLUMN conversation_participants.role IS 'Speaker role in the conversation';
COMMENT ON COLUMN conversation_participants.speaking_order IS 'Order in which speakers are introduced';
COMMENT ON COLUMN conversation_turns.turn_number IS 'Sequential turn number within the conversation';
COMMENT ON COLUMN conversation_turns.audio_path IS 'Path to synthesized audio for this turn';
COMMENT ON COLUMN segments.conversation_format IS 'Format of the segment: monologue (default) or multi-speaker';
COMMENT ON COLUMN segments.participant_count IS 'Number of speakers in the conversation';
