import { createSupabaseServerClient } from '@/lib/supabase-server';
import { startOfDay, endOfDay, addDays, format } from 'date-fns';
import Link from 'next/link';
import { StreamPlayer } from '@/components/stream-player';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const supabase = await createSupabaseServerClient();

  // Parse date or use today
  const dateParam = searchParams.date || format(new Date(), 'yyyy-MM-dd');
  const selectedDate = new Date(dateParam);

  // Adjust for future year offset (2525)
  const futureOffset = 500;
  const futureDate = new Date(selectedDate);
  futureDate.setFullYear(futureDate.getFullYear() + futureOffset);

  const dayStart = startOfDay(futureDate);
  const dayEnd = endOfDay(futureDate);

  // Fetch segments for the day
  const { data: segments, error } = await supabase
    .from('segments')
    .select('*, programs(name, dj:djs!fk_programs_dj(name))')
    .gte('scheduled_start_ts', dayStart.toISOString())
    .lt('scheduled_start_ts', dayEnd.toISOString())
    .order('scheduled_start_ts', { ascending: true });

  if (error) {
    return <div>Error loading schedule: {error.message}</div>;
  }

  // Group by hour
  const segmentsByHour: Record<number, any[]> = {};
  for (let hour = 0; hour < 24; hour++) {
    segmentsByHour[hour] = [];
  }

  segments?.forEach((segment) => {
    const hour = new Date(segment.scheduled_start_ts).getHours();
    segmentsByHour[hour].push(segment);
  });

  // Calculate stats
  const total = segments?.length || 0;
  const ready = segments?.filter(s => s.state === 'ready').length || 0;
  const aired = segments?.filter(s => s.state === 'aired').length || 0;
  const failed = segments?.filter(s => s.state === 'failed').length || 0;

  // Date navigation
  const prevDay = format(addDays(selectedDate, -1), 'yyyy-MM-dd');
  const nextDay = format(addDays(selectedDate, 1), 'yyyy-MM-dd');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Daily Schedule</h1>
        <div className="flex items-center space-x-4">
          <Link
            href={`/dashboard/schedule?date=${prevDay}`}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Previous Day
          </Link>
          <span className="text-lg font-semibold">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            <span className="text-sm text-gray-500 ml-2">
              (Year 2525)
            </span>
          </span>
          <Link
            href={`/dashboard/schedule?date=${nextDay}`}
            className="text-blue-600 hover:text-blue-800"
          >
            Next Day →
          </Link>
        </div>
      </div>

      {/* Live Stream Player */}
      <StreamPlayer />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Total Segments</div>
          <div className="text-2xl font-bold">{total}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Ready</div>
          <div className="text-2xl font-bold text-green-600">{ready}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Aired</div>
          <div className="text-2xl font-bold text-blue-600">{aired}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Failed</div>
          <div className="text-2xl font-bold text-red-600">{failed}</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Hourly Timeline</h2>
        <div className="space-y-4">
          {Object.entries(segmentsByHour).map(([hour, segs]) => (
            <div key={hour} className="flex">
              <div className="w-20 text-sm font-medium text-gray-600">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="flex-1">
                {segs.length === 0 ? (
                  <div className="text-sm text-gray-400">No segments scheduled</div>
                ) : (
                  <div className="space-y-1">
                    {segs.map((segment) => {
                      const scheduledTime = new Date(segment.scheduled_start_ts);
                      const minutes = scheduledTime.getMinutes();

                      return (
                        <Link
                          key={segment.id}
                          href={`/dashboard/segments/${segment.id}`}
                          className="block"
                        >
                          <div
                            className={`text-sm px-3 py-2 rounded border-l-4 hover:bg-gray-50 ${
                              segment.state === 'ready'
                                ? 'border-green-500 bg-green-50'
                                : segment.state === 'aired'
                                ? 'border-blue-500 bg-blue-50'
                                : segment.state === 'failed'
                                ? 'border-red-500 bg-red-50'
                                : 'border-yellow-500 bg-yellow-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium">
                                  :{minutes.toString().padStart(2, '0')}
                                </span>
                                <span className="ml-2">
                                  {segment.programs?.name || 'Unknown'} - {segment.slot_type}
                                </span>
                                {segment.priority >= 8 && (
                                  <span className="ml-2 px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">
                                    URGENT
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-3">
                                <span className="text-xs text-gray-500">
                                  {Math.round(segment.duration_sec || 0)}s
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    segment.state === 'ready'
                                      ? 'bg-green-100 text-green-800'
                                      : segment.state === 'aired'
                                      ? 'bg-blue-100 text-blue-800'
                                      : segment.state === 'failed'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}
                                >
                                  {segment.state}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
