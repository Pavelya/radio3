'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase';

interface AudioPlayerProps {
  assetId: string;
  storagePath: string;
}

export default function AudioPlayer({ assetId, storagePath }: AudioPlayerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const supabase = createClient();

  const loadAudio = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.storage
        .from('audio-assets')
        .createSignedUrl(storagePath, 3600); // 1 hour URL

      if (error) throw error;

      setAudioUrl(data.signedUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = async () => {
    if (!audioUrl) {
      await loadAudio();
      return;
    }

    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const handleDownload = async () => {
    if (!audioUrl) {
      await loadAudio();
    }

    if (audioUrl) {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = `segment-${assetId}.wav`;
      link.click();
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded">
      {error && (
        <div className="text-red-600 text-sm mb-2">{error}</div>
      )}

      <div className="flex items-center space-x-4">
        <button
          onClick={handlePlayPause}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : playing ? '⏸ Pause' : '▶ Play'}
        </button>

        <button
          onClick={handleDownload}
          disabled={loading}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
        >
          ⬇ Download
        </button>

        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        )}
      </div>

      {audioUrl && (
        <div className="mt-4">
          <audio
            controls
            src={audioUrl}
            className="w-full"
            ref={audioRef}
          />
        </div>
      )}
    </div>
  );
}
