import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function ContentPage() {
  const supabase = await createSupabaseServerClient();

  const { data: docs, error } = await supabase
    .from('universe_docs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return <div>Error loading content: {error.message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Universe Documents</h1>
        <Link
          href="/dashboard/content/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create Document
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
                Language
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tags
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {docs?.map((doc) => (
              <tr key={doc.id}>
                <td className="px-6 py-4">
                  <Link
                    href={`/dashboard/content/${doc.id}`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {doc.title}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {doc.lang}
                </td>
                <td className="px-6 py-4 text-sm">
                  {doc.tags?.join(', ') || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(doc.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-sm">
                  <Link
                    href={`/dashboard/content/${doc.id}/edit`}
                    className="text-blue-600 hover:text-blue-800 mr-4"
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
