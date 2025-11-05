#!/bin/bash
# Test DJs table migration

set -e

echo "Testing DJs table migration..."

# Verify table exists
psql $DATABASE_URL -c "\d djs" > /dev/null
echo "✓ Table exists"

# Test insert with valid data
psql $DATABASE_URL -c "
INSERT INTO djs (
  name,
  slug,
  bio_short,
  voice_id,
  personality_traits,
  specializations
)
VALUES (
  'Test DJ',
  'test-dj',
  'A test radio personality',
  gen_random_uuid(),
  '[\"friendly\", \"knowledgeable\"]'::jsonb,
  ARRAY['news', 'culture']
)
RETURNING id;
" > /dev/null
echo "✓ Insert successful"

# Test unique constraint on slug
psql $DATABASE_URL -c "
INSERT INTO djs (name, slug, bio_short, voice_id)
VALUES ('Test DJ 2', 'test-dj', 'Another test', gen_random_uuid());
" 2>&1 | grep -q "duplicate key" && echo "✓ Unique constraint works" || exit 1

# Test speech speed constraint
psql $DATABASE_URL -c "
INSERT INTO djs (name, slug, bio_short, voice_id, speech_speed)
VALUES ('Bad Speed', 'bad-speed', 'Test', gen_random_uuid(), 3.0);
" 2>&1 | grep -q "violates check constraint" && echo "✓ Speed constraint works" || exit 1

# Cleanup
psql $DATABASE_URL -c "DELETE FROM djs WHERE slug = 'test-dj';" > /dev/null

echo "✓ All DJs table tests passed"
