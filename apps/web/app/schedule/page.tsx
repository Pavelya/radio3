import { format, addDays } from 'date-fns';
import Link from 'next/link';

async function getSchedule(date: string) {
  // For server-side rendering, we need to use the Next.js app URL, not the backend API
  const baseUrl = typeof window === 'undefined'
    ? (process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000')
    : '';

  try {
    const response = await fetch(
      `${baseUrl}/api/schedule?date=${date}`,
      { cache: 'no-store' }
    );

    if (!response.ok) return { segments: [], yearOffset: 500 };

    const data = await response.json();
    return {
      segments: Array.isArray(data.segments) ? data.segments : [],
      yearOffset: data.yearOffset || 500
    };
  } catch (error) {
    return { segments: [], yearOffset: 500 };
  }
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const dateParam = searchParams.date || format(new Date(), 'yyyy-MM-dd');
  const selectedDate = new Date(dateParam);
  const { segments, yearOffset } = await getSchedule(dateParam);

  // Group by hour
  const segmentsByHour: Record<number, any[]> = {};
  for (let hour = 0; hour < 24; hour++) {
    segmentsByHour[hour] = [];
  }

  segments.forEach((segment: any) => {
    const segmentTime = new Date(segment.scheduled_start_ts);
    // Convert from future year to current year
    segmentTime.setFullYear(segmentTime.getFullYear() - yearOffset);
    const hour = segmentTime.getHours();
    segmentsByHour[hour].push({ ...segment, localTime: segmentTime });
  });

  const prevDay = format(addDays(selectedDate, -1), 'yyyy-MM-dd');
  const nextDay = format(addDays(selectedDate, 1), 'yyyy-MM-dd');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      <header className="bg-black bg-opacity-50 backdrop-blur-sm border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-white hover:text-gray-300">
              ← AI Radio 2525
            </Link>
            <h1 className="text-xl font-bold text-white">Schedule</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Date Navigation */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href={`/schedule?date=${prevDay}`}
            className="px-4 py-2 bg-white bg-opacity-10 text-white rounded hover:bg-opacity-20"
          >
            ← Previous
          </Link>

          <div className="text-center text-white">
            <div className="text-2xl font-bold">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="text-sm text-gray-400 mt-1">
              Broadcasting from Year 2525
            </div>
          </div>

          <Link
            href={`/schedule?date=${nextDay}`}
            className="px-4 py-2 bg-white bg-opacity-10 text-white rounded hover:bg-opacity-20"
          >
            Next →
          </Link>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          {Object.entries(segmentsByHour).map(([hour, segs]) => {
            if (segs.length === 0) return null;

            return (
              <div key={hour} className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 border border-white border-opacity-20">
                <div className="flex">
                  <div className="w-24 text-white font-bold text-lg">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  <div className="flex-1 space-y-3">
                    {segs.map((segment: any) => (
                      <div
                        key={segment.id}
                        className="bg-white bg-opacity-5 rounded p-4 border border-white border-opacity-10"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-white font-medium mb-1">
                              {segment.programs.name}
                            </div>
                            <div className="flex items-center space-x-3 text-sm text-gray-400">
                              <span>
                                {format(segment.localTime, 'h:mm a')}
                              </span>
                              <span>•</span>
                              <span className="capitalize">{segment.slot_type}</span>
                              <span>•</span>
                              <span>{Math.round(segment.duration_sec / 60)} min</span>
                              <span>•</span>
                              <span>{segment.djs.name}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {segments.length === 0 && (
          <div className="text-center text-white py-12">
            <p className="text-xl">No segments scheduled for this day</p>
          </div>
        )}
      </main>
    </div>
  );
}
