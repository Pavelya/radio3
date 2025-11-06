import { createSupabaseServerClient } from '@/lib/supabase-server';
import RefreshButton from '@/components/refresh-button';

export default async function MonitoringPage() {
  const supabase = await createSupabaseServerClient();

  // Fetch stats
  const [
    { data: segments },
    { data: jobs },
    { data: workers },
    { data: dlq },
  ] = await Promise.all([
    supabase.from('segments').select('state'),
    supabase.from('jobs').select('state, job_type'),
    supabase.from('health_checks').select('*'),
    supabase.from('dead_letter_queue').select('id', { count: 'exact' }),
  ]);

  // Aggregate segment states
  const segmentStats = (segments || []).reduce((acc: any, s: any) => {
    acc[s.state] = (acc[s.state] || 0) + 1;
    return acc;
  }, {});

  // Aggregate job states
  const jobStats = (jobs || []).reduce((acc: any, j: any) => {
    if (!acc[j.job_type]) acc[j.job_type] = {};
    acc[j.job_type][j.state] = (acc[j.job_type][j.state] || 0) + 1;
    return acc;
  }, {});

  // Check worker health
  const now = new Date();
  const healthyWorkers = (workers || []).filter((w: any) => {
    const lastHeartbeat = new Date(w.last_heartbeat);
    const ageMinutes = (now.getTime() - lastHeartbeat.getTime()) / 60000;
    return ageMinutes < 2; // Healthy if heartbeat within 2 minutes
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">System Monitoring</h1>
        <RefreshButton />
      </div>

      {/* Worker Health */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Worker Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['kb_index', 'segment_make', 'audio_finalize'].map((workerType) => {
            const workerInstances = (workers || []).filter(
              (w: any) => w.worker_type === workerType
            );
            const healthy = workerInstances.filter((w: any) => {
              const ageMinutes =
                (now.getTime() - new Date(w.last_heartbeat).getTime()) / 60000;
              return ageMinutes < 2;
            });

            return (
              <div key={workerType} className="bg-white shadow rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {workerType}
                </h3>
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold">
                    {healthy.length}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    / {workerInstances.length} healthy
                  </span>
                </div>
                {healthy.length === 0 && workerInstances.length === 0 && (
                  <p className="text-sm text-red-600 mt-2">No workers running</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Segment States */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Segment Pipeline</h2>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(segmentStats).map(([state, count]) => (
              <div key={state}>
                <div className="text-sm text-gray-600">{state}</div>
                <div className="text-2xl font-bold">{count as number}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Job Queue */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Job Queue</h2>
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Job Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Pending
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Processing
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Failed
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(jobStats).map(([jobType, states]: [string, any]) => (
                <tr key={jobType}>
                  <td className="px-6 py-4 text-sm font-medium">{jobType}</td>
                  <td className="px-6 py-4 text-sm">{states.pending || 0}</td>
                  <td className="px-6 py-4 text-sm">{states.processing || 0}</td>
                  <td className="px-6 py-4 text-sm">{states.completed || 0}</td>
                  <td className="px-6 py-4 text-sm">{states.failed || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dead Letter Queue */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Dead Letter Queue</h2>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-baseline">
            <span className="text-3xl font-bold">{dlq?.length || 0}</span>
            <span className="ml-2 text-sm text-gray-500">
              jobs require review
            </span>
          </div>
          {(dlq?.length || 0) > 0 && (
            <a
              href="/dashboard/dlq"
              className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block"
            >
              Review →
            </a>
          )}
        </div>
      </div>

      {/* Worker Instances */}
      {healthyWorkers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">Active Worker Instances</h2>
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Instance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Heartbeat
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Jobs in Flight
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {healthyWorkers.map((worker: any) => {
                  const ageMinutes = Math.round(
                    (now.getTime() - new Date(worker.last_heartbeat).getTime()) / 60000
                  );

                  return (
                    <tr key={worker.id}>
                      <td className="px-6 py-4 text-sm font-mono">
                        {worker.instance_id}
                      </td>
                      <td className="px-6 py-4 text-sm">{worker.worker_type}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                          {worker.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {ageMinutes === 0 ? 'Just now' : `${ageMinutes}m ago`}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {worker.metrics?.jobs_in_flight || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
