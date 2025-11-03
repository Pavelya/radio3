-- Rollback: Drop enqueue function

DROP FUNCTION IF EXISTS enqueue_job(TEXT, JSONB, INT, INT);
