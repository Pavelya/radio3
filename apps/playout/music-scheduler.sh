#!/bin/bash
# Music scheduler - fetches appropriate music based on time and context

API_URL="${API_URL:-http://localhost:8000}"
OUTPUT_DIR="${OUTPUT_DIR:-/radio/audio/music}"

mkdir -p "$OUTPUT_DIR"

# Get current time context
HOUR=$(date +%H)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday

# Determine time of day
if [ $HOUR -ge 6 ] && [ $HOUR -lt 12 ]; then
  TIME_OF_DAY="morning"
  MOOD="energetic"
elif [ $HOUR -ge 12 ] && [ $HOUR -lt 18 ]; then
  TIME_OF_DAY="afternoon"
  MOOD="calm"
elif [ $HOUR -ge 18 ] && [ $HOUR -lt 23 ]; then
  TIME_OF_DAY="evening"
  MOOD="calm"
else
  TIME_OF_DAY="night"
  MOOD="ambient"
fi

echo "Current time context: $TIME_OF_DAY (mood: $MOOD)"

# Fetch music tracks
RESPONSE=$(curl -s -X POST "$API_URL/music/next-track" \
  -H "Content-Type: application/json" \
  -d "{\"mood\":\"$MOOD\",\"time_of_day\":\"$TIME_OF_DAY\"}")

if [ $? -ne 0 ]; then
  echo "Error: Failed to fetch music track"
  exit 1
fi

TRACK_ID=$(echo "$RESPONSE" | jq -r '.id')
AUDIO_URL=$(echo "$RESPONSE" | jq -r '.audio_url')
TITLE=$(echo "$RESPONSE" | jq -r '.title')
ARTIST=$(echo "$RESPONSE" | jq -r '.artist')

if [ "$TRACK_ID" == "null" ]; then
  echo "No suitable track found"
  exit 0
fi

OUTPUT_FILE="$OUTPUT_DIR/music_$TRACK_ID.mp3"

# Skip if already downloaded
if [ -f "$OUTPUT_FILE" ]; then
  echo "Already cached: $TITLE by $ARTIST"
  exit 0
fi

# Download track
echo "Downloading: $TITLE by $ARTIST"
curl -s -o "$OUTPUT_FILE.tmp" "$AUDIO_URL"

if [ $? -eq 0 ]; then
  mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"
  echo "Downloaded: $OUTPUT_FILE"

  # Create metadata file for Liquidsoap
  echo "$TITLE - $ARTIST" > "$OUTPUT_FILE.txt"
else
  echo "Error downloading track"
  rm -f "$OUTPUT_FILE.tmp"
  exit 1
fi
