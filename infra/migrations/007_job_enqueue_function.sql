-- Migration: Job enqueue function
-- Description: Helper function to create and notify jobs

CREATE OR REPLACE FUNCTION enqueue_job(
  p_job_type TEXT,
  p_payload JSONB,
  p_priority INT DEFAULT 5,
  p_schedule_delay_sec INT DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
  v_scheduled_for TIMESTAMPTZ;
BEGIN
  -- Calculate scheduled time
  v_scheduled_for := NOW() + (p_schedule_delay_sec || ' seconds')::INTERVAL;

  -- Validate priority
  IF p_priority < 1 OR p_priority > 10 THEN
    RAISE EXCEPTION 'Priority must be between 1 and 10';
  END IF;

  -- Insert job
  INSERT INTO jobs (job_type, payload, priority, scheduled_for)
  VALUES (p_job_type, p_payload, p_priority, v_scheduled_for)
  RETURNING id INTO v_job_id;

  -- Notify workers immediately if no delay
  IF p_schedule_delay_sec = 0 THEN
    PERFORM pg_notify('new_job_' || p_job_type, v_job_id::TEXT);
  END IF;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Example usage in comments
COMMENT ON FUNCTION enqueue_job IS
  'Enqueue a job with priority and optional delay

   Example:
   SELECT enqueue_job(
     ''segment_make'',
     ''{"segment_id": "123e4567-e89b-12d3-a456-426614174000"}''::jsonb,
     7,  -- High priority
     0   -- No delay
   );';
