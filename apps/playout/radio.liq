#!/usr/bin/liquidsoap

# AI Radio 2525 - Liquidsoap Configuration
# Basic playout with API integration
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

# Environment variables with defaults
api_url = getenv("API_URL", "http://localhost:8000")
audio_dir = getenv("OUTPUT_DIR", "/radio/audio")
icecast_host = getenv("ICECAST_HOST", "localhost")
icecast_port = getenv("ICECAST_PORT", "8001")
icecast_password = getenv("ICECAST_PASSWORD", "hackme")

# Log configuration
log("API URL: " ^ api_url)
log("Audio directory: " ^ audio_dir)
log("Icecast: " ^ icecast_host ^ ":" ^ icecast_port)

# Global reference for current segment
current_segment_id = ref("")
current_segment_title = ref("")

# Function to fetch next segments from API
def fetch_segments() =
  log("Fetching segments from API...")
  result = process.run("bash /radio/fetch-next.sh")
  log("Fetch result: #{result}")
end

# Function to report now-playing to API
def report_now_playing(segment_id, title) =
  log("Reporting now-playing: " ^ segment_id ^ " - " ^ title)

  cmd = "curl -s -X POST " ^ api_url ^ "/playout/now-playing -H 'Content-Type: application/json' -d '{\"segment_id\": \"" ^ segment_id ^ "\", \"title\": \"" ^ title ^ "\", \"timestamp\": \"" ^ time.string() ^ "\"}'"

  _ = process.run(cmd)
end

# Fetch segments initially
fetch_segments()

# Schedule periodic fetch (every 15 seconds)
thread.run(delay=15.0, every=15.0, fetch_segments)

# Create playlist source from audio directory
playlist_source = playlist(
  mode="randomize",
  reload=15,
  reload_mode="watch",
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

# Apply metadata handler
source = map_metadata(on_track_metadata, playlist_source)

# TODO: Track completion callback not yet implemented in Liquidsoap 2.x
# Will be added in future version with proper event handling

# Add blank detection (fallback to silence if no tracks)
source = mksafe(source)

# Normalize audio
source = normalize(source, gain_max=0.0, gain_min=-6.0, target=-16.0)

# Output to Icecast (Opus)
output.icecast(
  %opus(bitrate=96, samplerate=48000, channels=2),
  host="icecast",  # Docker service name
  port=8001,
  password="hackme",
  mount="radio.opus",
  name="AI Radio 2525",
  description="Broadcasting from the year 2525",
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
  description="Broadcasting from the year 2525",
  genre="Future Radio",
  url="https://radio2525.ai",
  source
)

# Log startup
log("AI Radio 2525 started successfully")
