#!/bin/bash
# Test jobs table migration

set -e

echo "Testing jobs table migration..."

# Run migration
node infra/migrate.js up

# Verify table exists
psql $DATABASE_URL -c "SELECT COUNT(*) FROM jobs;"

# Test insert
psql $DATABASE_URL -c "
INSERT INTO jobs (job_type, payload, priority)
VALUES ('segment_make', '{\"segment_id\": \"test\"}'::jsonb, 7)
RETURNING id, state, priority;
"

# Test LISTEN/NOTIFY
psql $DATABASE_URL <<EOF
LISTEN new_job_segment_make;
INSERT INTO jobs (job_type, payload) VALUES ('segment_make', '{}'::jsonb);
-- Should receive notification
EOF

# Test pending index
psql $DATABASE_URL -c "
EXPLAIN ANALYZE
SELECT id FROM jobs
WHERE state = 'pending'
  AND scheduled_for <= NOW()
  AND (locked_until IS NULL OR locked_until < NOW())
ORDER BY priority DESC, created_at ASC;
"

echo "✓ Jobs migration test passed"
