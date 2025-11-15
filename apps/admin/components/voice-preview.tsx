'use client';

import { useState } from 'react';

interface VoicePreviewProps {
  turnId: string;
  text: string;
  audioPath?: string;
  durationSec?: number;
}

export default function VoicePreview({
  turnId,
  text,
  audioPath,
  durationSec,
}: VoicePreviewProps) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePlay = async () => {
    if (!audioPath) return;

    setPlaying(true);
    setError(null);

    try {
      // TODO: Implement audio playback
      // This will require either:
      // 1. Storing individual turn audio in Supabase Storage
      // 2. Creating an API route to serve the temp audio files
      // For now, this is a placeholder

      console.log('Playing audio for turn:', turnId, 'from path:', audioPath);

      // Simulate playback delay
      setTimeout(() => {
        setPlaying(false);
      }, (durationSec || 3) * 1000);

    } catch (err) {
      setError('Failed to play audio');
      setPlaying(false);
    }
  };

  return (
    <div className="flex items-center space-x-3 mt-2">
      {audioPath && (
        <>
          <button
            onClick={handlePlay}
            disabled={playing}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              playing
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {playing ? '▶ Playing...' : '▶ Play Turn'}
          </button>

          {durationSec && (
            <div className="text-xs text-gray-600">
              {durationSec.toFixed(1)}s
            </div>
          )}
        </>
      )}

      <div className="text-xs text-gray-500">
        {text.length} chars
      </div>

      {error && (
        <div className="text-xs text-red-600">
          {error}
        </div>
      )}

      {!audioPath && (
        <div className="text-xs text-gray-400 italic">
          Audio not synthesized yet
        </div>
      )}
    </div>
  );
}
