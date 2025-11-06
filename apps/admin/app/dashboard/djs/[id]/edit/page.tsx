import { createSupabaseServerClient } from '@/lib/supabase-server';
import DJForm from '@/components/dj-form';
import { notFound } from 'next/navigation';

export default async function EditDJPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  const { data: dj, error } = await supabase
    .from('djs')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !dj) {
    notFound();
  }

  const { data: voices } = await supabase
    .from('voices')
    .select('*')
    .eq('is_available', true)
    .order('name');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit DJ</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <DJForm dj={dj} mode="edit" voices={voices || []} />
      </div>
    </div>
  );
}
