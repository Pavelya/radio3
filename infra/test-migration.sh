#!/bin/bash
# Test migration script

set -e

echo "Testing segments table migration..."

# Run migration
node infra/migrate.js up

# Verify table exists
psql $DATABASE_URL -c "SELECT COUNT(*) FROM segments;"

# Verify enum exists
psql $DATABASE_URL -c "SELECT enum_range(NULL::segment_state);"

# Test insert
psql $DATABASE_URL -c "
INSERT INTO segments (slot_type, state)
VALUES ('news', 'queued')
RETURNING id;
"

echo "✓ Migration test passed"
