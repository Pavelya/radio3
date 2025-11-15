#!/usr/bin/env python3
"""
Analyze audio quality metrics
"""

import sys
import subprocess
import json

def analyze_lufs(audio_file):
    """Measure LUFS (loudness) of audio file"""
    cmd = [
        'ffmpeg', '-i', audio_file,
        '-af', 'loudnorm=print_format=json',
        '-f', 'null', '-'
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    # Parse JSON output from stderr
    output = result.stderr

    # Extract LUFS values
    if 'input_i' in output:
        lines = output.split('\n')
        for i, line in enumerate(lines):
            if 'input_i' in line:
                # Parse JSON block
                json_start = i
                json_lines = []
                for j in range(i, len(lines)):
                    json_lines.append(lines[j])
                    if '}' in lines[j]:
                        break

                json_str = '\n'.join(json_lines)
                try:
                    data = json.loads(json_str)
                    return {
                        'integrated': float(data.get('input_i', 0)),
                        'true_peak': float(data.get('input_tp', 0)),
                        'lra': float(data.get('input_lra', 0)),
                        'threshold': float(data.get('input_thresh', 0))
                    }
                except:
                    pass

    return None

def main():
    if len(sys.argv) < 2:
        print("Usage: analyze-audio.py <audio-file>")
        sys.exit(1)

    audio_file = sys.argv[1]

    print(f"Analyzing: {audio_file}")
    print("=" * 50)

    lufs = analyze_lufs(audio_file)

    if lufs:
        print(f"Integrated LUFS: {lufs['integrated']:.1f} LUFS")
        print(f"True Peak:       {lufs['true_peak']:.1f} dBTP")
        print(f"Loudness Range:  {lufs['lra']:.1f} LU")
        print(f"Threshold:       {lufs['threshold']:.1f} LUFS")

        print("\nBroadcast Standards:")
        print("  EBU R128:  -23 LUFS")
        print("  Streaming: -14 to -16 LUFS")
        print("  Our target: -16 LUFS")

        # Check compliance
        target = -16.0
        tolerance = 2.0

        if abs(lufs['integrated'] - target) <= tolerance:
            print(f"\n✅ Audio is within target range ({target}±{tolerance} LUFS)")
        else:
            print(f"\n❌ Audio outside target range")
            print(f"   Adjustment needed: {target - lufs['integrated']:.1f} dB")
    else:
        print("❌ Failed to analyze audio")

if __name__ == "__main__":
    main()
