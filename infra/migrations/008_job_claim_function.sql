-- Migration: Job claim function
-- Description: Atomic job claiming for workers

CREATE OR REPLACE FUNCTION claim_job(
  p_job_type TEXT,
  p_worker_id TEXT,
  p_lease_seconds INT DEFAULT 300
)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  payload JSONB,
  attempts INT,
  max_attempts INT
) AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
BEGIN
  v_locked_until := NOW() + (p_lease_seconds || ' seconds')::INTERVAL;

  RETURN QUERY
  UPDATE jobs j
  SET state = 'processing',
      locked_until = v_locked_until,
      locked_by = p_worker_id,
      attempts = j.attempts + 1,
      started_at = CASE WHEN j.started_at IS NULL THEN NOW() ELSE j.started_at END,
      updated_at = NOW()
  WHERE j.id = (
    SELECT id FROM jobs j2
    WHERE j2.job_type = p_job_type
      AND j2.state = 'pending'
      AND j2.scheduled_for <= NOW()
      AND (j2.locked_until IS NULL OR j2.locked_until < NOW())
      AND j2.attempts < j2.max_attempts
    ORDER BY j2.priority DESC, j2.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING j.id, j.job_type, j.payload, j.attempts, j.max_attempts;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_job IS
  'Atomically claim next available job for a worker

   Returns NULL if no jobs available

   Example:
   SELECT * FROM claim_job(
     ''segment_make'',
     ''worker-01'',
     300  -- 5 minute lease
   );';
