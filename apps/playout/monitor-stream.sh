#!/bin/bash
# Monitor stream for dead air and availability
#
# Usage:
#   ./monitor-stream.sh                    # Monitor with defaults
#   STREAM_URL=http://... ./monitor-stream.sh   # Custom stream URL
#   CHECK_INTERVAL=60 ./monitor-stream.sh       # Custom interval

STREAM_URL="${STREAM_URL:-http://localhost:8001/radio.opus}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"

echo "========================================="
echo "AI Radio 2525 - Stream Monitor"
echo "========================================="
echo "Stream URL: $STREAM_URL"
echo "Check interval: ${CHECK_INTERVAL}s"
echo "========================================="
echo ""

# Function to check stream
check_stream() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  # Check HTTP status
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$STREAM_URL" --max-time 10)

  if [ "$HTTP_CODE" = "200" ]; then
    echo "[$timestamp] ✓ Stream OK (HTTP $HTTP_CODE)"
    return 0
  else
    echo "[$timestamp] ✗ ERROR: Stream not accessible (HTTP $HTTP_CODE)"
    return 1
  fi
}

# Monitor loop
while true; do
  check_stream
  sleep "$CHECK_INTERVAL"
done
