#!/bin/bash
# Monitor live stream audio quality

STREAM_URL="${STREAM_URL:-http://localhost:8001/radio.mp3}"
DURATION="${DURATION:-30}"

echo "🎚️  Monitoring stream audio quality"
echo "Stream: $STREAM_URL"
echo "Duration: ${DURATION}s"
echo "=================================================="

# Record sample
TEMP_FILE="/tmp/stream_sample_$(date +%s).mp3"

echo "Recording sample..."
timeout $DURATION ffmpeg -i "$STREAM_URL" -t $DURATION "$TEMP_FILE" 2>/dev/null

if [ ! -f "$TEMP_FILE" ]; then
  echo "❌ Failed to record stream"
  exit 1
fi

echo "Analyzing audio..."
python3 scripts/analyze-audio.py "$TEMP_FILE"

# Cleanup
rm "$TEMP_FILE"
