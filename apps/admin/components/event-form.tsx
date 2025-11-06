'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface EventFormProps {
  event?: any;
  mode: 'create' | 'edit';
}

// FUTURE_YEAR_OFFSET from environment (default: 500)
const FUTURE_YEAR_OFFSET = 500;

export default function EventForm({ event, mode }: EventFormProps) {
  const [title, setTitle] = useState(event?.title || '');
  const [body, setBody] = useState(event?.body || '');
  const [eventDate, setEventDate] = useState(
    event?.event_date ? new Date(event.event_date).toISOString().split('T')[0] : ''
  );
  const [importance, setImportance] = useState(event?.importance || 5);
  const [lang, setLang] = useState(event?.lang || 'en');
  const [tags, setTags] = useState(event?.tags?.join(', ') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Calculate the future date for display
  const futureDate = useMemo(() => {
    if (!eventDate) return null;
    const date = new Date(eventDate);
    date.setFullYear(date.getFullYear() + FUTURE_YEAR_OFFSET);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, [eventDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const eventData = {
      title,
      body,
      event_date: new Date(eventDate).toISOString(),
      importance,
      lang,
      tags: tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0),
      updated_at: new Date().toISOString(),
    };

    try {
      if (mode === 'create') {
        const { data: newEvent, error: insertError } = await supabase
          .from('events')
          .insert([eventData])
          .select()
          .single();

        if (insertError) throw insertError;

        // Trigger embedding job
        await supabase.rpc('enqueue_job', {
          p_job_type: 'kb_index',
          p_payload: {
            source_id: newEvent.id,
            source_type: 'event'
          },
          p_priority: 5,
          p_schedule_delay_sec: 0
        });

        router.push('/dashboard/events');
      } else {
        const { error: updateError } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', event.id);

        if (updateError) throw updateError;

        // Trigger re-indexing
        await supabase.rpc('enqueue_job', {
          p_job_type: 'kb_index',
          p_payload: {
            source_id: event.id,
            source_type: 'event'
          },
          p_priority: 5,
          p_schedule_delay_sec: 0
        });

        router.push('/dashboard/events');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from('events')
        .delete()
        .eq('id', event.id);

      if (deleteError) throw deleteError;

      router.push('/dashboard/events');
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Event Date (Real Time)
          </label>
          <input
            type="date"
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          {futureDate && (
            <p className="text-xs text-blue-600 mt-2 font-medium">
              📅 In story timeline: {futureDate}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            This date will be shown +{FUTURE_YEAR_OFFSET} years in the future on broadcasts
          </p>
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
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Importance: {importance}/10
        </label>
        <input
          type="range"
          min="1"
          max="10"
          className="mt-1 block w-full"
          value={importance}
          onChange={(e) => setImportance(parseInt(e.target.value))}
        />
        <p className="text-xs text-gray-500 mt-1">
          Higher importance = more likely to be referenced in segments
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Tags (comma-separated)
        </label>
        <input
          type="text"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="politics, technology, culture"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description (Markdown)
        </label>
        <textarea
          required
          rows={15}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
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
