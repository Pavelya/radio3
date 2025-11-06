DROP FUNCTION IF EXISTS check_schedule_conflicts;
DROP TRIGGER IF EXISTS broadcast_schedule_updated_at ON broadcast_schedule;
DROP TABLE IF EXISTS broadcast_schedule;
