import { createSupabaseServerClient } from '@/lib/supabase-server';
import UniverseDocForm from '@/components/universe-doc-form';
import { notFound } from 'next/navigation';

export default async function EditDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();

  const { data: doc, error } = await supabase
    .from('universe_docs')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !doc) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit Document</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <UniverseDocForm doc={doc} mode="edit" />
      </div>
    </div>
  );
}
