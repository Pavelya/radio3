import { createSupabaseServerClient } from '@/lib/supabase-server';

async function getToneMetrics() {
  const supabase = await createSupabaseServerClient();

  // Get last 7 days of metrics
  const { data: metrics } = await supabase
    .from('tone_metrics_daily')
    .select('*')
    .order('date', { ascending: false })
    .limit(7);

  // Get today's segments with tone scores
  const today = new Date().toISOString().split('T')[0];
  const { data: todaySegments } = await supabase
    .from('segments')
    .select('tone_score, tone_balance')
    .gte('created_at', `${today}T00:00:00Z`)
    .not('tone_score', 'is', null);

  return { metrics: metrics || [], todaySegments: todaySegments || [] };
}

export default async function ToneDashboardPage() {
  const { metrics, todaySegments } = await getToneMetrics();

  // Calculate today's stats
  const todayAvgScore =
    todaySegments.length > 0
      ? Math.round(todaySegments.reduce((sum, s) => sum + (s.tone_score || 0), 0) / todaySegments.length)
      : 0;

  // Latest full day metrics
  const latestMetrics = metrics[0];

  // Calculate recommendations based on latest metrics
  const recommendations: string[] = [];
  if (latestMetrics) {
    const opt = latestMetrics.avg_optimism_pct || 0;
    const real = latestMetrics.avg_realism_pct || 0;
    const wonder = latestMetrics.avg_wonder_pct || 0;

    if (opt < 50) {
      recommendations.push('⚠️ Optimism too low - Add more achievements and positive outcomes');
    } else if (opt > 70) {
      recommendations.push('⚠️ Optimism too high - Include more realistic challenges');
    }

    if (real < 20) {
      recommendations.push('⚠️ Realism too low - Incorporate more practical problems');
    } else if (real > 40) {
      recommendations.push('⚠️ Too much focus on problems - Balance with solutions');
    }

    if (wonder < 5) {
      recommendations.push('💡 Add more sense of wonder - Include discoveries and mysteries');
    }

    if (latestMetrics.dystopian_flags > 2) {
      recommendations.push('🚫 Too many dystopian elements - Review prompts for pessimistic language');
    }

    if (latestMetrics.fantasy_flags > 1) {
      recommendations.push('🚫 Fantasy elements detected - Ensure technological explanations');
    }

    if (latestMetrics.major_contradictions > 0) {
      recommendations.push('⚠️ Major lore contradictions found - Review knowledge base');
    }

    const lowQualityPct = latestMetrics.segments_analyzed > 0
      ? latestMetrics.segments_below_threshold / latestMetrics.segments_analyzed
      : 0;

    if (lowQualityPct > 0.2) {
      recommendations.push('📉 Over 20% of segments below quality threshold - Review generation prompts');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Tone balance is healthy - Continue current approach');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tone & Balance Monitoring</h1>

      {/* Today's Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">Today's Segments</div>
          <div className="text-3xl font-bold mt-2">{todaySegments.length}</div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">Today's Avg Score</div>
          <div
            className={`text-3xl font-bold mt-2 ${
              todayAvgScore >= 80
                ? 'text-green-600'
                : todayAvgScore >= 60
                ? 'text-yellow-600'
                : 'text-red-600'
            }`}
          >
            {todayAvgScore}
          </div>
        </div>

        {latestMetrics && (
          <>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-sm text-gray-600">Yesterday's Balance</div>
              <div className="text-lg font-mono mt-2">
                {Math.round(latestMetrics.avg_optimism_pct)}/
                {Math.round(latestMetrics.avg_realism_pct)}/
                {Math.round(latestMetrics.avg_wonder_pct)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Target: 60/30/10</div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-sm text-gray-600">Issues (Yesterday)</div>
              <div className="text-3xl font-bold mt-2">
                {latestMetrics.dystopian_flags +
                  latestMetrics.fantasy_flags +
                  latestMetrics.anachronism_flags}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">📊 Recommendations</h2>
          <ul className="space-y-2">
            {recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-gray-800">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 7-Day Trend */}
      {metrics.length > 0 ? (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">7-Day Trend</h2>
          <div className="space-y-3">
            {metrics.map((day) => (
              <div key={day.date} className="flex items-center justify-between border-b pb-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {new Date(day.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {day.segments_analyzed} segments
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-center">
                    <div className="text-xs text-gray-600">Score</div>
                    <div
                      className={`font-bold ${
                        day.avg_tone_score >= 80
                          ? 'text-green-600'
                          : day.avg_tone_score >= 60
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {Math.round(day.avg_tone_score)}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs text-gray-600">Balance</div>
                    <div className="font-mono text-xs">
                      {Math.round(day.avg_optimism_pct)}/
                      {Math.round(day.avg_realism_pct)}/
                      {Math.round(day.avg_wonder_pct)}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs text-gray-600">Issues</div>
                    <div className="font-bold">
                      {day.dystopian_flags + day.fantasy_flags + day.anachronism_flags}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-yellow-900 mb-2">
            No Historical Data Yet
          </h2>
          <p className="text-sm text-yellow-700">
            Daily metrics will appear here once aggregation runs. Run the aggregation manually or wait for the daily cron job.
          </p>
        </div>
      )}

      {/* Target Guidelines */}
      <div className="bg-gray-50 border rounded-lg p-6">
        <h3 className="font-semibold mb-3">Target Guidelines</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-medium text-blue-600">60% Optimistic</div>
            <div className="text-gray-600 text-xs mt-1">
              Achievements, progress, solutions, cooperation
            </div>
          </div>
          <div>
            <div className="font-medium text-yellow-600">30% Realistic</div>
            <div className="text-gray-600 text-xs mt-1">
              Challenges, limitations, debates, practical concerns
            </div>
          </div>
          <div>
            <div className="font-medium text-purple-600">10% Wonder</div>
            <div className="text-gray-600 text-xs mt-1">
              Discoveries, mysteries, cosmic perspective, awe
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
