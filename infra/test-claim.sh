#!/bin/bash
set -e

echo "Testing job claim function..."

node infra/migrate.js up

# Create test jobs
psql $DATABASE_URL -c "
SELECT enqueue_job('test_job', '{\"test\": 1}'::jsonb, 5, 0);
SELECT enqueue_job('test_job', '{\"test\": 2}'::jsonb, 7, 0);  -- Higher priority
SELECT enqueue_job('test_job', '{\"test\": 3}'::jsonb, 3, 0);
"

# Claim job (should get priority 7 job first)
psql $DATABASE_URL -c "
SELECT job_id, payload->>'test' as test_num, attempts
FROM claim_job('test_job', 'worker-01', 300);
" | grep "2" || (echo "✗ Priority not respected!" && exit 1)

# Try claiming again (should get priority 5 job)
psql $DATABASE_URL -c "
SELECT job_id, payload->>'test' as test_num
FROM claim_job('test_job', 'worker-01', 300);
" | grep "1" || (echo "✗ Second claim failed!" && exit 1)

# Verify first job is locked
psql $DATABASE_URL -c "
SELECT state, locked_by FROM jobs WHERE payload->>'test' = '2';
" | grep "processing" || (echo "✗ Job not locked!" && exit 1)

# Test FOR UPDATE SKIP LOCKED (simulate concurrent workers)
psql $DATABASE_URL -c "
-- Worker 2 should get remaining job (not locked ones)
SELECT job_id, payload->>'test' as test_num
FROM claim_job('test_job', 'worker-02', 300);
" | grep "3" || (echo "✗ SKIP LOCKED not working!" && exit 1)

echo "✓ Claim function test passed"
