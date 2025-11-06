'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface DLQActionsProps {
  job: any;
}

export default function DLQActions({ job }: DLQActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleRetry = async () => {
    if (!confirm('Retry this job? It will be re-enqueued.')) return;

    setLoading(true);
    try {
      // Re-enqueue job
      await supabase.rpc('enqueue_job', {
        p_job_type: job.job_type,
        p_payload: job.payload,
        p_priority: 5,
        p_schedule_delay_sec: 0,
      });

      // Mark as reviewed
      await supabase
        .from('dead_letter_queue')
        .update({
          reviewed_at: new Date().toISOString(),
          resolution: 'retried',
        })
        .eq('id', job.id);

      router.refresh();
    } catch (error) {
      console.error('Retry failed:', error);
      alert('Failed to retry job');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!confirm('Dismiss this job? It will be marked as reviewed.')) return;

    setLoading(true);
    try {
      await supabase
        .from('dead_letter_queue')
        .update({
          reviewed_at: new Date().toISOString(),
          resolution: 'dismissed',
        })
        .eq('id', job.id);

      router.refresh();
    } catch (error) {
      console.error('Dismiss failed:', error);
      alert('Failed to dismiss job');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Permanently delete this job?')) return;

    setLoading(true);
    try {
      await supabase
        .from('dead_letter_queue')
        .delete()
        .eq('id', job.id);

      router.refresh();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex space-x-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-blue-600 hover:text-blue-800"
        >
          Details
        </button>

        {!job.reviewed_at && (
          <>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleRetry}
              disabled={loading}
              className="text-green-600 hover:text-green-800 disabled:opacity-50"
            >
              Retry
            </button>

            <span className="text-gray-300">|</span>
            <button
              onClick={handleDismiss}
              disabled={loading}
              className="text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
            >
              Dismiss
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

      {showDetails && (
        <div className="mt-4 p-4 bg-gray-50 rounded text-sm">
          <div className="mb-2">
            <strong>Full Failure Reason:</strong>
            <p className="mt-1 text-red-600">{job.failure_reason}</p>
          </div>

          {job.failure_details && (
            <div className="mb-2">
              <strong>Details:</strong>
              <pre className="mt-1 text-xs overflow-auto">
                {JSON.stringify(job.failure_details, null, 2)}
              </pre>
            </div>
          )}

          <div className="mb-2">
            <strong>Full Payload:</strong>
            <pre className="mt-1 text-xs overflow-auto">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </div>

          {job.reviewed_at && (
            <div>
              <strong>Resolution:</strong>
              <p className="mt-1">
                {job.resolution} at {new Date(job.reviewed_at).toLocaleString()}
              </p>
              {job.resolution_notes && (
                <p className="mt-1 text-gray-600">{job.resolution_notes}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
