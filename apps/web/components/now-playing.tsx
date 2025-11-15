'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface NowPlayingData {
  title: string;
  dj?: string;
  artist?: string;
  isMusic?: boolean;
  attribution?: string;
  startedAt: string;
}

export default function NowPlaying() {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchNowPlaying = async () => {
      try {
        // Fetch from Icecast status
        const response = await fetch('http://localhost:8001/status-json.xsl');

        if (!response.ok) {
          throw new Error('Failed to fetch status');
        }

        const data = await response.json();

        // Handle both single source and array of sources
        const source = Array.isArray(data.icestats?.source)
          ? data.icestats.source[0]
          : data.icestats?.source;

        if (source) {
          const title = source.title || source.server_name || 'AI Radio 2525';
          const artist = source.artist;

          // Determine if music (has artist field and not default station name) or talk
          const isMusic = artist && artist !== 'AI Radio 2525' && title !== 'AI Radio 2525';

          setNowPlaying({
            title: title,
            artist: artist,
            isMusic: isMusic,
            dj: isMusic ? undefined : artist,
            startedAt: new Date().toISOString(),
          });
          setError(false);
        }
      } catch (err) {
        console.error('Failed to fetch now playing:', err);
        setError(true);
        // Set fallback data when stream info unavailable
        setNowPlaying({
          title: 'AI Radio 2525',
          dj: undefined,
          startedAt: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchNowPlaying();

    // Poll every 10 seconds
    const interval = setInterval(fetchNowPlaying, 10000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2 mx-auto" />
        <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
      </div>
    );
  }

  if (!nowPlaying) {
    return (
      <div className="text-gray-500 text-center">
        <p>No information available</p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-2">
      {/* Music or Talk indicator */}
      {nowPlaying.isMusic ? (
        <>
          <div className="text-sm text-gray-400 uppercase tracking-wide">
            Now Playing
          </div>
          <h2 className="text-2xl font-bold text-white">
            {nowPlaying.title}
          </h2>
          <p className="text-lg text-gray-300">
            {nowPlaying.artist}
          </p>
          {nowPlaying.attribution && (
            <p className="text-xs text-gray-500 italic">
              {nowPlaying.attribution}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="text-sm text-gray-400 uppercase tracking-wide">
            On Air
          </div>
          <h2 className="text-2xl font-bold text-white">
            {nowPlaying.title}
          </h2>
          {nowPlaying.dj && (
            <p className="text-lg text-gray-300">
              with {nowPlaying.dj}
            </p>
          )}
        </>
      )}

      <p className="text-sm text-gray-400">
        Started {formatDistanceToNow(new Date(nowPlaying.startedAt), { addSuffix: true })}
      </p>
      {error && (
        <p className="text-xs text-yellow-400 mt-2">
          Live metadata unavailable
        </p>
      )}
    </div>
  );
}
