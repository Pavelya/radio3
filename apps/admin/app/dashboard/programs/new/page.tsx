import { createSupabaseServerClient } from '@/lib/supabase-server';
import ProgramForm from '@/components/program-form';

export default async function NewProgramPage() {
  const supabase = await createSupabaseServerClient();

  // Fetch available DJs and format clocks
  const [djsResult, formatClocksResult] = await Promise.all([
    supabase
      .from('djs')
      .select('id, name, slug')
      .order('name'),
    supabase
      .from('format_clocks')
      .select('id, name, description')
      .order('name'),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create Program</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <ProgramForm
          mode="create"
          djs={djsResult.data || []}
          formatClocks={formatClocksResult.data || []}
        />
      </div>
    </div>
  );
}
