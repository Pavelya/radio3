#!/usr/bin/env python3
from piper import PiperVoice

MODEL_PATH = 'models/en_US-lessac-medium.onnx'
voice = PiperVoice.load(MODEL_PATH)

print("Available methods on PiperVoice:")
for attr in dir(voice):
    if not attr.startswith('_'):
        print(f"  - {attr}")

print("\nVoice config:")
print(f"  Sample rate: {voice.config.sample_rate}")
print(f"  Num channels: {voice.config.num_channels if hasattr(voice.config, 'num_channels') else 1}")

# Try to get help
print("\nHelp on synthesize:")
help(voice.synthesize)
