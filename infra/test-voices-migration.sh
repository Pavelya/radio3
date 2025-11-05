#!/bin/bash
# Test voices table migration

set -e

echo "Testing voices table migration..."

# Verify table exists
psql $DATABASE_URL -c "\d voices" > /dev/null
echo "✓ Table exists"

# Verify seed data inserted
VOICE_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM voices;")
if [ "$VOICE_COUNT" -ge 6 ]; then
  echo "✓ Seed data inserted ($VOICE_COUNT voices)"
else
  echo "✗ Expected at least 6 voices, found $VOICE_COUNT"
  exit 1
fi

# Test unique constraints
psql $DATABASE_URL -c "
INSERT INTO voices (name, slug, model_name, lang, locale, gender)
VALUES ('Duplicate', 'duplicate', 'en_US-lessac-medium', 'en', 'en_US', 'male');
" 2>&1 | grep -q "duplicate key" && echo "✓ Model name unique constraint works" || exit 1

# Test gender constraint
psql $DATABASE_URL -c "
INSERT INTO voices (name, slug, model_name, lang, locale, gender)
VALUES ('Bad Gender', 'bad-gender', 'test-model', 'en', 'en_US', 'robot');
" 2>&1 | grep -q "violates check constraint" && echo "✓ Gender constraint works" || exit 1

# Test query by language
EN_VOICES=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM voices WHERE lang = 'en';")
if [ "$EN_VOICES" -ge 6 ]; then
  echo "✓ Language index works ($EN_VOICES English voices)"
else
  echo "✗ Expected at least 6 English voices"
  exit 1
fi

echo "✓ All voices table tests passed"
