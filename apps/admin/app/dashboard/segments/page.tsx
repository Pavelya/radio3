import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import SegmentActions from '@/components/segment-actions';

export default async function SegmentsPage({
  searchParams,
}: {
  searchParams: { state?: string };
}) {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('segments')
    .select('*, programs(name, djs(name)), assets(id, storage_path)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.state) {
    query = query.eq('state', searchParams.state);
  }

  const { data: segments, error } = await query;

  if (error) {
    return <div>Error loading segments: {error.message}</div>;
  }

  const states = [
    'all',
    'queued',
    'retrieving',
    'generating',
    'rendering',
    'normalizing',
    'ready',
    'airing',
    'aired',
    'failed',
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Segments</h1>
        <Link
          href="/dashboard/segments/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create Segment
        </Link>
      </div>

      {/* State Filter */}
      <div className="mb-4 flex space-x-2">
        {states.map((state) => (
          <Link
            key={state}
            href={state === 'all' ? '/dashboard/segments' : `/dashboard/segments?state=${state}`}
            className={`px-3 py-1 rounded text-sm ${
              (state === 'all' && !searchParams.state) ||
              searchParams.state === state
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {state}
          </Link>
        ))}
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Program / DJ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Slot Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                State
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Retry
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Audio
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {segments?.map((segment: any) => (
              <tr key={segment.id}>
                <td className="px-6 py-4 text-sm">
                  <div>{segment.programs?.name || '-'}</div>
                  <div className="text-gray-500">{segment.programs?.djs?.name || '-'}</div>
                </td>
                <td className="px-6 py-4 text-sm">{segment.slot_type}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        segment.state === 'ready'
                          ? 'bg-green-100 text-green-800'
                          : segment.state === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : segment.state === 'aired'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {segment.state}
                    </span>
                    {(segment.priority ?? 5) >= 8 && (
                      <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800 font-bold">
                        🚨 URGENT
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm">
                  {segment.duration_sec ? `${Math.round(segment.duration_sec)}s` : '-'}
                </td>
                <td className="px-6 py-4 text-sm">
                  {segment.retry_count}/{segment.max_retries}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(segment.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  {segment.asset_id && segment.assets ? (
                    <Link
                      href={`/dashboard/segments/${segment.id}#audio`}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      🔊 Preview
                    </Link>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  <SegmentActions segment={segment} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
