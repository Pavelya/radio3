#!/bin/bash
# Fetch next segments from API and download audio

API_URL="${API_URL:-http://localhost:8000}"
OUTPUT_DIR="${OUTPUT_DIR:-/radio/audio}"
LIMIT="${LIMIT:-10}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Fetch next segments
RESPONSE=$(curl -s "$API_URL/playout/next?limit=$LIMIT")

if [ $? -ne 0 ]; then
  echo "Error: Failed to fetch segments from API" >&2
  exit 1
fi

# Parse and download segments
echo "$RESPONSE" | jq -r '.segments[] | @json' | while read -r segment; do
  SEGMENT_ID=$(echo "$segment" | jq -r '.id')
  AUDIO_URL=$(echo "$segment" | jq -r '.audio_url')
  TITLE=$(echo "$segment" | jq -r '.title')

  OUTPUT_FILE="$OUTPUT_DIR/$SEGMENT_ID.wav"

  # Skip if already downloaded
  if [ -f "$OUTPUT_FILE" ]; then
    echo "Already cached: $SEGMENT_ID"
    continue
  fi

  # Download audio
  echo "Downloading: $TITLE ($SEGMENT_ID)"
  curl -s -o "$OUTPUT_FILE.tmp" "$AUDIO_URL"

  if [ $? -eq 0 ]; then
    mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"
    echo "Downloaded: $OUTPUT_FILE"
  else
    echo "Error downloading: $SEGMENT_ID" >&2
    rm -f "$OUTPUT_FILE.tmp"
  fi
done

# List available segments
ls -1 "$OUTPUT_DIR"/*.wav 2>/dev/null || echo "No segments available"
