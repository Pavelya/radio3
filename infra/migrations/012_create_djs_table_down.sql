-- Rollback: Drop DJs table
-- Description: Removes DJs table

DROP TRIGGER IF EXISTS djs_updated_at ON djs;
DROP TABLE IF EXISTS djs CASCADE;
