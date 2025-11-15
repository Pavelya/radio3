/**
 * Music library types
 */

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre_id?: string;
  duration_sec: number;
  storage_path: string;
  file_format?: string;
  license_type: string;
  attribution_required?: boolean;
  attribution_text?: string;
  mood?: string;
  tempo?: string;
  energy_level?: number;
  play_count: number;
  last_played_at?: string;
  suitable_for_time?: string[];
  suitable_for_programs?: string[];
  active: boolean;
  reviewed: boolean;
};

export type Jingle = {
  id: string;
  name: string;
  jingle_type: string;
  storage_path: string;
  duration_sec: number;
  program_id?: string;
  play_count: number;
  last_played_at?: string;
  active: boolean;
};

export type SoundEffect = {
  id: string;
  name: string;
  category: string;
  storage_path: string;
  duration_sec: number;
  license_type: string;
  attribution_text?: string;
  tags?: string[];
  play_count: number;
  active: boolean;
};

export type NextTrackOptions = {
  mood?: string;
  time_of_day?: string;
  program_type?: string;
  exclude_recent_hours?: number;
};
