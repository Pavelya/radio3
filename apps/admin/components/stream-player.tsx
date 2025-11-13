'use client';

import { useState, useRef } from 'react';

export function StreamPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Use port 8001 for Icecast stream (Docker configuration)
  const streamUrl = 'http://localhost:8001/radio.opus';

  const togglePlay = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      setError(null);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
        setError(null);
      } catch (err) {
        setIsPlaying(false);
        setError('Stream unavailable. Make sure Icecast server is running on port 8001.');
      }
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow mb-6">
      <h3 className="text-sm font-semibold mb-2">Live Stream Preview</h3>
      <audio ref={audioRef} src={streamUrl} />
      <button
        onClick={togglePlay}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPlaying ? '⏸ Pause' : '▶ Play Live'}
      </button>
      <p className="text-xs text-gray-500 mt-2">
        Stream: {streamUrl}
      </p>
      {error && (
        <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
