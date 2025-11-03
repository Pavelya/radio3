-- Migration: Segment state machine enforcement
-- Description: Validates state transitions and enforces retry limits

CREATE OR REPLACE FUNCTION check_segment_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check on UPDATE when state changes
  IF TG_OP = 'UPDATE' AND OLD.state != NEW.state THEN

    -- Validate state transitions
    CASE OLD.state
      WHEN 'queued' THEN
        IF NEW.state NOT IN ('retrieving') THEN
          RAISE EXCEPTION 'Invalid transition from queued to %', NEW.state;
        END IF;

      WHEN 'retrieving' THEN
        IF NEW.state NOT IN ('generating', 'failed') THEN
          RAISE EXCEPTION 'Invalid transition from retrieving to %', NEW.state;
        END IF;

      WHEN 'generating' THEN
        IF NEW.state NOT IN ('rendering', 'failed') THEN
          RAISE EXCEPTION 'Invalid transition from generating to %', NEW.state;
        END IF;

      WHEN 'rendering' THEN
        IF NEW.state NOT IN ('normalizing', 'failed') THEN
          RAISE EXCEPTION 'Invalid transition from rendering to %', NEW.state;
        END IF;

      WHEN 'normalizing' THEN
        IF NEW.state NOT IN ('ready', 'failed') THEN
          RAISE EXCEPTION 'Invalid transition from normalizing to %', NEW.state;
        END IF;

      WHEN 'ready' THEN
        IF NEW.state NOT IN ('airing') THEN
          RAISE EXCEPTION 'Invalid transition from ready to %', NEW.state;
        END IF;

      WHEN 'airing' THEN
        IF NEW.state NOT IN ('aired') THEN
          RAISE EXCEPTION 'Invalid transition from airing to %', NEW.state;
        END IF;

      WHEN 'aired' THEN
        IF NEW.state NOT IN ('archived') THEN
          RAISE EXCEPTION 'Invalid transition from aired to %', NEW.state;
        END IF;

      WHEN 'failed' THEN
        IF NEW.state NOT IN ('queued') THEN
          RAISE EXCEPTION 'Failed segments can only transition to queued (retry)';
        END IF;

        -- Enforce retry limits on failed → queued
        IF NEW.state = 'queued' THEN
          IF NEW.retry_count >= NEW.max_retries THEN
            RAISE EXCEPTION 'Segment % has exceeded max retries (%)', NEW.id, NEW.max_retries;
          END IF;
          -- Increment retry count
          NEW.retry_count := NEW.retry_count + 1;
        END IF;

      ELSE
        -- archived has no valid transitions
        RAISE EXCEPTION 'No valid transitions from % state', OLD.state;
    END CASE;

    -- Track state timing
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
CREATE TRIGGER segment_state_transition_check
  BEFORE UPDATE ON segments
  FOR EACH ROW
  EXECUTE FUNCTION check_segment_state_transition();

COMMENT ON FUNCTION check_segment_state_transition() IS
  'Enforces valid state transitions in segments state machine';
