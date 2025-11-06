import { createSupabaseServerClient } from '@/lib/supabase-server';
import DJForm from '@/components/dj-form';

export default async function NewDJPage() {
  const supabase = await createSupabaseServerClient();

  const { data: voices } = await supabase
    .from('voices')
    .select('*')
    .eq('is_available', true)
    .order('name');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create DJ</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <DJForm mode="create" voices={voices || []} />
      </div>
    </div>
  );
}
