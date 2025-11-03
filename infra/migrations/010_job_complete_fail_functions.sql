-- Migration: Job completion functions
-- Description: Mark jobs complete or failed

CREATE OR REPLACE FUNCTION complete_job(
  p_job_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE jobs
  SET state = 'completed',
      completed_at = NOW(),
      updated_at = NOW(),
      locked_until = NULL,
      locked_by = NULL
  WHERE id = p_job_id
    AND state = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- Fail job with retry or DLQ
CREATE OR REPLACE FUNCTION fail_job(
  p_job_id UUID,
  p_error TEXT,
  p_error_details JSONB DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_job RECORD;
  v_action TEXT;
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found', p_job_id;
  END IF;

  -- Check if max retries exceeded
  IF v_job.attempts >= v_job.max_attempts THEN
    -- Move to dead letter queue
    INSERT INTO dead_letter_queue (
      original_job_id,
      job_type,
      payload,
      failure_reason,
      failure_details,
      attempts_made
    ) VALUES (
      p_job_id,
      v_job.job_type,
      v_job.payload,
      p_error,
      p_error_details,
      v_job.attempts
    );

    -- Delete from jobs
    DELETE FROM jobs WHERE id = p_job_id;

    v_action := 'moved_to_dlq';
  ELSE
    -- Retry with exponential backoff
    UPDATE jobs
    SET state = 'pending',
        locked_until = NULL,
        locked_by = NULL,
        error = p_error,
        error_details = p_error_details,
        updated_at = NOW(),
        scheduled_for = NOW() + (
          (300 * POWER(2, attempts))::TEXT || ' seconds'
        )::INTERVAL  -- Exponential backoff: 5min, 10min, 20min...
    WHERE id = p_job_id;

    v_action := 'scheduled_retry';
  END IF;

  RETURN v_action;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION complete_job IS 'Mark job as successfully completed';
COMMENT ON FUNCTION fail_job IS 'Mark job as failed - retries or moves to DLQ';
