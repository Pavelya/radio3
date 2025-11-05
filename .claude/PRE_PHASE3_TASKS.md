# Pre-Phase 3 Foundation Tasks

**Document Version:** 1.0
**Last Updated:** 2025-11-04
**Purpose:** Critical tasks needed before starting Phase 3 (Generation Pipeline)

This document contains missing foundation tasks identified during the Phase 1-2 review. These tasks must be completed to ensure the database schema is complete and the foundation is solid before proceeding to G1-G8.

---

## Summary

| Task | Description | Time | Priority |
|------|-------------|------|----------|
| D11 | DJs Table Migration | 2h | Critical |
| D12 | Voices Table Migration | 1.5h | Critical |
| D13 | Foreign Key Constraints | 1h | High |
| I0 | Foundation Integration Tests | 4h | High |
| G0 | Piper TTS Setup Documentation | 2h | Medium |

**Total Estimated Time:** 10.5 hours
**Must Complete Before:** Task G1 (Piper TTS HTTP Server)

---

# Task D11: Create DJs Table Migration

**Tier:** Data
**Estimated Time:** 2 hours
**Complexity:** Medium
**Prerequisites:** D9 complete (programs table references DJs)

---

## Objective

Create SQL migration for the `djs` table with all columns, indexes, and constraints. This table stores DJ personalities, backgrounds, and voice mappings.

---

## Context from Architecture

**From ARCHITECTURE.md Section 3:**

DJs table stores AI radio personality information:
- Name, bio, personality traits
- Voice mapping (references voices table)
- Speaking style preferences
- Language support

**From PRODUCT VISION.md Point 4:**
> Each AI DJ should have "personality", background, ways of talking, expressions.

**From Seed Data (infra/seed-data/djs.json):**
The seed script expects a `djs` table but currently skips seeding if the table doesn't exist. The table must be created before D10 can fully succeed.

---

## What You're Building

A SQL migration file that creates:
1. `djs` table with all required columns
2. Indexes for performance
3. Constraints for data integrity
4. Trigger for updated_at timestamp

---

## Implementation Steps

### Step 1: Create Migration File

Create `infra/migrations/011_create_djs_table.sql`:

```sql
-- Migration: Create DJs table
-- Description: Stores AI radio personality information
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create DJs table
CREATE TABLE djs (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,  -- URL-friendly identifier (e.g., 'nova-chen')

  -- Biography and personality
  bio_short TEXT NOT NULL,     -- 1-2 sentence intro
  bio_long TEXT,               -- Full background story
  personality_traits JSONB,    -- ['enthusiastic', 'knowledgeable', 'witty']
  speaking_style TEXT,         -- 'formal', 'casual', 'energetic', etc.

  -- Voice configuration
  voice_id UUID NOT NULL,      -- References voices(id)
  speech_speed NUMERIC(3,2) DEFAULT 1.0,  -- 0.5 to 2.0

  -- Specializations
  specializations TEXT[],      -- ['space exploration', 'politics', 'culture']
  preferred_topics TEXT[],     -- Topics this DJ covers well

  -- Show preferences
  preferred_formats TEXT[],    -- ['news', 'interview', 'culture']
  energy_level TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'

  -- Language
  primary_lang TEXT NOT NULL DEFAULT 'en',
  supported_langs TEXT[] DEFAULT ARRAY['en'],

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_djs_slug ON djs(slug);
CREATE INDEX idx_djs_active ON djs(is_active) WHERE is_active = true;
CREATE INDEX idx_djs_voice ON djs(voice_id);
CREATE INDEX idx_djs_lang ON djs(primary_lang);

-- Constraints
ALTER TABLE djs
  ADD CONSTRAINT chk_djs_speech_speed
  CHECK (speech_speed BETWEEN 0.5 AND 2.0);

ALTER TABLE djs
  ADD CONSTRAINT chk_djs_energy_level
  CHECK (energy_level IN ('low', 'medium', 'high'));

ALTER TABLE djs
  ADD CONSTRAINT chk_djs_speaking_style
  CHECK (speaking_style IN ('formal', 'casual', 'energetic', 'relaxed', 'authoritative', 'friendly'));

-- Trigger for updated_at
CREATE TRIGGER djs_updated_at
  BEFORE UPDATE ON djs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE djs IS 'AI radio personalities with voice and style configurations';
COMMENT ON COLUMN djs.personality_traits IS 'JSON array of personality characteristics';
COMMENT ON COLUMN djs.specializations IS 'Areas of expertise for content generation';
COMMENT ON COLUMN djs.speech_speed IS 'TTS speed multiplier (0.5 = slow, 2.0 = fast)';
COMMENT ON COLUMN djs.energy_level IS 'Overall energy for script generation tone';
```

### Step 2: Create Rollback Migration

Create `infra/migrations/011_create_djs_table_down.sql`:

```sql
-- Rollback: Drop DJs table
-- Description: Removes DJs table

DROP TRIGGER IF EXISTS djs_updated_at ON djs;
DROP TABLE IF EXISTS djs CASCADE;
```

### Step 3: Update Programs Migration to Add Foreign Key

**Note:** The programs table (created in D9) references `dj_id` but the constraint may not have been added yet. We'll add it in D13 after both tables exist.

### Step 4: Create Test Script

Create `infra/test-djs-migration.sh`:

```bash
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
```

Make it executable:
```bash
chmod +x infra/test-djs-migration.sh
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Migration creates `djs` table with all columns
- [ ] Slug column has unique constraint
- [ ] Speech speed constraint enforces 0.5-2.0 range
- [ ] Energy level constraint enforces valid values
- [ ] Speaking style constraint enforces valid values
- [ ] All indexes are created
- [ ] Updated_at trigger works
- [ ] Rollback migration removes everything cleanly

### Quality Requirements
- [ ] SQL syntax is valid PostgreSQL
- [ ] Comments explain purpose of key columns
- [ ] Constraints are properly named
- [ ] JSONB fields have proper validation

### Manual Verification
- [ ] Run migration against test database
- [ ] Insert test DJ succeeds
- [ ] Duplicate slug fails appropriately
- [ ] Invalid speech_speed fails appropriately
- [ ] Rollback works
- [ ] Re-apply migration works

---

## Testing Strategy

```bash
# Run migration
node infra/migrate.js up

# Run test script
./infra/test-djs-migration.sh

# Verify table structure
psql $DATABASE_URL -c "\d djs"

# Test rollback
node infra/migrate.js down
node infra/migrate.js up
```

---

## Configuration

No new environment variables needed. Uses existing:
- `DATABASE_URL` (from Supabase)

---

## Next Task Handoff

**What this task provides for D12 (Voices Table):**
- DJs table ready to receive foreign key to voices
- Voice_id column exists but unconstrained (will be linked in D13)

**What this task provides for D10 (Seeding):**
- DJs table exists, allowing seed script to populate DJ data
- Seed script will no longer skip DJ seeding

**What this task provides for A4 (DJ Management UI):**
- Complete DJ schema ready for CRUD operations
- All personality and voice fields available for admin

---

# Task D12: Create Voices Table Migration

**Tier:** Data
**Estimated Time:** 1.5 hours
**Complexity:** Low
**Prerequisites:** None (can run parallel with D11)

---

## Objective

Create SQL migration for the `voices` table that maps voice names to Piper TTS model identifiers. This table provides the voice catalog for DJs.

---

## Context from Architecture

**From ARCHITECTURE.md Section 4 (Piper TTS Service):**

Piper TTS contract expects model names like `en_US-lessac-medium`, `en_GB-alan-medium`, etc.

**From @radio/core/schemas/voices.schema.ts:**
A voice schema already exists in the codebase, indicating voices are a first-class entity.

**Voice Requirements:**
- Map friendly names to Piper model IDs
- Support multiple languages
- Track gender for DJ variety
- Mark quality level (low/medium/high affects file size)

---

## What You're Building

A SQL migration file that creates:
1. `voices` table with Piper TTS mappings
2. Indexes for lookups
3. Sample seed data for common voices

---

## Implementation Steps

### Step 1: Create Migration File

Create `infra/migrations/012_create_voices_table.sql`:

```sql
-- Migration: Create voices table
-- Description: Maps voice names to Piper TTS model identifiers
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create quality enum
CREATE TYPE voice_quality AS ENUM ('low', 'medium', 'high');

-- Create voices table
CREATE TABLE voices (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Friendly name
  name TEXT NOT NULL UNIQUE,           -- 'Lessac (US Male)'
  slug TEXT NOT NULL UNIQUE,           -- 'lessac-us-male'

  -- Piper TTS configuration
  model_name TEXT NOT NULL UNIQUE,     -- 'en_US-lessac-medium'
  quality voice_quality NOT NULL DEFAULT 'medium',

  -- Characteristics
  lang TEXT NOT NULL,                  -- 'en', 'es', 'fr', etc.
  locale TEXT NOT NULL,                -- 'en_US', 'en_GB', 'es_ES', etc.
  gender TEXT NOT NULL,                -- 'male', 'female', 'neutral'

  -- Description
  description TEXT,                    -- 'Clear, professional American male voice'

  -- Availability
  is_available BOOLEAN DEFAULT true,   -- Can be used for new DJs
  requires_download BOOLEAN DEFAULT false,  -- Model needs to be downloaded

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_voices_lang ON voices(lang);
CREATE INDEX idx_voices_locale ON voices(locale);
CREATE INDEX idx_voices_gender ON voices(gender);
CREATE INDEX idx_voices_available ON voices(is_available) WHERE is_available = true;
CREATE INDEX idx_voices_slug ON voices(slug);

-- Constraints
ALTER TABLE voices
  ADD CONSTRAINT chk_voices_gender
  CHECK (gender IN ('male', 'female', 'neutral'));

-- Trigger for updated_at
CREATE TRIGGER voices_updated_at
  BEFORE UPDATE ON voices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE voices IS 'Piper TTS voice model catalog';
COMMENT ON COLUMN voices.model_name IS 'Exact Piper TTS model identifier';
COMMENT ON COLUMN voices.quality IS 'Audio quality level (affects model size)';
COMMENT ON COLUMN voices.requires_download IS 'Whether model needs downloading before use';

-- Insert common voices (for immediate use)
INSERT INTO voices (name, slug, model_name, quality, lang, locale, gender, description) VALUES
  -- English (US)
  ('Lessac (US Male)', 'lessac-us-male', 'en_US-lessac-medium', 'medium', 'en', 'en_US', 'male',
   'Clear, professional American male voice'),
  ('Amy (US Female)', 'amy-us-female', 'en_US-amy-medium', 'medium', 'en', 'en_US', 'female',
   'Friendly, warm American female voice'),
  ('Ryan (US Male)', 'ryan-us-male', 'en_US-ryan-medium', 'medium', 'en', 'en_US', 'male',
   'Energetic American male voice'),
  ('Kimberly (US Female)', 'kimberly-us-female', 'en_US-kimberly-medium', 'medium', 'en', 'en_US', 'female',
   'Professional American female voice'),

  -- English (GB)
  ('Alan (UK Male)', 'alan-uk-male', 'en_GB-alan-medium', 'medium', 'en', 'en_GB', 'male',
   'British male voice with RP accent'),
  ('Alba (UK Female)', 'alba-uk-female', 'en_GB-alba-medium', 'medium', 'en', 'en_GB', 'female',
   'British female voice with clear diction'),

  -- High quality alternatives (if needed later)
  ('Lessac High (US Male)', 'lessac-us-male-hq', 'en_US-lessac-high', 'high', 'en', 'en_US', 'male',
   'High-quality professional American male voice'),
  ('Amy High (US Female)', 'amy-us-female-hq', 'en_US-amy-high', 'high', 'en', 'en_US', 'female',
   'High-quality warm American female voice')
ON CONFLICT (model_name) DO NOTHING;
```

### Step 2: Create Rollback Migration

Create `infra/migrations/012_create_voices_table_down.sql`:

```sql
-- Rollback: Drop voices table
-- Description: Removes voices table and enum

DROP TRIGGER IF EXISTS voices_updated_at ON voices;
DROP TABLE IF EXISTS voices CASCADE;
DROP TYPE IF EXISTS voice_quality;
```

### Step 3: Create Test Script

Create `infra/test-voices-migration.sh`:

```bash
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
```

Make it executable:
```bash
chmod +x infra/test-voices-migration.sh
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Migration creates `voices` table with all columns
- [ ] Voice quality enum created
- [ ] At least 6 sample voices inserted
- [ ] Model_name has unique constraint
- [ ] Gender constraint enforces valid values
- [ ] All indexes created
- [ ] Updated_at trigger works
- [ ] Rollback migration removes everything cleanly

### Quality Requirements
- [ ] SQL syntax is valid PostgreSQL
- [ ] Sample voices use real Piper TTS models
- [ ] Comments explain key columns
- [ ] Constraints properly named

### Manual Verification
- [ ] Run migration against test database
- [ ] Query voices succeeds
- [ ] Duplicate model_name fails appropriately
- [ ] Invalid gender fails appropriately
- [ ] Rollback works

---

## Testing Strategy

```bash
# Run migration
node infra/migrate.js up

# Run test script
./infra/test-voices-migration.sh

# View available voices
psql $DATABASE_URL -c "SELECT name, model_name, gender FROM voices WHERE is_available = true ORDER BY lang, gender;"

# Test rollback
node infra/migrate.js down
node infra/migrate.js up
```

---

## Configuration

No new environment variables needed.

---

## Next Task Handoff

**What this task provides for D11 (DJs Table):**
- Voices catalog ready for DJs to reference
- Sample voices available for testing

**What this task provides for D13 (Foreign Keys):**
- Voices table exists, ready for foreign key from djs.voice_id

**What this task provides for G1 (Piper TTS Server):**
- Voice catalog defines which Piper models to download/use
- Model names match Piper TTS expectations

---

# Task D13: Add Foreign Key Constraints

**Tier:** Data
**Estimated Time:** 1 hour
**Complexity:** Low
**Prerequisites:** D9, D10, D11, D12 complete (all tables exist)

---

## Objective

Add foreign key constraints linking tables together now that all tables exist. This ensures referential integrity across the database.

---

## Context from Architecture

**From ARCHITECTURE.md Section 3:**

Table relationships:
- `segments.program_id` → `programs.id`
- `segments.asset_id` → `assets.id` (nullable)
- `programs.dj_id` → `djs.id`
- `programs.format_clock_id` → `format_clocks.id`
- `djs.voice_id` → `voices.id`

These constraints couldn't be added earlier because the tables were created in separate migrations.

---

## What You're Building

A migration that adds all cross-table foreign key constraints with appropriate ON DELETE behaviors.

---

## Implementation Steps

### Step 1: Create Migration File

Create `infra/migrations/013_add_foreign_key_constraints.sql`:

```sql
-- Migration: Add foreign key constraints
-- Description: Link tables together with referential integrity
-- Author: AI Radio Team
-- Date: 2025-01-01

-- DJs → Voices
ALTER TABLE djs
  ADD CONSTRAINT fk_djs_voice
  FOREIGN KEY (voice_id)
  REFERENCES voices(id)
  ON DELETE RESTRICT;  -- Can't delete voice if DJ uses it

-- Programs → DJs
ALTER TABLE programs
  ADD CONSTRAINT fk_programs_dj
  FOREIGN KEY (dj_id)
  REFERENCES djs(id)
  ON DELETE RESTRICT;  -- Can't delete DJ if program uses them

-- Programs → Format Clocks
ALTER TABLE programs
  ADD CONSTRAINT fk_programs_format_clock
  FOREIGN KEY (format_clock_id)
  REFERENCES format_clocks(id)
  ON DELETE RESTRICT;  -- Can't delete format clock if program uses it

-- Segments → Programs
ALTER TABLE segments
  ADD CONSTRAINT fk_segments_program
  FOREIGN KEY (program_id)
  REFERENCES programs(id)
  ON DELETE CASCADE;   -- Delete segments if program deleted

-- Segments → Assets (nullable)
ALTER TABLE segments
  ADD CONSTRAINT fk_segments_asset
  FOREIGN KEY (asset_id)
  REFERENCES assets(id)
  ON DELETE SET NULL;  -- Keep segment if asset deleted (can regenerate)

-- Comments
COMMENT ON CONSTRAINT fk_djs_voice ON djs IS
  'Ensures every DJ has a valid voice from the catalog';
COMMENT ON CONSTRAINT fk_programs_dj ON programs IS
  'Ensures every program has a valid DJ host';
COMMENT ON CONSTRAINT fk_programs_format_clock ON programs IS
  'Ensures every program follows a valid format clock';
COMMENT ON CONSTRAINT fk_segments_program ON segments IS
  'Cascades deletion: removing program removes its segments';
COMMENT ON CONSTRAINT fk_segments_asset ON segments IS
  'Nullifies on deletion: segment survives asset loss';
```

### Step 2: Create Rollback Migration

Create `infra/migrations/013_add_foreign_key_constraints_down.sql`:

```sql
-- Rollback: Remove foreign key constraints
-- Description: Removes all cross-table foreign keys

ALTER TABLE segments DROP CONSTRAINT IF EXISTS fk_segments_asset;
ALTER TABLE segments DROP CONSTRAINT IF EXISTS fk_segments_program;
ALTER TABLE programs DROP CONSTRAINT IF EXISTS fk_programs_format_clock;
ALTER TABLE programs DROP CONSTRAINT IF EXISTS fk_programs_dj;
ALTER TABLE djs DROP CONSTRAINT IF EXISTS fk_djs_voice;
```

### Step 3: Create Test Script

Create `infra/test-foreign-keys.sh`:

```bash
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
SEGMENT_COUNT_BEFORE=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM segments WHERE program_id = '$PROGRAM_ID';")

if [ "$SEGMENT_COUNT_BEFORE" -eq 0 ]; then
  # Insert a test segment
  psql $DATABASE_URL -c "INSERT INTO segments (program_id, slot_type) VALUES ('$PROGRAM_ID', 'news');" > /dev/null
fi

# Create new test program to delete
TEST_PROGRAM_ID=$(psql $DATABASE_URL -t -c "
  INSERT INTO programs (name, dj_id, format_clock_id)
  VALUES (
    'Test Program',
    '$DJ_ID',
    (SELECT id FROM format_clocks LIMIT 1)
  )
  RETURNING id;
" | xargs)

psql $DATABASE_URL -c "INSERT INTO segments (program_id, slot_type) VALUES ('$TEST_PROGRAM_ID', 'news');" > /dev/null

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
ASSET_ID=$(psql $DATABASE_URL -t -c "
  INSERT INTO assets (storage_path, content_hash)
  VALUES ('/tmp/test.wav', 'testhash123')
  RETURNING id;
" | xargs)

SEGMENT_ID=$(psql $DATABASE_URL -t -c "
  INSERT INTO segments (program_id, slot_type, asset_id)
  VALUES ('$PROGRAM_ID', 'news', '$ASSET_ID')
  RETURNING id;
" | xargs)

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
```

Make it executable:
```bash
chmod +x infra/test-foreign-keys.sh
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] DJs → Voices constraint added
- [ ] Programs → DJs constraint added
- [ ] Programs → Format Clocks constraint added
- [ ] Segments → Programs constraint added (CASCADE)
- [ ] Segments → Assets constraint added (SET NULL)
- [ ] Cannot delete referenced voices
- [ ] Cannot delete referenced DJs
- [ ] Cannot delete referenced format clocks
- [ ] Deleting program deletes its segments
- [ ] Deleting asset nullifies segment.asset_id

### Quality Requirements
- [ ] Constraints properly named (fk_*)
- [ ] Comments explain CASCADE/SET NULL logic
- [ ] Rollback removes all constraints

### Manual Verification
- [ ] Test scripts pass
- [ ] Seed data still loads after constraints added
- [ ] Referential integrity enforced

---

## Testing Strategy

```bash
# Run migration
node infra/migrate.js up

# Run test script
./infra/test-foreign-keys.sh

# View all constraints
psql $DATABASE_URL -c "
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, tc.constraint_name;
"

# Test rollback
node infra/migrate.js down
node infra/migrate.js up
```

---

## Configuration

No new environment variables needed.

---

## Next Task Handoff

**What this task provides for Phase 3:**
- Complete, validated database schema
- Referential integrity guaranteed
- Safe to begin segment generation without orphan records

**What this task provides for Admin UI:**
- Cannot accidentally delete entities in use
- Predictable cascade behavior

---

# Task I0: Foundation Integration Tests

**Tier:** Integration
**Estimated Time:** 4 hours
**Complexity:** Medium
**Prerequisites:** D1-D13 complete, R1-R6 complete

---

## Objective

Create end-to-end integration tests that validate the entire foundation (Data + RAG) works correctly together. This ensures Phase 1-2 completion before starting Phase 3.

---

## Context from Architecture

**Testing Gap:**
- Unit tests exist for individual components
- No tests verify the full pipeline works end-to-end
- Need to validate: Universe doc → Index → Retrieve → Use in segment generation

**Critical Flows to Test:**
1. Job queue lifecycle (enqueue → claim → process → complete)
2. Embedder worker full cycle (index doc → chunk → embed → store)
3. RAG retrieval accuracy (seed data → query → relevant results)
4. State machine transitions (segment states)
5. Database constraints and triggers

---

## What You're Building

Integration test suite that:
1. Validates job queue operations
2. Tests embedder worker end-to-end
3. Verifies RAG retrieval quality
4. Checks database integrity
5. Runs against real Supabase (test instance)

---

## Implementation Steps

### Step 1: Create Test Database Setup

Create `tests/integration/setup.ts`:

```typescript
/**
 * Integration test setup
 * Creates test database and seeds minimal data
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core';

const logger = createLogger('integration-tests');

let supabase: SupabaseClient;

export async function setupTestDatabase(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  supabase = createClient(url, key);

  logger.info('Cleaning test database');

  // Clean tables in dependency order
  await supabase.from('segments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('kb_embeddings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('kb_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('kb_index_status').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('programs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('universe_docs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('assets').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  logger.info('Test database ready');
  return supabase;
}

export async function teardownTestDatabase(): Promise<void> {
  logger.info('Tearing down test database');
  // Cleanup handled by setupTestDatabase at start of next run
}

export function getTestClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Test database not initialized. Call setupTestDatabase first.');
  }
  return supabase;
}
```

### Step 2: Create Job Queue Integration Test

Create `tests/integration/job-queue.test.ts`:

```typescript
/**
 * Job queue integration tests
 * Tests: enqueue → claim → complete/fail
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDatabase, getTestClient } from './setup';
import { createLogger } from '@radio/core';

const logger = createLogger('job-queue-test');

describe('Job Queue Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  it('should enqueue a job', async () => {
    const client = getTestClient();

    const { data, error } = await client.rpc('enqueue_job', {
      p_job_type: 'kb_index',
      p_priority: 5,
      p_payload: { source_id: 'test-123', source_type: 'universe_doc' },
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();

    // Verify job was created
    const { data: job } = await client
      .from('jobs')
      .select('*')
      .eq('id', data)
      .single();

    expect(job).toBeDefined();
    expect(job.job_type).toBe('kb_index');
    expect(job.state).toBe('pending');
    expect(job.priority).toBe(5);
  });

  it('should claim a job', async () => {
    const client = getTestClient();

    // Enqueue a job
    const { data: jobId } = await client.rpc('enqueue_job', {
      p_job_type: 'kb_index',
      p_priority: 10,
      p_payload: { source_id: 'test-claim', source_type: 'event' },
    });

    // Claim the job
    const { data: claimedJob, error } = await client.rpc('claim_job', {
      p_worker_id: 'test-worker-1',
      p_job_types: ['kb_index'],
    });

    expect(error).toBeNull();
    expect(claimedJob).toBeDefined();
    expect(claimedJob.id).toBe(jobId);
    expect(claimedJob.state).toBe('processing');
    expect(claimedJob.claimed_by).toBe('test-worker-1');
  });

  it('should complete a job', async () => {
    const client = getTestClient();

    // Enqueue and claim
    const { data: jobId } = await client.rpc('enqueue_job', {
      p_job_type: 'kb_index',
      p_priority: 5,
      p_payload: { source_id: 'test-complete' },
    });

    await client.rpc('claim_job', {
      p_worker_id: 'test-worker-2',
      p_job_types: ['kb_index'],
    });

    // Complete the job
    const { error } = await client.rpc('complete_job', {
      p_job_id: jobId,
      p_result: { chunks_created: 10, embeddings_created: 10 },
    });

    expect(error).toBeNull();

    // Verify state
    const { data: job } = await client
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    expect(job.state).toBe('completed');
    expect(job.result).toEqual({ chunks_created: 10, embeddings_created: 10 });
  });

  it('should fail a job and send to DLQ', async () => {
    const client = getTestClient();

    // Enqueue and claim
    const { data: jobId } = await client.rpc('enqueue_job', {
      p_job_type: 'kb_index',
      p_priority: 5,
      p_payload: { source_id: 'test-fail' },
    });

    await client.rpc('claim_job', {
      p_worker_id: 'test-worker-3',
      p_job_types: ['kb_index'],
    });

    // Fail the job (max retries = 3 by default)
    for (let i = 0; i < 4; i++) {
      await client.rpc('fail_job', {
        p_job_id: jobId,
        p_error_message: `Attempt ${i + 1} failed`,
        p_should_retry: i < 3,
      });
    }

    // Verify moved to DLQ
    const { data: dlqEntry } = await client
      .from('dead_letter_queue')
      .select('*')
      .eq('job_id', jobId)
      .single();

    expect(dlqEntry).toBeDefined();
    expect(dlqEntry.failure_reason).toContain('Attempt 4 failed');
  });
});
```

### Step 3: Create Embedder Integration Test

Create `tests/integration/embedder.test.ts`:

```typescript
/**
 * Embedder worker integration test
 * Tests: Full indexing pipeline from doc to embeddings
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDatabase, getTestClient } from './setup';
import { EmbedderJobHandler } from '@radio/embedder-worker/src/worker/embedder-job-handler';
import { createLogger } from '@radio/core';

const logger = createLogger('embedder-test');

describe('Embedder Worker Integration', () => {
  let handler: EmbedderJobHandler;

  beforeAll(async () => {
    const client = await setupTestDatabase();
    handler = new EmbedderJobHandler(client);
  });

  it('should index a universe doc end-to-end', async () => {
    const client = getTestClient();

    // 1. Create a test universe doc
    const { data: doc, error: docError } = await client
      .from('universe_docs')
      .insert({
        title: 'Mars Colony Alpha',
        body: `# Mars Colony Alpha

Mars Colony Alpha was established in 2485 as humanity's first permanent settlement on Mars.
The colony houses 50,000 residents and serves as a hub for scientific research.

The terraforming project has been ongoing for 40 years, with significant progress in atmospheric conversion.`,
        category: 'locations',
        lang: 'en',
      })
      .select()
      .single();

    expect(docError).toBeNull();
    expect(doc).toBeDefined();

    // 2. Enqueue indexing job
    const { data: jobId } = await client.rpc('enqueue_job', {
      p_job_type: 'kb_index',
      p_priority: 10,
      p_payload: {
        source_id: doc.id,
        source_type: 'universe_doc',
      },
    });

    expect(jobId).toBeDefined();

    // 3. Claim and process job
    const { data: job } = await client.rpc('claim_job', {
      p_worker_id: 'test-embedder',
      p_job_types: ['kb_index'],
    });

    expect(job).toBeDefined();

    await handler.process(job);

    // 4. Verify chunks created
    const { data: chunks } = await client
      .from('kb_chunks')
      .select('*')
      .eq('source_id', doc.id);

    expect(chunks).toBeDefined();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunk_text).toContain('Mars Colony Alpha');

    // 5. Verify embeddings created
    const { data: embeddings } = await client
      .from('kb_embeddings')
      .select('*')
      .in('chunk_id', chunks.map(c => c.id));

    expect(embeddings).toBeDefined();
    expect(embeddings.length).toBe(chunks.length);
    expect(embeddings[0].embedding).toBeDefined();
    expect(embeddings[0].embedding.length).toBe(1024); // bge-m3 dimension

    // 6. Verify index status updated
    const { data: status } = await client
      .from('kb_index_status')
      .select('*')
      .eq('source_id', doc.id)
      .single();

    expect(status).toBeDefined();
    expect(status.state).toBe('indexed');
    expect(status.chunks_count).toBe(chunks.length);

    logger.info({ docId: doc.id, chunksCount: chunks.length }, 'Document indexed successfully');
  });
});
```

### Step 4: Create RAG Retrieval Integration Test

Create `tests/integration/rag-retrieval.test.ts`:

```typescript
/**
 * RAG retrieval integration test
 * Tests: Hybrid search returns relevant results
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDatabase, getTestClient } from './setup';
import { RetrievalService } from '@radio/api/src/rag/retrieval-service';
import { createLogger } from '@radio/core';

const logger = createLogger('rag-retrieval-test');

describe('RAG Retrieval Integration', () => {
  let retrieval: RetrievalService;

  beforeAll(async () => {
    const client = await setupTestDatabase();
    retrieval = new RetrievalService(client);

    // Seed test data and index it
    // (Assumes embedder tests ran first or we manually index)
    // For this test, we'll create pre-chunked data with mock embeddings

    const { data: doc } = await client
      .from('universe_docs')
      .insert({
        title: 'Space Elevator Project',
        body: 'The Space Elevator connects Earth to orbital platforms, revolutionizing space travel.',
        category: 'technology',
      })
      .select()
      .single();

    const { data: chunk } = await client
      .from('kb_chunks')
      .insert({
        source_id: doc.id,
        source_type: 'universe_doc',
        chunk_text: 'The Space Elevator connects Earth to orbital platforms',
        chunk_index: 0,
        tokens_count: 10,
      })
      .select()
      .single();

    // Insert mock embedding (would normally come from embedder)
    await client.from('kb_embeddings').insert({
      chunk_id: chunk.id,
      embedding: new Array(1024).fill(0.1), // Mock vector
    });
  });

  it('should retrieve relevant chunks for a query', async () => {
    const results = await retrieval.retrieve({
      query: 'How does space travel work?',
      top_k: 5,
      filters: {},
    });

    expect(results).toBeDefined();
    expect(results.chunks).toBeDefined();
    expect(results.chunks.length).toBeGreaterThan(0);
    expect(results.chunks[0]).toHaveProperty('chunk_text');
    expect(results.chunks[0]).toHaveProperty('score');
    expect(results.metadata.query_tokens).toBeGreaterThan(0);

    logger.info({ resultsCount: results.chunks.length }, 'Retrieval test passed');
  });
});
```

### Step 5: Create Integration Test Runner

Create `tests/integration/package.json`:

```json
{
  "name": "@radio/integration-tests",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@radio/embedder-worker": "workspace:*",
    "@radio/api": "workspace:*",
    "@supabase/supabase-js": "^2.39.0"
  },
  "devDependencies": {
    "vitest": "^1.0.4",
    "typescript": "^5.3.3"
  }
}
```

Create `tests/integration/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 30000,
  },
});
```

### Step 6: Create Test Runner Script

Create `infra/run-integration-tests.sh`:

```bash
#!/bin/bash
# Run integration tests against test database

set -e

echo "Running foundation integration tests..."

# Ensure database is migrated
echo "Checking database migrations..."
node infra/migrate.js up

# Run tests
cd tests/integration
pnpm install
pnpm test

echo "✓ All integration tests passed"
```

Make it executable:
```bash
chmod +x infra/run-integration-tests.sh
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Job queue lifecycle test passes (enqueue → claim → complete)
- [ ] Job failure test passes (retry → DLQ)
- [ ] Embedder end-to-end test passes (doc → chunks → embeddings)
- [ ] RAG retrieval test passes (query → relevant results)
- [ ] All tests run against real database
- [ ] Tests are idempotent (can run multiple times)

### Quality Requirements
- [ ] Tests use proper setup/teardown
- [ ] Tests are isolated (don't depend on each other)
- [ ] Tests log meaningful information
- [ ] Test timeout is appropriate (30s)

### Manual Verification
- [ ] Run `./infra/run-integration-tests.sh`
- [ ] All tests pass
- [ ] Test database is clean after run

---

## Testing Strategy

```bash
# Run all integration tests
./infra/run-integration-tests.sh

# Run specific test file
cd tests/integration
pnpm test job-queue.test.ts

# Run with watch mode (for development)
cd tests/integration
pnpm test:watch
```

---

## Configuration

**Environment Variables:**
- `SUPABASE_URL` - Must point to TEST database instance
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for test DB

**Important:** Use a separate test database, not production!

---

## Next Task Handoff

**What this task provides for Phase 3:**
- Confidence that foundation works correctly
- Regression tests for future changes
- Examples of how to test workers and services

**What this task provides for CI/CD:**
- Integration test suite can run in GitHub Actions
- Database validation before deployment

---

# Task G0: Piper TTS Setup Documentation

**Tier:** Documentation
**Estimated Time:** 2 hours
**Complexity:** Low
**Prerequisites:** None (can run in parallel)

---

## Objective

Create comprehensive documentation for installing, configuring, and running Piper TTS locally. This ensures anyone can set up the TTS service needed for Phase 3.

---

## Context from Architecture

**From ARCHITECTURE.md Section 4:**

Piper TTS runs as a self-hosted HTTP service on port 5002. The segment generation worker calls it to synthesize speech from scripts.

**From PRODUCT VISION.md Point 2:**
> Low-cost tools only. This means voice generation should be free.

Piper TTS is open-source and runs locally, meeting the cost requirement.

---

## What You're Building

Documentation that covers:
1. Installing Piper TTS
2. Downloading voice models
3. Running as HTTP server
4. Testing the service
5. Systemd configuration (for production)

---

## Implementation Steps

### Step 1: Create Setup Documentation

Create `.claude/PIPER_TTS_SETUP.md`:

```markdown
# Piper TTS Setup Guide

**Version:** 1.0
**Last Updated:** 2025-01-01

This guide covers installing and running Piper TTS for AI Radio 2525.

---

## Overview

Piper is a fast, local neural text-to-speech system. We use it because:
- ✅ **Free and open-source**
- ✅ **Runs locally** (no API costs)
- ✅ **High quality** neural voices
- ✅ **Fast** inference on CPU
- ✅ **Multiple languages** and voices

---

## Prerequisites

- Linux or macOS (Windows via WSL)
- Python 3.8+
- ~2GB disk space for models

---

## Installation

### Option 1: Install via pip (Recommended)

```bash
# Install Piper
pip install piper-tts

# Verify installation
piper --version
```

### Option 2: Install from source

```bash
# Clone repository
git clone https://github.com/rhasspy/piper.git
cd piper/src/python

# Install
pip install -e .
```

---

## Downloading Voice Models

### Manual Download

Visit [Piper Voices](https://github.com/rhasspy/piper/blob/master/VOICES.md) and download models:

```bash
# Create models directory
mkdir -p ~/.local/share/piper/models

# Download a model (example: US English male)
cd ~/.local/share/piper/models
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

### Recommended Models for AI Radio 2525

Based on our voices table (D12), download these models:

```bash
cd ~/.local/share/piper/models

# US English voices
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json

wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json

# UK English voices
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json
```

### Automatic Download Script

Create `infra/download-voices.sh`:

```bash
#!/bin/bash
# Download required Piper TTS models

set -e

MODELS_DIR="${PIPER_MODELS_DIR:-$HOME/.local/share/piper/models}"
mkdir -p "$MODELS_DIR"

echo "Downloading Piper TTS models to $MODELS_DIR"

VOICES=(
  "en/en_US/lessac/medium"
  "en/en_US/amy/medium"
  "en/en_US/ryan/medium"
  "en/en_GB/alan/medium"
)

for voice in "${VOICES[@]}"; do
  MODEL_NAME=$(basename "$voice")
  LANG_PATH=$(dirname "$voice")

  echo "Downloading $MODEL_NAME..."

  wget -q -P "$MODELS_DIR" \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/$voice/${MODEL_NAME}.onnx"

  wget -q -P "$MODELS_DIR" \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/$voice/${MODEL_NAME}.onnx.json"

  echo "✓ $MODEL_NAME downloaded"
done

echo "✓ All models downloaded successfully"
```

---

## Running Piper as HTTP Server

Piper doesn't include an HTTP server by default, so we'll create one.

### Create HTTP Server

Create `workers/tts-server/server.py`:

```python
#!/usr/bin/env python3
"""
Piper TTS HTTP Server
Exposes Piper TTS via HTTP API for AI Radio 2525
"""

import os
import json
import hashlib
from pathlib import Path
from flask import Flask, request, jsonify
from piper import PiperVoice
import wave
import io

app = Flask(__name__)

# Configuration
MODELS_DIR = Path(os.getenv('PIPER_MODELS_DIR', Path.home() / '.local/share/piper/models'))
CACHE_DIR = Path(os.getenv('PIPER_CACHE_DIR', '/tmp/piper-cache'))
CACHE_DIR.mkdir(exist_ok=True)

# Loaded models cache
loaded_models = {}

def load_model(model_name: str):
    """Load a Piper model (cached)"""
    if model_name in loaded_models:
        return loaded_models[model_name]

    model_path = MODELS_DIR / f"{model_name}.onnx"
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    voice = PiperVoice.load(str(model_path))
    loaded_models[model_name] = voice
    return voice

@app.route('/synthesize', methods=['POST'])
def synthesize():
    """
    Synthesize speech from text

    Body: {
      "text": "Hello from the future",
      "model": "en_US-lessac-medium",
      "speed": 1.0,
      "use_cache": true
    }

    Returns: {
      "audio": "hex-encoded WAV data",
      "duration_sec": 2.5,
      "model": "en_US-lessac-medium",
      "cached": false
    }
    """
    data = request.json

    text = data.get('text')
    model_name = data.get('model', 'en_US-lessac-medium')
    speed = float(data.get('speed', 1.0))
    use_cache = data.get('use_cache', True)

    if not text:
        return jsonify({'error': 'Missing text parameter'}), 400

    # Check cache
    cache_key = hashlib.md5(f"{text}:{model_name}:{speed}".encode()).hexdigest()
    cache_file = CACHE_DIR / f"{cache_key}.wav"

    if use_cache and cache_file.exists():
        with open(cache_file, 'rb') as f:
            audio_data = f.read()

        # Calculate duration
        with wave.open(cache_file, 'rb') as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            duration = frames / float(rate)

        return jsonify({
            'audio': audio_data.hex(),
            'duration_sec': round(duration, 2),
            'model': model_name,
            'cached': True
        })

    # Synthesize
    try:
        voice = load_model(model_name)

        # Generate audio
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wav_file:
            voice.synthesize(text, wav_file, length_scale=1.0/speed)

        audio_data = wav_buffer.getvalue()

        # Save to cache
        if use_cache:
            with open(cache_file, 'wb') as f:
                f.write(audio_data)

        # Calculate duration
        with wave.open(io.BytesIO(audio_data), 'rb') as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            duration = frames / float(rate)

        return jsonify({
            'audio': audio_data.hex(),
            'duration_sec': round(duration, 2),
            'model': model_name,
            'cached': False
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/models', methods=['GET'])
def list_models():
    """List available models"""
    models = []
    for model_file in MODELS_DIR.glob('*.onnx'):
        model_name = model_file.stem
        models.append(model_name)

    return jsonify({'models': models})

@app.route('/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({'status': 'ok', 'loaded_models': len(loaded_models)})

if __name__ == '__main__':
    port = int(os.getenv('PIPER_TTS_PORT', 5002))
    app.run(host='0.0.0.0', port=port, debug=False)
```

### Install Server Dependencies

Create `workers/tts-server/requirements.txt`:

```
flask==3.0.0
piper-tts==1.2.0
```

Install:
```bash
cd workers/tts-server
pip install -r requirements.txt
```

### Run Server

```bash
# Development
python workers/tts-server/server.py

# Or with custom port
PIPER_TTS_PORT=5002 python workers/tts-server/server.py
```

---

## Testing

### Test Voice Synthesis

```bash
curl -X POST http://localhost:5002/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from the future. This is AI Radio 2525.",
    "model": "en_US-lessac-medium",
    "speed": 1.0,
    "use_cache": false
  }' | jq -r '.audio' | xxd -r -p > test.wav

# Play the audio
afplay test.wav  # macOS
# or
aplay test.wav   # Linux
```

### Test Model Listing

```bash
curl http://localhost:5002/models | jq
```

### Test Health Check

```bash
curl http://localhost:5002/health
```

---

## Production Deployment

### Create Systemd Service

Create `/etc/systemd/system/piper-tts.service`:

```ini
[Unit]
Description=Piper TTS HTTP Server
After=network.target

[Service]
Type=simple
User=radio
WorkingDirectory=/opt/ai-radio-2525
Environment="PIPER_MODELS_DIR=/opt/ai-radio-2525/models"
Environment="PIPER_CACHE_DIR=/var/cache/piper-tts"
Environment="PIPER_TTS_PORT=5002"
ExecStart=/usr/bin/python3 /opt/ai-radio-2525/workers/tts-server/server.py
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable piper-tts
sudo systemctl start piper-tts
sudo systemctl status piper-tts
```

---

## Troubleshooting

### Model Not Found

**Error:** `FileNotFoundError: Model not found`

**Solution:** Download the model:
```bash
./infra/download-voices.sh
```

### Port Already in Use

**Error:** `Address already in use`

**Solution:** Change port:
```bash
PIPER_TTS_PORT=5003 python workers/tts-server/server.py
```

### Slow Synthesis

**Symptom:** Synthesis takes >5 seconds

**Solutions:**
- Use `medium` quality models instead of `high`
- Enable caching with `use_cache: true`
- Consider running on GPU (requires ONNX Runtime GPU)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPER_MODELS_DIR` | `~/.local/share/piper/models` | Where voice models are stored |
| `PIPER_CACHE_DIR` | `/tmp/piper-cache` | Where synthesized audio is cached |
| `PIPER_TTS_PORT` | `5002` | HTTP server port |

---

## Next Steps

After setup, proceed to:
- **G1:** Piper TTS HTTP Server (integration with workers)
- **G2:** Piper TTS Cache Layer (optimize for production)

---

## References

- [Piper TTS GitHub](https://github.com/rhasspy/piper)
- [Available Voices](https://github.com/rhasspy/piper/blob/master/VOICES.md)
- [Piper Documentation](https://rhasspy.github.io/piper-samples/)
```

### Step 2: Add to Main Architecture Docs

Update `.claude/ARCHITECTURE.md` Appendix to reference:

```markdown
## Appendix D: Service Setup Guides

- Piper TTS Setup: See `.claude/PIPER_TTS_SETUP.md`
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Installation instructions are clear
- [ ] Model download script works
- [ ] HTTP server code is complete
- [ ] Testing instructions work
- [ ] Systemd configuration is valid
- [ ] Troubleshooting covers common issues

### Quality Requirements
- [ ] Documentation is well-organized
- [ ] Code examples are tested
- [ ] Environment variables documented
- [ ] Links to official docs included

### Manual Verification
- [ ] Follow guide on fresh machine
- [ ] Download models successfully
- [ ] Start server successfully
- [ ] Synthesize test audio
- [ ] Audio quality is acceptable

---

## Testing Strategy

```bash
# Test model download
./infra/download-voices.sh

# Test server startup
python workers/tts-server/server.py

# Test synthesis
curl -X POST http://localhost:5002/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Test","model":"en_US-lessac-medium"}' \
  | jq -r '.audio' | xxd -r -p > test.wav

afplay test.wav
```

---

## Configuration

No new environment variables needed for documentation task itself.

---

## Next Task Handoff

**What this task provides for G1:**
- Complete setup instructions
- HTTP server implementation
- Testing methodology
- Production deployment guide

**What this task provides for new developers:**
- Self-service TTS setup
- No need for hand-holding

---

## Execution Order

Run these tasks in this order:

1. **D11** (DJs Table) - Can run parallel with D12
2. **D12** (Voices Table) - Can run parallel with D11
3. **D13** (Foreign Keys) - Requires D11 and D12 complete
4. **I0** (Integration Tests) - Requires D1-D13 + R1-R6 complete
5. **G0** (Piper Docs) - Can run anytime, parallel with others

**Estimated Total Time:** 10.5 hours

---

## Summary

These 5 tasks complete the foundation and prepare for Phase 3:

- **D11-D13:** Complete the database schema (DJs, Voices, Foreign Keys)
- **I0:** Validate everything works end-to-end
- **G0:** Document TTS setup for Phase 3

After these tasks:
- ✅ Database 100% complete
- ✅ RAG system validated
- ✅ Job queue validated
- ✅ Ready to start segment generation (G1-G8)

---

## Next Phase

Once these are complete, proceed to **Phase 3: Generation Pipeline** starting with:
- **G1:** Piper TTS HTTP Server
- **G2:** Piper TTS Cache Layer
- **G3:** Claude LLM Service
- **G4:** Script Generation Core Logic
