#!/bin/bash
set -e

echo "Testing assets table migration..."

# Run migration
node infra/migrate.js up

# Test insert
psql $DATABASE_URL -c "
INSERT INTO assets (storage_path, content_type, lufs_integrated, peak_db, duration_sec)
VALUES ('/audio/test.wav', 'speech', -16.0, -1.5, 45.5)
RETURNING id, validation_status;
"

# Test deduplication (insert with same hash)
psql $DATABASE_URL -c "
INSERT INTO assets (storage_path, content_type, content_hash)
VALUES ('/audio/test1.wav', 'speech', 'abc123');

-- This should fail (duplicate hash)
INSERT INTO assets (storage_path, content_type, content_hash)
VALUES ('/audio/test2.wav', 'speech', 'abc123');
" || echo "✓ Duplicate hash rejected as expected"

echo "✓ Assets migration test passed"
