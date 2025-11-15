import { createSupabaseServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function ConversationPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  const { data: segment } = await supabase
    .from('segments')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!segment) {
    notFound();
  }

  const { data: participants } = await supabase
    .from('conversation_participants')
    .select('*, djs(*)')
    .eq('segment_id', params.id)
    .order('speaking_order');

  const { data: turns } = await supabase
    .from('conversation_turns')
    .select('*')
    .eq('segment_id', params.id)
    .order('turn_number');

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">
            Conversation: {segment.slot_type}
          </h1>
          <div className="text-sm text-gray-600">
            Format:{' '}
            <span className="font-medium">
              {segment.conversation_format || 'monologue'}
            </span>
          </div>
        </div>
        <Link
          href={`/dashboard/segments/${params.id}`}
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Segment
        </Link>
      </div>

      {/* Status Info */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <span
              className={`inline-block mt-1 px-3 py-1 rounded text-sm ${
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
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Total Turns
            </label>
            <p className="mt-1 text-lg font-semibold">{turns?.length || 0}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Speakers
            </label>
            <p className="mt-1 text-lg font-semibold">
              {participants?.length || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Participants */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Participants</h2>
        {participants && participants.length > 0 ? (
          <div className="space-y-3">
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded"
              >
                <div className="flex-1">
                  <div className="font-medium">
                    {participant.character_name || participant.djs?.name}
                  </div>
                  <div className="text-sm text-gray-600">
                    {participant.role}
                    {participant.character_expertise && (
                      <span className="ml-2">
                        • {participant.character_expertise}
                      </span>
                    )}
                  </div>
                  {participant.character_background && (
                    <div className="text-sm text-gray-500 mt-1">
                      {participant.character_background}
                    </div>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  Voice: {participant.djs?.voice_id || 'N/A'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-4">
            No participants found
          </div>
        )}
      </div>

      {/* Conversation Script */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">
          Conversation Script ({turns?.length || 0} turns)
        </h2>

        {turns && turns.length > 0 ? (
          <div className="space-y-4">
            {turns.map((turn, index) => {
              const participant = participants?.find(
                (p) => p.id === turn.participant_id
              );

              // Alternate colors for different speakers
              const bgColor =
                index % 2 === 0 ? 'bg-blue-50' : 'bg-green-50';

              return (
                <div key={turn.id} className={`p-4 rounded-lg ${bgColor}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="font-semibold text-sm text-gray-700">
                        {turn.speaker_name}
                      </div>
                      {participant && (
                        <div className="text-xs text-gray-500">
                          ({participant.djs?.name})
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Turn {turn.turn_number}
                    </div>
                  </div>
                  <div className="text-gray-900">{turn.text_content}</div>
                  {turn.duration_sec && (
                    <div className="text-xs text-gray-500 mt-2">
                      Duration: {Math.round(turn.duration_sec)}s
                    </div>
                  )}
                  {turn.audio_path && (
                    <div className="text-xs text-green-600 mt-1">
                      ✓ Audio synthesized
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            No conversation script generated yet
          </div>
        )}
      </div>

      {/* Full Script (if available) */}
      {segment.script_md && (
        <div className="bg-white shadow rounded-lg p-6 mt-6">
          <h2 className="text-lg font-semibold mb-4">Full Script (Raw)</h2>
          <div className="bg-gray-50 p-4 rounded">
            <pre className="whitespace-pre-wrap text-sm">
              {segment.script_md}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
