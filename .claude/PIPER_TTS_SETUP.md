# Piper TTS Setup Guide

**Version:** 1.0
**Last Updated:** 2025-01-01

This guide covers installing and running Piper TTS for AI Radio 2525.

---

## Overview

Piper is a fast, local neural text-to-speech system. We use it because:
- Free and open-source
- Runs locally (no API costs)
- High quality neural voices
- Fast inference on CPU
- Multiple languages and voices

---

## Prerequisites

- Linux or macOS (Windows via WSL)
- Python 3.8+
- ~2GB disk space for models

---

## Installation

### Option 1: Install via pip (Recommended)

```bash
# Install Piper
pip install piper-tts

# Verify installation
piper --version
```

### Option 2: Install from source

```bash
# Clone repository
git clone https://github.com/rhasspy/piper.git
cd piper/src/python

# Install
pip install -e .
```

---

## Downloading Voice Models

### Manual Download

Visit [Piper Voices](https://github.com/rhasspy/piper/blob/master/VOICES.md) and download models:

```bash
# Create models directory
mkdir -p ~/.local/share/piper/models

# Download a model (example: US English male)
cd ~/.local/share/piper/models
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

### Recommended Models for AI Radio 2525

Based on our voices table (D12), download these models:

```bash
cd ~/.local/share/piper/models

# US English voices
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json

wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json

# UK English voices
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json
```

### Automatic Download Script

Create `infra/download-voices.sh`:

```bash
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
```

---

## Running Piper as HTTP Server

Piper doesn't include an HTTP server by default, so we'll create one.

### Create HTTP Server

Create `workers/tts-server/server.py`:

```python
#!/usr/bin/env python3
"""
Piper TTS HTTP Server
Exposes Piper TTS via HTTP API for AI Radio 2525
"""

import os
import json
import hashlib
from pathlib import Path
from flask import Flask, request, jsonify
from piper import PiperVoice
import wave
import io

app = Flask(__name__)

# Configuration
MODELS_DIR = Path(os.getenv('PIPER_MODELS_DIR', Path.home() / '.local/share/piper/models'))
CACHE_DIR = Path(os.getenv('PIPER_CACHE_DIR', '/tmp/piper-cache'))
CACHE_DIR.mkdir(exist_ok=True)

# Loaded models cache
loaded_models = {}

def load_model(model_name: str):
    """Load a Piper model (cached)"""
    if model_name in loaded_models:
        return loaded_models[model_name]

    model_path = MODELS_DIR / f"{model_name}.onnx"
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    voice = PiperVoice.load(str(model_path))
    loaded_models[model_name] = voice
    return voice

@app.route('/synthesize', methods=['POST'])
def synthesize():
    """
    Synthesize speech from text

    Body: {
      "text": "Hello from the future",
      "model": "en_US-lessac-medium",
      "speed": 1.0,
      "use_cache": true
    }

    Returns: {
      "audio": "hex-encoded WAV data",
      "duration_sec": 2.5,
      "model": "en_US-lessac-medium",
      "cached": false
    }
    """
    data = request.json

    text = data.get('text')
    model_name = data.get('model', 'en_US-lessac-medium')
    speed = float(data.get('speed', 1.0))
    use_cache = data.get('use_cache', True)

    if not text:
        return jsonify({'error': 'Missing text parameter'}), 400

    # Check cache
    cache_key = hashlib.md5(f"{text}:{model_name}:{speed}".encode()).hexdigest()
    cache_file = CACHE_DIR / f"{cache_key}.wav"

    if use_cache and cache_file.exists():
        with open(cache_file, 'rb') as f:
            audio_data = f.read()

        # Calculate duration
        with wave.open(cache_file, 'rb') as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            duration = frames / float(rate)

        return jsonify({
            'audio': audio_data.hex(),
            'duration_sec': round(duration, 2),
            'model': model_name,
            'cached': True
        })

    # Synthesize
    try:
        voice = load_model(model_name)

        # Generate audio
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wav_file:
            voice.synthesize(text, wav_file, length_scale=1.0/speed)

        audio_data = wav_buffer.getvalue()

        # Save to cache
        if use_cache:
            with open(cache_file, 'wb') as f:
                f.write(audio_data)

        # Calculate duration
        with wave.open(io.BytesIO(audio_data), 'rb') as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            duration = frames / float(rate)

        return jsonify({
            'audio': audio_data.hex(),
            'duration_sec': round(duration, 2),
            'model': model_name,
            'cached': False
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/models', methods=['GET'])
def list_models():
    """List available models"""
    models = []
    for model_file in MODELS_DIR.glob('*.onnx'):
        model_name = model_file.stem
        models.append(model_name)

    return jsonify({'models': models})

@app.route('/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({'status': 'ok', 'loaded_models': len(loaded_models)})

if __name__ == '__main__':
    port = int(os.getenv('PIPER_TTS_PORT', 5002))
    app.run(host='0.0.0.0', port=port, debug=False)
```

### Install Server Dependencies

Create `workers/tts-server/requirements.txt`:

```
flask==3.0.0
piper-tts==1.2.0
```

Install:
```bash
cd workers/tts-server
pip install -r requirements.txt
```

### Run Server

```bash
# Development
python workers/tts-server/server.py

# Or with custom port
PIPER_TTS_PORT=5002 python workers/tts-server/server.py
```

---

## Testing

### Test Voice Synthesis

```bash
curl -X POST http://localhost:5002/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from the future. This is AI Radio 2525.",
    "model": "en_US-lessac-medium",
    "speed": 1.0,
    "use_cache": false
  }' | jq -r '.audio' | xxd -r -p > test.wav

# Play the audio
afplay test.wav  # macOS
# or
aplay test.wav   # Linux
```

### Test Model Listing

```bash
curl http://localhost:5002/models | jq
```

### Test Health Check

```bash
curl http://localhost:5002/health
```

---

## Production Deployment

### Create Systemd Service

Create `/etc/systemd/system/piper-tts.service`:

```ini
[Unit]
Description=Piper TTS HTTP Server
After=network.target

[Service]
Type=simple
User=radio
WorkingDirectory=/opt/ai-radio-2525
Environment="PIPER_MODELS_DIR=/opt/ai-radio-2525/models"
Environment="PIPER_CACHE_DIR=/var/cache/piper-tts"
Environment="PIPER_TTS_PORT=5002"
ExecStart=/usr/bin/python3 /opt/ai-radio-2525/workers/tts-server/server.py
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable piper-tts
sudo systemctl start piper-tts
sudo systemctl status piper-tts
```

---

## Troubleshooting

### Model Not Found

**Error:** `FileNotFoundError: Model not found`

**Solution:** Download the model:
```bash
./infra/download-voices.sh
```

### Port Already in Use

**Error:** `Address already in use`

**Solution:** Change port:
```bash
PIPER_TTS_PORT=5003 python workers/tts-server/server.py
```

### Slow Synthesis

**Symptom:** Synthesis takes >5 seconds

**Solutions:**
- Use `medium` quality models instead of `high`
- Enable caching with `use_cache: true`
- Consider running on GPU (requires ONNX Runtime GPU)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPER_MODELS_DIR` | `~/.local/share/piper/models` | Where voice models are stored |
| `PIPER_CACHE_DIR` | `/tmp/piper-cache` | Where synthesized audio is cached |
| `PIPER_TTS_PORT` | `5002` | HTTP server port |

---

## Next Steps

After setup, proceed to:
- **G1:** Piper TTS HTTP Server (integration with workers)
- **G2:** Piper TTS Cache Layer (optimize for production)

---

## References

- [Piper TTS GitHub](https://github.com/rhasspy/piper)
- [Available Voices](https://github.com/rhasspy/piper/blob/master/VOICES.md)
- [Piper Documentation](https://rhasspy.github.io/piper-samples/)
