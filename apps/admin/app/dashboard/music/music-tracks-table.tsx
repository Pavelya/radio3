'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration_sec: number;
  license_type: string;
  play_count: number;
  active: boolean;
  reviewed: boolean;
  mood?: string;
  music_genres?: { name: string } | null;
}

interface MusicTracksTableProps {
  initialTracks: MusicTrack[];
}

export default function MusicTracksTable({ initialTracks }: MusicTracksTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [moodFilter, setMoodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  // Filter tracks based on search and filters
  const filteredTracks = useMemo(() => {
    return initialTracks.filter((track) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = track.title.toLowerCase().includes(query);
        const matchesArtist = track.artist.toLowerCase().includes(query);
        if (!matchesTitle && !matchesArtist) return false;
      }

      // Mood filter
      if (moodFilter && track.mood !== moodFilter) return false;

      // Status filter
      if (statusFilter === 'active' && !track.active) return false;
      if (statusFilter === 'inactive' && track.active) return false;
      if (statusFilter === 'reviewed' && !track.reviewed) return false;
      if (statusFilter === 'unreviewed' && track.reviewed) return false;

      return true;
    });
  }, [initialTracks, searchQuery, moodFilter, statusFilter]);

  const handleDelete = async (track: MusicTrack) => {
    if (!confirm(`Delete "${track.title}"? This cannot be undone.`)) {
      return;
    }

    setDeleting(track.id);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/music/tracks/${track.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Delete failed');
      }

      // Refresh the page to show updated data
      router.refresh();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete track');
      setDeleting(null);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Search and Filters */}
      <div className="mb-6 flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Search
          </label>
          <input
            type="text"
            placeholder="Search by title or artist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Mood
          </label>
          <select
            value={moodFilter}
            onChange={(e) => setMoodFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Moods</option>
            <option value="energetic">Energetic</option>
            <option value="calm">Calm</option>
            <option value="uplifting">Uplifting</option>
            <option value="melancholic">Melancholic</option>
            <option value="mysterious">Mysterious</option>
            <option value="playful">Playful</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="reviewed">Reviewed</option>
            <option value="unreviewed">Unreviewed</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredTracks.length} of {initialTracks.length} tracks
      </div>

      {/* Tracks Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Artist
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Genre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                License
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plays
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTracks.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                  {initialTracks.length === 0
                    ? 'No music tracks yet. Upload your first track to get started!'
                    : 'No tracks match your filters.'}
                </td>
              </tr>
            )}
            {filteredTracks.map((track) => (
              <tr key={track.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {track.title}
                  </div>
                  {track.mood && (
                    <div className="text-xs text-gray-500">{track.mood}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {track.artist}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {track.music_genres?.name || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {formatDuration(track.duration_sec)}
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800">
                    {track.license_type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {track.play_count}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        track.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {track.active ? 'Active' : 'Inactive'}
                    </span>
                    {track.reviewed && (
                      <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                        Reviewed
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  <Link
                    href={`/dashboard/music/${track.id}`}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(track)}
                    disabled={deleting === track.id}
                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                  >
                    {deleting === track.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
