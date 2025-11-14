#!/bin/sh
# Cleanup old audio files from cache
# This is a safety net to catch any files that weren't deleted by Liquidsoap
# Handles both playout cache (24h) and TTS cache (48h)

PLAYOUT_DIR="${OUTPUT_DIR:-/radio/audio}"
TTS_DIR="${TTS_CACHE_DIR:-/radio/tts-cache}"
PLAYOUT_MAX_AGE_HOURS="${MAX_AGE_HOURS:-24}"
TTS_MAX_AGE_HOURS="${TTS_MAX_AGE_HOURS:-48}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

cleanup_directory() {
  local DIR=$1
  local MAX_AGE_HOURS=$2
  local LABEL=$3

  # Convert hours to minutes for find command
  local MAX_AGE_MINUTES=$((MAX_AGE_HOURS * 60))

  log "[$LABEL] Starting cleanup (files older than ${MAX_AGE_HOURS} hours)..."

  # Check if directory exists
  if [ ! -d "$DIR" ]; then
    log "[$LABEL] Warning: Directory does not exist: $DIR"
    return
  fi

  # Count files before cleanup
  local BEFORE_COUNT=$(find "$DIR" -name "*.wav" -type f 2>/dev/null | wc -l)
  log "[$LABEL] Found $BEFORE_COUNT .wav files in cache"

  # Find and delete files older than MAX_AGE_HOURS
  local DELETED=0
  find "$DIR" -name "*.wav" -type f -mmin +${MAX_AGE_MINUTES} 2>/dev/null | while IFS= read -r file; do
    if [ -f "$file" ]; then
      log "[$LABEL] Deleting old file: $(basename "$file")"
      rm -f "$file"
      DELETED=$((DELETED + 1))
    fi
  done

  # Count files after cleanup
  local AFTER_COUNT=$(find "$DIR" -name "*.wav" -type f 2>/dev/null | wc -l)

  log "[$LABEL] Cleanup complete: Deleted $DELETED files, $AFTER_COUNT files remaining"

  # Calculate disk usage
  if command -v du &> /dev/null; then
    local DISK_USAGE=$(du -sh "$DIR" 2>/dev/null | cut -f1)
    log "[$LABEL] Current cache size: $DISK_USAGE"
  fi
}

log "=========================================="
log "Cache Cleanup Service Started"
log "=========================================="

# Cleanup playout cache (24 hours)
cleanup_directory "$PLAYOUT_DIR" "$PLAYOUT_MAX_AGE_HOURS" "PLAYOUT"

echo ""

# Cleanup TTS cache (48 hours)
cleanup_directory "$TTS_DIR" "$TTS_MAX_AGE_HOURS" "TTS"

log "=========================================="
log "All cache cleanup complete"
log "=========================================="

exit 0
