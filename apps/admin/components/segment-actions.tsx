'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface SegmentActionsProps {
  segment: any;
}

export default function SegmentActions({ segment }: SegmentActionsProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleRetry = async () => {
    setLoading(true);

    try {
      // Reset to queued state
      const { error: updateError } = await supabase
        .from('segments')
        .update({ state: 'queued' })
        .eq('id', segment.id);

      if (updateError) throw updateError;

      // Enqueue generation job
      await supabase.rpc('enqueue_job', {
        p_job_type: 'segment_make',
        p_payload: { segment_id: segment.id },
        p_priority: 7,
        p_schedule_delay_sec: 0,
      });

      router.refresh();
    } catch (error) {
      console.error('Retry failed:', error);
      alert('Failed to retry segment');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this segment?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('segments')
        .delete()
        .eq('id', segment.id);

      if (error) throw error;

      router.refresh();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete segment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex space-x-2">
      <Link
        href={`/dashboard/segments/${segment.id}`}
        className="text-blue-600 hover:text-blue-800"
      >
        View
      </Link>

      {segment.state === 'failed' && (
        <>
          <span className="text-gray-300">|</span>
          <button
            onClick={handleRetry}
            disabled={loading}
            className="text-green-600 hover:text-green-800 disabled:opacity-50"
          >
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </>
      )}

      <span className="text-gray-300">|</span>
      <button
        onClick={handleDelete}
        disabled={loading}
        className="text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
