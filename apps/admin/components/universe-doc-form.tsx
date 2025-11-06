'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface UniverseDocFormProps {
  doc?: any;
  mode: 'create' | 'edit';
}

export default function UniverseDocForm({ doc, mode }: UniverseDocFormProps) {
  const [title, setTitle] = useState(doc?.title || '');
  const [body, setBody] = useState(doc?.body || '');
  const [lang, setLang] = useState(doc?.lang || 'en');
  const [tags, setTags] = useState(doc?.tags?.join(', ') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const docData = {
      title,
      body,
      lang,
      tags: tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0),
      updated_at: new Date().toISOString(),
    };

    try {
      if (mode === 'create') {
        // Insert new doc
        const { data: newDoc, error: insertError } = await supabase
          .from('universe_docs')
          .insert([docData])
          .select()
          .single();

        if (insertError) throw insertError;

        // Trigger embedding job
        await supabase.rpc('enqueue_job', {
          p_job_type: 'kb_index',
          p_payload: {
            source_id: newDoc.id,
            source_type: 'universe_doc'
          },
          p_priority: 5,
          p_schedule_delay_sec: 0
        });

        router.push('/dashboard/content');
        router.refresh();
      } else {
        // Update existing doc
        const { error: updateError } = await supabase
          .from('universe_docs')
          .update(docData)
          .eq('id', doc.id);

        if (updateError) throw updateError;

        // Trigger re-indexing job
        await supabase.rpc('enqueue_job', {
          p_job_type: 'kb_index',
          p_payload: {
            source_id: doc.id,
            source_type: 'universe_doc'
          },
          p_priority: 5,
          p_schedule_delay_sec: 0
        });

        router.push('/dashboard/content');
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from('universe_docs')
        .delete()
        .eq('id', doc.id);

      if (deleteError) throw deleteError;

      router.push('/dashboard/content');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          type="text"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Language
        </label>
        <select
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="zh">Chinese</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Tags (comma-separated)
        </label>
        <input
          type="text"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="worldbuilding, technology, culture"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Content (Markdown)
        </label>
        <textarea
          required
          rows={20}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="mt-1 text-sm text-gray-500">
          Use Markdown formatting. Will be automatically indexed for RAG.
        </p>
      </div>

      <div className="flex justify-between">
        <div className="space-x-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>

        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
