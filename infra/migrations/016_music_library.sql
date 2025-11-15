-- Migration: Music library and audio assets
-- Description: Music tracks, jingles, sound effects with licensing

-- Music genres
CREATE TABLE music_genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Music tracks
CREATE TABLE music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  genre_id UUID REFERENCES music_genres(id),
  duration_sec FLOAT NOT NULL,

  -- Audio file
  storage_path TEXT NOT NULL,
  file_format TEXT DEFAULT 'mp3',
  bitrate INT,
  sample_rate INT,

  -- Licensing
  license_type TEXT NOT NULL CHECK (license_type IN ('cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'proprietary', 'public-domain')),
  license_url TEXT,
  attribution_required BOOLEAN DEFAULT false,
  attribution_text TEXT,
  source_url TEXT,

  -- Metadata
  mood TEXT, -- 'energetic', 'calm', 'dramatic', 'upbeat', 'melancholic'
  tempo TEXT, -- 'slow', 'medium', 'fast'
  energy_level INT CHECK (energy_level BETWEEN 1 AND 10),

  -- Rotation management
  play_count INT DEFAULT 0,
  last_played_at TIMESTAMPTZ,

  -- Scheduling
  suitable_for_time TEXT[], -- ['morning', 'afternoon', 'evening', 'night']
  suitable_for_programs TEXT[], -- ['news', 'culture', 'tech', 'interview']

  -- Status
  active BOOLEAN DEFAULT true,
  reviewed BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jingles (station IDs, bumpers, transitions)
CREATE TABLE jingles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  jingle_type TEXT NOT NULL CHECK (jingle_type IN ('station_id', 'program_intro', 'program_outro', 'transition', 'bumper', 'news_intro', 'weather_intro')),

  -- Audio
  storage_path TEXT NOT NULL,
  duration_sec FLOAT NOT NULL,

  -- Usage
  program_id UUID REFERENCES programs(id), -- NULL if generic
  play_count INT DEFAULT 0,
  last_played_at TIMESTAMPTZ,

  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sound effects
CREATE TABLE sound_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'ambience', 'transition', 'emphasis', 'tech', 'space'

  -- Audio
  storage_path TEXT NOT NULL,
  duration_sec FLOAT NOT NULL,

  -- Licensing
  license_type TEXT NOT NULL,
  attribution_text TEXT,

  -- Usage
  tags TEXT[],
  play_count INT DEFAULT 0,

  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Music playlists (for rotation scheduling)
CREATE TABLE music_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Scheduling
  time_slots TEXT[], -- ['06:00-09:00', '18:00-22:00']
  days_of_week INT[], -- [1,2,3,4,5] for Mon-Fri

  -- Rules
  shuffle BOOLEAN DEFAULT true,
  repeat_threshold_hours INT DEFAULT 4, -- Don't repeat track within X hours

  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playlist tracks (many-to-many)
CREATE TABLE playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID REFERENCES music_playlists(id) ON DELETE CASCADE,
  track_id UUID REFERENCES music_tracks(id) ON DELETE CASCADE,
  position INT, -- NULL for random/shuffled playlists
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(playlist_id, track_id)
);

-- Indexes for performance
CREATE INDEX idx_music_tracks_genre ON music_tracks(genre_id);
CREATE INDEX idx_music_tracks_active ON music_tracks(active) WHERE active = true;
CREATE INDEX idx_music_tracks_mood ON music_tracks(mood);
CREATE INDEX idx_music_tracks_last_played ON music_tracks(last_played_at);
CREATE INDEX idx_jingles_type ON jingles(jingle_type);
CREATE INDEX idx_jingles_program ON jingles(program_id);
CREATE INDEX idx_sound_effects_category ON sound_effects(category);

-- Functions for play count tracking
CREATE OR REPLACE FUNCTION increment_music_play_count(track_id_param UUID)
RETURNS void AS $$
BEGIN
  UPDATE music_tracks
  SET
    play_count = play_count + 1,
    last_played_at = NOW()
  WHERE id = track_id_param;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_jingle_play_count(jingle_id_param UUID)
RETURNS void AS $$
BEGIN
  UPDATE jingles
  SET
    play_count = play_count + 1,
    last_played_at = NOW()
  WHERE id = jingle_id_param;
END;
$$ LANGUAGE plpgsql;

-- Insert sample genres
INSERT INTO music_genres (name, description) VALUES
  ('Electronic', 'Electronic and synthesizer music'),
  ('Ambient', 'Atmospheric and ambient soundscapes'),
  ('Jazz', 'Jazz and smooth instrumentals'),
  ('Classical', 'Classical and orchestral pieces'),
  ('World', 'World music and ethnic sounds'),
  ('Rock', 'Rock and alternative'),
  ('Cinematic', 'Epic and cinematic scores');

COMMENT ON TABLE music_tracks IS 'Music tracks for rotation between talk segments';
COMMENT ON TABLE jingles IS 'Station IDs, program intros, transitions';
COMMENT ON TABLE sound_effects IS 'Sound effects for various uses';
COMMENT ON TABLE music_playlists IS 'Curated playlists for scheduling';
