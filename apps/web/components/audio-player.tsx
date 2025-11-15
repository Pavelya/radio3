'use client';

import { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
  streamUrl: string;
  fallbackUrl?: string;
}

export default function AudioPlayer({ streamUrl, fallbackUrl }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    // Enable audio on iOS after user interaction
    const enableAudio = () => {
      if (audioRef.current) {
        audioRef.current.load();
      }
    };

    // iOS requires user interaction before playing audio
    document.addEventListener('touchstart', enableAudio, { once: true });

    return () => {
      document.removeEventListener('touchstart', enableAudio);
    };
  }, []);

  const handlePlay = async () => {
    if (!audioRef.current) return;

    setLoading(true);
    setError(null);

    try {
      // Mobile Safari requires this
      audioRef.current.load();
      await audioRef.current.play();
      setPlaying(true);
    } catch (err: any) {
      // If primary stream fails and we have a fallback, try that
      if (fallbackUrl && !usingFallback) {
        setUsingFallback(true);
        setError('Switching to compatible stream format...');
        setTimeout(() => setError(null), 2000);
      } else {
        setError('Failed to play stream. Tap again to retry.');
        console.error('Playback error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  const currentStreamUrl = usingFallback && fallbackUrl ? fallbackUrl : streamUrl;

  return (
    <div className="bg-white rounded-lg shadow-xl p-8">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={currentStreamUrl}
        preload="none"
        onError={() => {
          if (fallbackUrl && !usingFallback) {
            setUsingFallback(true);
          } else {
            setError('Stream unavailable');
          }
        }}
      />

      {/* Play/Pause Button */}
      <div className="flex flex-col items-center space-y-6">
        <button
          onClick={playing ? handlePause : handlePlay}
          disabled={loading}
          className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl transition-all ${
            loading
              ? 'bg-gray-400 cursor-not-allowed'
              : playing
              ? 'bg-red-600 hover:bg-red-700 shadow-lg'
              : 'bg-blue-600 hover:bg-blue-700 shadow-lg'
          }`}
        >
          {loading ? (
            <div className="animate-spin">⏳</div>
          ) : playing ? (
            '⏸'
          ) : (
            '▶'
          )}
        </button>

        {/* Status */}
        <div className="text-center">
          {playing && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-gray-700">
                LIVE
              </span>
            </div>
          )}
          {!playing && !loading && (
            <span className="text-sm text-gray-500">
              Click to listen
            </span>
          )}
          {usingFallback && (
            <div className="text-xs text-gray-400 mt-1">
              Using MP3 format
            </div>
          )}
        </div>

        {/* Volume Control */}
        <div className="w-full max-w-xs space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>🔊 Volume</span>
            <span>{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
      </div>
    </div>
  );
}
