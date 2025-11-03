-- Migration: Dead letter queue
-- Description: Storage for permanently failed jobs

CREATE TABLE dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  failure_reason TEXT NOT NULL,
  failure_details JSONB,
  attempts_made INT NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  resolution TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dlq_unreviewed ON dead_letter_queue(created_at DESC)
  WHERE reviewed_at IS NULL;
CREATE INDEX idx_dlq_job_type ON dead_letter_queue(job_type);
