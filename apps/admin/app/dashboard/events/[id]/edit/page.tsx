import { createSupabaseServerClient } from '@/lib/supabase-server';
import EventForm from '@/components/event-form';
import { notFound } from 'next/navigation';

export default async function EditEventPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !event) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit Event</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <EventForm event={event} mode="edit" />
      </div>
    </div>
  );
}
