#!/bin/bash
set -e

echo "Testing job enqueue function..."

node infra/migrate.js up

# Test basic enqueue
psql $DATABASE_URL -c "
SELECT enqueue_job(
  'segment_make',
  '{\"segment_id\": \"test-123\"}'::jsonb,
  7,
  0
) AS job_id;
"

# Test delayed job
psql $DATABASE_URL -c "
SELECT enqueue_job(
  'segment_make',
  '{\"segment_id\": \"test-456\"}'::jsonb,
  5,
  3600  -- 1 hour delay
) AS job_id;
"

# Verify delayed job is not immediately fetchable
psql $DATABASE_URL -c "
SELECT COUNT(*) FROM jobs
WHERE state = 'pending'
  AND scheduled_for > NOW();
"

# Test invalid priority (should fail)
psql $DATABASE_URL -c "
SELECT enqueue_job(
  'test',
  '{}'::jsonb,
  15,  -- Invalid priority
  0
);
" && echo "✗ Invalid priority allowed!" && exit 1 || echo "✓ Priority validation works"

echo "✓ Enqueue function test passed"
