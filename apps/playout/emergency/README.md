# Emergency Playlist

This directory contains fallback audio for dead air situations.

## Requirements

- Files should be WAV format, 48kHz, mono
- Total duration should cover at least 1 hour
- Content should be generic station IDs, music, etc.

## Setup

1. Add WAV files to this directory
2. Name files with prefix for ordering: `01-station-id.wav`, `02-music.wav`, etc.
3. Liquidsoap will automatically load them as fallback

## Generation

Use the `generate-fallback.sh` script to create placeholder emergency audio using TTS.
