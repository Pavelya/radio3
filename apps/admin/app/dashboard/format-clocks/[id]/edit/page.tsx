import { createSupabaseServerClient } from '@/lib/supabase-server';
import FormatClockForm from '@/components/format-clock-form';
import { notFound } from 'next/navigation';

export default async function EditFormatClockPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  // Fetch the format clock with its slots
  const { data: formatClock, error } = await supabase
    .from('format_clocks')
    .select(
      `
      *,
      slots:format_slots(*)
    `
    )
    .eq('id', params.id)
    .single();

  if (error || !formatClock) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit Format Clock</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <FormatClockForm formatClock={formatClock} mode="edit" />
      </div>
    </div>
  );
}
