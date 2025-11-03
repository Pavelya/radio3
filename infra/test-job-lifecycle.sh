#!/bin/bash
set -e

echo "Testing job complete/fail functions..."

node infra/migrate.js up

# Test 1: Complete job
echo "Test 1: Complete job..."
psql $DATABASE_URL -c "SELECT enqueue_job('test_job', '{}'::jsonb, 5, 0);" > /dev/null

JOB_ID=$(psql $DATABASE_URL -t -c "
SELECT job_id FROM claim_job('test_job', 'worker-01', 300);
")
JOB_ID=$(echo $JOB_ID | tr -d ' ')

psql $DATABASE_URL -c "SELECT complete_job('$JOB_ID');" > /dev/null

# Verify completed
psql $DATABASE_URL -c "
SELECT state FROM jobs WHERE id = '$JOB_ID';
" | grep "completed" || (echo "✗ Job not completed!" && exit 1)

echo "✓ Test 1 passed"

# Test 2: Fail with retry
echo "Test 2: Fail job with retry..."
psql $DATABASE_URL -c "SELECT enqueue_job('test_job', '{}'::jsonb, 5, 0);" > /dev/null

JOB_ID2=$(psql $DATABASE_URL -t -c "
SELECT job_id FROM claim_job('test_job', 'worker-01', 300);
")
JOB_ID2=$(echo $JOB_ID2 | tr -d ' ')

psql $DATABASE_URL -c "
SELECT fail_job('$JOB_ID2', 'Test error', '{\"details\": \"test\"}'::jsonb);
" > /dev/null

# Verify retry scheduled
psql $DATABASE_URL -c "
SELECT state, scheduled_for > NOW() as is_delayed
FROM jobs WHERE id = '$JOB_ID2';
" | grep "pending" || (echo "✗ Retry not scheduled!" && exit 1)

echo "✓ Test 2 passed"

# Test 3: DLQ (exhaust retries)
echo "Test 3: Move to DLQ after max retries..."
psql $DATABASE_URL -c "SELECT enqueue_job('test_job', '{}'::jsonb, 5, 0);" > /dev/null

# Fail 3 times (max_attempts = 3 by default)
for i in {1..3}; do
  JOB_ID3=$(psql $DATABASE_URL -t -c "
  SELECT job_id FROM claim_job('test_job', 'worker-01', 1);
  ")
  JOB_ID3=$(echo $JOB_ID3 | tr -d ' ')

  if [ -z "$JOB_ID3" ]; then
    sleep 2
    JOB_ID3=$(psql $DATABASE_URL -t -c "
    SELECT job_id FROM claim_job('test_job', 'worker-01', 1);
    ")
    JOB_ID3=$(echo $JOB_ID3 | tr -d ' ')
  fi

  psql $DATABASE_URL -c "
  SELECT fail_job('$JOB_ID3', 'Test error $i');
  " > /dev/null
done

# Verify in DLQ
psql $DATABASE_URL -c "
SELECT COUNT(*) FROM dead_letter_queue WHERE original_job_id = '$JOB_ID3';
" | grep "1" || (echo "✗ Job not in DLQ!" && exit 1)

echo "✓ Test 3 passed"
echo ""
echo "✓ All job lifecycle tests passed"
