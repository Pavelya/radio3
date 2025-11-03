#!/bin/bash
set -e

echo "Testing KB tables migration..."

node infra/migrate.js up

# Test universe doc
psql $DATABASE_URL -c "
INSERT INTO universe_docs (title, body, tags)
VALUES ('Test Doc', 'Test content', ARRAY['test', 'demo'])
RETURNING id;
"

# Test event
psql $DATABASE_URL -c "
INSERT INTO events (title, body, event_date, importance)
VALUES ('Test Event', 'Something happened', '2525-01-01', 8)
RETURNING id;
"

# Test chunk
psql $DATABASE_URL -c "
INSERT INTO kb_chunks (source_id, source_type, chunk_text, chunk_index)
VALUES ('00000000-0000-0000-0000-000000000001', 'universe_doc', 'Test chunk', 0)
RETURNING id;
"

echo "✓ KB migration test passed"
