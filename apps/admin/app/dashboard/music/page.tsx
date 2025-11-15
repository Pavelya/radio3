import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import MusicTracksTable from './music-tracks-table';

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
        <div className="flex space-x-3">
          <Link
            href="/dashboard/music/jingles"
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
          >
            View Jingles
          </Link>
          <Link
            href="/dashboard/music/upload"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Upload Track
          </Link>
        </div>
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

      {/* Tracks Table with Search/Filter/Actions */}
      <MusicTracksTable initialTracks={tracks || []} />
    </div>
  );
}
