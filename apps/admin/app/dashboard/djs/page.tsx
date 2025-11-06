import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function DJsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: djs, error } = await supabase
    .from('djs')
    .select(`
      *,
      voice:voices(name, locale)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return <div>Error loading DJs: {error.message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Radio DJs</h1>
        <Link
          href="/dashboard/djs/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create DJ
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {djs?.map((dj: any) => (
          <div key={dj.id} className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xl font-bold">{dj.name}</h3>
              <span
                className={`px-2 py-1 rounded text-xs ${
                  dj.energy_level === 'high'
                    ? 'bg-red-100 text-red-800'
                    : dj.energy_level === 'medium'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {dj.energy_level}
              </span>
            </div>

            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{dj.bio_short}</p>

            <div className="space-y-1 mb-4 text-xs text-gray-500">
              <div>
                Voice: <span className="font-medium">{dj.voice?.name}</span>
              </div>
              <div>
                Style: <span className="font-medium capitalize">{dj.speaking_style}</span>
              </div>
              {dj.specializations && dj.specializations.length > 0 && (
                <div>
                  Specialties: <span className="font-medium">{dj.specializations.slice(0, 2).join(', ')}</span>
                  {dj.specializations.length > 2 && ' ...'}
                </div>
              )}
            </div>

            <div className="flex space-x-2">
              <Link
                href={`/dashboard/djs/${dj.id}/edit`}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Edit
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
