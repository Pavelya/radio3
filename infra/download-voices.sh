#!/bin/bash
# Download required Piper TTS models

set -e

MODELS_DIR="${PIPER_MODELS_DIR:-$HOME/.local/share/piper/models}"
mkdir -p "$MODELS_DIR"

echo "Downloading Piper TTS models to $MODELS_DIR"

VOICES=(
  "en/en_US/lessac/medium"
  "en/en_US/amy/medium"
  "en/en_US/ryan/medium"
  "en/en_GB/alan/medium"
)

for voice in "${VOICES[@]}"; do
  MODEL_NAME=$(basename "$voice")
  LANG_PATH=$(dirname "$voice")

  echo "Downloading $MODEL_NAME..."

  wget -q -P "$MODELS_DIR" \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/$voice/${MODEL_NAME}.onnx"

  wget -q -P "$MODELS_DIR" \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/$voice/${MODEL_NAME}.onnx.json"

  echo "✓ $MODEL_NAME downloaded"
done

echo "✓ All models downloaded successfully"
