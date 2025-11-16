import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function LorePage() {
  const supabase = await createSupabaseServerClient();

  const { data: facts } = await supabase
    .from('lore_facts')
    .select('*')
    .eq('active', true)
    .order('category', { ascending: true });

  const { data: contradictions } = await supabase
    .from('lore_contradictions')
    .select('*, segments(slot_type)')
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(20);

  // Group facts by category
  const factsByCategory = facts?.reduce((acc: any, fact) => {
    if (!acc[fact.category]) acc[fact.category] = [];
    acc[fact.category].push(fact);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">World Lore & Consistency</h1>
      </div>

      {/* Unresolved Contradictions */}
      {contradictions && contradictions.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-red-900 mb-4">
            Unresolved Contradictions ({contradictions.length})
          </h2>
          <div className="space-y-3">
            {contradictions.map((contradiction) => (
              <div
                key={contradiction.id}
                className="bg-white rounded p-4 border border-red-300"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-medium text-red-900">
                    {contradiction.fact_key}
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      contradiction.severity === 'major'
                        ? 'bg-red-600 text-white'
                        : contradiction.severity === 'moderate'
                        ? 'bg-orange-500 text-white'
                        : 'bg-yellow-500 text-white'
                    }`}
                  >
                    {contradiction.severity}
                  </span>
                </div>
                <div className="text-sm text-gray-700 mb-2">
                  <strong>Canonical:</strong> {contradiction.canonical_value}
                  <br />
                  <strong>Found:</strong> {contradiction.contradictory_value}
                </div>
                {contradiction.context_text && (
                  <div className="text-xs text-gray-600 italic bg-gray-50 p-2 rounded">
                    {contradiction.context_text}
                  </div>
                )}
                <div className="mt-2 flex space-x-2">
                  <Link
                    href={`/dashboard/segments/${contradiction.segment_id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View Segment →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Contradictions State */}
      {(!contradictions || contradictions.length === 0) && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-green-900 mb-2">
            No Active Contradictions
          </h2>
          <p className="text-sm text-green-700">
            All generated content is consistent with canonical lore.
          </p>
        </div>
      )}

      {/* Canonical Facts */}
      <div className="space-y-6">
        {factsByCategory && Object.entries(factsByCategory).map(([category, facts]: [string, any]) => (
          <div key={category} className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 capitalize">
              {category}
            </h2>
            <div className="space-y-2">
              {facts.map((fact: any) => (
                <div
                  key={fact.id}
                  className="flex items-start justify-between p-3 bg-gray-50 rounded"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">
                      {fact.fact_key.replace(/_/g, ' ')}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {fact.fact_value}
                    </div>
                    {fact.description && (
                      <div className="text-xs text-gray-500 mt-1">
                        {fact.description}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {fact.fact_type}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* No Facts State */}
      {(!facts || facts.length === 0) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <p className="text-gray-600">
            No canonical lore facts defined yet. Run the migration to seed initial facts.
          </p>
        </div>
      )}
    </div>
  );
}
