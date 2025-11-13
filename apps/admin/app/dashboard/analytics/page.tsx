import { createSupabaseServerClient } from '@/lib/supabase-server';
import { subDays } from 'date-fns';

export default async function AnalyticsPage() {
  const supabase = await createSupabaseServerClient();

  // Last 7 days stats
  const sevenDaysAgo = subDays(new Date(), 7);

  const { data: segments } = await supabase
    .from('segments')
    .select('state, created_at, duration_sec, retry_count')
    .gte('created_at', sevenDaysAgo.toISOString());

  // Calculate metrics
  const total = segments?.length || 0;
  const byState = (segments || []).reduce((acc: any, s) => {
    acc[s.state] = (acc[s.state] || 0) + 1;
    return acc;
  }, {});

  const successRate = total > 0
    ? ((byState.ready || 0) + (byState.aired || 0)) / total * 100
    : 0;

  const avgDuration = total > 0
    ? (segments || []).reduce((sum, s) => sum + (s.duration_sec || 0), 0) / total
    : 0;

  const avgRetries = total > 0
    ? (segments || []).reduce((sum, s) => sum + s.retry_count, 0) / total
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics (Last 7 Days)</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Total Segments</h3>
          <div className="text-3xl font-bold">{total}</div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Success Rate</h3>
          <div className="text-3xl font-bold text-green-600">
            {successRate.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Avg Duration</h3>
          <div className="text-3xl font-bold">
            {Math.round(avgDuration)}s
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Avg Retries</h3>
          <div className="text-3xl font-bold">
            {avgRetries.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-lg font-semibold mb-4">Segments by State</h2>
        <div className="space-y-3">
          {Object.entries(byState).map(([state, count]) => (
            <div key={state} className="flex items-center justify-between">
              <span className="text-sm capitalize">{state}</span>
              <div className="flex items-center space-x-4">
                <div className="w-64 bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full ${
                      state === 'ready' || state === 'aired'
                        ? 'bg-green-500'
                        : state === 'failed'
                        ? 'bg-red-500'
                        : 'bg-yellow-500'
                    }`}
                    style={{
                      width: `${(count as number / total) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {count as number}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
