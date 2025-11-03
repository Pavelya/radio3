-- Migration: Create jobs table
-- Description: Custom job queue using Postgres LISTEN/NOTIFY
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create job state enum
CREATE TYPE job_state AS ENUM (
  'pending',      -- Waiting to be claimed
  'processing',   -- Currently being worked on
  'completed',    -- Successfully finished
  'failed'        -- Failed (may retry or go to DLQ)
);

-- Create jobs table
CREATE TABLE jobs (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job type determines which worker processes it
  job_type TEXT NOT NULL,  -- 'kb_index', 'segment_make', 'audio_finalize'

  -- Job configuration
  payload JSONB NOT NULL,  -- Job-specific data

  -- State management
  state job_state NOT NULL DEFAULT 'pending',

  -- Priority and scheduling
  priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),

  -- Worker locking
  locked_until TIMESTAMPTZ,
  locked_by TEXT,  -- Worker instance ID

  -- Retry management
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,

  -- Error tracking
  error TEXT,
  error_details JSONB,  -- Stack trace, context

  -- Performance tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job claiming (CRITICAL for performance)
CREATE INDEX idx_jobs_pending ON jobs(priority DESC, created_at ASC)
  WHERE state = 'pending'
    AND scheduled_for <= NOW()
    AND (locked_until IS NULL OR locked_until < NOW());

CREATE INDEX idx_jobs_processing ON jobs(locked_by, locked_until)
  WHERE state = 'processing';

CREATE INDEX idx_jobs_type ON jobs(job_type, state);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_for)
  WHERE state = 'pending';

-- Updated_at trigger
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- NOTIFY trigger for new jobs
CREATE OR REPLACE FUNCTION notify_new_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify for pending jobs that are schedulable now
  IF NEW.state = 'pending' AND NEW.scheduled_for <= NOW() THEN
    PERFORM pg_notify('new_job_' || NEW.job_type, NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_notify_new
  AFTER INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_job();

-- Function to clean up stale locks
CREATE OR REPLACE FUNCTION cleanup_stale_job_locks()
RETURNS void AS $$
BEGIN
  UPDATE jobs
  SET state = 'pending',
      locked_until = NULL,
      locked_by = NULL
  WHERE state = 'processing'
    AND locked_until < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE jobs IS 'Custom job queue using LISTEN/NOTIFY for worker coordination';
COMMENT ON COLUMN jobs.job_type IS 'Determines which worker type processes this job';
COMMENT ON COLUMN jobs.priority IS '1-10, higher number = more urgent';
COMMENT ON COLUMN jobs.locked_until IS 'Lease expiration time for worker lock';
COMMENT ON COLUMN jobs.payload IS 'Job-specific configuration (e.g., {segment_id: "..."})';
