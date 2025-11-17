import { createSupabaseServerClient } from '@/lib/supabase-server';
import ProgramForm from '@/components/program-form';
import { notFound } from 'next/navigation';

export default async function EditProgramPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  // Fetch the program with its relationships
  const { data: program, error } = await supabase
    .from('programs')
    .select(`
      *,
      program_djs(dj_id, role, speaking_order),
      dj:djs!fk_programs_dj(id, name, slug),
      format_clock:format_clocks!fk_programs_format_clock(id, name)
    `)
    .eq('id', params.id)
    .single();

  if (error || !program) {
    notFound();
  }

  // Extract DJ IDs from program_djs for form
  const djIds = program.program_djs
    ?.sort((a: any, b: any) => a.speaking_order - b.speaking_order)
    .map((pd: any) => pd.dj_id) || [];

  // Fetch available DJs and format clocks for dropdowns
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
      <h1 className="text-2xl font-bold mb-6">Edit Program</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <ProgramForm
          program={{ ...program, djIds }}
          mode="edit"
          djs={djsResult.data || []}
          formatClocks={formatClocksResult.data || []}
        />
      </div>
    </div>
  );
}
