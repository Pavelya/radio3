#!/bin/bash
# Generate fallback audio for emergency playlist
# Creates simple audio files using ffmpeg

set -e

echo "Generating emergency fallback audio..."

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
  echo "Error: ffmpeg is required but not installed"
  echo "Install with: brew install ffmpeg"
  exit 1
fi

# Station ID beep (1 second beep at 1000 Hz)
echo "Creating station ID beep..."
ffmpeg -f lavfi -i "sine=frequency=1000:duration=1" \
  -ar 48000 -ac 1 -y 01-station-id.wav

# Technical difficulties tone (5 second beep at 800 Hz)
echo "Creating technical difficulties tone..."
ffmpeg -f lavfi -i "sine=frequency=800:duration=5" \
  -ar 48000 -ac 1 -y 02-technical-difficulties.wav

# Standby tone (3 second beep at 600 Hz)
echo "Creating standby tone..."
ffmpeg -f lavfi -i "sine=frequency=600:duration=3" \
  -ar 48000 -ac 1 -y 03-standby.wav

# Interval signal (alternating 400/600 Hz, 10 seconds)
echo "Creating interval signal..."
ffmpeg -f lavfi -i "sine=frequency=400:duration=10" \
  -f lavfi -i "sine=frequency=600:duration=10" \
  -filter_complex "[0:a][1:a]amerge=inputs=2,pan=mono|c0=c0+c1[a]" \
  -map "[a]" -ar 48000 -y 04-interval-signal.wav

# Silence (10 seconds)
echo "Creating silence..."
ffmpeg -f lavfi -i "anullsrc=r=48000:cl=mono" -t 10 -y 05-silence.wav

echo ""
echo "Emergency fallback audio generated successfully!"
echo ""
echo "Files created:"
ls -lh *.wav 2>/dev/null || true
echo ""
echo "To add custom voice messages, replace these files with your own WAV files."
echo "Format: 48kHz, mono, WAV"
