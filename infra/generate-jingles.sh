#!/usr/bin/env bash
# Generate station jingles using Piper TTS

set -e

PIPER_TTS_URL="${PIPER_TTS_URL:-http://localhost:5002}"
OUTPUT_DIR="${OUTPUT_DIR:-./generated-jingles}"

mkdir -p "$OUTPUT_DIR"

echo "🎵 Generating AI Radio 2525 Jingles"
echo "===================================="

# Jingle definitions (name|text pairs)
JINGLES=(
  "station_id_1|AI Radio 2525. Broadcasting from the future."
  "station_id_2|You're listening to AI Radio 2525."
  "station_id_3|This is AI Radio 2525. The voice of tomorrow."
  "news_intro|AI Radio 2525 News. Your window to the future."
  "culture_intro|AI Radio 2525 presents: Culture in the year 2525."
  "tech_intro|Technology Now, on AI Radio 2525."
  "interview_intro|AI Radio 2525 Interviews. Conversations from tomorrow."
  "transition_1|Stay tuned to AI Radio 2525."
  "transition_2|More ahead on AI Radio 2525."
)

# Generate each jingle
for jingle_def in "${JINGLES[@]}"; do
  # Split on pipe character
  key=$(echo "$jingle_def" | cut -d'|' -f1)
  text=$(echo "$jingle_def" | cut -d'|' -f2-)
  output_file="$OUTPUT_DIR/${key}.wav"

  echo "Generating: $key"

  # Call Piper TTS API (don't specify model, use default)
  response=$(curl -s -X POST "$PIPER_TTS_URL/synthesize" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$text\"}")

  # Check for errors
  if echo "$response" | grep -q '"error"'; then
    echo "  ❌ Error: $(echo "$response" | grep -o '"error":"[^"]*"')"
    continue
  fi

  # Extract hex-encoded audio from JSON response
  hex_audio=$(echo "$response" | grep -o '"audio":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$hex_audio" ]; then
    echo "  ❌ Failed to extract audio data"
    continue
  fi

  # Convert hex to binary WAV file
  echo "$hex_audio" | xxd -r -p > "$output_file"

  # Get duration from response
  duration=$(echo "$response" | grep -o '"duration_sec":[0-9.]*' | cut -d':' -f2)
  cached=$(echo "$response" | grep -o '"cached":[a-z]*' | cut -d':' -f2)

  echo "  ✓ $output_file (${duration}s, cached: $cached)"
done

echo ""
echo "✅ Jingles generated in $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "1. Review and edit audio files (add music, effects if needed)"
echo "2. Upload to Supabase storage using: node infra/upload-audio-library.js"
echo "3. View in admin interface at: http://localhost:3001/dashboard/music/jingles"
