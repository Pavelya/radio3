import { createSupabaseServerClient } from '@/lib/supabase-server';
import DLQActions from '@/components/dlq-actions';

export default async function DLQPage() {
  const supabase = await createSupabaseServerClient();

  const { data: dlqJobs, error } = await supabase
    .from('dead_letter_queue')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return <div>Error loading DLQ: {error.message}</div>;
  }

  const unreviewedCount = dlqJobs?.filter((j: any) => !j.reviewed_at).length || 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dead Letter Queue</h1>
        <p className="text-gray-600 mt-2">
          Jobs that failed after maximum retry attempts
        </p>
        {unreviewedCount > 0 && (
          <div className="mt-2 text-sm text-red-600">
            {unreviewedCount} unreviewed jobs
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Job Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Payload
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Failure Reason
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Attempts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Failed At
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {dlqJobs?.map((job: any) => (
              <tr key={job.id}>
                <td className="px-6 py-4 text-sm font-medium">
                  {job.job_type}
                </td>
                <td className="px-6 py-4 text-sm">
                  <code className="text-xs">
                    {JSON.stringify(job.payload).slice(0, 50)}...
                  </code>
                </td>
                <td className="px-6 py-4 text-sm text-red-600">
                  {job.failure_reason.slice(0, 100)}
                  {job.failure_reason.length > 100 && '...'}
                </td>
                <td className="px-6 py-4 text-sm">
                  {job.attempts_made}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(job.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  {job.reviewed_at ? (
                    <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">
                      Reviewed
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                      Unreviewed
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  <DLQActions job={job} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {dlqJobs?.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No jobs in dead letter queue
          </div>
        )}
      </div>
    </div>
  );
}
