from flask import Flask, request, jsonify, send_file
from piper import PiperVoice
import hashlib
import os
import io
import wave

app = Flask(__name__)

# Configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.getenv('PIPER_MODEL', os.path.join(SCRIPT_DIR, 'models', 'en_US-lessac-medium.onnx'))
CACHE_DIR = os.getenv('CACHE_DIR', os.path.join(SCRIPT_DIR, '../../cache/tts'))
PORT = int(os.getenv('PORT', 5002))

# Load voice model on startup
print(f"Loading Piper voice model: {MODEL_PATH}")
voice = PiperVoice.load(MODEL_PATH)
print("Voice model loaded successfully")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "model": MODEL_PATH,
        "cache_dir": CACHE_DIR
    })

@app.route('/synthesize', methods=['POST'])
def synthesize():
    data = request.json
    text = data.get('text', '')
    use_cache = data.get('use_cache', True)

    if not text:
        return jsonify({"error": "Text is required"}), 400

    # Generate cache key from text
    cache_key = hashlib.sha256(text.encode()).hexdigest()
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.wav")

    # Return cached audio if available
    if use_cache and os.path.exists(cache_file):
        print(f"Cache hit: {cache_key[:8]}...")
        with open(cache_file, 'rb') as f:
            audio_data = f.read()

        # Calculate duration from cached file
        with wave.open(cache_file, 'rb') as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            duration_sec = frames / float(rate)

        return jsonify({
            "audio": audio_data.hex(),
            "duration_sec": round(duration_sec, 2),
            "cached": True
        })

    print(f"Synthesizing: {text[:50]}...")

    # Synthesize speech to BytesIO using synthesize_wav
    audio_stream = io.BytesIO()
    with wave.open(audio_stream, 'wb') as wav_file:
        voice.synthesize_wav(text, wav_file)

    # Get the audio data
    audio_data = audio_stream.getvalue()
    print(f"Generated {len(audio_data)} bytes of audio")

    # Calculate duration
    audio_stream.seek(0)
    with wave.open(audio_stream, 'rb') as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        duration_sec = frames / float(rate)

    # Save to cache
    if use_cache:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(cache_file, 'wb') as f:
            f.write(audio_data)
        print(f"Cached: {cache_key[:8]}...")

    # Return JSON response with hex-encoded audio
    return jsonify({
        "audio": audio_data.hex(),
        "duration_sec": round(duration_sec, 2),
        "cached": False
    })

if __name__ == '__main__':
    print(f"Starting Piper TTS server on port {PORT}")
    app.run(host='0.0.0.0', port=PORT)
