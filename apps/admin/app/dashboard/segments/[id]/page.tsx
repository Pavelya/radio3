import { createSupabaseServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function SegmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  const { data: segment, error } = await supabase
    .from('segments')
    .select('*, programs(name, djs(name, voice_id)), assets(*)')
    .eq('id', params.id)
    .single();

  if (error || !segment) {
    notFound();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Segment Details</h1>
        <Link
          href="/dashboard/segments"
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Segments
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <span
            className={`px-3 py-1 rounded text-sm ${
              segment.state === 'ready'
                ? 'bg-green-100 text-green-800'
                : segment.state === 'failed'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {segment.state}
          </span>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Program
            </label>
            <p className="mt-1">{segment.programs?.name || '-'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              DJ
            </label>
            <p className="mt-1">{segment.programs?.djs?.name || '-'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Slot Type
            </label>
            <p className="mt-1">{segment.slot_type}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Duration
            </label>
            <p className="mt-1">
              {segment.duration_sec ? `${Math.round(segment.duration_sec)}s` : '-'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Retry Count
            </label>
            <p className="mt-1">
              {segment.retry_count} / {segment.max_retries}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Created
            </label>
            <p className="mt-1">
              {new Date(segment.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Error Message */}
        {segment.last_error && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Error Message
            </label>
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {segment.last_error}
            </div>
          </div>
        )}

        {/* Script */}
        {segment.script_md && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Generated Script
            </label>
            <div className="bg-gray-50 p-4 rounded">
              <pre className="whitespace-pre-wrap text-sm">
                {segment.script_md}
              </pre>
            </div>
          </div>
        )}

        {/* Citations */}
        {segment.citations && segment.citations.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sources Used
            </label>
            <ul className="list-disc list-inside text-sm">
              {segment.citations.map((citation: any, i: number) => (
                <li key={i}>
                  {citation.source_type}: {citation.source_id}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Audio Asset */}
        {segment.assets && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Audio Asset
            </label>
            <div className="bg-gray-50 p-4 rounded">
              <p className="text-sm">
                <strong>LUFS:</strong> {segment.assets.lufs_integrated || '-'} |{' '}
                <strong>Peak:</strong> {segment.assets.peak_db || '-'}dB |{' '}
                <strong>Status:</strong> {segment.assets.validation_status}
              </p>
              {/* Audio player will be added in A7 */}
            </div>
          </div>
        )}

        {/* Generation Metrics */}
        {segment.generation_metrics && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Generation Metrics
            </label>
            <div className="bg-gray-50 p-4 rounded text-sm">
              <pre>{JSON.stringify(segment.generation_metrics, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
