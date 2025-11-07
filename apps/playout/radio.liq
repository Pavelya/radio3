#!/usr/bin/liquidsoap

# AI Radio 2525 - Liquidsoap Configuration
# Basic playout with API integration
#
# Docker networking notes:
# - API_URL: Set to host.docker.internal:8000 to reach API on host machine
# - Icecast: Accessed via service name "icecast" on internal port 8000
#   (exposed to host as port 8001 to avoid conflict with API)

# Configuration
settings.log.level := 4
settings.server.telnet := true
settings.server.telnet.port := 1234

# Environment variables
api_url = getenv("API_URL")
audio_dir = getenv("OUTPUT_DIR")
icecast_host = getenv("ICECAST_HOST")
icecast_port = getenv("ICECAST_PORT")
icecast_password = getenv("ICECAST_PASSWORD")

# Set defaults (used when running outside Docker)
api_url := if api_url == "" then "http://localhost:8000" else api_url end
audio_dir := if audio_dir == "" then "/radio/audio" else audio_dir end
icecast_host := if icecast_host == "" then "localhost" else icecast_host end
icecast_port := if icecast_port == "" then "8000" else icecast_port end
icecast_password := if icecast_password == "" then "hackme" else icecast_password end

# Log configuration
log("API URL: #{api_url}")
log("Audio directory: #{audio_dir}")
log("Icecast: #{icecast_host}:#{icecast_port}")

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
  log("Reporting now-playing: #{segment_id} - #{title}")

  cmd = "curl -s -X POST #{api_url}/playout/now-playing \
         -H 'Content-Type: application/json' \
         -d '{\"segment_id\": \"#{segment_id}\", \"title\": \"#{title}\", \"timestamp\": \"#{time.string()}\"}'"

  result = process.run(cmd)
  log("Report result: #{result}")
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
  "#{audio_dir}/*.wav"
)

# Extract metadata and report on_track
def on_track_metadata(m) =
  # Extract segment ID from filename
  filename = m["filename"]
  log("New track: #{filename}")

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

# Function to mark segment as complete
def on_track_end(m) =
  segment_id = !current_segment_id

  if segment_id != "" then
    log("Marking segment complete: #{segment_id}")

    cmd = "curl -s -X POST #{api_url}/playout/segment-complete/#{segment_id}"
    result = process.run(cmd)

    log("Complete result: #{result}")
  end
end

# Apply on_stop handler (called when track ends)
source = on_stop(on_track_end, source)

# Add blank detection (fallback to silence if no tracks)
source = mksafe(source)

# Normalize audio
source = normalize(source, gain_max=0.0, gain_min=-6.0, target=-16.0)

# Output to Icecast (Opus)
output.icecast(
  %opus(bitrate=96, samplerate=48000, channels=2),
  host=icecast_host,
  port=int_of_string(icecast_port),
  password=icecast_password,
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
  host=icecast_host,
  port=int_of_string(icecast_port),
  password=icecast_password,
  mount="radio.mp3",
  name="AI Radio 2525",
  description="Broadcasting from the year 2525",
  genre="Future Radio",
  url="https://radio2525.ai",
  source
)

# Log startup
log("AI Radio 2525 started successfully")
