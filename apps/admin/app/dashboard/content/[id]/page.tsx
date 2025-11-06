import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function ViewDocumentPage({
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

  // Get indexing status
  const { data: indexStatus } = await supabase
    .from('kb_index_status')
    .select('*')
    .eq('source_id', params.id)
    .eq('source_type', 'universe_doc')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{doc.title}</h1>
        <Link
          href={`/dashboard/content/${doc.id}/edit`}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Edit
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Language
            </label>
            <p className="mt-1">{doc.lang}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Tags
            </label>
            <p className="mt-1">{doc.tags?.join(', ') || '-'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Created
            </label>
            <p className="mt-1">
              {new Date(doc.created_at).toLocaleString()}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Updated
            </label>
            <p className="mt-1">
              {new Date(doc.updated_at).toLocaleString()}
            </p>
          </div>
        </div>

        {indexStatus && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Indexing Status
            </label>
            <div className="flex items-center space-x-4">
              <span
                className={`px-3 py-1 rounded text-sm ${
                  indexStatus.state === 'complete'
                    ? 'bg-green-100 text-green-800'
                    : indexStatus.state === 'processing'
                    ? 'bg-yellow-100 text-yellow-800'
                    : indexStatus.state === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {indexStatus.state}
              </span>
              <span className="text-sm text-gray-600">
                {indexStatus.chunks_created} chunks, {indexStatus.embeddings_created} embeddings
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Content
          </label>
          <div className="prose max-w-none bg-gray-50 p-4 rounded">
            <pre className="whitespace-pre-wrap">{doc.body}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
