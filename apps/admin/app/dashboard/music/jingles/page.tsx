import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function JinglesPage() {
  const supabase = await createSupabaseServerClient();

  const { data: jingles, error } = await supabase
    .from('jingles')
    .select('*, programs(name)')
    .order('jingle_type');

  if (error) {
    return <div>Error loading jingles: {error.message}</div>;
  }

  // Group by type
  const jinglesByType = jingles?.reduce((acc: any, jingle) => {
    const type = jingle.jingle_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(jingle);
    return acc;
  }, {});

  // Calculate stats
  const totalJingles = jingles?.length || 0;
  const activeJingles = jingles?.filter((j) => j.active).length || 0;
  const totalPlays = jingles?.reduce((sum, j) => sum + (j.play_count || 0), 0) || 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Jingles & Station IDs</h1>
          <p className="text-gray-600 mt-1">
            Manage station identifications, program intros, and transitions
          </p>
        </div>
        <Link
          href="/dashboard/music"
          className="text-blue-600 hover:text-blue-700"
        >
          ← Back to Music
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Total Jingles</div>
          <div className="text-2xl font-bold">{totalJingles}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Active</div>
          <div className="text-2xl font-bold">{activeJingles}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Total Plays</div>
          <div className="text-2xl font-bold">{totalPlays}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Types</div>
          <div className="text-2xl font-bold">
            {Object.keys(jinglesByType || {}).length}
          </div>
        </div>
      </div>

      {/* Jingles grouped by type */}
      <div className="space-y-6">
        {Object.entries(jinglesByType || {}).map(([type, typeJingles]: [string, any]) => (
          <div key={type} className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 capitalize flex items-center">
              <span className="mr-2">
                {type === 'station_id' && '📻'}
                {type === 'program_intro' && '🎙️'}
                {type === 'program_outro' && '👋'}
                {type === 'transition' && '↔️'}
                {type === 'bumper' && '⚡'}
                {type === 'news_intro' && '📰'}
                {type === 'weather_intro' && '☀️'}
              </span>
              {type.replace(/_/g, ' ')}
              <span className="ml-2 text-sm text-gray-500 font-normal">
                ({typeJingles.length})
              </span>
            </h2>

            <div className="space-y-2">
              {typeJingles.map((jingle: any) => (
                <div
                  key={jingle.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100"
                >
                  <div className="flex-1">
                    <div className="font-medium">{jingle.name}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      Duration: {Math.round(jingle.duration_sec)}s
                      {' • '}
                      Played {jingle.play_count || 0} times
                      {jingle.last_played_at && (
                        <>
                          {' • '}
                          Last: {new Date(jingle.last_played_at).toLocaleDateString()}
                        </>
                      )}
                    </div>
                    {jingle.programs && (
                      <div className="text-sm text-blue-600 mt-1">
                        Program: {jingle.programs.name}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        jingle.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {jingle.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {totalJingles === 0 && (
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-4">No jingles uploaded yet</p>
            <p className="text-sm text-gray-500">
              Generate jingles using: <code className="bg-gray-100 px-2 py-1 rounded">bash infra/generate-jingles.sh</code>
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Then upload with: <code className="bg-gray-100 px-2 py-1 rounded">node infra/upload-audio-library.js</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
