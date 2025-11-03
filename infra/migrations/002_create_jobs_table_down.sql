-- Rollback: Drop jobs table
-- Description: Removes jobs table, triggers, and functions

DROP TRIGGER IF EXISTS jobs_notify_new ON jobs;
DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
DROP FUNCTION IF EXISTS notify_new_job();
DROP FUNCTION IF EXISTS cleanup_stale_job_locks();
DROP TABLE IF EXISTS jobs;
DROP TYPE IF EXISTS job_state;
