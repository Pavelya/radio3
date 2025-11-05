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
