#!/usr/bin/env python3
from piper import PiperVoice
import wave
import sys
import os
import subprocess

MODEL_PATH = 'models/en_US-lessac-medium.onnx'
OUTPUT_FILE = '/tmp/piper-test.wav'
TEXT = "Hello from the future, this is AI Radio 2525."

print(f"Loading model: {MODEL_PATH}")
voice = PiperVoice.load(MODEL_PATH)
print("Model loaded")

print(f"Synthesizing: {TEXT}")
print(f"Output: {OUTPUT_FILE}")

# Synthesize using the synthesize_wav method
with wave.open(OUTPUT_FILE, 'wb') as wav_file:
    voice.synthesize_wav(TEXT, wav_file)

print(f"Done! Check {OUTPUT_FILE}")
print(f"File size: {os.path.getsize(OUTPUT_FILE)} bytes")
