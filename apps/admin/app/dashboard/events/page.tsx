import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

const FUTURE_YEAR_OFFSET = parseInt(process.env.FUTURE_YEAR_OFFSET || '500', 10);

function getFutureDate(eventDate: string): string {
  const date = new Date(eventDate);
  date.setFullYear(date.getFullYear() + FUTURE_YEAR_OFFSET);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function EventsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: false });

  if (error) {
    return <div>Error loading events: {error.message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <Link
          href="/dashboard/events/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create Event
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date (Real / Story)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Importance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tags
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {events?.map((event) => (
              <tr key={event.id}>
                <td className="px-6 py-4">
                  <Link
                    href={`/dashboard/events/${event.id}`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {event.title}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="text-gray-700">
                    {new Date(event.event_date).toLocaleDateString()}
                  </div>
                  <div className="text-blue-600 text-xs">
                    📅 {getFutureDate(event.event_date)}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      event.importance >= 8
                        ? 'bg-red-100 text-red-800'
                        : event.importance >= 5
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {event.importance}/10
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {event.tags?.join(', ') || '-'}
                </td>
                <td className="px-6 py-4 text-sm">
                  <Link
                    href={`/dashboard/events/${event.id}/edit`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
