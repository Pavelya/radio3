#!/bin/bash
# Test programs and format clocks migrations

set -e

echo "Testing format clocks and programs migrations..."

# Run migrations
node infra/migrate.js up

# Test format clock insertion
psql $DATABASE_URL -c "
INSERT INTO format_clocks (name, description)
VALUES ('Standard Hour', 'Standard hourly format')
RETURNING id;
"

# Test format slot insertion
CLOCK_ID=$(psql $DATABASE_URL -t -c "SELECT id FROM format_clocks LIMIT 1;")
psql $DATABASE_URL -c "
INSERT INTO format_slots (format_clock_id, slot_type, duration_sec, order_index)
VALUES ('$CLOCK_ID', 'news', 600, 0)
RETURNING id;
"

# Verify foreign key works
psql $DATABASE_URL -c "
SELECT c.name, s.slot_type, s.duration_sec
FROM format_clocks c
JOIN format_slots s ON s.format_clock_id = c.id;
"

echo "✓ Migration test passed"
