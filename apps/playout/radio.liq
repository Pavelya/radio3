#!/usr/bin/liquidsoap

# AI Radio 2525 - Liquidsoap Configuration
# Professional Audio Production with Ducking, Compression, and Broadcast-Quality Processing
#
# Docker networking notes:
# - API_URL: Set to host.docker.internal:8000 to reach API on host machine
# - Icecast: Accessed via service name "icecast" on port 8001
#   (same port for both Docker and native to avoid conflict with API on 8000)

# Configuration
settings.log.level := 4
settings.server.telnet := true
settings.server.telnet.port := 1234
settings.init.allow_root := true

# Load professional audio processing functions
%include "/radio/audio-processing.liq"

# Environment variables with defaults
api_url = getenv("API_URL", "http://localhost:8000")
audio_dir = getenv("OUTPUT_DIR", "/radio/audio")
music_dir = getenv("MUSIC_DIR", "/radio/audio/music")
emergency_dir = getenv("EMERGENCY_DIR", "/radio/emergency")
icecast_host = getenv("ICECAST_HOST", "localhost")
icecast_port = getenv("ICECAST_PORT", "8001")
icecast_password = getenv("ICECAST_PASSWORD", "hackme")

# Log configuration
log("API URL: " ^ api_url)
log("Audio directory: " ^ audio_dir)
log("Music directory: " ^ music_dir)
log("Emergency directory: " ^ emergency_dir)
log("Icecast: " ^ icecast_host ^ ":" ^ icecast_port)

# Global reference for current segment
current_segment_id = ref("")
current_segment_title = ref("")

# Function to fetch next segments from API
# Now fetches more frequently to catch urgent/priority segments quickly
def fetch_segments() =
  log("Fetching segments from API (priority-aware)...")
  result = process.run("bash /radio/fetch-next.sh")
  log("Fetch result: #{result}")
end

# Function to fetch music tracks from API
def fetch_music() =
  log("Fetching music tracks...")
  result = process.run("bash /radio/music-scheduler.sh")
  log("Music fetch result: #{result}")
end

# Function to report now-playing to API
def report_now_playing(segment_id, title) =
  log("Reporting now-playing: " ^ segment_id ^ " - " ^ title)

  cmd = "curl -s -X POST " ^ api_url ^ "/playout/now-playing -H 'Content-Type: application/json' -d '{\"segment_id\": \"" ^ segment_id ^ "\", \"title\": \"" ^ title ^ "\", \"timestamp\": \"" ^ time.string() ^ "\"}'"

  _ = process.run(cmd)
end

# Fetch segments initially
fetch_segments()

# Fetch music initially
fetch_music()

# Schedule periodic fetch (every 10 seconds for faster priority detection)
# API returns segments ordered by priority, so urgent content (P8-P10)
# will be fetched and played first
thread.run(delay=10.0, every=10.0, fetch_segments)

# Schedule periodic music fetch (every 5 minutes)
thread.run(delay=60.0, every=300.0, fetch_music)

# Create playlist source from audio directory
# Note: Playlist reloads every 10 seconds to pick up newly fetched priority segments
# The fetch script already orders by priority, so higher priority segments
# will be naturally picked up first
# prefetch=15 ensures we always have tracks queued to prevent gaps
playlist_source = playlist(
  mode="randomize",
  reload=10,
  reload_mode="watch",
  prefetch=15,
  "/radio/audio"
)

# Extract metadata and report on_track
def on_track_metadata(m) =
  # Extract segment ID from filename
  filename = m["filename"]
  log("New track: " ^ filename)

  # Parse segment ID from filename (format: /path/to/SEGMENT_ID.wav)
  segment_id = string.replace(pattern=".*/([^/]+)\\.wav$", fun (s) -> s, filename)
  title = m["title"]

  # Update current segment reference
  current_segment_id := segment_id
  current_segment_title := title

  # Report to API
  report_now_playing(segment_id, title)

  # Return metadata
  m
end

# Function to mark segment as complete and cleanup audio file
def on_track_end(m) =
  segment_id = !current_segment_id
  filename = m["filename"]

  if segment_id != "" then
    log("Marking segment complete: #{segment_id}")

    cmd = "curl -s -X POST #{api_url}/playout/segment-complete/#{segment_id}"
    result = process.run(cmd)

    log("Complete result: #{result}")

    # Delete the audio file after successful completion
    # This prevents disk space accumulation from played segments
    audio_file = "#{audio_dir}/#{segment_id}.wav"
    log("Cleaning up audio file: #{audio_file}")

    delete_result = process.run("rm -f #{audio_file}")

    if delete_result.status == 0 then
      log("Successfully deleted: #{audio_file}")
    else
      log("Warning: Failed to delete #{audio_file}")
    end
  end
end

# Apply metadata handler
source = map_metadata(on_track_metadata, playlist_source)

# Apply on_end handler to mark segment complete when track finishes
source = source.on_end(on_track_end)

# Apply professional audio processing to talk segments
log("Applying professional audio processing to talk segments...")
source = eq_talk(source)
source = deess(source)
source = compress_talk(source)

# Emergency/fallback playlist
log("Loading emergency playlist from: " ^ emergency_dir)
emergency_playlist = playlist(
  mode="randomize",
  reload=60,
  emergency_dir
)

# Make emergency playlist safe (loop if empty)
emergency_source = mksafe(emergency_playlist)

# Music playlist
log("Loading music playlist from: " ^ music_dir)
music_playlist = playlist(
  mode="randomize",
  reload=60,
  reload_mode="watch",
  music_dir
)

# Apply professional audio processing to music
log("Applying professional audio processing to music...")
music_source = eq_music(music_playlist)
music_source = compress_music(music_source)

# Apply fade and normalize to music
music_source = fade.in(duration=2.0, music_source)
music_source = fade.out(duration=2.0, music_source)
music_source = normalize(music_source, target=-16.0)

# Dead air detection callbacks
def on_blank() =
  log("ALERT: Dead air detected! Switching to emergency playlist")

  # Report to API
  cmd = "curl -s -X POST " ^ api_url ^ "/playout/alerts/dead-air -H 'Content-Type: application/json' -d '{\"timestamp\": \"" ^ time.string() ^ "\", \"type\": \"dead_air\"}'"

  result = process.run(cmd)
  log("Alert sent to API: " ^ result)
end

def on_noise() =
  log("Audio restored, returning to normal playout")
end

# Apply blank detection to main source (detects silence > 5 seconds)
source = blank.detect(
  max_blank=5.0,
  on_noise=on_noise,
  blank.detect(max_blank=5.0, on_blank=on_blank, source)
)

# Fallback chain: talk segments -> music -> emergency playlist
# This creates a smart mixing where music plays when talk is not available
source = fallback(
  track_sensitive=true,
  [source, music_source, emergency_source]
)

# Strip blank (remove silence at start/end of tracks)
source = blank.strip(max_blank=2.0, source)

# Add crossfade between tracks (smooth transitions)
source = cross(duration=2.0, source)

# Apply master chain for broadcast-quality output
log("Applying master chain for broadcast quality...")
source = master_chain(source)

# Add final safety limiter
source = limit_output(source)

# Ensure no silence
source = mksafe(source)

# Output to Icecast (Opus)
output.icecast(
  %opus(bitrate=96, samplerate=48000, channels=2),
  host="icecast",  # Docker service name
  port=8001,
  password="hackme",
  mount="radio.opus",
  name="AI Radio 2525",
  description="Broadcasting from the year 2525 - AI Talk & Music",
  genre="Future Radio",
  url="https://radio2525.ai",
  source
)

# Output to Icecast (MP3 for compatibility)
output.icecast(
  %mp3(bitrate=128, samplerate=44100),
  host="icecast",  # Docker service name
  port=8001,
  password="hackme",
  mount="radio.mp3",
  name="AI Radio 2525",
  description="Broadcasting from the year 2525 - AI Talk & Music",
  genre="Future Radio",
  url="https://radio2525.ai",
  source
)

# Log startup
log("AI Radio 2525 with Professional Audio Processing started successfully")
log("Features: Compression, EQ, De-essing, Ducking, Master Limiter")
log("Target loudness: -16 LUFS | Broadcast-quality output")
