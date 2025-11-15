import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function MusicPage() {
  const supabase = await createSupabaseServerClient();

  const { data: tracks, error: tracksError } = await supabase
    .from('music_tracks')
    .select('*, music_genres(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: genres } = await supabase
    .from('music_genres')
    .select('*')
    .order('name');

  if (tracksError) {
    return <div>Error loading music tracks: {tracksError.message}</div>;
  }

  // Calculate stats
  const totalTracks = tracks?.length || 0;
  const activeTracks = tracks?.filter((t) => t.active).length || 0;
  const reviewedTracks = tracks?.filter((t) => t.reviewed).length || 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Music Library</h1>
        <Link
          href="/dashboard/music/upload"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Upload Track
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Total Tracks</div>
          <div className="text-2xl font-bold">{totalTracks}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Active Tracks</div>
          <div className="text-2xl font-bold">{activeTracks}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Reviewed</div>
          <div className="text-2xl font-bold">{reviewedTracks}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Genres</div>
          <div className="text-2xl font-bold">{genres?.length || 0}</div>
        </div>
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
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tracks && tracks.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No music tracks yet. Upload your first track to get started!
                </td>
              </tr>
            )}
            {tracks?.map((track) => (
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
                  {Math.floor(track.duration_sec / 60)}:
                  {String(Math.floor(track.duration_sec % 60)).padStart(2, '0')}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
