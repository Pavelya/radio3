import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  // Fetch stats
  const [segmentsResult, jobsResult, assetsResult] = await Promise.all([
    supabase.from('segments').select('state', { count: 'exact' }),
    supabase.from('jobs').select('state', { count: 'exact' }),
    supabase.from('assets').select('id', { count: 'exact' }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Total Segments</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {segmentsResult.count || 0}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Pending Jobs</h3>
          <p className="text-3xl font-bold text-yellow-600 mt-2">
            {jobsResult.count || 0}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Audio Assets</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {assetsResult.count || 0}
          </p>
        </div>
      </div>
    </div>
  );
}
