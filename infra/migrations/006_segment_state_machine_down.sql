-- Rollback: Remove state machine trigger

DROP TRIGGER IF EXISTS segment_state_transition_check ON segments;
DROP FUNCTION IF EXISTS check_segment_state_transition();
