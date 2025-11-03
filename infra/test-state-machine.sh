#!/bin/bash
set -e

echo "Testing segment state machine..."

node infra/migrate.js up

# Test valid transition
psql $DATABASE_URL -c "
INSERT INTO segments (program_id, slot_type, state)
VALUES ('00000000-0000-0000-0000-000000000001', 'news', 'queued')
RETURNING id;

-- This should succeed
UPDATE segments SET state = 'retrieving'
WHERE state = 'queued';
"

# Test invalid transition (should fail)
psql $DATABASE_URL -c "
-- Insert a new segment for invalid transition test
INSERT INTO segments (program_id, slot_type, state)
VALUES ('00000000-0000-0000-0000-000000000003', 'news', 'queued');

-- This should fail
UPDATE segments SET state = 'ready'
WHERE program_id = '00000000-0000-0000-0000-000000000003';
" && echo "✗ Invalid transition allowed!" && exit 1 || echo "✓ Invalid transition blocked"

# Test retry limit
psql $DATABASE_URL -c "
INSERT INTO segments (program_id, slot_type, state, retry_count, max_retries)
VALUES ('00000000-0000-0000-0000-000000000002', 'news', 'failed', 3, 3);

-- This should fail (exceeded retries)
UPDATE segments SET state = 'queued'
WHERE state = 'failed' AND retry_count >= max_retries;
" && echo "✗ Retry limit not enforced!" && exit 1 || echo "✓ Retry limit enforced"

echo "✓ State machine test passed"
