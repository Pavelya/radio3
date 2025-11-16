import { createSupabaseServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AudioPlayer from '@/components/audio-player';

export default async function SegmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  const { data: segment, error } = await supabase
    .from('segments')
    .select(`
      *,
      programs(name, dj:djs!fk_programs_dj(name, voice_id)),
      asset:assets(*)
    `)
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
            <p className="mt-1">{segment.programs?.dj?.name || '-'}</p>
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
        {segment.asset && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Audio Asset
            </label>
            <AudioPlayer
              assetId={segment.asset.id}
              storagePath={segment.asset.storage_path}
            />
            <div className="mt-2 text-sm text-gray-600">
              <strong>LUFS:</strong> {segment.asset.lufs_integrated || '-'} |{' '}
              <strong>Peak:</strong> {segment.asset.peak_db || '-'}dB |{' '}
              <strong>Status:</strong> {segment.asset.validation_status}
            </div>
          </div>
        )}

        {/* Tone Analysis */}
        {segment.tone_score !== null && segment.tone_score !== undefined && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tone Analysis
            </label>
            <div className="bg-gray-50 p-4 rounded">
              <div className="flex items-center space-x-4 mb-3">
                <div>
                  <span className="text-sm text-gray-600">Score:</span>
                  <span
                    className={`ml-2 font-bold ${
                      segment.tone_score >= 80
                        ? 'text-green-600'
                        : segment.tone_score >= 60
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}
                  >
                    {segment.tone_score}/100
                  </span>
                </div>
                {segment.tone_balance && (
                  <div>
                    <span className="text-sm text-gray-600">Balance:</span>
                    <span className="ml-2 font-mono text-sm">
                      {segment.tone_balance}
                    </span>
                    <span className="ml-1 text-xs text-gray-500">
                      (Target: 60/30/10)
                    </span>
                  </div>
                )}
              </div>

              {segment.validation_issues &&
                Array.isArray(segment.validation_issues) &&
                segment.validation_issues.length > 0 && (
                  <div className="mb-3">
                    <div className="text-sm font-medium text-red-600 mb-1">
                      Issues:
                    </div>
                    <ul className="text-sm text-gray-700 list-disc list-inside">
                      {segment.validation_issues.map(
                        (issue: string, i: number) => (
                          <li key={i}>{issue}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}

              {segment.validation_suggestions &&
                Array.isArray(segment.validation_suggestions) &&
                segment.validation_suggestions.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-blue-600 mb-1">
                      Suggestions:
                    </div>
                    <ul className="text-sm text-gray-700 list-disc list-inside">
                      {segment.validation_suggestions.map(
                        (suggestion: string, i: number) => (
                          <li key={i}>{suggestion}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}
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
