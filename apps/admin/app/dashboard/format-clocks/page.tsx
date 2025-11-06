import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function FormatClocksPage() {
  const supabase = await createSupabaseServerClient();

  // Fetch all format clocks with their slots and programs
  const { data: formatClocks, error } = await supabase
    .from('format_clocks')
    .select(`
      *,
      slots:format_slots(id, slot_type, duration_sec, order_index),
      programs:programs!fk_programs_format_clock(id, name)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return <div>Error loading format clocks: {error.message}</div>;
  }

  // Add usage count to each clock
  const clocksWithUsage = formatClocks?.map(clock => ({
    ...clock,
    usage_count: clock.programs?.length || 0,
    slots: clock.slots?.sort((a: any, b: any) => a.order_index - b.order_index) || []
  })) || [];

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Format Clocks</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage hourly broadcast structure templates
          </p>
        </div>
        <Link
          href="/dashboard/format-clocks/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create Format Clock
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Slots
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Used By
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clocksWithUsage.map((clock: any) => {
              const isValidDuration = clock.total_duration_sec === 3600;

              return (
                <tr key={clock.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{clock.name}</div>
                    {clock.description && (
                      <div className="text-sm text-gray-500 line-clamp-1">
                        {clock.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {clock.slots?.length || 0} slots
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        isValidDuration
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {formatDuration(clock.total_duration_sec || 0)}
                      {isValidDuration ? ' ✓' : ''}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {clock.usage_count} program(s)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                    <Link
                      href={`/dashboard/format-clocks/${clock.id}/edit`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {clocksWithUsage.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No format clocks created yet. Click "Create Format Clock" to add one.
          </div>
        )}
      </div>
    </div>
  );
}
