-- Rollback: Music library and audio assets

-- Drop functions
DROP FUNCTION IF EXISTS increment_music_play_count(UUID);
DROP FUNCTION IF EXISTS increment_jingle_play_count(UUID);

-- Drop tables (in reverse order of dependencies)
DROP TABLE IF EXISTS playlist_tracks;
DROP TABLE IF EXISTS music_playlists;
DROP TABLE IF EXISTS sound_effects;
DROP TABLE IF EXISTS jingles;
DROP TABLE IF EXISTS music_tracks;
DROP TABLE IF EXISTS music_genres;
