#!/bin/bash
# Test foreign key constraints

set -e

echo "Testing foreign key constraints..."

# Test 1: Try to delete a voice that's used by a DJ
VOICE_ID=$(psql $DATABASE_URL -t -c "SELECT id FROM voices LIMIT 1;" | xargs)
DJ_ID=$(psql $DATABASE_URL -t -c "SELECT id FROM djs LIMIT 1;" | xargs)

# Update DJ to use the voice
psql $DATABASE_URL -c "UPDATE djs SET voice_id = '$VOICE_ID' WHERE id = '$DJ_ID';" > /dev/null

# Try to delete the voice (should fail)
psql $DATABASE_URL -c "DELETE FROM voices WHERE id = '$VOICE_ID';" 2>&1 | grep -q "violates foreign key constraint" && echo "✓ Voice deletion prevented" || exit 1

# Test 2: Try to delete a DJ used by a program
PROGRAM_ID=$(psql $DATABASE_URL -t -c "SELECT id FROM programs LIMIT 1;" | xargs)
psql $DATABASE_URL -c "UPDATE programs SET dj_id = '$DJ_ID' WHERE id = '$PROGRAM_ID';" > /dev/null

psql $DATABASE_URL -c "DELETE FROM djs WHERE id = '$DJ_ID';" 2>&1 | grep -q "violates foreign key constraint" && echo "✓ DJ deletion prevented" || exit 1

# Test 3: Delete a program (should cascade to segments)
# Create new test program to delete
TEST_PROGRAM_ID=$(psql $DATABASE_URL -q -t -A -c "
  INSERT INTO programs (name, dj_id, format_clock_id)
  VALUES (
    'Test Program ' || NOW()::text,
    '$DJ_ID',
    (SELECT id FROM format_clocks LIMIT 1)
  )
  RETURNING id;
")

psql $DATABASE_URL -q -c "INSERT INTO segments (program_id, slot_type) VALUES ('$TEST_PROGRAM_ID', 'news');" > /dev/null

# Delete program (should cascade to segments)
psql $DATABASE_URL -c "DELETE FROM programs WHERE id = '$TEST_PROGRAM_ID';" > /dev/null

REMAINING_SEGMENTS=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM segments WHERE program_id = '$TEST_PROGRAM_ID';")
if [ "$REMAINING_SEGMENTS" -eq 0 ]; then
  echo "✓ Program deletion cascades to segments"
else
  echo "✗ Segments not deleted with program"
  exit 1
fi

# Test 4: Delete asset (should set segment.asset_id to NULL)
ASSET_ID=$(psql $DATABASE_URL -q -t -A -c "
  INSERT INTO assets (storage_path, content_hash, content_type)
  VALUES ('/tmp/test.wav', 'testhash123', 'speech')
  RETURNING id;
")

SEGMENT_ID=$(psql $DATABASE_URL -q -t -A -c "
  INSERT INTO segments (program_id, slot_type, asset_id)
  VALUES ('$PROGRAM_ID', 'news', '$ASSET_ID')
  RETURNING id;
")

psql $DATABASE_URL -c "DELETE FROM assets WHERE id = '$ASSET_ID';" > /dev/null

ASSET_NULL=$(psql $DATABASE_URL -t -c "SELECT asset_id IS NULL FROM segments WHERE id = '$SEGMENT_ID';" | xargs)
if [ "$ASSET_NULL" = "t" ]; then
  echo "✓ Asset deletion sets segment.asset_id to NULL"
else
  echo "✗ segment.asset_id not nullified"
  exit 1
fi

# Cleanup
psql $DATABASE_URL -c "DELETE FROM segments WHERE id = '$SEGMENT_ID';" > /dev/null

echo "✓ All foreign key tests passed"
