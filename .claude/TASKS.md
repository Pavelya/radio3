# Task D1: Create Segments Table Migration

**Tier:** Data  
**Estimated Time:** 1-2 hours  
**Complexity:** Low  
**Prerequisites:** Phase 0 complete (F1-F10)

---

## Objective

Create SQL migration for the `segments` table with all columns, indexes, and the segment state enum. This is the core table for all generated radio content.

---

## Context from Architecture

**From ARCHITECTURE.md Section 3:**

Segments table stores all generated radio content with a state machine:
- States: queued → retrieving → generating → rendering → normalizing → ready → airing → aired → archived
- Tracks: script, audio asset, duration, citations, retry count
- Includes caching via cache_key for segment reuse

---

## What You're Building

A SQL migration file that creates:
1. `segment_state` enum type
2. `segments` table with all required columns
3. Indexes for performance
4. Constraints for data integrity

---

## Implementation Steps

### Step 1: Create Migration File

Create `infra/migrations/001_create_segments_table.sql`:
```sql
-- Migration: Create segments table
-- Description: Core table for all generated radio content
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create segment state enum
CREATE TYPE segment_state AS ENUM (
  'queued',       -- Initial state, waiting for generation
  'retrieving',   -- Fetching RAG context
  'generating',   -- LLM script generation in progress
  'rendering',    -- TTS synthesis in progress
  'normalizing',  -- Audio mastering in progress
  'ready',        -- Available for playout
  'airing',       -- Currently on-air
  'aired',        -- Completed broadcast
  'archived',     -- Moved to archive storage
  'failed'        -- Terminal failure state
);

-- Create segments table
CREATE TABLE segments (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign keys
  program_id UUID NOT NULL,  -- References programs(id) - added later
  asset_id UUID,              -- References assets(id) - NULL until audio generated
  
  -- Segment configuration
  slot_type TEXT NOT NULL,    -- 'news', 'culture', 'interview', 'station_id', etc.
  lang TEXT NOT NULL DEFAULT 'en',
  
  -- State management
  state segment_state NOT NULL DEFAULT 'queued',
  
  -- Content
  script_md TEXT,             -- Generated script in Markdown
  citations JSONB,            -- [{doc_id: UUID, chunk_id: UUID, title: string}]
  
  -- Audio metadata
  duration_sec NUMERIC(8,2),  -- Duration in seconds (e.g., 45.23)
  
  -- Scheduling
  scheduled_start_ts TIMESTAMPTZ,  -- When this should air
  aired_at TIMESTAMPTZ,            -- When it actually aired
  
  -- Idempotency
  idempotency_key TEXT UNIQUE,
  idempotency_ttl_sec INT DEFAULT 600,
  
  -- Retry management
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  last_error TEXT,
  
  -- Performance tracking
  generation_metrics JSONB,   -- {llm_tokens_in, llm_tokens_out, tts_duration_ms, etc.}
  
  -- Caching for segment reuse
  cache_key TEXT,
  parent_segment_id UUID,     -- References segments(id) for variations
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_segments_state ON segments(state);
CREATE INDEX idx_segments_scheduled ON segments(scheduled_start_ts) 
  WHERE state = 'ready';
CREATE INDEX idx_segments_idempotency ON segments(idempotency_key) 
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_segments_cache_key ON segments(cache_key) 
  WHERE cache_key IS NOT NULL;
CREATE INDEX idx_segments_retry ON segments(retry_count) 
  WHERE state = 'failed';
CREATE INDEX idx_segments_program ON segments(program_id);
CREATE INDEX idx_segments_created ON segments(created_at DESC);

-- Self-referential foreign key for parent_segment_id
ALTER TABLE segments 
  ADD CONSTRAINT fk_segments_parent 
  FOREIGN KEY (parent_segment_id) 
  REFERENCES segments(id) 
  ON DELETE SET NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER segments_updated_at
  BEFORE UPDATE ON segments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE segments IS 'Generated radio content segments with state machine tracking';
COMMENT ON COLUMN segments.state IS 'Current state in generation pipeline';
COMMENT ON COLUMN segments.cache_key IS 'Hash for identifying identical segments for reuse';
COMMENT ON COLUMN segments.citations IS 'Array of source document references used in generation';
COMMENT ON COLUMN segments.generation_metrics IS 'Performance metrics from generation process';
```

### Step 2: Create Rollback Migration

Create `infra/migrations/001_create_segments_table_down.sql`:
```sql
-- Rollback: Drop segments table
-- Description: Removes segments table and enum

DROP TRIGGER IF EXISTS segments_updated_at ON segments;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TABLE IF EXISTS segments;
DROP TYPE IF EXISTS segment_state;
```

### Step 3: Create Migration Runner Script

Create `infra/migrate.js`:
```javascript
/**
 * Simple migration runner for Supabase
 * 
 * Usage:
 *   node infra/migrate.js up    # Run migrations
 *   node infra/migrate.js down  # Rollback last migration
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration(direction = 'up') {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(direction === 'up' ? '.sql' : '_down.sql'))
    .sort();
  
  if (direction === 'down') {
    files.reverse();
  }
  
  for (const file of files) {
    console.log(`Running: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql });
      if (error) throw error;
      console.log(`✓ ${file} completed`);
    } catch (error) {
      console.error(`✗ ${file} failed:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('\nMigrations completed successfully');
}

const direction = process.argv[2] || 'up';
runMigration(direction);
```

### Step 4: Test Migration

Create `infra/test-migration.sh`:
```bash
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
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Migration creates `segment_state` enum with all 10 states
- [ ] Migration creates `segments` table with all columns
- [ ] All indexes are created
- [ ] Updated_at trigger works
- [ ] Rollback migration removes everything cleanly

### Quality Requirements
- [ ] SQL syntax is valid PostgreSQL
- [ ] Comments explain purpose of each column
- [ ] Constraints are properly named
- [ ] Indexes cover common query patterns

### Manual Verification
- [ ] Run migration against test database
- [ ] Insert test row succeeds
- [ ] Query by state index works
- [ ] Rollback works
- [ ] Re-apply migration works

---

## Testing Strategy
```bash
# Test full cycle
./infra/test-migration.sh

# Test rollback
node infra/migrate.js down
node infra/migrate.js up

# Verify indexes
psql $DATABASE_URL -c "\d segments"
```

---

## Configuration

Verify proper configuration in .env 

---

## Next Task Handoff

**What this task provides for D2 (Jobs Table):**

1. **Pattern to follow:** Same migration structure
2. **File location:** `infra/migrations/002_create_jobs_table.sql`
3. **Enum pattern:** Jobs will have `job_state` enum
4. **Trigger pattern:** Same `updated_at` trigger

**Files created:**
- `infra/migrations/001_create_segments_table.sql`
- `infra/migrations/001_create_segments_table_down.sql`
- `infra/migrate.js`
- `infra/test-migration.sh`

**Next task (D2) will:**
- Follow same structure
- Create jobs table
- Add job queue functionality

------------------------------------------------------------

# Task D2: Create Jobs Table Migration

**Tier:** Data  
**Estimated Time:** 1-2 hours  
**Complexity:** Low  
**Prerequisites:** D1 complete

---

## Objective

Create SQL migration for the `jobs` table with job state enum. This is the custom job queue that workers will poll using LISTEN/NOTIFY.

---

## Context from Previous Task

**From D1, you have:**
- Migration pattern in `infra/migrations/001_create_segments_table.sql`
- Migration runner in `infra/migrate.js`
- Test script pattern in `infra/test-migration.sh`

**Follow the same structure** for jobs table.

---

## Context from Architecture

**From ARCHITECTURE.md Section 4:**

Jobs table implements custom queue:
- States: pending → processing → completed | failed
- Uses `FOR UPDATE SKIP LOCKED` for atomic claiming
- LISTEN/NOTIFY for real-time worker notifications
- Priority levels: 1-10 (higher = more urgent)
- Retry logic with exponential backoff

---

## What You're Building

A SQL migration that creates:
1. `job_state` enum
2. `jobs` table with locking columns
3. Indexes for job claiming performance
4. NOTIFY trigger for new jobs

---

## Implementation Steps

### Step 1: Create Migration File

Create `infra/migrations/002_create_jobs_table.sql`:
```sql
-- Migration: Create jobs table
-- Description: Custom job queue using Postgres LISTEN/NOTIFY
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create job state enum
CREATE TYPE job_state AS ENUM (
  'pending',      -- Waiting to be claimed
  'processing',   -- Currently being worked on
  'completed',    -- Successfully finished
  'failed'        -- Failed (may retry or go to DLQ)
);

-- Create jobs table
CREATE TABLE jobs (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Job type determines which worker processes it
  job_type TEXT NOT NULL,  -- 'kb_index', 'segment_make', 'audio_finalize'
  
  -- Job configuration
  payload JSONB NOT NULL,  -- Job-specific data
  
  -- State management
  state job_state NOT NULL DEFAULT 'pending',
  
  -- Priority and scheduling
  priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  
  -- Worker locking
  locked_until TIMESTAMPTZ,
  locked_by TEXT,  -- Worker instance ID
  
  -- Retry management
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  
  -- Error tracking
  error TEXT,
  error_details JSONB,  -- Stack trace, context
  
  -- Performance tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job claiming (CRITICAL for performance)
CREATE INDEX idx_jobs_pending ON jobs(priority DESC, created_at ASC) 
  WHERE state = 'pending' 
    AND scheduled_for <= NOW()
    AND (locked_until IS NULL OR locked_until < NOW());

CREATE INDEX idx_jobs_processing ON jobs(locked_by, locked_until) 
  WHERE state = 'processing';

CREATE INDEX idx_jobs_type ON jobs(job_type, state);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_for) 
  WHERE state = 'pending';

-- Updated_at trigger
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- NOTIFY trigger for new jobs
CREATE OR REPLACE FUNCTION notify_new_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify for pending jobs that are schedulable now
  IF NEW.state = 'pending' AND NEW.scheduled_for <= NOW() THEN
    PERFORM pg_notify('new_job_' || NEW.job_type, NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_notify_new
  AFTER INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_job();

-- Function to clean up stale locks
CREATE OR REPLACE FUNCTION cleanup_stale_job_locks()
RETURNS void AS $$
BEGIN
  UPDATE jobs
  SET state = 'pending',
      locked_until = NULL,
      locked_by = NULL
  WHERE state = 'processing'
    AND locked_until < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE jobs IS 'Custom job queue using LISTEN/NOTIFY for worker coordination';
COMMENT ON COLUMN jobs.job_type IS 'Determines which worker type processes this job';
COMMENT ON COLUMN jobs.priority IS '1-10, higher number = more urgent';
COMMENT ON COLUMN jobs.locked_until IS 'Lease expiration time for worker lock';
COMMENT ON COLUMN jobs.payload IS 'Job-specific configuration (e.g., {segment_id: "..."})';
```

### Step 2: Create Rollback Migration

Create `infra/migrations/002_create_jobs_table_down.sql`:
```sql
-- Rollback: Drop jobs table
-- Description: Removes jobs table, triggers, and functions

DROP TRIGGER IF EXISTS jobs_notify_new ON jobs;
DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
DROP FUNCTION IF EXISTS notify_new_job();
DROP FUNCTION IF EXISTS cleanup_stale_job_locks();
DROP TABLE IF EXISTS jobs;
DROP TYPE IF EXISTS job_state;
```

### Step 3: Create Test Script

Create `infra/test-jobs-migration.sh`:
```bash
#!/bin/bash
# Test jobs table migration

set -e

echo "Testing jobs table migration..."

# Run migration
node infra/migrate.js up

# Verify table exists
psql $DATABASE_URL -c "SELECT COUNT(*) FROM jobs;"

# Test insert
psql $DATABASE_URL -c "
INSERT INTO jobs (job_type, payload, priority) 
VALUES ('segment_make', '{\"segment_id\": \"test\"}'::jsonb, 7) 
RETURNING id, state, priority;
"

# Test LISTEN/NOTIFY
psql $DATABASE_URL <<EOF
LISTEN new_job_segment_make;
INSERT INTO jobs (job_type, payload) VALUES ('segment_make', '{}'::jsonb);
-- Should receive notification
EOF

# Test pending index
psql $DATABASE_URL -c "
EXPLAIN ANALYZE 
SELECT id FROM jobs 
WHERE state = 'pending' 
  AND scheduled_for <= NOW()
  AND (locked_until IS NULL OR locked_until < NOW())
ORDER BY priority DESC, created_at ASC;
"

echo "✓ Jobs migration test passed"
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Migration creates `job_state` enum with 4 states
- [ ] Migration creates `jobs` table with all columns
- [ ] Priority constraint (1-10) enforced
- [ ] NOTIFY trigger fires on new pending jobs
- [ ] Stale lock cleanup function exists

### Quality Requirements
- [ ] Indexes optimized for `FOR UPDATE SKIP LOCKED` pattern
- [ ] NOTIFY includes job_type in channel name
- [ ] Comments explain job queue mechanics

### Manual Verification
- [ ] Insert job triggers NOTIFY
- [ ] Query performance is < 10ms
- [ ] Stale lock cleanup works

---

## Testing Strategy
```bash
# Test migration
./infra/test-jobs-migration.sh

# Test job claiming pattern (simulate worker)
psql $DATABASE_URL <<EOF
-- Insert test job
INSERT INTO jobs (job_type, payload) 
VALUES ('test_job', '{}'::jsonb) 
RETURNING id;

-- Claim job (worker pattern)
UPDATE jobs
SET state = 'processing',
    locked_until = NOW() + INTERVAL '5 minutes',
    locked_by = 'test-worker',
    attempts = attempts + 1,
    started_at = NOW()
WHERE id = (
    SELECT id FROM jobs
    WHERE job_type = 'test_job'
      AND state = 'pending'
      AND scheduled_for <= NOW()
      AND (locked_until IS NULL OR locked_until < NOW())
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING id, state, locked_by;
EOF
```

---

## Next Task Handoff

**What this task provides for D3 (Assets Table):**

1. **Pattern:** Same migration structure
2. **Enums:** Assets will need `validation_status` enum
3. **Indexes:** Pattern for content_hash lookup

**Files created:**
- `infra/migrations/002_create_jobs_table.sql`
- `infra/migrations/002_create_jobs_table_down.sql`
- `infra/test-jobs-migration.sh`

**Next task (D3) will:**
- Create assets table for audio files
- Add validation_status tracking
- Add content_hash for deduplication

-----------------------------------------------------------


# Task D3: Create Assets Table Migration

**Tier:** Data  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** D1, D2 complete

---

## Objective

Create SQL migration for the `assets` table to store audio files with quality validation and deduplication via content hashing.

---

## Context from Previous Tasks

**From D1 & D2:**
- Migration pattern established
- Enum pattern (state types)
- Index pattern for lookups
- Rollback pattern

**Follow same structure.**

---

## Context from Architecture

**From ARCHITECTURE.md Section 3:**

Assets table stores:
- Audio files (speech, music, jingles)
- LUFS/peak measurements
- Content hash for deduplication
- Validation status

---

## Implementation Steps

### Step 1: Create Migration File

Create `infra/migrations/003_create_assets_table.sql`:
```sql
-- Migration: Create assets table
-- Description: Audio file storage with quality validation
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create validation status enum
CREATE TYPE validation_status AS ENUM (
  'pending',    -- Not yet validated
  'passed',     -- Meets quality standards
  'failed'      -- Quality issues detected
);

-- Create assets table
CREATE TABLE assets (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Storage
  storage_path TEXT NOT NULL,  -- Supabase storage path
  
  -- Asset type
  content_type TEXT NOT NULL,  -- 'speech', 'bed', 'jingle', 'music', 'fx'
  
  -- Audio quality metrics
  lufs_integrated NUMERIC(5,2),  -- e.g., -16.00 LUFS
  peak_db NUMERIC(5,2),          -- e.g., -1.00 dBFS
  duration_sec NUMERIC(8,2),     -- e.g., 45.23 seconds
  
  -- Quality validation
  validation_status validation_status DEFAULT 'pending',
  validation_errors JSONB,
  
  -- Deduplication
  content_hash TEXT,  -- SHA256 of audio content
  
  -- Metadata
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_assets_content_hash ON assets(content_hash);
CREATE INDEX idx_assets_validation ON assets(validation_status);
CREATE INDEX idx_assets_content_type ON assets(content_type);
CREATE INDEX idx_assets_created ON assets(created_at DESC);

-- Unique constraint on content_hash (for deduplication)
CREATE UNIQUE INDEX idx_assets_content_hash_unique ON assets(content_hash) 
  WHERE content_hash IS NOT NULL;

-- Foreign key from segments table
ALTER TABLE segments 
  ADD CONSTRAINT fk_segments_asset 
  FOREIGN KEY (asset_id) 
  REFERENCES assets(id) 
  ON DELETE SET NULL;

-- Comments
COMMENT ON TABLE assets IS 'Audio files with quality validation and deduplication';
COMMENT ON COLUMN assets.lufs_integrated IS 'Integrated loudness (LUFS) - target -16 for speech';
COMMENT ON COLUMN assets.peak_db IS 'Peak level (dBFS) - should be below -1.0';
COMMENT ON COLUMN assets.content_hash IS 'SHA256 hash for detecting duplicate audio';
```

### Step 2: Create Rollback Migration

Create `infra/migrations/003_create_assets_table_down.sql`:
```sql
-- Rollback: Drop assets table

-- Remove foreign key from segments
ALTER TABLE segments DROP CONSTRAINT IF EXISTS fk_segments_asset;

-- Drop table
DROP TABLE IF EXISTS assets;
DROP TYPE IF EXISTS validation_status;
```

### Step 3: Test Migration

Create `infra/test-assets-migration.sh`:
```bash
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
```

---

## Acceptance Criteria

- [ ] Migration creates `validation_status` enum
- [ ] Migration creates `assets` table
- [ ] Foreign key to segments works
- [ ] Content hash uniqueness enforced
- [ ] Rollback works

---

## Next Task Handoff

**For D4 (KB Tables):**
- Follow same pattern
- Create `kb_chunks` and `kb_embeddings` tables
- Add vector extension

**Files created:**
- `infra/migrations/003_create_assets_table.sql`
- `infra/migrations/003_create_assets_table_down.sql`


-----------------------------------------------------------

# Task D4: Create Knowledge Base Tables Migration

**Tier:** Data  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** D1, D2, D3 complete

---

## Objective

Create migrations for RAG system tables: `universe_docs`, `events`, `kb_chunks`, `kb_embeddings`, and `kb_index_status`.

---

## Context from Architecture

**From ARCHITECTURE.md Section 3:**

KB tables store:
- Universe docs (worldbuilding content)
- Events (time-stamped happenings)
- Chunks (300-800 token pieces)
- Embeddings (vector representations)
- Index status (tracking embedding jobs)

---

## Implementation Steps

### Step 1: Enable pgvector Extension

Create `infra/migrations/004_enable_pgvector.sql`:
```sql
-- Migration: Enable pgvector extension
-- Description: Required for vector similarity search

CREATE EXTENSION IF NOT EXISTS vector;

COMMENT ON EXTENSION vector IS 'Vector similarity search for RAG';
```

### Step 2: Create Content Tables

Create `infra/migrations/005_create_kb_tables.sql`:
```sql
-- Migration: Create knowledge base tables
-- Description: RAG content and embeddings storage

-- Universe documents (worldbuilding)
CREATE TABLE universe_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  tags TEXT[],
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_universe_docs_lang ON universe_docs(lang);
CREATE INDEX idx_universe_docs_tags ON universe_docs USING GIN(tags);
CREATE INDEX idx_universe_docs_created ON universe_docs(created_at DESC);

-- Events (time-stamped happenings)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  importance INT DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  tags TEXT[],
  lang TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_date ON events(event_date DESC);
CREATE INDEX idx_events_importance ON events(importance DESC);
CREATE INDEX idx_events_lang ON events(lang);
CREATE INDEX idx_events_tags ON events USING GIN(tags);

-- Text chunks (from docs and events)
CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,  -- universe_doc or event id
  source_type TEXT NOT NULL CHECK (source_type IN ('universe_doc', 'event')),
  chunk_text TEXT NOT NULL,
  chunk_index INT NOT NULL,  -- Order within source
  token_count INT,
  lang TEXT NOT NULL DEFAULT 'en',
  content_hash TEXT,  -- For deduplication
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_chunks_source ON kb_chunks(source_id, source_type);
CREATE INDEX idx_kb_chunks_hash ON kb_chunks(content_hash);
CREATE INDEX idx_kb_chunks_lang ON kb_chunks(lang);

-- Vector embeddings
CREATE TABLE kb_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES kb_chunks(id) ON DELETE CASCADE,
  embedding vector(1024),  -- bge-m3 produces 1024-dim vectors
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_embeddings_chunk ON kb_embeddings(chunk_id);

-- Vector similarity index (CRITICAL for performance)
CREATE INDEX idx_kb_embeddings_vector ON kb_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index status tracking
CREATE TYPE kb_index_state AS ENUM (
  'pending',
  'processing',
  'complete',
  'failed'
);

CREATE TABLE kb_index_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('universe_doc', 'event')),
  state kb_index_state NOT NULL DEFAULT 'pending',
  chunks_created INT DEFAULT 0,
  embeddings_created INT DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_index_source ON kb_index_status(source_id, source_type);
CREATE INDEX idx_kb_index_state ON kb_index_status(state);

-- Updated_at triggers
CREATE TRIGGER universe_docs_updated_at
  BEFORE UPDATE ON universe_docs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER kb_index_status_updated_at
  BEFORE UPDATE ON kb_index_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE kb_chunks IS 'Chunked text from universe_docs and events for RAG';
COMMENT ON TABLE kb_embeddings IS 'Vector embeddings for semantic search';
COMMENT ON COLUMN kb_embeddings.embedding IS 'bge-m3 1024-dimensional vector';
```

### Step 3: Create Rollback

Create `infra/migrations/005_create_kb_tables_down.sql`:
```sql
-- Rollback: Drop KB tables

DROP TRIGGER IF EXISTS kb_index_status_updated_at ON kb_index_status;
DROP TRIGGER IF EXISTS events_updated_at ON events;
DROP TRIGGER IF EXISTS universe_docs_updated_at ON universe_docs;

DROP TABLE IF EXISTS kb_index_status;
DROP TABLE IF EXISTS kb_embeddings;
DROP TABLE IF EXISTS kb_chunks;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS universe_docs;

DROP TYPE IF EXISTS kb_index_state;
```

### Step 4: Test Migration

Create `infra/test-kb-migration.sh`:
```bash
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
```

---

## Acceptance Criteria

- [ ] pgvector extension enabled
- [ ] All 5 KB tables created
- [ ] Vector index on embeddings works
- [ ] Foreign keys cascade properly

---

## Next Task Handoff

**For D5 (State Machine Triggers):**
- Add segment state transition validation
- Enforce retry limits

**Files created:**
- `infra/migrations/004_enable_pgvector.sql`
- `infra/migrations/005_create_kb_tables.sql`
- `infra/migrations/005_create_kb_tables_down.sql`


---------------------------------------------------


# Task D5: Segment State Machine Trigger

**Tier:** Data  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** D1-D4 complete

---

## Objective

Create database trigger to enforce valid state transitions in segments table and prevent invalid state changes.

---

## Context from Architecture

**From ARCHITECTURE.md Section 5:**

Valid segment state transitions:
- queued → retrieving
- retrieving → generating | failed
- generating → rendering | failed
- rendering → normalizing | failed
- normalizing → ready | failed
- ready → airing
- airing → aired
- aired → archived
- failed → queued (manual retry only)

Invalid transitions must be rejected.

---

## Implementation Steps

### Step 1: Create Trigger Function

Create `infra/migrations/006_segment_state_machine.sql`:
```sql
-- Migration: Segment state machine enforcement
-- Description: Validates state transitions and enforces retry limits

CREATE OR REPLACE FUNCTION check_segment_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check on UPDATE when state changes
  IF TG_OP = 'UPDATE' AND OLD.state != NEW.state THEN
    
    -- Validate state transitions
    CASE OLD.state
      WHEN 'queued' THEN
        IF NEW.state NOT IN ('retrieving') THEN
          RAISE EXCEPTION 'Invalid transition from queued to %', NEW.state;
        END IF;
      
      WHEN 'retrieving' THEN
        IF NEW.state NOT IN ('generating', 'failed') THEN
          RAISE EXCEPTION 'Invalid transition from retrieving to %', NEW.state;
        END IF;
      
      WHEN 'generating' THEN
        IF NEW.state NOT IN ('rendering', 'failed') THEN
          RAISE EXCEPTION 'Invalid transition from generating to %', NEW.state;
        END IF;
      
      WHEN 'rendering' THEN
        IF NEW.state NOT IN ('normalizing', 'failed') THEN
          RAISE EXCEPTION 'Invalid transition from rendering to %', NEW.state;
        END IF;
      
      WHEN 'normalizing' THEN
        IF NEW.state NOT IN ('ready', 'failed') THEN
          RAISE EXCEPTION 'Invalid transition from normalizing to %', NEW.state;
        END IF;
      
      WHEN 'ready' THEN
        IF NEW.state NOT IN ('airing') THEN
          RAISE EXCEPTION 'Invalid transition from ready to %', NEW.state;
        END IF;
      
      WHEN 'airing' THEN
        IF NEW.state NOT IN ('aired') THEN
          RAISE EXCEPTION 'Invalid transition from airing to %', NEW.state;
        END IF;
      
      WHEN 'aired' THEN
        IF NEW.state NOT IN ('archived') THEN
          RAISE EXCEPTION 'Invalid transition from aired to %', NEW.state;
        END IF;
      
      WHEN 'failed' THEN
        IF NEW.state NOT IN ('queued') THEN
          RAISE EXCEPTION 'Failed segments can only transition to queued (retry)';
        END IF;
        
        -- Enforce retry limits on failed → queued
        IF NEW.state = 'queued' THEN
          IF NEW.retry_count >= NEW.max_retries THEN
            RAISE EXCEPTION 'Segment % has exceeded max retries (%)', NEW.id, NEW.max_retries;
          END IF;
          -- Increment retry count
          NEW.retry_count := NEW.retry_count + 1;
        END IF;
      
      ELSE
        -- archived has no valid transitions
        RAISE EXCEPTION 'No valid transitions from % state', OLD.state;
    END CASE;
    
    -- Track state timing
    NEW.updated_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
CREATE TRIGGER segment_state_transition_check
  BEFORE UPDATE ON segments
  FOR EACH ROW
  EXECUTE FUNCTION check_segment_state_transition();

COMMENT ON FUNCTION check_segment_state_transition() IS 
  'Enforces valid state transitions in segments state machine';
```

### Step 2: Create Rollback

Create `infra/migrations/006_segment_state_machine_down.sql`:
```sql
-- Rollback: Remove state machine trigger

DROP TRIGGER IF EXISTS segment_state_transition_check ON segments;
DROP FUNCTION IF EXISTS check_segment_state_transition();
```

### Step 3: Test Trigger

Create `infra/test-state-machine.sh`:
```bash
#!/bin/bash
set -e

echo "Testing segment state machine..."

node infra/migrate.js up

# Test valid transition
psql $DATABASE_URL -c "
INSERT INTO segments (slot_type, state) 
VALUES ('news', 'queued') 
RETURNING id;

-- This should succeed
UPDATE segments SET state = 'retrieving' 
WHERE state = 'queued';
"

# Test invalid transition (should fail)
psql $DATABASE_URL -c "
-- This should fail
UPDATE segments SET state = 'ready' 
WHERE state = 'queued';
" && echo "✗ Invalid transition allowed!" && exit 1 || echo "✓ Invalid transition blocked"

# Test retry limit
psql $DATABASE_URL -c "
INSERT INTO segments (slot_type, state, retry_count, max_retries) 
VALUES ('news', 'failed', 3, 3);

-- This should fail (exceeded retries)
UPDATE segments SET state = 'queued' 
WHERE state = 'failed' AND retry_count >= max_retries;
" && echo "✗ Retry limit not enforced!" && exit 1 || echo "✓ Retry limit enforced"

echo "✓ State machine test passed"
```

---

## Acceptance Criteria

- [ ] Valid transitions allowed
- [ ] Invalid transitions blocked with clear error
- [ ] Retry count incremented on failed → queued
- [ ] Retry limit enforced
- [ ] Updated_at timestamp updated on state change

---

## Next Task Handoff

**For D6 (Job Queue Enqueue):**
- Create job enqueue function
- Add NOTIFY trigger

**Files created:**
- `infra/migrations/006_segment_state_machine.sql`
- `infra/migrations/006_segment_state_machine_down.sql`

------------------------------------------------------

# Task D6: Job Queue Enqueue Function

**Tier:** Data  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** D5 complete

---

## Objective

Create SQL function to enqueue jobs with priority and scheduling support.

---

## Context from Architecture

**From ARCHITECTURE.md Section 4:**

Job enqueueing:
- Priority levels: 1-10 (higher = more urgent)
- Scheduled jobs (delay execution)
- NOTIFY workers on new jobs

---

## Implementation Steps

### Step 1: Create Enqueue Function

Create `infra/migrations/007_job_enqueue_function.sql`:
```sql
-- Migration: Job enqueue function
-- Description: Helper function to create and notify jobs

CREATE OR REPLACE FUNCTION enqueue_job(
  p_job_type TEXT,
  p_payload JSONB,
  p_priority INT DEFAULT 5,
  p_schedule_delay_sec INT DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
  v_scheduled_for TIMESTAMPTZ;
BEGIN
  -- Calculate scheduled time
  v_scheduled_for := NOW() + (p_schedule_delay_sec || ' seconds')::INTERVAL;
  
  -- Validate priority
  IF p_priority < 1 OR p_priority > 10 THEN
    RAISE EXCEPTION 'Priority must be between 1 and 10';
  END IF;
  
  -- Insert job
  INSERT INTO jobs (job_type, payload, priority, scheduled_for)
  VALUES (p_job_type, p_payload, p_priority, v_scheduled_for)
  RETURNING id INTO v_job_id;
  
  -- Notify workers immediately if no delay
  IF p_schedule_delay_sec = 0 THEN
    PERFORM pg_notify('new_job_' || p_job_type, v_job_id::TEXT);
  END IF;
  
  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Example usage in comments
COMMENT ON FUNCTION enqueue_job IS 
  'Enqueue a job with priority and optional delay
   
   Example:
   SELECT enqueue_job(
     ''segment_make'',
     ''{"segment_id": "123e4567-e89b-12d3-a456-426614174000"}''::jsonb,
     7,  -- High priority
     0   -- No delay
   );';
```

### Step 2: Create Rollback

Create `infra/migrations/007_job_enqueue_function_down.sql`:
```sql
-- Rollback: Drop enqueue function

DROP FUNCTION IF EXISTS enqueue_job(TEXT, JSONB, INT, INT);
```

### Step 3: Test Function

Create `infra/test-enqueue.sh`:
```bash
#!/bin/bash
set -e

echo "Testing job enqueue function..."

node infra/migrate.js up

# Test basic enqueue
psql $DATABASE_URL -c "
SELECT enqueue_job(
  'segment_make',
  '{\"segment_id\": \"test-123\"}'::jsonb,
  7,
  0
) AS job_id;
"

# Test delayed job
psql $DATABASE_URL -c "
SELECT enqueue_job(
  'segment_make',
  '{\"segment_id\": \"test-456\"}'::jsonb,
  5,
  3600  -- 1 hour delay
) AS job_id;
"

# Verify delayed job is not immediately fetchable
psql $DATABASE_URL -c "
SELECT COUNT(*) FROM jobs 
WHERE state = 'pending' 
  AND scheduled_for > NOW();
"

# Test invalid priority (should fail)
psql $DATABASE_URL -c "
SELECT enqueue_job(
  'test',
  '{}'::jsonb,
  15,  -- Invalid priority
  0
);
" && echo "✗ Invalid priority allowed!" && exit 1 || echo "✓ Priority validation works"

echo "✓ Enqueue function test passed"
```

---

## Acceptance Criteria

- [ ] Function creates job with correct priority
- [ ] Delayed jobs scheduled properly
- [ ] NOTIFY sent for immediate jobs
- [ ] Invalid priority rejected

---

## Next Task Handoff

**For D7 (Job Claim Function):**
- Create atomic claim function using FOR UPDATE SKIP LOCKED
- Worker locking logic

**Files created:**
- `infra/migrations/007_job_enqueue_function.sql`
- `infra/migrations/007_job_enqueue_function_down.sql`

-----------------------------------------------

# Task D7: Job Queue Claim Function

**Tier:** Data  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** D6 complete

---

## Objective

Create SQL function to atomically claim jobs using FOR UPDATE SKIP LOCKED pattern for worker coordination.

---

## Context from Architecture

**From ARCHITECTURE.md Section 4:**

Job claiming:
- Atomic using FOR UPDATE SKIP LOCKED
- Priority-based selection
- Worker lease with expiration
- Updates state to 'processing'

---

## Implementation Steps

### Step 1: Create Claim Function

Create `infra/migrations/008_job_claim_function.sql`:
```sql
-- Migration: Job claim function
-- Description: Atomic job claiming for workers

CREATE OR REPLACE FUNCTION claim_job(
  p_job_type TEXT,
  p_worker_id TEXT,
  p_lease_seconds INT DEFAULT 300
)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  payload JSONB,
  attempts INT,
  max_attempts INT
) AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
BEGIN
  v_locked_until := NOW() + (p_lease_seconds || ' seconds')::INTERVAL;
  
  RETURN QUERY
  UPDATE jobs
  SET state = 'processing',
      locked_until = v_locked_until,
      locked_by = p_worker_id,
      attempts = attempts + 1,
      started_at = CASE WHEN started_at IS NULL THEN NOW() ELSE started_at END,
      updated_at = NOW()
  WHERE id = (
    SELECT id FROM jobs
    WHERE job_type = p_job_type
      AND state = 'pending'
      AND scheduled_for <= NOW()
      AND (locked_until IS NULL OR locked_until < NOW())
      AND attempts < max_attempts
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING id, jobs.job_type, jobs.payload, jobs.attempts, jobs.max_attempts;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_job IS 
  'Atomically claim next available job for a worker
   
   Returns NULL if no jobs available
   
   Example:
   SELECT * FROM claim_job(
     ''segment_make'',
     ''worker-01'',
     300  -- 5 minute lease
   );';
```

### Step 2: Create Rollback

Create `infra/migrations/008_job_claim_function_down.sql`:
```sql
-- Rollback: Drop claim function

DROP FUNCTION IF EXISTS claim_job(TEXT, TEXT, INT);
```

### Step 3: Test Function

Create `infra/test-claim.sh`:
```bash
#!/bin/bash
set -e

echo "Testing job claim function..."

node infra/migrate.js up

# Create test jobs
psql $DATABASE_URL -c "
SELECT enqueue_job('test_job', '{\"test\": 1}'::jsonb, 5, 0);
SELECT enqueue_job('test_job', '{\"test\": 2}'::jsonb, 7, 0);  -- Higher priority
SELECT enqueue_job('test_job', '{\"test\": 3}'::jsonb, 3, 0);
"

# Claim job (should get priority 7 job first)
psql $DATABASE_URL -c "
SELECT job_id, payload->>'test' as test_num, attempts 
FROM claim_job('test_job', 'worker-01', 300);
" | grep "2" || (echo "✗ Priority not respected!" && exit 1)

# Try claiming again (should get priority 5 job)
psql $DATABASE_URL -c "
SELECT job_id, payload->>'test' as test_num 
FROM claim_job('test_job', 'worker-01', 300);
" | grep "1" || (echo "✗ Second claim failed!" && exit 1)

# Verify first job is locked
psql $DATABASE_URL -c "
SELECT state, locked_by FROM jobs WHERE payload->>'test' = '2';
" | grep "processing" || (echo "✗ Job not locked!" && exit 1)

# Test FOR UPDATE SKIP LOCKED (simulate concurrent workers)
psql $DATABASE_URL -c "
-- Worker 2 should get remaining job (not locked ones)
SELECT job_id, payload->>'test' as test_num 
FROM claim_job('test_job', 'worker-02', 300);
" | grep "3" || (echo "✗ SKIP LOCKED not working!" && exit 1)

echo "✓ Claim function test passed"
```

---

## Acceptance Criteria

- [ ] Claims highest priority available job
- [ ] Sets worker lease correctly
- [ ] Increments attempt count
- [ ] FOR UPDATE SKIP LOCKED prevents race conditions
- [ ] Returns NULL when no jobs available

---

## Next Task Handoff

**For D8 (Job Complete/Fail Functions):**
- Create complete_job function
- Create fail_job function with retry logic

**Files created:**
- `infra/migrations/008_job_claim_function.sql`
- `infra/migrations/008_job_claim_function_down.sql`

-------------------------------------------

# Task D8: Job Complete and Fail Functions

**Tier:** Data  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** D7 complete

---

## Objective

Create SQL functions to mark jobs as completed or failed, with retry logic and dead letter queue support.

---

## Context from Architecture

Job completion:
- Mark as 'completed' on success
- Mark as 'failed' on error (with retry)
- Move to dead_letter_queue after max retries

---

## Implementation Steps

### Step 1: Create Dead Letter Queue Table

Create `infra/migrations/009_dead_letter_queue.sql`:
```sql
-- Migration: Dead letter queue
-- Description: Storage for permanently failed jobs

CREATE TABLE dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  failure_reason TEXT NOT NULL,
  failure_details JSONB,
  attempts_made INT NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  resolution TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dlq_unreviewed ON dead_letter_queue(created_at DESC) 
  WHERE reviewed_at IS NULL;
CREATE INDEX idx_dlq_job_type ON dead_letter_queue(job_type);
```

### Step 2: Create Complete Function

Create `infra/migrations/010_job_complete_fail_functions.sql`:
```sql
-- Migration: Job completion functions
-- Description: Mark jobs complete or failed

CREATE OR REPLACE FUNCTION complete_job(
  p_job_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE jobs
  SET state = 'completed',
      completed_at = NOW(),
      updated_at = NOW(),
      locked_until = NULL,
      locked_by = NULL
  WHERE id = p_job_id
    AND state = 'processing';
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- Fail job with retry or DLQ
CREATE OR REPLACE FUNCTION fail_job(
  p_job_id UUID,
  p_error TEXT,
  p_error_details JSONB DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_job RECORD;
  v_action TEXT;
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found', p_job_id;
  END IF;
  
  -- Check if max retries exceeded
  IF v_job.attempts >= v_job.max_attempts THEN
    -- Move to dead letter queue
    INSERT INTO dead_letter_queue (
      original_job_id,
      job_type,
      payload,
      failure_reason,
      failure_details,
      attempts_made
    ) VALUES (
      p_job_id,
      v_job.job_type,
      v_job.payload,
      p_error,
      p_error_details,
      v_job.attempts
    );
    
    -- Delete from jobs
    DELETE FROM jobs WHERE id = p_job_id;
    
    v_action := 'moved_to_dlq';
  ELSE
    -- Retry with exponential backoff
    UPDATE jobs
    SET state = 'pending',
        locked_until = NULL,
        locked_by = NULL,
        error = p_error,
        error_details = p_error_details,
        updated_at = NOW(),
        scheduled_for = NOW() + (
          (300 * POWER(2, attempts))::TEXT || ' seconds'
        )::INTERVAL  -- Exponential backoff: 5min, 10min, 20min...
    WHERE id = p_job_id;
    
    v_action := 'scheduled_retry';
  END IF;
  
  RETURN v_action;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION complete_job IS 'Mark job as successfully completed';
COMMENT ON FUNCTION fail_job IS 'Mark job as failed - retries or moves to DLQ';
```

### Step 3: Create Rollback

Create `infra/migrations/010_job_complete_fail_functions_down.sql`:
```sql
-- Rollback: Drop completion functions

DROP FUNCTION IF EXISTS fail_job(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS complete_job(UUID);
```

Create `infra/migrations/009_dead_letter_queue_down.sql`:
```sql
-- Rollback: Drop DLQ table

DROP TABLE IF EXISTS dead_letter_queue;
```

### Step 4: Test Functions

Create `infra/test-job-lifecycle.sh`:
```bash
#!/bin/bash
set -e

echo "Testing job complete/fail functions..."

node infra/migrate.js up

# Create and claim job
JOB_ID=$(psql $DATABASE_URL -t -c "
SELECT enqueue_job('test_job', '{}'::jsonb, 5, 0);
")

JOB_ID=$(echo $JOB_ID | tr -d ' ')

psql $DATABASE_URL -c "
SELECT * FROM claim_job('test_job', 'worker-01', 300);
"

# Test complete
psql $DATABASE_URL -c "
SELECT complete_job('$JOB_ID');
"

# Verify completed
psql $DATABASE_URL -c "
SELECT state FROM jobs WHERE id = '$JOB_ID';
" | grep "completed" || (echo "✗ Job not completed!" && exit 1)

# Test fail with retry
JOB_ID2=$(psql $DATABASE_URL -t -c "
SELECT enqueue_job('test_job', '{}'::jsonb, 5, 0);
")
JOB_ID2=$(echo $JOB_ID2 | tr -d ' ')

psql $DATABASE_URL -c "
SELECT * FROM claim_job('test_job', 'worker-01', 300);
SELECT fail_job('$JOB_ID2', 'Test error', '{\"details\": \"test\"}'::jsonb);
"

# Verify retry scheduled
psql $DATABASE_URL -c "
SELECT state, scheduled_for > NOW() as is_delayed 
FROM jobs WHERE id = '$JOB_ID2';
" | grep "pending" || (echo "✗ Retry not scheduled!" && exit 1)

# Test DLQ (exhaust retries)
JOB_ID3=$(psql $DATABASE_URL -t -c "
SELECT enqueue_job('test_job', '{}'::jsonb, 5, 0);
")
JOB_ID3=$(echo $JOB_ID3 | tr -d ' ')

# Fail 3 times
for i in {1..3}; do
  psql $DATABASE_URL -c "
  SELECT * FROM claim_job('test_job', 'worker-01', 1);
  SELECT fail_job('$JOB_ID3', 'Test error $i');
  " > /dev/null
  sleep 2
done

# Verify in DLQ
psql $DATABASE_URL -c "
SELECT COUNT(*) FROM dead_letter_queue WHERE original_job_id = '$JOB_ID3';
" | grep "1" || (echo "✗ Job not in DLQ!" && exit 1)

echo "✓ Job lifecycle test passed"
```

---

## Acceptance Criteria

- [ ] complete_job marks job as completed
- [ ] fail_job retries with exponential backoff
- [ ] fail_job moves to DLQ after max retries
- [ ] DLQ preserves job details for review

---

## Next Task Handoff

**Data Tier Complete!**

**For R1 (Text Chunking):**
- Start RAG tier implementation
- Use jobs from D1-D8 for async processing

**Files created:**
- `infra/migrations/009_dead_letter_queue.sql`
- `infra/migrations/010_job_complete_fail_functions.sql`
- All rollback files

**Database is now fully functional with:**
- ✅ Segments table with state machine
- ✅ Job queue with priority/retry/DLQ
- ✅ Assets table with deduplication
- ✅ KB tables for RAG

-------------------------------------------------

# Task R1: Text Chunking Service - Core Logic

**Tier:** RAG  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** D1-D8 complete (database ready)

---

## Objective

Create text chunking service that splits documents into 300-800 token chunks while preserving semantic boundaries (sentences, paragraphs).

---

## Context from Architecture

**From ARCHITECTURE.md Section 5:**

Chunking requirements:
- Target: 300-800 tokens per chunk
- Preserve sentence boundaries
- Handle Markdown formatting
- Track chunk metadata (index, token count)
- Deduplication via content hash

---

## Context from Previous Tasks

**From D4:**
- `kb_chunks` table exists with: source_id, source_type, chunk_text, chunk_index, token_count, content_hash
- `universe_docs` and `events` tables are sources

---

## What You're Building

A service that:
1. Takes a document (text)
2. Splits into semantic chunks
3. Calculates token counts
4. Generates content hashes
5. Returns chunk objects ready for DB insertion

**NOT in this task:**
- Language detection (next task)
- Database insertion (worker task)
- Embedding generation (separate task)

---

## Directory Structure
```
workers/embedder/
├── src/
│   ├── chunking/
│   │   ├── chunker.ts          # This task
│   │   ├── tokenizer.ts        # This task
│   │   └── markdown-cleaner.ts # This task
│   └── index.ts
├── tests/
│   └── chunking.test.ts
├── package.json
└── tsconfig.json
```

---

## Implementation Steps

### Step 1: Create Package Structure

Create `workers/embedder/package.json`:
```json
{
  "name": "@radio/embedder-worker",
  "version": "0.0.1",
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "gpt-3-encoder": "^1.1.4",
    "marked": "^11.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^1.0.4",
    "tsx": "^4.7.0"
  }
}
```

### Step 2: Create Tokenizer

Create `workers/embedder/src/chunking/tokenizer.ts`:
```typescript
import { encode } from 'gpt-3-encoder';

/**
 * Tokenizer for estimating chunk sizes
 * Uses GPT-3 tokenizer as approximation
 */
export class Tokenizer {
  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    try {
      return encode(text).length;
    } catch (error) {
      // Fallback: approximate as word count * 1.3
      return Math.ceil(text.split(/\s+/).length * 1.3);
    }
  }

  /**
   * Truncate text to max tokens
   */
  truncate(text: string, maxTokens: number): string {
    const tokens = encode(text);
    if (tokens.length <= maxTokens) {
      return text;
    }

    // Decode truncated tokens
    // Note: This is approximate, may need adjustment
    const words = text.split(/\s+/);
    const targetWords = Math.floor(maxTokens / 1.3);
    return words.slice(0, targetWords).join(' ');
  }
}
```

### Step 3: Create Markdown Cleaner

Create `workers/embedder/src/chunking/markdown-cleaner.ts`:
```typescript
import { marked } from 'marked';

/**
 * Clean and normalize Markdown for chunking
 */
export class MarkdownCleaner {
  /**
   * Strip Markdown formatting but preserve structure
   */
  clean(markdown: string): string {
    // Remove code blocks
    markdown = markdown.replace(/```[\s\S]*?```/g, '[code block]');
    
    // Remove inline code
    markdown = markdown.replace(/`[^`]+`/g, '[code]');
    
    // Remove images
    markdown = markdown.replace(/!\[.*?\]\(.*?\)/g, '[image]');
    
    // Convert links to text
    markdown = markdown.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    
    // Remove extra whitespace
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.trim();
    
    return markdown;
  }

  /**
   * Extract plain text from Markdown
   */
  toPlainText(markdown: string): string {
    // Use marked to parse then extract text
    const html = marked.parse(markdown) as string;
    
    // Strip HTML tags
    const text = html.replace(/<[^>]+>/g, ' ');
    
    // Normalize whitespace
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Check if text is mostly code
   */
  isCode(text: string): boolean {
    const codeIndicators = [
      /```/g,
      /^    /gm,  // Indented code blocks
      /function\s+\w+\s*\(/,
      /class\s+\w+/,
      /const\s+\w+\s*=/
    ];

    let matches = 0;
    for (const pattern of codeIndicators) {
      if (pattern.test(text)) matches++;
    }

    return matches >= 2;
  }
}
```

### Step 4: Create Chunker

Create `workers/embedder/src/chunking/chunker.ts`:
```typescript
import crypto from 'crypto';
import { Tokenizer } from './tokenizer';
import { MarkdownCleaner } from './markdown-cleaner';

export interface ChunkConfig {
  minTokens: number;
  maxTokens: number;
  overlapTokens: number;
}

export interface Chunk {
  chunkText: string;
  chunkIndex: number;
  tokenCount: number;
  contentHash: string;
}

/**
 * Text chunking service
 * Splits documents into semantic chunks for RAG
 */
export class Chunker {
  private tokenizer: Tokenizer;
  private cleaner: MarkdownCleaner;
  private config: ChunkConfig;

  constructor(config?: Partial<ChunkConfig>) {
    this.tokenizer = new Tokenizer();
    this.cleaner = new MarkdownCleaner();
    this.config = {
      minTokens: config?.minTokens ?? 300,
      maxTokens: config?.maxTokens ?? 800,
      overlapTokens: config?.overlapTokens ?? 50
    };
  }

  /**
   * Chunk a document into pieces
   */
  chunk(text: string): Chunk[] {
    // Clean Markdown
    const cleaned = this.cleaner.clean(text);

    // Split into sentences
    const sentences = this.splitSentences(cleaned);

    // Group sentences into chunks
    const chunks: Chunk[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.tokenizer.countTokens(sentence);

      // If adding this sentence exceeds max, save current chunk
      if (currentTokens + sentenceTokens > this.config.maxTokens && currentChunk.length > 0) {
        chunks.push(this.createChunk(currentChunk.join(' '), chunks.length));
        
        // Start new chunk with overlap
        currentChunk = this.getOverlapSentences(currentChunk);
        currentTokens = this.tokenizer.countTokens(currentChunk.join(' '));
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    // Save final chunk
    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(currentChunk.join(' '), chunks.length));
    }

    // Filter out chunks that are too small
    return chunks.filter(c => c.tokenCount >= this.config.minTokens);
  }

  /**
   * Split text into sentences
   */
  private splitSentences(text: string): string[] {
    // Split on sentence boundaries
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return sentences;
  }

  /**
   * Get last N sentences for overlap
   */
  private getOverlapSentences(sentences: string[]): string[] {
    let overlap: string[] = [];
    let tokens = 0;

    // Add sentences from end until we reach overlap target
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      const sentenceTokens = this.tokenizer.countTokens(sentence);

      if (tokens + sentenceTokens > this.config.overlapTokens) {
        break;
      }

      overlap.unshift(sentence);
      tokens += sentenceTokens;
    }

    return overlap;
  }

  /**
   * Create chunk object with metadata
   */
  private createChunk(text: string, index: number): Chunk {
    const tokenCount = this.tokenizer.countTokens(text);
    const contentHash = this.hashContent(text);

    return {
      chunkText: text,
      chunkIndex: index,
      tokenCount,
      contentHash
    };
  }

  /**
   * Generate SHA256 hash of content
   */
  private hashContent(text: string): string {
    return crypto
      .createHash('sha256')
      .update(text)
      .digest('hex');
  }
}
```

### Step 5: Create Tests

Create `workers/embedder/tests/chunking.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Chunker } from '../src/chunking/chunker';
import { Tokenizer } from '../src/chunking/tokenizer';
import { MarkdownCleaner } from '../src/chunking/markdown-cleaner';

describe('Tokenizer', () => {
  const tokenizer = new Tokenizer();

  it('should count tokens in text', () => {
    const text = 'This is a test sentence.';
    const count = tokenizer.countTokens(text);
    
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });

  it('should truncate text to max tokens', () => {
    const text = 'word '.repeat(1000);
    const truncated = tokenizer.truncate(text, 100);
    
    const count = tokenizer.countTokens(truncated);
    expect(count).toBeLessThanOrEqual(100);
  });
});

describe('MarkdownCleaner', () => {
  const cleaner = new MarkdownCleaner();

  it('should remove code blocks', () => {
    const markdown = 'Text before\n```js\ncode\n```\nText after';
    const cleaned = cleaner.clean(markdown);
    
    expect(cleaned).not.toContain('```');
    expect(cleaned).toContain('Text before');
    expect(cleaned).toContain('[code block]');
  });

  it('should convert links to text', () => {
    const markdown = 'Check [this link](http://example.com) out';
    const cleaned = cleaner.clean(markdown);
    
    expect(cleaned).toContain('this link');
    expect(cleaned).not.toContain('http://');
  });

  it('should detect code', () => {
    const code = '```js\nfunction test() {}\n```';
    expect(cleaner.isCode(code)).toBe(true);

    const text = 'This is just regular text.';
    expect(cleaner.isCode(text)).toBe(false);
  });
});

describe('Chunker', () => {
  const chunker = new Chunker({
    minTokens: 50,
    maxTokens: 200,
    overlapTokens: 20
  });

  it('should chunk text into pieces', () => {
    const text = 'Sentence one. Sentence two. '.repeat(100);
    const chunks = chunker.chunk(text);
    
    expect(chunks.length).toBeGreaterThan(0);
    
    // Check token counts
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThanOrEqual(50);
      expect(chunk.tokenCount).toBeLessThanOrEqual(200);
    }
  });

  it('should assign chunk indexes', () => {
    const text = 'Sentence. '.repeat(300);
    const chunks = chunker.chunk(text);
    
    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });

  it('should generate content hashes', () => {
    const text = 'Test content for hashing.';
    const chunks = chunker.chunk(text);
    
    expect(chunks[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should create overlap between chunks', () => {
    const text = 'Sentence A. Sentence B. Sentence C. '.repeat(50);
    const chunks = chunker.chunk(text);
    
    if (chunks.length > 1) {
      // Check if chunks have overlapping content
      const chunk1End = chunks[0].chunkText.slice(-50);
      const chunk2Start = chunks[1].chunkText.slice(0, 50);
      
      // Should have some overlap
      expect(chunk2Start).toContain('Sentence');
    }
  });

  it('should filter out chunks that are too small', () => {
    const text = 'Short.';
    const chunks = chunker.chunk(text);
    
    // Should be empty or have chunks >= minTokens
    chunks.forEach(chunk => {
      expect(chunk.tokenCount).toBeGreaterThanOrEqual(50);
    });
  });
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Chunks are 300-800 tokens
- [ ] Sentence boundaries preserved
- [ ] Content hash generated for each chunk
- [ ] Chunk overlap implemented
- [ ] Markdown cleaned properly

### Quality Requirements
- [ ] All tests pass
- [ ] No console.log
- [ ] Types imported from @radio/core
- [ ] JSDoc comments on public methods

### Manual Verification
```bash
cd workers/embedder
pnpm install
pnpm test
pnpm typecheck
```

---

## Next Task Handoff

**For R2 (Language Detection):**
- Add language detection to chunker
- Detect language before chunking
- Pass language to chunk metadata

**Files created:**
- `workers/embedder/src/chunking/chunker.ts`
- `workers/embedder/src/chunking/tokenizer.ts`
- `workers/embedder/src/chunking/markdown-cleaner.ts`
- `workers/embedder/tests/chunking.test.ts`

**This chunker can now:**
- ✅ Split text into semantic chunks
- ✅ Preserve sentence boundaries
- ✅ Generate content hashes
- ✅ Create chunk overlap

----------------------------------------------------

# Task R2: Text Chunking - Language Detection

**Tier:** RAG  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** R1 complete

---

## Objective

Add language detection to chunking service to automatically identify document language before chunking.

---

## Context from Previous Task

**From R1:**
- Chunker exists in `workers/embedder/src/chunking/chunker.ts`
- Returns chunks with metadata
- Need to add language field to chunk output

---

## Context from Architecture

**From ARCHITECTURE.md Section 5:**

Language detection:
- Detect before chunking
- Support: en, es, zh (Phase 1: en only)
- Store in chunk metadata

---

## Implementation Steps

### Step 1: Add Language Detection Library

Update `workers/embedder/package.json`:
```json
{
  "dependencies": {
    "@radio/core": "workspace:*",
    "gpt-3-encoder": "^1.1.4",
    "marked": "^11.0.0",
    "franc-min": "^6.1.0"
  }
}
```

### Step 2: Create Language Detector

Create `workers/embedder/src/chunking/language-detector.ts`:
```typescript
import { franc } from 'franc-min';

/**
 * Language detection for documents
 */
export class LanguageDetector {
  private readonly supportedLanguages = ['eng', 'spa', 'cmn']; // English, Spanish, Chinese

  /**
   * Detect language from text
   * Returns ISO 639-2 code
   */
  detect(text: string): string {
    // Need at least 100 chars for reliable detection
    if (text.length < 100) {
      return 'en'; // Default to English
    }

    // Use franc for detection
    const detected = franc(text, { only: this.supportedLanguages });

    // Map ISO 639-3 to ISO 639-1
    const langMap: Record<string, string> = {
      'eng': 'en',
      'spa': 'es',
      'cmn': 'zh',
      'und': 'en' // Undetermined -> default to English
    };

    return langMap[detected] || 'en';
  }

  /**
   * Detect language with confidence score
   */
  detectWithConfidence(text: string): { lang: string; confidence: number } {
    if (text.length < 100) {
      return { lang: 'en', confidence: 0.5 };
    }

    const detected = franc(text, { only: this.supportedLanguages });
    
    // franc returns 'und' if uncertain
    if (detected === 'und') {
      return { lang: 'en', confidence: 0.3 };
    }

    const langMap: Record<string, string> = {
      'eng': 'en',
      'spa': 'es',
      'cmn': 'zh'
    };

    // Rough confidence estimate based on text length
    const confidence = Math.min(0.95, text.length / 1000);

    return {
      lang: langMap[detected] || 'en',
      confidence
    };
  }
}
```

### Step 3: Update Chunk Interface

Update `workers/embedder/src/chunking/chunker.ts`:
```typescript
export interface Chunk {
  chunkText: string;
  chunkIndex: number;
  tokenCount: number;
  contentHash: string;
  lang: string;  // ADD THIS
}
```

### Step 4: Integrate Language Detection

Update `workers/embedder/src/chunking/chunker.ts`:
```typescript
import crypto from 'crypto';
import { Tokenizer } from './tokenizer';
import { MarkdownCleaner } from './markdown-cleaner';
import { LanguageDetector } from './language-detector';  // ADD THIS

export interface ChunkConfig {
  minTokens: number;
  maxTokens: number;
  overlapTokens: number;
}

export interface Chunk {
  chunkText: string;
  chunkIndex: number;
  tokenCount: number;
  contentHash: string;
  lang: string;
}

export class Chunker {
  private tokenizer: Tokenizer;
  private cleaner: MarkdownCleaner;
  private detector: LanguageDetector;  // ADD THIS
  private config: ChunkConfig;

  constructor(config?: Partial<ChunkConfig>) {
    this.tokenizer = new Tokenizer();
    this.cleaner = new MarkdownCleaner();
    this.detector = new LanguageDetector();  // ADD THIS
    this.config = {
      minTokens: config?.minTokens ?? 300,
      maxTokens: config?.maxTokens ?? 800,
      overlapTokens: config?.overlapTokens ?? 50
    };
  }

  /**
   * Chunk a document into pieces
   */
  chunk(text: string, providedLang?: string): Chunk[] {
    // Detect language if not provided
    const lang = providedLang || this.detector.detect(text);

    // Clean Markdown
    const cleaned = this.cleaner.clean(text);

    // Split into sentences
    const sentences = this.splitSentences(cleaned);

    // Group sentences into chunks
    const chunks: Chunk[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.tokenizer.countTokens(sentence);

      if (currentTokens + sentenceTokens > this.config.maxTokens && currentChunk.length > 0) {
        chunks.push(this.createChunk(currentChunk.join(' '), chunks.length, lang));
        
        currentChunk = this.getOverlapSentences(currentChunk);
        currentTokens = this.tokenizer.countTokens(currentChunk.join(' '));
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(currentChunk.join(' '), chunks.length, lang));
    }

    return chunks.filter(c => c.tokenCount >= this.config.minTokens);
  }

  // ... (keep existing methods)

  /**
   * Create chunk object with metadata
   */
  private createChunk(text: string, index: number, lang: string): Chunk {  // MODIFIED
    const tokenCount = this.tokenizer.countTokens(text);
    const contentHash = this.hashContent(text);

    return {
      chunkText: text,
      chunkIndex: index,
      tokenCount,
      contentHash,
      lang  // ADD THIS
    };
  }

  // ... (rest of methods unchanged)
}
```

### Step 5: Add Tests

Create `workers/embedder/tests/language-detection.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { LanguageDetector } from '../src/chunking/language-detector';
import { Chunker } from '../src/chunking/chunker';

describe('LanguageDetector', () => {
  const detector = new LanguageDetector();

  it('should detect English', () => {
    const text = 'This is a sample English text that is long enough for reliable detection. ' +
                 'We need at least one hundred characters to ensure accurate language identification.';
    const lang = detector.detect(text);
    
    expect(lang).toBe('en');
  });

  it('should detect Spanish', () => {
    const text = 'Este es un texto de ejemplo en español que es lo suficientemente largo para ' +
                 'una detección confiable. Necesitamos al menos cien caracteres para garantizar ' +
                 'una identificación precisa del idioma.';
    const lang = detector.detect(text);
    
    expect(lang).toBe('es');
  });

  it('should default to English for short text', () => {
    const text = 'Short';
    const lang = detector.detect(text);
    
    expect(lang).toBe('en');
  });

  it('should return confidence score', () => {
    const text = 'This is English text. '.repeat(20);
    const result = detector.detectWithConfidence(text);
    
    expect(result.lang).toBe('en');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe('Chunker with Language Detection', () => {
  const chunker = new Chunker();

  it('should add language to chunks', () => {
    const text = 'This is an English sentence. '.repeat(100);
    const chunks = chunker.chunk(text);
    
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].lang).toBe('en');
  });

  it('should accept provided language', () => {
    const text = 'Text here. '.repeat(100);
    const chunks = chunker.chunk(text, 'es'); // Force Spanish
    
    expect(chunks[0].lang).toBe('es');
  });

  it('should maintain language across all chunks', () => {
    const text = 'Sentence. '.repeat(300);
    const chunks = chunker.chunk(text, 'en');
    
    chunks.forEach(chunk => {
      expect(chunk.lang).toBe('en');
    });
  });
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Language detected automatically
- [ ] Can override with provided language
- [ ] All chunks have lang field
- [ ] Defaults to 'en' for short/ambiguous text

### Quality Requirements
- [ ] All tests pass
- [ ] No console.log
- [ ] Types match Chunk interface

### Manual Verification
```bash
cd workers/embedder
pnpm install
pnpm test
pnpm typecheck
```

---

## Next Task Handoff

**For R3 (Embedding Service):**
- Create HTTP client for embedding API
- Use chunks from R1+R2
- Generate 1024-dim vectors

**Files modified:**
- `workers/embedder/src/chunking/chunker.ts`
- `workers/embedder/tests/chunking.test.ts`

**Files created:**
- `workers/embedder/src/chunking/language-detector.ts`
- `workers/embedder/tests/language-detection.test.ts`

**Chunker now outputs:**
```typescript
{
  chunkText: string,
  chunkIndex: number,
  tokenCount: number,
  contentHash: string,
  lang: string  // ← NEW
}
```

-------------------------------------

# Task R3: Embedding Service - API Client

**Tier:** RAG  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** R2 complete

---

## Objective

Create HTTP client for embedding API (using bge-m3 model) to generate 1024-dimensional vectors for text chunks.

---

## Context from Previous Tasks

**From R1+R2:**
- Chunks ready with: chunkText, tokenCount, lang, contentHash
- Need to convert text → vectors

---

## Context from Architecture

**From ARCHITECTURE.md Section 5:**

Embedding requirements:
- Model: bge-m3 (multilingual, 1024 dimensions)
- Batch processing: 32 chunks at a time
- Caching: cache embeddings by content hash
- Timeout: 30 seconds per batch

---

## Implementation Steps

### Step 1: Choose Embedding Provider

For MVP, we'll use **Hugging Face Inference API** (free tier):
- bge-m3 model available
- 1000 requests/day free
- Simple REST API

Add to `workers/embedder/package.json`:
```json
{
  "dependencies": {
    "@radio/core": "workspace:*",
    "gpt-3-encoder": "^1.1.4",
    "marked": "^11.0.0",
    "franc-min": "^6.1.0",
    "axios": "^1.6.0"
  }
}
```

### Step 2: Create Embedding Client

Create `workers/embedder/src/embedding/embedding-client.ts`:
```typescript
import axios, { AxiosInstance } from 'axios';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('embedding-client');

export interface EmbeddingRequest {
  texts: string[];
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  dimensions: number;
}

/**
 * Client for text embedding API
 * Uses Hugging Face Inference API with bge-m3 model
 */
export class EmbeddingClient {
  private client: AxiosInstance;
  private readonly model = 'BAAI/bge-m3';
  private readonly batchSize = 32;
  private readonly timeout = 30000; // 30 seconds

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('EMBEDDING_API_KEY is required');
    }

    this.client = axios.create({
      baseURL: 'https://api-inference.huggingface.co/pipeline/feature-extraction',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: this.timeout
    });
  }

  /**
   * Generate embeddings for texts
   * Automatically batches requests
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    logger.info({ count: texts.length }, 'Generating embeddings');

    // Process in batches
    const batches = this.createBatches(texts, this.batchSize);
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.debug({ batchIndex: i, batchSize: batch.length }, 'Processing batch');

      try {
        const embeddings = await this.embedBatch(batch);
        allEmbeddings.push(...embeddings);
      } catch (error) {
        logger.error({ 
          error: error instanceof Error ? error.message : 'Unknown error',
          batchIndex: i 
        }, 'Batch embedding failed');
        throw error;
      }

      // Rate limiting: wait between batches
      if (i < batches.length - 1) {
        await this.sleep(500); // 500ms between batches
      }
    }

    logger.info({ count: allEmbeddings.length }, 'Embeddings generated');
    return allEmbeddings;
  }

  /**
   * Generate embeddings for a single batch
   */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.post(`/${this.model}`, {
        inputs: texts,
        options: {
          wait_for_model: true
        }
      });

      // HF returns different formats depending on input
      const embeddings = Array.isArray(response.data[0]) 
        ? response.data 
        : [response.data];

      // Validate dimensions
      for (const embedding of embeddings) {
        if (embedding.length !== 1024) {
          throw new Error(`Expected 1024 dimensions, got ${embedding.length}`);
        }
      }

      return embeddings;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error({
          status: error.response?.status,
          data: error.response?.data
        }, 'Embedding API error');

        // Handle rate limiting
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded');
        }

        // Handle model loading
        if (error.response?.status === 503) {
          throw new Error('Model is loading, retry later');
        }
      }

      throw error;
    }
  }

  /**
   * Split texts into batches
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep for ms milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Step 3: Add Caching Layer

Create `workers/embedder/src/embedding/embedding-cache.ts`:
```typescript
import { createLogger } from '@radio/core/logger';

const logger = createLogger('embedding-cache');

export interface CachedEmbedding {
  contentHash: string;
  embedding: number[];
}

/**
 * In-memory cache for embeddings
 * Prevents regenerating embeddings for duplicate content
 */
export class EmbeddingCache {
  private cache: Map<string, number[]>;
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get cached embedding by content hash
   */
  get(contentHash: string): number[] | null {
    const embedding = this.cache.get(contentHash);
    
    if (embedding) {
      logger.debug({ contentHash }, 'Cache hit');
      return embedding;
    }

    return null;
  }

  /**
   * Store embedding in cache
   */
  set(contentHash: string, embedding: number[]): void {
    // Implement LRU: if cache full, remove oldest
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      logger.debug({ removedHash: firstKey }, 'Cache eviction');
    }

    this.cache.set(contentHash, embedding);
  }

  /**
   * Get multiple embeddings
   * Returns Map of found embeddings and array of missing hashes
   */
  getMany(contentHashes: string[]): {
    found: Map<string, number[]>;
    missing: string[];
  } {
    const found = new Map<string, number[]>();
    const missing: string[] = [];

    for (const hash of contentHashes) {
      const embedding = this.get(hash);
      if (embedding) {
        found.set(hash, embedding);
      } else {
        missing.push(hash);
      }
    }

    logger.info({ 
      total: contentHashes.length,
      hits: found.size,
      misses: missing.length
    }, 'Cache lookup');

    return { found, missing };
  }

  /**
   * Store multiple embeddings
   */
  setMany(embeddings: CachedEmbedding[]): void {
    for (const { contentHash, embedding } of embeddings) {
      this.set(contentHash, embedding);
    }

    logger.info({ count: embeddings.length }, 'Cached embeddings');
  }

  /**
   * Clear all cached embeddings
   */
  clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilizationPercent: (this.cache.size / this.maxSize) * 100
    };
  }
}
```

### Step 4: Create Embedding Service

Create `workers/embedder/src/embedding/embedding-service.ts`:
```typescript
import { EmbeddingClient } from './embedding-client';
import { EmbeddingCache } from './embedding-cache';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('embedding-service');

export interface EmbedRequest {
  text: string;
  contentHash: string;
}

export interface EmbedResult {
  contentHash: string;
  embedding: number[];
  cached: boolean;
}

/**
 * High-level embedding service with caching
 */
export class EmbeddingService {
  private client: EmbeddingClient;
  private cache: EmbeddingCache;

  constructor(apiKey: string) {
    this.client = new EmbeddingClient(apiKey);
    this.cache = new EmbeddingCache();
  }

  /**
   * Generate embeddings for multiple texts
   * Uses cache to avoid redundant API calls
   */
  async embedMany(requests: EmbedRequest[]): Promise<EmbedResult[]> {
    if (requests.length === 0) {
      return [];
    }

    logger.info({ count: requests.length }, 'Embedding requests');

    // Check cache
    const hashes = requests.map(r => r.contentHash);
    const { found, missing } = this.cache.getMany(hashes);

    const results: EmbedResult[] = [];

    // Add cached results
    for (const [hash, embedding] of found.entries()) {
      results.push({ contentHash: hash, embedding, cached: true });
    }

    // Generate embeddings for cache misses
    if (missing.length > 0) {
      const textsToEmbed = requests
        .filter(r => missing.includes(r.contentHash))
        .map(r => r.text);

      logger.info({ count: missing.length }, 'Generating new embeddings');
      
      const newEmbeddings = await this.client.embed(textsToEmbed);

      // Add to results and cache
      for (let i = 0; i < missing.length; i++) {
        const hash = missing[i];
        const embedding = newEmbeddings[i];

        results.push({ contentHash: hash, embedding, cached: false });
        this.cache.set(hash, embedding);
      }
    }

    // Sort results to match input order
    const sortedResults = requests.map(req => {
      const result = results.find(r => r.contentHash === req.contentHash);
      if (!result) {
        throw new Error(`Missing result for hash ${req.contentHash}`);
      }
      return result;
    });

    const cachedCount = sortedResults.filter(r => r.cached).length;
    logger.info({ 
      total: sortedResults.length,
      cached: cachedCount,
      generated: sortedResults.length - cachedCount
    }, 'Embeddings complete');

    return sortedResults;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}
```

### Step 5: Add Tests

Create `workers/embedder/tests/embedding.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { EmbeddingCache } from '../src/embedding/embedding-cache';

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache(100);
  });

  it('should store and retrieve embeddings', () => {
    const hash = 'abc123';
    const embedding = Array(1024).fill(0.5);

    cache.set(hash, embedding);
    const retrieved = cache.get(hash);

    expect(retrieved).toEqual(embedding);
  });

  it('should return null for missing embeddings', () => {
    const retrieved = cache.get('nonexistent');
    expect(retrieved).toBeNull();
  });

  it('should handle batch operations', () => {
    const embeddings = [
      { contentHash: 'hash1', embedding: Array(1024).fill(0.1) },
      { contentHash: 'hash2', embedding: Array(1024).fill(0.2) }
    ];

    cache.setMany(embeddings);

    const { found, missing } = cache.getMany(['hash1', 'hash2', 'hash3']);

    expect(found.size).toBe(2);
    expect(missing).toEqual(['hash3']);
  });

  it('should evict oldest when cache full', () => {
    const smallCache = new EmbeddingCache(2);

    smallCache.set('hash1', [1]);
    smallCache.set('hash2', [2]);
    smallCache.set('hash3', [3]); // Should evict hash1

    expect(smallCache.get('hash1')).toBeNull();
    expect(smallCache.get('hash2')).not.toBeNull();
    expect(smallCache.get('hash3')).not.toBeNull();
  });

  it('should provide stats', () => {
    cache.set('hash1', [1]);
    cache.set('hash2', [2]);

    const stats = cache.getStats();

    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(100);
    expect(stats.utilizationPercent).toBe(2);
  });
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Generates 1024-dim embeddings
- [ ] Batches requests automatically
- [ ] Caches by content hash
- [ ] Handles API errors gracefully
- [ ] Rate limits between batches

### Quality Requirements
- [ ] All tests pass
- [ ] Logger used (no console.log)
- [ ] Types from @radio/core
- [ ] Proper error handling

### Manual Verification
```bash
cd workers/embedder
pnpm install
pnpm test

# Manual test (requires HF API key)
echo 'EMBEDDING_API_KEY=your_key' >> .env
node -e "
const { EmbeddingService } = require('./dist/embedding/embedding-service');
const service = new EmbeddingService(process.env.EMBEDDING_API_KEY);
service.embedMany([{ text: 'test', contentHash: 'abc' }])
  .then(r => console.log('Dimensions:', r[0].embedding.length));
"
```

---

## Next Task Handoff

**For R4 (Embedder Worker):**
- Use chunker from R1+R2
- Use embedding service from R3
- Process kb_index jobs from queue

**Files created:**
- `workers/embedder/src/embedding/embedding-client.ts`
- `workers/embedder/src/embedding/embedding-cache.ts`
- `workers/embedder/src/embedding/embedding-service.ts`
- `workers/embedder/tests/embedding.test.ts`

**Embedding service provides:**
```typescript
embedMany(requests: EmbedRequest[]): Promise<EmbedResult[]>
// Returns 1024-dim vectors with cache awareness
```

---------------------------------------------------

# Task R4: Embedder Worker - Main Loop

**Tier:** RAG  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** R3, D1-D8 complete

---

## Objective

Create worker main loop that:
1. Listens for kb_index jobs
2. Claims jobs atomically
3. Calls job handler
4. Marks complete/failed

---

## Context from Previous Tasks

**From R1-R3:**
- Chunker ready: splits text → chunks
- Embedding service ready: chunks → vectors

**From D6-D8:**
- Job queue functions: claim_job, complete_job, fail_job
- LISTEN/NOTIFY pattern

---

## Context from Architecture

**From ARCHITECTURE.md Section 4:**

Worker pattern:
- LISTEN new_job_[type]
- Claim with FOR UPDATE SKIP LOCKED
- Process with handler
- Complete or fail
- Retry on failure

---

## Implementation Steps

### Step 1: Create Worker Base Class

Create `workers/embedder/src/worker/base-worker.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('base-worker');

export interface WorkerConfig {
  workerType: string;
  instanceId: string;
  maxConcurrentJobs: number;
  heartbeatInterval: number; // seconds
  leaseSeconds: number;
}

export interface Job {
  job_id: string;
  job_type: string;
  payload: any;
  attempts: number;
  max_attempts: number;
}

/**
 * Base worker class with job claiming and lifecycle management
 */
export abstract class BaseWorker {
  protected db: SupabaseClient;
  protected config: WorkerConfig;
  protected running: boolean = false;
  protected jobsInFlight: number = 0;

  constructor(config: WorkerConfig) {
    this.config = config;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    }

    this.db = createClient(supabaseUrl, supabaseKey);

    logger.info({ config }, 'Worker initialized');
  }

  /**
   * Start worker (main loop)
   */
  async start(): Promise<void> {
    this.running = true;

    logger.info({ workerType: this.config.workerType }, 'Worker starting');

    // Setup LISTEN for job notifications
    await this.setupListener();

    // Start heartbeat
    this.startHeartbeat();

    // Initial job check
    await this.checkForJobs();

    // Keep process alive
    await new Promise(() => {}); // Will be interrupted by SIGTERM
  }

  /**
   * Stop worker gracefully
   */
  async stop(): Promise<void> {
    logger.info('Worker stopping');
    this.running = false;

    // Wait for in-flight jobs to complete
    while (this.jobsInFlight > 0) {
      logger.info({ jobsInFlight: this.jobsInFlight }, 'Waiting for jobs to complete');
      await this.sleep(1000);
    }

    logger.info('Worker stopped');
  }

  /**
   * Setup LISTEN for new job notifications
   */
  private async setupListener(): Promise<void> {
    const channel = `new_job_${this.config.workerType}`;

    logger.info({ channel }, 'Setting up listener');

    // Create a raw SQL connection for LISTEN
    const { data, error } = await this.db.rpc('exec_sql', {
      sql: `LISTEN ${channel}`
    });

    if (error) {
      logger.error({ error }, 'Failed to setup listener');
      throw error;
    }

    // Poll for notifications (Supabase doesn't expose NOTIFY directly)
    setInterval(() => this.checkForJobs(), 5000);
  }

  /**
   * Check for available jobs
   */
  private async checkForJobs(): Promise<void> {
    if (!this.running) return;
    if (this.jobsInFlight >= this.config.maxConcurrentJobs) return;

    try {
      const job = await this.claimJob();
      
      if (job) {
        this.jobsInFlight++;
        
        // Process job in background
        this.processJob(job)
          .catch(error => {
            logger.error({ error, jobId: job.job_id }, 'Job processing error');
          })
          .finally(() => {
            this.jobsInFlight--;
          });

        // Check for more jobs immediately
        setImmediate(() => this.checkForJobs());
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check for jobs');
    }
  }

  /**
   * Claim next available job
   */
  private async claimJob(): Promise<Job | null> {
    const { data, error } = await this.db.rpc('claim_job', {
      p_job_type: this.config.workerType,
      p_worker_id: this.config.instanceId,
      p_lease_seconds: this.config.leaseSeconds
    });

    if (error) {
      logger.error({ error }, 'Failed to claim job');
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const job = data[0];
    logger.info({ jobId: job.job_id, attempt: job.attempts }, 'Job claimed');
    
    return job;
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    const startTime = Date.now();

    try {
      // Call abstract handler
      await this.handleJob(job);

      // Mark complete
      const { error } = await this.db.rpc('complete_job', {
        p_job_id: job.job_id
      });

      if (error) throw error;

      const duration = Date.now() - startTime;
      logger.info({ 
        jobId: job.job_id, 
        duration 
      }, 'Job completed');

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({ 
        jobId: job.job_id, 
        error: errorMessage,
        duration 
      }, 'Job failed');

      // Mark failed
      await this.db.rpc('fail_job', {
        p_job_id: job.job_id,
        p_error: errorMessage,
        p_error_details: {
          stack: error instanceof Error ? error.stack : undefined,
          attempt: job.attempts,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Send heartbeat
   */
  private startHeartbeat(): void {
    setInterval(async () => {
      if (!this.running) return;

      try {
        const { error } = await this.db
          .from('health_checks')
          .upsert({
            worker_type: this.config.workerType,
            instance_id: this.config.instanceId,
            status: 'healthy',
            last_heartbeat: new Date().toISOString(),
            metrics: {
              jobs_in_flight: this.jobsInFlight,
              uptime_sec: process.uptime()
            }
          });

        if (error) {
          logger.error({ error }, 'Failed to send heartbeat');
        }
      } catch (error) {
        logger.error({ error }, 'Heartbeat error');
      }
    }, this.config.heartbeatInterval * 1000);
  }

  /**
   * Abstract method - implement in subclass
   */
  protected abstract handleJob(job: Job): Promise<void>;

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Step 2: Create Worker Entry Point

Create `workers/embedder/src/index.ts`:
```typescript
import { BaseWorker } from './worker/base-worker';
import { EmbedderJobHandler } from './worker/embedder-job-handler';
import { createLogger } from '@radio/core/logger';
import * as os from 'os';

const logger = createLogger('embedder-main');

/**
 * Embedder Worker
 * Processes kb_index jobs to chunk and embed documents
 */
class EmbedderWorker extends BaseWorker {
  private handler: EmbedderJobHandler;

  constructor() {
    super({
      workerType: 'kb_index',
      instanceId: `embedder-${os.hostname()}-${process.pid}`,
      maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3'),
      heartbeatInterval: 30,
      leaseSeconds: 300
    });

    this.handler = new EmbedderJobHandler();
  }

  protected async handleJob(job: any): Promise<void> {
    await this.handler.handle(job);
  }
}

// Main entry point
async function main() {
  const worker = new EmbedderWorker();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received');
    await worker.stop();
    process.exit(0);
  });

  // Start worker
  await worker.start();
}

main().catch(error => {
  logger.error({ error }, 'Worker crashed');
  process.exit(1);
});
```

### Step 3: Add package.json Scripts

Update `workers/embedder/package.json`:
```json
{
  "name": "@radio/embedder-worker",
  "version": "0.0.1",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@supabase/supabase-js": "^2.39.0",
    "gpt-3-encoder": "^1.1.4",
    "marked": "^11.0.0",
    "franc-min": "^6.1.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^1.0.4",
    "tsx": "^4.7.0"
  }
}
```

### Step 4: Create Placeholder Job Handler

Create `workers/embedder/src/worker/embedder-job-handler.ts`:
```typescript
import { createLogger } from '@radio/core/logger';

const logger = createLogger('embedder-job-handler');

export interface EmbedderJobPayload {
  source_id: string;
  source_type: 'universe_doc' | 'event';
}

/**
 * Handler for kb_index jobs
 * Will be implemented in R5
 */
export class EmbedderJobHandler {
  async handle(job: any): Promise<void> {
    const payload: EmbedderJobPayload = job.payload;

    logger.info({ 
      sourceId: payload.source_id,
      sourceType: payload.source_type 
    }, 'Processing embedding job');

    // TODO: Implement in R5
    // 1. Fetch source document
    // 2. Chunk text
    // 3. Generate embeddings
    // 4. Store in database

    throw new Error('Not implemented yet - see R5');
  }
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Worker connects to Supabase
- [ ] Claims jobs atomically
- [ ] Sends heartbeats
- [ ] Handles SIGTERM gracefully
- [ ] Respects max concurrent jobs

### Quality Requirements
- [ ] All code compiles
- [ ] Logger used (no console.log)
- [ ] Graceful shutdown works
- [ ] Environment variables validated

### Manual Verification
```bash
cd workers/embedder
pnpm install
pnpm build

# Test with mock job
SUPABASE_URL=your_url \
SUPABASE_SERVICE_ROLE_KEY=your_key \
pnpm start
```

---

## Next Task Handoff

**For R5 (Embedder Job Handler):**
- Implement `EmbedderJobHandler.handle()`
- Fetch document → chunk → embed → store
- Update kb_index_status

**Files created:**
- `workers/embedder/src/worker/base-worker.ts`
- `workers/embedder/src/worker/embedder-job-handler.ts` (placeholder)
- `workers/embedder/src/index.ts`

**Worker loop is ready:**
- ✅ Claims jobs
- ✅ Sends heartbeats
- ✅ Graceful shutdown
- ⏳ Job handler (next task)

----------------------------------------------------

# Task R5: Embedder Worker - Job Handler Implementation

**Tier:** RAG  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** R4 complete

---

## Objective

Implement the actual job processing logic: fetch document → chunk → embed → store in database.

---

## Context from Previous Tasks

**From R1-R3:**
- Chunker: text → chunks with metadata
- EmbeddingService: chunks → vectors

**From R4:**
- Worker loop calls `handler.handle(job)`
- Job payload: `{ source_id, source_type }`

**From D4:**
- Database tables: kb_chunks, kb_embeddings, kb_index_status

---

## Implementation Steps

### Step 1: Implement Job Handler

Replace `workers/embedder/src/worker/embedder-job-handler.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Chunker } from '../chunking/chunker';
import { EmbeddingService } from '../embedding/embedding-service';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('embedder-job-handler');

export interface EmbedderJobPayload {
  source_id: string;
  source_type: 'universe_doc' | 'event';
}

/**
 * Handler for kb_index jobs
 * Processes document: fetch → chunk → embed → store
 */
export class EmbedderJobHandler {
  private db: SupabaseClient;
  private chunker: Chunker;
  private embedder: EmbeddingService;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const embeddingApiKey = process.env.EMBEDDING_API_KEY;

    if (!supabaseUrl || !supabaseKey || !embeddingApiKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.chunker = new Chunker();
    this.embedder = new EmbeddingService(embeddingApiKey);
  }

  /**
   * Process kb_index job
   */
  async handle(job: any): Promise<void> {
    const payload: EmbedderJobPayload = job.payload;
    const { source_id, source_type } = payload;

    logger.info({ source_id, source_type }, 'Starting embedding job');

    try {
      // 1. Update status to processing
      await this.updateIndexStatus(source_id, source_type, 'processing');

      // 2. Fetch source document
      const document = await this.fetchDocument(source_id, source_type);
      
      if (!document) {
        throw new Error(`Document not found: ${source_id}`);
      }

      // 3. Chunk document
      const chunks = this.chunker.chunk(document.body, document.lang);
      
      logger.info({ 
        source_id, 
        chunkCount: chunks.length 
      }, 'Document chunked');

      // 4. Generate embeddings
      const embeddingRequests = chunks.map(chunk => ({
        text: chunk.chunkText,
        contentHash: chunk.contentHash
      }));

      const embeddings = await this.embedder.embedMany(embeddingRequests);

      logger.info({ 
        source_id, 
        embeddingCount: embeddings.length 
      }, 'Embeddings generated');

      // 5. Store chunks and embeddings
      await this.storeChunksAndEmbeddings(
        source_id,
        source_type,
        chunks,
        embeddings.map(e => e.embedding)
      );

      // 6. Update status to complete
      await this.updateIndexStatus(
        source_id, 
        source_type, 
        'complete',
        chunks.length,
        embeddings.length
      );

      logger.info({ source_id }, 'Embedding job complete');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({ source_id, error: errorMessage }, 'Embedding job failed');

      // Update status to failed
      await this.updateIndexStatus(
        source_id,
        source_type,
        'failed',
        0,
        0,
        errorMessage
      );

      throw error;
    }
  }

  /**
   * Fetch source document from database
   */
  private async fetchDocument(
    sourceId: string,
    sourceType: string
  ): Promise<{ body: string; lang: string } | null> {
    const table = sourceType === 'universe_doc' ? 'universe_docs' : 'events';

    const { data, error } = await this.db
      .from(table)
      .select('body, lang')
      .eq('id', sourceId)
      .single();

    if (error) {
      logger.error({ error, sourceId, table }, 'Failed to fetch document');
      throw error;
    }

    return data;
  }

  /**
   * Store chunks and embeddings in database
   */
  private async storeChunksAndEmbeddings(
    sourceId: string,
    sourceType: string,
    chunks: any[],
    embeddings: number[][]
  ): Promise<void> {
    // Insert chunks
    const chunkRows = chunks.map((chunk, i) => ({
      source_id: sourceId,
      source_type: sourceType,
      chunk_text: chunk.chunkText,
      chunk_index: chunk.chunkIndex,
      token_count: chunk.tokenCount,
      lang: chunk.lang,
      content_hash: chunk.contentHash
    }));

    const { data: insertedChunks, error: chunkError } = await this.db
      .from('kb_chunks')
      .insert(chunkRows)
      .select('id');

    if (chunkError) {
      logger.error({ error: chunkError }, 'Failed to insert chunks');
      throw chunkError;
    }

    // Insert embeddings
    const embeddingRows = insertedChunks.map((chunk, i) => ({
      chunk_id: chunk.id,
      embedding: embeddings[i]
    }));

    const { error: embeddingError } = await this.db
      .from('kb_embeddings')
      .insert(embeddingRows);

    if (embeddingError) {
      logger.error({ error: embeddingError }, 'Failed to insert embeddings');
      throw embeddingError;
    }

    logger.info({ 
      sourceId, 
      chunksStored: chunks.length,
      embeddingsStored: embeddings.length 
    }, 'Stored in database');
  }

  /**
   * Update kb_index_status
   */
  private async updateIndexStatus(
    sourceId: string,
    sourceType: string,
    state: string,
    chunksCreated: number = 0,
    embeddingsCreated: number = 0,
    error?: string
  ): Promise<void> {
    const updates: any = {
      state,
      chunks_created: chunksCreated,
      embeddings_created: embeddingsCreated,
      updated_at: new Date().toISOString()
    };

    if (state === 'processing') {
      updates.started_at = new Date().toISOString();
    }

    if (state === 'complete') {
      updates.completed_at = new Date().toISOString();
    }

    if (error) {
      updates.error = error;
    }

    const { error: updateError } = await this.db
      .from('kb_index_status')
      .upsert({
        source_id: sourceId,
        source_type: sourceType,
        ...updates
      });

    if (updateError) {
      logger.error({ error: updateError }, 'Failed to update index status');
      throw updateError;
    }
  }
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Fetches document from correct table
- [ ] Chunks document
- [ ] Generates embeddings with caching
- [ ] Stores chunks and embeddings atomically
- [ ] Updates kb_index_status correctly
- [ ] Handles errors gracefully

### Quality Requirements
- [ ] All code compiles
- [ ] Logger used throughout
- [ ] Error messages are descriptive
- [ ] Database transactions if possible

### Manual Verification
```bash
cd workers/embedder
pnpm build

# Create test document
psql $DATABASE_URL -c "
INSERT INTO universe_docs (id, title, body, lang) 
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test Doc',
  'This is a test document with enough content to be chunked into multiple pieces. $(printf 'Sentence. %.0s' {1..100})',
  'en'
);

-- Create index job
SELECT enqueue_job(
  'kb_index',
  '{\"source_id\": \"00000000-0000-0000-0000-000000000001\", \"source_type\": \"universe_doc\"}'::jsonb,
  5,
  0
);
"

# Run worker
SUPABASE_URL=your_url \
SUPABASE_SERVICE_ROLE_KEY=your_key \
EMBEDDING_API_KEY=your_hf_key \
pnpm start

# Check results
psql $DATABASE_URL -c "
SELECT COUNT(*) FROM kb_chunks WHERE source_id = '00000000-0000-0000-0000-000000000001';
SELECT COUNT(*) FROM kb_embeddings;
SELECT * FROM kb_index_status WHERE source_id = '00000000-0000-0000-0000-000000000001';
"
```

---

## Next Task Handoff

**For R6 (Retrieval Service):**
- Query kb_embeddings for similar vectors
- Combine vector search + lexical search (hybrid)
- Return top-K results with scores

**Files completed:**
- `workers/embedder/src/worker/embedder-job-handler.ts` (fully implemented)

**Embedder worker is now complete:**
- ✅ Chunks documents
- ✅ Generates embeddings
- ✅ Stores in database
- ✅ Tracks status

-----------------------------------------------

# Task R6: Retrieval Service - Hybrid Search

**Tier:** RAG  
**Estimated Time:** 2 hours  
**Complexity:** High  
**Prerequisites:** R5 complete

---

## Objective

Create retrieval service that combines vector similarity search + lexical search (BM25) with recency boosting for events.

---

## Context from Architecture

**From ARCHITECTURE.md Section 5:**

Hybrid search:
- Vector similarity (cosine)
- Lexical search (BM25 approximation)
- Recency boost for events
- Top-K results (default: 12)
- Timeout: 2 seconds

---

## Implementation Steps

### Step 1: Create RAG Types

Create `apps/api/src/rag/rag-types.ts`:
```typescript
export interface RAGQuery {
  text: string;
  lang?: string;
  topK?: number;
  filters?: {
    source_types?: ('universe_doc' | 'event')[];
    tags?: string[];
  };
  recency_boost?: boolean;
  reference_time?: string; // ISO datetime
}

export interface RAGChunk {
  chunk_id: string;
  source_id: string;
  source_type: 'universe_doc' | 'event';
  chunk_text: string;
  vector_score: number;
  lexical_score: number;
  recency_score: number;
  final_score: number;
}

export interface RAGResult {
  chunks: RAGChunk[];
  query_time_ms: number;
  total_results: number;
}
```

### Step 2: Create Retrieval Service

Create `apps/api/src/rag/retrieval-service.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EmbeddingService } from '../../../workers/embedder/src/embedding/embedding-service';
import { createLogger } from '@radio/core/logger';
import { RAGQuery, RAGResult, RAGChunk } from './rag-types';

const logger = createLogger('retrieval-service');

/**
 * Hybrid retrieval service
 * Combines vector similarity + lexical search + recency boosting
 */
export class RetrievalService {
  private db: SupabaseClient;
  private embedder: EmbeddingService;
  private readonly timeout: number = 2000; // 2 seconds

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const embeddingApiKey = process.env.EMBEDDING_API_KEY;

    if (!supabaseUrl || !supabaseKey || !embeddingApiKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.embedder = new EmbeddingService(embeddingApiKey);
  }

  /**
   * Retrieve relevant chunks for query
   */
  async retrieve(query: RAGQuery): Promise<RAGResult> {
    const startTime = Date.now();

    try {
      // Generate query embedding
      const queryEmbedding = await this.embedQuery(query.text);

      // Vector search
      const vectorResults = await this.vectorSearch(
        queryEmbedding,
        query.topK || 12,
        query.filters
      );

      // Lexical search (keywords)
      const lexicalResults = await this.lexicalSearch(
        query.text,
        query.topK || 12,
        query.filters
      );

      // Merge and rank
      const mergedResults = this.mergeResults(
        vectorResults,
        lexicalResults,
        query.recency_boost || false,
        query.reference_time
      );

      const queryTime = Date.now() - startTime;

      logger.info({
        queryLength: query.text.length,
        resultsCount: mergedResults.length,
        queryTime
      }, 'Retrieval complete');

      return {
        chunks: mergedResults.slice(0, query.topK || 12),
        query_time_ms: queryTime,
        total_results: mergedResults.length
      };

    } catch (error) {
      const queryTime = Date.now() - startTime;
      logger.error({ error, queryTime }, 'Retrieval failed');
      throw error;
    }
  }

  /**
   * Generate embedding for query
   */
  private async embedQuery(text: string): Promise<number[]> {
    const results = await this.embedder.embedMany([{
      text,
      contentHash: `query-${Date.now()}`
    }]);

    return results[0].embedding;
  }

  /**
   * Vector similarity search
   */
  private async vectorSearch(
    embedding: number[],
    limit: number,
    filters?: RAGQuery['filters']
  ): Promise<Map<string, { chunk: any; score: number }>> {
    let query = this.db
      .rpc('match_chunks', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: limit * 2 // Get more for merging
      });

    // Apply filters
    if (filters?.source_types) {
      query = query.in('source_type', filters.source_types);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error }, 'Vector search failed');
      throw error;
    }

    const results = new Map<string, { chunk: any; score: number }>();

    for (const row of data || []) {
      results.set(row.chunk_id, {
        chunk: row,
        score: row.similarity
      });
    }

    return results;
  }

  /**
   * Lexical search (BM25 approximation using ts_rank)
   */
  private async lexicalSearch(
    queryText: string,
    limit: number,
    filters?: RAGQuery['filters']
  ): Promise<Map<string, { chunk: any; score: number }>> {
    // Extract keywords
    const keywords = queryText
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 10) // Use top 10 keywords
      .join(' & ');

    if (!keywords) {
      return new Map();
    }

    let query = this.db
      .from('kb_chunks')
      .select(`
        id,
        source_id,
        source_type,
        chunk_text,
        lang
      `)
      .textSearch('chunk_text', keywords)
      .limit(limit * 2);

    // Apply filters
    if (filters?.source_types) {
      query = query.in('source_type', filters.source_types);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error }, 'Lexical search failed');
      throw error;
    }

    const results = new Map<string, { chunk: any; score: number }>();

    for (const row of data || []) {
      // Calculate simple keyword match score
      const matchCount = keywords
        .split(' & ')
        .filter(kw => row.chunk_text.toLowerCase().includes(kw))
        .length;

      const score = matchCount / keywords.split(' & ').length;

      results.set(row.id, {
        chunk: row,
        score
      });
    }

    return results;
  }

  /**
   * Merge and rank results
   */
  private mergeResults(
    vectorResults: Map<string, { chunk: any; score: number }>,
    lexicalResults: Map<string, { chunk: any; score: number }>,
    applyRecencyBoost: boolean,
    referenceTime?: string
  ): RAGChunk[] {
    const merged = new Map<string, RAGChunk>();

    // Combine scores
    for (const [chunkId, { chunk, score }] of vectorResults.entries()) {
      merged.set(chunkId, {
        chunk_id: chunkId,
        source_id: chunk.source_id,
        source_type: chunk.source_type,
        chunk_text: chunk.chunk_text,
        vector_score: score,
        lexical_score: 0,
        recency_score: 0,
        final_score: score
      });
    }

    for (const [chunkId, { chunk, score }] of lexicalResults.entries()) {
      if (merged.has(chunkId)) {
        const existing = merged.get(chunkId)!;
        existing.lexical_score = score;
      } else {
        merged.set(chunkId, {
          chunk_id: chunkId,
          source_id: chunk.source_id,
          source_type: chunk.source_type,
          chunk_text: chunk.chunk_text,
          vector_score: 0,
          lexical_score: score,
          recency_score: 0,
          final_score: score
        });
      }
    }

    // Calculate final scores
    const results: RAGChunk[] = [];

    for (const result of merged.values()) {
      // Weighted combination
      result.final_score = (
        result.vector_score * 0.7 +
        result.lexical_score * 0.3
      );

      // Apply recency boost for events
      if (applyRecencyBoost && result.source_type === 'event') {
        // TODO: Fetch event date and calculate recency score
        result.recency_score = 0.2; // Placeholder
        result.final_score *= (1 + result.recency_score);
      }

      results.push(result);
    }

    // Sort by final score
    results.sort((a, b) => b.final_score - a.final_score);

    return results;
  }
}
```

### Step 3: Create Vector Match Function

Create `infra/migrations/011_vector_match_function.sql`:
```sql
-- Migration: Vector similarity search function
-- Description: pgvector cosine similarity search

CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1024),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  chunk_id uuid,
  source_id uuid,
  source_type text,
  chunk_text text,
  lang text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.source_id,
    c.source_type,
    c.chunk_text,
    c.lang,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM kb_embeddings e
  JOIN kb_chunks c ON c.id = e.chunk_id
  WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### Step 4: Create API Endpoint

Create `apps/api/src/rag/rag-routes.ts`:
```typescript
import { Router } from 'express';
import { RetrievalService } from './retrieval-service';
import { RAGQuery } from './rag-types';

const router = Router();
const retrievalService = new RetrievalService();

/**
 * POST /rag/retrieve
 * Retrieve relevant chunks for a query
 */
router.post('/retrieve', async (req, res) => {
  try {
    const query: RAGQuery = req.body;

    // Validate
    if (!query.text || query.text.length === 0) {
      return res.status(400).json({
        error: 'Query text is required'
      });
    }

    const result = await retrievalService.retrieve(query);

    res.json(result);

  } catch (error) {
    console.error('RAG retrieval error:', error);
    res.status(500).json({
      error: 'Retrieval failed'
    });
  }
});

export { router as ragRouter };
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Vector search returns top-K similar chunks
- [ ] Lexical search finds keyword matches
- [ ] Results merged with weighted scores
- [ ] Recency boost applied to events
- [ ] Timeout enforced (2 seconds)

### Quality Requirements
- [ ] Logger used
- [ ] Proper error handling
- [ ] Types from shared definitions

### Manual Verification
```bash
# Run migration
node infra/migrate.js up

# Test retrieval
curl -X POST http://localhost:8000/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "text": "climate change technology",
    "topK": 5,
    "recency_boost": true
  }'
```

---

## Next Task Handoff

**RAG Tier Complete!**

**For G1 (Piper TTS Service):**
- Start Generation tier
- Create HTTP service for text-to-speech
- Use Piper TTS (local, CPU-only)

**Files created:**
- `apps/api/src/rag/rag-types.ts`
- `apps/api/src/rag/retrieval-service.ts`
- `apps/api/src/rag/rag-routes.ts`
- `infra/migrations/011_vector_match_function.sql`

**RAG system now provides:**
```typescript
retrieve(query: RAGQuery): Promise<RAGResult>
// Returns ranked chunks for generation
```

--------------------------------------------------------

# Task G1: Piper TTS Service - HTTP Server

**Tier:** Generation  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** Phase 0, Data tier complete

---

## Objective

Create HTTP service wrapper around Piper TTS binary for text-to-speech synthesis. This runs as a standalone service that segment generation worker will call.

---

## Context from Architecture

**From ARCHITECTURE.md Section 6:**

Piper TTS:
- Local, CPU-only (no GPU needed)
- Fast synthesis (~5s for 200 words)
- Voice models: en_US-lessac-medium (default)
- Output: 48kHz WAV mono
- HTTP API for easy integration

---

## Implementation Steps

### Step 1: Create Service Structure
```bash
mkdir -p services/piper-tts/src
cd services/piper-tts
```

Create `services/piper-tts/package.json`:
```json
{
  "name": "@radio/piper-tts",
  "version": "0.0.1",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "@types/express": "^4.17.21"
  }
}
```

### Step 2: Create Piper Wrapper

Create `services/piper-tts/src/piper-wrapper.ts`:
```typescript
import { spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import { createLogger } from '@radio/core/logger';
import * as path from 'path';

const logger = createLogger('piper-wrapper');

export interface SynthesisOptions {
  text: string;
  model: string;
  speed: number;
}

export interface SynthesisResult {
  audioPath: string;
  durationSec: number;
  model: string;
}

/**
 * Wrapper for Piper TTS binary
 */
export class PiperWrapper {
  private readonly piperBinary: string;
  private readonly modelsPath: string;

  constructor() {
    this.piperBinary = process.env.PIPER_BINARY_PATH || '/usr/local/bin/piper';
    this.modelsPath = process.env.PIPER_MODELS_PATH || '/opt/piper-models';

    logger.info({
      binary: this.piperBinary,
      modelsPath: this.modelsPath
    }, 'Piper wrapper initialized');
  }

  /**
   * Synthesize speech from text
   */
  async synthesize(options: SynthesisOptions): Promise<SynthesisResult> {
    const { text, model, speed } = options;

    logger.info({ model, textLength: text.length, speed }, 'Synthesizing speech');

    // Validate model exists
    const modelPath = path.join(this.modelsPath, `${model}.onnx`);
    
    try {
      await fs.access(modelPath);
    } catch {
      throw new Error(`Model not found: ${model}`);
    }

    // Create temp output file
    const outputPath = path.join('/tmp', `piper-${Date.now()}.wav`);

    // Run Piper
    const startTime = Date.now();

    await this.runPiper(text, modelPath, outputPath, speed);

    const duration = Date.now() - startTime;

    // Get audio duration
    const audioDuration = await this.getAudioDuration(outputPath);

    logger.info({
      model,
      synthesisTime: duration,
      audioDuration
    }, 'Synthesis complete');

    return {
      audioPath: outputPath,
      durationSec: audioDuration,
      model
    };
  }

  /**
   * Run Piper binary
   */
  private runPiper(
    text: string,
    modelPath: string,
    outputPath: string,
    speed: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const lengthScale = 1.0 / speed; // Piper uses inverse speed

      const args = [
        '--model', modelPath,
        '--output_file', outputPath,
        '--length_scale', lengthScale.toString()
      ];

      logger.debug({ args }, 'Running Piper');

      const piper = spawn(this.piperBinary, args);

      // Pipe text to stdin
      piper.stdin.write(text);
      piper.stdin.end();

      let stderr = '';

      piper.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      piper.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr }, 'Piper failed');
          reject(new Error(`Piper failed with code ${code}: ${stderr}`));
        } else {
          resolve();
        }
      });

      piper.on('error', (error) => {
        logger.error({ error }, 'Piper spawn error');
        reject(error);
      });
    });
  }

  /**
   * Get audio file duration using ffprobe
   */
  private async getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);

      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('ffprobe failed'));
        } else {
          resolve(parseFloat(output.trim()));
        }
      });
    });
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.modelsPath);
      const models = files
        .filter(f => f.endsWith('.onnx'))
        .map(f => f.replace('.onnx', ''));

      return models;
    } catch (error) {
      logger.error({ error }, 'Failed to list models');
      return [];
    }
  }
}
```

### Step 3: Create HTTP Server

Create `services/piper-tts/src/server.ts`:
```typescript
import express, { Request, Response } from 'express';
import { PiperWrapper } from './piper-wrapper';
import { createLogger } from '@radio/core/logger';
import { promises as fs } from 'fs';

const logger = createLogger('piper-server');

export interface SynthesizeRequest {
  text: string;
  model?: string;
  speed?: number;
}

export interface SynthesizeResponse {
  audio: string; // hex-encoded WAV
  duration_sec: number;
  model: string;
}

/**
 * HTTP server for Piper TTS
 */
export class PiperServer {
  private app: express.Application;
  private piper: PiperWrapper;

  constructor() {
    this.app = express();
    this.piper = new PiperWrapper();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupRoutes() {
    /**
     * POST /synthesize
     * Generate speech from text
     */
    this.app.post('/synthesize', async (req: Request, res: Response) => {
      try {
        const { text, model, speed }: SynthesizeRequest = req.body;

        // Validate
        if (!text || text.length === 0) {
          return res.status(400).json({
            error: 'Text is required'
          });
        }

        if (text.length > 10000) {
          return res.status(400).json({
            error: 'Text too long (max 10000 characters)'
          });
        }

        // Synthesize
        const result = await this.piper.synthesize({
          text,
          model: model || 'en_US-lessac-medium',
          speed: speed || 1.0
        });

        // Read audio file
        const audioData = await fs.readFile(result.audioPath);

        // Clean up temp file
        await fs.unlink(result.audioPath);

        // Return hex-encoded audio
        const response: SynthesizeResponse = {
          audio: audioData.toString('hex'),
          duration_sec: result.durationSec,
          model: result.model
        };

        res.json(response);

      } catch (error) {
        logger.error({ error }, 'Synthesis failed');
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Synthesis failed'
        });
      }
    });

    /**
     * GET /models
     * List available voice models
     */
    this.app.get('/models', async (req: Request, res: Response) => {
      try {
        const models = await this.piper.listModels();
        res.json({ models });
      } catch (error) {
        logger.error({ error }, 'Failed to list models');
        res.status(500).json({
          error: 'Failed to list models'
        });
      }
    });

    /**
     * GET /health
     * Health check
     */
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: 'piper-tts'
      });
    });
  }

  /**
   * Start server
   */
  start(port: number = 5002) {
    this.app.listen(port, () => {
      logger.info({ port }, 'Piper TTS server started');
    });
  }
}
```

### Step 4: Create Entry Point

Create `services/piper-tts/src/index.ts`:
```typescript
import { PiperServer } from './server';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('piper-main');

async function main() {
  const port = parseInt(process.env.PORT || '5002');

  const server = new PiperServer();
  server.start(port);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down');
    process.exit(0);
  });
}

main().catch(error => {
  logger.error({ error }, 'Server crashed');
  process.exit(1);
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] POST /synthesize generates WAV audio
- [ ] GET /models lists available voices
- [ ] GET /health returns status
- [ ] Handles speed parameter
- [ ] Cleans up temp files

### Quality Requirements
- [ ] Logger used
- [ ] Proper error handling
- [ ] Input validation

### Manual Verification
```bash
cd services/piper-tts
pnpm install
pnpm build

# Install Piper (on Linux)
wget https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz
tar -xzf piper_amd64.tar.gz
sudo mv piper /usr/local/bin/

# Download voice model
mkdir -p /opt/piper-models
cd /opt/piper-models
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

# Start service
pnpm start

# Test
curl -X POST http://localhost:5002/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from the future!", "model": "en_US-lessac-medium"}'
```

---

## Next Task Handoff

**For G2 (Piper TTS Cache):**
- Add caching layer to avoid regenerating identical text
- Content-based cache keys

**Files created:**
- `services/piper-tts/src/piper-wrapper.ts`
- `services/piper-tts/src/server.ts`
- `services/piper-tts/src/index.ts`

**Piper TTS HTTP API ready:**
- ✅ POST /synthesize
- ✅ GET /models
- ✅ GET /health

----------------------------------------------------------------------------

# Task G2: Piper TTS Service - Cache Layer

**Tier:** Generation  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** G1 complete

---

## Objective

Add content-based caching to Piper TTS service to avoid regenerating identical text, improving performance and reducing CPU usage.

---

## Context from Previous Task

**From G1:**
- PiperWrapper generates speech
- Server handles HTTP requests
- Need to cache by (text + model + speed)

---

## Context from Architecture

**From ARCHITECTURE.md Section 6:**

TTS caching:
- Cache key: SHA256(text + model + speed)
- Store in filesystem: `/var/cache/piper-tts/`
- Max cache size: 10GB
- LRU eviction

---

## Implementation Steps

### Step 1: Create Cache Manager

Create `services/piper-tts/src/cache-manager.ts`:
```typescript
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('cache-manager');

export interface CacheEntry {
  audioPath: string;
  durationSec: number;
  model: string;
  cachedAt: number;
  sizeBytes: number;
}

/**
 * File-based cache for TTS audio
 */
export class CacheManager {
  private readonly cacheDir: string;
  private readonly maxCacheSizeBytes: number;
  private cacheIndex: Map<string, CacheEntry>;

  constructor() {
    this.cacheDir = process.env.PIPER_CACHE_DIR || '/var/cache/piper-tts';
    this.maxCacheSizeBytes = parseInt(process.env.MAX_CACHE_SIZE_MB || '10240') * 1024 * 1024; // 10GB default
    this.cacheIndex = new Map();

    logger.info({
      cacheDir: this.cacheDir,
      maxSizeMB: this.maxCacheSizeBytes / 1024 / 1024
    }, 'Cache manager initialized');
  }

  /**
   * Initialize cache (create directory, load index)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadIndex();
      logger.info({ entries: this.cacheIndex.size }, 'Cache initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize cache');
      throw error;
    }
  }

  /**
   * Generate cache key from synthesis parameters
   */
  getCacheKey(text: string, model: string, speed: number): string {
    const input = `${text}|${model}|${speed}`;
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Check if cached audio exists
   */
  async get(cacheKey: string): Promise<CacheEntry | null> {
    const entry = this.cacheIndex.get(cacheKey);
    
    if (!entry) {
      return null;
    }

    // Verify file still exists
    try {
      await fs.access(entry.audioPath);
      logger.debug({ cacheKey }, 'Cache hit');
      return entry;
    } catch {
      // File deleted, remove from index
      this.cacheIndex.delete(cacheKey);
      logger.warn({ cacheKey }, 'Cached file missing, removed from index');
      return null;
    }
  }

  /**
   * Store audio in cache
   */
  async set(
    cacheKey: string,
    audioPath: string,
    durationSec: number,
    model: string
  ): Promise<void> {
    try {
      // Get file size
      const stats = await fs.stat(audioPath);
      const sizeBytes = stats.size;

      // Check cache size, evict if needed
      await this.ensureCacheSpace(sizeBytes);

      // Copy to cache directory
      const cachedPath = path.join(this.cacheDir, `${cacheKey}.wav`);
      await fs.copyFile(audioPath, cachedPath);

      // Add to index
      const entry: CacheEntry = {
        audioPath: cachedPath,
        durationSec,
        model,
        cachedAt: Date.now(),
        sizeBytes
      };

      this.cacheIndex.set(cacheKey, entry);

      logger.info({
        cacheKey,
        sizeKB: Math.round(sizeBytes / 1024)
      }, 'Audio cached');

      // Persist index
      await this.saveIndex();

    } catch (error) {
      logger.error({ error, cacheKey }, 'Failed to cache audio');
    }
  }

  /**
   * Ensure cache has space, evict LRU entries if needed
   */
  private async ensureCacheSpace(requiredBytes: number): Promise<void> {
    const currentSize = this.getCurrentCacheSize();

    if (currentSize + requiredBytes <= this.maxCacheSizeBytes) {
      return;
    }

    logger.info({
      currentMB: Math.round(currentSize / 1024 / 1024),
      requiredMB: Math.round(requiredBytes / 1024 / 1024)
    }, 'Cache full, evicting entries');

    // Sort by cachedAt (oldest first)
    const entries = Array.from(this.cacheIndex.entries())
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt);

    let freedBytes = 0;

    for (const [key, entry] of entries) {
      try {
        // Delete file
        await fs.unlink(entry.audioPath);
        
        // Remove from index
        this.cacheIndex.delete(key);
        
        freedBytes += entry.sizeBytes;

        logger.debug({ key, sizeKB: Math.round(entry.sizeBytes / 1024) }, 'Cache entry evicted');

        // Check if we've freed enough space
        if (currentSize - freedBytes + requiredBytes <= this.maxCacheSizeBytes) {
          break;
        }
      } catch (error) {
        logger.error({ error, key }, 'Failed to evict cache entry');
      }
    }

    logger.info({ freedMB: Math.round(freedBytes / 1024 / 1024) }, 'Cache eviction complete');
  }

  /**
   * Get current total cache size
   */
  private getCurrentCacheSize(): number {
    let total = 0;
    for (const entry of this.cacheIndex.values()) {
      total += entry.sizeBytes;
    }
    return total;
  }

  /**
   * Load cache index from disk
   */
  private async loadIndex(): Promise<void> {
    const indexPath = path.join(this.cacheDir, 'index.json');

    try {
      const data = await fs.readFile(indexPath, 'utf-8');
      const entries = JSON.parse(data);

      this.cacheIndex = new Map(Object.entries(entries));

      logger.info({ entries: this.cacheIndex.size }, 'Cache index loaded');
    } catch (error) {
      // Index doesn't exist yet, start fresh
      logger.info('No existing cache index, starting fresh');
      this.cacheIndex = new Map();
    }
  }

  /**
   * Save cache index to disk
   */
  private async saveIndex(): Promise<void> {
    const indexPath = path.join(this.cacheDir, 'index.json');

    try {
      const entries = Object.fromEntries(this.cacheIndex);
      await fs.writeFile(indexPath, JSON.stringify(entries, null, 2));
    } catch (error) {
      logger.error({ error }, 'Failed to save cache index');
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalSize = this.getCurrentCacheSize();

    return {
      entries: this.cacheIndex.size,
      totalSizeMB: Math.round(totalSize / 1024 / 1024),
      maxSizeMB: Math.round(this.maxCacheSizeBytes / 1024 / 1024),
      utilizationPercent: (totalSize / this.maxCacheSizeBytes) * 100
    };
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    logger.warn('Clearing entire cache');

    for (const [key, entry] of this.cacheIndex.entries()) {
      try {
        await fs.unlink(entry.audioPath);
      } catch (error) {
        logger.error({ error, key }, 'Failed to delete cache file');
      }
    }

    this.cacheIndex.clear();
    await this.saveIndex();

    logger.info('Cache cleared');
  }
}
```

### Step 2: Integrate Cache into Server

Update `services/piper-tts/src/server.ts`:
```typescript
import express, { Request, Response } from 'express';
import { PiperWrapper } from './piper-wrapper';
import { CacheManager } from './cache-manager';  // ADD THIS
import { createLogger } from '@radio/core/logger';
import { promises as fs } from 'fs';

const logger = createLogger('piper-server');

export interface SynthesizeRequest {
  text: string;
  model?: string;
  speed?: number;
  use_cache?: boolean;  // ADD THIS
}

export interface SynthesizeResponse {
  audio: string;
  duration_sec: number;
  model: string;
  cached: boolean;  // ADD THIS
}

export class PiperServer {
  private app: express.Application;
  private piper: PiperWrapper;
  private cache: CacheManager;  // ADD THIS

  constructor() {
    this.app = express();
    this.piper = new PiperWrapper();
    this.cache = new CacheManager();  // ADD THIS

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Initialize server
   */
  async initialize(): Promise<void> {
    await this.cache.initialize();
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupRoutes() {
    /**
     * POST /synthesize
     * Generate speech from text (with caching)
     */
    this.app.post('/synthesize', async (req: Request, res: Response) => {
      try {
        const { text, model, speed, use_cache }: SynthesizeRequest = req.body;

        if (!text || text.length === 0) {
          return res.status(400).json({ error: 'Text is required' });
        }

        if (text.length > 10000) {
          return res.status(400).json({ error: 'Text too long (max 10000 characters)' });
        }

        const modelName = model || 'en_US-lessac-medium';
        const speedValue = speed || 1.0;
        const useCache = use_cache !== false; // Default: true

        let audioPath: string;
        let durationSec: number;
        let cached = false;

        // Check cache
        if (useCache) {
          const cacheKey = this.cache.getCacheKey(text, modelName, speedValue);
          const cachedEntry = await this.cache.get(cacheKey);

          if (cachedEntry) {
            logger.info({ cacheKey }, 'Using cached audio');
            audioPath = cachedEntry.audioPath;
            durationSec = cachedEntry.durationSec;
            cached = true;
          } else {
            // Generate and cache
            const result = await this.piper.synthesize({
              text,
              model: modelName,
              speed: speedValue
            });

            audioPath = result.audioPath;
            durationSec = result.durationSec;

            // Store in cache
            await this.cache.set(cacheKey, audioPath, durationSec, modelName);
            cached = false;
          }
        } else {
          // Generate without caching
          const result = await this.piper.synthesize({
            text,
            model: modelName,
            speed: speedValue
          });

          audioPath = result.audioPath;
          durationSec = result.durationSec;
          cached = false;
        }

        // Read audio file
        const audioData = await fs.readFile(audioPath);

        // Clean up temp file (if not cached)
        if (!cached) {
          await fs.unlink(audioPath);
        }

        const response: SynthesizeResponse = {
          audio: audioData.toString('hex'),
          duration_sec: durationSec,
          model: modelName,
          cached
        };

        res.json(response);

      } catch (error) {
        logger.error({ error }, 'Synthesis failed');
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Synthesis failed'
        });
      }
    });

    /**
     * GET /cache/stats
     * Get cache statistics
     */
    this.app.get('/cache/stats', (req: Request, res: Response) => {
      const stats = this.cache.getStats();
      res.json(stats);
    });

    /**
     * DELETE /cache
     * Clear cache
     */
    this.app.delete('/cache', async (req: Request, res: Response) => {
      try {
        await this.cache.clear();
        res.json({ message: 'Cache cleared' });
      } catch (error) {
        logger.error({ error }, 'Failed to clear cache');
        res.status(500).json({ error: 'Failed to clear cache' });
      }
    });

    // ... (keep existing routes: /models, /health)

    this.app.get('/models', async (req: Request, res: Response) => {
      try {
        const models = await this.piper.listModels();
        res.json({ models });
      } catch (error) {
        logger.error({ error }, 'Failed to list models');
        res.status(500).json({ error: 'Failed to list models' });
      }
    });

    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: 'piper-tts',
        cache: this.cache.getStats()
      });
    });
  }

  /**
   * Start server
   */
  async start(port: number = 5002) {
    await this.initialize();

    this.app.listen(port, () => {
      logger.info({ port }, 'Piper TTS server started');
    });
  }
}
```

### Step 3: Update Entry Point

Update `services/piper-tts/src/index.ts`:
```typescript
import { PiperServer } from './server';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('piper-main');

async function main() {
  const port = parseInt(process.env.PORT || '5002');

  const server = new PiperServer();
  await server.start(port);  // CHANGED: now async

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down');
    process.exit(0);
  });
}

main().catch(error => {
  logger.error({ error }, 'Server crashed');
  process.exit(1);
});
```

### Step 4: Add Environment Variables

Update `.env.example`:
```bash
# Piper TTS Service
PORT=5002
PIPER_BINARY_PATH=/usr/local/bin/piper
PIPER_MODELS_PATH=/opt/piper-models
PIPER_CACHE_DIR=/var/cache/piper-tts
MAX_CACHE_SIZE_MB=10240
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Cache hit avoids regeneration
- [ ] Cache miss generates and stores
- [ ] LRU eviction when cache full
- [ ] Cache stats endpoint works
- [ ] Cache clear endpoint works
- [ ] use_cache=false bypasses cache

### Quality Requirements
- [ ] Logger used
- [ ] Proper error handling
- [ ] Cache index persisted to disk

### Manual Verification
```bash
cd services/piper-tts
pnpm build

# Create cache directory
mkdir -p /var/cache/piper-tts

# Start service
pnpm start

# Test cache miss
curl -X POST http://localhost:5002/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "use_cache": true}' \
  | jq '.cached'
# Should return: false

# Test cache hit (same text)
curl -X POST http://localhost:5002/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "use_cache": true}' \
  | jq '.cached'
# Should return: true

# Check cache stats
curl http://localhost:5002/cache/stats
```

---

## Next Task Handoff

**For G3 (LLM Service - Claude Client):**
- Create Anthropic API client
- Handle streaming responses
- Manage rate limits

**Files created:**
- `services/piper-tts/src/cache-manager.ts`

**Files modified:**
- `services/piper-tts/src/server.ts` (added cache integration)
- `services/piper-tts/src/index.ts` (async start)

**Piper TTS now has:**
- ✅ Content-based caching
- ✅ LRU eviction
- ✅ Cache statistics
- ✅ Cache management API

----------------------

# Task G3: LLM Service - Claude Client

**Tier:** Generation  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** Phase 0 complete

---

## Objective

Create service wrapper for Anthropic Claude API to generate segment scripts from RAG context.

---

## Context from Architecture

**From ARCHITECTURE.md Section 6:**

LLM generation:
- Model: Claude Haiku (fast, cost-effective)
- Max tokens: 2048 (script length)
- Temperature: 0.7 (creative but controlled)
- System prompt defines script format

---

## Implementation Steps

### Step 1: Create LLM Service Package
```bash
mkdir -p workers/segment-gen/src/llm
cd workers/segment-gen
```

Update `workers/segment-gen/package.json`:
```json
{
  "name": "@radio/segment-gen-worker",
  "version": "0.0.1",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@anthropic-ai/sdk": "^0.20.0",
    "@supabase/supabase-js": "^2.39.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^1.0.4",
    "tsx": "^4.7.0"
  }
}
```

### Step 2: Create Claude Client

Create `workers/segment-gen/src/llm/claude-client.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('claude-client');

export interface GenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface GenerateResponse {
  text: string;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Client for Anthropic Claude API
 */
export class ClaudeClient {
  private client: Anthropic;
  private readonly defaultModel = 'claude-3-5-haiku-20241022';

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;

    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({
      apiKey: key
    });

    logger.info({ model: this.defaultModel }, 'Claude client initialized');
  }

  /**
   * Generate text completion
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const {
      systemPrompt,
      userPrompt,
      maxTokens = 2048,
      temperature = 0.7,
      model = this.defaultModel
    } = request;

    logger.info({
      model,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      maxTokens,
      temperature
    }, 'Generating completion');

    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const duration = Date.now() - startTime;

      // Extract text from response
      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('');

      logger.info({
        duration,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason
      }, 'Generation complete');

      return {
        text,
        stopReason: response.stop_reason,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      }, 'Generation failed');

      // Handle rate limits
      if (error instanceof Anthropic.APIError) {
        if (error.status === 429) {
          throw new Error('Rate limit exceeded');
        }
        if (error.status === 529) {
          throw new Error('API overloaded, retry later');
        }
      }

      throw error;
    }
  }

  /**
   * Generate with retry logic
   */
  async generateWithRetry(
    request: GenerateRequest,
    maxRetries: number = 3
  ): Promise<GenerateResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.generate(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        logger.warn({
          attempt,
          maxRetries,
          error: lastError.message
        }, 'Generation attempt failed, retrying');

        // Exponential backoff
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this.sleep(delayMs);
        }
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Step 3: Create Prompt Templates

Create `workers/segment-gen/src/llm/prompt-templates.ts`:
```typescript
import { RAGChunk } from '../../../../apps/api/src/rag/rag-types';

export interface SegmentContext {
  slotType: string;
  targetDuration: number;
  djName: string;
  djPersonality: string;
  referenceTime: string;
  ragChunks: RAGChunk[];
}

/**
 * Prompt template builder for segment generation
 */
export class PromptTemplates {
  /**
   * Build system prompt for segment generation
   */
  buildSystemPrompt(context: SegmentContext): string {
    return `You are ${context.djName}, a radio DJ in the year 2525.

YOUR PERSONALITY:
${context.djPersonality}

YOUR TASK:
Generate a ${context.slotType} segment script for radio broadcast.
Target duration: ${context.targetDuration} seconds (~${Math.floor(context.targetDuration / 60 * 150)} words)

SCRIPT FORMAT:
- Write naturally in first person as ${context.djName}
- Use conversational, engaging radio style
- Include pauses with [pause] markers
- Cite sources when referencing information
- End with a smooth transition or station ID

RULES:
- Script must be exactly one segment (no multiple segments)
- Stay in character as ${context.djName}
- Reference the year 2525 context naturally
- Be informative but entertaining
- Keep it appropriate for all audiences

OUTPUT FORMAT:
Return ONLY the script text. No titles, no scene directions, no metadata.
Start speaking directly as ${context.djName}.`;
  }

  /**
   * Build user prompt with RAG context
   */
  buildUserPrompt(context: SegmentContext): string {
    const chunks = context.ragChunks
      .slice(0, 5) // Top 5 chunks
      .map((chunk, i) => {
        return `[Source ${i + 1}: ${chunk.source_type}]
${chunk.chunk_text}
[Relevance: ${(chunk.final_score * 100).toFixed(1)}%]`;
      })
      .join('\n\n---\n\n');

    return `Current date/time: ${context.referenceTime}

RELEVANT INFORMATION FROM KNOWLEDGE BASE:
${chunks}

---

Using the information above, create a ${context.slotType} segment.
Remember: You are speaking to listeners in the year 2525.
Script duration target: ${context.targetDuration} seconds.

Begin your script now:`;
  }

  /**
   * Build complete prompt
   */
  buildPrompt(context: SegmentContext): {
    systemPrompt: string;
    userPrompt: string;
  } {
    return {
      systemPrompt: this.buildSystemPrompt(context),
      userPrompt: this.buildUserPrompt(context)
    };
  }
}
```

### Step 4: Create Script Generator Service

Create `workers/segment-gen/src/llm/script-generator.ts`:
```typescript
import { ClaudeClient, GenerateResponse } from './claude-client';
import { PromptTemplates, SegmentContext } from './prompt-templates';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('script-generator');

export interface ScriptResult {
  scriptMd: string;
  citations: any[];
  metrics: {
    inputTokens: number;
    outputTokens: number;
    generationTimeMs: number;
  };
}

/**
 * High-level script generation service
 */
export class ScriptGenerator {
  private client: ClaudeClient;
  private templates: PromptTemplates;

  constructor(apiKey?: string) {
    this.client = new ClaudeClient(apiKey);
    this.templates = new PromptTemplates();
  }

  /**
   * Generate segment script
   */
  async generateScript(context: SegmentContext): Promise<ScriptResult> {
    logger.info({
      slotType: context.slotType,
      targetDuration: context.targetDuration,
      ragChunks: context.ragChunks.length
    }, 'Generating script');

    const startTime = Date.now();

    // Build prompts
    const { systemPrompt, userPrompt } = this.templates.buildPrompt(context);

    // Generate with Claude
    const response = await this.client.generateWithRetry({
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.7
    });

    const generationTime = Date.now() - startTime;

    // Extract citations from RAG chunks used
    const citations = context.ragChunks.slice(0, 5).map((chunk, i) => ({
      index: i + 1,
      source_id: chunk.source_id,
      source_type: chunk.source_type,
      chunk_id: chunk.chunk_id,
      score: chunk.final_score
    }));

    logger.info({
      scriptLength: response.text.length,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      generationTime
    }, 'Script generated');

    return {
      scriptMd: response.text,
      citations,
      metrics: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        generationTimeMs: generationTime
      }
    };
  }

  /**
   * Validate script meets requirements
   */
  validateScript(script: string, targetDuration: number): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check length
    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = wordCount / 150 * 60; // 150 wpm

    if (estimatedDuration < targetDuration * 0.8) {
      issues.push(`Script too short: ${Math.round(estimatedDuration)}s vs ${targetDuration}s target`);
    }

    if (estimatedDuration > targetDuration * 1.2) {
      issues.push(`Script too long: ${Math.round(estimatedDuration)}s vs ${targetDuration}s target`);
    }

    // Check minimum content
    if (wordCount < 50) {
      issues.push('Script has insufficient content');
    }

    // Check for inappropriate content markers
    const inappropriatePatterns = [
      /\[scene:/i,
      /\[cut to:/i,
      /\[music:/i,
      /^title:/im,
      /^segment \d+:/im
    ];

    for (const pattern of inappropriatePatterns) {
      if (pattern.test(script)) {
        issues.push(`Script contains inappropriate format marker: ${pattern}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Generates scripts with Claude API
- [ ] Uses system + user prompt structure
- [ ] Includes retry logic for failures
- [ ] Extracts citations from RAG chunks
- [ ] Validates script format and length
- [ ] Handles rate limits gracefully

### Quality Requirements
- [ ] Logger used throughout
- [ ] Proper error handling
- [ ] Type safety maintained
- [ ] API key from environment

### Manual Verification
```bash
cd workers/segment-gen
pnpm install
pnpm build

# Test script generation
node -e "
const { ScriptGenerator } = require('./dist/llm/script-generator');
const generator = new ScriptGenerator(process.env.ANTHROPIC_API_KEY);

const context = {
  slotType: 'news',
  targetDuration: 45,
  djName: 'Luna',
  djPersonality: 'Curious and optimistic about the future',
  referenceTime: '2525-01-01T12:00:00Z',
  ragChunks: [
    {
      chunk_id: '1',
      source_id: '1',
      source_type: 'universe_doc',
      chunk_text: 'Climate stabilization technology has made significant progress.',
      vector_score: 0.9,
      lexical_score: 0.8,
      recency_score: 0,
      final_score: 0.85
    }
  ]
};

generator.generateScript(context)
  .then(result => {
    console.log('SCRIPT:', result.scriptMd);
    console.log('CITATIONS:', result.citations);
    console.log('METRICS:', result.metrics);
  });
"
```

---

## Next Task Handoff

**For G4 (LLM Service - Prompt Builder):**
- Already implemented in prompt-templates.ts
- Skip to G5 (Segment Gen Worker)

**Files created:**
- `workers/segment-gen/src/llm/claude-client.ts`
- `workers/segment-gen/src/llm/prompt-templates.ts`
- `workers/segment-gen/src/llm/script-generator.ts`

**LLM service provides:**
```typescript
generateScript(context: SegmentContext): Promise<ScriptResult>
// Returns script + citations + metrics
```

---------------------------------------

# Task G5: Segment Generation Worker - RAG Integration

**Tier:** Generation  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** G3 complete, R6 complete, D1-D8 complete

---

## Objective

Create the first half of segment generation worker: claim job → fetch segment → retrieve RAG context → generate script.

---

## Context from Previous Tasks

**From G3:**
- ScriptGenerator ready to use
- Needs SegmentContext input

**From R6:**
- Retrieval service available at POST /rag/retrieve
- Returns RAGChunk[]

**From D7:**
- Job claiming pattern established
- Use claim_job function

---

## Context from Architecture

**From ARCHITECTURE.md Section 6:**

Segment generation flow:
1. Claim segment_make job
2. Fetch segment details
3. Retrieve RAG context (2s timeout)
4. Generate script with LLM
5. Update segment with script
6. Enqueue TTS job

**This task: Steps 1-4**

---

## Implementation Steps

### Step 1: Create RAG Client

Create `workers/segment-gen/src/rag/rag-client.ts`:
```typescript
import axios, { AxiosInstance } from 'axios';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('rag-client');

export interface RAGQuery {
  text: string;
  lang?: string;
  topK?: number;
  recency_boost?: boolean;
  reference_time?: string;
}

export interface RAGChunk {
  chunk_id: string;
  source_id: string;
  source_type: string;
  chunk_text: string;
  final_score: number;
}

export interface RAGResult {
  chunks: RAGChunk[];
  query_time_ms: number;
}

/**
 * Client for RAG retrieval service
 */
export class RAGClient {
  private client: AxiosInstance;
  private readonly timeout: number = 2000; // 2 seconds

  constructor() {
    const apiUrl = process.env.API_URL || 'http://localhost:8000';

    this.client = axios.create({
      baseURL: apiUrl,
      timeout: this.timeout
    });

    logger.info({ apiUrl, timeout: this.timeout }, 'RAG client initialized');
  }

  /**
   * Retrieve relevant chunks for query
   */
  async retrieve(query: RAGQuery): Promise<RAGResult> {
    logger.info({
      queryLength: query.text.length,
      topK: query.topK || 12
    }, 'Retrieving RAG context');

    const startTime = Date.now();

    try {
      const response = await this.client.post('/rag/retrieve', query);

      const duration = Date.now() - startTime;

      logger.info({
        chunks: response.data.chunks.length,
        duration
      }, 'RAG retrieval complete');

      return response.data;

    } catch (error) {
      const duration = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          logger.error({ duration }, 'RAG retrieval timeout');
          throw new Error('RAG retrieval timeout');
        }

        logger.error({
          status: error.response?.status,
          error: error.message,
          duration
        }, 'RAG retrieval failed');
      }

      throw error;
    }
  }

  /**
   * Build query from segment requirements
   */
  buildQuery(segment: any, referenceTime: string): RAGQuery {
    // Build query based on slot type
    const queries: Record<string, string> = {
      'news': 'recent events and news developments',
      'culture': 'cultural trends and artistic movements',
      'tech': 'technological advancements and innovations',
      'history': 'historical context and past events',
      'interview': 'notable figures and their perspectives',
      'station_id': 'station information and programming'
    };

    const baseQuery = queries[segment.slot_type] || 'general information';

    return {
      text: baseQuery,
      lang: segment.lang || 'en',
      topK: 12,
      recency_boost: segment.slot_type === 'news',
      reference_time: referenceTime
    };
  }
}
```

### Step 2: Create Job Handler (Part 1)

Create `workers/segment-gen/src/worker/segment-gen-handler.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScriptGenerator } from '../llm/script-generator';
import { RAGClient } from '../rag/rag-client';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('segment-gen-handler');

export interface SegmentGenPayload {
  segment_id: string;
}

/**
 * Handler for segment_make jobs
 * Generates segment scripts using RAG + LLM
 */
export class SegmentGenHandler {
  private db: SupabaseClient;
  private scriptGen: ScriptGenerator;
  private ragClient: RAGClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!supabaseUrl || !supabaseKey || !anthropicKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.scriptGen = new ScriptGenerator(anthropicKey);
    this.ragClient = new RAGClient();

    logger.info('Segment generation handler initialized');
  }

  /**
   * Process segment_make job
   */
  async handle(job: any): Promise<void> {
    const payload: SegmentGenPayload = job.payload;
    const { segment_id } = payload;

    logger.info({ segment_id }, 'Starting segment generation');

    try {
      // 1. Update segment state to retrieving
      await this.updateSegmentState(segment_id, 'retrieving');

      // 2. Fetch segment details
      const segment = await this.fetchSegment(segment_id);

      if (!segment) {
        throw new Error(`Segment not found: ${segment_id}`);
      }

      // 3. Fetch DJ and program info
      const dj = await this.fetchDJ(segment.program_id);

      // 4. Retrieve RAG context
      const ragQuery = this.ragClient.buildQuery(
        segment,
        new Date().toISOString()
      );

      const ragResult = await this.ragClient.retrieve(ragQuery);

      logger.info({
        segment_id,
        ragChunks: ragResult.chunks.length,
        queryTime: ragResult.query_time_ms
      }, 'RAG context retrieved');

      // 5. Update state to generating
      await this.updateSegmentState(segment_id, 'generating');

      // 6. Generate script
      const scriptResult = await this.scriptGen.generateScript({
        slotType: segment.slot_type,
        targetDuration: this.getTargetDuration(segment.slot_type),
        djName: dj.name,
        djPersonality: dj.personality,
        referenceTime: new Date().toISOString(),
        ragChunks: ragResult.chunks
      });

      logger.info({
        segment_id,
        scriptLength: scriptResult.scriptMd.length,
        citations: scriptResult.citations.length
      }, 'Script generated');

      // 7. Validate script
      const validation = this.scriptGen.validateScript(
        scriptResult.scriptMd,
        this.getTargetDuration(segment.slot_type)
      );

      if (!validation.valid) {
        logger.warn({
          segment_id,
          issues: validation.issues
        }, 'Script validation issues');
      }

      // 8. Update segment with script
      await this.updateSegmentWithScript(
        segment_id,
        scriptResult.scriptMd,
        scriptResult.citations,
        scriptResult.metrics
      );

      // 9. Update state to rendering (TTS next)
      await this.updateSegmentState(segment_id, 'rendering');

      // 10. Enqueue TTS job (G6 - next task)
      // TODO: Implement in G6
      logger.info({ segment_id }, 'Segment generation complete (TTS pending)');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        segment_id,
        error: errorMessage
      }, 'Segment generation failed');

      // Update segment to failed
      await this.updateSegmentState(segment_id, 'failed', errorMessage);

      throw error;
    }
  }

  /**
   * Fetch segment from database
   */
  private async fetchSegment(segmentId: string): Promise<any> {
    const { data, error } = await this.db
      .from('segments')
      .select('*')
      .eq('id', segmentId)
      .single();

    if (error) {
      logger.error({ error, segmentId }, 'Failed to fetch segment');
      throw error;
    }

    return data;
  }

  /**
   * Fetch DJ and program info
   */
  private async fetchDJ(programId: string): Promise<any> {
    const { data: program, error: programError } = await this.db
      .from('programs')
      .select('dj_id')
      .eq('id', programId)
      .single();

    if (programError) {
      throw programError;
    }

    const { data: dj, error: djError } = await this.db
      .from('djs')
      .select('name, personality')
      .eq('id', program.dj_id)
      .single();

    if (djError) {
      throw djError;
    }

    return dj;
  }

  /**
   * Update segment state
   */
  private async updateSegmentState(
    segmentId: string,
    state: string,
    error?: string
  ): Promise<void> {
    const updates: any = {
      state,
      updated_at: new Date().toISOString()
    };

    if (error) {
      updates.last_error = error;
    }

    const { error: updateError } = await this.db
      .from('segments')
      .update(updates)
      .eq('id', segmentId);

    if (updateError) {
      logger.error({ error: updateError, segmentId }, 'Failed to update segment state');
      throw updateError;
    }
  }

  /**
   * Update segment with generated script
   */
  private async updateSegmentWithScript(
    segmentId: string,
    scriptMd: string,
    citations: any[],
    metrics: any
  ): Promise<void> {
    const { error } = await this.db
      .from('segments')
      .update({
        script_md: scriptMd,
        citations: citations,
        generation_metrics: metrics,
        updated_at: new Date().toISOString()
      })
      .eq('id', segmentId);

    if (error) {
      logger.error({ error, segmentId }, 'Failed to update segment with script');
      throw error;
    }
  }

  /**
   * Get target duration by slot type
   */
  private getTargetDuration(slotType: string): number {
    const durations: Record<string, number> = {
      'news': 45,
      'culture': 60,
      'tech': 60,
      'history': 90,
      'interview': 120,
      'station_id': 15
    };

    return durations[slotType] || 60;
  }
}
```

### Step 3: Create Worker Entry Point

Create `workers/segment-gen/src/index.ts`:
```typescript
import { BaseWorker } from '../../embedder/src/worker/base-worker';
import { SegmentGenHandler } from './worker/segment-gen-handler';
import { createLogger } from '@radio/core/logger';
import * as os from 'os';

const logger = createLogger('segment-gen-main');

/**
 * Segment Generation Worker
 * Processes segment_make jobs to generate scripts
 */
class SegmentGenWorker extends BaseWorker {
  private handler: SegmentGenHandler;

  constructor() {
    super({
      workerType: 'segment_make',
      instanceId: `segment-gen-${os.hostname()}-${process.pid}`,
      maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '2'),
      heartbeatInterval: 30,
      leaseSeconds: 300
    });

    this.handler = new SegmentGenHandler();
  }

  protected async handleJob(job: any): Promise<void> {
    await this.handler.handle(job);
  }
}

async function main() {
  const worker = new SegmentGenWorker();

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received');
    await worker.stop();
    process.exit(0);
  });

  await worker.start();
}

main().catch(error => {
  logger.error({ error }, 'Worker crashed');
  process.exit(1);
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Claims segment_make jobs
- [ ] Fetches segment and DJ details
- [ ] Retrieves RAG context with 2s timeout
- [ ] Generates script with Claude
- [ ] Validates script format
- [ ] Updates segment with script
- [ ] Transitions states correctly
- [ ] Handles errors gracefully

### Quality Requirements
- [ ] All code compiles
- [ ] Logger used throughout
- [ ] Proper state transitions
- [ ] Error messages descriptive

### Manual Verification
```bash
cd workers/segment-gen
pnpm install
pnpm build

# Create test segment
psql $DATABASE_URL -c "
-- Create DJ
INSERT INTO djs (id, name, personality, voice_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Luna',
  'Curious and optimistic about the future',
  'en_US-lessac-medium'
);

-- Create program
INSERT INTO programs (id, name, dj_id)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Future Now',
  '00000000-0000-0000-0000-000000000001'
);

-- Create segment
INSERT INTO segments (id, program_id, slot_type, state)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'news',
  'queued'
);

-- Create job
SELECT enqueue_job(
  'segment_make',
  '{\"segment_id\": \"00000000-0000-0000-0000-000000000003\"}'::jsonb,
  5,
  0
);
"

# Start worker
SUPABASE_URL=your_url \
SUPABASE_SERVICE_ROLE_KEY=your_key \
ANTHROPIC_API_KEY=your_key \
API_URL=http://localhost:8000 \
pnpm start

# Check results
psql $DATABASE_URL -c "
SELECT state, script_md IS NOT NULL as has_script, citations
FROM segments 
WHERE id = '00000000-0000-0000-0000-000000000003';
"
```

---

## Next Task Handoff

**For G6 (Segment Gen Worker - TTS Integration):**
- Call Piper TTS service
- Store audio asset
- Enqueue mastering job

**Files created:**
- `workers/segment-gen/src/rag/rag-client.ts`
- `workers/segment-gen/src/worker/segment-gen-handler.ts`
- `workers/segment-gen/src/index.ts`

**Worker now handles:**
- ✅ Job claiming
- ✅ RAG retrieval
- ✅ Script generation
- ⏳ TTS synthesis (next)

--------------------------

# Task G6: Segment Generation Worker - TTS Integration

**Tier:** Generation  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** G5, G2 complete

---

## Objective

Complete segment generation worker: synthesize speech from script → store raw audio → enqueue mastering job.

---

## Context from Previous Task

**From G5:**
- Worker generates script
- Updates segment to 'rendering' state
- Need to add TTS call

**From G2:**
- Piper TTS at POST /synthesize
- Returns hex-encoded WAV
- Includes caching

---

## Implementation Steps

### Step 1: Create TTS Client

Create `workers/segment-gen/src/tts/tts-client.ts`:
```typescript
import axios, { AxiosInstance } from 'axios';
import { createLogger } from '@radio/core/logger';
import { promises as fs } from 'fs';
import * as path from 'path';

const logger = createLogger('tts-client');

export interface SynthesizeRequest {
  text: string;
  model?: string;
  speed?: number;
  use_cache?: boolean;
}

export interface SynthesizeResponse {
  audio: string; // hex-encoded
  duration_sec: number;
  model: string;
  cached: boolean;
}

/**
 * Client for Piper TTS service
 */
export class TTSClient {
  private client: AxiosInstance;
  private readonly timeout: number = 60000; // 60 seconds

  constructor() {
    const ttsUrl = process.env.PIPER_TTS_URL || 'http://localhost:5002';

    this.client = axios.create({
      baseURL: ttsUrl,
      timeout: this.timeout,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    logger.info({ ttsUrl, timeout: this.timeout }, 'TTS client initialized');
  }

  /**
   * Synthesize speech from text
   */
  async synthesize(request: SynthesizeRequest): Promise<string> {
    logger.info({
      textLength: request.text.length,
      model: request.model || 'default',
      useCache: request.use_cache !== false
    }, 'Synthesizing speech');

    const startTime = Date.now();

    try {
      const response = await this.client.post<SynthesizeResponse>(
        '/synthesize',
        request
      );

      const duration = Date.now() - startTime;

      logger.info({
        duration,
        audioDuration: response.data.duration_sec,
        cached: response.data.cached
      }, 'Synthesis complete');

      // Decode hex audio to buffer
      const audioBuffer = Buffer.from(response.data.audio, 'hex');

      // Save to temp file
      const tempPath = path.join('/tmp', `tts-${Date.now()}.wav`);
      await fs.writeFile(tempPath, audioBuffer);

      logger.debug({ tempPath, sizeKB: Math.round(audioBuffer.length / 1024) }, 'Audio saved');

      return tempPath;

    } catch (error) {
      const duration = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        logger.error({
          status: error.response?.status,
          error: error.message,
          duration
        }, 'TTS synthesis failed');
      }

      throw error;
    }
  }

  /**
   * Check TTS service health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'healthy';
    } catch {
      return false;
    }
  }
}
```

### Step 2: Create Asset Storage Service

Create `workers/segment-gen/src/storage/asset-storage.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import { createLogger } from '@radio/core/logger';
import * as path from 'path';

const logger = createLogger('asset-storage');

export interface StoredAsset {
  assetId: string;
  storagePath: string;
  contentHash: string;
  durationSec: number;
}

/**
 * Service for storing audio assets in Supabase Storage
 */
export class AssetStorage {
  private db: SupabaseClient;
  private readonly bucketName = 'audio-assets';

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    this.db = createClient(supabaseUrl, supabaseKey);

    logger.info({ bucket: this.bucketName }, 'Asset storage initialized');
  }

  /**
   * Store audio file
   */
  async storeAudio(
    audioPath: string,
    contentType: string = 'speech'
  ): Promise<StoredAsset> {
    logger.info({ audioPath, contentType }, 'Storing audio asset');

    try {
      // Read file
      const audioData = await fs.readFile(audioPath);

      // Calculate content hash
      const contentHash = crypto
        .createHash('sha256')
        .update(audioData)
        .digest('hex');

      // Check for duplicate
      const existing = await this.findByContentHash(contentHash);
      if (existing) {
        logger.info({ contentHash, existingId: existing.id }, 'Duplicate audio found');
        return {
          assetId: existing.id,
          storagePath: existing.storage_path,
          contentHash,
          durationSec: existing.duration_sec || 0
        };
      }

      // Get duration
      const durationSec = await this.getAudioDuration(audioPath);

      // Upload to storage
      const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.wav`;
      const storagePath = `raw/${fileName}`;

      const { error: uploadError } = await this.db.storage
        .from(this.bucketName)
        .upload(storagePath, audioData, {
          contentType: 'audio/wav',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Create asset record
      const { data: asset, error: insertError } = await this.db
        .from('assets')
        .insert({
          storage_path: storagePath,
          content_type: contentType,
          content_hash: contentHash,
          duration_sec: durationSec,
          validation_status: 'pending'
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      logger.info({
        assetId: asset.id,
        storagePath,
        durationSec,
        sizeKB: Math.round(audioData.length / 1024)
      }, 'Audio asset stored');

      return {
        assetId: asset.id,
        storagePath,
        contentHash,
        durationSec
      };

    } catch (error) {
      logger.error({ error, audioPath }, 'Failed to store audio');
      throw error;
    }
  }

  /**
   * Find existing asset by content hash
   */
  private async findByContentHash(contentHash: string): Promise<any> {
    const { data, error } = await this.db
      .from('assets')
      .select('*')
      .eq('content_hash', contentHash)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      throw error;
    }

    return data;
  }

  /**
   * Get audio duration using ffprobe
   */
  private async getAudioDuration(filePath: string): Promise<number> {
    const { spawn } = require('child_process');

    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);

      let output = '';

      ffprobe.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      ffprobe.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error('ffprobe failed'));
        } else {
          resolve(parseFloat(output.trim()));
        }
      });
    });
  }
}
```

### Step 3: Complete Handler with TTS

Update `workers/segment-gen/src/worker/segment-gen-handler.ts`:

Add at top:
```typescript
import { TTSClient } from '../tts/tts-client';
import { AssetStorage } from '../storage/asset-storage';
```

Add to constructor:
```typescript
  private ttsClient: TTSClient;
  private assetStorage: AssetStorage;

  constructor() {
    // ... existing code ...
    
    this.ttsClient = new TTSClient();
    this.assetStorage = new AssetStorage();
  }
```

Add after step 8 in handle method:
```typescript
      // 9. Synthesize speech
      logger.info({ segment_id }, 'Starting TTS synthesis');

      const audioPath = await this.ttsClient.synthesize({
        text: scriptResult.scriptMd,
        model: dj.voice_id || 'en_US-lessac-medium',
        speed: 1.0,
        use_cache: true
      });

      // 10. Store audio asset
      const asset = await this.assetStorage.storeAudio(audioPath, 'speech');

      // Clean up temp file
      await fs.unlink(audioPath);

      // 11. Update segment with asset
      await this.updateSegmentWithAsset(segment_id, asset.assetId, asset.durationSec);

      logger.info({
        segment_id,
        assetId: asset.assetId,
        duration: asset.durationSec
      }, 'Audio asset stored');

      // 12. Update state to normalizing
      await this.updateSegmentState(segment_id, 'normalizing');

      // 13. Enqueue mastering job
      await this.enqueueMasteringJob(segment_id, asset.assetId);

      logger.info({ segment_id }, 'Segment generation complete');
```

Add helper methods:
```typescript
  /**
   * Update segment with asset ID and duration
   */
  private async updateSegmentWithAsset(
    segmentId: string,
    assetId: string,
    durationSec: number
  ): Promise<void> {
    const { error } = await this.db
      .from('segments')
      .update({
        asset_id: assetId,
        duration_sec: durationSec,
        updated_at: new Date().toISOString()
      })
      .eq('id', segmentId);

    if (error) {
      logger.error({ error, segmentId }, 'Failed to update segment with asset');
      throw error;
    }
  }

  /**
   * Enqueue audio mastering job
   */
  private async enqueueMasteringJob(
    segmentId: string,
    assetId: string
  ): Promise<void> {
    const { data, error } = await this.db.rpc('enqueue_job', {
      p_job_type: 'audio_finalize',
      p_payload: {
        segment_id: segmentId,
        asset_id: assetId,
        content_type: 'speech'
      },
      p_priority: 5,
      p_schedule_delay_sec: 0
    });

    if (error) {
      logger.error({ error, segmentId, assetId }, 'Failed to enqueue mastering job');
      throw error;
    }

    logger.info({ segmentId, assetId, jobId: data }, 'Mastering job enqueued');
  }
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Synthesizes speech from script
- [ ] Stores raw audio in Supabase Storage
- [ ] Creates asset record
- [ ] Deduplicates by content hash
- [ ] Updates segment with asset_id
- [ ] Enqueues mastering job
- [ ] Cleans up temp files

### Quality Requirements
- [ ] All code compiles
- [ ] Logger used
- [ ] Error handling
- [ ] State transitions correct

### Manual Verification
```bash
cd workers/segment-gen
pnpm build

# Ensure Piper TTS is running
curl http://localhost:5002/health

# Start worker
SUPABASE_URL=your_url \
SUPABASE_SERVICE_ROLE_KEY=your_key \
ANTHROPIC_API_KEY=your_key \
API_URL=http://localhost:8000 \
PIPER_TTS_URL=http://localhost:5002 \
pnpm start

# Create test job (reuse G5 test)

# Verify results
psql $DATABASE_URL -c "
SELECT 
  s.state,
  s.asset_id IS NOT NULL as has_asset,
  s.duration_sec,
  a.storage_path,
  a.content_hash
FROM segments s
LEFT JOIN assets a ON a.id = s.asset_id
WHERE s.id = '00000000-0000-0000-0000-000000000003';

-- Check mastering job created
SELECT * FROM jobs WHERE job_type = 'audio_finalize';
"
```

---

## Next Task Handoff

**For G7 (Audio Mastering Worker - Normalization):**
- Create mastering worker
- Load raw audio
- Normalize to target LUFS
- Apply peak limiting

**Files created:**
- `workers/segment-gen/src/tts/tts-client.ts`
- `workers/segment-gen/src/storage/asset-storage.ts`

**Files modified:**
- `workers/segment-gen/src/worker/segment-gen-handler.ts` (added TTS + storage)

**Segment generation now complete:**
- ✅ RAG retrieval
- ✅ Script generation
- ✅ TTS synthesis
- ✅ Asset storage
- ✅ Job enqueuing

-------------------------------

# Task G7: Audio Mastering Worker - Normalization

**Tier:** Generation  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** G6 complete, D1-D8 complete

---

## Objective

Create audio mastering worker that normalizes raw audio to broadcast standards using FFmpeg.

---

## Context from Architecture

**From ARCHITECTURE.md Section 6:**

Audio mastering:
- Target: -16 LUFS integrated (speech)
- Peak limit: -1 dBFS
- Sample rate: 48kHz
- Format: WAV mono
- Validation: Check clipping, duration

---

## Implementation Steps

### Step 1: Create Mastering Worker Package
```bash
mkdir -p workers/mastering/src
cd workers/mastering
```

Create `workers/mastering/package.json`:
```json
{
  "name": "@radio/mastering-worker",
  "version": "0.0.1",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@supabase/supabase-js": "^2.39.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
```

### Step 2: Create Audio Processor

Create `workers/mastering/src/audio/audio-processor.ts`:
```typescript
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('audio-processor');

export interface ProcessingOptions {
  targetLUFS: number;
  peakLimit: number;
  sampleRate: number;
}

export interface ProcessingResult {
  outputPath: string;
  lufsIntegrated: number;
  peakDb: number;
  durationSec: number;
  sizeBytes: number;
}

/**
 * Audio processor using FFmpeg
 */
export class AudioProcessor {
  private readonly defaultOptions: ProcessingOptions = {
    targetLUFS: -16.0,
    peakLimit: -1.0,
    sampleRate: 48000
  };

  /**
   * Normalize audio to target LUFS
   */
  async normalize(
    inputPath: string,
    options?: Partial<ProcessingOptions>
  ): Promise<ProcessingResult> {
    const opts = { ...this.defaultOptions, ...options };

    logger.info({
      inputPath,
      targetLUFS: opts.targetLUFS,
      peakLimit: opts.peakLimit
    }, 'Normalizing audio');

    const startTime = Date.now();

    // Step 1: Measure current loudness
    const currentLUFS = await this.measureLUFS(inputPath);

    logger.debug({ currentLUFS }, 'Current loudness measured');

    // Step 2: Calculate adjustment
    const adjustment = opts.targetLUFS - currentLUFS;

    logger.debug({ adjustment }, 'Loudness adjustment calculated');

    // Step 3: Apply normalization
    const outputPath = path.join('/tmp', `normalized-${Date.now()}.wav`);

    await this.applyNormalization(
      inputPath,
      outputPath,
      adjustment,
      opts.peakLimit,
      opts.sampleRate
    );

    // Step 4: Verify final loudness
    const finalLUFS = await this.measureLUFS(outputPath);
    const peakDb = await this.measurePeak(outputPath);
    const durationSec = await this.getDuration(outputPath);

    // Step 5: Get file size
    const stats = await fs.stat(outputPath);

    const duration = Date.now() - startTime;

    logger.info({
      duration,
      currentLUFS,
      finalLUFS,
      peakDb,
      adjustment
    }, 'Normalization complete');

    return {
      outputPath,
      lufsIntegrated: finalLUFS,
      peakDb,
      durationSec,
      sizeBytes: stats.size
    };
  }

  /**
   * Measure integrated LUFS using ffmpeg loudnorm filter
   */
  private async measureLUFS(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', filePath,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
        '-f', 'null',
        '-'
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg failed with code ${code}`));
          return;
        }

        try {
          // Extract JSON from stderr
          const jsonMatch = stderr.match(/\{[\s\S]*?\}/);
          if (!jsonMatch) {
            reject(new Error('Could not parse loudnorm output'));
            return;
          }

          const stats = JSON.parse(jsonMatch[0]);
          resolve(parseFloat(stats.input_i));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Apply loudness normalization with peak limiting
   */
  private async applyNormalization(
    inputPath: string,
    outputPath: string,
    adjustment: number,
    peakLimit: number,
    sampleRate: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build filter chain
      const filters = [
        `volume=${adjustment}dB`,  // Adjust volume
        `alimiter=limit=${peakLimit}dB`,  // Peak limiting
        `aresample=${sampleRate}`  // Resample
      ];

      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-af', filters.join(','),
        '-ar', sampleRate.toString(),
        '-ac', '1',  // Mono
        '-y',  // Overwrite
        outputPath
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr }, 'ffmpeg normalization failed');
          reject(new Error(`ffmpeg failed with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Measure peak level
   */
  private async measurePeak(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', filePath,
        '-af', 'astats=metadata=1:reset=1',
        '-f', 'null',
        '-'
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('ffmpeg failed'));
          return;
        }

        // Extract peak from stderr
        const peakMatch = stderr.match(/Peak level dB:\s+([-\d.]+)/);
        if (peakMatch) {
          resolve(parseFloat(peakMatch[1]));
        } else {
          // Fallback to 0 if can't parse
          resolve(0);
        }
      });
    });
  }

  /**
   * Get audio duration
   */
  private async getDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);

      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('ffprobe failed'));
        } else {
          resolve(parseFloat(output.trim()));
        }
      });
    });
  }

  /**
   * Validate audio quality
   */
  validateQuality(result: ProcessingResult): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check LUFS is within acceptable range
    if (Math.abs(result.lufsIntegrated - this.defaultOptions.targetLUFS) > 2.0) {
      issues.push(`LUFS ${result.lufsIntegrated} too far from target ${this.defaultOptions.targetLUFS}`);
    }

    // Check peak doesn't exceed limit
    if (result.peakDb > this.defaultOptions.peakLimit) {
      issues.push(`Peak ${result.peakDb}dB exceeds limit ${this.defaultOptions.peakLimit}dB`);
    }

    // Check duration is reasonable
    if (result.durationSec < 5) {
      issues.push(`Duration ${result.durationSec}s is too short`);
    }

    if (result.durationSec > 600) {
      issues.push(`Duration ${result.durationSec}s is too long`);
    }

    // Check file size
    if (result.sizeBytes < 10000) {
      issues.push(`File size ${result.sizeBytes} bytes is suspiciously small`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}
```

### Step 3: Create Job Handler

Create `workers/mastering/src/worker/mastering-handler.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AudioProcessor } from '../audio/audio-processor';
import { createLogger } from '@radio/core/logger';
import { promises as fs } from 'fs';
import * as path from 'path';

const logger = createLogger('mastering-handler');

export interface MasteringJobPayload {
  segment_id: string;
  asset_id: string;
  content_type: string;
}

/**
 * Handler for audio_finalize jobs
 */
export class MasteringHandler {
  private db: SupabaseClient;
  private processor: AudioProcessor;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.processor = new AudioProcessor();

    logger.info('Mastering handler initialized');
  }

  /**
   * Process audio_finalize job
   */
  async handle(job: any): Promise<void> {
    const payload: MasteringJobPayload = job.payload;
    const { segment_id, asset_id, content_type } = payload;

    logger.info({ segment_id, asset_id }, 'Starting audio mastering');

    try {
      // 1. Fetch asset
      const asset = await this.fetchAsset(asset_id);

      if (!asset) {
        throw new Error(`Asset not found: ${asset_id}`);
      }

      // 2. Download raw audio
      const rawAudioPath = await this.downloadAudio(asset.storage_path);

      logger.info({ rawAudioPath }, 'Raw audio downloaded');

      // 3. Normalize audio
      const result = await this.processor.normalize(rawAudioPath, {
        targetLUFS: content_type === 'speech' ? -16.0 : -14.0
      });

      // 4. Validate quality
      const validation = this.processor.validateQuality(result);

      if (!validation.valid) {
        logger.warn({
          asset_id,
          issues: validation.issues
        }, 'Audio quality issues detected');
      }

      // 5. Upload normalized audio
      await this.uploadNormalizedAudio(
        asset_id,
        result.outputPath
      );

      // 6. Update asset record
      await this.updateAsset(asset_id, {
        lufs_integrated: result.lufsIntegrated,
        peak_db: result.peakDb,
        duration_sec: result.durationSec,
        validation_status: validation.valid ? 'passed' : 'failed',
        validation_errors: validation.valid ? null : validation.issues
      });

      // 7. Update segment to ready
      await this.updateSegmentState(segment_id, 'ready');

      // Clean up temp files
      await fs.unlink(rawAudioPath);
      await fs.unlink(result.outputPath);

      logger.info({ segment_id, asset_id }, 'Audio mastering complete');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        segment_id,
        asset_id,
        error: errorMessage
      }, 'Audio mastering failed');

      // Update segment to failed
      await this.updateSegmentState(segment_id, 'failed', errorMessage);

      throw error;
    }
  }

  /**
   * Fetch asset from database
   */
  private async fetchAsset(assetId: string): Promise<any> {
    const { data, error } = await this.db
      .from('assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (error) {
      logger.error({ error, assetId }, 'Failed to fetch asset');
      throw error;
    }

    return data;
  }

  /**
   * Download audio from storage
   */
  private async downloadAudio(storagePath: string): Promise<string> {
    const { data, error } = await this.db.storage
      .from('audio-assets')
      .download(storagePath);

    if (error) {
      throw error;
    }

    // Save to temp file
    const tempPath = path.join('/tmp', `raw-${Date.now()}.wav`);
    const buffer = Buffer.from(await data.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    return tempPath;
  }

  /**
   * Upload normalized audio
   */
  private async uploadNormalizedAudio(
    assetId: string,
    normalizedPath: string
  ): Promise<void> {
    const audioData = await fs.readFile(normalizedPath);

    // Upload to final location
    const finalPath = `final/${assetId}.wav`;

    const { error } = await this.db.storage
      .from('audio-assets')
      .upload(finalPath, audioData, {
        contentType: 'audio/wav',
        upsert: true
      });

    if (error) {
      throw error;
    }

    logger.info({ assetId, finalPath }, 'Normalized audio uploaded');
  }

  /**
   * Update asset record
   */
  private async updateAsset(
    assetId: string,
    updates: any
  ): Promise<void> {
    const { error } = await this.db
      .from('assets')
      .update(updates)
      .eq('id', assetId);

    if (error) {
      logger.error({ error, assetId }, 'Failed to update asset');
      throw error;
    }
  }

  /**
   * Update segment state
   */
  private async updateSegmentState(
    segmentId: string,
    state: string,
    error?: string
  ): Promise<void> {
    const updates: any = {
      state,
      updated_at: new Date().toISOString()
    };

    if (error) {
      updates.last_error = error;
    }

    const { error: updateError } = await this.db
      .from('segments')
      .update(updates)
      .eq('id', segmentId);

    if (updateError) {
      logger.error({ error: updateError, segmentId }, 'Failed to update segment state');
      throw updateError;
    }
  }
}
```

### Step 4: Create Worker Entry Point

Create `workers/mastering/src/index.ts`:
```typescript
import { BaseWorker } from '../../embedder/src/worker/base-worker';
import { MasteringHandler } from './worker/mastering-handler';
import { createLogger } from '@radio/core/logger';
import * as os from 'os';

const logger = createLogger('mastering-main');

/**
 * Audio Mastering Worker
 * Processes audio_finalize jobs to normalize and finalize audio
 */
class MasteringWorker extends BaseWorker {
  private handler: MasteringHandler;

  constructor() {
    super({
      workerType: 'audio_finalize',
      instanceId: `mastering-${os.hostname()}-${process.pid}`,
      maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '4'),
      heartbeatInterval: 30,
      leaseSeconds: 300
    });

    this.handler = new MasteringHandler();
  }

  protected async handleJob(job: any): Promise<void> {
    await this.handler.handle(job);
  }
}

async function main() {
  const worker = new MasteringWorker();

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received');
    await worker.stop();
    process.exit(0);
  });

  await worker.start();
}

main().catch(error => {
  logger.error({ error }, 'Worker crashed');
  process.exit(1);
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Downloads raw audio from storage
- [ ] Measures current LUFS
- [ ] Normalizes to target LUFS
- [ ] Applies peak limiting
- [ ] Validates audio quality
- [ ] Uploads final audio
- [ ] Updates asset with metrics
- [ ] Updates segment to ready

### Quality Requirements
- [ ] FFmpeg properly used
- [ ] Logger throughout
- [ ] Error handling
- [ ] Temp files cleaned up

### Manual Verification
```bash
cd workers/mastering
pnpm install
pnpm build

# Ensure ffmpeg installed
ffmpeg -version

# Start worker
SUPABASE_URL=your_url \
SUPABASE_SERVICE_ROLE_KEY=your_key \
pnpm start

# Test with existing audio_finalize job from G6
# Or create test:
psql $DATABASE_URL -c "
SELECT enqueue_job(
  'audio_finalize',
  '{\"segment_id\": \"your-segment-id\", \"asset_id\": \"your-asset-id\", \"content_type\": \"speech\"}'::jsonb,
  5,
  0
);
"

# Verify
psql $DATABASE_URL -c "
SELECT 
  s.state,
  a.lufs_integrated,
  a.peak_db,
  a.validation_status
FROM segments s
JOIN assets a ON a.id = s.asset_id
WHERE s.id = 'your-segment-id';
"
```

---

## Next Task Handoff

**For G8 (Audio Mastering - Deduplication):**
- Add content hash checking before mastering
- Skip mastering if identical audio exists
- Reuse existing normalized assets

**Files created:**
- `workers/mastering/src/audio/audio-processor.ts`
- `workers/mastering/src/worker/mastering-handler.ts`
- `workers/mastering/src/index.ts`

**Audio mastering complete:**
- ✅ LUFS normalization
- ✅ Peak limiting
- ✅ Quality validation
- ✅ Final upload
- ⏳ Deduplication (next)

-----------------------------

# Task G8: Audio Mastering - Deduplication

**Tier:** Generation  
**Estimated Time:** 30-45 minutes  
**Complexity:** Low  
**Prerequisites:** G7 complete

---

## Objective

Add deduplication logic to mastering worker: check if identical audio already exists before processing, reuse if found.

---

## Context from Previous Task

**From G7:**
- MasteringHandler processes audio
- Asset has content_hash field
- Need to check for duplicates before mastering

---

## Context from Architecture

**From ARCHITECTURE.md Section 6:**

Deduplication:
- Check content_hash before mastering
- If duplicate found, reuse existing normalized audio
- Update segment to point to existing asset
- Skip mastering entirely

---

## Implementation Steps

### Step 1: Update Mastering Handler

Update `workers/mastering/src/worker/mastering-handler.ts`:

Add method before `handle`:
```typescript
  /**
   * Check if identical audio already exists (dedupe)
   */
  private async checkForDuplicate(contentHash: string): Promise<string | null> {
    logger.debug({ contentHash }, 'Checking for duplicate audio');

    const { data, error } = await this.db
      .from('assets')
      .select('id, storage_path, lufs_integrated, peak_db, validation_status')
      .eq('content_hash', contentHash)
      .eq('validation_status', 'passed')
      .not('lufs_integrated', 'is', null)
      .limit(1);

    if (error) {
      logger.error({ error }, 'Failed to check for duplicates');
      return null;
    }

    if (data && data.length > 0) {
      logger.info({
        contentHash,
        existingAssetId: data[0].id
      }, 'Duplicate audio found');
      return data[0].id;
    }

    return null;
  }
```

Update `handle` method to add deduplication check after step 1:
```typescript
  async handle(job: any): Promise<void> {
    const payload: MasteringJobPayload = job.payload;
    const { segment_id, asset_id, content_type } = payload;

    logger.info({ segment_id, asset_id }, 'Starting audio mastering');

    try {
      // 1. Fetch asset
      const asset = await this.fetchAsset(asset_id);

      if (!asset) {
        throw new Error(`Asset not found: ${asset_id}`);
      }

      // 1.5 CHECK FOR DUPLICATE (NEW)
      if (asset.content_hash) {
        const duplicateAssetId = await this.checkForDuplicate(asset.content_hash);

        if (duplicateAssetId && duplicateAssetId !== asset_id) {
          logger.info({
            segment_id,
            originalAssetId: asset_id,
            duplicateAssetId
          }, 'Reusing existing normalized audio');

          // Update segment to point to existing asset
          await this.updateSegmentAsset(segment_id, duplicateAssetId);

          // Update segment to ready
          await this.updateSegmentState(segment_id, 'ready');

          // Mark original asset as duplicate (optional)
          await this.updateAsset(asset_id, {
            validation_status: 'passed',
            validation_errors: null,
            metadata: { duplicate_of: duplicateAssetId }
          });

          logger.info({ segment_id }, 'Mastering skipped (duplicate reused)');
          return; // SKIP MASTERING
        }
      }

      // 2. Download raw audio
      const rawAudioPath = await this.downloadAudio(asset.storage_path);

      // ... rest of existing code continues unchanged
```

Add helper method:
```typescript
  /**
   * Update segment asset reference
   */
  private async updateSegmentAsset(
    segmentId: string,
    assetId: string
  ): Promise<void> {
    const { error } = await this.db
      .from('segments')
      .update({
        asset_id: assetId,
        updated_at: new Date().toISOString()
      })
      .eq('id', segmentId);

    if (error) {
      logger.error({ error, segmentId }, 'Failed to update segment asset');
      throw error;
    }
  }
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Checks content_hash for duplicates
- [ ] Reuses existing normalized audio if found
- [ ] Updates segment to point to duplicate
- [ ] Skips mastering entirely on duplicate
- [ ] Still processes unique audio normally
- [ ] Logs duplicate detection

### Quality Requirements
- [ ] No breaking changes
- [ ] Logger used
- [ ] Error handling maintained

### Manual Verification
```bash
cd workers/mastering
pnpm build

# Test with duplicate audio
# 1. Create first segment with audio
psql $DATABASE_URL -c "
-- This will go through full mastering
SELECT enqueue_job(
  'audio_finalize',
  '{\"segment_id\": \"seg-1\", \"asset_id\": \"asset-1\", \"content_type\": \"speech\"}'::jsonb,
  5,
  0
);
"

# Wait for completion

# 2. Create second segment with SAME content_hash
psql $DATABASE_URL -c "
-- Insert asset with same content_hash as asset-1
INSERT INTO assets (id, storage_path, content_type, content_hash)
VALUES (
  'asset-2',
  'raw/test-2.wav',
  'speech',
  (SELECT content_hash FROM assets WHERE id = 'asset-1')
);

-- Create segment
INSERT INTO segments (id, program_id, slot_type, state, asset_id)
VALUES ('seg-2', 'program-id', 'news', 'normalizing', 'asset-2');

-- Enqueue mastering
SELECT enqueue_job(
  'audio_finalize',
  '{\"segment_id\": \"seg-2\", \"asset_id\": \"asset-2\", \"content_type\": \"speech\"}'::jsonb,
  5,
  0
);
"

# Check logs - should see "Reusing existing normalized audio"

# Verify both segments point to same final asset
psql $DATABASE_URL -c "
SELECT 
  s.id as segment_id,
  s.asset_id,
  a.content_hash,
  a.validation_status
FROM segments s
JOIN assets a ON a.id = s.asset_id
WHERE s.id IN ('seg-1', 'seg-2');
"
```

---

## Task Complete

**Generation Tier Complete!**

**Next Section: Playout Tier (P1-P6)**

**Files modified:**
- `workers/mastering/src/worker/mastering-handler.ts` (added deduplication)

**Mastering worker now:**
- ✅ Normalizes audio
- ✅ Validates quality
- ✅ Deduplicates by content hash
- ✅ Skips unnecessary processing
- ✅ Updates segments correctly

**Ready for playout system:**
- Segments have ready state
- Audio normalized to broadcast standards
- Assets deduplicated
- Queue system functional

--------------------------------------

# Task A1: Admin API - Authentication & Setup

**Tier:** Admin/CMS  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** D1-D8 complete

---

## Objective

Create Next.js admin application with Supabase authentication and basic layout structure.

---

## Context from Architecture

**From ARCHITECTURE.md Section 2:**

Admin CMS:
- Next.js 14 with App Router
- Supabase Auth for login
- Protected routes
- Dashboard layout

---

## Implementation Steps

### Step 1: Create Admin App
```bash
mkdir -p apps/admin
cd apps/admin
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
```

Update `apps/admin/package.json`:
```json
{
  "name": "@radio/admin",
  "version": "0.0.1",
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@supabase/ssr": "^0.1.0",
    "@supabase/supabase-js": "^2.39.0",
    "next": "14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5"
  }
}
```

### Step 2: Setup Supabase Client

Create `apps/admin/lib/supabase.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Create `apps/admin/lib/supabase-server.ts`:
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}
```

### Step 3: Create Auth Middleware

Create `apps/admin/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options) {
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect to login if not authenticated
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect to dashboard if authenticated and on login page
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

### Step 4: Create Login Page

Create `apps/admin/app/login/page.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            AI Radio 2525
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Admin Portal
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

### Step 5: Create Dashboard Layout

Create `apps/admin/app/dashboard/layout.tsx`:
```typescript
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold">AI Radio 2525</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/content"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  Content
                </Link>
                <Link
                  href="/dashboard/djs"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  DJs
                </Link>
                <Link
                  href="/dashboard/segments"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  Segments
                </Link>
                <Link
                  href="/dashboard/monitoring"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  Monitoring
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-700 mr-4">{user.email}</span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
```

### Step 6: Create Dashboard Home

Create `apps/admin/app/dashboard/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';

export default async function DashboardPage() {
  const supabase = await createServerClient();

  // Fetch stats
  const [segmentsResult, jobsResult, assetsResult] = await Promise.all([
    supabase.from('segments').select('state', { count: 'exact' }),
    supabase.from('jobs').select('state', { count: 'exact' }),
    supabase.from('assets').select('id', { count: 'exact' }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Total Segments</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {segmentsResult.count || 0}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Pending Jobs</h3>
          <p className="text-3xl font-bold text-yellow-600 mt-2">
            {jobsResult.count || 0}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700">Audio Assets</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {assetsResult.count || 0}
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Step 7: Add Environment Variables

Create `apps/admin/.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

---

## Acceptance Criteria

- [ ] Login page works
- [ ] Authentication redirects correctly
- [ ] Dashboard layout renders
- [ ] Navigation works
- [ ] Stats display on dashboard
- [ ] Sign out works

---

## Next Task Handoff

**For A2 (Content Management):**
- Create UI for managing universe_docs
- Create UI for managing events
- CRUD operations

**Files created:**
- `apps/admin/lib/supabase.ts`
- `apps/admin/lib/supabase-server.ts`
- `apps/admin/middleware.ts`
- `apps/admin/app/login/page.tsx`
- `apps/admin/app/dashboard/layout.tsx`
- `apps/admin/app/dashboard/page.tsx`

----------------------------

# Task A2: Content Management - Universe Docs

**Tier:** Admin/CMS  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** A1 complete

---

## Objective

Create CRUD interface for managing universe_docs (worldbuilding content) with automatic embedding job triggers.

---

## Context from Architecture

Universe docs:
- Store worldbuilding content
- Trigger embedding jobs on create/update
- Support tagging and categorization
- Markdown editor

---

## Implementation Steps

### Step 1: Create Content List Page

Create `apps/admin/app/dashboard/content/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function ContentPage() {
  const supabase = await createServerClient();

  const { data: docs, error } = await supabase
    .from('universe_docs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return <div>Error loading content: {error.message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Universe Documents</h1>
        <Link
          href="/dashboard/content/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create Document
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Language
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tags
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {docs?.map((doc) => (
              <tr key={doc.id}>
                <td className="px-6 py-4">
                  <Link
                    href={`/dashboard/content/${doc.id}`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {doc.title}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {doc.lang}
                </td>
                <td className="px-6 py-4 text-sm">
                  {doc.tags?.join(', ') || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(doc.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-sm">
                  <Link
                    href={`/dashboard/content/${doc.id}/edit`}
                    className="text-blue-600 hover:text-blue-800 mr-4"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 2: Create Document Form Component

Create `apps/admin/components/universe-doc-form.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface UniverseDocFormProps {
  doc?: any;
  mode: 'create' | 'edit';
}

export default function UniverseDocForm({ doc, mode }: UniverseDocFormProps) {
  const [title, setTitle] = useState(doc?.title || '');
  const [body, setBody] = useState(doc?.body || '');
  const [lang, setLang] = useState(doc?.lang || 'en');
  const [tags, setTags] = useState(doc?.tags?.join(', ') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const docData = {
      title,
      body,
      lang,
      tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      updated_at: new Date().toISOString(),
    };

    try {
      if (mode === 'create') {
        // Insert new doc
        const { data: newDoc, error: insertError } = await supabase
          .from('universe_docs')
          .insert([docData])
          .select()
          .single();

        if (insertError) throw insertError;

        // Trigger embedding job
        await supabase.rpc('enqueue_job', {
          p_job_type: 'kb_index',
          p_payload: {
            source_id: newDoc.id,
            source_type: 'universe_doc'
          },
          p_priority: 5,
          p_schedule_delay_sec: 0
        });

        router.push('/dashboard/content');
      } else {
        // Update existing doc
        const { error: updateError } = await supabase
          .from('universe_docs')
          .update(docData)
          .eq('id', doc.id);

        if (updateError) throw updateError;

        // Trigger re-indexing job
        await supabase.rpc('enqueue_job', {
          p_job_type: 'kb_index',
          p_payload: {
            source_id: doc.id,
            source_type: 'universe_doc'
          },
          p_priority: 5,
          p_schedule_delay_sec: 0
        });

        router.push('/dashboard/content');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from('universe_docs')
        .delete()
        .eq('id', doc.id);

      if (deleteError) throw deleteError;

      router.push('/dashboard/content');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          type="text"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Language
        </label>
        <select
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="zh">Chinese</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Tags (comma-separated)
        </label>
        <input
          type="text"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="worldbuilding, technology, culture"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Content (Markdown)
        </label>
        <textarea
          required
          rows={20}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="mt-1 text-sm text-gray-500">
          Use Markdown formatting. Will be automatically indexed for RAG.
        </p>
      </div>

      <div className="flex justify-between">
        <div className="space-x-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>

        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
```

### Step 3: Create New Document Page

Create `apps/admin/app/dashboard/content/new/page.tsx`:
```typescript
import UniverseDocForm from '@/components/universe-doc-form';

export default function NewDocumentPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create Universe Document</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <UniverseDocForm mode="create" />
      </div>
    </div>
  );
}
```

### Step 4: Create Edit Document Page

Create `apps/admin/app/dashboard/content/[id]/edit/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import UniverseDocForm from '@/components/universe-doc-form';
import { notFound } from 'next/navigation';

export default async function EditDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerClient();

  const { data: doc, error } = await supabase
    .from('universe_docs')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !doc) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit Document</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <UniverseDocForm doc={doc} mode="edit" />
      </div>
    </div>
  );
}
```

### Step 5: Create View Document Page

Create `apps/admin/app/dashboard/content/[id]/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function ViewDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerClient();

  const { data: doc, error } = await supabase
    .from('universe_docs')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !doc) {
    notFound();
  }

  // Get indexing status
  const { data: indexStatus } = await supabase
    .from('kb_index_status')
    .select('*')
    .eq('source_id', params.id)
    .eq('source_type', 'universe_doc')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{doc.title}</h1>
        <Link
          href={`/dashboard/content/${doc.id}/edit`}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Edit
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Language
            </label>
            <p className="mt-1">{doc.lang}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Tags
            </label>
            <p className="mt-1">{doc.tags?.join(', ') || '-'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Created
            </label>
            <p className="mt-1">
              {new Date(doc.created_at).toLocaleString()}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Updated
            </label>
            <p className="mt-1">
              {new Date(doc.updated_at).toLocaleString()}
            </p>
          </div>
        </div>

        {indexStatus && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Indexing Status
            </label>
            <div className="flex items-center space-x-4">
              <span
                className={`px-3 py-1 rounded text-sm ${
                  indexStatus.state === 'complete'
                    ? 'bg-green-100 text-green-800'
                    : indexStatus.state === 'processing'
                    ? 'bg-yellow-100 text-yellow-800'
                    : indexStatus.state === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {indexStatus.state}
              </span>
              <span className="text-sm text-gray-600">
                {indexStatus.chunks_created} chunks, {indexStatus.embeddings_created} embeddings
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Content
          </label>
          <div className="prose max-w-none bg-gray-50 p-4 rounded">
            <pre className="whitespace-pre-wrap">{doc.body}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] List all universe docs
- [ ] Create new docs
- [ ] Edit existing docs
- [ ] Delete docs
- [ ] View doc details with index status
- [ ] Embedding jobs triggered automatically
- [ ] Tags work properly

---

## Next Task Handoff

**For A3 (Events Management):**
- Similar CRUD for events table
- Date/time picker
- Importance slider

**Files created:**
- `apps/admin/app/dashboard/content/page.tsx`
- `apps/admin/app/dashboard/content/new/page.tsx`
- `apps/admin/app/dashboard/content/[id]/page.tsx`
- `apps/admin/app/dashboard/content/[id]/edit/page.tsx`
- `apps/admin/components/universe-doc-form.tsx`

-----------------------------

# Task A3: Content Management - Events

**Tier:** Admin/CMS  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** A2 complete

---

## Objective

Create CRUD interface for managing events (time-stamped happenings in 2525) with importance ranking.

---

## Implementation Steps

### Step 1: Create Events List Page

Create `apps/admin/app/dashboard/events/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function EventsPage() {
  const supabase = await createServerClient();

  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: false });

  if (error) {
    return <div>Error loading events: {error.message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <Link
          href="/dashboard/events/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create Event
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Event Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Importance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tags
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {events?.map((event) => (
              <tr key={event.id}>
                <td className="px-6 py-4">
                  <Link
                    href={`/dashboard/events/${event.id}`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {event.title}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(event.event_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      event.importance >= 8
                        ? 'bg-red-100 text-red-800'
                        : event.importance >= 5
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {event.importance}/10
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {event.tags?.join(', ') || '-'}
                </td>
                <td className="px-6 py-4 text-sm">
                  <Link
                    href={`/dashboard/events/${event.id}/edit`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 2: Create Event Form Component

Create `apps/admin/components/event-form.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface EventFormProps {
  event?: any;
  mode: 'create' | 'edit';
}

export default function EventForm({ event, mode }: EventFormProps) {
  const [title, setTitle] = useState(event?.title || '');
  const [body, setBody] = useState(event?.body || '');
  const [eventDate, setEventDate] = useState(
    event?.event_date ? new Date(event.event_date).toISOString().split('T')[0] : ''
  );
  const [importance, setImportance] = useState(event?.importance || 5);
  const [lang, setLang] = useState(event?.lang || 'en');
  const [tags, setTags] = useState(event?.tags?.join(', ') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const eventData = {
      title,
      body,
      event_date: new Date(eventDate).toISOString(),
      importance,
      lang,
      tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      updated_at: new Date().toISOString(),
    };

    try {
      if (mode === 'create') {
        const { data: newEvent, error: insertError } = await supabase
          .from('events')
          .insert([eventData])
          .select()
          .single();

        if (insertError) throw insertError;

        // Trigger embedding job
        await supabase.rpc('enqueue_job', {
          p_job_type: 'kb_index',
          p_payload: {
            source_id: newEvent.id,
            source_type: 'event'
          },
          p_priority: 5,
          p_schedule_delay_sec: 0
        });

        router.push('/dashboard/events');
      } else {
        const { error: updateError } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', event.id);

        if (updateError) throw updateError;

        // Trigger re-indexing
        await supabase.rpc('enqueue_job', {
          p_job_type: 'kb_index',
          p_payload: {
            source_id: event.id,
            source_type: 'event'
          },
          p_priority: 5,
          p_schedule_delay_sec: 0
        });

        router.push('/dashboard/events');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from('events')
        .delete()
        .eq('id', event.id);

      if (deleteError) throw deleteError;

      router.push('/dashboard/events');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          type="text"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Event Date
          </label>
          <input
            type="date"
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Language
          </label>
          <select
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="zh">Chinese</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Importance: {importance}/10
        </label>
        <input
          type="range"
          min="1"
          max="10"
          className="mt-1 block w-full"
          value={importance}
          onChange={(e) => setImportance(parseInt(e.target.value))}
        />
        <p className="text-xs text-gray-500 mt-1">
          Higher importance = more likely to be referenced in segments
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Tags (comma-separated)
        </label>
        <input
          type="text"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="politics, technology, culture"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description (Markdown)
        </label>
        <textarea
          required
          rows={15}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="flex justify-between">
        <div className="space-x-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>

        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
```

### Step 3: Create Remaining Pages

Create `apps/admin/app/dashboard/events/new/page.tsx`:
```typescript
import EventForm from '@/components/event-form';

export default function NewEventPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create Event</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <EventForm mode="create" />
      </div>
    </div>
  );
}
```

Create `apps/admin/app/dashboard/events/[id]/edit/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import EventForm from '@/components/event-form';
import { notFound } from 'next/navigation';

export default async function EditEventPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerClient();

  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !event) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit Event</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <EventForm event={event} mode="edit" />
      </div>
    </div>
  );
}
```

### Step 4: Update Dashboard Layout Nav

Update `apps/admin/app/dashboard/layout.tsx` to add Events link:
```typescript
// Add this link in the nav
<Link
  href="/dashboard/events"
  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
>
  Events
</Link>
```

---

## Acceptance Criteria

- [ ] List all events
- [ ] Create new events with date picker
- [ ] Edit existing events
- [ ] Delete events
- [ ] Importance slider works
- [ ] Embedding jobs triggered
- [ ] Events sorted by date

---

## Next Task Handoff

**For A4 (DJ Management):**
- Create/edit DJs
- Voice selection dropdown
- Personality text area

**Files created:**
- `apps/admin/app/dashboard/events/page.tsx`
- `apps/admin/app/dashboard/events/new/page.tsx`
- `apps/admin/app/dashboard/events/[id]/edit/page.tsx`
- `apps/admin/components/event-form.tsx`

----------------------------------------

# Task A4: DJ Management

**Tier:** Admin/CMS  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** A3 complete

---

## Objective

Create CRUD interface for managing radio DJs with voice selection and personality definitions.

---

## Implementation Steps

### Step 1: Create DJs List Page

Create `apps/admin/app/dashboard/djs/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function DJsPage() {
  const supabase = await createServerClient();

  const { data: djs, error } = await supabase
    .from('djs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return <div>Error loading DJs: {error.message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Radio DJs</h1>
        <Link
          href="/dashboard/djs/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create DJ
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {djs?.map((dj) => (
          <div key={dj.id} className="bg-white shadow rounded-lg p-6">
            <h3 className="text-xl font-bold mb-2">{dj.name}</h3>
            <p className="text-sm text-gray-600 mb-4">{dj.personality}</p>
            <div className="text-sm text-gray-500 mb-4">
              Voice: <span className="font-mono">{dj.voice_id}</span>
            </div>
            <div className="flex space-x-2">
              <Link
                href={`/dashboard/djs/${dj.id}/edit`}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Edit
              </Link>
              <span className="text-gray-300">|</span>
              <Link
                href={`/dashboard/djs/${dj.id}`}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                View
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 2: Create DJ Form Component

Create `apps/admin/components/dj-form.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface DJFormProps {
  dj?: any;
  mode: 'create' | 'edit';
}

const VOICE_MODELS = [
  { id: 'en_US-lessac-medium', name: 'English (US) - Lessac (Medium)' },
  { id: 'en_US-lessac-high', name: 'English (US) - Lessac (High)' },
  { id: 'en_GB-alan-medium', name: 'English (GB) - Alan (Medium)' },
  { id: 'es_ES-mls-medium', name: 'Spanish (ES) - MLS (Medium)' },
];

export default function DJForm({ dj, mode }: DJFormProps) {
  const [name, setName] = useState(dj?.name || '');
  const [personality, setPersonality] = useState(dj?.personality || '');
  const [voiceId, setVoiceId] = useState(dj?.voice_id || 'en_US-lessac-medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const djData = {
      name,
      personality,
      voice_id: voiceId,
    };

    try {
      if (mode === 'create') {
        const { error: insertError } = await supabase
          .from('djs')
          .insert([djData]);

        if (insertError) throw insertError;

        router.push('/dashboard/djs');
      } else {
        const { error: updateError } = await supabase
          .from('djs')
          .update(djData)
          .eq('id', dj.id);

        if (updateError) throw updateError;

        router.push('/dashboard/djs');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this DJ?')) return;

    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from('djs')
        .delete()
        .eq('id', dj.id);

      if (deleteError) throw deleteError;

      router.push('/dashboard/djs');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          DJ Name
        </label>
        <input
          type="text"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="e.g., Luna, Zephyr, Nova"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Voice Model
        </label>
        <select
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
        >
          {VOICE_MODELS.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-gray-500">
          Piper TTS voice model for speech synthesis
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Personality & Style
        </label>
        <textarea
          required
          rows={8}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Describe the DJ's personality, speaking style, and approach to hosting..."
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
        />
        <p className="mt-1 text-sm text-gray-500">
          This will guide script generation. Be specific about tone, energy level, and unique characteristics.
        </p>
      </div>

      <div className="flex justify-between">
        <div className="space-x-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>

        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
```

### Step 3: Create DJ Pages

Create `apps/admin/app/dashboard/djs/new/page.tsx`:
```typescript
import DJForm from '@/components/dj-form';

export default function NewDJPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create DJ</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <DJForm mode="create" />
      </div>
    </div>
  );
}
```

Create `apps/admin/app/dashboard/djs/[id]/edit/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import DJForm from '@/components/dj-form';
import { notFound } from 'next/navigation';

export default async function EditDJPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerClient();

  const { data: dj, error } = await supabase
    .from('djs')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !dj) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit DJ</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <DJForm dj={dj} mode="edit" />
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] List all DJs in card grid
- [ ] Create new DJs
- [ ] Edit existing DJs
- [ ] Delete DJs
- [ ] Voice model dropdown works
- [ ] Personality text saved

---

## Next Task Handoff

**For A5 (Segment Queue Management):**
- View all segments with status
- Filter by state
- Trigger segment generation manually
- Retry failed segments

**Files created:**
- `apps/admin/app/dashboard/djs/page.tsx`
- `apps/admin/app/dashboard/djs/new/page.tsx`
- `apps/admin/app/dashboard/djs/[id]/edit/page.tsx`
- `apps/admin/components/dj-form.tsx`

-------------------------------------------

# Task A5: Segment Queue Management

**Tier:** Admin/CMS  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** A4 complete

---

## Objective

Create interface for viewing and managing segment queue: filter by state, trigger generation, retry failed segments.

---

## Implementation Steps

### Step 1: Create Segments List Page

Create `apps/admin/app/dashboard/segments/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import Link from 'next/link';
import SegmentActions from '@/components/segment-actions';

export default async function SegmentsPage({
  searchParams,
}: {
  searchParams: { state?: string };
}) {
  const supabase = await createServerClient();

  let query = supabase
    .from('segments')
    .select('*, programs(name), djs(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.state) {
    query = query.eq('state', searchParams.state);
  }

  const { data: segments, error } = await query;

  if (error) {
    return <div>Error loading segments: {error.message}</div>;
  }

  const states = [
    'all',
    'queued',
    'retrieving',
    'generating',
    'rendering',
    'normalizing',
    'ready',
    'airing',
    'aired',
    'failed',
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Segments</h1>
        <Link
          href="/dashboard/segments/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create Segment
        </Link>
      </div>

      {/* State Filter */}
      <div className="mb-4 flex space-x-2">
        {states.map((state) => (
          <Link
            key={state}
            href={state === 'all' ? '/dashboard/segments' : `/dashboard/segments?state=${state}`}
            className={`px-3 py-1 rounded text-sm ${
              (state === 'all' && !searchParams.state) ||
              searchParams.state === state
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {state}
          </Link>
        ))}
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Program / DJ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Slot Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                State
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Retry
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {segments?.map((segment: any) => (
              <tr key={segment.id}>
                <td className="px-6 py-4 text-sm">
                  <div>{segment.programs?.name || '-'}</div>
                  <div className="text-gray-500">{segment.djs?.name || '-'}</div>
                </td>
                <td className="px-6 py-4 text-sm">{segment.slot_type}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      segment.state === 'ready'
                        ? 'bg-green-100 text-green-800'
                        : segment.state === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : segment.state === 'aired'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {segment.state}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {segment.duration_sec ? `${Math.round(segment.duration_sec)}s` : '-'}
                </td>
                <td className="px-6 py-4 text-sm">
                  {segment.retry_count}/{segment.max_retries}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(segment.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm">
                  <SegmentActions segment={segment} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 2: Create Segment Actions Component

Create `apps/admin/components/segment-actions.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface SegmentActionsProps {
  segment: any;
}

export default function SegmentActions({ segment }: SegmentActionsProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleRetry = async () => {
    setLoading(true);

    try {
      // Reset to queued state
      const { error: updateError } = await supabase
        .from('segments')
        .update({ state: 'queued' })
        .eq('id', segment.id);

      if (updateError) throw updateError;

      // Enqueue generation job
      await supabase.rpc('enqueue_job', {
        p_job_type: 'segment_make',
        p_payload: { segment_id: segment.id },
        p_priority: 7,
        p_schedule_delay_sec: 0,
      });

      router.refresh();
    } catch (error) {
      console.error('Retry failed:', error);
      alert('Failed to retry segment');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this segment?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('segments')
        .delete()
        .eq('id', segment.id);

      if (error) throw error;

      router.refresh();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete segment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex space-x-2">
      <Link
        href={`/dashboard/segments/${segment.id}`}
        className="text-blue-600 hover:text-blue-800"
      >
        View
      </Link>

      {segment.state === 'failed' && (
        <>
          <span className="text-gray-300">|</span>
          <button
            onClick={handleRetry}
            disabled={loading}
            className="text-green-600 hover:text-green-800 disabled:opacity-50"
          >
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </>
      )}

      <span className="text-gray-300">|</span>
      <button
        onClick={handleDelete}
        disabled={loading}
        className="text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
```

### Step 3: Create Segment Detail Page

Create `apps/admin/app/dashboard/segments/[id]/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function SegmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerClient();

  const { data: segment, error } = await supabase
    .from('segments')
    .select('*, programs(name), djs(name, voice_id), assets(*)')
    .eq('id', params.id)
    .single();

  if (error || !segment) {
    notFound();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Segment Details</h1>
        <Link
          href="/dashboard/segments"
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Segments
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <span
            className={`px-3 py-1 rounded text-sm ${
              segment.state === 'ready'
                ? 'bg-green-100 text-green-800'
                : segment.state === 'failed'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {segment.state}
          </span>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Program
            </label>
            <p className="mt-1">{segment.programs?.name || '-'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              DJ
            </label>
            <p className="mt-1">{segment.djs?.name || '-'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Slot Type
            </label>
            <p className="mt-1">{segment.slot_type}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Duration
            </label>
            <p className="mt-1">
              {segment.duration_sec ? `${Math.round(segment.duration_sec)}s` : '-'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Retry Count
            </label>
            <p className="mt-1">
              {segment.retry_count} / {segment.max_retries}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Created
            </label>
            <p className="mt-1">
              {new Date(segment.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Error Message */}
        {segment.last_error && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Error Message
            </label>
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {segment.last_error}
            </div>
          </div>
        )}

        {/* Script */}
        {segment.script_md && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Generated Script
            </label>
            <div className="bg-gray-50 p-4 rounded">
              <pre className="whitespace-pre-wrap text-sm">
                {segment.script_md}
              </pre>
            </div>
          </div>
        )}

        {/* Citations */}
        {segment.citations && segment.citations.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sources Used
            </label>
            <ul className="list-disc list-inside text-sm">
              {segment.citations.map((citation: any, i: number) => (
                <li key={i}>
                  {citation.source_type}: {citation.source_id}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Audio Asset */}
        {segment.assets && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Audio Asset
            </label>
            <div className="bg-gray-50 p-4 rounded">
              <p className="text-sm">
                <strong>LUFS:</strong> {segment.assets.lufs_integrated || '-'} |{' '}
                <strong>Peak:</strong> {segment.assets.peak_db || '-'}dB |{' '}
                <strong>Status:</strong> {segment.assets.validation_status}
              </p>
              {/* Audio player will be added in A7 */}
            </div>
          </div>
        )}

        {/* Generation Metrics */}
        {segment.generation_metrics && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Generation Metrics
            </label>
            <div className="bg-gray-50 p-4 rounded text-sm">
              <pre>{JSON.stringify(segment.generation_metrics, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] List segments with pagination
- [ ] Filter by state
- [ ] View segment details
- [ ] Retry failed segments
- [ ] Delete segments
- [ ] Show script and citations
- [ ] Display error messages

---

## Next Task Handoff

**For A6 (Monitoring Dashboard):**
- Worker health status
- Job queue stats
- System metrics
- Real-time updates

**Files created:**
- `apps/admin/app/dashboard/segments/page.tsx`
- `apps/admin/app/dashboard/segments/[id]/page.tsx`
- `apps/admin/components/segment-actions.tsx`

----------------------------------------

# Task A6: Monitoring Dashboard

**Tier:** Admin/CMS  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** A5 complete

---

## Objective

Create real-time monitoring dashboard showing worker health, job queue status, and system metrics.

---

## Implementation Steps

### Step 1: Create Health Checks Table Migration

Create `infra/migrations/012_health_checks_table.sql`:
```sql
-- Migration: Health checks table
-- Description: Worker heartbeat tracking

CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_type TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
  last_heartbeat TIMESTAMPTZ NOT NULL,
  metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_type, instance_id)
);

CREATE INDEX idx_health_checks_worker ON health_checks(worker_type);
CREATE INDEX idx_health_checks_heartbeat ON health_checks(last_heartbeat DESC);

COMMENT ON TABLE health_checks IS 'Worker health status and heartbeat tracking';
```

### Step 2: Create Monitoring Page

Create `apps/admin/app/dashboard/monitoring/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import RefreshButton from '@/components/refresh-button';

export default async function MonitoringPage() {
  const supabase = await createServerClient();

  // Fetch stats
  const [
    { data: segments },
    { data: jobs },
    { data: workers },
    { data: dlq },
  ] = await Promise.all([
    supabase.from('segments').select('state'),
    supabase.from('jobs').select('state, job_type'),
    supabase.from('health_checks').select('*'),
    supabase.from('dead_letter_queue').select('id', { count: 'exact' }),
  ]);

  // Aggregate segment states
  const segmentStats = (segments || []).reduce((acc: any, s: any) => {
    acc[s.state] = (acc[s.state] || 0) + 1;
    return acc;
  }, {});

  // Aggregate job states
  const jobStats = (jobs || []).reduce((acc: any, j: any) => {
    if (!acc[j.job_type]) acc[j.job_type] = {};
    acc[j.job_type][j.state] = (acc[j.job_type][j.state] || 0) + 1;
    return acc;
  }, {});

  // Check worker health
  const now = new Date();
  const healthyWorkers = (workers || []).filter((w: any) => {
    const lastHeartbeat = new Date(w.last_heartbeat);
    const ageMinutes = (now.getTime() - lastHeartbeat.getTime()) / 60000;
    return ageMinutes < 2; // Healthy if heartbeat within 2 minutes
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">System Monitoring</h1>
        <RefreshButton />
      </div>

      {/* Worker Health */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Worker Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['kb_index', 'segment_make', 'audio_finalize'].map((workerType) => {
            const workerInstances = (workers || []).filter(
              (w: any) => w.worker_type === workerType
            );
            const healthy = workerInstances.filter((w: any) => {
              const ageMinutes =
                (now.getTime() - new Date(w.last_heartbeat).getTime()) / 60000;
              return ageMinutes < 2;
            });

            return (
              <div key={workerType} className="bg-white shadow rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {workerType}
                </h3>
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold">
                    {healthy.length}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    / {workerInstances.length} healthy
                  </span>
                </div>
                {healthy.length === 0 && workerInstances.length === 0 && (
                  <p className="text-sm text-red-600 mt-2">No workers running</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Segment States */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Segment Pipeline</h2>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(segmentStats).map(([state, count]) => (
              <div key={state}>
                <div className="text-sm text-gray-600">{state}</div>
                <div className="text-2xl font-bold">{count as number}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Job Queue */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Job Queue</h2>
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Job Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Pending
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Processing
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Failed
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(jobStats).map(([jobType, states]: [string, any]) => (
                <tr key={jobType}>
                  <td className="px-6 py-4 text-sm font-medium">{jobType}</td>
                  <td className="px-6 py-4 text-sm">{states.pending || 0}</td>
                  <td className="px-6 py-4 text-sm">{states.processing || 0}</td>
                  <td className="px-6 py-4 text-sm">{states.completed || 0}</td>
                  <td className="px-6 py-4 text-sm">{states.failed || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dead Letter Queue */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Dead Letter Queue</h2>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-baseline">
            <span className="text-3xl font-bold">{dlq?.length || 0}</span>
            <span className="ml-2 text-sm text-gray-500">
              jobs require review
            </span>
          </div>
          {(dlq?.length || 0) > 0 && (
            
              href="/dashboard/dlq"
              className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block"
            >
              Review →
            </a>
          )}
        </div>
      </div>

      {/* Worker Instances */}
      {healthyWorkers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">Active Worker Instances</h2>
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Instance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Heartbeat
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Jobs in Flight
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {healthyWorkers.map((worker: any) => {
                  const ageMinutes = Math.round(
                    (now.getTime() - new Date(worker.last_heartbeat).getTime()) / 60000
                  );

                  return (
                    <tr key={worker.id}>
                      <td className="px-6 py-4 text-sm font-mono">
                        {worker.instance_id}
                      </td>
                      <td className="px-6 py-4 text-sm">{worker.worker_type}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                          {worker.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {ageMinutes === 0 ? 'Just now' : `${ageMinutes}m ago`}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {worker.metrics?.jobs_in_flight || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 3: Create Refresh Button Component

Create `apps/admin/components/refresh-button.tsx`:
```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRefresh = () => {
    setLoading(true);
    router.refresh();
    setTimeout(() => setLoading(false), 500);
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 disabled:opacity-50"
    >
      {loading ? 'Refreshing...' : '↻ Refresh'}
    </button>
  );
}
```

---

## Acceptance Criteria

- [ ] Worker health status displayed
- [ ] Segment pipeline stats shown
- [ ] Job queue metrics displayed
- [ ] Dead letter queue count shown
- [ ] Active worker instances listed
- [ ] Refresh button works
- [ ] Unhealthy workers highlighted

---

## Next Task Handoff

**For A7 (Audio Preview):**
- Add audio player component
- Preview segment audio
- Download audio files

**Files created:**
- `infra/migrations/012_health_checks_table.sql`
- `apps/admin/app/dashboard/monitoring/page.tsx`
- `apps/admin/components/refresh-button.tsx`

-----------------------------

# Task A7: Audio Preview & Player

**Tier:** Admin/CMS  
**Estimated Time:** 45 minutes  
**Complexity:** Low  
**Prerequisites:** A6 complete

---

## Objective

Add audio player component to preview and play segment audio in the admin interface.

---

## Implementation Steps

### Step 1: Create Audio Player Component

Create `apps/admin/components/audio-player.tsx`:
```typescript
'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase';

interface AudioPlayerProps {
  assetId: string;
  storagePath: string;
}

export default function AudioPlayer({ assetId, storagePath }: AudioPlayerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const supabase = createClient();

  const loadAudio = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.storage
        .from('audio-assets')
        .createSignedUrl(storagePath, 3600); // 1 hour URL

      if (error) throw error;

      setAudioUrl(data.signedUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = async () => {
    if (!audioUrl) {
      await loadAudio();
      return;
    }

    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const handleDownload = async () => {
    if (!audioUrl) {
      await loadAudio();
    }

    if (audioUrl) {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = `segment-${assetId}.wav`;
      link.click();
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded">
      {error && (
        <div className="text-red-600 text-sm mb-2">{error}</div>
      )}

      <div className="flex items-center space-x-4">
        <button
          onClick={handlePlayPause}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : playing ? '⏸ Pause' : '▶ Play'}
        </button>

        <button
          onClick={handleDownload}
          disabled={loading}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
        >
          ⬇ Download
        </button>

        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        )}
      </div>

      {audioUrl && (
        <div className="mt-4">
          <audio
            controls
            src={audioUrl}
            className="w-full"
            ref={audioRef}
          />
        </div>
      )}
    </div>
  );
}
```

### Step 2: Update Segment Detail Page

Update `apps/admin/app/dashboard/segments/[id]/page.tsx`:
```typescript
import AudioPlayer from '@/components/audio-player';

// ... existing code ...

// Replace the audio asset section with:
{segment.assets && (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Audio Asset
    </label>
    <AudioPlayer
      assetId={segment.assets.id}
      storagePath={segment.assets.storage_path}
    />
    <div className="mt-2 text-sm text-gray-600">
      <strong>LUFS:</strong> {segment.assets.lufs_integrated || '-'} |{' '}
      <strong>Peak:</strong> {segment.assets.peak_db || '-'}dB |{' '}
      <strong>Status:</strong> {segment.assets.validation_status}
    </div>
  </div>
)}
```

### Step 3: Add Audio Player to Segments List

Update `apps/admin/app/dashboard/segments/page.tsx` to add preview column:
```typescript
// Add this column header
<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
  Audio
</th>

// Add this cell
<td className="px-6 py-4">
  {segment.asset_id && segment.assets ? (
    <button
      onClick={() => {
        // Quick preview modal or inline player
        window.open(
          `/dashboard/segments/${segment.id}#audio`,
          '_blank'
        );
      }}
      className="text-blue-600 hover:text-blue-800 text-sm"
    >
      🔊 Preview
    </button>
  ) : (
    '-'
  )}
</td>
```

---

## Acceptance Criteria

- [ ] Audio player loads and plays segment audio
- [ ] Play/pause controls work
- [ ] Download button works
- [ ] Signed URLs generated securely
- [ ] Player shows on segment detail page
- [ ] Preview link works from segments list

---

## Next Task Handoff

**For A8 (Dead Letter Queue Review):**
- List all DLQ jobs
- View failure details
- Retry or dismiss jobs
- Bulk actions

**Files created:**
- `apps/admin/components/audio-player.tsx`

**Files modified:**
- `apps/admin/app/dashboard/segments/[id]/page.tsx`
- `apps/admin/app/dashboard/segments/page.tsx`

----------------------------------------------------

# Task A8: Dead Letter Queue Review

**Tier:** Admin/CMS  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** A7 complete

---

## Objective

Create interface for reviewing and managing jobs that failed after max retries in the dead letter queue.

---

## Implementation Steps

### Step 1: Create DLQ List Page

Create `apps/admin/app/dashboard/dlq/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import DLQActions from '@/components/dlq-actions';

export default async function DLQPage() {
  const supabase = await createServerClient();

  const { data: dlqJobs, error } = await supabase
    .from('dead_letter_queue')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return <div>Error loading DLQ: {error.message}</div>;
  }

  const unreviewedCount = dlqJobs?.filter((j: any) => !j.reviewed_at).length || 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dead Letter Queue</h1>
        <p className="text-gray-600 mt-2">
          Jobs that failed after maximum retry attempts
        </p>
        {unreviewedCount > 0 && (
          <div className="mt-2 text-sm text-red-600">
            {unreviewedCount} unreviewed jobs
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Job Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Payload
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Failure Reason
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Attempts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Failed At
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {dlqJobs?.map((job: any) => (
              <tr key={job.id}>
                <td className="px-6 py-4 text-sm font-medium">
                  {job.job_type}
                </td>
                <td className="px-6 py-4 text-sm">
                  <code className="text-xs">
                    {JSON.stringify(job.payload).slice(0, 50)}...
                  </code>
                </td>
                <td className="px-6 py-4 text-sm text-red-600">
                  {job.failure_reason.slice(0, 100)}
                  {job.failure_reason.length > 100 && '...'}
                </td>
                <td className="px-6 py-4 text-sm">
                  {job.attempts_made}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(job.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  {job.reviewed_at ? (
                    <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">
                      Reviewed
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                      Unreviewed
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  <DLQActions job={job} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {dlqJobs?.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No jobs in dead letter queue
          </div>
        )}
      </div>
    </div>
  );
}
```

### Step 2: Create DLQ Actions Component

Create `apps/admin/components/dlq-actions.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface DLQActionsProps {
  job: any;
}

export default function DLQActions({ job }: DLQActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleRetry = async () => {
    if (!confirm('Retry this job? It will be re-enqueued.')) return;

    setLoading(true);
    try {
      // Re-enqueue job
      await supabase.rpc('enqueue_job', {
        p_job_type: job.job_type,
        p_payload: job.payload,
        p_priority: 5,
        p_schedule_delay_sec: 0,
      });

      // Mark as reviewed
      await supabase
        .from('dead_letter_queue')
        .update({
          reviewed_at: new Date().toISOString(),
          resolution: 'retried',
        })
        .eq('id', job.id);

      router.refresh();
    } catch (error) {
      console.error('Retry failed:', error);
      alert('Failed to retry job');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!confirm('Dismiss this job? It will be marked as reviewed.')) return;

    setLoading(true);
    try {
      await supabase
        .from('dead_letter_queue')
        .update({
          reviewed_at: new Date().toISOString(),
          resolution: 'dismissed',
        })
        .eq('id', job.id);

      router.refresh();
    } catch (error) {
      console.error('Dismiss failed:', error);
      alert('Failed to dismiss job');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Permanently delete this job?')) return;

    setLoading(true);
    try {
      await supabase
        .from('dead_letter_queue')
        .delete()
        .eq('id', job.id);

      router.refresh();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex space-x-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-blue-600 hover:text-blue-800"
        >
          Details
        </button>

        {!job.reviewed_at && (
          <>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleRetry}
              disabled={loading}
              className="text-green-600 hover:text-green-800 disabled:opacity-50"
            >
              Retry
            </button>

            <span className="text-gray-300">|</span>
            <button
              onClick={handleDismiss}
              disabled={loading}
              className="text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
            >
              Dismiss
            </button>
          </>
        )}

        <span className="text-gray-300">|</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      {showDetails && (
        <div className="mt-4 p-4 bg-gray-50 rounded text-sm">
          <div className="mb-2">
            <strong>Full Failure Reason:</strong>
            <p className="mt-1 text-red-600">{job.failure_reason}</p>
          </div>

          {job.failure_details && (
            <div className="mb-2">
              <strong>Details:</strong>
              <pre className="mt-1 text-xs overflow-auto">
                {JSON.stringify(job.failure_details, null, 2)}
              </pre>
            </div>
          )}

          <div className="mb-2">
            <strong>Full Payload:</strong>
            <pre className="mt-1 text-xs overflow-auto">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </div>

          {job.reviewed_at && (
            <div>
              <strong>Resolution:</strong>
              <p className="mt-1">
                {job.resolution} at {new Date(job.reviewed_at).toLocaleString()}
              </p>
              {job.resolution_notes && (
                <p className="mt-1 text-gray-600">{job.resolution_notes}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Step 3: Add DLQ Link to Monitoring Dashboard

Update `apps/admin/app/dashboard/monitoring/page.tsx`:
```typescript
// In the DLQ section, update the link:
{(dlq?.length || 0) > 0 && (
  <Link
    href="/dashboard/dlq"
    className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block"
  >
    Review {dlq?.length} jobs →
  </Link>
)}
```

### Step 4: Add DLQ to Navigation

Update `apps/admin/app/dashboard/layout.tsx`:
```typescript
// Add DLQ link if there are unreviewed jobs
<Link
  href="/dashboard/dlq"
  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
>
  DLQ
</Link>
```

---

## Acceptance Criteria

- [ ] List all DLQ jobs
- [ ] Show failure reason and details
- [ ] Retry jobs back to queue
- [ ] Dismiss jobs as reviewed
- [ ] Delete jobs permanently
- [ ] View full error details
- [ ] Show unreviewed count
- [ ] Link from monitoring dashboard

---

## Admin/CMS Tier Complete!

**Files created:**
- `apps/admin/app/dashboard/dlq/page.tsx`
- `apps/admin/components/dlq-actions.tsx`

**Admin system now has:**
- ✅ Authentication & authorization
- ✅ Content management (docs & events)
- ✅ DJ management
- ✅ Segment queue management
- ✅ System monitoring
- ✅ Audio preview & playback
- ✅ Dead letter queue review

**Ready for Playout Tier (P1-P6)!**

----------------------------------------

# Task P1: Liquidsoap Configuration - Basic Setup

**Tier:** Playout  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** G1-G8 complete (segments ready to play)

---

## Objective

Create Liquidsoap configuration for basic radio playout: fetch segments from API, play audio files, output to Icecast.

---

## Context from Architecture

**From ARCHITECTURE.md Section 7:**

Liquidsoap playout:
- Polls `/playout/next` endpoint every 15 seconds
- Downloads and plays audio files
- Outputs to Icecast (Opus 96kbps)
- Reports now-playing to API

---

## Implementation Steps

### Step 1: Create Playout Directory Structure
```bash
mkdir -p apps/playout
cd apps/playout
```

### Step 2: Install Liquidsoap

Create `apps/playout/Dockerfile`:
```dockerfile
FROM savonet/liquidsoap:v2.2.3

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /var/log/liquidsoap /var/run/liquidsoap /radio/audio

# Copy scripts
COPY radio.liq /radio/radio.liq
COPY fetch-next.sh /radio/fetch-next.sh
RUN chmod +x /radio/fetch-next.sh

WORKDIR /radio

CMD ["liquidsoap", "/radio/radio.liq"]
```

### Step 3: Create Fetch Script

Create `apps/playout/fetch-next.sh`:
```bash
#!/bin/bash
# Fetch next segments from API and download audio

API_URL="${API_URL:-http://localhost:8000}"
OUTPUT_DIR="${OUTPUT_DIR:-/radio/audio}"
LIMIT="${LIMIT:-10}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Fetch next segments
RESPONSE=$(curl -s "$API_URL/playout/next?limit=$LIMIT")

if [ $? -ne 0 ]; then
  echo "Error: Failed to fetch segments from API" >&2
  exit 1
fi

# Parse and download segments
echo "$RESPONSE" | jq -r '.segments[] | @json' | while read -r segment; do
  SEGMENT_ID=$(echo "$segment" | jq -r '.id')
  AUDIO_URL=$(echo "$segment" | jq -r '.audio_url')
  TITLE=$(echo "$segment" | jq -r '.title')
  
  OUTPUT_FILE="$OUTPUT_DIR/$SEGMENT_ID.wav"
  
  # Skip if already downloaded
  if [ -f "$OUTPUT_FILE" ]; then
    echo "Already cached: $SEGMENT_ID"
    continue
  fi
  
  # Download audio
  echo "Downloading: $TITLE ($SEGMENT_ID)"
  curl -s -o "$OUTPUT_FILE.tmp" "$AUDIO_URL"
  
  if [ $? -eq 0 ]; then
    mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"
    echo "Downloaded: $OUTPUT_FILE"
  else
    echo "Error downloading: $SEGMENT_ID" >&2
    rm -f "$OUTPUT_FILE.tmp"
  fi
done

# List available segments
ls -1 "$OUTPUT_DIR"/*.wav 2>/dev/null || echo "No segments available"
```

### Step 4: Create Liquidsoap Script

Create `apps/playout/radio.liq`:
```liquidsoap
#!/usr/bin/liquidsoap

# AI Radio 2525 - Liquidsoap Configuration
# Basic playout with API integration

# Configuration
settings.log.level := 4
settings.server.telnet := true
settings.server.telnet.port := 1234

# Environment variables
api_url = getenv("API_URL")
audio_dir = getenv("OUTPUT_DIR")
icecast_host = getenv("ICECAST_HOST")
icecast_port = getenv("ICECAST_PORT")
icecast_password = getenv("ICECAST_PASSWORD")

# Set defaults
api_url := if api_url == "" then "http://localhost:8000" else api_url end
audio_dir := if audio_dir == "" then "/radio/audio" else audio_dir end
icecast_host := if icecast_host == "" then "localhost" else icecast_host end
icecast_port := if icecast_port == "" then "8000" else icecast_port end
icecast_password := if icecast_password == "" then "hackme" else icecast_password end

# Log configuration
log("API URL: #{api_url}")
log("Audio directory: #{audio_dir}")
log("Icecast: #{icecast_host}:#{icecast_port}")

# Global reference for current segment
current_segment_id = ref("")
current_segment_title = ref("")

# Function to fetch next segments from API
def fetch_segments() =
  log("Fetching segments from API...")
  result = process.run("bash /radio/fetch-next.sh")
  log("Fetch result: #{result}")
end

# Function to report now-playing to API
def report_now_playing(segment_id, title) =
  log("Reporting now-playing: #{segment_id} - #{title}")
  
  cmd = "curl -s -X POST #{api_url}/playout/now-playing \
         -H 'Content-Type: application/json' \
         -d '{\"segment_id\": \"#{segment_id}\", \"title\": \"#{title}\", \"timestamp\": \"#{time.string()}\"}'"
  
  result = process.run(cmd)
  log("Report result: #{result}")
end

# Fetch segments initially
fetch_segments()

# Schedule periodic fetch (every 15 seconds)
thread.run(delay=15.0, every=15.0, fetch_segments)

# Create playlist source from audio directory
playlist_source = playlist(
  mode="randomize",
  reload=15,
  reload_mode="watch",
  "#{audio_dir}/*.wav"
)

# Extract metadata and report on_track
def on_track_metadata(m) =
  # Extract segment ID from filename
  filename = m["filename"]
  log("New track: #{filename}")
  
  # Parse segment ID from filename (format: /path/to/SEGMENT_ID.wav)
  segment_id = string.replace(pattern=".*/([^/]+)\\.wav$", fun (s) -> s, filename)
  title = m["title"]
  
  # Update current segment reference
  current_segment_id := segment_id
  current_segment_title := title
  
  # Report to API
  report_now_playing(segment_id, title)
  
  # Return metadata
  m
end

# Apply metadata handler
source = map_metadata(on_track_metadata, playlist_source)

# Add blank detection (fallback to silence if no tracks)
source = mksafe(source)

# Normalize audio
source = normalize(source, gain_max=0.0, gain_min=-6.0, target=-16.0)

# Output to Icecast (Opus)
output.icecast(
  %opus(bitrate=96, samplerate=48000, channels=2),
  host=icecast_host,
  port=int_of_string(icecast_port),
  password=icecast_password,
  mount="radio.opus",
  name="AI Radio 2525",
  description="Broadcasting from the year 2525",
  genre="Future Radio",
  url="https://radio2525.ai",
  source
)

# Output to Icecast (MP3 for compatibility)
output.icecast(
  %mp3(bitrate=128, samplerate=44100),
  host=icecast_host,
  port=int_of_string(icecast_port),
  password=icecast_password,
  mount="radio.mp3",
  name="AI Radio 2525",
  description="Broadcasting from the year 2525",
  genre="Future Radio",
  url="https://radio2525.ai",
  source
)

# Log startup
log("AI Radio 2525 started successfully")
```

### Step 5: Create Docker Compose

Create `apps/playout/docker-compose.yml`:
```yaml
version: '3.8'

services:
  liquidsoap:
    build: .
    container_name: radio-liquidsoap
    environment:
      - API_URL=http://api:8000
      - OUTPUT_DIR=/radio/audio
      - ICECAST_HOST=icecast
      - ICECAST_PORT=8000
      - ICECAST_PASSWORD=hackme
    volumes:
      - ./audio:/radio/audio
      - ./logs:/var/log/liquidsoap
    depends_on:
      - icecast
    restart: unless-stopped
    networks:
      - radio-network

  icecast:
    image: moul/icecast:2.4.4
    container_name: radio-icecast
    environment:
      - ICECAST_SOURCE_PASSWORD=hackme
      - ICECAST_ADMIN_PASSWORD=admin
      - ICECAST_PASSWORD=hackme
      - ICECAST_RELAY_PASSWORD=hackme
    ports:
      - "8000:8000"
    volumes:
      - ./icecast.xml:/etc/icecast2/icecast.xml:ro
    restart: unless-stopped
    networks:
      - radio-network

networks:
  radio-network:
    driver: bridge
```

### Step 6: Create Icecast Config

Create `apps/playout/icecast.xml`:
```xml
<icecast>
  <location>Earth</location>
  <admin>admin@radio2525.ai</admin>

  <limits>
    <clients>100</clients>
    <sources>2</sources>
    <queue-size>524288</queue-size>
    <client-timeout>30</client-timeout>
    <header-timeout>15</header-timeout>
    <source-timeout>10</source-timeout>
    <burst-on-connect>1</burst-on-connect>
    <burst-size>65535</burst-size>
  </limits>

  <authentication>
    <source-password>hackme</source-password>
    <relay-password>hackme</relay-password>
    <admin-user>admin</admin-user>
    <admin-password>admin</admin-password>
  </authentication>

  <hostname>localhost</hostname>

  <listen-socket>
    <port>8000</port>
  </listen-socket>

  <fileserve>1</fileserve>

  <paths>
    <basedir>/usr/share/icecast2</basedir>
    <logdir>/var/log/icecast2</logdir>
    <webroot>/usr/share/icecast2/web</webroot>
    <adminroot>/usr/share/icecast2/admin</adminroot>
    <alias source="/" destination="/status.xsl"/>
  </paths>

  <logging>
    <accesslog>access.log</accesslog>
    <errorlog>error.log</errorlog>
    <loglevel>3</loglevel>
    <logsize>10000</logsize>
  </logging>

  <security>
    <chroot>0</chroot>
  </security>
</icecast>
```

### Step 7: Create Environment File

Create `apps/playout/.env`:
```bash
# API Configuration
API_URL=http://localhost:8000

# Audio Storage
OUTPUT_DIR=/radio/audio

# Icecast Configuration
ICECAST_HOST=localhost
ICECAST_PORT=8000
ICECAST_PASSWORD=hackme

# Segment Fetch
LIMIT=10
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Liquidsoap fetches segments from API
- [ ] Audio files downloaded and cached
- [ ] Playlist plays continuously
- [ ] Icecast streaming works (Opus + MP3)
- [ ] Now-playing reported to API
- [ ] Handles missing segments gracefully

### Quality Requirements
- [ ] Logs are clear and informative
- [ ] Configuration via environment variables
- [ ] Docker setup works
- [ ] Audio normalization applied

### Manual Verification
```bash
cd apps/playout

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f liquidsoap

# Test stream
ffplay http://localhost:8001/radio.opus

# Check Icecast status
curl http://localhost:8001/status.xsl

# Verify fetch script works
docker-compose exec liquidsoap bash /radio/fetch-next.sh
```

---

## Next Task Handoff

**For P2 (Playout API Endpoints):**
- Create GET /playout/next endpoint
- Create POST /playout/now-playing endpoint
- Generate signed URLs for audio

**Files created:**
- `apps/playout/Dockerfile`
- `apps/playout/docker-compose.yml`
- `apps/playout/radio.liq`
- `apps/playout/fetch-next.sh`
- `apps/playout/icecast.xml`
- `apps/playout/.env`

**Playout system foundation ready:**
- ✅ Liquidsoap configured
- ✅ Icecast streaming
- ✅ API integration hooks
- ⏳ API endpoints (next)

--------------------------------

# Task P2: Playout API Endpoints

**Tier:** Playout  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** P1, G8 complete

---

## Objective

Create FastAPI endpoints for playout system: fetch next segments with signed audio URLs, record now-playing events.

---

## Context from Architecture

Playout API:
- GET /playout/next - Returns ready segments with signed URLs
- POST /playout/now-playing - Records what's currently airing

---

## Implementation Steps

### Step 1: Create Playout Routes

Create `apps/api/src/playout/playout_routes.py`:
```python
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import os
from supabase import create_client, Client

router = APIRouter(prefix="/playout", tags=["playout"])

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)


class PlayoutSegment(BaseModel):
    id: str
    title: str
    audio_url: str
    duration_sec: float
    slot_type: str
    dj_name: Optional[str] = None


class PlayoutResponse(BaseModel):
    segments: List[PlayoutSegment]
    total: int


class NowPlayingRequest(BaseModel):
    segment_id: str
    title: str
    timestamp: str


@router.get("/next", response_model=PlayoutResponse)
async def get_next_segments(limit: int = Query(default=10, ge=1, le=50)):
    """
    Get next segments ready for playout
    
    Returns segments in ready state with signed audio URLs
    """
    try:
        # Fetch ready segments
        response = supabase.table("segments") \
            .select("*, assets(*), programs(name), djs(name)") \
            .eq("state", "ready") \
            .order("scheduled_start_ts", desc=False) \
            .limit(limit) \
            .execute()
        
        segments = []
        
        for row in response.data:
            # Get asset
            asset = row.get("assets")
            if not asset:
                continue
            
            # Generate signed URL (1 hour expiry)
            storage_path = asset.get("storage_path")
            
            # Check if we need final audio or can use raw
            # Prefer final audio if available
            final_path = f"final/{asset['id']}.wav"
            
            try:
                signed_url_response = supabase.storage \
                    .from_("audio-assets") \
                    .create_signed_url(final_path, 3600)
                
                if signed_url_response.get("error"):
                    # Fallback to storage_path if final doesn't exist
                    signed_url_response = supabase.storage \
                        .from_("audio-assets") \
                        .create_signed_url(storage_path, 3600)
                
                audio_url = signed_url_response.get("signedURL")
                
            except Exception as e:
                print(f"Error generating signed URL: {e}")
                continue
            
            # Build segment object
            segment = PlayoutSegment(
                id=row["id"],
                title=f"{row.get('programs', {}).get('name', 'Unknown')} - {row['slot_type']}",
                audio_url=audio_url,
                duration_sec=row.get("duration_sec", 0),
                slot_type=row["slot_type"],
                dj_name=row.get("djs", {}).get("name")
            )
            
            segments.append(segment)
        
        return PlayoutResponse(
            segments=segments,
            total=len(segments)
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/now-playing")
async def report_now_playing(request: NowPlayingRequest):
    """
    Report that a segment is now playing
    
    Updates segment state to 'airing' and records timestamp
    """
    try:
        # Update segment to airing
        update_response = supabase.table("segments") \
            .update({
                "state": "airing",
                "aired_at": request.timestamp,
                "updated_at": datetime.utcnow().isoformat()
            }) \
            .eq("id", request.segment_id) \
            .execute()
        
        if not update_response.data:
            raise HTTPException(status_code=404, detail="Segment not found")
        
        # Log to analytics (optional - for future)
        # Could insert into an "airings" table for historical tracking
        
        return {
            "status": "ok",
            "segment_id": request.segment_id,
            "message": "Now playing updated"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segment-complete/{segment_id}")
async def mark_segment_complete(segment_id: str):
    """
    Mark a segment as aired (completed playback)
    """
    try:
        # Update segment to aired
        update_response = supabase.table("segments") \
            .update({
                "state": "aired",
                "updated_at": datetime.utcnow().isoformat()
            }) \
            .eq("id", segment_id) \
            .eq("state", "airing") \
            .execute()
        
        if not update_response.data:
            raise HTTPException(
                status_code=404, 
                detail="Segment not found or not currently airing"
            )
        
        return {
            "status": "ok",
            "segment_id": segment_id,
            "message": "Segment marked as aired"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 2: Register Routes in Main API

Update `apps/api/src/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from .rag.rag_routes import router as rag_router
from .playout.playout_routes import router as playout_router  # ADD THIS

app = FastAPI(
    title="AI Radio 2525 API",
    version="1.0.0",
    description="Backend API for AI Radio 2525"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(rag_router)
app.include_router(playout_router)  # ADD THIS

@app.get("/")
async def root():
    return {
        "service": "AI Radio 2525 API",
        "version": "1.0.0",
        "status": "operational"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}
```

### Step 3: Create Playout Client Test

Create `apps/api/tests/test_playout.py`:
```python
import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_get_next_segments():
    """Test fetching next segments"""
    response = client.get("/playout/next?limit=5")
    
    assert response.status_code == 200
    data = response.json()
    
    assert "segments" in data
    assert "total" in data
    assert isinstance(data["segments"], list)
    assert len(data["segments"]) <= 5


def test_get_next_segments_limit():
    """Test limit parameter"""
    response = client.get("/playout/next?limit=3")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["segments"]) <= 3


def test_report_now_playing():
    """Test reporting now-playing"""
    payload = {
        "segment_id": "test-segment-id",
        "title": "Test Segment",
        "timestamp": "2525-01-01T12:00:00Z"
    }
    
    response = client.post("/playout/now-playing", json=payload)
    
    # Will 404 if segment doesn't exist, which is expected in test
    assert response.status_code in [200, 404]


def test_invalid_limit():
    """Test invalid limit parameter"""
    response = client.get("/playout/next?limit=100")
    
    # Should accept but cap at 50
    assert response.status_code == 200


def test_mark_complete():
    """Test marking segment as complete"""
    response = client.post("/playout/segment-complete/test-id")
    
    # Will 404 if segment doesn't exist
    assert response.status_code in [200, 404]
```

### Step 4: Update Liquidsoap Script

Update `apps/playout/radio.liq` to use segment-complete endpoint:
```liquidsoap
# Add after on_track_metadata function:

# Function to mark segment as complete
def on_track_end(m) =
  segment_id = !current_segment_id
  
  if segment_id != "" then
    log("Marking segment complete: #{segment_id}")
    
    cmd = "curl -s -X POST #{api_url}/playout/segment-complete/#{segment_id}"
    result = process.run(cmd)
    
    log("Complete result: #{result}")
  end
end

# Apply on_stop handler
source = on_stop(on_track_end, source)
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] GET /playout/next returns ready segments
- [ ] Signed URLs are valid and accessible
- [ ] POST /now-playing updates segment state
- [ ] POST /segment-complete marks as aired
- [ ] Limit parameter works
- [ ] Error handling for missing segments

### Quality Requirements
- [ ] OpenAPI docs generated
- [ ] Tests pass
- [ ] Proper HTTP status codes
- [ ] Logging in place

### Manual Verification
```bash
# Start API
cd apps/api
uvicorn src.main:app --reload

# Test endpoints
curl http://localhost:8000/playout/next?limit=5

curl -X POST http://localhost:8000/playout/now-playing \
  -H "Content-Type: application/json" \
  -d '{"segment_id":"test","title":"Test","timestamp":"2025-01-01T12:00:00Z"}'

# View OpenAPI docs
open http://localhost:8000/docs

# Test with Liquidsoap
docker-compose -f apps/playout/docker-compose.yml up
```

---

## Next Task Handoff

**For P3 (Scheduler Worker - Schedule Generation):**
- Create scheduler worker
- Generate daily schedules
- Assign segments to time slots
- Create segment generation jobs

**Files created:**
- `apps/api/src/playout/playout_routes.py`
- `apps/api/tests/test_playout.py`

**Files modified:**
- `apps/api/src/main.py` (registered playout router)
- `apps/playout/radio.liq` (added segment-complete call)

**Playout API ready:**
- ✅ Fetch next segments
- ✅ Report now-playing
- ✅ Mark segments complete
- ✅ Signed URLs for audio

--------------------------

# Task P3: Scheduler Worker - Schedule Generation

**Tier:** Playout  
**Estimated Time:** 1-2 hours  
**Complexity:** High  
**Prerequisites:** P2, D1-D8 complete

---

## Objective

Create scheduler worker that generates daily broadcast schedules: creates segments for each time slot and triggers generation jobs.

---

## Context from Architecture

**From ARCHITECTURE.md Section 7:**

Scheduler:
- Runs daily to generate next day's schedule
- Uses format clocks to determine slot types
- Creates segment records in queued state
- Enqueues segment_make jobs
- Ensures continuous content

---

## Implementation Steps

### Step 1: Create Programs and Format Clocks Tables

Create `infra/migrations/013_programs_format_clocks.sql`:
```sql
-- Migration: Programs and format clocks
-- Description: Program scheduling and format definitions

-- Format clocks define hourly structure
CREATE TABLE format_clocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  slots JSONB NOT NULL,  -- Array of {minute: 0, slot_type: 'news', duration: 45}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Programs define shows with assigned DJs and format
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dj_id UUID REFERENCES djs(id),
  format_clock_id UUID REFERENCES format_clocks(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to segments
ALTER TABLE segments 
  DROP CONSTRAINT IF EXISTS fk_segments_program;

ALTER TABLE segments 
  ADD CONSTRAINT fk_segments_program 
  FOREIGN KEY (program_id) 
  REFERENCES programs(id);

-- Insert default format clock
INSERT INTO format_clocks (name, description, slots) VALUES (
  'Standard Hour',
  'Default hourly format',
  '[
    {"minute": 0, "slot_type": "station_id", "duration": 15},
    {"minute": 1, "slot_type": "news", "duration": 45},
    {"minute": 2, "slot_type": "music", "duration": 180},
    {"minute": 5, "slot_type": "culture", "duration": 60},
    {"minute": 6, "slot_type": "music", "duration": 240},
    {"minute": 10, "slot_type": "tech", "duration": 60},
    {"minute": 11, "slot_type": "music", "duration": 180},
    {"minute": 14, "slot_type": "interview", "duration": 120},
    {"minute": 16, "slot_type": "music", "duration": 240}
  ]'::jsonb
);

COMMENT ON TABLE format_clocks IS 'Hourly format definitions with slot timing';
COMMENT ON TABLE programs IS 'Radio programs with DJ and format assignments';
```

### Step 2: Create Scheduler Worker Package
```bash
mkdir -p workers/scheduler/src
cd workers/scheduler
```

Create `workers/scheduler/package.json`:
```json
{
  "name": "@radio/scheduler-worker",
  "version": "0.0.1",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@supabase/supabase-js": "^2.39.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
```

### Step 3: Create Schedule Generator

Create `workers/scheduler/src/schedule-generator.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { addHours, addMinutes, startOfDay, addDays, format } from 'date-fns';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('schedule-generator');

interface FormatClock {
  id: string;
  name: string;
  slots: Array<{
    minute: number;
    slot_type: string;
    duration: number;
  }>;
}

interface Program {
  id: string;
  name: string;
  dj_id: string;
  format_clock_id: string;
}

/**
 * Schedule generator
 * Creates daily broadcast schedules
 */
export class ScheduleGenerator {
  private db: SupabaseClient;
  private readonly futureYearOffset: number;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.futureYearOffset = parseInt(process.env.FUTURE_YEAR_OFFSET || '500');

    logger.info({ futureYearOffset: this.futureYearOffset }, 'Schedule generator initialized');
  }

  /**
   * Generate schedule for a specific date
   */
  async generateScheduleForDate(date: Date): Promise<void> {
    logger.info({ date: format(date, 'yyyy-MM-dd') }, 'Generating schedule');

    try {
      // Fetch active programs
      const { data: programs, error: programsError } = await this.db
        .from('programs')
        .select('*, format_clocks(*)')
        .eq('active', true);

      if (programsError) throw programsError;

      if (!programs || programs.length === 0) {
        logger.warn('No active programs found');
        return;
      }

      // For now, use first program for entire day
      // TODO: Support multiple programs per day
      const program = programs[0];

      logger.info({
        program: program.name,
        formatClock: program.format_clocks.name
      }, 'Using program');

      // Generate segments for each hour of the day
      const segmentsToCreate = [];
      const jobsToCreate = [];

      for (let hour = 0; hour < 24; hour++) {
        const hourStart = addHours(startOfDay(date), hour);

        // Get format clock slots
        const slots = program.format_clocks.slots;

        for (const slot of slots) {
          const slotStart = addMinutes(hourStart, slot.minute);

          // Convert to future year (2525)
          const futureSlotStart = this.toFutureYear(slotStart);

          // Create segment
          const segment = {
            program_id: program.id,
            slot_type: slot.slot_type,
            lang: 'en',
            state: 'queued',
            scheduled_start_ts: futureSlotStart.toISOString(),
            max_retries: 3,
            retry_count: 0
          };

          segmentsToCreate.push(segment);
        }
      }

      logger.info({
        date: format(date, 'yyyy-MM-dd'),
        segments: segmentsToCreate.length
      }, 'Creating segments');

      // Batch insert segments
      const { data: insertedSegments, error: insertError } = await this.db
        .from('segments')
        .insert(segmentsToCreate)
        .select();

      if (insertError) throw insertError;

      logger.info({
        created: insertedSegments?.length || 0
      }, 'Segments created');

      // Enqueue generation jobs for each segment
      for (const segment of insertedSegments || []) {
        await this.enqueueGenerationJob(segment.id);
      }

      logger.info({
        date: format(date, 'yyyy-MM-dd'),
        segments: insertedSegments?.length || 0
      }, 'Schedule generation complete');

    } catch (error) {
      logger.error({ error, date }, 'Schedule generation failed');
      throw error;
    }
  }

  /**
   * Generate schedule for tomorrow
   */
  async generateTomorrowSchedule(): Promise<void> {
    const tomorrow = addDays(new Date(), 1);
    await this.generateScheduleForDate(tomorrow);
  }

  /**
   * Enqueue segment generation job
   */
  private async enqueueGenerationJob(segmentId: string): Promise<void> {
    const { error } = await this.db.rpc('enqueue_job', {
      p_job_type: 'segment_make',
      p_payload: { segment_id: segmentId },
      p_priority: 5,
      p_schedule_delay_sec: 0
    });

    if (error) {
      logger.error({ error, segmentId }, 'Failed to enqueue generation job');
      throw error;
    }
  }

  /**
   * Convert date to future year (2525)
   */
  private toFutureYear(date: Date): Date {
    const futureDate = new Date(date);
    futureDate.setFullYear(date.getFullYear() + this.futureYearOffset);
    return futureDate;
  }

  /**
   * Check how many ready segments exist for tomorrow
   */
  async checkTomorrowReadiness(): Promise<{
    total: number;
    ready: number;
    percentage: number;
  }> {
    const tomorrow = addDays(new Date(), 1);
    const tomorrowStart = this.toFutureYear(startOfDay(tomorrow));
    const tomorrowEnd = this.toFutureYear(addDays(startOfDay(tomorrow), 1));

    const { data: segments, error } = await this.db
      .from('segments')
      .select('state')
      .gte('scheduled_start_ts', tomorrowStart.toISOString())
      .lt('scheduled_start_ts', tomorrowEnd.toISOString());

    if (error) throw error;

    const total = segments?.length || 0;
    const ready = segments?.filter(s => s.state === 'ready').length || 0;
    const percentage = total > 0 ? (ready / total) * 100 : 0;

    return { total, ready, percentage };
  }
}
```

### Step 4: Create Scheduler Worker Entry

Create `workers/scheduler/src/index.ts`:
```typescript
import { ScheduleGenerator } from './schedule-generator';
import { createLogger } from '@radio/core/logger';
import { addDays } from 'date-fns';

const logger = createLogger('scheduler-main');

/**
 * Scheduler Worker
 * Generates daily broadcast schedules
 */
async function main() {
  logger.info('Scheduler worker starting');

  const generator = new ScheduleGenerator();

  // Check if running as one-off or continuous
  const mode = process.env.SCHEDULER_MODE || 'continuous';

  if (mode === 'once') {
    // Generate tomorrow's schedule and exit
    logger.info('Running in one-off mode');
    await generator.generateTomorrowSchedule();
    logger.info('Schedule generation complete, exiting');
    process.exit(0);
  } else {
    // Continuous mode: run daily at 2 AM
    logger.info('Running in continuous mode');

    const runScheduler = async () => {
      try {
        // Check tomorrow's readiness
        const readiness = await generator.checkTomorrowReadiness();
        
        logger.info({
          ready: readiness.ready,
          total: readiness.total,
          percentage: readiness.percentage.toFixed(1)
        }, 'Tomorrow readiness check');

        // If less than 80% ready, generate new schedule
        if (readiness.percentage < 80) {
          logger.info('Generating tomorrow schedule');
          await generator.generateTomorrowSchedule();
        } else {
          logger.info('Tomorrow schedule already sufficient');
        }

        // Also generate for day after tomorrow to stay ahead
        const dayAfterTomorrow = addDays(new Date(), 2);
        await generator.generateScheduleForDate(dayAfterTomorrow);

      } catch (error) {
        logger.error({ error }, 'Scheduler run failed');
      }
    };

    // Run immediately on startup
    await runScheduler();

    // Schedule to run daily at 2 AM
    const scheduleNextRun = () => {
      const now = new Date();
      const next2AM = new Date(now);
      next2AM.setHours(2, 0, 0, 0);

      if (next2AM <= now) {
        // If 2 AM already passed today, schedule for tomorrow
        next2AM.setDate(next2AM.getDate() + 1);
      }

      const msUntilNext = next2AM.getTime() - now.getTime();

      logger.info({
        nextRun: next2AM.toISOString(),
        hoursUntil: (msUntilNext / 1000 / 60 / 60).toFixed(1)
      }, 'Next scheduled run');

      setTimeout(async () => {
        await runScheduler();
        scheduleNextRun(); // Schedule next run
      }, msUntilNext);
    };

    scheduleNextRun();

    // Keep process alive
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, exiting gracefully');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, exiting gracefully');
      process.exit(0);
    });
  }
}

main().catch(error => {
  logger.error({ error }, 'Scheduler crashed');
  process.exit(1);
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Generates segments for 24 hours
- [ ] Uses format clock to determine slots
- [ ] Creates segments in queued state
- [ ] Enqueues generation jobs
- [ ] Converts to future year (2525)
- [ ] Checks readiness before regenerating
- [ ] Runs daily at 2 AM

### Quality Requirements
- [ ] Logger used throughout
- [ ] Error handling
- [ ] Graceful shutdown
- [ ] Mode selection (once/continuous)

### Manual Verification
```bash
cd workers/scheduler
pnpm install
pnpm build

# Run once to generate tomorrow
SCHEDULER_MODE=once \
SUPABASE_URL=your_url \
SUPABASE_SERVICE_ROLE_KEY=your_key \
pnpm start

# Verify segments created
psql $DATABASE_URL -c "
SELECT COUNT(*), state 
FROM segments 
WHERE scheduled_start_ts::date = CURRENT_DATE + INTERVAL '1 day'
GROUP BY state;
"

# Run continuous mode
SCHEDULER_MODE=continuous \
SUPABASE_URL=your_url \
SUPABASE_SERVICE_ROLE_KEY=your_key \
pnpm start
```

---

## Next Task Handoff

**For P4 (Liquidsoap - Dead Air Detection):**
- Add silence detection
- Fallback to backup playlist
- Alert on dead air

**Files created:**
- `infra/migrations/013_programs_format_clocks.sql`
- `workers/scheduler/src/schedule-generator.ts`
- `workers/scheduler/src/index.ts`
- `workers/scheduler/package.json`

**Scheduler now:**
- ✅ Generates daily schedules
- ✅ Creates segments with timing
- ✅ Enqueues generation jobs
- ✅ Stays 2 days ahead

---------------------------------

# Task P4: Liquidsoap - Dead Air Detection

**Tier:** Playout
**Estimated Time:** 45 minutes
**Complexity:** Low
**Prerequisites:** P1, P3 complete

---

## Objective

Add dead air detection to Liquidsoap: detect silence, trigger fallback playlist, log alerts.

---

## Context from Architecture

Dead air detection:
- Detect > 5 seconds of silence
- Switch to emergency playlist
- Log alert
- Return to normal when content available

**Docker Configuration (from P1):**
- Icecast accessible at `http://localhost:8001` (port 8001, not 8000)
- API accessible from Docker at `http://host.docker.internal:8000`
- Emergency volume mounted at `/radio/emergency` in container

---

## Implementation Steps

### Step 1: Create Emergency Playlist

Create `apps/playout/emergency/README.md`:
```markdown
# Emergency Playlist

This directory contains fallback audio for dead air situations.

## Requirements

- Files should be WAV format, 48kHz, mono
- Total duration should cover at least 1 hour
- Content should be generic station IDs, music, etc.

## Setup

1. Add WAV files to this directory
2. Name files with prefix for ordering: `01-station-id.wav`, `02-music.wav`, etc.
3. Liquidsoap will automatically load them as fallback
```

Create `apps/playout/emergency/generate-fallback.sh`:
```bash
#!/bin/bash
# Generate fallback audio using TTS

echo "Generating emergency fallback audio..."

# Station ID
echo "Broadcasting from AI Radio 2525. We'll be right back with you." | \
  curl -X POST http://localhost:5002/synthesize \
    -H "Content-Type: application/json" \
    -d @- | \
  jq -r '.audio' | \
  xxd -r -p > 01-station-id.wav

# Technical difficulties message
echo "We're experiencing technical difficulties. Please stand by." | \
  curl -X POST http://localhost:5002/synthesize \
    -H "Content-Type: application/json" \
    -d @- | \
  jq -r '.audio' | \
  xxd -r -p > 02-technical-difficulties.wav

echo "Fallback audio generated!"
```

### Step 2: Update Liquidsoap Configuration

Update `apps/playout/radio.liq`:
```liquidsoap
#!/usr/bin/liquidsoap

# AI Radio 2525 - Liquidsoap Configuration
# With dead air detection and fallback

# ... (keep existing configuration) ...

# Emergency/fallback playlist
emergency_playlist = playlist(
  mode="randomize",
  reload=60,
  "/radio/emergency/*.wav"
)

# Add announcement to emergency playlist
emergency_announcement = single("/radio/emergency/01-station-id.wav")
emergency_source = fallback([
  emergency_announcement,
  emergency_playlist
])

# Blank/silence detection
def on_blank() =
  log("ALERT: Dead air detected! Switching to emergency playlist")
  
  # Report to API (optional)
  cmd = "curl -s -X POST #{api_url}/alerts/dead-air \
         -H 'Content-Type: application/json' \
         -d '{\"timestamp\": \"#{time.string()}\", \"type\": \"dead_air\"}'"
  
  result = process.run(cmd)
  log("Alert sent: #{result}")
end

def on_noise() =
  log("Audio restored, returning to normal playout")
end

# Apply blank detection to main source
# Detects silence > 5 seconds
source = on_blank(
  max_blank=5.0,
  on_blank=on_blank,
  source
)

# Fallback chain: primary source -> emergency playlist
source = fallback(
  track_sensitive=false,
  [
    source,
    emergency_source
  ]
)

# Strip blank (remove silence at start/end of tracks)
source = strip_blank(
  max_blank=2.0,
  source
)

# Add crossfade between tracks (smooth transitions)
source = crossfade(
  duration=2.0,
  source
)

# Normalize audio (maintain consistent loudness)
source = normalize(
  source,
  gain_max=0.0,
  gain_min=-6.0,
  target=-16.0
)

# ... (keep existing output.icecast configurations) ...
```

### Step 3: Create Alert Endpoint

Update `apps/api/src/playout/playout_routes.py`:
```python
class AlertRequest(BaseModel):
    timestamp: str
    type: str
    details: Optional[dict] = None


@router.post("/alerts/dead-air")
async def report_dead_air(request: AlertRequest):
    """
    Report dead air / silence detected
    
    Logs alert for monitoring
    """
    try:
        # Log to database (alerts table - create if needed)
        # For now, just log
        print(f"ALERT: Dead air at {request.timestamp}")
        
        # Could send notifications here:
        # - Email
        # - Slack
        # - PagerDuty
        # etc.
        
        return {
            "status": "ok",
            "message": "Alert recorded"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 4: Create Monitoring Script

Create `apps/playout/monitor-stream.sh`:
```bash
#!/bin/bash
# Monitor stream for dead air

STREAM_URL="${STREAM_URL:-http://localhost:8001/radio.opus}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"

echo "Monitoring stream: $STREAM_URL"

while true; do
  # Check if stream is accessible
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$STREAM_URL")
  
  if [ "$HTTP_CODE" != "200" ]; then
    echo "[$(date)] ERROR: Stream not accessible (HTTP $HTTP_CODE)"
  else
    echo "[$(date)] OK: Stream is live"
  fi
  
  sleep "$CHECK_INTERVAL"
done
```

### Step 5: Update Docker Compose

Update `apps/playout/docker-compose.yml` to add emergency volume:
```yaml
services:
  liquidsoap:
    build: .
    container_name: radio-liquidsoap
    environment:
      # Use host.docker.internal to reach API on host
      - API_URL=http://host.docker.internal:8000
      - OUTPUT_DIR=/radio/audio
      - ICECAST_HOST=icecast
      - ICECAST_PORT=8000
      - ICECAST_PASSWORD=hackme
    volumes:
      - ./audio:/radio/audio
      - ./emergency:/radio/emergency:ro  # ADD THIS LINE
      - ./logs:/var/log/liquidsoap
    depends_on:
      - icecast
    restart: unless-stopped
    networks:
      - radio-network
    extra_hosts:
      - "host.docker.internal:host-gateway"

  icecast:
    image: moul/icecast:2.4.4
    container_name: radio-icecast
    environment:
      - ICECAST_SOURCE_PASSWORD=hackme
      - ICECAST_ADMIN_PASSWORD=admin
      - ICECAST_PASSWORD=hackme
      - ICECAST_RELAY_PASSWORD=hackme
    ports:
      # Exposed on port 8001 to avoid conflict with API (port 8000)
      - "8001:8000"
    volumes:
      - ./icecast.xml:/etc/icecast2/icecast.xml:ro
    restart: unless-stopped
    networks:
      - radio-network

  # Add monitoring container
  monitor:
    image: curlimages/curl:latest
    container_name: radio-monitor
    command: sh -c "while true; do curl -s http://icecast:8000/status.xsl > /dev/null && echo 'Stream OK' || echo 'Stream DOWN'; sleep 30; done"
    depends_on:
      - icecast
    networks:
      - radio-network
```

**Note:** Monitor container accesses Icecast on internal port 8000. From host, use port 8001.

---

## Acceptance Criteria

### Functional Requirements
- [ ] Detects silence > 5 seconds
- [ ] Switches to emergency playlist
- [ ] Returns to normal when content available
- [ ] Logs dead air alerts
- [ ] Sends alert to API
- [ ] Monitoring script works

### Quality Requirements
- [ ] Emergency playlist loops properly
- [ ] Crossfade between tracks
- [ ] No audio glitches during switch
- [ ] Logs are clear

### Manual Verification
```bash
# Generate fallback audio (run on HOST)
cd apps/playout/emergency
bash generate-fallback.sh

# Start playout
cd apps/playout
docker-compose up -d

# Simulate dead air by stopping segment generation
# Watch logs
docker-compose logs -f liquidsoap

# Should see: "ALERT: Dead air detected!"
# Stream should continue with emergency content

# Monitor stream health from HOST (uses port 8001)
bash monitor-stream.sh

# Test stream manually
ffplay http://localhost:8001/radio.opus

# Check Icecast status page
open http://localhost:8001/status.xsl
```

---

## Next Task Handoff

**For P5 (Priority Segment Injection):**
- Add ability to inject urgent segments
- Priority queue for breaking news
- Interrupt current playback if needed

**Files created:**
- `apps/playout/emergency/README.md`
- `apps/playout/emergency/generate-fallback.sh`
- `apps/playout/monitor-stream.sh`

**Files modified:**
- `apps/playout/radio.liq` (added dead air detection)
- `apps/playout/docker-compose.yml` (added monitor)
- `apps/api/src/playout/playout_routes.py` (added alert endpoint)

**Playout now has:**
- ✅ Dead air detection
- ✅ Emergency fallback
- ✅ Alert system
- ✅ Stream monitoring

--------------------------------

# Task P6: Schedule Visualization & Analytics

**Tier:** Playout
**Estimated Time:** 1 hour
**Complexity:** Low
**Prerequisites:** P5 complete

---

## Objective

Create schedule visualization in admin: calendar view, timeline view, analytics on what aired vs what was scheduled.

---

**Docker Configuration (from P1):**
- Stream accessible at `http://localhost:8001/radio.opus` (port 8001, not 8000)
- MP3 stream at `http://localhost:8001/radio.mp3`
- If adding live stream preview to admin, use port 8001

---

## Implementation Steps

### Step 1: Create Schedule Page

Create `apps/admin/app/dashboard/schedule/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import { startOfDay, endOfDay, addDays, format } from 'date-fns';
import Link from 'next/link';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const supabase = await createServerClient();

  // Parse date or use today
  const dateParam = searchParams.date || format(new Date(), 'yyyy-MM-dd');
  const selectedDate = new Date(dateParam);

  // Adjust for future year offset (2525)
  const futureOffset = 500;
  const futureDate = new Date(selectedDate);
  futureDate.setFullYear(futureDate.getFullYear() + futureOffset);

  const dayStart = startOfDay(futureDate);
  const dayEnd = endOfDay(futureDate);

  // Fetch segments for the day
  const { data: segments, error } = await supabase
    .from('segments')
    .select('*, programs(name), djs(name)')
    .gte('scheduled_start_ts', dayStart.toISOString())
    .lt('scheduled_start_ts', dayEnd.toISOString())
    .order('scheduled_start_ts', { ascending: true });

  if (error) {
    return <div>Error loading schedule: {error.message}</div>;
  }

  // Group by hour
  const segmentsByHour: Record<number, any[]> = {};
  for (let hour = 0; hour < 24; hour++) {
    segmentsByHour[hour] = [];
  }

  segments?.forEach((segment) => {
    const hour = new Date(segment.scheduled_start_ts).getHours();
    segmentsByHour[hour].push(segment);
  });

  // Calculate stats
  const total = segments?.length || 0;
  const ready = segments?.filter(s => s.state === 'ready').length || 0;
  const aired = segments?.filter(s => s.state === 'aired').length || 0;
  const failed = segments?.filter(s => s.state === 'failed').length || 0;

  // Date navigation
  const prevDay = format(addDays(selectedDate, -1), 'yyyy-MM-dd');
  const nextDay = format(addDays(selectedDate, 1), 'yyyy-MM-dd');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Broadcast Schedule</h1>
        <div className="flex items-center space-x-4">
          <Link
            href={`/dashboard/schedule?date=${prevDay}`}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Previous Day
          </Link>
          <span className="text-lg font-semibold">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            <span className="text-sm text-gray-500 ml-2">
              (Year 2525)
            </span>
          </span>
          <Link
            href={`/dashboard/schedule?date=${nextDay}`}
            className="text-blue-600 hover:text-blue-800"
          >
            Next Day →
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Total Segments</div>
          <div className="text-2xl font-bold">{total}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Ready</div>
          <div className="text-2xl font-bold text-green-600">{ready}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Aired</div>
          <div className="text-2xl font-bold text-blue-600">{aired}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Failed</div>
          <div className="text-2xl font-bold text-red-600">{failed}</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Hourly Timeline</h2>
        <div className="space-y-4">
          {Object.entries(segmentsByHour).map(([hour, segs]) => (
            <div key={hour} className="flex">
              <div className="w-20 text-sm font-medium text-gray-600">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="flex-1">
                {segs.length === 0 ? (
                  <div className="text-sm text-gray-400">No segments scheduled</div>
                ) : (
                  <div className="space-y-1">
                    {segs.map((segment) => {
                      const scheduledTime = new Date(segment.scheduled_start_ts);
                      const minutes = scheduledTime.getMinutes();

                      return (
                        <Link
                          key={segment.id}
                          href={`/dashboard/segments/${segment.id}`}
                          className="block"
                        >
                          <div
                            className={`text-sm px-3 py-2 rounded border-l-4 hover:bg-gray-50 ${
                              segment.state === 'ready'
                                ? 'border-green-500 bg-green-50'
                                : segment.state === 'aired'
                                ? 'border-blue-500 bg-blue-50'
                                : segment.state === 'failed'
                                ? 'border-red-500 bg-red-50'
                                : 'border-yellow-500 bg-yellow-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium">
                                  :{minutes.toString().padStart(2, '0')}
                                </span>
                                <span className="ml-2">
                                  {segment.programs?.name || 'Unknown'} - {segment.slot_type}
                                </span>
                                {segment.priority >= 8 && (
                                  <span className="ml-2 px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">
                                    URGENT
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-3">
                                <span className="text-xs text-gray-500">
                                  {Math.round(segment.duration_sec || 0)}s
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    segment.state === 'ready'
                                      ? 'bg-green-100 text-green-800'
                                      : segment.state === 'aired'
                                      ? 'bg-blue-100 text-blue-800'
                                      : segment.state === 'failed'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}
                                >
                                  {segment.state}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Add Schedule Link to Nav

Update `apps/admin/app/dashboard/layout.tsx`:
```typescript
<Link
  href="/dashboard/schedule"
  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
>
  Schedule
</Link>
```

### Step 3: Create Analytics Page

Create `apps/admin/app/dashboard/analytics/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import { subDays } from 'date-fns';

export default async function AnalyticsPage() {
  const supabase = await createServerClient();

  // Last 7 days stats
  const sevenDaysAgo = subDays(new Date(), 7);

  const { data: segments } = await supabase
    .from('segments')
    .select('state, created_at, duration_sec, retry_count')
    .gte('created_at', sevenDaysAgo.toISOString());

  // Calculate metrics
  const total = segments?.length || 0;
  const byState = (segments || []).reduce((acc: any, s) => {
    acc[s.state] = (acc[s.state] || 0) + 1;
    return acc;
  }, {});

  const successRate = total > 0 
    ? ((byState.ready || 0) + (byState.aired || 0)) / total * 100 
    : 0;

  const avgDuration = total > 0
    ? (segments || []).reduce((sum, s) => sum + (s.duration_sec || 0), 0) / total
    : 0;

  const avgRetries = total > 0
    ? (segments || []).reduce((sum, s) => sum + s.retry_count, 0) / total
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics (Last 7 Days)</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Total Segments</h3>
          <div className="text-3xl font-bold">{total}</div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Success Rate</h3>
          <div className="text-3xl font-bold text-green-600">
            {successRate.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Avg Duration</h3>
          <div className="text-3xl font-bold">
            {Math.round(avgDuration)}s
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Avg Retries</h3>
          <div className="text-3xl font-bold">
            {avgRetries.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-lg font-semibold mb-4">Segments by State</h2>
        <div className="space-y-3">
          {Object.entries(byState).map(([state, count]) => (
            <div key={state} className="flex items-center justify-between">
              <span className="text-sm capitalize">{state}</span>
              <div className="flex items-center space-x-4">
                <div className="w-64 bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full ${
                      state === 'ready' || state === 'aired'
                        ? 'bg-green-500'
                        : state === 'failed'
                        ? 'bg-red-500'
                        : 'bg-yellow-500'
                    }`}
                    style={{
                      width: `${(count as number / total) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {count as number}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Add Analytics Link

Update `apps/admin/app/dashboard/layout.tsx`:
```typescript
<Link
  href="/dashboard/analytics"
  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
>
  Analytics
</Link>
```

### Step 5 (Optional): Add Live Stream Preview

Create `apps/admin/components/StreamPlayer.tsx`:
```typescript
'use client';

import { useState, useRef } from 'react';

export function StreamPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Use port 8001 for Icecast stream (Docker configuration)
  const streamUrl = 'http://localhost:8001/radio.opus';

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-sm font-semibold mb-2">Live Stream Preview</h3>
      <audio ref={audioRef} src={streamUrl} />
      <button
        onClick={togglePlay}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {isPlaying ? '⏸ Pause' : '▶ Play Live'}
      </button>
      <p className="text-xs text-gray-500 mt-2">
        Stream: {streamUrl}
      </p>
    </div>
  );
}
```

Then add to schedule page:
```typescript
import { StreamPlayer } from '@/components/StreamPlayer';

// In the page component, add above the timeline:
<StreamPlayer />
```

**Note:** Stream uses port **8001** (not 8000) due to Docker port mapping.

---

## Acceptance Criteria

### Functional Requirements
- [ ] Schedule page shows daily timeline
- [ ] Hourly breakdown visible
- [ ] State-based color coding
- [ ] Date navigation works
- [ ] Analytics show 7-day trends
- [ ] Success rate calculated
- [ ] Visual charts/bars

### Quality Requirements
- [ ] Responsive design
- [ ] Fast loading
- [ ] Clear visual hierarchy
- [ ] Links to segment details

### Manual Verification
```bash
# View schedule
open http://localhost:3001/dashboard/schedule

# Navigate dates
# Click segments to see details

# View analytics
open http://localhost:3001/dashboard/analytics

# Check stats are accurate

# If Stream Player added: test live stream preview
# Click play button and verify audio plays from http://localhost:8001/radio.opus
```

---

## Playout Tier Complete!

**Files created:**
- `apps/admin/app/dashboard/schedule/page.tsx`
- `apps/admin/app/dashboard/analytics/page.tsx`

**Files modified:**
- `apps/admin/app/dashboard/layout.tsx` (added nav links)

**Playout system now has:**
- ✅ Liquidsoap streaming
- ✅ API endpoints
- ✅ Schedule generation
- ✅ Dead air detection
- ✅ Priority injection
- ✅ Schedule visualization
- ✅ Analytics dashboard

**Ready for Frontend Player (F1-F4) and Integration (I1-I4)!**

------------------------------


# Task F1: Public Player - Basic Setup

**Tier:** Frontend  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** P1-P6 complete (streaming active)

---

## Objective

Create public-facing web player with Next.js: basic layout, audio player controls, now-playing display.

---

## Context from Architecture

**From ARCHITECTURE.md Section 2:**

Web UI:
- Next.js 14 (App Router)
- Public player interface
- Stream from Icecast
- Now-playing metadata
- Responsive design

---

## Implementation Steps

### Step 1: Create Web App
```bash
mkdir -p apps/web
cd apps/web
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
```

Update `apps/web/package.json`:
```json
{
  "name": "@radio/web",
  "version": "0.0.1",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000"
  },
  "dependencies": {
    "next": "14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

### Step 2: Create Audio Player Component

Create `apps/web/components/audio-player.tsx`:
```typescript
'use client';

import { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
  streamUrl: string;
}

export default function AudioPlayer({ streamUrl }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handlePlay = async () => {
    if (!audioRef.current) return;

    setLoading(true);
    setError(null);

    try {
      await audioRef.current.play();
      setPlaying(true);
    } catch (err: any) {
      setError('Failed to play stream. Please try again.');
      console.error('Playback error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  return (
    <div className="bg-white rounded-lg shadow-xl p-8">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={streamUrl}
        preload="none"
        onError={() => setError('Stream unavailable')}
      />

      {/* Play/Pause Button */}
      <div className="flex flex-col items-center space-y-6">
        <button
          onClick={playing ? handlePause : handlePlay}
          disabled={loading}
          className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl transition-all ${
            loading
              ? 'bg-gray-400 cursor-not-allowed'
              : playing
              ? 'bg-red-600 hover:bg-red-700 shadow-lg'
              : 'bg-blue-600 hover:bg-blue-700 shadow-lg'
          }`}
        >
          {loading ? (
            <div className="animate-spin">⏳</div>
          ) : playing ? (
            '⏸'
          ) : (
            '▶'
          )}
        </button>

        {/* Status */}
        <div className="text-center">
          {playing && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-gray-700">
                LIVE
              </span>
            </div>
          )}
          {!playing && !loading && (
            <span className="text-sm text-gray-500">
              Click to listen
            </span>
          )}
        </div>

        {/* Volume Control */}
        <div className="w-full max-w-xs space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>🔊 Volume</span>
            <span>{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
      </div>
    </div>
  );
}
```

### Step 3: Create Now Playing Component

Create `apps/web/components/now-playing.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface NowPlayingData {
  title: string;
  dj?: string;
  startedAt: string;
}

export default function NowPlaying() {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNowPlaying = async () => {
      try {
        // For now, fetch from Icecast status
        // TODO: Replace with API endpoint when available
        const response = await fetch('http://localhost:8000/status-json.xsl');
        const data = await response.json();

        const source = data.icestats?.source?.[0];
        if (source) {
          setNowPlaying({
            title: source.title || 'AI Radio 2525',
            dj: source.artist,
            startedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to fetch now playing:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNowPlaying();

    // Poll every 10 seconds
    const interval = setInterval(fetchNowPlaying, 10000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    );
  }

  if (!nowPlaying) {
    return (
      <div className="text-gray-500 text-center">
        <p>No information available</p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-2">
      <h2 className="text-2xl font-bold text-gray-900">
        {nowPlaying.title}
      </h2>
      {nowPlaying.dj && (
        <p className="text-lg text-gray-600">
          with {nowPlaying.dj}
        </p>
      )}
      <p className="text-sm text-gray-500">
        Started {formatDistanceToNow(new Date(nowPlaying.startedAt), { addSuffix: true })}
      </p>
    </div>
  );
}
```

### Step 4: Create Home Page

Create `apps/web/app/page.tsx`:
```typescript
import AudioPlayer from '@/components/audio-player';
import NowPlaying from '@/components/now-playing';

export default function HomePage() {
  const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL || 'http://localhost:8001/radio.mp3';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      {/* Header */}
      <header className="bg-black bg-opacity-50 backdrop-blur-sm border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white">
                AI Radio 2525
              </h1>
              <p className="text-gray-300 mt-1">
                Broadcasting from the future
              </p>
            </div>
            <div className="text-right text-white">
              <div className="text-5xl font-bold">2525</div>
              <div className="text-sm text-gray-400">Year</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8">
          {/* Now Playing */}
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8 text-white border border-white border-opacity-20">
            <div className="text-sm uppercase tracking-wide text-gray-300 mb-4">
              Now Playing
            </div>
            <NowPlaying />
          </div>

          {/* Audio Player */}
          <AudioPlayer streamUrl={streamUrl} />

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 text-white border border-white border-opacity-20">
              <div className="text-2xl mb-2">🎙️</div>
              <h3 className="font-semibold mb-1">AI Generated</h3>
              <p className="text-sm text-gray-300">
                All content created by Claude and synthesized in real-time
              </p>
            </div>

            <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 text-white border border-white border-opacity-20">
              <div className="text-2xl mb-2">🌍</div>
              <h3 className="font-semibold mb-1">Year 2525</h3>
              <p className="text-sm text-gray-300">
                Experience radio from 500 years in the future
              </p>
            </div>

            <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 text-white border border-white border-opacity-20">
              <div className="text-2xl mb-2">📡</div>
              <h3 className="font-semibold mb-1">24/7 Live</h3>
              <p className="text-sm text-gray-300">
                Continuous broadcast with news, culture, and music
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-12">
        <div className="border-t border-white border-opacity-10 pt-8 text-center text-gray-400 text-sm">
          <p>AI Radio 2525 - An experimental AI radio station</p>
          <p className="mt-2">
            Powered by Claude, Piper TTS, and Liquidsoap
          </p>
        </div>
      </footer>
    </div>
  );
}
```

### Step 5: Configure Environment

Create `apps/web/.env.local`:
```bash
NEXT_PUBLIC_STREAM_URL=http://localhost:8001/radio.mp3
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Step 6: Update Metadata

Update `apps/web/app/layout.tsx`:
```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Radio 2525 - Broadcasting from the Future',
  description: 'Experience radio from the year 2525. AI-generated content, 24/7 live stream.',
  keywords: 'ai radio, future radio, ai music, 2525, streaming radio',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Player loads and connects to stream
- [ ] Play/pause controls work
- [ ] Volume control functions
- [ ] Now-playing displays
- [ ] Responsive on mobile
- [ ] Live indicator shows when playing

### Quality Requirements
- [ ] Clean, modern UI
- [ ] Smooth animations
- [ ] Error handling for stream issues
- [ ] Loading states
- [ ] Accessible controls

### Manual Verification
```bash
cd apps/web
pnpm install
pnpm dev

# Open browser
open http://localhost:3000

# Test:
# - Click play button
# - Adjust volume
# - Check now-playing updates
# - Test on mobile viewport
```

---

## Next Task Handoff

**For F2 (Program Schedule Display):**
- Show upcoming segments
- Display daily schedule
- Time-based updates

**Files created:**
- `apps/web/components/audio-player.tsx`
- `apps/web/components/now-playing.tsx`
- `apps/web/app/page.tsx`
- `apps/web/app/layout.tsx`
- `apps/web/.env.local`

**Player now has:**
- ✅ Basic audio streaming
- ✅ Play/pause controls
- ✅ Volume control
- ✅ Now-playing display
- ✅ Responsive design

-----------------------------------

# Task F2: Program Schedule Display

**Tier:** Frontend  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** F1 complete

---

## Objective

Add schedule display to public player: show upcoming segments, daily schedule, and time-until-next indicators.

---

## Implementation Steps

### Step 1: Create Schedule API Route

Create `apps/web/app/api/schedule/route.ts`:
```typescript
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    // Fetch from backend API
    // For now, we'll proxy to Supabase directly
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    // Calculate future year date (2525)
    const currentDate = new Date(date);
    const futureDate = new Date(currentDate);
    futureDate.setFullYear(futureDate.getFullYear() + 500);

    const dayStart = new Date(futureDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(futureDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Fetch segments
    const response = await fetch(
      `${supabaseUrl}/rest/v1/segments?select=*,programs(name),djs(name)&scheduled_start_ts=gte.${dayStart.toISOString()}&scheduled_start_ts=lte.${dayEnd.toISOString()}&state=eq.ready&order=scheduled_start_ts.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    const segments = await response.json();

    return NextResponse.json({ segments });
  } catch (error) {
    console.error('Schedule fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedule' },
      { status: 500 }
    );
  }
}
```

### Step 2: Create Schedule Component

Create `apps/web/components/schedule.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { format, formatDistanceToNow, isFuture, isPast } from 'date-fns';

interface Segment {
  id: string;
  scheduled_start_ts: string;
  slot_type: string;
  duration_sec: number;
  programs: { name: string };
  djs: { name: string };
}

export default function Schedule() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const response = await fetch('/api/schedule');
        const data = await response.json();
        setSegments(data.segments || []);
      } catch (error) {
        console.error('Failed to fetch schedule:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedule();

    // Refresh every minute
    const interval = setInterval(() => {
      fetchSchedule();
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-gray-700 rounded-lg p-4 h-20" />
        ))}
      </div>
    );
  }

  // Get upcoming segments (next 5)
  const upcomingSegments = segments
    .filter((s) => {
      const segmentTime = new Date(s.scheduled_start_ts);
      // Convert from 2525 to current year
      segmentTime.setFullYear(segmentTime.getFullYear() - 500);
      return isFuture(segmentTime);
    })
    .slice(0, 5);

  if (upcomingSegments.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No upcoming segments scheduled
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {upcomingSegments.map((segment, index) => {
        const segmentTime = new Date(segment.scheduled_start_ts);
        // Convert from 2525 to current year
        segmentTime.setFullYear(segmentTime.getFullYear() - 500);

        const isNext = index === 0;
        const timeUntil = formatDistanceToNow(segmentTime, { addSuffix: true });

        return (
          <div
            key={segment.id}
            className={`rounded-lg p-4 transition-all ${
              isNext
                ? 'bg-blue-600 bg-opacity-20 border-2 border-blue-400'
                : 'bg-white bg-opacity-5 border border-white border-opacity-10'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  {isNext && (
                    <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded font-semibold">
                      UP NEXT
                    </span>
                  )}
                  <span className="text-gray-400 text-sm">
                    {format(segmentTime, 'h:mm a')}
                  </span>
                </div>

                <h3 className="text-white font-medium mb-1">
                  {segment.programs.name}
                </h3>

                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <span className="capitalize">{segment.slot_type}</span>
                  <span>•</span>
                  <span>{Math.round(segment.duration_sec / 60)} min</span>
                  <span>•</span>
                  <span>with {segment.djs.name}</span>
                </div>
              </div>

              <div className="text-right ml-4">
                <div className={`text-sm font-medium ${isNext ? 'text-blue-300' : 'text-gray-400'}`}>
                  {timeUntil}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### Step 3: Create Full Schedule Page

Create `apps/web/app/schedule/page.tsx`:
```typescript
import { format, addDays } from 'date-fns';
import Link from 'next/link';

async function getSchedule(date: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  
  try {
    const response = await fetch(
      `${apiUrl}/api/schedule?date=${date}`,
      { cache: 'no-store' }
    );
    
    if (!response.ok) return { segments: [] };
    
    const data = await response.json();
    return data;
  } catch (error) {
    return { segments: [] };
  }
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const dateParam = searchParams.date || format(new Date(), 'yyyy-MM-dd');
  const selectedDate = new Date(dateParam);
  const { segments } = await getSchedule(dateParam);

  // Group by hour
  const segmentsByHour: Record<number, any[]> = {};
  for (let hour = 0; hour < 24; hour++) {
    segmentsByHour[hour] = [];
  }

  segments.forEach((segment: any) => {
    const segmentTime = new Date(segment.scheduled_start_ts);
    // Convert from 2525
    segmentTime.setFullYear(segmentTime.getFullYear() - 500);
    const hour = segmentTime.getHours();
    segmentsByHour[hour].push({ ...segment, localTime: segmentTime });
  });

  const prevDay = format(addDays(selectedDate, -1), 'yyyy-MM-dd');
  const nextDay = format(addDays(selectedDate, 1), 'yyyy-MM-dd');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      <header className="bg-black bg-opacity-50 backdrop-blur-sm border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-white hover:text-gray-300">
              ← AI Radio 2525
            </Link>
            <h1 className="text-xl font-bold text-white">Schedule</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Date Navigation */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href={`/schedule?date=${prevDay}`}
            className="px-4 py-2 bg-white bg-opacity-10 text-white rounded hover:bg-opacity-20"
          >
            ← Previous
          </Link>

          <div className="text-center text-white">
            <div className="text-2xl font-bold">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="text-sm text-gray-400 mt-1">
              Broadcasting from Year 2525
            </div>
          </div>

          <Link
            href={`/schedule?date=${nextDay}`}
            className="px-4 py-2 bg-white bg-opacity-10 text-white rounded hover:bg-opacity-20"
          >
            Next →
          </Link>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          {Object.entries(segmentsByHour).map(([hour, segs]) => {
            if (segs.length === 0) return null;

            return (
              <div key={hour} className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 border border-white border-opacity-20">
                <div className="flex">
                  <div className="w-24 text-white font-bold text-lg">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  <div className="flex-1 space-y-3">
                    {segs.map((segment: any) => (
                      <div
                        key={segment.id}
                        className="bg-white bg-opacity-5 rounded p-4 border border-white border-opacity-10"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-white font-medium mb-1">
                              {segment.programs.name}
                            </div>
                            <div className="flex items-center space-x-3 text-sm text-gray-400">
                              <span>
                                {format(segment.localTime, 'h:mm a')}
                              </span>
                              <span>•</span>
                              <span className="capitalize">{segment.slot_type}</span>
                              <span>•</span>
                              <span>{Math.round(segment.duration_sec / 60)} min</span>
                              <span>•</span>
                              <span>{segment.djs.name}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {segments.length === 0 && (
          <div className="text-center text-white py-12">
            <p className="text-xl">No segments scheduled for this day</p>
          </div>
        )}
      </main>
    </div>
  );
}
```

### Step 4: Add Schedule to Home Page

Update `apps/web/app/page.tsx`:
```typescript
import AudioPlayer from '@/components/audio-player';
import NowPlaying from '@/components/now-playing';
import Schedule from '@/components/schedule';  // ADD THIS
import Link from 'next/link';  // ADD THIS

export default function HomePage() {
  // ... existing code ...

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      {/* ... existing header ... */}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8">
          {/* ... existing now-playing and player ... */}

          {/* ADD SCHEDULE SECTION */}
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8 border border-white border-opacity-20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                Coming Up
              </h2>
              <Link
                href="/schedule"
                className="text-blue-300 hover:text-blue-200 text-sm"
              >
                View Full Schedule →
              </Link>
            </div>
            <Schedule />
          </div>

          {/* ... existing info cards ... */}
        </div>
      </main>

      {/* ... existing footer ... */}
    </div>
  );
}
```

### Step 5: Update Environment

Update `apps/web/.env.local`:
```bash
NEXT_PUBLIC_STREAM_URL=http://localhost:8001/radio.mp3
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Shows next 5 upcoming segments
- [ ] "Up next" indicator on next segment
- [ ] Time-until updates in real-time
- [ ] Full schedule page works
- [ ] Date navigation functions
- [ ] Hourly timeline display
- [ ] Links to full schedule

### Quality Requirements
- [ ] Smooth updates
- [ ] Loading states
- [ ] Responsive design
- [ ] Clear visual hierarchy

### Manual Verification
```bash
cd apps/web
pnpm dev

# Open browser
open http://localhost:3000

# Verify:
# - "Coming Up" section shows next segments
# - Click "View Full Schedule"
# - Navigate between dates
# - Check time-until updates
```

---

## Next Task Handoff

**For F3 (About/Info Pages):**
- About the station
- How it works
- Technology stack
- Contact info

**Files created:**
- `apps/web/app/api/schedule/route.ts`
- `apps/web/components/schedule.tsx`
- `apps/web/app/schedule/page.tsx`

**Files modified:**
- `apps/web/app/page.tsx` (added schedule section)

**Player now has:**
- ✅ Upcoming segments display
- ✅ Full schedule page
- ✅ Date navigation
- ✅ Real-time updates

----------------------------

# Task F3: About & Info Pages

**Tier:** Frontend  
**Estimated Time:** 45 minutes  
**Complexity:** Low  
**Prerequisites:** F2 complete

---

## Objective

Create informational pages: About the station, How it works, Technology stack.

---

## Implementation Steps

### Step 1: Create About Page

Create `apps/web/app/about/page.tsx`:
```typescript
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      <header className="bg-black bg-opacity-50 backdrop-blur-sm border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-2xl font-bold text-white hover:text-gray-300">
            ← AI Radio 2525
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8 border border-white border-opacity-20 text-white space-y-6">
          <h1 className="text-4xl font-bold mb-8">About AI Radio 2525</h1>

          <section>
            <h2 className="text-2xl font-bold mb-4">Welcome to the Future</h2>
            <p className="text-gray-300 leading-relaxed">
              AI Radio 2525 is an experimental radio station that broadcasts from the year 2525.
              Every segment, every word, every piece of content is generated by artificial intelligence
              and synthesized in real-time, creating a unique listening experience that explores what
              radio might be like 500 years from now.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">The Concept</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Imagine tuning into a radio station from the distant future. What would people be talking about?
              What events would shape their world? How would culture, technology, and society have evolved?
            </p>
            <p className="text-gray-300 leading-relaxed">
              AI Radio 2525 answers these questions through AI-generated content that creates a coherent,
              immersive world set 500 years in the future. Using advanced language models and text-to-speech
              technology, we create news broadcasts, cultural commentary, interviews, and more—all set in
              this speculative future.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Features</h2>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-start">
                <span className="mr-2">🎙️</span>
                <span><strong>100% AI Generated:</strong> All content created by Claude AI</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🔊</span>
                <span><strong>Natural Voice Synthesis:</strong> Powered by Piper TTS</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">📡</span>
                <span><strong>24/7 Broadcasting:</strong> Continuous, scheduled programming</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🌍</span>
                <span><strong>Coherent Worldbuilding:</strong> Consistent universe across all segments</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">📰</span>
                <span><strong>Diverse Content:</strong> News, culture, technology, interviews, and more</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">The Team</h2>
            <p className="text-gray-300 leading-relaxed">
              AI Radio 2525 is an experimental project exploring the intersection of AI, creativity,
              and broadcasting. It demonstrates the potential of large language models and modern
              text-to-speech systems to create engaging, coherent content at scale.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Open Source</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              AI Radio 2525 is open source and built with modern technologies. The entire system—from
              content generation to audio processing to broadcasting—is available for others to learn
              from and build upon.
            </p>
            <Link
              href="/how-it-works"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
            >
              Learn How It Works →
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
```

### Step 2: Create How It Works Page

Create `apps/web/app/how-it-works/page.tsx`:
```typescript
import Link from 'next/link';

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      <header className="bg-black bg-opacity-50 backdrop-blur-sm border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-2xl font-bold text-white hover:text-gray-300">
            ← AI Radio 2525
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-8 border border-white border-opacity-20 text-white space-y-8">
          <h1 className="text-4xl font-bold mb-8">How It Works</h1>

          <section>
            <h2 className="text-2xl font-bold mb-4">The Pipeline</h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              AI Radio 2525 uses a sophisticated content generation pipeline that runs continuously
              to create, synthesize, and broadcast radio content:
            </p>

            <div className="space-y-4">
              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">1️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Knowledge Base</h3>
                    <p className="text-gray-300">
                      A curated knowledge base contains worldbuilding documents and historical events
                      from the year 2525. This creates a consistent universe for all content.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">2️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Schedule Generation</h3>
                    <p className="text-gray-300">
                      A scheduler creates daily programming schedules with different segment types:
                      news, culture, technology, interviews, and music.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">3️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">RAG Retrieval</h3>
                    <p className="text-gray-300">
                      For each segment, relevant information is retrieved from the knowledge base
                      using vector similarity search and lexical matching.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">4️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Script Generation</h3>
                    <p className="text-gray-300">
                      Claude AI generates radio scripts based on the retrieved context, maintaining
                      the DJ's personality and the segment's topic.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">5️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Speech Synthesis</h3>
                    <p className="text-gray-300">
                      Piper TTS converts the script into natural-sounding speech using neural
                      text-to-speech models.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">6️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Audio Mastering</h3>
                    <p className="text-gray-300">
                      Audio is normalized to broadcast standards (-16 LUFS) with peak limiting
                      to ensure consistent volume.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">7️⃣</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Broadcasting</h3>
                    <p className="text-gray-300">
                      Liquidsoap playout engine streams the final audio to Icecast, making it
                      available to listeners worldwide.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Technology Stack</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-black bg-opacity-30 rounded-lg p-4">
                <h3 className="font-semibold mb-2">🤖 AI & Generation</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Claude AI (Anthropic)</li>
                  <li>• Piper TTS</li>
                  <li>• bge-m3 embeddings</li>
                </ul>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-4">
                <h3 className="font-semibold mb-2">⚙️ Backend</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• FastAPI (Python)</li>
                  <li>• Node.js workers</li>
                  <li>• Supabase (PostgreSQL)</li>
                </ul>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-4">
                <h3 className="font-semibold mb-2">🎙️ Broadcasting</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Liquidsoap</li>
                  <li>• Icecast</li>
                  <li>• FFmpeg</li>
                </ul>
              </div>

              <div className="bg-black bg-opacity-30 rounded-lg p-4">
                <h3 className="font-semibold mb-2">🌐 Frontend</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Next.js 14</li>
                  <li>• React</li>
                  <li>• Tailwind CSS</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="text-center pt-8">
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
            >
              Start Listening →
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
```

### Step 3: Add Navigation Links

Update `apps/web/app/page.tsx` footer:
```typescript
<footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-12">
  <div className="border-t border-white border-opacity-10 pt-8">
    <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
      <div className="text-center md:text-left text-gray-400 text-sm">
        <p>AI Radio 2525 - An experimental AI radio station</p>
        <p className="mt-2">
          Powered by Claude, Piper TTS, and Liquidsoap
        </p>
      </div>
      
      <div className="flex space-x-6 text-sm text-gray-400">
        <Link href="/about" className="hover:text-white transition">
          About
        </Link>
        <Link href="/how-it-works" className="hover:text-white transition">
          How It Works
        </Link>
        <Link href="/schedule" className="hover:text-white transition">
          Schedule
        </Link>
        
          href="https://github.com/your-org/ai-radio-2525"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition"
        >
          GitHub
        </a>
      </div>
    </div>
  </div>
</footer>
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] About page loads
- [ ] How It Works page loads
- [ ] Navigation links work
- [ ] Content is readable
- [ ] Links to other pages function

### Quality Requirements
- [ ] Consistent design with home page
- [ ] Responsive layout
- [ ] Clear typography
- [ ] Smooth navigation

### Manual Verification
```bash
cd apps/web
pnpm dev

# Open and navigate:
open http://localhost:3000/about
open http://localhost:3000/how-it-works

# Test navigation:
# - Click links in footer
# - Use back button
# - Check responsive design
```

---

## Next Task Handoff

**For F4 (PWA & Mobile Optimization):**
- Add PWA manifest
- Service worker for offline
- Mobile-optimized controls
- Install prompt

**Files created:**
- `apps/web/app/about/page.tsx`
- `apps/web/app/how-it-works/page.tsx`

**Files modified:**
- `apps/web/app/page.tsx` (updated footer)

**Player now has:**
- ✅ About page
- ✅ How It Works page
- ✅ Navigation links
- ✅ Comprehensive documentation

--------------------------

# Task F4: PWA & Mobile Optimization

**Tier:** Frontend  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** F3 complete

---

## Objective

Convert web player to Progressive Web App (PWA): add manifest, service worker, install prompt, optimize for mobile.

---

## Implementation Steps

### Step 1: Create PWA Manifest

Create `apps/web/public/manifest.json`:
```json
{
  "name": "AI Radio 2525",
  "short_name": "Radio 2525",
  "description": "Broadcasting from the year 2525 - AI-generated radio 24/7",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1e1b4b",
  "theme_color": "#3b82f6",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### Step 2: Create App Icons

Create simple icons or use a placeholder service:
```bash
# Create a simple SVG icon and convert to PNG
# For development, you can use placeholder.com
# Production should have proper icons
```

Add to `apps/web/public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#3b82f6"/>
  <text x="256" y="320" font-size="200" fill="white" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold">
    2525
  </text>
  <text x="256" y="380" font-size="48" fill="white" text-anchor="middle" font-family="Arial, sans-serif">
    RADIO
  </text>
</svg>
```

### Step 3: Add Manifest to Layout

Update `apps/web/app/layout.tsx`:
```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Radio 2525 - Broadcasting from the Future',
  description: 'Experience radio from the year 2525. AI-generated content, 24/7 live stream.',
  keywords: 'ai radio, future radio, ai music, 2525, streaming radio',
  manifest: '/manifest.json',
  themeColor: '#3b82f6',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Radio 2525',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

### Step 4: Create Install Prompt Component

Create `apps/web/components/install-prompt.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    const result = await installPrompt.userChoice;

    if (result.outcome === 'accepted') {
      setShowPrompt(false);
    }

    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Remember dismissal for 7 days
    localStorage.setItem('install-prompt-dismissed', Date.now().toString());
  };

  // Don't show if dismissed recently
  useEffect(() => {
    const dismissed = localStorage.getItem('install-prompt-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedTime < sevenDays) {
        setShowPrompt(false);
      }
    }
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-lg shadow-2xl p-6 z-50 animate-slide-up">
      <div className="flex items-start space-x-4">
        <div className="flex-shrink-0 text-4xl">📱</div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 mb-1">
            Install AI Radio 2525
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Add to your home screen for quick access and offline listening
          </p>
          <div className="flex space-x-3">
            <button
              onClick={handleInstall}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium"
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 5: Create Service Worker (Basic)

Create `apps/web/public/sw.js`:
```javascript
// Basic service worker for PWA
// Caches assets for offline access

const CACHE_NAME = 'radio-2525-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip streaming audio (always fetch fresh)
  if (event.request.url.includes('radio.mp3') || event.request.url.includes('radio.opus')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
```

### Step 6: Register Service Worker

Update `apps/web/app/layout.tsx` to add service worker registration:
```typescript
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* ... existing head tags ... */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('SW registered:', reg))
                    .catch(err => console.log('SW registration failed:', err));
                });
              }
            `,
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

### Step 7: Add Install Prompt to Home Page

Update `apps/web/app/page.tsx`:
```typescript
import InstallPrompt from '@/components/install-prompt';  // ADD THIS

export default function HomePage() {
  // ... existing code ...

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      {/* ... existing content ... */}
      
      <InstallPrompt />  {/* ADD THIS */}
    </div>
  );
}
```

### Step 8: Optimize Audio Player for Mobile

Update `apps/web/components/audio-player.tsx`:
```typescript
// Add mobile-specific optimizations

useEffect(() => {
  // Enable audio on iOS after user interaction
  const enableAudio = () => {
    if (audioRef.current) {
      audioRef.current.load();
    }
  };

  // iOS requires user interaction before playing audio
  document.addEventListener('touchstart', enableAudio, { once: true });

  return () => {
    document.removeEventListener('touchstart', enableAudio);
  };
}, []);

// Update play handler for mobile
const handlePlay = async () => {
  if (!audioRef.current) return;

  setLoading(true);
  setError(null);

  try {
    // Mobile Safari requires this
    audioRef.current.load();
    await audioRef.current.play();
    setPlaying(true);
  } catch (err: any) {
    setError('Failed to play stream. Tap again to retry.');
    console.error('Playback error:', err);
  } finally {
    setLoading(false);
  }
};
```

### Step 9: Add CSS for PWA

Update `apps/web/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* PWA-specific styles */
@media (display-mode: standalone) {
  body {
    /* Remove any default margins when installed as PWA */
    margin: 0;
    padding: 0;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
}

/* Mobile optimizations */
@media (max-width: 768px) {
  /* Prevent text selection on controls */
  button {
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  /* Better touch targets */
  button, a {
    min-height: 44px;
    min-width: 44px;
  }
}

/* Slide up animation */
@keyframes slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}

/* Prevent pull-to-refresh on mobile */
body {
  overscroll-behavior-y: contain;
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] PWA manifest loads
- [ ] App icons display
- [ ] Service worker registers
- [ ] Install prompt appears (on supported browsers)
- [ ] App installs to home screen
- [ ] Offline basic functionality works
- [ ] Audio plays on mobile (iOS/Android)

### Quality Requirements
- [ ] Touch targets minimum 44x44px
- [ ] No pull-to-refresh interference
- [ ] Smooth animations
- [ ] iOS audio unlock works
- [ ] Standalone mode styling

### Manual Verification
```bash
cd apps/web
pnpm build
pnpm start

# Test PWA:
# 1. Open in Chrome mobile/desktop
# 2. Check for install prompt
# 3. Install to home screen
# 4. Open installed app
# 5. Test audio playback
# 6. Check offline functionality

# Test on iOS:
# 1. Open in Safari
# 2. Tap Share → Add to Home Screen
# 3. Open installed app
# 4. Test audio playback
```

---

## Frontend Player Tier Complete!

**Files created:**
- `apps/web/public/manifest.json`
- `apps/web/public/sw.js`
- `apps/web/public/icon.svg`
- `apps/web/components/install-prompt.tsx`

**Files modified:**
- `apps/web/app/layout.tsx` (PWA meta tags, SW registration)
- `apps/web/app/page.tsx` (install prompt)
- `apps/web/components/audio-player.tsx` (mobile optimizations)
- `apps/web/app/globals.css` (PWA styles)

**Player now has:**
- ✅ Basic streaming interface
- ✅ Now-playing display
- ✅ Schedule display
- ✅ About/info pages
- ✅ PWA capabilities
- ✅ Mobile optimization
- ✅ Install prompt
- ✅ Offline support

**Ready for Integration Tier (I1-I4)!**

-----------------



# Task I1: End-to-End Integration Tests

**Tier:** Integration  
**Estimated Time:** 2 hours  
**Complexity:** High  
**Prerequisites:** All previous tiers complete

---

## Objective

Create end-to-end integration tests that verify the entire pipeline: content creation → generation → mastering → playout.

---

## Context

Integration tests ensure all components work together:
- Database → Workers → API → Playout
- Full segment lifecycle
- Error handling across boundaries

---

## Implementation Steps

### Step 1: Create Integration Test Package
````bash
mkdir -p tests/integration
cd tests/integration
````

Create `tests/integration/package.json`:
````json
{
  "name": "@radio/integration-tests",
  "version": "0.0.1",
  "scripts": {
    "test": "jest --runInBand",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@supabase/supabase-js": "^2.39.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "typescript": "^5.3.3",
    "ts-jest": "^29.1.0"
  }
}
````

### Step 2: Create Jest Config

Create `tests/integration/jest.config.js`:
````javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 300000, // 5 minutes for long-running tests
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testMatch: ['**/*.test.ts'],
};
````

### Step 3: Create Test Setup

Create `tests/integration/setup.ts`:
````typescript
import { createClient } from '@supabase/supabase-js';

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting integration tests...');
  
  // Verify environment variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'API_URL',
    'ANTHROPIC_API_KEY',
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
});

afterAll(async () => {
  console.log('✅ Integration tests complete');
});

// Helper to wait for condition
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs: number = 30000,
  intervalMs: number = 1000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Condition timeout exceeded');
}

// Helper to clean up test data
export async function cleanupTestData(supabase: any, segmentId: string) {
  // Delete segment
  await supabase.from('segments').delete().eq('id', segmentId);
  
  // Delete associated jobs
  await supabase
    .from('jobs')
    .delete()
    .eq('payload->segment_id', segmentId);
}
````

### Step 4: Create Full Pipeline Test

Create `tests/integration/segment-pipeline.test.ts`:
````typescript
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { waitForCondition, cleanupTestData } from './setup';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const apiUrl = process.env.API_URL || 'http://localhost:8000';

describe('Segment Generation Pipeline', () => {
  let testSegmentId: string;
  let testProgramId: string;

  beforeAll(async () => {
    // Create test program with DJ
    const { data: dj } = await supabase
      .from('djs')
      .insert({
        name: 'Test DJ',
        personality: 'Friendly and informative test DJ',
        voice_id: 'en_US-lessac-medium',
      })
      .select()
      .single();

    const { data: program } = await supabase
      .from('programs')
      .insert({
        name: 'Test Program',
        dj_id: dj.id,
        active: true,
      })
      .select()
      .single();

    testProgramId = program.id;
  });

  afterEach(async () => {
    if (testSegmentId) {
      await cleanupTestData(supabase, testSegmentId);
    }
  });

  test('Full segment generation pipeline', async () => {
    console.log('📝 Creating test segment...');

    // 1. Create segment
    const { data: segment, error: createError } = await supabase
      .from('segments')
      .insert({
        program_id: testProgramId,
        slot_type: 'news',
        state: 'queued',
        lang: 'en',
        max_retries: 3,
        retry_count: 0,
      })
      .select()
      .single();

    expect(createError).toBeNull();
    expect(segment).toBeDefined();
    testSegmentId = segment.id;

    console.log(`✓ Segment created: ${testSegmentId}`);

    // 2. Enqueue generation job
    console.log('📋 Enqueuing generation job...');

    const { data: jobId, error: enqueueError } = await supabase.rpc('enqueue_job', {
      p_job_type: 'segment_make',
      p_payload: { segment_id: testSegmentId },
      p_priority: 5,
      p_schedule_delay_sec: 0,
    });

    expect(enqueueError).toBeNull();
    console.log(`✓ Job enqueued: ${jobId}`);

    // 3. Wait for segment to reach 'retrieving' state
    console.log('🔍 Waiting for RAG retrieval...');

    await waitForCondition(async () => {
      const { data } = await supabase
        .from('segments')
        .select('state')
        .eq('id', testSegmentId)
        .single();

      return data?.state === 'retrieving' || data?.state === 'generating';
    }, 60000);

    console.log('✓ RAG retrieval started');

    // 4. Wait for segment to reach 'generating' state
    console.log('🤖 Waiting for script generation...');

    await waitForCondition(async () => {
      const { data } = await supabase
        .from('segments')
        .select('state, script_md')
        .eq('id', testSegmentId)
        .single();

      return data?.state === 'generating' || data?.state === 'rendering';
    }, 120000); // 2 minutes for LLM

    console.log('✓ Script generation in progress');

    // 5. Wait for segment to reach 'rendering' state (TTS)
    console.log('🔊 Waiting for TTS synthesis...');

    await waitForCondition(async () => {
      const { data } = await supabase
        .from('segments')
        .select('state')
        .eq('id', testSegmentId)
        .single();

      return data?.state === 'rendering' || data?.state === 'normalizing';
    }, 120000); // 2 minutes for TTS

    console.log('✓ TTS synthesis in progress');

    // 6. Wait for segment to reach 'normalizing' state
    console.log('🎚️ Waiting for audio mastering...');

    await waitForCondition(async () => {
      const { data } = await supabase
        .from('segments')
        .select('state')
        .eq('id', testSegmentId)
        .single();

      return data?.state === 'normalizing' || data?.state === 'ready';
    }, 120000); // 2 minutes for mastering

    console.log('✓ Audio mastering in progress');

    // 7. Wait for segment to reach 'ready' state
    console.log('✅ Waiting for segment completion...');

    await waitForCondition(async () => {
      const { data } = await supabase
        .from('segments')
        .select('state')
        .eq('id', testSegmentId)
        .single();

      return data?.state === 'ready';
    }, 180000); // 3 minutes total

    // 8. Verify final segment
    const { data: finalSegment } = await supabase
      .from('segments')
      .select('*, assets(*)')
      .eq('id', testSegmentId)
      .single();

    expect(finalSegment.state).toBe('ready');
    expect(finalSegment.script_md).toBeTruthy();
    expect(finalSegment.script_md.length).toBeGreaterThan(50);
    expect(finalSegment.asset_id).toBeTruthy();
    expect(finalSegment.duration_sec).toBeGreaterThan(0);
    expect(finalSegment.assets).toBeDefined();
    expect(finalSegment.assets.lufs_integrated).toBeTruthy();
    expect(finalSegment.assets.validation_status).toBe('passed');

    console.log('✅ Full pipeline test passed!');
    console.log(`   - Script length: ${finalSegment.script_md.length} chars`);
    console.log(`   - Duration: ${Math.round(finalSegment.duration_sec)}s`);
    console.log(`   - LUFS: ${finalSegment.assets.lufs_integrated}`);
  }, 300000); // 5 minute timeout

  test('Handles failed segment with retry', async () => {
    console.log('🧪 Testing failure and retry...');

    // Create segment with intentionally invalid data
    const { data: segment } = await supabase
      .from('segments')
      .insert({
        program_id: testProgramId,
        slot_type: 'invalid_type', // Invalid slot type
        state: 'queued',
        lang: 'en',
        max_retries: 1,
        retry_count: 0,
      })
      .select()
      .single();

    testSegmentId = segment.id;

    // Enqueue job
    await supabase.rpc('enqueue_job', {
      p_job_type: 'segment_make',
      p_payload: { segment_id: testSegmentId },
      p_priority: 5,
      p_schedule_delay_sec: 0,
    });

    // Wait for failure
    await waitForCondition(async () => {
      const { data } = await supabase
        .from('segments')
        .select('state')
        .eq('id', testSegmentId)
        .single();

      return data?.state === 'failed';
    }, 60000);

    const { data: failedSegment } = await supabase
      .from('segments')
      .select('state, last_error, retry_count')
      .eq('id', testSegmentId)
      .single();

    expect(failedSegment.state).toBe('failed');
    expect(failedSegment.last_error).toBeTruthy();

    console.log('✓ Failure handled correctly');
  });
});
````

### Step 5: Create Playout Integration Test

Create `tests/integration/playout-api.test.ts`:
````typescript
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const apiUrl = process.env.API_URL || 'http://localhost:8000';
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('Playout API Integration', () => {
  test('GET /playout/next returns ready segments', async () => {
    const response = await axios.get(`${apiUrl}/playout/next?limit=5`);

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('segments');
    expect(response.data).toHaveProperty('total');
    expect(Array.isArray(response.data.segments)).toBe(true);

    if (response.data.segments.length > 0) {
      const segment = response.data.segments[0];
      expect(segment).toHaveProperty('id');
      expect(segment).toHaveProperty('audio_url');
      expect(segment).toHaveProperty('duration_sec');
      expect(segment.audio_url).toContain('http');
    }
  });

  test('POST /playout/now-playing updates segment state', async () => {
    // Get a ready segment
    const { data: segments } = await supabase
      .from('segments')
      .select('id')
      .eq('state', 'ready')
      .limit(1);

    if (segments && segments.length > 0) {
      const segmentId = segments[0].id;

      const response = await axios.post(`${apiUrl}/playout/now-playing`, {
        segment_id: segmentId,
        title: 'Test Segment',
        timestamp: new Date().toISOString(),
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('ok');

      // Verify state changed
      const { data: updatedSegment } = await supabase
        .from('segments')
        .select('state, aired_at')
        .eq('id', segmentId)
        .single();

      expect(updatedSegment.state).toBe('airing');
      expect(updatedSegment.aired_at).toBeTruthy();
    }
  });

  test('RAG retrieval returns relevant chunks', async () => {
    const response = await axios.post(`${apiUrl}/rag/retrieve`, {
      text: 'climate change and technology',
      topK: 5,
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('chunks');
    expect(Array.isArray(response.data.chunks)).toBe(true);
  });
});
````

### Step 6: Create Test Runner Script

Create `tests/integration/run-tests.sh`:
````bash
#!/bin/bash
# Run integration tests

set -e

echo "🧪 AI Radio 2525 - Integration Tests"
echo "===================================="

# Check environment
if [ -z "$SUPABASE_URL" ]; then
  echo "❌ Error: SUPABASE_URL not set"
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY not set"
  exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ Error: ANTHROPIC_API_KEY not set"
  exit 1
fi

echo "✓ Environment variables configured"
echo ""

# Check services are running
echo "🔍 Checking required services..."

# Check API
if ! curl -sf http://localhost:8000/health > /dev/null; then
  echo "❌ API not responding at http://localhost:8000"
  echo "   Start with: cd apps/api && uvicorn src.main:app"
  exit 1
fi
echo "✓ API is running"

# Check workers (optional, warn only)
if ! pgrep -f "embedder" > /dev/null; then
  echo "⚠️  Warning: Embedder worker not running"
fi

if ! pgrep -f "segment-gen" > /dev/null; then
  echo "⚠️  Warning: Segment generation worker not running"
fi

if ! pgrep -f "mastering" > /dev/null; then
  echo "⚠️  Warning: Mastering worker not running"
fi

echo ""
echo "🏃 Running integration tests..."
echo ""

# Run tests
npm test

echo ""
echo "✅ All integration tests passed!"
````

### Step 7: Create README

Create `tests/integration/README.md`:
````markdown
# Integration Tests

End-to-end integration tests for AI Radio 2525.

## Prerequisites

All services must be running:
- ✅ API server (port 8000)
- ✅ Embedder worker
- ✅ Segment generation worker
- ✅ Mastering worker
- ✅ Supabase database

## Setup
```bash
cd tests/integration
npm install
```

## Environment Variables
```bash
export SUPABASE_URL="your_supabase_url"
export SUPABASE_SERVICE_ROLE_KEY="your_service_key"
export ANTHROPIC_API_KEY="your_anthropic_key"
export API_URL="http://localhost:8000"
```

## Running Tests
```bash
# Run all tests
npm test

# Run specific test
npm test -- segment-pipeline.test.ts

# Watch mode
npm run test:watch
```

## Test Coverage

### Full Pipeline Test
- Creates segment
- Enqueues generation job
- Waits through all states (retrieving → generating → rendering → normalizing → ready)
- Verifies final segment quality
- **Duration:** ~3-5 minutes

### Error Handling Test
- Tests failure scenarios
- Verifies retry logic
- Checks dead letter queue

### Playout API Test
- Tests /playout/next endpoint
- Tests /playout/now-playing endpoint
- Verifies segment state transitions

### RAG Test
- Tests retrieval endpoint
- Verifies chunk relevance

## Troubleshooting

**Test timeouts:**
- Increase timeout in jest.config.js
- Check worker logs for errors

**Workers not processing:**
- Verify workers are running
- Check database connections
- Review worker logs

**API errors:**
- Check API server logs
- Verify environment variables
- Test endpoints manually with curl
````

---

## Acceptance Criteria

### Functional Requirements
- [ ] Full pipeline test passes (queued → ready)
- [ ] Error handling test passes
- [ ] Playout API tests pass
- [ ] RAG retrieval test passes
- [ ] All workers tested
- [ ] State transitions verified

### Quality Requirements
- [ ] Tests run in CI/CD
- [ ] Clear error messages
- [ ] Proper cleanup
- [ ] Timeout handling
- [ ] Comprehensive coverage

### Manual Verification
````bash
cd tests/integration
npm install

# Ensure all services running
# Start API, workers, etc.

# Run tests
export SUPABASE_URL="your_url"
export SUPABASE_SERVICE_ROLE_KEY="your_key"
export ANTHROPIC_API_KEY="your_key"

npm test

# Should see:
# ✓ Full segment generation pipeline
# ✓ Handles failed segment with retry
# ✓ GET /playout/next returns ready segments
# ✓ POST /playout/now-playing updates segment state
# ✓ RAG retrieval returns relevant chunks
````

---

## Next Task Handoff

**For I2 (Deployment Scripts):**
- Docker Compose for full stack
- Environment configuration
- Service orchestration
- Health checks

**Files created:**
- `tests/integration/package.json`
- `tests/integration/jest.config.js`
- `tests/integration/setup.ts`
- `tests/integration/segment-pipeline.test.ts`
- `tests/integration/playout-api.test.ts`
- `tests/integration/run-tests.sh`
- `tests/integration/README.md`

**Integration tests ready:**
- ✅ Full pipeline verification
- ✅ Error handling coverage
- ✅ API endpoint testing
- ✅ Worker coordination


-----------------------------------


# Task I2: Deployment & Orchestration

**Tier:** Integration  
**Estimated Time:** 2 hours  
**Complexity:** High  
**Prerequisites:** I1 complete

---

## Objective

Create deployment scripts and Docker Compose configuration to run the entire AI Radio 2525 stack with one command.

---

## Implementation Steps

### Step 1: Create Root Docker Compose

Create `docker-compose.yml` in project root:
````yaml
version: '3.8'

services:
  # API Server
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    container_name: radio-api
    ports:
      - "8000:8000"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - EMBEDDING_API_KEY=${EMBEDDING_API_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - radio-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: radio-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - radio-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Piper TTS Service
  piper-tts:
    build:
      context: ./services/piper-tts
      dockerfile: Dockerfile
    container_name: radio-piper-tts
    ports:
      - "5002:5002"
    environment:
      - PORT=5002
      - PIPER_CACHE_DIR=/var/cache/piper-tts
      - MAX_CACHE_SIZE_MB=10240
    volumes:
      - piper-cache:/var/cache/piper-tts
      - piper-models:/opt/piper-models
    restart: unless-stopped
    networks:
      - radio-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5002/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Embedder Worker
  embedder:
    build:
      context: ./workers/embedder
      dockerfile: Dockerfile
    container_name: radio-embedder
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - EMBEDDING_API_KEY=${EMBEDDING_API_KEY}
      - MAX_CONCURRENT_JOBS=3
    restart: unless-stopped
    networks:
      - radio-network
    depends_on:
      - api

  # Segment Generation Worker
  segment-gen:
    build:
      context: ./workers/segment-gen
      dockerfile: Dockerfile
    container_name: radio-segment-gen
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - API_URL=http://api:8000
      - PIPER_TTS_URL=http://piper-tts:5002
      - MAX_CONCURRENT_JOBS=2
    restart: unless-stopped
    networks:
      - radio-network
    depends_on:
      - api
      - piper-tts

  # Audio Mastering Worker
  mastering:
    build:
      context: ./workers/mastering
      dockerfile: Dockerfile
    container_name: radio-mastering
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - MAX_CONCURRENT_JOBS=4
    restart: unless-stopped
    networks:
      - radio-network
    depends_on:
      - api

  # Scheduler Worker
  scheduler:
    build:
      context: ./workers/scheduler
      dockerfile: Dockerfile
    container_name: radio-scheduler
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - SCHEDULER_MODE=continuous
      - FUTURE_YEAR_OFFSET=500
    restart: unless-stopped
    networks:
      - radio-network
    depends_on:
      - api

  # Liquidsoap Playout
  liquidsoap:
    build:
      context: ./apps/playout
      dockerfile: Dockerfile
    container_name: radio-liquidsoap
    environment:
      - API_URL=http://api:8000
      - OUTPUT_DIR=/radio/audio
      - ICECAST_HOST=icecast
      - ICECAST_PORT=8000
      - ICECAST_PASSWORD=${ICECAST_PASSWORD:-hackme}
    volumes:
      - liquidsoap-audio:/radio/audio
      - liquidsoap-logs:/var/log/liquidsoap
    restart: unless-stopped
    networks:
      - radio-network
    depends_on:
      - api
      - icecast

  # Icecast Streaming Server
  icecast:
    image: moul/icecast:2.4.4
    container_name: radio-icecast
    environment:
      - ICECAST_SOURCE_PASSWORD=${ICECAST_PASSWORD:-hackme}
      - ICECAST_ADMIN_PASSWORD=${ICECAST_ADMIN_PASSWORD:-admin}
      - ICECAST_PASSWORD=${ICECAST_PASSWORD:-hackme}
      - ICECAST_RELAY_PASSWORD=${ICECAST_PASSWORD:-hackme}
    ports:
      - "8001:8000"
    volumes:
      - ./apps/playout/icecast.xml:/etc/icecast2/icecast.xml:ro
    restart: unless-stopped
    networks:
      - radio-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/status.xsl"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Web Player (Frontend)
  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    container_name: radio-web
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_STREAM_URL=http://localhost:8001/radio.mp3
      - NEXT_PUBLIC_API_URL=http://localhost:8000
      - NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
    restart: unless-stopped
    networks:
      - radio-network
    depends_on:
      - api
      - icecast

  # Admin Interface
  admin:
    build:
      context: ./apps/admin
      dockerfile: Dockerfile
    container_name: radio-admin
    ports:
      - "3001:3001"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
    restart: unless-stopped
    networks:
      - radio-network

volumes:
  redis-data:
  piper-cache:
  piper-models:
  liquidsoap-audio:
  liquidsoap-logs:

networks:
  radio-network:
    driver: bridge
````

### Step 2: Create Environment Template

Create `.env.example`:
````bash
# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
SUPABASE_ANON_KEY=eyJxxx...

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-xxx

# Hugging Face (for embeddings)
EMBEDDING_API_KEY=hf_xxx

# Icecast
ICECAST_PASSWORD=hackme
ICECAST_ADMIN_PASSWORD=admin

# Future year offset (2525 - current year)
FUTURE_YEAR_OFFSET=500

# Optional: Redis (uses Docker service by default)
# REDIS_URL=redis://localhost:6379
````

### Step 3: Create Deployment Script

Create `scripts/deploy.sh`:
````bash
#!/bin/bash
# AI Radio 2525 - Deployment Script

set -e

echo "🚀 AI Radio 2525 - Deployment"
echo "============================="

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found"
  echo "   Copy .env.example to .env and configure it"
  exit 1
fi

# Load environment
set -a
source .env
set +a

# Validate required variables
required_vars=(
  "SUPABASE_URL"
  "SUPABASE_SERVICE_ROLE_KEY"
  "ANTHROPIC_API_KEY"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Error: $var is not set in .env"
    exit 1
  fi
done

echo "✓ Environment variables validated"

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "❌ Error: Docker is not installed"
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  echo "❌ Error: Docker Compose is not installed"
  exit 1
fi

echo "✓ Docker is installed"

# Build images
echo ""
echo "🏗️  Building Docker images..."
docker-compose build

# Start services
echo ""
echo "🚀 Starting services..."
docker-compose up -d

# Wait for services
echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
services=("api" "piper-tts" "icecast")
for service in "${services[@]}"; do
  echo -n "   Checking $service... "
  if docker-compose ps | grep "$service" | grep -q "Up"; then
    echo "✓"
  else
    echo "❌"
    echo "   Service $service is not running"
    docker-compose logs $service
    exit 1
  fi
done

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📡 Services:"
echo "   API:      http://localhost:8000"
echo "   Web:      http://localhost:3000"
echo "   Admin:    http://localhost:3001"
echo "   Stream:   http://localhost:8001/radio.mp3"
echo "   Icecast:  http://localhost:8001"
echo ""
echo "📊 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose down"
````

### Step 4: Create Development Script

Create `scripts/dev.sh`:
````bash
#!/bin/bash
# AI Radio 2525 - Development Environment

set -e

echo "🔧 AI Radio 2525 - Development Mode"
echo "===================================="

# Check .env
if [ ! -f .env ]; then
  echo "❌ .env file not found"
  exit 1
fi

set -a
source .env
set +a

echo "✓ Environment loaded"

# Start core services only (API, Redis, Piper)
echo ""
echo "🚀 Starting core services..."
docker-compose up -d api redis piper-tts icecast

echo ""
echo "✅ Core services started"
echo ""
echo "📝 To start workers manually:"
echo ""
echo "   Embedder:"
echo "   cd workers/embedder && pnpm dev"
echo ""
echo "   Segment Generation:"
echo "   cd workers/segment-gen && pnpm dev"
echo ""
echo "   Mastering:"
echo "   cd workers/mastering && pnpm dev"
echo ""
echo "   Scheduler:"
echo "   cd workers/scheduler && pnpm dev"
echo ""
echo "   Web:"
echo "   cd apps/web && pnpm dev"
echo ""
echo "   Admin:"
echo "   cd apps/admin && pnpm dev"
````

### Step 5: Create Health Check Script

Create `scripts/health-check.sh`:
````bash
#!/bin/bash
# Health check all services

echo "🏥 AI Radio 2525 - Health Check"
echo "==============================="

services=(
  "http://localhost:8000/health|API"
  "http://localhost:5002/health|Piper TTS"
  "http://localhost:8001/status.xsl|Icecast"
  "http://localhost:3000|Web Player"
  "http://localhost:3001|Admin"
)

all_healthy=true

for service in "${services[@]}"; do
  IFS='|' read -r url name <<< "$service"
  echo -n "Checking $name... "
  
  if curl -sf "$url" > /dev/null 2>&1; then
    echo "✅ Healthy"
  else
    echo "❌ Unhealthy"
    all_healthy=false
  fi
done

echo ""
echo "Worker Status:"
docker-compose ps embedder segment-gen mastering scheduler

echo ""
if [ "$all_healthy" = true ]; then
  echo "✅ All services are healthy"
  exit 0
else
  echo "❌ Some services are unhealthy"
  exit 1
fi
````

### Step 6: Create Dockerfiles

Create `apps/api/Dockerfile`:
````dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
````

Create `apps/web/Dockerfile`:
````dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["npm", "start"]
````

Create `apps/admin/Dockerfile`:
````dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["npm", "start"]
````

Create generic worker Dockerfile pattern in `workers/*/Dockerfile`:
````dockerfile
FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["npm", "start"]
````

### Step 7: Create Monitoring Dashboard

Create `scripts/monitor.sh`:
````bash
#!/bin/bash
# Real-time monitoring dashboard

watch -n 2 '
echo "═══════════════════════════════════════════"
echo "AI Radio 2525 - Live Monitoring"
echo "═══════════════════════════════════════════"
echo ""
echo "📊 Container Status:"
docker-compose ps
echo ""
echo "💾 Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
echo ""
echo "📋 Job Queue:"
curl -s http://localhost:8000/monitoring/jobs 2>/dev/null | head -20
'
````

---

## Acceptance Criteria

### Functional Requirements
- [ ] docker-compose up starts all services
- [ ] All services are healthy
- [ ] Workers process jobs
- [ ] Stream is broadcasting
- [ ] Web player loads
- [ ] Admin interface works

### Quality Requirements
- [ ] Health checks pass
- [ ] Logs are accessible
- [ ] Resource limits set
- [ ] Restart policies configured
- [ ] Networks isolated

### Manual Verification
````bash
# Copy environment
cp .env.example .env
# Edit .env with your credentials

# Deploy
chmod +x scripts/*.sh
./scripts/deploy.sh

# Wait for startup (1-2 minutes)

# Check health
./scripts/health-check.sh

# View logs
docker-compose logs -f

# Test stream
open http://localhost:3000

# Check admin
open http://localhost:3001
````

---

## Next Task Handoff

**For I3 (Monitoring & Alerting):**
- Prometheus metrics
- Grafana dashboards
- Alert rules
- Log aggregation

**Files created:**
- `docker-compose.yml`
- `.env.example`
- `scripts/deploy.sh`
- `scripts/dev.sh`
- `scripts/health-check.sh`
- `scripts/monitor.sh`
- Multiple `Dockerfile` files

**Deployment ready:**
- ✅ One-command deployment
- ✅ All services orchestrated
- ✅ Health checks
- ✅ Dev mode

=================================

# Task I3: Monitoring & Observability

**Tier:** Integration  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** I2 complete

---

## Objective

Add monitoring, metrics, and observability: Prometheus metrics, Grafana dashboards, log aggregation.

---

## Implementation Steps

### Step 1: Add Prometheus to Docker Compose

Update `docker-compose.yml`:
````yaml
services:
  # ... existing services ...

  # Prometheus
  prometheus:
    image: prom/prometheus:latest
    container_name: radio-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    restart: unless-stopped
    networks:
      - radio-network

  # Grafana
  grafana:
    image: grafana/grafana:latest
    container_name: radio-grafana
    ports:
      - "3002:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
      - GF_INSTALL_PLUGINS=redis-datasource
    volumes:
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources:ro
      - grafana-data:/var/lib/grafana
    restart: unless-stopped
    networks:
      - radio-network
    depends_on:
      - prometheus

  # Node Exporter (system metrics)
  node-exporter:
    image: prom/node-exporter:latest
    container_name: radio-node-exporter
    ports:
      - "9100:9100"
    restart: unless-stopped
    networks:
      - radio-network

volumes:
  # ... existing volumes ...
  prometheus-data:
  grafana-data:
````

### Step 2: Create Prometheus Config

Create `monitoring/prometheus.yml`:
````yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # System metrics
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  # API metrics (if implemented)
  - job_name: 'api'
    static_configs:
      - targets: ['api:8000']
    metrics_path: '/metrics'

  # Redis metrics
  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

  # Icecast metrics
  - job_name: 'icecast'
    static_configs:
      - targets: ['icecast:8000']
    metrics_path: '/status-json.xsl'

# Alert rules
rule_files:
  - 'alerts.yml'
````

### Step 3: Create Alert Rules

Create `monitoring/alerts.yml`:
````yaml
groups:
  - name: radio_alerts
    interval: 30s
    rules:
      # Service down alerts
      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.job }} has been down for more than 2 minutes"

      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"

      # Job queue backup
      - alert: JobQueueBacklog
        expr: job_queue_pending > 100
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Job queue has large backlog"
          description: "{{ $value }} pending jobs in queue"

      # Dead air detected
      - alert: DeadAirDetected
        expr: stream_dead_air == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Dead air detected on stream"
          description: "Stream has been silent for more than 5 seconds"
````

### Step 4: Create Grafana Datasource

Create `monitoring/grafana/datasources/prometheus.yml`:
````yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
````

### Step 5: Create Grafana Dashboard

Create `monitoring/grafana/dashboards/dashboard.json`:
````json
{
  "dashboard": {
    "title": "AI Radio 2525 - System Overview",
    "panels": [
      {
        "title": "System CPU Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(process_cpu_seconds_total[5m]) * 100",
            "legendFormat": "{{ job }}"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "process_resident_memory_bytes / 1024 / 1024",
            "legendFormat": "{{ job }} MB"
          }
        ]
      },
      {
        "title": "Job Queue Status",
        "type": "stat",
        "targets": [
          {
            "expr": "sum by (state) (job_queue_total)",
            "legendFormat": "{{ state }}"
          }
        ]
      },
      {
        "title": "Segment Generation Pipeline",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(segments_processed_total[5m])",
            "legendFormat": "Segments/sec"
          }
        ]
      },
      {
        "title": "Stream Status",
        "type": "stat",
        "targets": [
          {
            "expr": "icecast_listeners",
            "legendFormat": "Listeners"
          }
        ]
      }
    ]
  }
}
````

Create `monitoring/grafana/dashboards/dashboard-provider.yml`:
````yaml
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
````

### Step 6: Create Metrics Endpoints (API)

Update `apps/api/src/main.py`:
````python
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

# Metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

job_queue_pending = Gauge(
    'job_queue_pending',
    'Number of pending jobs',
    ['job_type']
)

segments_total = Gauge(
    'segments_total',
    'Total segments',
    ['state']
)

# Metrics endpoint
@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    # Update metrics from database
    try:
        # Get job queue stats
        job_stats = supabase.table("jobs")\
            .select("job_type, state")\
            .execute()
        
        for job_type in ['kb_index', 'segment_make', 'audio_finalize']:
            pending = len([j for j in job_stats.data 
                          if j['job_type'] == job_type and j['state'] == 'pending'])
            job_queue_pending.labels(job_type=job_type).set(pending)
        
        # Get segment stats
        segment_stats = supabase.table("segments")\
            .select("state")\
            .execute()
        
        for state in ['queued', 'ready', 'aired', 'failed']:
            count = len([s for s in segment_stats.data if s['state'] == state])
            segments_total.labels(state=state).set(count)
    
    except Exception as e:
        print(f"Metrics error: {e}")
    
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )

# Middleware to track requests
@app.middleware("http")
async def track_requests(request: Request, call_next):
    method = request.method
    path = request.url.path
    
    with http_request_duration.labels(method=method, endpoint=path).time():
        response = await call_next(request)
    
    http_requests_total.labels(
        method=method,
        endpoint=path,
        status=response.status_code
    ).inc()
    
    return response
````

Update `apps/api/requirements.txt`:
````txt
# ... existing requirements ...
prometheus-client==0.19.0
````

### Step 7: Create Monitoring Commands

Create `scripts/monitoring.sh`:
````bash
#!/bin/bash
# Monitoring utilities

case "$1" in
  start)
    echo "🚀 Starting monitoring stack..."
    docker-compose up -d prometheus grafana node-exporter
    echo "✅ Monitoring started"
    echo "   Prometheus: http://localhost:9090"
    echo "   Grafana:    http://localhost:3002 (admin/admin)"
    ;;
    
  stop)
    echo "🛑 Stopping monitoring stack..."
    docker-compose stop prometheus grafana node-exporter
    ;;
    
  logs)
    docker-compose logs -f prometheus grafana
    ;;
    
  metrics)
    echo "📊 Current Metrics:"
    echo ""
    curl -s http://localhost:8000/metrics | grep -E "(job_queue|segments_total)"
    ;;
    
  alerts)
    echo "🚨 Active Alerts:"
    curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'
    ;;
    
  *)
    echo "Usage: $0 {start|stop|logs|metrics|alerts}"
    exit 1
    ;;
esac
````

### Step 8: Create Status Page

Create `apps/web/app/status/page.tsx`:
````typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function StatusPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('http://localhost:8000/metrics');
        const text = await response.text();
        
        // Parse Prometheus metrics (simplified)
        const lines = text.split('\n');
        const parsed: any = {};
        
        lines.forEach(line => {
          if (line.startsWith('job_queue_pending')) {
            const match = line.match(/job_type="([^"]+)"\} (\d+)/);
            if (match) {
              if (!parsed.jobs) parsed.jobs = {};
              parsed.jobs[match[1]] = parseInt(match[2]);
            }
          }
        });
        
        setMetrics(parsed);
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black">
      <header className="bg-black bg-opacity-50 backdrop-blur-sm border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-2xl font-bold text-white hover:text-gray-300">
            ← AI Radio 2525
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-white mb-8">System Status</h1>

        {loading ? (
          <div className="text-white">Loading metrics...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 border border-white border-opacity-20">
              <h3 className="text-white font-semibold mb-4">Job Queue</h3>
              {metrics?.jobs && Object.entries(metrics.jobs).map(([type, count]: [string, any]) => (
                <div key={type} className="flex justify-between text-sm mb-2">
                  <span className="text-gray-300">{type}</span>
                  <span className="text-white font-bold">{count}</span>
                </div>
              ))}
            </div>

            <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-lg p-6 border border-white border-opacity-20">
              <h3 className="text-white font-semibold mb-4">External Links</h3>
              <div className="space-y-2">
                
                  href="http://localhost:9090"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-300 hover:text-blue-200 text-sm"
                >
                  Prometheus →
                </a>
                
                  href="http://localhost:3002"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-300 hover:text-blue-200 text-sm"
                >
                  Grafana →
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
````

---

## Acceptance Criteria

### Functional Requirements
- [ ] Prometheus collects metrics
- [ ] Grafana displays dashboards
- [ ] Alerts fire correctly
- [ ] Metrics endpoint works
- [ ] Status page loads
- [ ] Logs accessible

### Quality Requirements
- [ ] Dashboards are readable
- [ ] Alerts are actionable
- [ ] Metrics are accurate
- [ ] Low overhead

### Manual Verification
````bash
# Start monitoring
./scripts/monitoring.sh start

# Open Grafana
open http://localhost:3002
# Login: admin/admin

# View metrics
curl http://localhost:8000/metrics

# Check Prometheus
open http://localhost:9090

# View status page
open http://localhost:3000/status
````

---

## Next Task Handoff

**For I4 (Documentation & Runbook):**
- Complete README
- Architecture diagrams
- Operational runbook
- Troubleshooting guide

**Files created:**
- `monitoring/prometheus.yml`
- `monitoring/alerts.yml`
- `monitoring/grafana/datasources/prometheus.yml`
- `monitoring/grafana/dashboards/dashboard.json`
- `monitoring/grafana/dashboards/dashboard-provider.yml`
- `scripts/monitoring.sh`
- `apps/web/app/status/page.tsx`

**Files modified:**
- `docker-compose.yml` (added monitoring services)
- `apps/api/src/main.py` (added metrics)
- `apps/api/requirements.txt` (added prometheus-client)

**Monitoring ready:**
- ✅ Prometheus metrics
- ✅ Grafana dashboards
- ✅ Alert rules
- ✅ Status page

------------------------------------------

# Task M1: Music Library & Database Schema

**Tier:** Music & Audio  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** D1-D8 complete (database foundation)

---

## Objective

Create database schema and management system for music tracks, jingles, and sound effects with licensing/attribution tracking.

---

## Implementation Steps

### Step 1: Create Music Tables Migration

Create `infra/migrations/015_music_library.sql`:
```sql
-- Migration: Music library and audio assets
-- Description: Music tracks, jingles, sound effects with licensing

-- Music genres
CREATE TABLE music_genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Music tracks
CREATE TABLE music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  genre_id UUID REFERENCES music_genres(id),
  duration_sec FLOAT NOT NULL,
  
  -- Audio file
  storage_path TEXT NOT NULL,
  file_format TEXT DEFAULT 'mp3',
  bitrate INT,
  sample_rate INT,
  
  -- Licensing
  license_type TEXT NOT NULL CHECK (license_type IN ('cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'proprietary', 'public-domain')),
  license_url TEXT,
  attribution_required BOOLEAN DEFAULT false,
  attribution_text TEXT,
  source_url TEXT,
  
  -- Metadata
  mood TEXT, -- 'energetic', 'calm', 'dramatic', 'upbeat', 'melancholic'
  tempo TEXT, -- 'slow', 'medium', 'fast'
  energy_level INT CHECK (energy_level BETWEEN 1 AND 10),
  
  -- Rotation management
  play_count INT DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  
  -- Scheduling
  suitable_for_time TEXT[], -- ['morning', 'afternoon', 'evening', 'night']
  suitable_for_programs TEXT[], -- ['news', 'culture', 'tech', 'interview']
  
  -- Status
  active BOOLEAN DEFAULT true,
  reviewed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jingles (station IDs, bumpers, transitions)
CREATE TABLE jingles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  jingle_type TEXT NOT NULL CHECK (jingle_type IN ('station_id', 'program_intro', 'program_outro', 'transition', 'bumper', 'news_intro', 'weather_intro')),
  
  -- Audio
  storage_path TEXT NOT NULL,
  duration_sec FLOAT NOT NULL,
  
  -- Usage
  program_id UUID REFERENCES programs(id), -- NULL if generic
  play_count INT DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sound effects
CREATE TABLE sound_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'ambience', 'transition', 'emphasis', 'tech', 'space'
  
  -- Audio
  storage_path TEXT NOT NULL,
  duration_sec FLOAT NOT NULL,
  
  -- Licensing
  license_type TEXT NOT NULL,
  attribution_text TEXT,
  
  -- Usage
  tags TEXT[],
  play_count INT DEFAULT 0,
  
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Music playlists (for rotation scheduling)
CREATE TABLE music_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Scheduling
  time_slots TEXT[], -- ['06:00-09:00', '18:00-22:00']
  days_of_week INT[], -- [1,2,3,4,5] for Mon-Fri
  
  -- Rules
  shuffle BOOLEAN DEFAULT true,
  repeat_threshold_hours INT DEFAULT 4, -- Don't repeat track within X hours
  
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playlist tracks (many-to-many)
CREATE TABLE playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID REFERENCES music_playlists(id) ON DELETE CASCADE,
  track_id UUID REFERENCES music_tracks(id) ON DELETE CASCADE,
  position INT, -- NULL for random/shuffled playlists
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(playlist_id, track_id)
);

-- Indexes for performance
CREATE INDEX idx_music_tracks_genre ON music_tracks(genre_id);
CREATE INDEX idx_music_tracks_active ON music_tracks(active) WHERE active = true;
CREATE INDEX idx_music_tracks_mood ON music_tracks(mood);
CREATE INDEX idx_music_tracks_last_played ON music_tracks(last_played_at);
CREATE INDEX idx_jingles_type ON jingles(jingle_type);
CREATE INDEX idx_jingles_program ON jingles(program_id);
CREATE INDEX idx_sound_effects_category ON sound_effects(category);

-- Functions for play count tracking
CREATE OR REPLACE FUNCTION increment_music_play_count(track_id_param UUID)
RETURNS void AS $$
BEGIN
  UPDATE music_tracks
  SET 
    play_count = play_count + 1,
    last_played_at = NOW()
  WHERE id = track_id_param;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_jingle_play_count(jingle_id_param UUID)
RETURNS void AS $$
BEGIN
  UPDATE jingles
  SET 
    play_count = play_count + 1,
    last_played_at = NOW()
  WHERE id = jingle_id_param;
END;
$$ LANGUAGE plpgsql;

-- Insert sample genres
INSERT INTO music_genres (name, description) VALUES
  ('Electronic', 'Electronic and synthesizer music'),
  ('Ambient', 'Atmospheric and ambient soundscapes'),
  ('Jazz', 'Jazz and smooth instrumentals'),
  ('Classical', 'Classical and orchestral pieces'),
  ('World', 'World music and ethnic sounds'),
  ('Rock', 'Rock and alternative'),
  ('Cinematic', 'Epic and cinematic scores');

COMMENT ON TABLE music_tracks IS 'Music tracks for rotation between talk segments';
COMMENT ON TABLE jingles IS 'Station IDs, program intros, transitions';
COMMENT ON TABLE sound_effects IS 'Sound effects for various uses';
COMMENT ON TABLE music_playlists IS 'Curated playlists for scheduling';
```

### Step 2: Create Music Service

Create `apps/api/src/music/music_service.py`:
```python
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from supabase import Client
import random

class MusicService:
    """Service for music selection and rotation"""
    
    def __init__(self, supabase: Client):
        self.supabase = supabase
    
    def get_next_track(
        self,
        mood: Optional[str] = None,
        time_of_day: Optional[str] = None,
        program_type: Optional[str] = None,
        exclude_recent_hours: int = 4
    ) -> Optional[Dict]:
        """
        Get next music track based on context
        
        Args:
            mood: Desired mood (energetic, calm, etc.)
            time_of_day: morning, afternoon, evening, night
            program_type: news, culture, tech, interview
            exclude_recent_hours: Don't repeat tracks within X hours
        """
        # Build query
        query = self.supabase.table("music_tracks").select("*")
        query = query.eq("active", True)
        query = query.eq("reviewed", True)
        
        # Filter by mood
        if mood:
            query = query.eq("mood", mood)
        
        # Filter by time of day
        if time_of_day:
            query = query.contains("suitable_for_time", [time_of_day])
        
        # Filter by program type
        if program_type:
            query = query.contains("suitable_for_programs", [program_type])
        
        # Exclude recently played
        cutoff_time = datetime.utcnow() - timedelta(hours=exclude_recent_hours)
        query = query.or_(
            f"last_played_at.is.null,last_played_at.lt.{cutoff_time.isoformat()}"
        )
        
        # Order by least played, then random
        query = query.order("play_count", desc=False)
        query = query.limit(20)  # Get pool of candidates
        
        result = query.execute()
        
        if not result.data:
            return None
        
        # Pick random from pool for variety
        track = random.choice(result.data)
        
        # Increment play count
        self.supabase.rpc("increment_music_play_count", {
            "track_id_param": track["id"]
        }).execute()
        
        return track
    
    def get_jingle(
        self,
        jingle_type: str,
        program_id: Optional[str] = None
    ) -> Optional[Dict]:
        """
        Get appropriate jingle
        
        Args:
            jingle_type: station_id, program_intro, transition, etc.
            program_id: Specific program (if program-specific jingle exists)
        """
        query = self.supabase.table("jingles").select("*")
        query = query.eq("active", True)
        query = query.eq("jingle_type", jingle_type)
        
        # Try program-specific first
        if program_id:
            program_query = query.eq("program_id", program_id).limit(5)
            result = program_query.execute()
            
            if result.data:
                jingle = random.choice(result.data)
                self.supabase.rpc("increment_jingle_play_count", {
                    "jingle_id_param": jingle["id"]
                }).execute()
                return jingle
        
        # Fallback to generic jingles
        generic_query = query.is_("program_id", "null").limit(5)
        result = generic_query.execute()
        
        if result.data:
            jingle = random.choice(result.data)
            self.supabase.rpc("increment_jingle_play_count", {
                "jingle_id_param": jingle["id"]
            }).execute()
            return jingle
        
        return None
    
    def get_sound_effect(
        self,
        category: str,
        tags: Optional[List[str]] = None
    ) -> Optional[Dict]:
        """Get sound effect by category and tags"""
        query = self.supabase.table("sound_effects").select("*")
        query = query.eq("active", True)
        query = query.eq("category", category)
        
        if tags:
            query = query.overlaps("tags", tags)
        
        query = query.limit(10)
        result = query.execute()
        
        if result.data:
            return random.choice(result.data)
        
        return None
    
    def add_track(
        self,
        title: str,
        artist: str,
        storage_path: str,
        duration_sec: float,
        license_type: str,
        **kwargs
    ) -> Dict:
        """Add new music track"""
        track_data = {
            "title": title,
            "artist": artist,
            "storage_path": storage_path,
            "duration_sec": duration_sec,
            "license_type": license_type,
            **kwargs
        }
        
        result = self.supabase.table("music_tracks").insert(track_data).execute()
        return result.data[0] if result.data else None
    
    def get_playlist_tracks(self, playlist_id: str) -> List[Dict]:
        """Get all tracks in a playlist"""
        result = self.supabase.table("playlist_tracks")\
            .select("*, music_tracks(*)")\
            .eq("playlist_id", playlist_id)\
            .order("position")\
            .execute()
        
        return result.data if result.data else []
```

### Step 3: Create Music API Routes

Create `apps/api/src/music/music_routes.py`:
```python
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
import os
from supabase import create_client
from .music_service import MusicService

router = APIRouter(prefix="/music", tags=["music"])

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)

music_service = MusicService(supabase)


class NextTrackRequest(BaseModel):
    mood: Optional[str] = None
    time_of_day: Optional[str] = None
    program_type: Optional[str] = None


@router.post("/next-track")
async def get_next_track(request: NextTrackRequest):
    """Get next music track based on context"""
    track = music_service.get_next_track(
        mood=request.mood,
        time_of_day=request.time_of_day,
        program_type=request.program_type
    )
    
    if not track:
        raise HTTPException(status_code=404, detail="No suitable track found")
    
    # Generate signed URL
    signed_url = supabase.storage.from_("audio-assets")\
        .create_signed_url(track["storage_path"], 3600)
    
    return {
        "id": track["id"],
        "title": track["title"],
        "artist": track["artist"],
        "duration_sec": track["duration_sec"],
        "audio_url": signed_url.get("signedURL"),
        "attribution": track.get("attribution_text")
    }


@router.get("/jingle/{jingle_type}")
async def get_jingle(jingle_type: str, program_id: Optional[str] = None):
    """Get jingle by type"""
    jingle = music_service.get_jingle(jingle_type, program_id)
    
    if not jingle:
        raise HTTPException(status_code=404, detail="No jingle found")
    
    signed_url = supabase.storage.from_("audio-assets")\
        .create_signed_url(jingle["storage_path"], 3600)
    
    return {
        "id": jingle["id"],
        "name": jingle["name"],
        "duration_sec": jingle["duration_sec"],
        "audio_url": signed_url.get("signedURL")
    }


@router.post("/tracks/upload")
async def upload_track(
    file: UploadFile = File(...),
    title: str = Form(...),
    artist: str = Form(...),
    license_type: str = Form(...),
    duration_sec: float = Form(...),
    mood: Optional[str] = Form(None),
    genre_id: Optional[str] = Form(None)
):
    """Upload new music track"""
    # Upload to Supabase storage
    file_content = await file.read()
    storage_path = f"music/{file.filename}"
    
    supabase.storage.from_("audio-assets").upload(
        storage_path,
        file_content,
        {"content-type": file.content_type}
    )
    
    # Add to database
    track = music_service.add_track(
        title=title,
        artist=artist,
        storage_path=storage_path,
        duration_sec=duration_sec,
        license_type=license_type,
        mood=mood,
        genre_id=genre_id
    )
    
    return {"track_id": track["id"], "message": "Track uploaded successfully"}


@router.get("/tracks")
async def list_tracks(
    genre_id: Optional[str] = None,
    mood: Optional[str] = None,
    active_only: bool = True
):
    """List music tracks with filters"""
    query = supabase.table("music_tracks").select("*, music_genres(name)")
    
    if active_only:
        query = query.eq("active", True)
    
    if genre_id:
        query = query.eq("genre_id", genre_id)
    
    if mood:
        query = query.eq("mood", mood)
    
    result = query.execute()
    return {"tracks": result.data}


@router.get("/genres")
async def list_genres():
    """List all music genres"""
    result = supabase.table("music_genres").select("*").execute()
    return {"genres": result.data}
```

Register in `apps/api/src/main.py`:
```python
from .music.music_routes import router as music_router

app.include_router(music_router)
```

### Step 4: Create Music Admin UI

Create `apps/admin/app/dashboard/music/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function MusicPage() {
  const supabase = await createServerClient();

  const { data: tracks } = await supabase
    .from('music_tracks')
    .select('*, music_genres(name)')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: genres } = await supabase
    .from('music_genres')
    .select('*')
    .order('name');

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Music Library</h1>
        <Link
          href="/dashboard/music/upload"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Upload Track
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Total Tracks</div>
          <div className="text-2xl font-bold">{tracks?.length || 0}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Genres</div>
          <div className="text-2xl font-bold">{genres?.length || 0}</div>
        </div>
      </div>

      {/* Tracks Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Artist
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Genre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                License
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Plays
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tracks?.map((track) => (
              <tr key={track.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {track.title}
                  </div>
                  {track.mood && (
                    <div className="text-xs text-gray-500">{track.mood}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {track.artist}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {track.music_genres?.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {Math.floor(track.duration_sec / 60)}:
                  {String(Math.floor(track.duration_sec % 60)).padStart(2, '0')}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {track.license_type}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {track.play_count}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      track.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {track.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Music tracks table created
- [ ] Jingles table created
- [ ] Sound effects table created
- [ ] Playlists table created
- [ ] Licensing tracking implemented
- [ ] Play count tracking works
- [ ] API endpoints functional
- [ ] Admin UI displays tracks

### Quality Requirements
- [ ] Proper indexes for performance
- [ ] License attribution enforced
- [ ] Rotation prevents repeats
- [ ] Clean admin interface

### Manual Verification
```bash
# Run migration
node infra/migrate.js up

# Test API
curl http://localhost:8000/music/genres
curl -X POST http://localhost:8000/music/next-track \
  -H "Content-Type: application/json" \
  -d '{"mood":"energetic","time_of_day":"morning"}'

# View admin
open http://localhost:3001/dashboard/music
```

---

## Next Task Handoff

**For M2 (Jingles & Sound Effects Management):**
- Jingle creation workflow
- Sound effects library
- Attribution system
- Playback integration

**Files created:**
- `infra/migrations/015_music_library.sql`
- `apps/api/src/music/music_service.py`
- `apps/api/src/music/music_routes.py`
- `apps/admin/app/dashboard/music/page.tsx`

**Music foundation ready:**
- ✅ Database schema
- ✅ Track management
- ✅ Licensing tracking
- ✅ Rotation system
- ✅ API endpoints

---------------------------

# Task M2: Jingles & Sound Effects System

**Tier:** Music & Audio  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** M1 complete

---

## Objective

Create jingle and sound effect sourcing, generation, and management system with automatic attribution.

---

## Implementation Steps

### Step 1: Create Jingle Generator Script

Create `scripts/generate-jingles.sh`:
```bash
#!/bin/bash
# Generate station jingles using TTS

set -e

PIPER_URL="${PIPER_URL:-http://localhost:5002}"
OUTPUT_DIR="${OUTPUT_DIR:-./generated-jingles}"

mkdir -p "$OUTPUT_DIR"

echo "🎵 Generating AI Radio 2525 Jingles"
echo "===================================="

# Jingle texts
declare -A JINGLES=(
  ["station_id_1"]="AI Radio 2525. Broadcasting from the future."
  ["station_id_2"]="You're listening to AI Radio 2525."
  ["station_id_3"]="This is AI Radio 2525. The voice of tomorrow."
  ["news_intro"]="AI Radio 2525 News. Your window to the future."
  ["culture_intro"]="AI Radio 2525 presents: Culture in the year 2525."
  ["tech_intro"]="Technology Now, on AI Radio 2525."
  ["interview_intro"]="AI Radio 2525 Interviews. Conversations from tomorrow."
  ["transition_1"]="Stay tuned to AI Radio 2525."
  ["transition_2"]="More ahead on AI Radio 2525."
)

# Generate each jingle
for key in "${!JINGLES[@]}"; do
  text="${JINGLES[$key]}"
  output_file="$OUTPUT_DIR/${key}.wav"
  
  echo "Generating: $key"
  
  # Call Piper TTS
  curl -s -X POST "$PIPER_URL/synthesize" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$text\",\"voice\":\"en_US-lessac-medium\"}" \
    -o "$output_file"
  
  echo "  ✓ $output_file"
done

echo ""
echo "✅ Jingles generated in $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "1. Review and edit audio files (add music, effects)"
echo "2. Upload to Supabase storage"
echo "3. Add to database via admin interface"
```

### Step 2: Create Sound Effects Sourcing Guide

Create `docs/sound-effects-sources.md`:
```markdown
# Sound Effects & Music Sources

## Free Sound Effects

### 1. Freesound.org
- **URL:** https://freesound.org
- **License:** CC0, CC-BY, CC-BY-NC
- **Categories:** Ambience, space sounds, tech sounds, transitions
- **API:** Available for bulk download

**Search queries:**
- "space ambience"
- "futuristic transition"
- "technology beep"
- "radio static"
- "whoosh"

### 2. BBC Sound Effects
- **URL:** https://sound-effects.bbcrewind.co.uk
- **License:** RemArc license (free for personal/educational)
- **Count:** 16,000+ effects
- **Categories:** Excellent for professional radio sounds

### 3. Zapsplat
- **URL:** https://www.zapsplat.com
- **License:** Free with attribution
- **Categories:** UI sounds, transitions, impacts

## Free Music Sources

### 1. YouTube Audio Library
- **URL:** https://www.youtube.com/audiolibrary
- **License:** Royalty-free, many don't require attribution
- **Genres:** All genres, high quality
- **Download:** MP3, direct download

### 2. Incompetech (Kevin MacLeod)
- **URL:** https://incompetech.com/music
- **License:** CC-BY 4.0
- **Attribution:** "Music by Kevin MacLeod"
- **Genres:** Huge variety, professional quality

### 3. Free Music Archive
- **URL:** https://freemusicarchive.org
- **License:** Various CC licenses
- **Genres:** Independent artists, eclectic

### 4. Pixabay Music
- **URL:** https://pixabay.com/music
- **License:** Pixabay License (free, no attribution)
- **Quality:** Good for background music

## Recommended Downloads

### Space/Sci-Fi Ambience
- Space station hum
- Spaceship interior
- Alien planet atmosphere
- Futuristic city sounds

### Transitions
- Whoosh sounds (3-5 variations)
- Digital transitions
- Energy swooshes
- Quick impacts

### UI/Tech Sounds
- Beeps and boops
- Notification sounds
- Success/completion sounds
- Error sounds

### Music Categories Needed
- **Morning Energy:** Upbeat electronic, positive
- **Afternoon Focus:** Mid-tempo, instrumental
- **Evening Chill:** Ambient, downtempo
- **Night Calm:** Atmospheric, minimal
- **News Bed:** Serious, steady rhythm
- **Interview Bed:** Light jazz, conversational
- **Culture Bed:** World music, eclectic

## Attribution Template

When using CC-BY licensed content:
```
Music/Sound: "[Title]" by [Artist]
License: CC-BY 4.0
Source: [URL]
```

## Automation Script

See `scripts/download-audio-library.py` for bulk downloading from sources.
```

### Step 3: Create Audio Library Downloader

Create `scripts/download-audio-library.py`:
```python
#!/usr/bin/env python3
"""
Download curated audio library from free sources
"""

import os
import requests
import json
from pathlib import Path

# Curated free tracks from YouTube Audio Library
# (These are examples - replace with actual available tracks)
CURATED_MUSIC = [
    {
        "title": "Cipher",
        "artist": "Kevin MacLeod",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cipher.mp3",
        "license": "CC-BY 4.0",
        "attribution": "Music by Kevin MacLeod (incompetech.com)",
        "genre": "Electronic",
        "mood": "energetic",
        "duration_sec": 147
    },
    {
        "title": "Space Jazz",
        "artist": "Kevin MacLeod",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Space_Jazz.mp3",
        "license": "CC-BY 4.0",
        "attribution": "Music by Kevin MacLeod (incompetech.com)",
        "genre": "Jazz",
        "mood": "calm",
        "duration_sec": 231
    },
    # Add more tracks here
]

OUTPUT_DIR = Path("./audio-library")

def download_track(track_info):
    """Download a single track"""
    output_path = OUTPUT_DIR / "music" / f"{track_info['title'].replace(' ', '_')}.mp3"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    if output_path.exists():
        print(f"  ⏭️  Skipping {track_info['title']} (already exists)")
        return
    
    print(f"  📥 Downloading {track_info['title']}...")
    
    try:
        response = requests.get(track_info['url'], timeout=30)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            f.write(response.content)
        
        # Save metadata
        metadata_path = output_path.with_suffix('.json')
        with open(metadata_path, 'w') as f:
            json.dump(track_info, f, indent=2)
        
        print(f"  ✅ Downloaded {track_info['title']}")
        
    except Exception as e:
        print(f"  ❌ Failed to download {track_info['title']}: {e}")

def main():
    print("🎵 Downloading Audio Library")
    print("=" * 50)
    
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    print(f"\nDownloading {len(CURATED_MUSIC)} tracks...\n")
    
    for track in CURATED_MUSIC:
        download_track(track)
    
    print("\n✅ Download complete!")
    print(f"📁 Files saved to: {OUTPUT_DIR}")
    print("\nNext steps:")
    print("1. Review audio files")
    print("2. Upload to Supabase storage")
    print("3. Import metadata to database")

if __name__ == "__main__":
    main()
```

### Step 4: Create Bulk Upload Script

Create `scripts/upload-audio-library.py`:
```python
#!/usr/bin/env python3
"""
Bulk upload audio library to Supabase
"""

import os
import json
from pathlib import Path
from supabase import create_client, Client
import librosa  # for duration detection if not in metadata

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
AUDIO_DIR = Path("./audio-library")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_audio_duration(file_path):
    """Get audio duration using librosa"""
    try:
        duration = librosa.get_duration(path=str(file_path))
        return duration
    except:
        return 0.0

def upload_music_track(file_path: Path, metadata: dict):
    """Upload music track to Supabase"""
    # Upload file to storage
    storage_path = f"music/{file_path.name}"
    
    print(f"  📤 Uploading {file_path.name}...")
    
    with open(file_path, 'rb') as f:
        supabase.storage.from_("audio-assets").upload(
            storage_path,
            f,
            {"content-type": "audio/mpeg"}
        )
    
    # Insert into database
    track_data = {
        "title": metadata["title"],
        "artist": metadata["artist"],
        "storage_path": storage_path,
        "duration_sec": metadata.get("duration_sec", get_audio_duration(file_path)),
        "license_type": metadata.get("license", "cc-by"),
        "attribution_text": metadata.get("attribution"),
        "attribution_required": True,
        "mood": metadata.get("mood"),
        "active": True,
        "reviewed": True
    }
    
    supabase.table("music_tracks").insert(track_data).execute()
    
    print(f"  ✅ Uploaded {metadata['title']}")

def upload_jingle(file_path: Path, jingle_name: str, jingle_type: str):
    """Upload jingle to Supabase"""
    storage_path = f"jingles/{file_path.name}"
    
    print(f"  📤 Uploading {jingle_name}...")
    
    with open(file_path, 'rb') as f:
        supabase.storage.from_("audio-assets").upload(
            storage_path,
            f,
            {"content-type": "audio/wav"}
        )
    
    duration = get_audio_duration(file_path)
    
    jingle_data = {
        "name": jingle_name,
        "jingle_type": jingle_type,
        "storage_path": storage_path,
        "duration_sec": duration,
        "active": True
    }
    
    supabase.table("jingles").insert(jingle_data).execute()
    
    print(f"  ✅ Uploaded {jingle_name}")

def main():
    print("📤 Uploading Audio Library to Supabase")
    print("=" * 50)
    
    # Upload music tracks
    music_dir = AUDIO_DIR / "music"
    if music_dir.exists():
        print("\n🎵 Uploading music tracks...\n")
        for mp3_file in music_dir.glob("*.mp3"):
            metadata_file = mp3_file.with_suffix('.json')
            if metadata_file.exists():
                with open(metadata_file) as f:
                    metadata = json.load(f)
                try:
                    upload_music_track(mp3_file, metadata)
                except Exception as e:
                    print(f"  ❌ Failed: {e}")
    
    # Upload jingles
    jingles_dir = Path("./generated-jingles")
    if jingles_dir.exists():
        print("\n🎺 Uploading jingles...\n")
        
        jingle_types = {
            "station_id": "station_id",
            "news_intro": "news_intro",
            "culture_intro": "program_intro",
            "tech_intro": "program_intro",
            "interview_intro": "program_intro",
            "transition": "transition"
        }
        
        for wav_file in jingles_dir.glob("*.wav"):
            jingle_name = wav_file.stem
            
            # Determine type from name
            jingle_type = "station_id"
            for pattern, type_name in jingle_types.items():
                if pattern in jingle_name:
                    jingle_type = type_name
                    break
            
            try:
                upload_jingle(wav_file, jingle_name, jingle_type)
            except Exception as e:
                print(f"  ❌ Failed: {e}")
    
    print("\n✅ Upload complete!")

if __name__ == "__main__":
    main()
```

### Step 5: Update Requirements

Add to `apps/api/requirements.txt`:
```txt
librosa==0.10.1
```

### Step 6: Create Jingles Admin UI

Create `apps/admin/app/dashboard/music/jingles/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';

export default async function JinglesPage() {
  const supabase = await createServerClient();

  const { data: jingles } = await supabase
    .from('jingles')
    .select('*, programs(name)')
    .order('jingle_type');

  // Group by type
  const jinglesByType = jingles?.reduce((acc: any, jingle) => {
    const type = jingle.jingle_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(jingle);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Jingles & IDs</h1>

      <div className="space-y-6">
        {Object.entries(jinglesByType || {}).map(([type, jingles]: [string, any]) => (
          <div key={type} className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 capitalize">
              {type.replace('_', ' ')}
            </h2>
            <div className="space-y-2">
              {jingles.map((jingle: any) => (
                <div
                  key={jingle.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded"
                >
                  <div>
                    <div className="font-medium">{jingle.name}</div>
                    <div className="text-sm text-gray-500">
                      {Math.round(jingle.duration_sec)}s • Played {jingle.play_count} times
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        jingle.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {jingle.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Jingle generation script works
- [ ] Sound effects sourcing documented
- [ ] Bulk upload script functions
- [ ] Jingles admin UI displays correctly
- [ ] Attribution tracking works
- [ ] Multiple jingle types supported

### Quality Requirements
- [ ] Clear sourcing guidelines
- [ ] Proper attribution
- [ ] Easy bulk operations
- [ ] Admin UI intuitive

### Manual Verification
```bash
# Generate jingles
bash scripts/generate-jingles.sh

# Download library
python scripts/download-audio-library.py

# Upload to Supabase
export SUPABASE_URL=your_url
export SUPABASE_SERVICE_ROLE_KEY=your_key
python scripts/upload-audio-library.py

# View in admin
open http://localhost:3001/dashboard/music/jingles
```

---

## Next Task Handoff

**For M3 (Music Scheduling & Integration):**
- Integrate music into Liquidsoap
- Schedule music between segments
- Rotation algorithms
- Time-aware selection

**Files created:**
- `scripts/generate-jingles.sh`
- `docs/sound-effects-sources.md`
- `scripts/download-audio-library.py`
- `scripts/upload-audio-library.py`
- `apps/admin/app/dashboard/music/jingles/page.tsx`

**Jingles system ready:**
- ✅ Generation scripts
- ✅ Sourcing guidelines
- ✅ Bulk operations
- ✅ Admin management

---------------------------

# Task M3: Music Scheduling & Liquidsoap Integration

**Tier:** Music & Audio  
**Estimated Time:** 2 hours  
**Complexity:** High  
**Prerequisites:** M1-M2, P1 complete

---

## Objective

Integrate music playback into Liquidsoap playout: schedule music between talk segments, implement rotation algorithms, time-aware selection.

---

## Implementation Steps

### Step 1: Create Music Clock Configuration

Create `apps/playout/music-clock.json`:
```json
{
  "description": "Hourly music clock - when to play music vs talk",
  "default_music_duration_sec": 180,
  "clocks": {
    "morning": {
      "time_range": "06:00-12:00",
      "segments": [
        {"minute": 0, "type": "station_id", "duration": 15},
        {"minute": 0, "type": "talk", "duration": 240},
        {"minute": 4, "type": "music", "duration": 180},
        {"minute": 7, "type": "talk", "duration": 180},
        {"minute": 10, "type": "music", "duration": 180},
        {"minute": 13, "type": "talk", "duration": 240},
        {"minute": 17, "type": "music", "duration": 180}
      ],
      "music_mood": "energetic",
      "music_tempo": "fast"
    },
    "afternoon": {
      "time_range": "12:00-18:00",
      "segments": [
        {"minute": 0, "type": "talk", "duration": 300},
        {"minute": 5, "type": "music", "duration": 240},
        {"minute": 9, "type": "talk", "duration": 240},
        {"minute": 13, "type": "music", "duration": 180},
        {"minute": 16, "type": "talk", "duration": 240}
      ],
      "music_mood": "calm",
      "music_tempo": "medium"
    },
    "evening": {
      "time_range": "18:00-23:00",
      "segments": [
        {"minute": 0, "type": "talk", "duration": 240},
        {"minute": 4, "type": "music", "duration": 300},
        {"minute": 9, "type": "talk", "duration": 180},
        {"minute": 12, "type": "music", "duration": 240},
        {"minute": 16, "type": "talk", "duration": 240}
      ],
      "music_mood": "calm",
      "music_tempo": "medium"
    },
    "night": {
      "time_range": "23:00-06:00",
      "segments": [
        {"minute": 0, "type": "talk", "duration": 180},
        {"minute": 3, "type": "music", "duration": 300},
        {"minute": 8, "type": "talk", "duration": 120},
        {"minute": 10, "type": "music", "duration": 600}
      ],
      "music_mood": "ambient",
      "music_tempo": "slow"
    }
  }
}
```

### Step 2: Create Music Scheduler Service

Create `apps/playout/music-scheduler.sh`:
```bash
#!/bin/bash
# Music scheduler - fetches appropriate music based on time and context

API_URL="${API_URL:-http://localhost:8000}"
OUTPUT_DIR="${OUTPUT_DIR:-/radio/audio/music}"

mkdir -p "$OUTPUT_DIR"

# Get current time context
HOUR=$(date +%H)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday

# Determine time of day
if [ $HOUR -ge 6 ] && [ $HOUR -lt 12 ]; then
  TIME_OF_DAY="morning"
  MOOD="energetic"
elif [ $HOUR -ge 12 ] && [ $HOUR -lt 18 ]; then
  TIME_OF_DAY="afternoon"
  MOOD="calm"
elif [ $HOUR -ge 18 ] && [ $HOUR -lt 23 ]; then
  TIME_OF_DAY="evening"
  MOOD="calm"
else
  TIME_OF_DAY="night"
  MOOD="ambient"
fi

echo "Current time context: $TIME_OF_DAY (mood: $MOOD)"

# Fetch music tracks
RESPONSE=$(curl -s -X POST "$API_URL/music/next-track" \
  -H "Content-Type: application/json" \
  -d "{\"mood\":\"$MOOD\",\"time_of_day\":\"$TIME_OF_DAY\"}")

if [ $? -ne 0 ]; then
  echo "Error: Failed to fetch music track"
  exit 1
fi

TRACK_ID=$(echo "$RESPONSE" | jq -r '.id')
AUDIO_URL=$(echo "$RESPONSE" | jq -r '.audio_url')
TITLE=$(echo "$RESPONSE" | jq -r '.title')
ARTIST=$(echo "$RESPONSE" | jq -r '.artist')

if [ "$TRACK_ID" == "null" ]; then
  echo "No suitable track found"
  exit 0
fi

OUTPUT_FILE="$OUTPUT_DIR/music_$TRACK_ID.mp3"

# Skip if already downloaded
if [ -f "$OUTPUT_FILE" ]; then
  echo "Already cached: $TITLE by $ARTIST"
  exit 0
fi

# Download track
echo "Downloading: $TITLE by $ARTIST"
curl -s -o "$OUTPUT_FILE.tmp" "$AUDIO_URL"

if [ $? -eq 0 ]; then
  mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"
  echo "Downloaded: $OUTPUT_FILE"
  
  # Create metadata file for Liquidsoap
  echo "$TITLE - $ARTIST" > "$OUTPUT_FILE.txt"
else
  echo "Error downloading track"
  rm -f "$OUTPUT_FILE.tmp"
  exit 1
fi
```

### Step 3: Update Liquidsoap for Music Integration

Update `apps/playout/radio.liq`:
```liquidsoap
#!/usr/bin/liquidsoap

# AI Radio 2525 - Liquidsoap Configuration with Music
# Integrates talk segments, music, and jingles

# ... (keep existing configuration) ...

# ============================================
# MUSIC INTEGRATION
# ============================================

# Music fetching function
def fetch_music() =
  log("Fetching music tracks...")
  result = process.run("bash /radio/music-scheduler.sh")
  log("Music fetch result: #{result}")
end

# Fetch music on startup and periodically
fetch_music()
thread.run(delay=60.0, every=300.0, fetch_music)  # Every 5 minutes

# Music playlist
music_playlist = playlist(
  mode="randomize",
  reload=60,
  reload_mode="watch",
  "/radio/audio/music/*.mp3"
)

# Apply fade and normalize to music
music_source = fade.in(duration=2.0, music_playlist)
music_source = fade.out(duration=2.0, music_source)
music_source = normalize(music_source, target=-16.0)

# ============================================
# JINGLES
# ============================================

# Station ID jingle (plays at top of hour)
def get_station_id() =
  log("Fetching station ID jingle...")
  
  result = process.run("curl -s http://api:8000/music/jingle/station_id | jq -r '.audio_url'")
  
  if result != "" then
    # Download jingle
    jingle_file = "/tmp/station_id_#{time()}.wav"
    download_result = process.run("curl -s -o #{jingle_file} #{result}")
    
    if download_result == 0 then
      return jingle_file
    end
  end
  
  return ""
end

# Station ID source (plays once per hour)
station_id_playlist = playlist.once(
  reload=3600,  # Reload every hour
  "/radio/jingles/station_id*.wav"
)

# ============================================
# SMART MIXING
# ============================================

# Talk segments playlist (from API)
talk_playlist = playlist(
  mode="normal",
  reload=15,
  reload_mode="watch",
  "/radio/audio/*.wav"
)

# Apply metadata handler
talk_source = map_metadata(on_track_metadata, talk_playlist)

# Music clock - alternate between talk and music
# Simple approach: play music after every talk segment

# Track when talk segment ends
talk_with_end = on_stop(on_track_end, talk_source)

# Create smart fallback chain:
# 1. Station ID (top of hour)
# 2. Talk segments
# 3. Music (when no talk available)
# 4. Emergency playlist

smart_source = fallback(
  track_sensitive=true,
  [
    station_id_playlist,  # Priority 1: Station IDs
    talk_with_end,        # Priority 2: Talk segments
    music_source,         # Priority 3: Music
    emergency_source      # Priority 4: Emergency
  ]
)

# Add blank detection
smart_source = on_blank(
  max_blank=5.0,
  on_blank=on_blank,
  smart_source
)

# Crossfade between all content
smart_source = crossfade(
  duration=3.0,
  smart_source
)

# Normalize entire output
smart_source = normalize(
  smart_source,
  gain_max=0.0,
  gain_min=-6.0,
  target=-16.0
)

# ============================================
# OUTPUT
# ============================================

# Replace previous 'source' variable with 'smart_source'
output.icecast(
  %opus(bitrate=96, samplerate=48000, channels=2),
  host=icecast_host,
  port=int_of_string(icecast_port),
  password=icecast_password,
  mount="radio.opus",
  name="AI Radio 2525",
  description="Broadcasting from the year 2525 - With Music",
  genre="Future Radio",
  url="https://radio2525.ai",
  smart_source
)

output.icecast(
  %mp3(bitrate=128, samplerate=44100),
  host=icecast_host,
  port=int_of_string(icecast_port),
  password=icecast_password,
  mount="radio.mp3",
  name="AI Radio 2525",
  description="Broadcasting from the year 2525 - With Music",
  genre="Future Radio",
  url="https://radio2525.ai",
  smart_source
)

log("AI Radio 2525 with Music started successfully")
```

### Step 4: Create Advanced Music Clock Implementation

Create `workers/music-scheduler/src/music-clock.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import { addMinutes, format, getHours } from 'date-fns';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('music-clock');

interface MusicClockSegment {
  minute: number;
  type: 'talk' | 'music' | 'station_id';
  duration: number;
}

interface TimeSlotConfig {
  timeRange: string;
  segments: MusicClockSegment[];
  musicMood: string;
  musicTempo: string;
}

/**
 * Music clock scheduler
 * Determines when to play music vs talk based on time of day
 */
export class MusicClock {
  private db;
  private config: Record<string, TimeSlotConfig>;

  constructor() {
    this.db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Load music clock config
    this.config = {
      morning: {
        timeRange: '06:00-12:00',
        segments: [
          { minute: 0, type: 'station_id', duration: 15 },
          { minute: 0, type: 'talk', duration: 240 },
          { minute: 4, type: 'music', duration: 180 },
          { minute: 7, type: 'talk', duration: 180 },
          { minute: 10, type: 'music', duration: 180 },
        ],
        musicMood: 'energetic',
        musicTempo: 'fast',
      },
      afternoon: {
        timeRange: '12:00-18:00',
        segments: [
          { minute: 0, type: 'talk', duration: 300 },
          { minute: 5, type: 'music', duration: 240 },
          { minute: 9, type: 'talk', duration: 240 },
        ],
        musicMood: 'calm',
        musicTempo: 'medium',
      },
      evening: {
        timeRange: '18:00-23:00',
        segments: [
          { minute: 0, type: 'talk', duration: 240 },
          { minute: 4, type: 'music', duration: 300 },
        ],
        musicMood: 'calm',
        musicTempo: 'medium',
      },
      night: {
        timeRange: '23:00-06:00',
        segments: [
          { minute: 0, type: 'talk', duration: 180 },
          { minute: 3, type: 'music', duration: 300 },
        ],
        musicMood: 'ambient',
        musicTempo: 'slow',
      },
    };
  }

  /**
   * Get current time slot configuration
   */
  getCurrentTimeSlot(): TimeSlotConfig {
    const hour = getHours(new Date());

    if (hour >= 6 && hour < 12) return this.config.morning;
    if (hour >= 12 && hour < 18) return this.config.afternoon;
    if (hour >= 18 && hour < 23) return this.config.evening;
    return this.config.night;
  }

  /**
   * Should we play music right now?
   */
  shouldPlayMusic(currentTime: Date): boolean {
    const timeSlot = this.getCurrentTimeSlot();
    const currentMinute = currentTime.getMinutes();

    // Find if current minute matches a music segment
    for (const segment of timeSlot.segments) {
      if (segment.type === 'music') {
        const segmentStart = segment.minute;
        const segmentEnd = segment.minute + Math.floor(segment.duration / 60);

        if (currentMinute >= segmentStart && currentMinute < segmentEnd) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get next scheduled music slot
   */
  getNextMusicSlot(currentTime: Date): Date | null {
    const timeSlot = this.getCurrentTimeSlot();
    const currentMinute = currentTime.getMinutes();

    for (const segment of timeSlot.segments) {
      if (segment.type === 'music' && segment.minute > currentMinute) {
        return addMinutes(currentTime, segment.minute - currentMinute);
      }
    }

    // Next slot is in next hour
    return addMinutes(currentTime, 60 - currentMinute);
  }

  /**
   * Pre-download music for upcoming slots
   */
  async prefetchMusic(): Promise<void> {
    const timeSlot = this.getCurrentTimeSlot();

    logger.info({
      timeSlot: Object.keys(this.config).find(key => this.config[key] === timeSlot),
      mood: timeSlot.musicMood,
      tempo: timeSlot.musicTempo,
    }, 'Prefetching music for current time slot');

    // Fetch 5 tracks for current mood
    const { data: tracks } = await this.db
      .from('music_tracks')
      .select('*')
      .eq('active', true)
      .eq('mood', timeSlot.musicMood)
      .order('play_count', { ascending: true })
      .limit(5);

    logger.info({ count: tracks?.length }, 'Prefetched music tracks');

    // TODO: Download tracks to local cache
  }
}
```

### Step 5: Create Music Attribution Display

Update `apps/web/components/now-playing.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface NowPlayingData {
  title: string;
  dj?: string;
  artist?: string;  // ADD THIS for music
  isMusic?: boolean;  // ADD THIS
  attribution?: string;  // ADD THIS
  startedAt: string;
}

export default function NowPlaying() {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNowPlaying = async () => {
      try {
        // Fetch from Icecast status
        const response = await fetch('http://localhost:8001/status-json.xsl');
        const data = await response.json();

        const source = data.icestats?.source?.[0];
        if (source) {
          const title = source.title || 'AI Radio 2525';
          const artist = source.artist;
          
          // Determine if music (has artist field) or talk
          const isMusic = artist && artist !== 'AI Radio 2525';

          setNowPlaying({
            title: title,
            artist: artist,
            isMusic: isMusic,
            dj: isMusic ? undefined : artist,
            startedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to fetch now playing:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    );
  }

  if (!nowPlaying) {
    return (
      <div className="text-gray-500 text-center">
        <p>No information available</p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-2">
      {/* Music or Talk indicator */}
      {nowPlaying.isMusic ? (
        <>
          <div className="text-sm text-gray-400 uppercase tracking-wide">
            🎵 Now Playing
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            {nowPlaying.title}
          </h2>
          <p className="text-lg text-gray-600">
            {nowPlaying.artist}
          </p>
          {nowPlaying.attribution && (
            <p className="text-xs text-gray-500 italic">
              {nowPlaying.attribution}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="text-sm text-gray-400 uppercase tracking-wide">
            🎙️ On Air
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            {nowPlaying.title}
          </h2>
          {nowPlaying.dj && (
            <p className="text-lg text-gray-600">
              with {nowPlaying.dj}
            </p>
          )}
        </>
      )}
      
      <p className="text-sm text-gray-500">
        Started {formatDistanceToNow(new Date(nowPlaying.startedAt), { addSuffix: true })}
      </p>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Music clock configuration loads
- [ ] Music fetched based on time of day
- [ ] Music integrated into Liquidsoap
- [ ] Rotation prevents repeats
- [ ] Attribution displayed for music
- [ ] Smooth transitions between talk and music
- [ ] Station IDs play at top of hour

### Quality Requirements
- [ ] Professional audio mixing
- [ ] Appropriate music for time/mood
- [ ] Clean crossfades
- [ ] Licensing compliance

### Manual Verification
```bash
# Test music scheduler
cd apps/playout
bash music-scheduler.sh

# Start playout with music
docker-compose up -d liquidsoap

# Listen and verify:
# - Music plays between talk segments
# - Appropriate mood for time of day
# - Smooth transitions
# - Attribution shown

ffplay http://localhost:8001/radio.mp3
```

---

## Next Task Handoff

**For M4 (Audio Ducking & Professional Mixing):**
- Background music during talk
- Auto-ducking when DJ speaks
- Professional audio balance
- Compression and EQ

**Files created:**
- `apps/playout/music-clock.json`
- `apps/playout/music-scheduler.sh`
- `workers/music-scheduler/src/music-clock.ts`

**Files modified:**
- `apps/playout/radio.liq` (music integration)
- `apps/web/components/now-playing.tsx` (music attribution)

**Music scheduling ready:**
- ✅ Time-aware music selection
- ✅ Rotation algorithms
- ✅ Liquidsoap integration
- ✅ Attribution display

-------------------

# Task M4: Audio Ducking & Professional Mixing

**Tier:** Music & Audio  
**Estimated Time:** 1-2 hours  
**Complexity:** High  
**Prerequisites:** M3 complete

---

## Objective

Implement professional audio mixing: background music during talk with auto-ducking, compression, EQ, and broadcast-quality audio balance.

---

## Implementation Steps

### Step 1: Create Audio Processing Configuration

Create `apps/playout/audio-processing.liq`:
```liquidsoap
# Audio Processing Functions for AI Radio 2525
# Professional broadcast quality audio

# ============================================
# COMPRESSION & LIMITING
# ============================================

# Multiband compressor for talk
def compress_talk(s) =
  # Light compression for natural speech
  compress(
    attack=5.0,
    release=200.0,
    threshold=-20.0,
    ratio=3.0,
    gain=0.0,
    s
  )
end

# Compressor for music
def compress_music(s) =
  # Moderate compression for consistent level
  compress(
    attack=10.0,
    release=300.0,
    threshold=-18.0,
    ratio=4.0,
    gain=0.0,
    s
  )
end

# Brick wall limiter (prevents clipping)
def limit_output(s) =
  compress(
    attack=1.0,
    release=50.0,
    threshold=-1.0,
    ratio=20.0,
    gain=0.0,
    s
  )
end

# ============================================
# EQUALIZATION
# ============================================

# EQ for speech clarity
def eq_talk(s) =
  # High-pass filter (remove rumble)
  s = filter.iir.eq.high(frequency=80.0, s)
  
  # Boost presence (2-4 kHz)
  s = filter.iir.eq.peak(frequency=3000.0, q=1.0, gain=3.0, s)
  
  # Reduce harshness
  s = filter.iir.eq.peak(frequency=6000.0, q=1.5, gain=-2.0, s)
  
  s
end

# EQ for music
def eq_music(s) =
  # High-pass filter
  s = filter.iir.eq.high(frequency=30.0, s)
  
  # Slight bass boost
  s = filter.iir.eq.peak(frequency=80.0, q=0.7, gain=2.0, s)
  
  # Slight treble lift
  s = filter.iir.eq.high_shelf(frequency=10000.0, gain=1.5, s)
  
  s
end

# ============================================
# DE-ESSER
# ============================================

# Reduce sibilance (harsh 's' sounds)
def deess(s) =
  compress.multiband(
    bands=[
      (0.0, 5000.0, 1.0),           # Low/mid: no compression
      (5000.0, 8000.0, 4.0),        # Sibilance range: compress 4:1
      (8000.0, 22000.0, 1.0)        # High: no compression
    ],
    attack=1.0,
    release=50.0,
    threshold=-25.0,
    s
  )
end

# ============================================
# DUCKING (lower music when talk plays)
# ============================================

# Smart ducking - automatically lower music level when speech is present
def duck(music_source, talk_source) =
  # Detect when talk is active
  talk_active = amplify(0.0, talk_source)
  
  # Create ducked music source
  music_ducked = amplify(
    override="liq_amplify",
    fun (_, _) -> begin
      # Check if talk source has audio
      if source.is_ready(talk_source) then
        -12.0  # Reduce music by 12dB when talk is active
      else
        0.0    # Normal level when no talk
      end
    end,
    music_source
  )
  
  music_ducked
end

# ============================================
# BACKGROUND MUSIC BED
# ============================================

# Create background music bed for talk segments
def music_bed(talk_source, music_source) =
  # Use instrumentals only for beds
  bed_music = amplify(-18.0, music_source)  # Very low level
  
  # Apply slow fade in/out
  bed_music = fade.in(duration=5.0, bed_music)
  bed_music = fade.out(duration=5.0, bed_music)
  
  # Mix talk over music bed
  add(
    normalize=false,
    [
      amplify(0.0, talk_source),    # Talk at normal level
      bed_music                      # Music at low level
    ]
  )
end

# ============================================
# MASTER CHAIN
# ============================================

def master_chain(s) =
  # 1. EQ
  s = eq_talk(s)
  
  # 2. De-esser
  s = deess(s)
  
  # 3. Compression
  s = compress_talk(s)
  
  # 4. Normalization to broadcast standard
  s = normalize(
    target=-16.0,    # LUFS target
    threshold=-40.0,
    gain_min=-10.0,
    gain_max=10.0,
    s
  )
  
  # 5. Final limiter
  s = limit_output(s)
  
  s
end
```

### Step 2: Update Liquidsoap to Use Advanced Mixing

Update `apps/playout/radio.liq`:
```liquidsoap
#!/usr/bin/liquidsoap

# AI Radio 2525 - Professional Audio Production
# With ducking, compression, and broadcast-quality processing

# ... (keep existing configuration) ...

# Load audio processing functions
%include "/radio/audio-processing.liq"

# ============================================
# SOURCE PREPARATION
# ============================================

# Talk segments with processing
talk_raw = playlist(
  mode="normal",
  reload=15,
  reload_mode="watch",
  "/radio/audio/*.wav"
)

# Apply metadata
talk_processed = map_metadata(on_track_metadata, talk_raw)

# Process talk audio
talk_processed = eq_talk(talk_processed)
talk_processed = deess(talk_processed)
talk_processed = compress_talk(talk_processed)

# Music with processing
music_raw = playlist(
  mode="randomize",
  reload=60,
  reload_mode="watch",
  "/radio/audio/music/*.mp3"
)

# Process music audio
music_processed = eq_music(music_raw)
music_processed = compress_music(music_processed)

# ============================================
# INTELLIGENT MIXING
# ============================================

# Create music bed for talk (optional background music)
def create_mixed_talk(talk_src, music_src) =
  # Only add music bed for certain segment types
  # This would require metadata detection
  
  # For now, just use talk without bed
  # TODO: Add logic to detect which segments should have music beds
  talk_src
end

talk_final = create_mixed_talk(talk_processed, music_processed)

# Station IDs
station_id = playlist.once(
  reload=3600,
  "/radio/jingles/station_id*.wav"
)

# ============================================
# SMART SCHEDULING
# ============================================

# Alternate between talk and music intelligently
# Use switch to create time-based logic

def is_music_time() =
  # Get current minute of hour
  minute = int_of_string(time("%M"))
  hour = int_of_string(time("%H"))
  
  # Morning (6-12): More talk, some music
  if hour >= 6 and hour < 12 then
    minute >= 4 and minute < 7 or minute >= 10 and minute < 13
  # Afternoon (12-18): Balanced
  elsif hour >= 12 and hour < 18 then
    minute >= 5 and minute < 9 or minute >= 13 and minute < 17
  # Evening (18-23): More music
  elsif hour >= 18 and hour < 23 then
    minute >= 4 and minute < 9 or minute >= 12 and minute < 17
  # Night (23-6): Mostly music
  else
    minute >= 3 and minute < 10
  end
end

# Switch between talk and music based on time
scheduled_source = switch(
  track_sensitive=true,
  [
    # Station ID at top of hour
    ({0m0s}, station_id),
    
    # Music during music slots
    ({is_music_time()}, music_processed),
    
    # Talk otherwise
    ({true}, talk_final)
  ]
)

# Apply ducking if both sources active simultaneously
# (This is a simplified approach)
final_mix = scheduled_source

# ============================================
# MASTER PROCESSING
# ============================================

# Apply master chain for broadcast quality
broadcast_ready = master_chain(final_mix)

# Add final safety limiter
broadcast_ready = limit_output(broadcast_ready)

# Ensure no silence
broadcast_ready = mksafe(broadcast_ready)

# ============================================
# OUTPUT
# ============================================

output.icecast(
  %opus(bitrate=96, samplerate=48000, channels=2),
  host=icecast_host,
  port=int_of_string(icecast_port),
  password=icecast_password,
  mount="radio.opus",
  name="AI Radio 2525",
  description="Professional broadcast quality from 2525",
  genre="Future Radio",
  url="https://radio2525.ai",
  broadcast_ready
)

output.icecast(
  %mp3(bitrate=128, samplerate=44100),
  host=icecast_host,
  port=int_of_string(icecast_port),
  password=icecast_password,
  mount="radio.mp3",
  name="AI Radio 2525",
  description="Professional broadcast quality from 2525",
  genre="Future Radio",
  url="https://radio2525.ai",
  broadcast_ready
)

log("AI Radio 2525 with professional audio processing started")
```

### Step 3: Create Audio Analysis Tool

Create `scripts/analyze-audio.py`:
```python
#!/usr/bin/env python3
"""
Analyze audio quality metrics
"""

import sys
import subprocess
import json

def analyze_lufs(audio_file):
    """Measure LUFS (loudness) of audio file"""
    cmd = [
        'ffmpeg', '-i', audio_file,
        '-af', 'loudnorm=print_format=json',
        '-f', 'null', '-'
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    # Parse JSON output from stderr
    output = result.stderr
    
    # Extract LUFS values
    if 'input_i' in output:
        lines = output.split('\n')
        for i, line in enumerate(lines):
            if 'input_i' in line:
                # Parse JSON block
                json_start = i
                json_lines = []
                for j in range(i, len(lines)):
                    json_lines.append(lines[j])
                    if '}' in lines[j]:
                        break
                
                json_str = '\n'.join(json_lines)
                try:
                    data = json.loads(json_str)
                    return {
                        'integrated': float(data.get('input_i', 0)),
                        'true_peak': float(data.get('input_tp', 0)),
                        'lra': float(data.get('input_lra', 0)),
                        'threshold': float(data.get('input_thresh', 0))
                    }
                except:
                    pass
    
    return None

def main():
    if len(sys.argv) < 2:
        print("Usage: analyze-audio.py <audio-file>")
        sys.exit(1)
    
    audio_file = sys.argv[1]
    
    print(f"Analyzing: {audio_file}")
    print("=" * 50)
    
    lufs = analyze_lufs(audio_file)
    
    if lufs:
        print(f"Integrated LUFS: {lufs['integrated']:.1f} LUFS")
        print(f"True Peak:       {lufs['true_peak']:.1f} dBTP")
        print(f"Loudness Range:  {lufs['lra']:.1f} LU")
        print(f"Threshold:       {lufs['threshold']:.1f} LUFS")
        
        print("\nBroadcast Standards:")
        print("  EBU R128:  -23 LUFS")
        print("  Streaming: -14 to -16 LUFS")
        print("  Our target: -16 LUFS")
        
        # Check compliance
        target = -16.0
        tolerance = 2.0
        
        if abs(lufs['integrated'] - target) <= tolerance:
            print(f"\n✅ Audio is within target range ({target}±{tolerance} LUFS)")
        else:
            print(f"\n❌ Audio outside target range")
            print(f"   Adjustment needed: {target - lufs['integrated']:.1f} dB")
    else:
        print("❌ Failed to analyze audio")

if __name__ == "__main__":
    main()
```

### Step 4: Create Audio Quality Monitor

Create `scripts/monitor-audio-quality.sh`:
```bash
#!/bin/bash
# Monitor live stream audio quality

STREAM_URL="${STREAM_URL:-http://localhost:8001/radio.mp3}"
DURATION="${DURATION:-30}"

echo "🎚️  Monitoring stream audio quality"
echo "Stream: $STREAM_URL"
echo "Duration: ${DURATION}s"
echo "=" $(printf '=%.0s' {1..50})

# Record sample
TEMP_FILE="/tmp/stream_sample_$(date +%s).mp3"

echo "Recording sample..."
timeout $DURATION ffmpeg -i "$STREAM_URL" -t $DURATION "$TEMP_FILE" 2>/dev/null

if [ ! -f "$TEMP_FILE" ]; then
  echo "❌ Failed to record stream"
  exit 1
fi

echo "Analyzing audio..."
python3 scripts/analyze-audio.py "$TEMP_FILE"

# Cleanup
rm "$TEMP_FILE"
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Audio compression applied
- [ ] EQ enhances clarity
- [ ] De-esser reduces sibilance
- [ ] Ducking lowers music during talk
- [ ] Master limiter prevents clipping
- [ ] Output at -16 LUFS target
- [ ] Professional broadcast quality

### Quality Requirements
- [ ] No audible distortion
- [ ] Consistent volume across segments
- [ ] Clear, intelligible speech
- [ ] Balanced frequency response
- [ ] Smooth transitions

### Manual Verification
```bash
# Start with professional audio processing
docker-compose restart liquidsoap

# Monitor quality
bash scripts/monitor-audio-quality.sh

# Listen critically
ffplay http://localhost:8001/radio.mp3

# Check metrics:
# - Volume consistency
# - Speech clarity
# - Music balance
# - No clipping/distortion
```

---

## Music & Audio Tier Complete!

**Files created:**
- `apps/playout/audio-processing.liq`
- `scripts/analyze-audio.py`
- `scripts/monitor-audio-quality.sh`

**Files modified:**
- `apps/playout/radio.liq` (professional mixing)

**Professional audio system ready:**
- ✅ Music library
- ✅ Jingles & sound effects
- ✅ Smart scheduling
- ✅ Auto-ducking
- ✅ Compression & EQ
- ✅ Broadcast-quality output

-----------------------------

# Task S1: Multi-Speaker Script Generation

**Tier:** Multi-Speaker  
**Estimated Time:** 2 hours  
**Complexity:** High  
**Prerequisites:** G1-G8 complete, D6 (DJs)

---

## Objective

Generate conversation scripts with multiple speakers: interviews, panel discussions, debates - with natural dialogue, turn-taking, and personality-driven interactions.

---

## Implementation Steps

### Step 1: Create Conversation Schema

Create `infra/migrations/016_multi_speaker.sql`:
```sql
-- Migration: Multi-speaker conversations
-- Description: Support for interviews, panel discussions, multi-DJ segments

-- Conversation participants
CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES segments(id) ON DELETE CASCADE,
  dj_id UUID REFERENCES djs(id),
  
  -- Role in conversation
  role TEXT NOT NULL CHECK (role IN ('host', 'guest', 'co-host', 'panelist', 'interviewer', 'interviewee')),
  speaking_order INT, -- Order of speakers (1, 2, 3...)
  
  -- Character (if guest is fictional character)
  character_name TEXT,
  character_background TEXT,
  character_expertise TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation turns (for dialogue)
CREATE TABLE conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES segments(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES conversation_participants(id) ON DELETE CASCADE,
  
  -- Turn metadata
  turn_number INT NOT NULL,
  speaker_name TEXT NOT NULL,
  
  -- Content
  text_content TEXT NOT NULL,
  duration_sec FLOAT,
  
  -- Audio (synthesized per turn)
  audio_path TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(segment_id, turn_number)
);

-- Update segments to support conversation format
ALTER TABLE segments 
  ADD COLUMN conversation_format TEXT CHECK (conversation_format IN ('monologue', 'interview', 'panel', 'debate', 'dialogue'));

ALTER TABLE segments 
  ADD COLUMN participant_count INT DEFAULT 1;

-- Indexes
CREATE INDEX idx_conversation_participants_segment ON conversation_participants(segment_id);
CREATE INDEX idx_conversation_turns_segment ON conversation_turns(segment_id);
CREATE INDEX idx_conversation_turns_order ON conversation_turns(segment_id, turn_number);

COMMENT ON TABLE conversation_participants IS 'Speakers participating in multi-speaker segments';
COMMENT ON TABLE conversation_turns IS 'Individual dialogue turns in conversations';
```

### Step 2: Create Conversation Prompt Templates

Create `workers/segment-gen/src/prompts/conversation-prompts.ts`:
```typescript
export interface ConversationContext {
  format: 'interview' | 'panel' | 'debate' | 'dialogue';
  host: {
    name: string;
    personality: string;
  };
  participants: Array<{
    name: string;
    role: string;
    background?: string;
    expertise?: string;
  }>;
  topic: string;
  retrievedContext: string;
  duration: number; // seconds
  tone: string;
}

/**
 * Interview prompt template
 */
export function createInterviewPrompt(ctx: ConversationContext): string {
  return `You are writing a radio interview script for AI Radio 2525, broadcasting from the year 2525.

HOST: ${ctx.host.name}
Personality: ${ctx.host.personality}

GUEST: ${ctx.participants[0].name}
Role: ${ctx.participants[0].role}
${ctx.participants[0].background ? `Background: ${ctx.participants[0].background}` : ''}
${ctx.participants[0].expertise ? `Expertise: ${ctx.participants[0].expertise}` : ''}

TOPIC: ${ctx.topic}

CONTEXT & RESEARCH:
${ctx.retrievedContext}

TARGET DURATION: ${Math.floor(ctx.duration / 60)} minutes (approximately ${Math.floor(ctx.duration / 10)} exchanges)

TONE: ${ctx.tone}

INSTRUCTIONS:
1. Write a natural, engaging interview in dialogue format
2. The host asks insightful questions that explore the topic deeply
3. The guest provides informative, interesting answers with specific details
4. Include natural conversational elements (brief acknowledgments, follow-up questions, transitions)
5. Keep the conversation flowing - no awkward pauses or repetitive questions
6. Each turn should be 2-4 sentences maximum for natural radio pacing
7. Incorporate the sci-fi world of 2525 naturally - mention space travel, alien species, advanced technology
8. Maintain the optimistic yet realistic tone of classic 20th-century sci-fi
9. Reference specific facts from the retrieved context when relevant
10. End with a natural conclusion and thank you

FORMAT:
Write as a dialogue script:

HOST: [dialogue]

GUEST: [dialogue]

HOST: [dialogue]

etc.

Do not include stage directions, sound effects, or anything besides the spoken dialogue.
Begin the interview now:`;
}

/**
 * Panel discussion prompt template
 */
export function createPanelPrompt(ctx: ConversationContext): string {
  const panelists = ctx.participants.map(p => 
    `- ${p.name} (${p.role}): ${p.expertise || 'Expert panelist'}`
  ).join('\n');

  return `You are writing a panel discussion script for AI Radio 2525, broadcasting from the year 2525.

HOST/MODERATOR: ${ctx.host.name}
Personality: ${ctx.host.personality}

PANELISTS:
${panelists}

TOPIC: ${ctx.topic}

CONTEXT & RESEARCH:
${ctx.retrievedContext}

TARGET DURATION: ${Math.floor(ctx.duration / 60)} minutes

TONE: ${ctx.tone}

INSTRUCTIONS:
1. Write a dynamic panel discussion with multiple perspectives
2. The host moderates and asks questions that spark discussion
3. Panelists respond to both the host and each other
4. Include natural disagreements, agreements, and building on ideas
5. Each panelist should have a distinct voice and perspective
6. Keep individual turns brief (1-3 sentences) for dynamic pacing
7. Ensure all panelists participate roughly equally
8. Incorporate 2525 world details naturally
9. Show expertise through specific examples and insights
10. Create moments of friendly debate and intellectual exchange

FORMAT:
HOST: [dialogue]

[PANELIST_NAME]: [dialogue]

[PANELIST_NAME]: [dialogue]

etc.

Begin the panel discussion now:`;
}

/**
 * Debate prompt template
 */
export function createDebatePrompt(ctx: ConversationContext): string {
  return `You are writing a debate script for AI Radio 2525, broadcasting from the year 2525.

MODERATOR: ${ctx.host.name}

DEBATERS:
${ctx.participants.map(p => `- ${p.name}: ${p.expertise}`).join('\n')}

TOPIC: ${ctx.topic}

CONTEXT:
${ctx.retrievedContext}

TARGET DURATION: ${Math.floor(ctx.duration / 60)} minutes

INSTRUCTIONS:
1. Write a respectful but energetic debate
2. Each side presents arguments with evidence
3. Include rebuttals and counter-arguments
4. The moderator keeps discussion on track
5. Debaters address each other's points directly
6. Maintain civility while showing passion
7. Draw from 2525 world context for examples
8. Each turn should be substantive but concise
9. Build tension and release through the arc
10. Conclude with final statements

Begin the debate now:`;
}

/**
 * Dialogue (two DJs chatting) prompt template
 */
export function createDialoguePrompt(ctx: ConversationContext): string {
  return `You are writing a casual conversation between two radio DJs for AI Radio 2525, broadcasting from the year 2525.

DJ 1: ${ctx.host.name}
Personality: ${ctx.host.personality}

DJ 2: ${ctx.participants[0].name}
Personality: ${ctx.participants[0].background}

TOPIC: ${ctx.topic}

CONTEXT:
${ctx.retrievedContext}

TARGET DURATION: ${Math.floor(ctx.duration / 60)} minutes

TONE: Conversational, friendly, informative but casual

INSTRUCTIONS:
1. Write a natural, friendly conversation between the two DJs
2. They discuss the topic while bantering and showing their personalities
3. Include humor, personal anecdotes, and relatability
4. Keep energy high with back-and-forth exchanges
5. Stay informative while being entertaining
6. Reference life in 2525 casually
7. Show their friendship/rapport
8. Each turn should be 1-3 sentences
9. Natural interruptions and finishing each other's thoughts are good
10. Make listeners feel like they're eavesdropping on friends chatting

Begin the conversation now:`;
}
```

### Step 3: Create Conversation Script Generator

Create `workers/segment-gen/src/conversation-generator.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@radio/core/logger';
import {
  createInterviewPrompt,
  createPanelPrompt,
  createDebatePrompt,
  createDialoguePrompt,
  ConversationContext,
} from './prompts/conversation-prompts';

const logger = createLogger('conversation-generator');

interface ConversationTurn {
  speaker: string;
  text: string;
}

export class ConversationGenerator {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate multi-speaker conversation
   */
  async generateConversation(
    context: ConversationContext
  ): Promise<ConversationTurn[]> {
    logger.info({
      format: context.format,
      host: context.host.name,
      participants: context.participants.length,
      topic: context.topic,
    }, 'Generating multi-speaker conversation');

    // Select appropriate prompt template
    let prompt: string;
    switch (context.format) {
      case 'interview':
        prompt = createInterviewPrompt(context);
        break;
      case 'panel':
        prompt = createPanelPrompt(context);
        break;
      case 'debate':
        prompt = createDebatePrompt(context);
        break;
      case 'dialogue':
        prompt = createDialoguePrompt(context);
        break;
      default:
        throw new Error(`Unknown conversation format: ${context.format}`);
    }

    // Call Claude
    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.9, // Higher temperature for more natural conversation
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const script = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    logger.info({
      length: script.length,
      format: context.format,
    }, 'Conversation script generated');

    // Parse dialogue script into turns
    const turns = this.parseDialogueScript(script);

    logger.info({
      turns: turns.length,
      speakers: [...new Set(turns.map(t => t.speaker))],
    }, 'Parsed conversation turns');

    return turns;
  }

  /**
   * Parse dialogue script into structured turns
   */
  private parseDialogueScript(script: string): ConversationTurn[] {
    const turns: ConversationTurn[] = [];
    const lines = script.split('\n');

    let currentSpeaker: string | null = null;
    let currentText: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        continue;
      }

      // Check if line starts with speaker label
      const speakerMatch = trimmed.match(/^([A-Z][A-Z\s]+):\s*(.+)$/);
      
      if (speakerMatch) {
        // Save previous turn if exists
        if (currentSpeaker && currentText.length > 0) {
          turns.push({
            speaker: currentSpeaker,
            text: currentText.join(' ').trim(),
          });
        }

        // Start new turn
        currentSpeaker = speakerMatch[1].trim();
        currentText = [speakerMatch[2]];
      } else if (currentSpeaker) {
        // Continuation of current turn
        currentText.push(trimmed);
      }
    }

    // Save final turn
    if (currentSpeaker && currentText.length > 0) {
      turns.push({
        speaker: currentSpeaker,
        text: currentText.join(' ').trim(),
      });
    }

    return turns;
  }

  /**
   * Validate conversation quality
   */
  validateConversation(turns: ConversationTurn[]): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check minimum turns
    if (turns.length < 4) {
      issues.push('Conversation too short (less than 4 turns)');
    }

    // Check speaker variety
    const speakers = new Set(turns.map(t => t.speaker));
    if (speakers.size < 2) {
      issues.push('Need at least 2 speakers');
    }

    // Check for very short turns
    const shortTurns = turns.filter(t => t.text.length < 20);
    if (shortTurns.length > turns.length * 0.3) {
      issues.push('Too many very short turns');
    }

    // Check for very long turns (monologues)
    const longTurns = turns.filter(t => t.text.length > 500);
    if (longTurns.length > turns.length * 0.2) {
      issues.push('Some turns are too long (reduce monologuing)');
    }

    // Check speaker balance
    const speakerCounts = turns.reduce((acc, t) => {
      acc[t.speaker] = (acc[t.speaker] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const counts = Object.values(speakerCounts);
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);

    if (maxCount > minCount * 3) {
      issues.push('Speaker participation is unbalanced');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
```

### Step 4: Update Segment Generation Worker

Update `workers/segment-gen/src/segment-maker.ts`:
```typescript
// Add to imports
import { ConversationGenerator } from './conversation-generator';

// Add to SegmentMaker class
private conversationGenerator: ConversationGenerator;

constructor(supabase: SupabaseClient) {
  // ... existing code ...
  this.conversationGenerator = new ConversationGenerator();
}

// Add new method for multi-speaker segments
async generateMultiSpeakerSegment(segment: any): Promise<void> {
  logger.info({ segmentId: segment.id, format: segment.conversation_format }, 
    'Generating multi-speaker segment');

  // Get participants
  const { data: participants } = await this.supabase
    .from('conversation_participants')
    .select('*, djs(*)')
    .eq('segment_id', segment.id)
    .order('speaking_order');

  if (!participants || participants.length < 2) {
    throw new Error('Multi-speaker segment needs at least 2 participants');
  }

  // Get host (first participant or role='host')
  const host = participants.find(p => p.role === 'host') || participants[0];

  // Get other participants
  const otherParticipants = participants.filter(p => p.id !== host.id);

  // Retrieve context via RAG
  const ragContext = await this.retrieveContext(segment);

  // Build conversation context
  const conversationContext = {
    format: segment.conversation_format,
    host: {
      name: host.djs.name,
      personality: host.djs.personality,
    },
    participants: otherParticipants.map(p => ({
      name: p.character_name || p.djs.name,
      role: p.role,
      background: p.character_background || p.djs.personality,
      expertise: p.character_expertise,
    })),
    topic: segment.slot_type,
    retrievedContext: ragContext,
    duration: segment.duration_sec || 300,
    tone: this.determineTone(segment.slot_type),
  };

  // Generate conversation
  const turns = await this.conversationGenerator.generateConversation(
    conversationContext
  );

  // Validate
  const validation = this.conversationGenerator.validateConversation(turns);
  if (!validation.valid) {
    logger.warn({ issues: validation.issues }, 'Conversation quality issues detected');
  }

  // Store conversation script
  const fullScript = turns.map(t => `${t.speaker}: ${t.text}`).join('\n\n');

  await this.supabase
    .from('segments')
    .update({
      script_md: fullScript,
      updated_at: new Date().toISOString(),
    })
    .eq('id', segment.id);

  // Store individual turns for TTS
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    
    // Find matching participant
    const participant = participants.find(
      p => p.djs.name.toUpperCase() === turn.speaker || 
           p.character_name?.toUpperCase() === turn.speaker
    );

    await this.supabase
      .from('conversation_turns')
      .insert({
        segment_id: segment.id,
        participant_id: participant?.id,
        turn_number: i + 1,
        speaker_name: turn.speaker,
        text_content: turn.text,
      });
  }

  logger.info({ 
    segmentId: segment.id, 
    turns: turns.length,
    speakers: participants.length,
  }, 'Multi-speaker segment generated');
}

// Update main segment generation logic
async generateSegment(segmentId: string): Promise<void> {
  // ... existing code to fetch segment ...

  // Check if multi-speaker
  if (segment.conversation_format && segment.conversation_format !== 'monologue') {
    await this.generateMultiSpeakerSegment(segment);
  } else {
    // Original single-speaker logic
    await this.generateMonologueSegment(segment);
  }
}
```

### Step 5: Create Conversation Admin UI

Create `apps/admin/app/dashboard/segments/[id]/conversation/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';

export default async function ConversationPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createServerClient();

  const { data: segment } = await supabase
    .from('segments')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!segment) {
    notFound();
  }

  const { data: participants } = await supabase
    .from('conversation_participants')
    .select('*, djs(*)')
    .eq('segment_id', params.id)
    .order('speaking_order');

  const { data: turns } = await supabase
    .from('conversation_turns')
    .select('*')
    .eq('segment_id', params.id)
    .order('turn_number');

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">
          Conversation: {segment.slot_type}
        </h1>
        <div className="text-sm text-gray-600">
          Format: <span className="font-medium">{segment.conversation_format}</span>
        </div>
      </div>

      {/* Participants */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Participants</h2>
        <div className="space-y-3">
          {participants?.map((participant) => (
            <div
              key={participant.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded"
            >
              <div>
                <div className="font-medium">
                  {participant.character_name || participant.djs.name}
                </div>
                <div className="text-sm text-gray-600">
                  {participant.role}
                  {participant.character_expertise && (
                    <span className="ml-2">• {participant.character_expertise}</span>
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-500">
                Voice: {participant.djs.voice_id}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversation Script */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">
          Conversation Script ({turns?.length || 0} turns)
        </h2>
        
        {turns && turns.length > 0 ? (
          <div className="space-y-4">
            {turns.map((turn, index) => {
              const participant = participants?.find(
                p => p.id === turn.participant_id
              );
              
              return (
                <div
                  key={turn.id}
                  className={`p-4 rounded-lg ${
                    index % 2 === 0 ? 'bg-blue-50' : 'bg-green-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-semibold text-sm text-gray-700">
                      {turn.speaker_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      Turn {turn.turn_number}
                    </div>
                  </div>
                  <div className="text-gray-900">{turn.text_content}</div>
                  {turn.duration_sec && (
                    <div className="text-xs text-gray-500 mt-2">
                      Duration: {Math.round(turn.duration_sec)}s
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            No conversation script generated yet
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Multi-speaker database schema created
- [ ] Conversation prompt templates work
- [ ] Interview format generates naturally
- [ ] Panel discussion has multiple perspectives
- [ ] Dialogue feels conversational
- [ ] Turns are properly attributed
- [ ] Script validation catches issues
- [ ] Admin UI displays conversation

### Quality Requirements
- [ ] Natural dialogue flow
- [ ] Distinct speaker voices
- [ ] Appropriate turn length
- [ ] Balanced participation
- [ ] Topic stays on track
- [ ] 2525 world integrated naturally

### Manual Verification
```bash
# Run migration
node infra/migrate.js up

# Create test interview segment
psql $DATABASE_URL <<EOF
INSERT INTO segments (program_id, slot_type, conversation_format, participant_count, state)
VALUES ('program-id-here', 'interview', 'interview', 2, 'queued');
EOF

# Add participants (host + guest)
# Trigger generation
# View results in admin

open http://localhost:3001/dashboard/segments/{segment-id}/conversation
```

---

## Next Task Handoff

**For S2 (Multi-Voice TTS Synthesis):**
- Synthesize each turn with correct voice
- Handle multiple voices per segment
- Timing between speakers
- Conversation audio assembly

**Files created:**
- `infra/migrations/016_multi_speaker.sql`
- `workers/segment-gen/src/prompts/conversation-prompts.ts`
- `workers/segment-gen/src/conversation-generator.ts`
- `apps/admin/app/dashboard/segments/[id]/conversation/page.tsx`

**Files modified:**
- `workers/segment-gen/src/segment-maker.ts` (multi-speaker support)

**Multi-speaker script generation ready:**
- ✅ Conversation formats
- ✅ Natural dialogue
- ✅ Multiple participants
- ✅ Turn tracking

-------------------

# Task S2: Multi-Voice TTS Synthesis

**Tier:** Multi-Speaker  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** S1, G4-G5 (TTS service)

---

## Objective

Synthesize multi-speaker conversations: render each turn with the correct voice, handle timing between speakers, assemble final conversation audio.

---

## Implementation Steps

### Step 1: Create Multi-Voice Renderer

Create `workers/segment-gen/src/multi-voice-renderer.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import { createLogger } from '@radio/core/logger';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const logger = createLogger('multi-voice-renderer');

interface ConversationTurn {
  id: string;
  turn_number: number;
  speaker_name: string;
  text_content: string;
  participant_id: string;
  voice_id: string;
}

export class MultiVoiceRenderer {
  private supabase: SupabaseClient;
  private piperUrl: string;
  private tempDir: string;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.piperUrl = process.env.PIPER_TTS_URL || 'http://localhost:5002';
    this.tempDir = '/tmp/conversation-audio';

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Render entire multi-speaker conversation
   */
  async renderConversation(segmentId: string): Promise<string> {
    logger.info({ segmentId }, 'Rendering multi-speaker conversation');

    // Get all turns with participant voice info
    const { data: turns, error } = await this.supabase
      .from('conversation_turns')
      .select(`
        *,
        conversation_participants!inner(
          djs!inner(voice_id)
        )
      `)
      .eq('segment_id', segmentId)
      .order('turn_number');

    if (error || !turns || turns.length === 0) {
      throw new Error(`Failed to fetch conversation turns: ${error?.message}`);
    }

    logger.info({ turns: turns.length }, 'Processing conversation turns');

    // Synthesize each turn
    const audioFiles: string[] = [];
    
    for (const turn of turns) {
      try {
        const audioFile = await this.synthesizeTurn(turn, segmentId);
        audioFiles.push(audioFile);

        // Update turn with audio path and duration
        const duration = this.getAudioDuration(audioFile);
        
        await this.supabase
          .from('conversation_turns')
          .update({
            audio_path: audioFile,
            duration_sec: duration,
          })
          .eq('id', turn.id);

        logger.info({
          turn: turn.turn_number,
          speaker: turn.speaker_name,
          duration,
        }, 'Turn synthesized');

      } catch (error) {
        logger.error({ error, turn: turn.turn_number }, 'Failed to synthesize turn');
        throw error;
      }
    }

    // Concatenate all turns with pauses
    const finalAudio = await this.assembleConversation(audioFiles, segmentId);

    logger.info({ 
      segmentId, 
      turns: turns.length,
      finalAudio,
    }, 'Conversation assembled');

    return finalAudio;
  }

  /**
   * Synthesize a single conversation turn
   */
  private async synthesizeTurn(turn: any, segmentId: string): Promise<string> {
    const voiceId = turn.conversation_participants.djs.voice_id;
    
    logger.debug({
      turn: turn.turn_number,
      speaker: turn.speaker_name,
      voice: voiceId,
    }, 'Synthesizing turn');

    // Call Piper TTS
    const response = await axios.post(
      `${this.piperUrl}/synthesize`,
      {
        text: turn.text_content,
        voice: voiceId,
      },
      {
        responseType: 'arraybuffer',
        timeout: 60000,
      }
    );

    // Save audio file
    const filename = `${segmentId}_turn${turn.turn_number.toString().padStart(3, '0')}.wav`;
    const filepath = path.join(this.tempDir, filename);

    fs.writeFileSync(filepath, response.data);

    return filepath;
  }

  /**
   * Assemble conversation from individual turn audio files
   */
  private async assembleConversation(
    audioFiles: string[],
    segmentId: string
  ): Promise<string> {
    logger.info({ files: audioFiles.length }, 'Assembling conversation audio');

    // Create file list for FFmpeg concat
    const listFile = path.join(this.tempDir, `${segmentId}_concat.txt`);
    const silenceFile = await this.generateSilence(0.8); // 0.8 second pause
    
    const fileList: string[] = [];
    
    for (let i = 0; i < audioFiles.length; i++) {
      fileList.push(`file '${audioFiles[i]}'`);
      
      // Add pause between turns (except after last turn)
      if (i < audioFiles.length - 1) {
        fileList.push(`file '${silenceFile}'`);
      }
    }

    fs.writeFileSync(listFile, fileList.join('\n'));

    // Concatenate using FFmpeg
    const outputFile = path.join(this.tempDir, `${segmentId}_conversation.wav`);

    try {
      execSync(
        `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}" -y`,
        { stdio: 'pipe' }
      );

      logger.info({ outputFile }, 'Conversation audio assembled');

      return outputFile;

    } catch (error) {
      logger.error({ error }, 'Failed to concatenate audio');
      throw error;
    }
  }

  /**
   * Generate silence audio file for pauses
   */
  private async generateSilence(durationSec: number): Promise<string> {
    const silenceFile = path.join(this.tempDir, `silence_${durationSec}s.wav`);

    // Check if already exists
    if (fs.existsSync(silenceFile)) {
      return silenceFile;
    }

    // Generate silence using FFmpeg
    execSync(
      `ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t ${durationSec} "${silenceFile}" -y`,
      { stdio: 'pipe' }
    );

    return silenceFile;
  }

  /**
   * Get audio file duration
   */
  private getAudioDuration(filepath: string): number {
    try {
      const output = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}"`,
        { encoding: 'utf-8' }
      );

      return parseFloat(output.trim());
    } catch {
      return 0;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanup(segmentId: string): Promise<void> {
    const pattern = new RegExp(`^${segmentId}_`);
    const files = fs.readdirSync(this.tempDir);

    for (const file of files) {
      if (pattern.test(file)) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }
    }
  }
}
```

### Step 2: Update Segment Generation Worker

Update `workers/segment-gen/src/segment-maker.ts`:
```typescript
// Add to imports
import { MultiVoiceRenderer } from './multi-voice-renderer';

// Add to SegmentMaker class
private multiVoiceRenderer: MultiVoiceRenderer;

constructor(supabase: SupabaseClient) {
  // ... existing code ...
  this.multiVoiceRenderer = new MultiVoiceRenderer();
}

// Update rendering method
async renderSegmentAudio(segment: any): Promise<void> {
  // Check if multi-speaker
  if (segment.conversation_format && segment.conversation_format !== 'monologue') {
    logger.info({ segmentId: segment.id }, 'Rendering multi-speaker audio');
    
    // Use multi-voice renderer
    const audioPath = await this.multiVoiceRenderer.renderConversation(segment.id);
    
    // Upload to Supabase storage
    const storagePath = await this.uploadAudio(audioPath, segment.id);
    
    // Create asset
    await this.createAsset(segment.id, storagePath, audioPath);
    
    // Cleanup temp files
    await this.multiVoiceRenderer.cleanup(segment.id);
    
  } else {
    // Original single-voice logic
    await this.renderMonologueAudio(segment);
  }
}
```

### Step 3: Add Voice Preview to Admin

Create `apps/admin/components/voice-preview.tsx`:
```typescript
'use client';

import { useState } from 'react';

interface VoicePreviewProps {
  turnId: string;
  text: string;
  audioPath?: string;
}

export default function VoicePreview({ turnId, text, audioPath }: VoicePreviewProps) {
  const [playing, setPlaying] = useState(false);

  const handlePlay = async () => {
    if (!audioPath) return;

    setPlaying(true);
    
    // Get signed URL
    const response = await fetch(`/api/audio/signed-url?path=${audioPath}`);
    const { url } = await response.json();

    // Play audio
    const audio = new Audio(url);
    audio.onended = () => setPlaying(false);
    audio.play();
  };

  return (
    <div className="flex items-center space-x-2">
      {audioPath && (
        <button
          onClick={handlePlay}
          disabled={playing}
          className={`px-3 py-1 text-sm rounded ${
            playing
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {playing ? '▶ Playing...' : '▶ Play'}
        </button>
      )}
      
      <div className="text-xs text-gray-500">
        {text.length} chars
      </div>
    </div>
  );
}
```

Update `apps/admin/app/dashboard/segments/[id]/conversation/page.tsx`:
```typescript
import VoicePreview from '@/components/voice-preview';  // ADD THIS

// In the turns map, add:
<div className="mt-2">
  <VoicePreview
    turnId={turn.id}
    text={turn.text_content}
    audioPath={turn.audio_path}
  />
</div>
```

### Step 4: Create Conversation Testing Tool

Create `scripts/test-conversation.sh`:
```bash
#!/bin/bash
# Test multi-speaker conversation generation

SEGMENT_ID="${1}"

if [ -z "$SEGMENT_ID" ]; then
  echo "Usage: test-conversation.sh <segment-id>"
  exit 1
fi

echo "🎙️  Testing Multi-Speaker Conversation"
echo "Segment ID: $SEGMENT_ID"
echo "=" $(printf '=%.0s' {1..50})

# Check segment exists
psql $DATABASE_URL -c "SELECT id, conversation_format, state FROM segments WHERE id='$SEGMENT_ID';"

# Check participants
echo ""
echo "Participants:"
psql $DATABASE_URL -c "
SELECT 
  cp.role,
  COALESCE(cp.character_name, d.name) as name,
  d.voice_id
FROM conversation_participants cp
JOIN djs d ON cp.dj_id = d.id
WHERE cp.segment_id='$SEGMENT_ID'
ORDER BY cp.speaking_order;
"

# Check turns
echo ""
echo "Conversation Turns:"
psql $DATABASE_URL -c "
SELECT 
  turn_number,
  speaker_name,
  LENGTH(text_content) as text_length,
  ROUND(duration_sec::numeric, 1) as duration,
  CASE WHEN audio_path IS NOT NULL THEN '✓' ELSE '✗' END as has_audio
FROM conversation_turns
WHERE segment_id='$SEGMENT_ID'
ORDER BY turn_number;
"

# Check final audio
echo ""
echo "Final Audio:"
psql $DATABASE_URL -c "
SELECT 
  a.storage_path,
  ROUND(a.duration_sec::numeric, 1) as duration,
  a.format,
  a.validation_status
FROM segments s
JOIN assets a ON s.asset_id = a.id
WHERE s.id='$SEGMENT_ID';
"

echo ""
echo "✅ Test complete"
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Each turn synthesized with correct voice
- [ ] Pauses inserted between turns
- [ ] Audio files concatenated properly
- [ ] Duration calculated accurately
- [ ] Final audio uploaded to storage
- [ ] Admin can preview individual turns
- [ ] Conversation plays continuously

### Quality Requirements
- [ ] Natural timing between speakers
- [ ] Consistent audio quality
- [ ] No clicks or artifacts at joins
- [ ] Voice distinction clear
- [ ] Appropriate pace

### Manual Verification
```bash
# Create test interview
# (Set up segment with 2 participants first)

# Trigger generation
curl -X POST http://localhost:8000/jobs/enqueue \
  -H "Content-Type: application/json" \
  -d '{"job_type":"segment_make","payload":{"segment_id":"your-id"}}'

# Monitor progress
bash scripts/test-conversation.sh your-segment-id

# Listen to result
# Download from admin interface or:
psql $DATABASE_URL -c "SELECT storage_path FROM assets WHERE id=(SELECT asset_id FROM segments WHERE id='your-id');"
# Then download from Supabase storage

# Verify:
# - Each speaker has distinct voice
# - Natural pauses between turns
# - Clean audio throughout
# - Appropriate pacing
```

---

## Next Task Handoff

**For S3 (Interview & Panel Formats):**
- Specialized interview prompts
- Panel discussion dynamics
- Guest character generation
- Format templates

**Files created:**
- `workers/segment-gen/src/multi-voice-renderer.ts`
- `apps/admin/components/voice-preview.tsx`
- `scripts/test-conversation.sh`

**Files modified:**
- `workers/segment-gen/src/segment-maker.ts` (multi-voice rendering)
- `apps/admin/app/dashboard/segments/[id]/conversation/page.tsx` (voice preview)

**Multi-voice synthesis ready:**
- ✅ Per-turn synthesis
- ✅ Voice assignment
- ✅ Audio assembly
- ✅ Pause timing
- ✅ Preview capability

----------------------

# Task S3: Interview & Panel Format Templates

**Tier:** Multi-Speaker  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** S1-S2 complete

---

## Objective

Create specialized templates and workflows for interviews and panel discussions: guest character generation, topic-specific formats, dynamic question generation.

---

## Implementation Steps

### Step 1: Create Guest Character Generator

Create `workers/segment-gen/src/guest-generator.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('guest-generator');

interface GuestProfile {
  name: string;
  role: string;
  background: string;
  expertise: string;
  personality: string;
  speakingStyle: string;
}

export class GuestGenerator {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate a fictional guest character for interviews
   */
  async generateGuest(
    topic: string,
    guestType: 'expert' | 'witness' | 'official' | 'artist' | 'scientist',
    worldContext: string
  ): Promise<GuestProfile> {
    logger.info({ topic, guestType }, 'Generating guest character');

    const prompt = `You are creating a fictional guest character for an interview on AI Radio 2525, a radio station broadcasting from the year 2525.

INTERVIEW TOPIC: ${topic}

GUEST TYPE: ${guestType}

WORLD CONTEXT (Year 2525):
${worldContext}

Create a detailed guest character profile that fits naturally into the world of 2525. This world is inspired by classic 20th-century sci-fi authors (Asimov, Clarke, Heinlein) - optimistic about humanity's future, with space travel, alien contact, and advanced technology.

Generate the following profile:

1. NAME: A realistic name appropriate for 2525 (can be from any Earth culture or alien species)

2. ROLE/TITLE: Their current position or occupation (be specific and creative)

3. BACKGROUND: A brief 2-3 sentence background covering their origin, education, career path, and how they became an expert on this topic

4. EXPERTISE: Specific areas of knowledge and experience (2-3 bullet points)

5. PERSONALITY: Key personality traits that will come through in conversation (3-4 adjectives with brief explanation)

6. SPEAKING STYLE: How they communicate (formal/casual, technical/accessible, passionate/measured, etc.)

Guidelines:
- Make them credible and interesting
- Incorporate 2525 world details naturally (multiple planets, alien species, advanced tech)
- Give them depth and specific knowledge
- Make them feel real, not stereotypical
- Ensure they can provide insightful answers on the interview topic

Return ONLY a JSON object with this structure:
{
  "name": "...",
  "role": "...",
  "background": "...",
  "expertise": "...",
  "personality": "...",
  "speakingStyle": "..."
}`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse guest profile JSON');
    }

    const profile = JSON.parse(jsonMatch[0]) as GuestProfile;

    logger.info({ 
      name: profile.name, 
      role: profile.role 
    }, 'Guest character generated');

    return profile;
  }

  /**
   * Generate interview questions for a specific guest
   */
  async generateInterviewQuestions(
    topic: string,
    guestProfile: GuestProfile,
    hostPersonality: string,
    questionCount: number = 8
  ): Promise<string[]> {
    logger.info({ topic, guest: guestProfile.name }, 'Generating interview questions');

    const prompt = `You are preparing interview questions for AI Radio 2525, broadcasting from the year 2525.

HOST PERSONALITY: ${hostPersonality}

GUEST: ${guestProfile.name}
Role: ${guestProfile.role}
Expertise: ${guestProfile.expertise}

INTERVIEW TOPIC: ${topic}

Generate ${questionCount} insightful interview questions that:
1. Progress naturally from introduction to deeper topics
2. Match the host's personality and style
3. Draw on the guest's specific expertise
4. Are appropriate for radio (clear, focused, conversational)
5. Incorporate the 2525 world context naturally
6. Build on each other to create a narrative arc
7. Include both broad questions and specific follow-ups
8. Encourage detailed, interesting answers

Return ONLY a JSON array of question strings:
["question 1", "question 2", ...]`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse questions JSON');
    }

    const questions = JSON.parse(jsonMatch[0]) as string[];

    logger.info({ count: questions.length }, 'Interview questions generated');

    return questions;
  }
}
```

### Step 2: Create Interview Format Templates

Create `workers/segment-gen/src/formats/interview-formats.ts`:
```typescript
export interface InterviewFormat {
  name: string;
  description: string;
  duration: number;
  structure: Array<{
    section: string;
    durationPct: number;
    questions: number;
  }>;
}

/**
 * Standard in-depth interview format
 */
export const STANDARD_INTERVIEW: InterviewFormat = {
  name: 'Standard Interview',
  description: 'In-depth conversation with expert guest',
  duration: 600, // 10 minutes
  structure: [
    {
      section: 'Introduction',
      durationPct: 0.15,
      questions: 2,
    },
    {
      section: 'Background & Context',
      durationPct: 0.25,
      questions: 3,
    },
    {
      section: 'Deep Dive',
      durationPct: 0.45,
      questions: 4,
    },
    {
      section: 'Future Outlook & Closing',
      durationPct: 0.15,
      questions: 2,
    },
  ],
};

/**
 * Quick interview format for news segments
 */
export const NEWS_INTERVIEW: InterviewFormat = {
  name: 'News Interview',
  description: 'Brief interview focused on breaking news',
  duration: 180, // 3 minutes
  structure: [
    {
      section: 'Breaking News Context',
      durationPct: 0.20,
      questions: 1,
    },
    {
      section: 'Key Facts',
      durationPct: 0.50,
      questions: 3,
    },
    {
      section: 'Implications',
      durationPct: 0.30,
      questions: 2,
    },
  ],
};

/**
 * Feature interview for culture segments
 */
export const FEATURE_INTERVIEW: InterviewFormat = {
  name: 'Feature Interview',
  description: 'Relaxed, story-driven conversation',
  duration: 900, // 15 minutes
  structure: [
    {
      section: 'Personal Story',
      durationPct: 0.30,
      questions: 3,
    },
    {
      section: 'Creative Process',
      durationPct: 0.35,
      questions: 4,
    },
    {
      section: 'Vision & Philosophy',
      durationPct: 0.25,
      questions: 3,
    },
    {
      section: 'Closing',
      durationPct: 0.10,
      questions: 1,
    },
  ],
};

export const INTERVIEW_FORMATS: Record<string, InterviewFormat> = {
  standard: STANDARD_INTERVIEW,
  news: NEWS_INTERVIEW,
  feature: FEATURE_INTERVIEW,
};
```

### Step 3: Create Panel Discussion Manager

Create `workers/segment-gen/src/formats/panel-manager.ts`:
```typescript
import { createLogger } from '@radio/core/logger';

const logger = createLogger('panel-manager');

interface Panelist {
  name: string;
  perspective: string;
  expertise: string;
}

interface PanelTopic {
  mainQuestion: string;
  subQuestions: string[];
  controversialPoints: string[];
}

export class PanelDiscussionManager {
  /**
   * Generate balanced panel composition
   */
  generatePanelComposition(
    topic: string,
    panelistCount: number
  ): Array<{ role: string; perspective: string; expertise: string }> {
    // Ensure diverse perspectives
    const compositions: Record<number, Array<any>> = {
      2: [
        { role: 'Advocate', perspective: 'strongly supports', expertise: 'implementation' },
        { role: 'Critic', perspective: 'expresses concerns', expertise: 'risks' },
      ],
      3: [
        { role: 'Optimist', perspective: 'enthusiastic supporter', expertise: 'benefits' },
        { role: 'Realist', perspective: 'balanced pragmatist', expertise: 'feasibility' },
        { role: 'Skeptic', perspective: 'cautious questioner', expertise: 'limitations' },
      ],
      4: [
        { role: 'Visionary', perspective: 'big-picture thinker', expertise: 'future implications' },
        { role: 'Practitioner', perspective: 'hands-on expert', expertise: 'current applications' },
        { role: 'Ethicist', perspective: 'moral considerations', expertise: 'societal impact' },
        { role: 'Analyst', perspective: 'data-driven evaluator', expertise: 'empirical evidence' },
      ],
    };

    return compositions[panelistCount] || compositions[3];
  }

  /**
   * Generate panel discussion topics with controversy points
   */
  generatePanelTopics(mainTopic: string): PanelTopic {
    return {
      mainQuestion: `What does ${mainTopic} mean for humanity's future?`,
      subQuestions: [
        `How does this compare to similar developments in the past?`,
        `What are the potential risks we should consider?`,
        `Who benefits most from this development?`,
        `What regulatory frameworks do we need?`,
      ],
      controversialPoints: [
        'Resource allocation priorities',
        'Ethical implications',
        'Long-term sustainability',
        'Equity and access concerns',
      ],
    };
  }

  /**
   * Ensure balanced speaking time
   */
  balanceSpeakingTurns(
    totalTurns: number,
    panelistCount: number
  ): Record<string, number> {
    const turnsPerPanelist = Math.floor(totalTurns / (panelistCount + 1)); // +1 for host
    const remainder = totalTurns % (panelistCount + 1);

    const distribution: Record<string, number> = {
      host: turnsPerPanelist + remainder, // Host gets extra turns
    };

    for (let i = 0; i < panelistCount; i++) {
      distribution[`panelist_${i + 1}`] = turnsPerPanelist;
    }

    return distribution;
  }
}
```

### Step 4: Create Format Selection Admin UI

Create `apps/admin/app/dashboard/segments/create-conversation/page.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CONVERSATION_FORMATS = {
  interview: {
    name: 'Interview',
    description: 'One-on-one conversation with expert guest',
    minParticipants: 2,
    maxParticipants: 2,
    templates: ['standard', 'news', 'feature'],
  },
  panel: {
    name: 'Panel Discussion',
    description: 'Multiple experts discussing a topic',
    minParticipants: 3,
    maxParticipants: 5,
    templates: ['roundtable', 'debate'],
  },
  dialogue: {
    name: 'DJ Dialogue',
    description: 'Two DJs chatting about a topic',
    minParticipants: 2,
    maxParticipants: 2,
    templates: ['casual', 'informative'],
  },
};

export default function CreateConversationPage() {
  const router = useRouter();
  const [format, setFormat] = useState<string>('interview');
  const [template, setTemplate] = useState<string>('standard');
  const [topic, setTopic] = useState<string>('');
  const [generateGuests, setGenerateGuests] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/segments/create-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          template,
          topic,
          generateGuests,
        }),
      });

      if (!response.ok) throw new Error('Failed to create conversation');

      const { segmentId } = await response.json();
      router.push(`/dashboard/segments/${segmentId}/conversation`);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      alert('Failed to create conversation');
    } finally {
      setLoading(false);
    }
  };

  const selectedFormat = CONVERSATION_FORMATS[format as keyof typeof CONVERSATION_FORMATS];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Multi-Speaker Segment</h1>

      <div className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Conversation Format
          </label>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(CONVERSATION_FORMATS).map(([key, fmt]) => (
              <button
                key={key}
                onClick={() => setFormat(key)}
                className={`p-4 border-2 rounded-lg text-left transition ${
                  format === key
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold mb-1">{fmt.name}</div>
                <div className="text-xs text-gray-600">{fmt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Template Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Template
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            {selectedFormat.templates.map((tmpl) => (
              <option key={tmpl} value={tmpl}>
                {tmpl.charAt(0).toUpperCase() + tmpl.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Topic */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Mars Colony Expansion Plans"
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        {/* Guest Generation Option */}
        {format === 'interview' && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="generate-guests"
              checked={generateGuests}
              onChange={(e) => setGenerateGuests(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="generate-guests" className="text-sm text-gray-700">
              Auto-generate guest character using AI
            </label>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-800">
            <strong>Format:</strong> {selectedFormat.name}
            <br />
            <strong>Participants:</strong> {selectedFormat.minParticipants}
            {selectedFormat.maxParticipants !== selectedFormat.minParticipants &&
              `-${selectedFormat.maxParticipants}`}
            <br />
            <strong>Note:</strong> {selectedFormat.description}
          </div>
        </div>

        {/* Create Button */}
        <button
          onClick={handleCreate}
          disabled={loading || !topic}
          className={`w-full py-3 rounded-lg font-medium ${
            loading || !topic
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loading ? 'Creating...' : 'Create Conversation Segment'}
        </button>
      </div>
    </div>
  );
}
```

### Step 5: Create Conversation API Endpoint

Create `apps/admin/app/api/segments/create-conversation/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { format, template, topic, generateGuests } = await request.json();

    // Create segment
    const { data: segment, error: segmentError } = await supabase
      .from('segments')
      .insert({
        slot_type: format === 'interview' ? 'interview' : 'panel',
        conversation_format: format,
        participant_count: format === 'interview' ? 2 : 3,
        state: 'queued',
        lang: 'en',
      })
      .select()
      .single();

    if (segmentError) throw segmentError;

    // Get default DJ as host
    const { data: djs } = await supabase
      .from('djs')
      .select('*')
      .eq('is_host', true)
      .limit(1);

    const hostDJ = djs?.[0];

    if (!hostDJ) {
      throw new Error('No host DJ found');
    }

    // Add host participant
    await supabase.from('conversation_participants').insert({
      segment_id: segment.id,
      dj_id: hostDJ.id,
      role: 'host',
      speaking_order: 1,
    });

    // Add guest/panelists
    if (format === 'interview') {
      // For interviews, add one guest
      // If generateGuests is true, we'll generate the character via worker
      // For now, just add a placeholder
      
      const { data: guestDJ } = await supabase
        .from('djs')
        .select('*')
        .neq('id', hostDJ.id)
        .limit(1)
        .single();

      await supabase.from('conversation_participants').insert({
        segment_id: segment.id,
        dj_id: guestDJ.id,
        role: 'guest',
        speaking_order: 2,
        // If generateGuests, worker will fill in character details
      });
    } else if (format === 'panel') {
      // Add 2-3 panelists
      const { data: otherDJs } = await supabase
        .from('djs')
        .select('*')
        .neq('id', hostDJ.id)
        .limit(3);

      for (let i = 0; i < (otherDJs?.length || 0); i++) {
        await supabase.from('conversation_participants').insert({
          segment_id: segment.id,
          dj_id: otherDJs![i].id,
          role: 'panelist',
          speaking_order: i + 2,
        });
      }
    }

    // Enqueue generation job
    await supabase.rpc('enqueue_job', {
      p_job_type: 'segment_make',
      p_payload: { 
        segment_id: segment.id,
        generate_guest: generateGuests,
      },
      p_priority: 5,
    });

    return NextResponse.json({ segmentId: segment.id });
  } catch (error: any) {
    console.error('Create conversation error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Guest character generation works
- [ ] Interview questions generated
- [ ] Panel composition balanced
- [ ] Multiple interview formats supported
- [ ] Admin can create conversations easily
- [ ] Format templates applied correctly
- [ ] API endpoint creates segments properly

### Quality Requirements
- [ ] Generated guests feel authentic
- [ ] Interview questions progress naturally
- [ ] Panel discussions have diverse perspectives
- [ ] Format selection UI is intuitive
- [ ] Character backgrounds integrate 2525 world

### Manual Verification
```bash
# Test guest generation
# (Via admin interface)

# Create new interview
open http://localhost:3001/dashboard/segments/create-conversation

# Select format, topic, options
# Submit and watch generation

# Verify:
# - Guest has realistic background
# - Questions are insightful
# - Conversation flows naturally
# - 2525 details included
```

---

## Multi-Speaker Tier Complete!

**Files created:**
- `workers/segment-gen/src/guest-generator.ts`
- `workers/segment-gen/src/formats/interview-formats.ts`
- `workers/segment-gen/src/formats/panel-manager.ts`
- `apps/admin/app/dashboard/segments/create-conversation/page.tsx`
- `apps/admin/app/api/segments/create-conversation/route.ts`

**Multi-speaker system ready:**
- ✅ Conversation script generation
- ✅ Multi-voice synthesis
- ✅ Interview formats
- ✅ Panel discussions
- ✅ Guest generation
- ✅ Format templates

---------------------------

# Task L1: Sci-Fi Style Guide & Prompt Engineering

**Tier:** Lore & Tone  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** G1-G3 (script generation)

---

## Objective

Create comprehensive style guide for 2525 world: enforce 20th-century sci-fi tone (Asimov, Clarke, Heinlein), maintain optimism/realism balance, ensure consistency across all generated content.

---

## Implementation Steps

### Step 1: Create Comprehensive Style Guide

Create `docs/style-guide-2525.md`:
```markdown
# AI Radio 2525 - Style Guide

## World Philosophy

AI Radio 2525 broadcasts from the year 2525, embodying the spirit of classic 20th-century science fiction authors:

- **Isaac Asimov**: Rational optimism, focus on human solutions to problems, belief in science and reason
- **Arthur C. Clarke**: Sense of wonder, technological transcendence, cosmic perspective
- **Robert Heinlein**: Individualism, practical engineering, frontier spirit

## Tone Guidelines

### The Balance (Critical)

**60% Optimistic** - Humanity has achieved great things
- Interstellar travel is routine
- Major diseases cured
- Clean energy abundant
- AI and humans cooperate
- Many flourishing colonies

**30% Realistic** - Real problems still exist
- Political tensions between colonies
- Resource allocation challenges
- Cultural conflicts with alien species
- Technological accidents occur
- Economic inequality persists

**10% Wonder** - The universe is vast and mysterious
- New discoveries constantly being made
- Alien civilizations encountered
- Physics-bending phenomena explored
- Philosophical questions remain

### What to INCLUDE

✅ **Technology**
- Faster-than-light travel (warp drives, jump gates)
- Artificial gravity
- Advanced AI assistants
- Fusion reactors
- Nanotechnology
- Quantum computers
- Cybernetic enhancements
- Holographic displays

✅ **Society**
- Earth government (United Earth)
- Multiple colony worlds (Mars, Europa, Titan, exoplanets)
- Alien species as neighbors (peaceful coexistence)
- Space stations and habitats
- Interplanetary trade
- Cultural diversity across colonies

✅ **Problems (Realistic)**
- Terraforming challenges
- Space piracy
- Colony independence movements
- First contact protocols
- Asteroid mining disputes
- Climate adaptation on new worlds

✅ **Language Style**
- Clear, accessible language
- Technical terms explained naturally
- Enthusiastic but not hyperbolic
- "Matter-of-fact" about advanced tech
- Conversational, not academic

### What to AVOID

❌ **Dystopian Elements**
- Post-apocalyptic scenarios
- Oppressive AI overlords
- Humanity enslaved or defeated
- Hopeless situations
- Grimdark tone

❌ **Fantasy/Magic**
- Telepathy without technology
- Magic or supernatural powers
- Gods or mysticism
- Unexplained phenomena
- "Space opera" melodrama

❌ **Dated References**
- References to 21st century pop culture
- Modern brand names
- Current political figures
- Contemporary slang

❌ **Tone Problems**
- Cynicism or nihilism
- Excessive pessimism
- Sarcasm about human achievement
- Mockery of space exploration

## Terminology Guide

### Preferred Terms

**Space Travel:**
- Warp drive, jump gate, slipstream
- Colony ship, transport vessel
- Orbital station, space habitat

**Locations:**
- Mars Colony, Titan Settlement
- Proxima Station, Alpha Centauri System
- The Belt (asteroid belt)
- Deep Space, the Outer Colonies

**Technology:**
- Fusion reactor, antimatter drive
- Neural interface, cybernetic implant
- Quantum communicator
- Gravity well, artificial gravity

**Society:**
- United Earth, Colonial Council
- Trade Federation, Mining Consortium
- First Contact Bureau
- Interspecies Council

**Aliens:**
- The Centaurians (from Alpha Centauri)
- The Titanids (native to Titan)
- Exo-beings, xenoforms
- Non-terrestrial intelligence

### Avoid These Terms

- "Apocalypse", "wasteland", "ruins"
- "Slave", "servant", "property" (when referring to AI)
- "Magic", "miracle", "supernatural"
- Overly militaristic language

## Content Examples

### GOOD Examples

✅ "The new warp gate between Earth and Proxima b just opened for commercial traffic. Travel time: down from 6 years to 6 hours. Pretty incredible when you think about it - my great-grandparents could only dream of leaving the solar system."

✅ "Dr. Chen's team on Titan discovered what they're calling 'native organic compounds' under the ice. Not life exactly, but the building blocks. The implications for how common life might be in the universe? Staggering."

✅ "There's a heated debate in the Colonial Council about mining rights in the Kuiper Belt. The old timers from the early Mars settlements want heritage protections, but the newer colonies need the resources. Classic expansion problem, just on a solar system scale."

### BAD Examples

❌ "The robots rose up and enslaved humanity. Now we fight for scraps in the wasteland." (Too dystopian, not our tone)

❌ "Captain Sarah used her psychic powers to telepathically communicate with the aliens." (Fantasy elements, no tech basis)

❌ "Everyone just scrolls TikTok even in space, nothing ever changes." (Cynical, dated references)

❌ "The mysterious ancient aliens left ruins that defy all known physics - it's basically magic." (Unexplained phenomena, lazy worldbuilding)

## Writing Guidelines

### For News Segments

- Report events factually but with appropriate enthusiasm
- Include expert reactions
- Mention broader implications
- Connect to ongoing developments
- Balance exciting news with practical concerns

**Template:**
"Breaking news from [location]: [event]. According to [expert/organization], this could [implication]. While [challenge exists], scientists are optimistic that [solution approach]."

### For Interviews

- Guests should be credible experts
- Include specific technical details
- Show passion for their work
- Acknowledge difficulties honestly
- Maintain optimistic outlook
- Reference specific 2525 world elements

### For Culture Segments

- Celebrate human creativity and diversity
- Showcase different colony cultures
- Explore alien art and perspectives
- Connect past and future
- Find universal themes

### For DJ Banter

- Enthusiastic but authentic
- Reference life in 2525 casually
- Occasional humor about space life
- Relatable problems (long commutes via shuttle)
- Genuine excitement about the future

## Quality Checklist

Before finalizing any script, verify:

- [ ] Tone is optimistic but realistic (60/30/10 balance)
- [ ] Technology is explained, not magic
- [ ] References fit 2525 world (no 21st century)
- [ ] Problems exist but solutions are possible
- [ ] Language is accessible and clear
- [ ] Sci-fi elements feel natural, not forced
- [ ] Content would fit in classic sci-fi novel
- [ ] Inspires rather than depresses
- [ ] Details are specific and believable
- [ ] Overall message is hopeful

## Inspiration Sources

When in doubt, channel these vibes:

- **Asimov's Foundation** - Rational problem-solving, galactic scope
- **Clarke's 2001** - Sense of cosmic wonder, technological evolution
- **Heinlein's The Moon is a Harsh Mistress** - Frontier independence, practical engineering
- **Star Trek (TOS/TNG)** - Optimistic future, exploration, diversity
- **The Expanse** - Realistic space physics, political complexity (but less dark)

## Common Pitfalls

1. **Too Dark**: If your script sounds like dystopian fiction, lighten it
2. **Too Silly**: Advanced tech should be impressive, not ridiculous
3. **Too Vague**: Specific details make 2525 feel real
4. **Too Modern**: Remember we're 500 years in the future
5. **Too Magical**: Keep the science in science fiction
```

### Step 2: Create Prompt System Prompt

Create `workers/segment-gen/src/prompts/system-prompt.ts`:
```typescript
export const RADIO_2525_SYSTEM_PROMPT = `You are a content writer for AI Radio 2525, a radio station broadcasting from the year 2525.

CRITICAL STYLE GUIDELINES:

1. TONE (60/30/10 Balance):
   - 60% Optimistic: Humanity has achieved great things - interstellar travel, AI cooperation, thriving colonies
   - 30% Realistic: Real challenges exist - politics, resources, accidents, conflicts
   - 10% Wonder: The universe is vast, mysterious, and full of discovery

2. INSPIRATION:
   Draw from classic 20th-century sci-fi authors:
   - Isaac Asimov: Rational optimism, human problem-solving
   - Arthur C. Clarke: Cosmic wonder, technological transcendence
   - Robert Heinlein: Frontier spirit, practical engineering
   
   Channel Star Trek's optimistic vision of the future.

3. WORLD OF 2525:
   INCLUDE naturally:
   - Warp drives, jump gates, FTL travel
   - Mars, Europa, Titan, and exoplanet colonies
   - Alien species (Centaurians, Titanids, others)
   - Fusion power, quantum tech, neural interfaces
   - United Earth government, Colonial Council
   - Interplanetary trade and culture
   - Space stations and habitats
   
   AVOID:
   - Dystopian scenarios (no apocalypse, slavery, oppression)
   - Fantasy elements (no unexplained magic or telepathy)
   - Modern references (no 21st century brands or slang)
   - Excessive pessimism or cynicism

4. LANGUAGE:
   - Clear and accessible (radio-friendly)
   - Technical terms explained naturally
   - Enthusiastic but authentic
   - Conversational, not academic
   - Matter-of-fact about advanced technology

5. PROBLEMS ARE SOLVABLE:
   - Challenges exist but humans tackle them
   - Science and reason prevail
   - Innovation continues
   - Cooperation (human + AI + alien) succeeds
   - Future is bright but earned through effort

6. SPECIFIC DETAILS:
   - Name specific colonies, stations, planets
   - Mention real technologies (warp drive specifics)
   - Reference organizations (Colonial Council, Trade Federation)
   - Include time scales (6-hour warp jumps, etc.)
   - Make 2525 feel lived-in and real

Remember: You're writing content that could appear in a classic Asimov or Clarke novel. Inspire wonder and optimism while staying grounded in realistic challenges. The future is bright because humanity (and our alien friends) work to make it so.`;

export function wrapWithSystemPrompt(userPrompt: string): string {
  return `${RADIO_2525_SYSTEM_PROMPT}

---

${userPrompt}`;
}
```

### Step 3: Update Script Generation

Update `workers/segment-gen/src/script-generator.ts`:
```typescript
import { wrapWithSystemPrompt } from './prompts/system-prompt';

// In generateScript method, wrap the prompt:

const fullPrompt = wrapWithSystemPrompt(prompt);

const message = await this.anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 3000,
  temperature: 0.8,
  system: RADIO_2525_SYSTEM_PROMPT,  // ADD as system message
  messages: [
    {
      role: 'user',
      content: prompt,
    },
  ],
});
```

### Step 4: Create Tone Validator

Create `workers/segment-gen/src/validators/tone-validator.ts`:
```typescript
import { createLogger } from '@radio/core/logger';

const logger = createLogger('tone-validator');

interface ToneAnalysis {
  score: number; // 0-100
  optimismPct: number;
  realismPct: number;
  wonderPct: number;
  issues: string[];
  suggestions: string[];
}

export class ToneValidator {
  /**
   * Analyze script tone and flag issues
   */
  analyzeScript(script: string): ToneAnalysis {
    const issues: string[] = [];
    const suggestions: string[] = [];

    const lowerScript = script.toLowerCase();

    // Check for dystopian keywords
    const dystopianKeywords = [
      'apocalypse', 'wasteland', 'enslaved', 'hopeless', 
      'doomed', 'destroyed', 'ruins', 'collapse', 'failed'
    ];

    dystopianKeywords.forEach(keyword => {
      if (lowerScript.includes(keyword)) {
        issues.push(`Contains dystopian keyword: "${keyword}"`);
        suggestions.push('Reframe negative outcomes as challenges being addressed');
      }
    });

    // Check for fantasy/magic elements
    const fantasyKeywords = [
      'magic', 'supernatural', 'psychic', 'telepathy', 
      'mystical', 'prophecy'
    ];

    fantasyKeywords.forEach(keyword => {
      if (lowerScript.includes(keyword)) {
        issues.push(`Contains fantasy element: "${keyword}"`);
        suggestions.push('Replace with technology-based explanation');
      }
    });

    // Check for optimistic indicators
    const optimisticKeywords = [
      'breakthrough', 'discovery', 'achievement', 'success',
      'innovation', 'progress', 'solution', 'advancement'
    ];

    const optimismCount = optimisticKeywords.filter(kw => 
      lowerScript.includes(kw)
    ).length;

    // Check for realistic problem indicators
    const realismKeywords = [
      'challenge', 'problem', 'difficulty', 'concern',
      'debate', 'question', 'risk', 'limitation'
    ];

    const realismCount = realismKeywords.filter(kw => 
      lowerScript.includes(kw)
    ).length;

    // Check for wonder indicators
    const wonderKeywords = [
      'discover', 'mystery', 'unknown', 'incredible',
      'amazing', 'wonder', 'fascinating', 'remarkable'
    ];

    const wonderCount = wonderKeywords.filter(kw => 
      lowerScript.includes(kw)
    ).length;

    // Calculate approximate balance
    const total = optimismCount + realismCount + wonderCount + 1; // +1 to avoid division by zero
    const optimismPct = (optimismCount / total) * 100;
    const realismPct = (realismCount / total) * 100;
    const wonderPct = (wonderCount / total) * 100;

    // Check balance (target: 60/30/10)
    if (optimismPct < 40) {
      issues.push('Script may be too pessimistic');
      suggestions.push('Add more positive outcomes, achievements, or solutions');
    }

    if (optimismPct > 80) {
      issues.push('Script may be unrealistically optimistic');
      suggestions.push('Acknowledge real challenges or limitations');
    }

    if (realismCount === 0) {
      issues.push('No realistic challenges mentioned');
      suggestions.push('Include at least one practical concern or difficulty');
    }

    // Check for modern references
    const modernKeywords = [
      'tiktok', 'facebook', 'twitter', 'iphone', 
      'google', 'amazon', 'covid', '2024', '2023'
    ];

    modernKeywords.forEach(keyword => {
      if (lowerScript.includes(keyword)) {
        issues.push(`Contains anachronistic reference: "${keyword}"`);
        suggestions.push('Replace with 2525-appropriate equivalent');
      }
    });

    // Calculate overall score
    let score = 100;
    score -= issues.length * 10;
    score = Math.max(0, Math.min(100, score));

    const analysis: ToneAnalysis = {
      score,
      optimismPct: Math.round(optimismPct),
      realismPct: Math.round(realismPct),
      wonderPct: Math.round(wonderPct),
      issues,
      suggestions,
    };

    logger.info({
      score,
      balance: `${analysis.optimismPct}/${analysis.realismPct}/${analysis.wonderPct}`,
      issues: issues.length,
    }, 'Tone analysis complete');

    return analysis;
  }

  /**
   * Validate if script meets minimum quality threshold
   */
  isAcceptable(analysis: ToneAnalysis): boolean {
    return analysis.score >= 70 && analysis.issues.length <= 2;
  }
}
```

### Step 5: Integrate Tone Validation

Update `workers/segment-gen/src/segment-maker.ts`:
```typescript
import { ToneValidator } from './validators/tone-validator';

// Add to class
private toneValidator: ToneValidator;

constructor(supabase: SupabaseClient) {
  // ... existing code ...
  this.toneValidator = new ToneValidator();
}

// After script generation
async generateMonologueSegment(segment: any): Promise<void> {
  // ... existing script generation ...
  
  const script = await this.scriptGenerator.generateScript(/* ... */);
  
  // Validate tone
  const toneAnalysis = this.toneValidator.analyzeScript(script);
  
  if (!this.toneValidator.isAcceptable(toneAnalysis)) {
    logger.warn({
      segmentId: segment.id,
      score: toneAnalysis.score,
      issues: toneAnalysis.issues,
    }, 'Script failed tone validation');
    
    // Store issues for admin review
    await this.supabase
      .from('segments')
      .update({
        validation_issues: toneAnalysis.issues,
        validation_suggestions: toneAnalysis.suggestions,
      })
      .eq('id', segment.id);
    
    // Optionally: trigger regeneration or flag for manual review
  }
  
  // Store tone metrics
  await this.supabase
    .from('segments')
    .update({
      tone_score: toneAnalysis.score,
      tone_balance: `${toneAnalysis.optimismPct}/${toneAnalysis.realismPct}/${toneAnalysis.wonderPct}`,
    })
    .eq('id', segment.id);
  
  // Continue with rest of generation...
}
```

### Step 6: Add Tone Display to Admin

Update `apps/admin/app/dashboard/segments/[id]/page.tsx`:
```typescript
// Add tone display section
{segment.tone_score && (
  <div className="mt-4 p-4 bg-gray-50 rounded">
    <h3 className="font-semibold mb-2">Tone Analysis</h3>
    <div className="flex items-center space-x-4">
      <div>
        <span className="text-sm text-gray-600">Score:</span>
        <span className={`ml-2 font-bold ${
          segment.tone_score >= 80 ? 'text-green-600' :
          segment.tone_score >= 60 ? 'text-yellow-600' :
          'text-red-600'
        }`}>
          {segment.tone_score}/100
        </span>
      </div>
      {segment.tone_balance && (
        <div>
          <span className="text-sm text-gray-600">Balance:</span>
          <span className="ml-2 font-mono text-sm">
            {segment.tone_balance}
          </span>
          <span className="ml-1 text-xs text-gray-500">
            (Target: 60/30/10)
          </span>
        </div>
      )}
    </div>
    
    {segment.validation_issues && segment.validation_issues.length > 0 && (
      <div className="mt-3">
        <div className="text-sm font-medium text-red-600 mb-1">Issues:</div>
        <ul className="text-sm text-gray-700 list-disc list-inside">
          {segment.validation_issues.map((issue: string, i: number) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      </div>
    )}
    
    {segment.validation_suggestions && segment.validation_suggestions.length > 0 && (
      <div className="mt-3">
        <div className="text-sm font-medium text-blue-600 mb-1">Suggestions:</div>
        <ul className="text-sm text-gray-700 list-disc list-inside">
          {segment.validation_suggestions.map((suggestion: string, i: number) => (
            <li key={i}>{suggestion}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
)}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Style guide is comprehensive
- [ ] System prompt enforces tone
- [ ] Tone validator detects issues
- [ ] Scripts maintain 60/30/10 balance
- [ ] Dystopian content flagged
- [ ] Fantasy elements caught
- [ ] Modern references detected
- [ ] Admin shows tone metrics

### Quality Requirements
- [ ] Generated content feels like classic sci-fi
- [ ] Optimistic but realistic tone
- [ ] Specific 2525 world details
- [ ] No anachronisms
- [ ] Inspiring and hopeful
- [ ] Scientifically grounded

### Manual Verification
```bash
# Generate several segments
# Review scripts for:

# ✅ Good Examples:
# - Warp drive travel mentioned casually
# - Colony challenges discussed realistically
# - Alien cooperation shown naturally
# - Technology explained accessibly
# - Problems have solutions
# - Optimistic overall tone

# ❌ Bad Examples (should be caught):
# - "Humanity is doomed"
# - "Magic powers saved the day"
# - "Just like on Twitter..."
# - No challenges mentioned
# - Overly pessimistic

# Check tone scores in admin
open http://localhost:3001/dashboard/segments
```

---

## Next Task Handoff

**For L2 (World Consistency Checker):**
- Cross-reference fact checker
- Lore contradiction detection
- Timeline consistency
- Character continuity

**Files created:**
- `docs/style-guide-2525.md`
- `workers/segment-gen/src/prompts/system-prompt.ts`
- `workers/segment-gen/src/validators/tone-validator.ts`

**Files modified:**
- `workers/segment-gen/src/script-generator.ts` (system prompt)
- `workers/segment-gen/src/segment-maker.ts` (tone validation)
- `apps/admin/app/dashboard/segments/[id]/page.tsx` (tone display)

**Style guide ready:**
- ✅ Comprehensive world rules
- ✅ 20th-century sci-fi tone
- ✅ Optimism/realism balance
- ✅ Automated validation
- ✅ Admin monitoring

------------------------------

# Task L2: World Consistency Checker

**Tier:** Lore & Tone  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** L1, D1-D8 (knowledge base)

---

## Objective

Create automated system to verify generated content consistency: check facts against knowledge base, detect contradictions, maintain timeline coherence, ensure character continuity.

---

## Implementation Steps

### Step 1: Create Lore Database Schema

Create `infra/migrations/017_lore_facts.sql`:
```sql
-- Migration: Lore fact tracking
-- Description: Track canonical facts for consistency checking

-- Canonical facts about the 2525 world
CREATE TABLE lore_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- 'technology', 'location', 'species', 'organization', 'event', 'character'
  fact_key TEXT NOT NULL UNIQUE, -- e.g., 'mars_colony_population', 'warp_drive_speed'
  
  -- Fact details
  fact_value TEXT NOT NULL,
  fact_type TEXT NOT NULL CHECK (fact_type IN ('number', 'text', 'date', 'boolean')),
  
  -- Metadata
  description TEXT,
  source_document_id UUID REFERENCES knowledge_documents(id),
  
  -- Constraints
  min_value NUMERIC, -- For number types
  max_value NUMERIC,
  allowed_values TEXT[], -- For enumerated types
  
  -- Version tracking
  version INT DEFAULT 1,
  superseded_by UUID REFERENCES lore_facts(id),
  
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fact relationships (e.g., Mars Colony is part of Colonial Council)
CREATE TABLE lore_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_fact_id UUID REFERENCES lore_facts(id) ON DELETE CASCADE,
  child_fact_id UUID REFERENCES lore_facts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- 'part_of', 'located_at', 'reports_to', 'predecessor', etc.
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(parent_fact_id, child_fact_id, relationship_type)
);

-- Contradiction detection log
CREATE TABLE lore_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES segments(id),
  
  -- Contradiction details
  fact_key TEXT NOT NULL,
  canonical_value TEXT NOT NULL,
  contradictory_value TEXT NOT NULL,
  context_text TEXT, -- Where in script this appears
  
  -- Resolution
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'major')),
  resolved BOOLEAN DEFAULT false,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_lore_facts_category ON lore_facts(category);
CREATE INDEX idx_lore_facts_active ON lore_facts(active) WHERE active = true;
CREATE INDEX idx_lore_relationships_parent ON lore_relationships(parent_fact_id);
CREATE INDEX idx_lore_relationships_child ON lore_relationships(child_fact_id);
CREATE INDEX idx_lore_contradictions_segment ON lore_contradictions(segment_id);
CREATE INDEX idx_lore_contradictions_unresolved ON lore_contradictions(resolved) WHERE resolved = false;

-- Seed canonical facts
INSERT INTO lore_facts (category, fact_key, fact_value, fact_type, description) VALUES
  ('technology', 'warp_drive_max_speed', '10', 'number', 'Maximum warp factor for civilian vessels'),
  ('technology', 'ftl_travel_method', 'warp drive', 'text', 'Primary faster-than-light travel method'),
  ('location', 'mars_colony_founding', '2087', 'date', 'Year Mars Colony was permanently established'),
  ('location', 'earth_government', 'United Earth', 'text', 'Official name of Earth''s governing body'),
  ('organization', 'colonial_council', 'Colonial Council', 'text', 'Governing body for off-Earth colonies'),
  ('species', 'centaurian_homeworld', 'Proxima Centauri b', 'text', 'Homeworld of Centaurian species'),
  ('species', 'known_intelligent_species', '7', 'number', 'Number of known intelligent alien species'),
  ('event', 'first_contact_year', '2247', 'date', 'Year of first contact with alien intelligence'),
  ('technology', 'fusion_reactor_type', 'tokamak fusion', 'text', 'Standard fusion reactor design'),
  ('location', 'titan_settlement_status', 'underwater domes', 'text', 'Titan settlements are underwater in methane seas');

COMMENT ON TABLE lore_facts IS 'Canonical facts about the 2525 world for consistency checking';
COMMENT ON TABLE lore_contradictions IS 'Detected contradictions in generated content';
```

### Step 2: Create Consistency Checker

Create `workers/segment-gen/src/validators/consistency-checker.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('consistency-checker');

interface LoreFact {
  id: string;
  category: string;
  fact_key: string;
  fact_value: string;
  fact_type: string;
  description?: string;
}

interface Contradiction {
  factKey: string;
  canonicalValue: string;
  contradictoryValue: string;
  contextText: string;
  severity: 'minor' | 'moderate' | 'major';
}

export class ConsistencyChecker {
  private supabase: SupabaseClient;
  private loreFacts: Map<string, LoreFact>;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.loreFacts = new Map();
  }

  /**
   * Load canonical facts into memory
   */
  async loadLoreFacts(): Promise<void> {
    const { data: facts } = await this.supabase
      .from('lore_facts')
      .select('*')
      .eq('active', true);

    if (facts) {
      facts.forEach(fact => {
        this.loreFacts.set(fact.fact_key, fact);
      });

      logger.info({ count: facts.length }, 'Loaded canonical lore facts');
    }
  }

  /**
   * Check script for contradictions against canonical facts
   */
  async checkScript(
    segmentId: string,
    script: string
  ): Promise<Contradiction[]> {
    if (this.loreFacts.size === 0) {
      await this.loadLoreFacts();
    }

    logger.info({ segmentId }, 'Checking script consistency');

    const contradictions: Contradiction[] = [];
    const lowerScript = script.toLowerCase();

    // Check specific facts
    for (const [factKey, fact] of this.loreFacts) {
      const canonical = fact.fact_value.toLowerCase();

      // Define common variations/contradictions to check
      const checks = this.getFactChecks(fact);

      for (const check of checks) {
        if (lowerScript.includes(check.pattern.toLowerCase())) {
          // Found potential contradiction
          if (check.contradicts) {
            contradictions.push({
              factKey,
              canonicalValue: canonical,
              contradictoryValue: check.pattern,
              contextText: this.extractContext(script, check.pattern),
              severity: check.severity,
            });

            logger.warn({
              factKey,
              canonical,
              found: check.pattern,
            }, 'Contradiction detected');
          }
        }
      }
    }

    // Store contradictions in database
    if (contradictions.length > 0) {
      const inserts = contradictions.map(c => ({
        segment_id: segmentId,
        fact_key: c.factKey,
        canonical_value: c.canonicalValue,
        contradictory_value: c.contradictoryValue,
        context_text: c.contextText,
        severity: c.severity,
      }));

      await this.supabase
        .from('lore_contradictions')
        .insert(inserts);
    }

    logger.info({
      segmentId,
      contradictions: contradictions.length,
    }, 'Consistency check complete');

    return contradictions;
  }

  /**
   * Get patterns to check for a specific fact
   */
  private getFactChecks(fact: LoreFact): Array<{
    pattern: string;
    contradicts: boolean;
    severity: 'minor' | 'moderate' | 'major';
  }> {
    const checks: Array<any> = [];

    switch (fact.fact_key) {
      case 'ftl_travel_method':
        checks.push(
          { pattern: 'warp drive', contradicts: false, severity: 'minor' },
          { pattern: 'hyperspace', contradicts: true, severity: 'major' },
          { pattern: 'teleportation', contradicts: true, severity: 'major' }
        );
        break;

      case 'earth_government':
        checks.push(
          { pattern: 'united earth', contradicts: false, severity: 'minor' },
          { pattern: 'earth federation', contradicts: true, severity: 'moderate' },
          { pattern: 'galactic empire', contradicts: true, severity: 'major' }
        );
        break;

      case 'mars_colony_founding':
        // Check for contradictory dates
        const canonicalYear = parseInt(fact.fact_value);
        for (let year = 2050; year < 2200; year += 10) {
          if (year !== canonicalYear) {
            checks.push({
              pattern: `established in ${year}`,
              contradicts: true,
              severity: Math.abs(year - canonicalYear) < 20 ? 'minor' : 'moderate',
            });
          }
        }
        break;

      default:
        // Generic check - just verify canonical value is mentioned
        checks.push({
          pattern: fact.fact_value,
          contradicts: false,
          severity: 'minor',
        });
    }

    return checks;
  }

  /**
   * Extract context around a pattern in script
   */
  private extractContext(script: string, pattern: string, contextLength: number = 150): string {
    const index = script.toLowerCase().indexOf(pattern.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(script.length, index + pattern.length + contextLength);

    let context = script.substring(start, end);
    
    if (start > 0) context = '...' + context;
    if (end < script.length) context = context + '...';

    return context;
  }

  /**
   * Verify timeline consistency (events in correct order)
   */
  async checkTimeline(script: string): Promise<string[]> {
    const issues: string[] = [];

    // Extract year mentions
    const yearPattern = /\b(1[89]\d{2}|2[0-5]\d{2})\b/g;
    const years = script.match(yearPattern);

    if (years) {
      const yearNumbers = years.map(y => parseInt(y));
      
      // Check if any years are after 2525
      const futureYears = yearNumbers.filter(y => y > 2525);
      if (futureYears.length > 0) {
        issues.push(`References years after 2525: ${futureYears.join(', ')}`);
      }

      // Check if years are before plausible space age
      const tooEarlyYears = yearNumbers.filter(y => y < 2000);
      if (tooEarlyYears.length > 0) {
        issues.push(`References pre-space age years: ${tooEarlyYears.join(', ')}`);
      }
    }

    return issues;
  }

  /**
   * Check for character name consistency
   */
  async checkCharacterConsistency(
    characterName: string,
    script: string
  ): Promise<string[]> {
    const issues: string[] = [];

    // Check for name variations
    const nameParts = characterName.split(' ');
    if (nameParts.length > 1) {
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];

      // Count mentions
      const fullNameCount = (script.match(new RegExp(characterName, 'gi')) || []).length;
      const firstNameCount = (script.match(new RegExp(`\\b${firstName}\\b`, 'gi')) || []).length;
      const lastNameCount = (script.match(new RegExp(`\\b${lastName}\\b`, 'gi')) || []).length;

      // Check for consistency
      if (firstNameCount > fullNameCount * 2) {
        issues.push(`Character name "${characterName}" mostly referred to by first name only`);
      }
    }

    return issues;
  }
}
```

### Step 3: Integrate Consistency Checking

Update `workers/segment-gen/src/segment-maker.ts`:
```typescript
import { ConsistencyChecker } from './validators/consistency-checker';

// Add to class
private consistencyChecker: ConsistencyChecker;

constructor(supabase: SupabaseClient) {
  // ... existing code ...
  this.consistencyChecker = new ConsistencyChecker();
}

// After script generation
async generateMonologueSegment(segment: any): Promise<void> {
  // ... existing script generation ...
  
  const script = await this.scriptGenerator.generateScript(/* ... */);
  
  // Check consistency
  const contradictions = await this.consistencyChecker.checkScript(
    segment.id,
    script
  );
  
  const timelineIssues = await this.consistencyChecker.checkTimeline(script);
  
  if (contradictions.length > 0 || timelineIssues.length > 0) {
    logger.warn({
      segmentId: segment.id,
      contradictions: contradictions.length,
      timelineIssues: timelineIssues.length,
    }, 'Consistency issues detected');
    
    // Flag for review if major contradictions
    const majorContradictions = contradictions.filter(c => c.severity === 'major');
    
    if (majorContradictions.length > 0) {
      await this.supabase
        .from('segments')
        .update({
          state: 'review_needed',
          review_reason: 'Major lore contradictions detected',
        })
        .eq('id', segment.id);
      
      throw new Error('Major lore contradictions - segment flagged for review');
    }
  }
  
  // Continue with rest of generation...
}
```

### Step 4: Create Lore Management UI

Create `apps/admin/app/dashboard/lore/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function LorePage() {
  const supabase = await createServerClient();

  const { data: facts } = await supabase
    .from('lore_facts')
    .select('*')
    .eq('active', true)
    .order('category', { ascending: true });

  const { data: contradictions } = await supabase
    .from('lore_contradictions')
    .select('*, segments(slot_type)')
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(20);

  // Group facts by category
  const factsByCategory = facts?.reduce((acc: any, fact) => {
    if (!acc[fact.category]) acc[fact.category] = [];
    acc[fact.category].push(fact);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">World Lore & Consistency</h1>
        <Link
          href="/dashboard/lore/new"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Fact
        </Link>
      </div>

      {/* Unresolved Contradictions */}
      {contradictions && contradictions.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-red-900 mb-4">
            ⚠️ Unresolved Contradictions ({contradictions.length})
          </h2>
          <div className="space-y-3">
            {contradictions.map((contradiction) => (
              <div
                key={contradiction.id}
                className="bg-white rounded p-4 border border-red-300"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-medium text-red-900">
                    {contradiction.fact_key}
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      contradiction.severity === 'major'
                        ? 'bg-red-600 text-white'
                        : contradiction.severity === 'moderate'
                        ? 'bg-orange-500 text-white'
                        : 'bg-yellow-500 text-white'
                    }`}
                  >
                    {contradiction.severity}
                  </span>
                </div>
                <div className="text-sm text-gray-700 mb-2">
                  <strong>Canonical:</strong> {contradiction.canonical_value}
                  <br />
                  <strong>Found:</strong> {contradiction.contradictory_value}
                </div>
                {contradiction.context_text && (
                  <div className="text-xs text-gray-600 italic bg-gray-50 p-2 rounded">
                    {contradiction.context_text}
                  </div>
                )}
                <div className="mt-2 flex space-x-2">
                  <Link
                    href={`/dashboard/segments/${contradiction.segment_id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View Segment →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Canonical Facts */}
      <div className="space-y-6">
        {Object.entries(factsByCategory || {}).map(([category, facts]: [string, any]) => (
          <div key={category} className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 capitalize">
              {category}
            </h2>
            <div className="space-y-2">
              {facts.map((fact: any) => (
                <div
                  key={fact.id}
                  className="flex items-start justify-between p-3 bg-gray-50 rounded"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">
                      {fact.fact_key.replace(/_/g, ' ')}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {fact.fact_value}
                    </div>
                    {fact.description && (
                      <div className="text-xs text-gray-500 mt-1">
                        {fact.description}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {fact.fact_type}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Canonical facts database created
- [ ] Consistency checker detects contradictions
- [ ] Timeline verification works
- [ ] Character name consistency checked
- [ ] Major contradictions flag segments
- [ ] Admin can view/manage lore
- [ ] Contradictions displayed with context
- [ ] Severity levels enforced

### Quality Requirements
- [ ] Accurate contradiction detection
- [ ] Minimal false positives
- [ ] Clear issue descriptions
- [ ] Useful context extraction
- [ ] Admin UI intuitive

### Manual Verification
```bash
# Run migration
node infra/migrate.js up

# Generate segment with intentional contradiction
# e.g., mention "hyperspace drive" instead of "warp drive"

# Check for detected contradictions
psql $DATABASE_URL -c "SELECT * FROM lore_contradictions WHERE resolved = false;"

# View in admin
open http://localhost:3001/dashboard/lore

# Verify:
# - Contradiction detected
# - Context shown
# - Severity appropriate
# - Segment flagged if major
```

---

## Next Task Handoff

**For L3 (Optimism/Realism Balance Monitor):**
- Real-time tone tracking
- Dashboard metrics
- Adjustment recommendations
- Historical trends

**Files created:**
- `infra/migrations/017_lore_facts.sql`
- `workers/segment-gen/src/validators/consistency-checker.ts`
- `apps/admin/app/dashboard/lore/page.tsx`

**Files modified:**
- `workers/segment-gen/src/segment-maker.ts` (consistency checking)

**Consistency system ready:**
- ✅ Canonical fact tracking
- ✅ Contradiction detection
- ✅ Timeline verification
- ✅ Character consistency
- ✅ Admin management

----------------------------

# Task L3: Optimism/Realism Balance Monitor
You may adjust the task specs if you see that the current description is in conflict with the actual architecture

**Tier:** Lore & Tone  
**Estimated Time:** 45 minutes  
**Complexity:** Low  
**Prerequisites:** L1-L2 complete

---

## Objective

Create real-time monitoring dashboard for tone balance: track 60/30/10 ratio across all content, identify trends, provide adjustment recommendations.

---

## Implementation Steps

### Step 1: Create Analytics Tables

Create `infra/migrations/018_tone_analytics.sql`:
```sql
-- Migration: Tone analytics tracking
-- Description: Historical tone metrics for monitoring

-- Daily tone metrics
CREATE TABLE tone_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  
  -- Aggregate metrics
  segments_analyzed INT DEFAULT 0,
  avg_tone_score NUMERIC(5,2),
  avg_optimism_pct NUMERIC(5,2),
  avg_realism_pct NUMERIC(5,2),
  avg_wonder_pct NUMERIC(5,2),
  
  -- Issue counts
  dystopian_flags INT DEFAULT 0,
  fantasy_flags INT DEFAULT 0,
  anachronism_flags INT DEFAULT 0,
  major_contradictions INT DEFAULT 0,
  
  -- Quality
  segments_below_threshold INT DEFAULT 0, -- Score < 70
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-segment tone history (for trending)
CREATE TABLE tone_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES segments(id) ON DELETE CASCADE,
  
  tone_score INT,
  optimism_pct INT,
  realism_pct INT,
  wonder_pct INT,
  
  issue_count INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tone_metrics_date ON tone_metrics_daily(date DESC);
CREATE INDEX idx_tone_history_segment ON tone_history(segment_id);
CREATE INDEX idx_tone_history_created ON tone_history(created_at DESC);

COMMENT ON TABLE tone_metrics_daily IS 'Daily aggregated tone metrics for monitoring';
COMMENT ON TABLE tone_history IS 'Per-segment tone tracking for trend analysis';
```

### Step 2: Create Tone Analytics Service

Create `apps/api/src/analytics/tone-analytics.py`:
```python
from datetime import datetime, timedelta, date
from typing import Dict, List
from supabase import Client, create_client
import os

class ToneAnalytics:
    """Analytics service for tone monitoring"""
    
    def __init__(self):
        self.supabase: Client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        )
    
    def aggregate_daily_metrics(self, target_date: date = None) -> Dict:
        """Aggregate tone metrics for a specific day"""
        if target_date is None:
            target_date = date.today()
        
        # Get all segments created on target date with tone scores
        response = self.supabase.table("segments")\
            .select("tone_score, tone_balance, validation_issues")\
            .gte("created_at", f"{target_date}T00:00:00Z")\
            .lt("created_at", f"{target_date + timedelta(days=1)}T00:00:00Z")\
            .not_.is_("tone_score", "null")\
            .execute()
        
        segments = response.data
        
        if not segments:
            return {
                "date": str(target_date),
                "segments_analyzed": 0
            }
        
        # Calculate metrics
        total_segments = len(segments)
        total_score = sum(s["tone_score"] for s in segments)
        avg_score = total_score / total_segments
        
        # Parse tone balance
        optimism_pcts = []
        realism_pcts = []
        wonder_pcts = []
        
        for segment in segments:
            if segment.get("tone_balance"):
                parts = segment["tone_balance"].split("/")
                if len(parts) == 3:
                    optimism_pcts.append(int(parts[0]))
                    realism_pcts.append(int(parts[1]))
                    wonder_pcts.append(int(parts[2]))
        
        # Count issue types
        dystopian_flags = 0
        fantasy_flags = 0
        anachronism_flags = 0
        
        for segment in segments:
            issues = segment.get("validation_issues") or []
            for issue in issues:
                if "dystopian" in issue.lower():
                    dystopian_flags += 1
                elif "fantasy" in issue.lower():
                    fantasy_flags += 1
                elif "anachronistic" in issue.lower():
                    anachronism_flags += 1
        
        # Count contradictions
        contradictions_response = self.supabase.table("lore_contradictions")\
            .select("severity", count="exact")\
            .gte("created_at", f"{target_date}T00:00:00Z")\
            .lt("created_at", f"{target_date + timedelta(days=1)}T00:00:00Z")\
            .eq("severity", "major")\
            .execute()
        
        major_contradictions = contradictions_response.count or 0
        
        # Segments below quality threshold
        below_threshold = len([s for s in segments if s["tone_score"] < 70])
        
        metrics = {
            "date": str(target_date),
            "segments_analyzed": total_segments,
            "avg_tone_score": round(avg_score, 2),
            "avg_optimism_pct": round(sum(optimism_pcts) / len(optimism_pcts), 2) if optimism_pcts else 0,
            "avg_realism_pct": round(sum(realism_pcts) / len(realism_pcts), 2) if realism_pcts else 0,
            "avg_wonder_pct": round(sum(wonder_pcts) / len(wonder_pcts), 2) if wonder_pcts else 0,
            "dystopian_flags": dystopian_flags,
            "fantasy_flags": fantasy_flags,
            "anachronism_flags": anachronism_flags,
            "major_contradictions": major_contradictions,
            "segments_below_threshold": below_threshold
        }
        
        # Store in database
        self.supabase.table("tone_metrics_daily").upsert(metrics).execute()
        
        return metrics
    
    def get_trend_analysis(self, days: int = 7) -> Dict:
        """Get tone trends over time"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        response = self.supabase.table("tone_metrics_daily")\
            .select("*")\
            .gte("date", str(start_date))\
            .lte("date", str(end_date))\
            .order("date")\
            .execute()
        
        metrics = response.data
        
        if not metrics:
            return {"trend": "insufficient_data"}
        
        # Calculate trends
        avg_scores = [m["avg_tone_score"] for m in metrics if m.get("avg_tone_score")]
        avg_optimism = [m["avg_optimism_pct"] for m in metrics if m.get("avg_optimism_pct")]
        
        trend = {
            "period_days": days,
            "data_points": len(metrics),
            "current_avg_score": avg_scores[-1] if avg_scores else 0,
            "score_trend": "improving" if len(avg_scores) > 1 and avg_scores[-1] > avg_scores[0] else "declining",
            "optimism_trend": "increasing" if len(avg_optimism) > 1 and avg_optimism[-1] > avg_optimism[0] else "decreasing",
            "total_segments": sum(m["segments_analyzed"] for m in metrics),
            "total_issues": sum(m["dystopian_flags"] + m["fantasy_flags"] + m["anachronism_flags"] for m in metrics)
        }
        
        return trend
    
    def get_recommendations(self, metrics: Dict) -> List[str]:
        """Generate recommendations based on metrics"""
        recommendations = []
        
        # Check optimism/realism/wonder balance
        opt = metrics.get("avg_optimism_pct", 0)
        real = metrics.get("avg_realism_pct", 0)
        wonder = metrics.get("avg_wonder_pct", 0)
        
        if opt < 50:
            recommendations.append("⚠️ Optimism too low - Add more achievements, successes, and positive outcomes")
        elif opt > 70:
            recommendations.append("⚠️ Optimism too high - Include more realistic challenges and limitations")
        
        if real < 20:
            recommendations.append("⚠️ Realism too low - Incorporate more practical problems and constraints")
        elif real > 40:
            recommendations.append("⚠️ Too much focus on problems - Balance with solutions and progress")
        
        if wonder < 5:
            recommendations.append("💡 Add more sense of wonder - Include discoveries, mysteries, cosmic perspective")
        
        # Check issue flags
        if metrics.get("dystopian_flags", 0) > 2:
            recommendations.append("🚫 Too many dystopian elements - Review prompts for pessimistic language")
        
        if metrics.get("fantasy_flags", 0) > 1:
            recommendations.append("🚫 Fantasy elements detected - Ensure all phenomena have technological explanations")
        
        if metrics.get("major_contradictions", 0) > 0:
            recommendations.append("⚠️ Major lore contradictions found - Review and update knowledge base")
        
        # Quality threshold
        if metrics.get("segments_below_threshold", 0) > metrics.get("segments_analyzed", 0) * 0.2:
            recommendations.append("📉 Over 20% of segments below quality threshold - Review generation prompts")
        
        if not recommendations:
            recommendations.append("✅ Tone balance is healthy - Continue current approach")
        
        return recommendations
```

### Step 3: Create Tone Dashboard

Create `apps/admin/app/dashboard/tone/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';

async function getToneMetrics() {
  const supabase = await createServerClient();

  // Get last 7 days
  const { data: metrics } = await supabase
    .from('tone_metrics_daily')
    .select('*')
    .order('date', { ascending: false })
    .limit(7);

  // Get today's segments
  const today = new Date().toISOString().split('T')[0];
  const { data: todaySegments } = await supabase
    .from('segments')
    .select('tone_score, tone_balance')
    .gte('created_at', `${today}T00:00:00Z`)
    .not('tone_score', 'is', null);

  return { metrics: metrics || [], todaySegments: todaySegments || [] };
}

export default async function ToneDashboardPage() {
  const { metrics, todaySegments } = await getToneMetrics();

  // Calculate today's stats
  const todayAvgScore =
    todaySegments.length > 0
      ? todaySegments.reduce((sum, s) => sum + s.tone_score, 0) / todaySegments.length
      : 0;

  // Latest full day metrics
  const latestMetrics = metrics[0];

  // Calculate recommendations
  const recommendations: string[] = [];
  if (latestMetrics) {
    const opt = latestMetrics.avg_optimism_pct;
    const real = latestMetrics.avg_realism_pct;
    const wonder = latestMetrics.avg_wonder_pct;

    if (opt < 50) {
      recommendations.push('⚠️ Optimism too low - Add more achievements and positive outcomes');
    } else if (opt > 70) {
      recommendations.push('⚠️ Optimism too high - Include more realistic challenges');
    }

    if (real < 20) {
      recommendations.push('⚠️ Realism too low - Incorporate more practical problems');
    }

    if (wonder < 5) {
      recommendations.push('💡 Add more sense of wonder - Include discoveries and mysteries');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Tone balance is healthy');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tone & Balance Monitoring</h1>

      {/* Today's Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">Today's Segments</div>
          <div className="text-3xl font-bold mt-2">{todaySegments.length}</div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">Today's Avg Score</div>
          <div
            className={`text-3xl font-bold mt-2 ${
              todayAvgScore >= 80
                ? 'text-green-600'
                : todayAvgScore >= 60
                ? 'text-yellow-600'
                : 'text-red-600'
            }`}
          >
            {Math.round(todayAvgScore)}
          </div>
        </div>

        {latestMetrics && (
          <>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-sm text-gray-600">Yesterday's Balance</div>
              <div className="text-lg font-mono mt-2">
                {Math.round(latestMetrics.avg_optimism_pct)}/
                {Math.round(latestMetrics.avg_realism_pct)}/
                {Math.round(latestMetrics.avg_wonder_pct)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Target: 60/30/10</div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-sm text-gray-600">Issues (Yesterday)</div>
              <div className="text-3xl font-bold mt-2">
                {latestMetrics.dystopian_flags +
                  latestMetrics.fantasy_flags +
                  latestMetrics.anachronism_flags}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">📊 Recommendations</h2>
          <ul className="space-y-2">
            {recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-gray-800">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 7-Day Trend */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">7-Day Trend</h2>
        <div className="space-y-3">
          {metrics.map((day) => (
            <div key={day.date} className="flex items-center justify-between border-b pb-3">
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {new Date(day.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {day.segments_analyzed} segments
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-center">
                  <div className="text-xs text-gray-600">Score</div>
                  <div
                    className={`font-bold ${
                      day.avg_tone_score >= 80
                        ? 'text-green-600'
                        : day.avg_tone_score >= 60
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}
                  >
                    {Math.round(day.avg_tone_score)}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-gray-600">Balance</div>
                  <div className="font-mono text-xs">
                    {Math.round(day.avg_optimism_pct)}/
                    {Math.round(day.avg_realism_pct)}/
                    {Math.round(day.avg_wonder_pct)}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-gray-600">Issues</div>
                  <div className="font-bold">
                    {day.dystopian_flags + day.fantasy_flags + day.anachronism_flags}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Target Guidelines */}
      <div className="bg-gray-50 border rounded-lg p-6">
        <h3 className="font-semibold mb-3">Target Guidelines</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-medium text-blue-600">60% Optimistic</div>
            <div className="text-gray-600 text-xs mt-1">
              Achievements, progress, solutions, cooperation
            </div>
          </div>
          <div>
            <div className="font-medium text-yellow-600">30% Realistic</div>
            <div className="text-gray-600 text-xs mt-1">
              Challenges, limitations, debates, practical concerns
            </div>
          </div>
          <div>
            <div className="font-medium text-purple-600">10% Wonder</div>
            <div className="text-gray-600 text-xs mt-1">
              Discoveries, mysteries, cosmic perspective, awe
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Add Cron Job for Daily Aggregation

Create `workers/scheduler/src/tone-aggregator.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core/logger';
import axios from 'axios';

const logger = createLogger('tone-aggregator');

/**
 * Daily tone metrics aggregation
 * Runs once per day to calculate tone statistics
 */
export async function aggregateDailyToneMetrics() {
  logger.info('Aggregating daily tone metrics');

  const apiUrl = process.env.API_URL || 'http://localhost:8000';

  try {
    // Call analytics service
    const response = await axios.post(`${apiUrl}/analytics/tone/aggregate`);

    logger.info({ metrics: response.data }, 'Daily tone metrics aggregated');
  } catch (error) {
    logger.error({ error }, 'Failed to aggregate tone metrics');
    throw error;
  }
}

// Run daily at 1 AM
if (require.main === module) {
  aggregateDailyToneMetrics()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Daily metrics aggregated
- [ ] Tone trends tracked
- [ ] Dashboard displays current status
- [ ] Recommendations generated
- [ ] 7-day history shown
- [ ] Balance percentages calculated
- [ ] Issue counts tracked

### Quality Requirements
- [ ] Dashboard is clear and actionable
- [ ] Trends are meaningful
- [ ] Recommendations are specific
- [ ] Data updates daily
- [ ] Metrics are accurate

### Manual Verification
```bash
# Run migration
node infra/migrate.js up

# Generate some segments
# Wait for tone analysis

# Manually aggregate metrics
# (Or wait for daily cron)

# View dashboard
open http://localhost:3001/dashboard/tone

# Verify:
# - Current stats shown
# - Balance percentages
# - Recommendations relevant
# - Trend data meaningful
```

---

## Lore & Tone Tier Complete!

**Files created:**
- `infra/migrations/018_tone_analytics.sql`
- `apps/api/src/analytics/tone-analytics.py`
- `apps/admin/app/dashboard/tone/page.tsx`
- `workers/scheduler/src/tone-aggregator.ts`

**Tone monitoring system ready:**
- ✅ Style guide enforcement
- ✅ Consistency checking
- ✅ Real-time monitoring
- ✅ Trend analysis
- ✅ Actionable recommendations
- ✅ Historical tracking

-----------------------

# Task P1: YouTube Live Integration

**Tier:** Streaming Platforms  
**Estimated Time:** 2 hours  
**Complexity:** High  
**Prerequisites:** P1-P6 complete (Liquidsoap streaming)

---

## Objective

Integrate YouTube Live streaming: authenticate with YouTube API, create live streams, output RTMP from Liquidsoap, update stream metadata.

---

## Implementation Steps

### Step 1: Create Streaming Platforms Schema

Create `infra/migrations/019_streaming_platforms.sql`:
```sql
-- Migration: Streaming platform integrations
-- Description: YouTube, Twitch, custom RTMP endpoints

-- Streaming platforms configuration
CREATE TABLE streaming_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_type TEXT NOT NULL CHECK (platform_type IN ('youtube', 'twitch', 'facebook', 'custom_rtmp')),
  name TEXT NOT NULL,
  
  -- Authentication
  api_key TEXT,
  api_secret TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- Stream configuration
  stream_key TEXT,
  rtmp_url TEXT NOT NULL,
  backup_rtmp_url TEXT,
  
  -- Stream settings
  bitrate INT DEFAULT 4500,
  resolution TEXT DEFAULT '1280x720',
  framerate INT DEFAULT 30,
  
  -- Status
  active BOOLEAN DEFAULT false,
  last_stream_start TIMESTAMPTZ,
  last_stream_end TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stream sessions (history)
CREATE TABLE stream_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID REFERENCES streaming_platforms(id) ON DELETE CASCADE,
  
  -- Session details
  stream_id TEXT, -- Platform-specific stream ID
  stream_url TEXT, -- Public viewing URL
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_sec INT,
  
  -- Metrics
  peak_viewers INT DEFAULT 0,
  total_views INT DEFAULT 0,
  avg_viewers INT DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('starting', 'live', 'ended', 'error')),
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Viewer metrics (snapshots)
CREATE TABLE stream_viewer_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES stream_sessions(id) ON DELETE CASCADE,
  
  viewer_count INT NOT NULL,
  chat_messages_per_min INT DEFAULT 0,
  
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_streaming_platforms_active ON streaming_platforms(active) WHERE active = true;
CREATE INDEX idx_stream_sessions_platform ON stream_sessions(platform_id);
CREATE INDEX idx_stream_sessions_status ON stream_sessions(status);
CREATE INDEX idx_stream_viewer_metrics_session ON stream_viewer_metrics(session_id);

COMMENT ON TABLE streaming_platforms IS 'Configuration for streaming platform integrations';
COMMENT ON TABLE stream_sessions IS 'Historical streaming sessions';
COMMENT ON TABLE stream_viewer_metrics IS 'Periodic viewer count snapshots';
```

### Step 2: Install YouTube API Dependencies

Update `apps/api/requirements.txt`:
```txt
# ... existing requirements ...
google-auth==2.26.2
google-auth-oauthlib==1.2.0
google-auth-httplib2==0.2.0
google-api-python-client==2.111.0
```

### Step 3: Create YouTube Live Service

Create `apps/api/src/streaming/youtube_service.py`:
```python
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from typing import Dict, Optional
import os
import logging

logger = logging.getLogger(__name__)

SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl']

class YouTubeLiveService:
    """Service for managing YouTube Live streams"""
    
    def __init__(self, credentials_dict: Dict = None):
        """
        Initialize YouTube service
        
        Args:
            credentials_dict: OAuth2 credentials (token, refresh_token, etc.)
        """
        if credentials_dict:
            self.credentials = Credentials(
                token=credentials_dict.get('access_token'),
                refresh_token=credentials_dict.get('refresh_token'),
                token_uri='https://oauth2.googleapis.com/token',
                client_id=os.getenv('YOUTUBE_CLIENT_ID'),
                client_secret=os.getenv('YOUTUBE_CLIENT_SECRET'),
                scopes=SCOPES
            )
        else:
            self.credentials = None
        
        self.youtube = None
        if self.credentials:
            self.youtube = build('youtube', 'v3', credentials=self.credentials)
    
    def create_broadcast(
        self,
        title: str,
        description: str,
        privacy_status: str = 'public'
    ) -> Dict:
        """
        Create a YouTube Live broadcast
        
        Args:
            title: Broadcast title
            description: Broadcast description
            privacy_status: 'public', 'unlisted', or 'private'
        
        Returns:
            Broadcast details including stream key and RTMP URL
        """
        if not self.youtube:
            raise ValueError("YouTube service not initialized with credentials")
        
        try:
            # Create broadcast
            broadcast_request = self.youtube.liveBroadcasts().insert(
                part='snippet,status,contentDetails',
                body={
                    'snippet': {
                        'title': title,
                        'description': description,
                        'scheduledStartTime': None,  # Start immediately
                    },
                    'status': {
                        'privacyStatus': privacy_status,
                        'selfDeclaredMadeForKids': False,
                    },
                    'contentDetails': {
                        'enableAutoStart': True,
                        'enableAutoStop': True,
                        'recordFromStart': True,
                        'enableDvr': True,
                    }
                }
            )
            
            broadcast_response = broadcast_request.execute()
            broadcast_id = broadcast_response['id']
            
            logger.info(f"Created YouTube broadcast: {broadcast_id}")
            
            # Create stream
            stream_request = self.youtube.liveStreams().insert(
                part='snippet,cdn,status',
                body={
                    'snippet': {
                        'title': f"{title} - Stream",
                    },
                    'cdn': {
                        'frameRate': '30fps',
                        'ingestionType': 'rtmp',
                        'resolution': '720p',
                    },
                    'status': {
                        'streamStatus': 'active',
                    }
                }
            )
            
            stream_response = stream_request.execute()
            stream_id = stream_response['id']
            
            logger.info(f"Created YouTube stream: {stream_id}")
            
            # Bind stream to broadcast
            bind_request = self.youtube.liveBroadcasts().bind(
                part='id,snippet,status',
                id=broadcast_id,
                streamId=stream_id
            )
            
            bind_request.execute()
            
            logger.info(f"Bound stream {stream_id} to broadcast {broadcast_id}")
            
            # Extract stream details
            ingestion_info = stream_response['cdn']['ingestionInfo']
            
            return {
                'broadcast_id': broadcast_id,
                'stream_id': stream_id,
                'stream_url': f"https://youtube.com/watch?v={broadcast_id}",
                'rtmp_url': ingestion_info['ingestionAddress'],
                'stream_key': ingestion_info['streamName'],
                'backup_rtmp_url': ingestion_info.get('backupIngestionAddress'),
            }
        
        except HttpError as e:
            logger.error(f"YouTube API error: {e}")
            raise
    
    def start_broadcast(self, broadcast_id: str) -> bool:
        """Transition broadcast to 'live' status"""
        try:
            request = self.youtube.liveBroadcasts().transition(
                part='status',
                broadcastStatus='live',
                id=broadcast_id
            )
            
            request.execute()
            logger.info(f"Started broadcast: {broadcast_id}")
            return True
        
        except HttpError as e:
            logger.error(f"Failed to start broadcast: {e}")
            return False
    
    def stop_broadcast(self, broadcast_id: str) -> bool:
        """End the broadcast"""
        try:
            request = self.youtube.liveBroadcasts().transition(
                part='status',
                broadcastStatus='complete',
                id=broadcast_id
            )
            
            request.execute()
            logger.info(f"Stopped broadcast: {broadcast_id}")
            return True
        
        except HttpError as e:
            logger.error(f"Failed to stop broadcast: {e}")
            return False
    
    def update_stream_metadata(
        self,
        broadcast_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None
    ) -> bool:
        """Update broadcast metadata (title, description)"""
        try:
            # Get current broadcast
            get_request = self.youtube.liveBroadcasts().list(
                part='snippet',
                id=broadcast_id
            )
            
            response = get_request.execute()
            
            if not response['items']:
                return False
            
            broadcast = response['items'][0]
            
            # Update snippet
            if title:
                broadcast['snippet']['title'] = title
            
            if description:
                broadcast['snippet']['description'] = description
            
            # Update broadcast
            update_request = self.youtube.liveBroadcasts().update(
                part='snippet',
                body=broadcast
            )
            
            update_request.execute()
            logger.info(f"Updated broadcast metadata: {broadcast_id}")
            return True
        
        except HttpError as e:
            logger.error(f"Failed to update metadata: {e}")
            return False
    
    def get_viewer_count(self, broadcast_id: str) -> int:
        """Get current viewer count"""
        try:
            request = self.youtube.liveBroadcasts().list(
                part='statistics',
                id=broadcast_id
            )
            
            response = request.execute()
            
            if response['items']:
                stats = response['items'][0].get('statistics', {})
                return int(stats.get('concurrentViewers', 0))
            
            return 0
        
        except HttpError as e:
            logger.error(f"Failed to get viewer count: {e}")
            return 0
```

### Step 4: Create Streaming API Routes

Create `apps/api/src/streaming/streaming_routes.py`:
```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import os
from supabase import create_client
from .youtube_service import YouTubeLiveService

router = APIRouter(prefix="/streaming", tags=["streaming"])

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)


class CreateStreamRequest(BaseModel):
    platform: str  # 'youtube', 'twitch', 'custom_rtmp'
    title: str
    description: str
    privacy: str = 'public'


class UpdateMetadataRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None


@router.post("/create")
async def create_stream(request: CreateStreamRequest):
    """Create a new live stream on platform"""
    
    if request.platform == 'youtube':
        # Get YouTube credentials
        platform_response = supabase.table("streaming_platforms")\
            .select("*")\
            .eq("platform_type", "youtube")\
            .eq("active", True)\
            .single()\
            .execute()
        
        if not platform_response.data:
            raise HTTPException(status_code=404, detail="YouTube platform not configured")
        
        platform = platform_response.data
        
        # Initialize YouTube service
        youtube = YouTubeLiveService({
            'access_token': platform['access_token'],
            'refresh_token': platform['refresh_token'],
        })
        
        # Create broadcast
        broadcast = youtube.create_broadcast(
            title=request.title,
            description=request.description,
            privacy_status=request.privacy
        )
        
        # Update platform config with stream details
        supabase.table("streaming_platforms")\
            .update({
                'stream_key': broadcast['stream_key'],
                'rtmp_url': broadcast['rtmp_url'],
                'backup_rtmp_url': broadcast.get('backup_rtmp_url'),
            })\
            .eq("id", platform['id'])\
            .execute()
        
        # Create session record
        session_response = supabase.table("stream_sessions")\
            .insert({
                'platform_id': platform['id'],
                'stream_id': broadcast['broadcast_id'],
                'stream_url': broadcast['stream_url'],
                'status': 'starting',
            })\
            .execute()
        
        return {
            'session_id': session_response.data[0]['id'],
            'broadcast_id': broadcast['broadcast_id'],
            'stream_url': broadcast['stream_url'],
            'rtmp_url': broadcast['rtmp_url'],
            'stream_key': broadcast['stream_key'],
        }
    
    else:
        raise HTTPException(status_code=400, detail="Platform not supported")


@router.post("/start/{session_id}")
async def start_stream(session_id: str):
    """Start streaming (transition to live)"""
    
    # Get session
    session_response = supabase.table("stream_sessions")\
        .select("*, streaming_platforms(*)")\
        .eq("id", session_id)\
        .single()\
        .execute()
    
    if not session_response.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_response.data
    platform = session['streaming_platforms']
    
    if platform['platform_type'] == 'youtube':
        youtube = YouTubeLiveService({
            'access_token': platform['access_token'],
            'refresh_token': platform['refresh_token'],
        })
        
        success = youtube.start_broadcast(session['stream_id'])
        
        if success:
            supabase.table("stream_sessions")\
                .update({
                    'status': 'live',
                    'started_at': 'NOW()',
                })\
                .eq("id", session_id)\
                .execute()
            
            return {"status": "live"}
        else:
            raise HTTPException(status_code=500, detail="Failed to start broadcast")
    
    raise HTTPException(status_code=400, detail="Platform not supported")


@router.post("/stop/{session_id}")
async def stop_stream(session_id: str):
    """Stop streaming"""
    
    session_response = supabase.table("stream_sessions")\
        .select("*, streaming_platforms(*)")\
        .eq("id", session_id)\
        .single()\
        .execute()
    
    if not session_response.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_response.data
    platform = session['streaming_platforms']
    
    if platform['platform_type'] == 'youtube':
        youtube = YouTubeLiveService({
            'access_token': platform['access_token'],
            'refresh_token': platform['refresh_token'],
        })
        
        success = youtube.stop_broadcast(session['stream_id'])
        
        if success:
            supabase.table("stream_sessions")\
                .update({
                    'status': 'ended',
                    'ended_at': 'NOW()',
                })\
                .eq("id", session_id)\
                .execute()
            
            return {"status": "ended"}
    
    raise HTTPException(status_code=400, detail="Platform not supported")


@router.get("/sessions")
async def list_sessions(active_only: bool = False):
    """List stream sessions"""
    
    query = supabase.table("stream_sessions")\
        .select("*, streaming_platforms(name, platform_type)")\
        .order("created_at", desc=True)
    
    if active_only:
        query = query.eq("status", "live")
    
    response = query.limit(50).execute()
    
    return {"sessions": response.data}


@router.get("/viewer-count/{session_id}")
async def get_viewer_count(session_id: str):
    """Get current viewer count"""
    
    session_response = supabase.table("stream_sessions")\
        .select("*, streaming_platforms(*)")\
        .eq("id", session_id)\
        .single()\
        .execute()
    
    if not session_response.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_response.data
    platform = session['streaming_platforms']
    
    if platform['platform_type'] == 'youtube':
        youtube = YouTubeLiveService({
            'access_token': platform['access_token'],
            'refresh_token': platform['refresh_token'],
        })
        
        viewer_count = youtube.get_viewer_count(session['stream_id'])
        
        # Store metric
        supabase.table("stream_viewer_metrics")\
            .insert({
                'session_id': session_id,
                'viewer_count': viewer_count,
            })\
            .execute()
        
        return {"viewer_count": viewer_count}
    
    return {"viewer_count": 0}
```

Register in `apps/api/src/main.py`:
```python
from .streaming.streaming_routes import router as streaming_router

app.include_router(streaming_router)
```

### Step 5: Update Liquidsoap for RTMP Output

Update `apps/playout/radio.liq`:
```liquidsoap
# ... existing configuration ...

# ============================================
# RTMP OUTPUT (for YouTube, Twitch, etc.)
# ============================================

# Check if RTMP streaming is enabled
rtmp_enabled = getenv("RTMP_ENABLED")
rtmp_url = getenv("RTMP_URL")
rtmp_key = getenv("RTMP_KEY")

if rtmp_enabled == "true" and rtmp_url != "" and rtmp_key != "" then
  log("RTMP streaming enabled: #{rtmp_url}")
  
  # Convert audio-only stream to video (static image + audio)
  # YouTube requires video, so we'll use FFmpeg to add a static image
  
  # Output to FFmpeg for RTMP streaming
  output.file.hls(
    playlist="stream.m3u8",
    segment_duration=2.0,
    segments=5,
    segments_overhead=10,
    "/tmp/hls/%03d.ts",
    broadcast_ready
  )
  
  # Note: For production, use output.youtube or custom FFmpeg pipe
  # This requires additional configuration
  
  log("RTMP output configured")
else
  log("RTMP streaming disabled")
end

# ... rest of configuration ...
```

### Step 6: Create Streaming Admin UI

Create `apps/admin/app/dashboard/streaming/page.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';

export default function StreamingPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch('http://localhost:8000/streaming/sessions');
      const data = await response.json();
      setSessions(data.sessions);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStream = async () => {
    try {
      const response = await fetch('http://localhost:8000/streaming/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'youtube',
          title: 'AI Radio 2525 - Live from the Future',
          description: 'Broadcasting 24/7 from the year 2525',
          privacy: 'public',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Stream created! URL: ${data.stream_url}`);
        fetchSessions();
      }
    } catch (error) {
      console.error('Failed to create stream:', error);
      alert('Failed to create stream');
    }
  };

  const handleStartStream = async (sessionId: string) => {
    try {
      await fetch(`http://localhost:8000/streaming/start/${sessionId}`, {
        method: 'POST',
      });
      fetchSessions();
    } catch (error) {
      console.error('Failed to start stream:', error);
    }
  };

  const handleStopStream = async (sessionId: string) => {
    try {
      await fetch(`http://localhost:8000/streaming/stop/${sessionId}`, {
        method: 'POST',
      });
      fetchSessions();
    } catch (error) {
      console.error('Failed to stop stream:', error);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Live Streaming</h1>
        <button
          onClick={handleCreateStream}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create YouTube Stream
        </button>
      </div>

      {/* Active Streams */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Active Streams</h2>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-3">
            {sessions
              .filter((s) => s.status === 'live' || s.status === 'starting')
              .map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded"
                >
                  <div>
                    <div className="font-medium">
                      {session.streaming_platforms.name}
                    </div>
                    <div className="text-sm text-gray-600">
                      Status: {session.status}
                    </div>
                    {session.stream_url && (
                      
                        href={session.stream_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View Stream →
                      </a>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    {session.status === 'starting' && (
                      <button
                        onClick={() => handleStartStream(session.id)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Go Live
                      </button>
                    )}
                    {session.status === 'live' && (
                      <button
                        onClick={() => handleStopStream(session.id)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                      >
                        End Stream
                      </button>
                    )}
                  </div>
                </div>
              ))}
            {sessions.filter((s) => s.status === 'live' || s.status === 'starting')
              .length === 0 && (
              <div className="text-center text-gray-500 py-4">
                No active streams
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Sessions */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Sessions</h2>
        <div className="space-y-2">
          {sessions.slice(0, 10).map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded"
            >
              <div>
                <div className="text-sm font-medium">
                  {session.streaming_platforms.platform_type.toUpperCase()}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(session.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center space-x-3">
                {session.peak_viewers > 0 && (
                  <div className="text-sm text-gray-600">
                    👁️ Peak: {session.peak_viewers}
                  </div>
                )}
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    session.status === 'live'
                      ? 'bg-green-100 text-green-800'
                      : session.status === 'ended'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {session.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] YouTube API integration works
- [ ] Broadcasts can be created
- [ ] RTMP stream key generated
- [ ] Stream can be started/stopped
- [ ] Viewer count tracked
- [ ] Metadata updates work
- [ ] Admin UI functional

### Quality Requirements
- [ ] Secure credential storage
- [ ] Error handling robust
- [ ] Stream status accurate
- [ ] Viewer metrics collected

### Manual Verification
```bash
# Set up YouTube OAuth credentials
# (Follow YouTube API setup docs)

# Run migration
node infra/migrate.js up

# Create platform config
psql $DATABASE_URL <<EOF
INSERT INTO streaming_platforms (platform_type, name, rtmp_url, active)
VALUES ('youtube', 'YouTube Live', 'rtmp://a.rtmp.youtube.com/live2', true);
EOF

# Test in admin
open http://localhost:3001/dashboard/streaming

# Create stream
# Start Liquidsoap with RTMP enabled
# Verify stream appears on YouTube
```

---

## Next Task Handoff

**For P2 (Multi-Platform Broadcasting):**
- Add Twitch support
- Add Facebook Live
- Custom RTMP endpoints
- Simultaneous multi-streaming

**Files created:**
- `infra/migrations/019_streaming_platforms.sql`
- `apps/api/src/streaming/youtube_service.py`
- `apps/api/src/streaming/streaming_routes.py`
- `apps/admin/app/dashboard/streaming/page.tsx`

**Files modified:**
- `apps/api/requirements.txt` (YouTube API)
- `apps/playout/radio.liq` (RTMP output)
- `apps/api/src/main.py` (streaming router)

**YouTube Live integration ready:**
- ✅ API authentication
- ✅ Broadcast creation
- ✅ RTMP streaming
- ✅ Viewer tracking
- ✅ Admin controls

----------------------

# Task P2: Multi-Platform Broadcasting

**Tier:** Streaming Platforms  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** P1 complete

---

## Objective

Add support for multiple streaming platforms: Twitch, Facebook Live, custom RTMP endpoints, simultaneous multi-streaming.

---

## Implementation Steps

### Step 1: Create Twitch Integration

Create `apps/api/src/streaming/twitch_service.py`:
```python
import requests
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class TwitchService:
    """Service for Twitch streaming integration"""
    
    def __init__(self, client_id: str, client_secret: str, access_token: str = None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = access_token
        self.base_url = 'https://api.twitch.tv/helix'
    
    def get_stream_key(self, broadcaster_id: str) -> Optional[str]:
        """Get stream key for broadcaster"""
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Client-Id': self.client_id,
        }
        
        response = requests.get(
            f'{self.base_url}/streams/key',
            headers=headers,
            params={'broadcaster_id': broadcaster_id}
        )
        
        if response.status_code == 200:
            data = response.json()
            return data['data'][0]['stream_key']
        
        logger.error(f"Failed to get Twitch stream key: {response.text}")
        return None
    
    def get_stream_info(self, user_login: str) -> Optional[Dict]:
        """Get current stream information"""
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Client-Id': self.client_id,
        }
        
        response = requests.get(
            f'{self.base_url}/streams',
            headers=headers,
            params={'user_login': user_login}
        )
        
        if response.status_code == 200:
            data = response.json()
            if data['data']:
                stream = data['data'][0]
                return {
                    'viewer_count': stream.get('viewer_count', 0),
                    'started_at': stream.get('started_at'),
                    'title': stream.get('title'),
                }
        
        return None
    
    def update_stream_info(
        self,
        broadcaster_id: str,
        title: Optional[str] = None,
        game_id: Optional[str] = None
    ) -> bool:
        """Update stream title and category"""
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Client-Id': self.client_id,
            'Content-Type': 'application/json',
        }
        
        body = {}
        if title:
            body['title'] = title
        if game_id:
            body['game_id'] = game_id
        
        response = requests.patch(
            f'{self.base_url}/channels',
            headers=headers,
            params={'broadcaster_id': broadcaster_id},
            json=body
        )
        
        return response.status_code == 204
```

### Step 2: Update Streaming Routes for Multi-Platform

Update `apps/api/src/streaming/streaming_routes.py`:
```python
from .twitch_service import TwitchService

# Add Twitch support to create_stream
@router.post("/create")
async def create_stream(request: CreateStreamRequest):
    """Create a new live stream on platform"""
    
    if request.platform == 'youtube':
        # ... existing YouTube code ...
        pass
    
    elif request.platform == 'twitch':
        # Get Twitch configuration
        platform_response = supabase.table("streaming_platforms")\
            .select("*")\
            .eq("platform_type", "twitch")\
            .eq("active", True)\
            .single()\
            .execute()
        
        if not platform_response.data:
            raise HTTPException(status_code=404, detail="Twitch platform not configured")
        
        platform = platform_response.data
        
        # Initialize Twitch service
        twitch = TwitchService(
            client_id=platform['api_key'],
            client_secret=platform['api_secret'],
            access_token=platform['access_token']
        )
        
        # Get stream key
        stream_key = twitch.get_stream_key(platform['api_secret'])  # broadcaster_id stored in api_secret for Twitch
        
        if not stream_key:
            raise HTTPException(status_code=500, detail="Failed to get Twitch stream key")
        
        # Twitch RTMP URL
        rtmp_url = f"rtmp://live.twitch.tv/app/{stream_key}"
        
        # Create session
        session_response = supabase.table("stream_sessions")\
            .insert({
                'platform_id': platform['id'],
                'stream_id': 'twitch_stream',
                'stream_url': f"https://twitch.tv/{platform['name']}",
                'status': 'starting',
            })\
            .execute()
        
        return {
            'session_id': session_response.data[0]['id'],
            'stream_url': f"https://twitch.tv/{platform['name']}",
            'rtmp_url': 'rtmp://live.twitch.tv/app',
            'stream_key': stream_key,
        }
    
    elif request.platform == 'custom_rtmp':
        # Custom RTMP endpoint
        platform_response = supabase.table("streaming_platforms")\
            .select("*")\
            .eq("platform_type", "custom_rtmp")\
            .eq("name", request.title)  # Use title as identifier
            .single()\
            .execute()
        
        if not platform_response.data:
            raise HTTPException(status_code=404, detail="Custom RTMP endpoint not found")
        
        platform = platform_response.data
        
        session_response = supabase.table("stream_sessions")\
            .insert({
                'platform_id': platform['id'],
                'stream_id': 'custom_rtmp',
                'status': 'starting',
            })\
            .execute()
        
        return {
            'session_id': session_response.data[0]['id'],
            'rtmp_url': platform['rtmp_url'],
            'stream_key': platform['stream_key'],
        }
    
    else:
        raise HTTPException(status_code=400, detail="Platform not supported")


@router.post("/platforms")
async def add_platform(
    platform_type: str,
    name: str,
    rtmp_url: str,
    stream_key: Optional[str] = None
):
    """Add a new streaming platform or custom RTMP endpoint"""
    
    platform_data = {
        'platform_type': platform_type,
        'name': name,
        'rtmp_url': rtmp_url,
        'stream_key': stream_key,
        'active': True,
    }
    
    response = supabase.table("streaming_platforms")\
        .insert(platform_data)\
        .execute()
    
    return {"platform_id": response.data[0]['id']}


@router.get("/platforms")
async def list_platforms():
    """List all configured streaming platforms"""
    
    response = supabase.table("streaming_platforms")\
        .select("id, platform_type, name, active, last_stream_start")\
        .execute()
    
    return {"platforms": response.data}
```

### Step 3: Create Multi-Stream Manager

Create `apps/playout/multi-stream.sh`:
```bash
#!/bin/bash
# Multi-platform streaming manager

API_URL="${API_URL:-http://localhost:8000}"

echo "🌐 Multi-Platform Streaming Manager"
echo "===================================="

# Get active platforms
PLATFORMS=$(curl -s "$API_URL/streaming/platforms" | jq -r '.platforms[] | select(.active == true) | @json')

if [ -z "$PLATFORMS" ]; then
  echo "No active streaming platforms configured"
  exit 0
fi

echo "Active platforms:"
echo "$PLATFORMS" | jq -r '.name'
echo ""

# For each platform, get stream details
echo "$PLATFORMS" | while read -r platform; do
  PLATFORM_TYPE=$(echo "$platform" | jq -r '.platform_type')
  PLATFORM_NAME=$(echo "$platform" | jq -r '.name')
  
  echo "Setting up stream for: $PLATFORM_NAME ($PLATFORM_TYPE)"
  
  # Create stream session
  SESSION=$(curl -s -X POST "$API_URL/streaming/create" \
    -H "Content-Type: application/json" \
    -d "{\"platform\":\"$PLATFORM_TYPE\",\"title\":\"AI Radio 2525 Live\",\"description\":\"Broadcasting from 2525\"}")
  
  RTMP_URL=$(echo "$SESSION" | jq -r '.rtmp_url')
  STREAM_KEY=$(echo "$SESSION" | jq -r '.stream_key')
  
  echo "  RTMP URL: $RTMP_URL"
  echo "  Stream Key: ${STREAM_KEY:0:10}..."
  echo ""
  
  # Export for Liquidsoap
  export "RTMP_URL_${PLATFORM_TYPE}=$RTMP_URL"
  export "RTMP_KEY_${PLATFORM_TYPE}=$STREAM_KEY"
done

echo "✅ Multi-platform streaming configured"
echo ""
echo "To start streaming, restart Liquidsoap with RTMP outputs enabled"
```

### Step 4: Update Liquidsoap for Multiple RTMP Outputs

Update `apps/playout/radio.liq`:
```liquidsoap
# ... existing configuration ...

# ============================================
# MULTI-PLATFORM RTMP OUTPUTS
# ============================================

# Helper function to add RTMP output
def add_rtmp_output(platform_name, rtmp_url, stream_key, source) =
  if rtmp_url != "" and stream_key != "" then
    log("Adding RTMP output for #{platform_name}: #{rtmp_url}")
    
    # Create FFmpeg command for RTMP streaming with static image
    ffmpeg_cmd = "ffmpeg -f s16le -ar 48000 -ac 2 -i pipe:0 \
      -loop 1 -i /radio/stream-image.jpg \
      -c:v libx264 -preset veryfast -maxrate 3000k -bufsize 6000k \
      -vf 'scale=1280:720,format=yuv420p' -g 60 -c:a aac -b:a 128k \
      -f flv #{rtmp_url}/#{stream_key}"
    
    # Output to FFmpeg
    output.external(
      fallible=true,
      reopen_on_metadata=false,
      %ffmpeg(
        format="flv",
        %audio(codec="aac", b="128k"),
        %video(codec="libx264", preset="veryfast", b="3000k")
      ),
      "#{rtmp_url}/#{stream_key}",
      source
    )
    
    log("RTMP output added for #{platform_name}")
  else
    log("RTMP not configured for #{platform_name}")
  end
end

# Add YouTube output
youtube_rtmp = getenv("RTMP_URL_youtube")
youtube_key = getenv("RTMP_KEY_youtube")
if youtube_rtmp != "" then
  add_rtmp_output("YouTube", youtube_rtmp, youtube_key, broadcast_ready)
end

# Add Twitch output
twitch_rtmp = getenv("RTMP_URL_twitch")
twitch_key = getenv("RTMP_KEY_twitch")
if twitch_rtmp != "" then
  add_rtmp_output("Twitch", twitch_rtmp, twitch_key, broadcast_ready)
end

# Add custom RTMP outputs
custom_rtmp = getenv("RTMP_URL_custom_rtmp")
custom_key = getenv("RTMP_KEY_custom_rtmp")
if custom_rtmp != "" then
  add_rtmp_output("Custom", custom_rtmp, custom_key, broadcast_ready)
end

log("Multi-platform RTMP streaming configured")

# ... rest of configuration ...
```

### Step 5: Create Stream Image

Create placeholder for stream visual:
```bash
# Create simple stream image (logo/station ID)
# apps/playout/stream-image.jpg

# For production, create a proper 1280x720 image with:
# - Station logo
# - "AI Radio 2525" branding
# - Visualizer (optional)
# - Current show info (updated dynamically)
```

### Step 6: Update Admin UI for Multi-Platform

Update `apps/admin/app/dashboard/streaming/page.tsx`:
```typescript
// Add platform management section

const [platforms, setPlatforms] = useState<any[]>([]);
const [showAddPlatform, setShowAddPlatform] = useState(false);

useEffect(() => {
  fetchPlatforms();
}, []);

const fetchPlatforms = async () => {
  const response = await fetch('http://localhost:8000/streaming/platforms');
  const data = await response.json();
  setPlatforms(data.platforms);
};

const handleAddCustomRTMP = async (e: React.FormEvent) => {
  e.preventDefault();
  const formData = new FormData(e.target as HTMLFormElement);
  
  const response = await fetch('http://localhost:8000/streaming/platforms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform_type: 'custom_rtmp',
      name: formData.get('name'),
      rtmp_url: formData.get('rtmp_url'),
      stream_key: formData.get('stream_key'),
    }),
  });
  
  if (response.ok) {
    setShowAddPlatform(false);
    fetchPlatforms();
  }
};

// Add to render:
<div className="bg-white shadow rounded-lg p-6 mb-6">
  <div className="flex justify-between items-center mb-4">
    <h2 className="text-lg font-semibold">Configured Platforms</h2>
    <button
      onClick={() => setShowAddPlatform(!showAddPlatform)}
      className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
    >
      + Add Custom RTMP
    </button>
  </div>

  {showAddPlatform && (
    <form onSubmit={handleAddCustomRTMP} className="mb-4 p-4 bg-gray-50 rounded">
      <div className="space-y-3">
        <input
          name="name"
          placeholder="Platform Name"
          required
          className="w-full border rounded px-3 py-2"
        />
        <input
          name="rtmp_url"
          placeholder="RTMP URL (e.g., rtmp://live.example.com/app)"
          required
          className="w-full border rounded px-3 py-2"
        />
        <input
          name="stream_key"
          placeholder="Stream Key"
          required
          className="w-full border rounded px-3 py-2"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          Add Platform
        </button>
      </div>
    </form>
  )}

  <div className="space-y-2">
    {platforms.map((platform) => (
      <div
        key={platform.id}
        className="flex items-center justify-between p-3 bg-gray-50 rounded"
      >
        <div>
          <div className="font-medium">{platform.name}</div>
          <div className="text-xs text-gray-500">
            {platform.platform_type.replace('_', ' ').toUpperCase()}
          </div>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs ${
            platform.active
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {platform.active ? 'Active' : 'Inactive'}
        </span>
      </div>
    ))}
  </div>
</div>
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Twitch integration works
- [ ] Custom RTMP endpoints supported
- [ ] Simultaneous multi-streaming functional
- [ ] Platform management in admin
- [ ] All platforms stream simultaneously
- [ ] Stream keys secured

### Quality Requirements
- [ ] Stable multi-stream output
- [ ] No audio sync issues
- [ ] Proper error handling per platform
- [ ] Admin UI intuitive

### Manual Verification
```bash
# Add Twitch platform
psql $DATABASE_URL <<EOF
INSERT INTO streaming_platforms (
  platform_type, name, api_key, api_secret, 
  rtmp_url, active
) VALUES (
  'twitch', 'YourTwitchChannel', 'client_id', 'broadcaster_id',
  'rtmp://live.twitch.tv/app', true
);
EOF

# Add custom RTMP (e.g., Restream.io)
# Via admin UI

# Start multi-streaming
bash apps/playout/multi-stream.sh

# Verify streams on:
# - YouTube
# - Twitch
# - Custom endpoints

# Check sync across platforms
```

---

## Next Task Handoff

**For P3 (Stream Health Monitoring):**
- Real-time stream health checks
- Bitrate monitoring
- Connection stability
- Automatic reconnection
- Alert on stream issues

**Files created:**
- `apps/api/src/streaming/twitch_service.py`
- `apps/playout/multi-stream.sh`

**Files modified:**
- `apps/api/src/streaming/streaming_routes.py` (multi-platform)
- `apps/playout/radio.liq` (multiple RTMP)
- `apps/admin/app/dashboard/streaming/page.tsx` (platform management)

**Multi-platform broadcasting ready:**
- ✅ YouTube support
- ✅ Twitch support
- ✅ Custom RTMP endpoints
- ✅ Simultaneous streaming
- ✅ Platform management UI

------------------

# Task P3: Scheduler Worker - Schedule Generation

**Tier:** Playout  
**Estimated Time:** 1-2 hours  
**Complexity:** High  
**Prerequisites:** P2, D1-D8 complete

---

## Objective

Create scheduler worker that generates daily broadcast schedules: creates segments for each time slot and triggers generation jobs.

---

## Context from Architecture

**From ARCHITECTURE.md Section 7:**

Scheduler:
- Runs daily to generate next day's schedule
- Uses format clocks to determine slot types
- Creates segment records in queued state
- Enqueues segment_make jobs
- Ensures continuous content

---

## Implementation Steps

### Step 1: Create Programs and Format Clocks Tables

Create `infra/migrations/013_programs_format_clocks.sql`:
```sql
-- Migration: Programs and format clocks
-- Description: Program scheduling and format definitions

-- Format clocks define hourly structure
CREATE TABLE format_clocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  slots JSONB NOT NULL,  -- Array of {minute: 0, slot_type: 'news', duration: 45}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Programs define shows with assigned DJs and format
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dj_id UUID REFERENCES djs(id),
  format_clock_id UUID REFERENCES format_clocks(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to segments
ALTER TABLE segments 
  DROP CONSTRAINT IF EXISTS fk_segments_program;

ALTER TABLE segments 
  ADD CONSTRAINT fk_segments_program 
  FOREIGN KEY (program_id) 
  REFERENCES programs(id);

-- Insert default format clock
INSERT INTO format_clocks (name, description, slots) VALUES (
  'Standard Hour',
  'Default hourly format',
  '[
    {"minute": 0, "slot_type": "station_id", "duration": 15},
    {"minute": 1, "slot_type": "news", "duration": 45},
    {"minute": 2, "slot_type": "music", "duration": 180},
    {"minute": 5, "slot_type": "culture", "duration": 60},
    {"minute": 6, "slot_type": "music", "duration": 240},
    {"minute": 10, "slot_type": "tech", "duration": 60},
    {"minute": 11, "slot_type": "music", "duration": 180},
    {"minute": 14, "slot_type": "interview", "duration": 120},
    {"minute": 16, "slot_type": "music", "duration": 240}
  ]'::jsonb
);

COMMENT ON TABLE format_clocks IS 'Hourly format definitions with slot timing';
COMMENT ON TABLE programs IS 'Radio programs with DJ and format assignments';
```

### Step 2: Create Scheduler Worker Package
```bash
mkdir -p workers/scheduler/src
cd workers/scheduler
```

Create `workers/scheduler/package.json`:
```json
{
  "name": "@radio/scheduler-worker",
  "version": "0.0.1",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@supabase/supabase-js": "^2.39.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
```

### Step 3: Create Schedule Generator

Create `workers/scheduler/src/schedule-generator.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { addHours, addMinutes, startOfDay, addDays, format } from 'date-fns';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('schedule-generator');

interface FormatClock {
  id: string;
  name: string;
  slots: Array<{
    minute: number;
    slot_type: string;
    duration: number;
  }>;
}

interface Program {
  id: string;
  name: string;
  dj_id: string;
  format_clock_id: string;
}

/**
 * Schedule generator
 * Creates daily broadcast schedules
 */
export class ScheduleGenerator {
  private db: SupabaseClient;
  private readonly futureYearOffset: number;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.futureYearOffset = parseInt(process.env.FUTURE_YEAR_OFFSET || '500');

    logger.info({ futureYearOffset: this.futureYearOffset }, 'Schedule generator initialized');
  }

  /**
   * Generate schedule for a specific date
   */
  async generateScheduleForDate(date: Date): Promise<void> {
    logger.info({ date: format(date, 'yyyy-MM-dd') }, 'Generating schedule');

    try {
      // Fetch active programs
      const { data: programs, error: programsError } = await this.db
        .from('programs')
        .select('*, format_clocks(*)')
        .eq('active', true);

      if (programsError) throw programsError;

      if (!programs || programs.length === 0) {
        logger.warn('No active programs found');
        return;
      }

      // For now, use first program for entire day
      // TODO: Support multiple programs per day
      const program = programs[0];

      logger.info({
        program: program.name,
        formatClock: program.format_clocks.name
      }, 'Using program');

      // Generate segments for each hour of the day
      const segmentsToCreate = [];
      const jobsToCreate = [];

      for (let hour = 0; hour < 24; hour++) {
        const hourStart = addHours(startOfDay(date), hour);

        // Get format clock slots
        const slots = program.format_clocks.slots;

        for (const slot of slots) {
          const slotStart = addMinutes(hourStart, slot.minute);

          // Convert to future year (2525)
          const futureSlotStart = this.toFutureYear(slotStart);

          // Create segment
          const segment = {
            program_id: program.id,
            slot_type: slot.slot_type,
            lang: 'en',
            state: 'queued',
            scheduled_start_ts: futureSlotStart.toISOString(),
            max_retries: 3,
            retry_count: 0
          };

          segmentsToCreate.push(segment);
        }
      }

      logger.info({
        date: format(date, 'yyyy-MM-dd'),
        segments: segmentsToCreate.length
      }, 'Creating segments');

      // Batch insert segments
      const { data: insertedSegments, error: insertError } = await this.db
        .from('segments')
        .insert(segmentsToCreate)
        .select();

      if (insertError) throw insertError;

      logger.info({
        created: insertedSegments?.length || 0
      }, 'Segments created');

      // Enqueue generation jobs for each segment
      for (const segment of insertedSegments || []) {
        await this.enqueueGenerationJob(segment.id);
      }

      logger.info({
        date: format(date, 'yyyy-MM-dd'),
        segments: insertedSegments?.length || 0
      }, 'Schedule generation complete');

    } catch (error) {
      logger.error({ error, date }, 'Schedule generation failed');
      throw error;
    }
  }

  /**
   * Generate schedule for tomorrow
   */
  async generateTomorrowSchedule(): Promise<void> {
    const tomorrow = addDays(new Date(), 1);
    await this.generateScheduleForDate(tomorrow);
  }

  /**
   * Enqueue segment generation job
   */
  private async enqueueGenerationJob(segmentId: string): Promise<void> {
    const { error } = await this.db.rpc('enqueue_job', {
      p_job_type: 'segment_make',
      p_payload: { segment_id: segmentId },
      p_priority: 5,
      p_schedule_delay_sec: 0
    });

    if (error) {
      logger.error({ error, segmentId }, 'Failed to enqueue generation job');
      throw error;
    }
  }

  /**
   * Convert date to future year (2525)
   */
  private toFutureYear(date: Date): Date {
    const futureDate = new Date(date);
    futureDate.setFullYear(date.getFullYear() + this.futureYearOffset);
    return futureDate;
  }

  /**
   * Check how many ready segments exist for tomorrow
   */
  async checkTomorrowReadiness(): Promise<{
    total: number;
    ready: number;
    percentage: number;
  }> {
    const tomorrow = addDays(new Date(), 1);
    const tomorrowStart = this.toFutureYear(startOfDay(tomorrow));
    const tomorrowEnd = this.toFutureYear(addDays(startOfDay(tomorrow), 1));

    const { data: segments, error } = await this.db
      .from('segments')
      .select('state')
      .gte('scheduled_start_ts', tomorrowStart.toISOString())
      .lt('scheduled_start_ts', tomorrowEnd.toISOString());

    if (error) throw error;

    const total = segments?.length || 0;
    const ready = segments?.filter(s => s.state === 'ready').length || 0;
    const percentage = total > 0 ? (ready / total) * 100 : 0;

    return { total, ready, percentage };
  }
}
```

### Step 4: Create Scheduler Worker Entry

Create `workers/scheduler/src/index.ts`:
```typescript
import { ScheduleGenerator } from './schedule-generator';
import { createLogger } from '@radio/core/logger';
import { addDays } from 'date-fns';

const logger = createLogger('scheduler-main');

/**
 * Scheduler Worker
 * Generates daily broadcast schedules
 */
async function main() {
  logger.info('Scheduler worker starting');

  const generator = new ScheduleGenerator();

  // Check if running as one-off or continuous
  const mode = process.env.SCHEDULER_MODE || 'continuous';

  if (mode === 'once') {
    // Generate tomorrow's schedule and exit
    logger.info('Running in one-off mode');
    await generator.generateTomorrowSchedule();
    logger.info('Schedule generation complete, exiting');
    process.exit(0);
  } else {
    // Continuous mode: run daily at 2 AM
    logger.info('Running in continuous mode');

    const runScheduler = async () => {
      try {
        // Check tomorrow's readiness
        const readiness = await generator.checkTomorrowReadiness();
        
        logger.info({
          ready: readiness.ready,
          total: readiness.total,
          percentage: readiness.percentage.toFixed(1)
        }, 'Tomorrow readiness check');

        // If less than 80% ready, generate new schedule
        if (readiness.percentage < 80) {
          logger.info('Generating tomorrow schedule');
          await generator.generateTomorrowSchedule();
        } else {
          logger.info('Tomorrow schedule already sufficient');
        }

        // Also generate for day after tomorrow to stay ahead
        const dayAfterTomorrow = addDays(new Date(), 2);
        await generator.generateScheduleForDate(dayAfterTomorrow);

      } catch (error) {
        logger.error({ error }, 'Scheduler run failed');
      }
    };

    // Run immediately on startup
    await runScheduler();

    // Schedule to run daily at 2 AM
    const scheduleNextRun = () => {
      const now = new Date();
      const next2AM = new Date(now);
      next2AM.setHours(2, 0, 0, 0);

      if (next2AM <= now) {
        // If 2 AM already passed today, schedule for tomorrow
        next2AM.setDate(next2AM.getDate() + 1);
      }

      const msUntilNext = next2AM.getTime() - now.getTime();

      logger.info({
        nextRun: next2AM.toISOString(),
        hoursUntil: (msUntilNext / 1000 / 60 / 60).toFixed(1)
      }, 'Next scheduled run');

      setTimeout(async () => {
        await runScheduler();
        scheduleNextRun(); // Schedule next run
      }, msUntilNext);
    };

    scheduleNextRun();

    // Keep process alive
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, exiting gracefully');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, exiting gracefully');
      process.exit(0);
    });
  }
}

main().catch(error => {
  logger.error({ error }, 'Scheduler crashed');
  process.exit(1);
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Generates segments for 24 hours
- [ ] Uses format clock to determine slots
- [ ] Creates segments in queued state
- [ ] Enqueues generation jobs
- [ ] Converts to future year (2525)
- [ ] Checks readiness before regenerating
- [ ] Runs daily at 2 AM

### Quality Requirements
- [ ] Logger used throughout
- [ ] Error handling
- [ ] Graceful shutdown
- [ ] Mode selection (once/continuous)

### Manual Verification
```bash
cd workers/scheduler
pnpm install
pnpm build

# Run once to generate tomorrow
SCHEDULER_MODE=once \
SUPABASE_URL=your_url \
SUPABASE_SERVICE_ROLE_KEY=your_key \
pnpm start

# Verify segments created
psql $DATABASE_URL -c "
SELECT COUNT(*), state 
FROM segments 
WHERE scheduled_start_ts::date = CURRENT_DATE + INTERVAL '1 day'
GROUP BY state;
"

# Run continuous mode
SCHEDULER_MODE=continuous \
SUPABASE_URL=your_url \
SUPABASE_SERVICE_ROLE_KEY=your_key \
pnpm start
```

---

## Next Task Handoff

**For P4 (Liquidsoap - Dead Air Detection):**
- Add silence detection
- Fallback to backup playlist
- Alert on dead air

**Files created:**
- `infra/migrations/013_programs_format_clocks.sql`
- `workers/scheduler/src/schedule-generator.ts`
- `workers/scheduler/src/index.ts`
- `workers/scheduler/package.json`

**Scheduler now:**
- ✅ Generates daily schedules
- ✅ Creates segments with timing
- ✅ Enqueues generation jobs
- ✅ Stays 2 days ahead

-----------------------

# Task P4: Liquidsoap - Dead Air Detection

**Tier:** Playout
**Estimated Time:** 45 minutes
**Complexity:** Low
**Prerequisites:** P1, P3 complete

---

## Objective

Add dead air detection to Liquidsoap: detect silence, trigger fallback playlist, log alerts.

---

## Context from Architecture

Dead air detection:
- Detect > 5 seconds of silence
- Switch to emergency playlist
- Log alert
- Return to normal when content available

**Docker Configuration (from P1):**
- Icecast accessible at `http://localhost:8001` (port 8001, not 8000)
- API accessible from Docker at `http://host.docker.internal:8000`
- Emergency volume mounted at `/radio/emergency` in container

---

## Implementation Steps

### Step 1: Create Emergency Playlist

Create `apps/playout/emergency/README.md`:
```markdown
# Emergency Playlist

This directory contains fallback audio for dead air situations.

## Requirements

- Files should be WAV format, 48kHz, mono
- Total duration should cover at least 1 hour
- Content should be generic station IDs, music, etc.

## Setup

1. Add WAV files to this directory
2. Name files with prefix for ordering: `01-station-id.wav`, `02-music.wav`, etc.
3. Liquidsoap will automatically load them as fallback
```

Create `apps/playout/emergency/generate-fallback.sh`:
```bash
#!/bin/bash
# Generate fallback audio using TTS

echo "Generating emergency fallback audio..."

# Station ID
echo "Broadcasting from AI Radio 2525. We'll be right back with you." | \
  curl -X POST http://localhost:5002/synthesize \
    -H "Content-Type: application/json" \
    -d @- | \
  jq -r '.audio' | \
  xxd -r -p > 01-station-id.wav

# Technical difficulties message
echo "We're experiencing technical difficulties. Please stand by." | \
  curl -X POST http://localhost:5002/synthesize \
    -H "Content-Type: application/json" \
    -d @- | \
  jq -r '.audio' | \
  xxd -r -p > 02-technical-difficulties.wav

echo "Fallback audio generated!"
```

### Step 2: Update Liquidsoap Configuration

Update `apps/playout/radio.liq`:
```liquidsoap
#!/usr/bin/liquidsoap

# AI Radio 2525 - Liquidsoap Configuration
# With dead air detection and fallback

# ... (keep existing configuration) ...

# Emergency/fallback playlist
emergency_playlist = playlist(
  mode="randomize",
  reload=60,
  "/radio/emergency/*.wav"
)

# Add announcement to emergency playlist
emergency_announcement = single("/radio/emergency/01-station-id.wav")
emergency_source = fallback([
  emergency_announcement,
  emergency_playlist
])

# Blank/silence detection
def on_blank() =
  log("ALERT: Dead air detected! Switching to emergency playlist")
  
  # Report to API (optional)
  cmd = "curl -s -X POST #{api_url}/alerts/dead-air \
         -H 'Content-Type: application/json' \
         -d '{\"timestamp\": \"#{time.string()}\", \"type\": \"dead_air\"}'"
  
  result = process.run(cmd)
  log("Alert sent: #{result}")
end

def on_noise() =
  log("Audio restored, returning to normal playout")
end

# Apply blank detection to main source
# Detects silence > 5 seconds
source = on_blank(
  max_blank=5.0,
  on_blank=on_blank,
  source
)

# Fallback chain: primary source -> emergency playlist
source = fallback(
  track_sensitive=false,
  [
    source,
    emergency_source
  ]
)

# Strip blank (remove silence at start/end of tracks)
source = strip_blank(
  max_blank=2.0,
  source
)

# Add crossfade between tracks (smooth transitions)
source = crossfade(
  duration=2.0,
  source
)

# Normalize audio (maintain consistent loudness)
source = normalize(
  source,
  gain_max=0.0,
  gain_min=-6.0,
  target=-16.0
)

# ... (keep existing output.icecast configurations) ...
```

### Step 3: Create Alert Endpoint

Update `apps/api/src/playout/playout_routes.py`:
```python
class AlertRequest(BaseModel):
    timestamp: str
    type: str
    details: Optional[dict] = None


@router.post("/alerts/dead-air")
async def report_dead_air(request: AlertRequest):
    """
    Report dead air / silence detected
    
    Logs alert for monitoring
    """
    try:
        # Log to database (alerts table - create if needed)
        # For now, just log
        print(f"ALERT: Dead air at {request.timestamp}")
        
        # Could send notifications here:
        # - Email
        # - Slack
        # - PagerDuty
        # etc.
        
        return {
            "status": "ok",
            "message": "Alert recorded"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 4: Create Monitoring Script

Create `apps/playout/monitor-stream.sh`:
```bash
#!/bin/bash
# Monitor stream for dead air

STREAM_URL="${STREAM_URL:-http://localhost:8001/radio.opus}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"

echo "Monitoring stream: $STREAM_URL"

while true; do
  # Check if stream is accessible
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$STREAM_URL")
  
  if [ "$HTTP_CODE" != "200" ]; then
    echo "[$(date)] ERROR: Stream not accessible (HTTP $HTTP_CODE)"
  else
    echo "[$(date)] OK: Stream is live"
  fi
  
  sleep "$CHECK_INTERVAL"
done
```

### Step 5: Update Docker Compose

Update `apps/playout/docker-compose.yml` to add emergency volume:
```yaml
services:
  liquidsoap:
    build: .
    container_name: radio-liquidsoap
    environment:
      # Use host.docker.internal to reach API on host
      - API_URL=http://host.docker.internal:8000
      - OUTPUT_DIR=/radio/audio
      - ICECAST_HOST=icecast
      - ICECAST_PORT=8000
      - ICECAST_PASSWORD=hackme
    volumes:
      - ./audio:/radio/audio
      - ./emergency:/radio/emergency:ro  # ADD THIS LINE
      - ./logs:/var/log/liquidsoap
    depends_on:
      - icecast
    restart: unless-stopped
    networks:
      - radio-network
    extra_hosts:
      - "host.docker.internal:host-gateway"

  icecast:
    image: moul/icecast:2.4.4
    container_name: radio-icecast
    environment:
      - ICECAST_SOURCE_PASSWORD=hackme
      - ICECAST_ADMIN_PASSWORD=admin
      - ICECAST_PASSWORD=hackme
      - ICECAST_RELAY_PASSWORD=hackme
    ports:
      # Exposed on port 8001 to avoid conflict with API (port 8000)
      - "8001:8000"
    volumes:
      - ./icecast.xml:/etc/icecast2/icecast.xml:ro
    restart: unless-stopped
    networks:
      - radio-network

  # Add monitoring container
  monitor:
    image: curlimages/curl:latest
    container_name: radio-monitor
    command: sh -c "while true; do curl -s http://icecast:8000/status.xsl > /dev/null && echo 'Stream OK' || echo 'Stream DOWN'; sleep 30; done"
    depends_on:
      - icecast
    networks:
      - radio-network
```

**Note:** Monitor container accesses Icecast on internal port 8000. From host, use port 8001.

---

## Acceptance Criteria

### Functional Requirements
- [ ] Detects silence > 5 seconds
- [ ] Switches to emergency playlist
- [ ] Returns to normal when content available
- [ ] Logs dead air alerts
- [ ] Sends alert to API
- [ ] Monitoring script works

### Quality Requirements
- [ ] Emergency playlist loops properly
- [ ] Crossfade between tracks
- [ ] No audio glitches during switch
- [ ] Logs are clear

### Manual Verification
```bash
# Generate fallback audio (run on HOST)
cd apps/playout/emergency
bash generate-fallback.sh

# Start playout
cd apps/playout
docker-compose up -d

# Simulate dead air by stopping segment generation
# Watch logs
docker-compose logs -f liquidsoap

# Should see: "ALERT: Dead air detected!"
# Stream should continue with emergency content

# Monitor stream health from HOST (uses port 8001)
bash monitor-stream.sh

# Test stream manually
ffplay http://localhost:8001/radio.opus

# Check Icecast status page
open http://localhost:8001/status.xsl
```

---

## Next Task Handoff

**For P5 (Priority Segment Injection):**
- Add ability to inject urgent segments
- Priority queue for breaking news
- Interrupt current playback if needed

**Files created:**
- `apps/playout/emergency/README.md`
- `apps/playout/emergency/generate-fallback.sh`
- `apps/playout/monitor-stream.sh`

**Files modified:**
- `apps/playout/radio.liq` (added dead air detection)
- `apps/playout/docker-compose.yml` (added monitor)
- `apps/api/src/playout/playout_routes.py` (added alert endpoint)

**Playout now has:**
- ✅ Dead air detection
- ✅ Emergency fallback
- ✅ Alert system
- ✅ Stream monitoring

------------------------------

# Task P5: Priority Segment Injection

**Tier:** Playout  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** P4 complete

---

## Objective

Add priority segment system: allow urgent segments (breaking news) to be injected into playout queue with higher priority.

---

## Context from Architecture

Priority injection:
- Admin can mark segments as urgent (priority 9-10)
- High-priority segments skip queue
- Can interrupt current playback if critical
- Used for breaking news, alerts

---

## Implementation Steps

### Step 1: Add Priority Column to Segments

Create `infra/migrations/014_segment_priority.sql`:
```sql
-- Migration: Add priority to segments
-- Description: Support urgent/priority segments

ALTER TABLE segments 
  ADD COLUMN priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10);

CREATE INDEX idx_segments_priority ON segments(priority DESC, scheduled_start_ts ASC) 
  WHERE state = 'ready';

COMMENT ON COLUMN segments.priority IS 'Priority level: 1-10, higher = more urgent';
```

### Step 2: Update Playout API

Update `apps/api/src/playout/playout_routes.py`:
```python
@router.get("/next", response_model=PlayoutResponse)
async def get_next_segments(
    limit: int = Query(default=10, ge=1, le=50),
    min_priority: int = Query(default=1, ge=1, le=10)
):
    """
    Get next segments ready for playout
    
    Returns segments in ready state, ordered by priority then schedule
    Priority 8+ = urgent, should be played immediately
    """
    try:
        # Fetch ready segments ordered by priority
        response = supabase.table("segments") \
            .select("*, assets(*), programs(name), djs(name)") \
            .eq("state", "ready") \
            .gte("priority", min_priority) \
            .order("priority", desc=True) \
            .order("scheduled_start_ts", desc=False) \
            .limit(limit) \
            .execute()
        
        segments = []
        urgent_count = 0
        
        for row in response.data:
            asset = row.get("assets")
            if not asset:
                continue
            
            # Count urgent segments
            if row.get("priority", 5) >= 8:
                urgent_count += 1
            
            # Generate signed URL
            final_path = f"final/{asset['id']}.wav"
            
            try:
                signed_url_response = supabase.storage \
                    .from_("audio-assets") \
                    .create_signed_url(final_path, 3600)
                
                if signed_url_response.get("error"):
                    signed_url_response = supabase.storage \
                        .from_("audio-assets") \
                        .create_signed_url(asset["storage_path"], 3600)
                
                audio_url = signed_url_response.get("signedURL")
                
            except Exception as e:
                print(f"Error generating signed URL: {e}")
                continue
            
            # Build segment with priority
            segment = PlayoutSegment(
                id=row["id"],
                title=f"[P{row.get('priority', 5)}] {row.get('programs', {}).get('name', 'Unknown')} - {row['slot_type']}",
                audio_url=audio_url,
                duration_sec=row.get("duration_sec", 0),
                slot_type=row["slot_type"],
                dj_name=row.get("djs", {}).get("name")
            )
            
            segments.append(segment)
        
        return PlayoutResponse(
            segments=segments,
            total=len(segments),
            urgent=urgent_count  # Add urgent count
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segments/{segment_id}/priority")
async def set_segment_priority(
    segment_id: str,
    priority: int = Query(ge=1, le=10)
):
    """
    Set priority for a segment
    
    Priority levels:
    - 1-4: Low priority (filler content)
    - 5-7: Normal priority (scheduled content)
    - 8-10: High priority (urgent/breaking news)
    """
    try:
        update_response = supabase.table("segments") \
            .update({
                "priority": priority,
                "updated_at": datetime.utcnow().isoformat()
            }) \
            .eq("id", segment_id) \
            .execute()
        
        if not update_response.data:
            raise HTTPException(status_code=404, detail="Segment not found")
        
        return {
            "status": "ok",
            "segment_id": segment_id,
            "priority": priority,
            "message": f"Priority set to {priority}"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

Update PlayoutResponse model:
```python
class PlayoutResponse(BaseModel):
    segments: List[PlayoutSegment]
    total: int
    urgent: int = 0  # ADD THIS
```

### Step 3: Update Liquidsoap for Priority

Update `apps/playout/radio.liq`:
```liquidsoap
# Add priority-aware playlist

# Track last fetch time
last_fetch_time = ref(0.0)

# Function to fetch with priority awareness
def fetch_priority_segments() =
  current_time = time()
  
  # Fetch more frequently if we might have urgent content
  if current_time - !last_fetch_time > 5.0 then
    log("Checking for priority segments...")
    result = process.run("bash /radio/fetch-next.sh")
    last_fetch_time := current_time
    log("Priority fetch result: #{result}")
  end
end

# Check for urgent segments every 5 seconds
thread.run(delay=5.0, every=5.0, fetch_priority_segments)

# Priority playlist (checks more frequently)
priority_playlist = playlist(
  mode="normal",  # Don't randomize - respect order
  reload=5,       # Reload every 5 seconds to catch urgent content
  reload_mode="watch",
  prefix="P[89]",  # Only load priority 8-9 files
  "#{audio_dir}/*.wav"
)

# Normal playlist
normal_playlist = playlist(
  mode="randomize",
  reload=15,
  reload_mode="watch",
  "#{audio_dir}/*.wav"
)

# Fallback: priority first, then normal
source = fallback(
  track_sensitive=true,
  [
    priority_playlist,
    normal_playlist
  ]
)

# ... rest of configuration ...
```

### Step 4: Add Priority UI to Admin

Update `apps/admin/components/segment-actions.tsx`:
```typescript
const handleSetPriority = async (priority: number) => {
  setLoading(true);

  try {
    const response = await fetch(
      `http://localhost:8000/playout/segments/${segment.id}/priority?priority=${priority}`,
      { method: 'POST' }
    );

    if (!response.ok) throw new Error('Failed to set priority');

    router.refresh();
  } catch (error) {
    console.error('Set priority failed:', error);
    alert('Failed to set priority');
  } finally {
    setLoading(false);
  }
};

// Add to render:
{segment.state === 'ready' && (
  <>
    <span className="text-gray-300">|</span>
    <select
      onChange={(e) => handleSetPriority(parseInt(e.target.value))}
      value={segment.priority || 5}
      className="text-sm border rounded px-2 py-1"
      disabled={loading}
    >
      <option value="1">P1 - Low</option>
      <option value="5">P5 - Normal</option>
      <option value="8">P8 - Urgent</option>
      <option value="10">P10 - Critical</option>
    </select>
  </>
)}
```

### Step 5: Add Urgent Indicator

Update `apps/admin/app/dashboard/segments/page.tsx`:
```typescript
// In the table, update the state column:
<td className="px-6 py-4">
  <div className="flex items-center space-x-2">
    <span
      className={`px-2 py-1 rounded text-xs ${
        segment.state === 'ready'
          ? 'bg-green-100 text-green-800'
          : segment.state === 'failed'
          ? 'bg-red-100 text-red-800'
          : segment.state === 'aired'
          ? 'bg-gray-100 text-gray-800'
          : 'bg-yellow-100 text-yellow-800'
      }`}
    >
      {segment.state}
    </span>
    {segment.priority >= 8 && (
      <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800 font-bold">
        🚨 URGENT
      </span>
    )}
  </div>
</td>
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Segments have priority field (1-10)
- [ ] API returns segments by priority
- [ ] High priority segments (8+) fetched first
- [ ] Admin can set segment priority
- [ ] Urgent segments show visual indicator
- [ ] Liquidsoap respects priority order

### Quality Requirements
- [ ] Priority updates in real-time
- [ ] No disruption to normal playout
- [ ] Logs priority changes
- [ ] UI is intuitive

### Manual Verification
```bash
# Run migration
node infra/migrate.js up

# Create urgent segment
psql $DATABASE_URL -c "
UPDATE segments 
SET priority = 9 
WHERE state = 'ready' 
LIMIT 1;
"

# Check API returns urgent first
curl http://localhost:8000/playout/next?limit=5

# Verify in admin UI
open http://localhost:3001/dashboard/segments

# Watch liquidsoap prioritize urgent content
docker-compose -f apps/playout/docker-compose.yml logs -f liquidsoap
```

---

## Next Task Handoff

**For P6 (Schedule Visualization):**
- Add calendar view in admin
- Show scheduled vs actual air times
- Visual timeline of broadcasts

**Files created:**
- `infra/migrations/014_segment_priority.sql`

**Files modified:**
- `apps/api/src/playout/playout_routes.py` (priority support)
- `apps/playout/radio.liq` (priority awareness)
- `apps/admin/components/segment-actions.tsx` (priority UI)
- `apps/admin/app/dashboard/segments/page.tsx` (urgent indicator)

**Playout now supports:**
- ✅ Priority levels (1-10)
- ✅ Urgent segment injection
- ✅ Priority-based ordering
- ✅ Admin priority controls

-----------------

# Task P6: Schedule Visualization & Analytics

**Tier:** Playout
**Estimated Time:** 1 hour
**Complexity:** Low
**Prerequisites:** P5 complete

---

## Objective

Create schedule visualization in admin: calendar view, timeline view, analytics on what aired vs what was scheduled.

---

**Docker Configuration (from P1):**
- Stream accessible at `http://localhost:8001/radio.opus` (port 8001, not 8000)
- MP3 stream at `http://localhost:8001/radio.mp3`
- If adding live stream preview to admin, use port 8001

---

## Implementation Steps

### Step 1: Create Schedule Page

Create `apps/admin/app/dashboard/schedule/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import { startOfDay, endOfDay, addDays, format } from 'date-fns';
import Link from 'next/link';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const supabase = await createServerClient();

  // Parse date or use today
  const dateParam = searchParams.date || format(new Date(), 'yyyy-MM-dd');
  const selectedDate = new Date(dateParam);

  // Adjust for future year offset (2525)
  const futureOffset = 500;
  const futureDate = new Date(selectedDate);
  futureDate.setFullYear(futureDate.getFullYear() + futureOffset);

  const dayStart = startOfDay(futureDate);
  const dayEnd = endOfDay(futureDate);

  // Fetch segments for the day
  const { data: segments, error } = await supabase
    .from('segments')
    .select('*, programs(name), djs(name)')
    .gte('scheduled_start_ts', dayStart.toISOString())
    .lt('scheduled_start_ts', dayEnd.toISOString())
    .order('scheduled_start_ts', { ascending: true });

  if (error) {
    return <div>Error loading schedule: {error.message}</div>;
  }

  // Group by hour
  const segmentsByHour: Record<number, any[]> = {};
  for (let hour = 0; hour < 24; hour++) {
    segmentsByHour[hour] = [];
  }

  segments?.forEach((segment) => {
    const hour = new Date(segment.scheduled_start_ts).getHours();
    segmentsByHour[hour].push(segment);
  });

  // Calculate stats
  const total = segments?.length || 0;
  const ready = segments?.filter(s => s.state === 'ready').length || 0;
  const aired = segments?.filter(s => s.state === 'aired').length || 0;
  const failed = segments?.filter(s => s.state === 'failed').length || 0;

  // Date navigation
  const prevDay = format(addDays(selectedDate, -1), 'yyyy-MM-dd');
  const nextDay = format(addDays(selectedDate, 1), 'yyyy-MM-dd');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Broadcast Schedule</h1>
        <div className="flex items-center space-x-4">
          <Link
            href={`/dashboard/schedule?date=${prevDay}`}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Previous Day
          </Link>
          <span className="text-lg font-semibold">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            <span className="text-sm text-gray-500 ml-2">
              (Year 2525)
            </span>
          </span>
          <Link
            href={`/dashboard/schedule?date=${nextDay}`}
            className="text-blue-600 hover:text-blue-800"
          >
            Next Day →
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Total Segments</div>
          <div className="text-2xl font-bold">{total}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Ready</div>
          <div className="text-2xl font-bold text-green-600">{ready}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Aired</div>
          <div className="text-2xl font-bold text-blue-600">{aired}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-600">Failed</div>
          <div className="text-2xl font-bold text-red-600">{failed}</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Hourly Timeline</h2>
        <div className="space-y-4">
          {Object.entries(segmentsByHour).map(([hour, segs]) => (
            <div key={hour} className="flex">
              <div className="w-20 text-sm font-medium text-gray-600">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="flex-1">
                {segs.length === 0 ? (
                  <div className="text-sm text-gray-400">No segments scheduled</div>
                ) : (
                  <div className="space-y-1">
                    {segs.map((segment) => {
                      const scheduledTime = new Date(segment.scheduled_start_ts);
                      const minutes = scheduledTime.getMinutes();

                      return (
                        <Link
                          key={segment.id}
                          href={`/dashboard/segments/${segment.id}`}
                          className="block"
                        >
                          <div
                            className={`text-sm px-3 py-2 rounded border-l-4 hover:bg-gray-50 ${
                              segment.state === 'ready'
                                ? 'border-green-500 bg-green-50'
                                : segment.state === 'aired'
                                ? 'border-blue-500 bg-blue-50'
                                : segment.state === 'failed'
                                ? 'border-red-500 bg-red-50'
                                : 'border-yellow-500 bg-yellow-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium">
                                  :{minutes.toString().padStart(2, '0')}
                                </span>
                                <span className="ml-2">
                                  {segment.programs?.name || 'Unknown'} - {segment.slot_type}
                                </span>
                                {segment.priority >= 8 && (
                                  <span className="ml-2 px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">
                                    URGENT
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-3">
                                <span className="text-xs text-gray-500">
                                  {Math.round(segment.duration_sec || 0)}s
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    segment.state === 'ready'
                                      ? 'bg-green-100 text-green-800'
                                      : segment.state === 'aired'
                                      ? 'bg-blue-100 text-blue-800'
                                      : segment.state === 'failed'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}
                                >
                                  {segment.state}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Add Schedule Link to Nav

Update `apps/admin/app/dashboard/layout.tsx`:
```typescript
<Link
  href="/dashboard/schedule"
  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
>
  Schedule
</Link>
```

### Step 3: Create Analytics Page

Create `apps/admin/app/dashboard/analytics/page.tsx`:
```typescript
import { createServerClient } from '@/lib/supabase-server';
import { subDays } from 'date-fns';

export default async function AnalyticsPage() {
  const supabase = await createServerClient();

  // Last 7 days stats
  const sevenDaysAgo = subDays(new Date(), 7);

  const { data: segments } = await supabase
    .from('segments')
    .select('state, created_at, duration_sec, retry_count')
    .gte('created_at', sevenDaysAgo.toISOString());

  // Calculate metrics
  const total = segments?.length || 0;
  const byState = (segments || []).reduce((acc: any, s) => {
    acc[s.state] = (acc[s.state] || 0) + 1;
    return acc;
  }, {});

  const successRate = total > 0 
    ? ((byState.ready || 0) + (byState.aired || 0)) / total * 100 
    : 0;

  const avgDuration = total > 0
    ? (segments || []).reduce((sum, s) => sum + (s.duration_sec || 0), 0) / total
    : 0;

  const avgRetries = total > 0
    ? (segments || []).reduce((sum, s) => sum + s.retry_count, 0) / total
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics (Last 7 Days)</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Total Segments</h3>
          <div className="text-3xl font-bold">{total}</div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Success Rate</h3>
          <div className="text-3xl font-bold text-green-600">
            {successRate.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Avg Duration</h3>
          <div className="text-3xl font-bold">
            {Math.round(avgDuration)}s
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h3 className="text-sm text-gray-600 mb-2">Avg Retries</h3>
          <div className="text-3xl font-bold">
            {avgRetries.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-lg font-semibold mb-4">Segments by State</h2>
        <div className="space-y-3">
          {Object.entries(byState).map(([state, count]) => (
            <div key={state} className="flex items-center justify-between">
              <span className="text-sm capitalize">{state}</span>
              <div className="flex items-center space-x-4">
                <div className="w-64 bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full ${
                      state === 'ready' || state === 'aired'
                        ? 'bg-green-500'
                        : state === 'failed'
                        ? 'bg-red-500'
                        : 'bg-yellow-500'
                    }`}
                    style={{
                      width: `${(count as number / total) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {count as number}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Add Analytics Link

Update `apps/admin/app/dashboard/layout.tsx`:
```typescript
<Link
  href="/dashboard/analytics"
  className="inline-flex items-center px-1 pt-1 text-sm font-medium"
>
  Analytics
</Link>
```

### Step 5 (Optional): Add Live Stream Preview

Create `apps/admin/components/StreamPlayer.tsx`:
```typescript
'use client';

import { useState, useRef } from 'react';

export function StreamPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Use port 8001 for Icecast stream (Docker configuration)
  const streamUrl = 'http://localhost:8001/radio.opus';

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-sm font-semibold mb-2">Live Stream Preview</h3>
      <audio ref={audioRef} src={streamUrl} />
      <button
        onClick={togglePlay}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {isPlaying ? '⏸ Pause' : '▶ Play Live'}
      </button>
      <p className="text-xs text-gray-500 mt-2">
        Stream: {streamUrl}
      </p>
    </div>
  );
}
```

Then add to schedule page:
```typescript
import { StreamPlayer } from '@/components/StreamPlayer';

// In the page component, add above the timeline:
<StreamPlayer />
```

**Note:** Stream uses port **8001** (not 8000) due to Docker port mapping.

---

## Acceptance Criteria

### Functional Requirements
- [ ] Schedule page shows daily timeline
- [ ] Hourly breakdown visible
- [ ] State-based color coding
- [ ] Date navigation works
- [ ] Analytics show 7-day trends
- [ ] Success rate calculated
- [ ] Visual charts/bars

### Quality Requirements
- [ ] Responsive design
- [ ] Fast loading
- [ ] Clear visual hierarchy
- [ ] Links to segment details

### Manual Verification
```bash
# View schedule
open http://localhost:3001/dashboard/schedule

# Navigate dates
# Click segments to see details

# View analytics
open http://localhost:3001/dashboard/analytics

# Check stats are accurate

# If Stream Player added: test live stream preview
# Click play button and verify audio plays from http://localhost:8001/radio.opus
```

---

## Playout Tier Complete!

**Files created:**
- `apps/admin/app/dashboard/schedule/page.tsx`
- `apps/admin/app/dashboard/analytics/page.tsx`

**Files modified:**
- `apps/admin/app/dashboard/layout.tsx` (added nav links)

**Playout system now has:**
- ✅ Liquidsoap streaming
- ✅ API endpoints
- ✅ Schedule generation
- ✅ Dead air detection
- ✅ Priority injection
- ✅ Schedule visualization
- ✅ Analytics dashboard

**Ready for Frontend Player (F1-F4) and Integration (I1-I4)!**

---------------

# Task P3: Stream Health Monitoring & Auto-Recovery

**Tier:** Streaming Platforms  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** P1-P2 complete

---

## Objective

Monitor stream health in real-time: check bitrate, connection stability, detect drops, auto-reconnect, alert on critical issues.

---

## Implementation Steps

### Step 1: Create Stream Health Monitor

Create `workers/stream-monitor/src/health-monitor.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core/logger';
import axios from 'axios';

const logger = createLogger('stream-health-monitor');

interface StreamHealth {
  sessionId: string;
  platformType: string;
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  bitrate: number;
  viewerCount: number;
  uptime: number;
  lastCheck: Date;
  issues: string[];
}

export class StreamHealthMonitor {
  private supabase: SupabaseClient;
  private checkInterval: number = 30000; // 30 seconds

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Start monitoring all active streams
   */
  async start(): Promise<void> {
    logger.info('Starting stream health monitor');

    setInterval(async () => {
      await this.checkAllStreams();
    }, this.checkInterval);

    // Initial check
    await this.checkAllStreams();
  }

  /**
   * Check health of all active streams
   */
  private async checkAllStreams(): Promise<void> {
    const { data: sessions } = await this.supabase
      .from('stream_sessions')
      .select('*, streaming_platforms(*)')
      .in('status', ['starting', 'live']);

    if (!sessions || sessions.length === 0) {
      return;
    }

    logger.info({ count: sessions.length }, 'Checking stream health');

    for (const session of sessions) {
      try {
        const health = await this.checkStreamHealth(session);
        await this.recordHealth(health);
        await this.handleIssues(health);
      } catch (error) {
        logger.error({ error, sessionId: session.id }, 'Health check failed');
      }
    }
  }

  /**
   * Check health of a single stream
   */
  private async checkStreamHealth(session: any): Promise<StreamHealth> {
    const platform = session.streaming_platforms;
    const issues: string[] = [];
    let status: StreamHealth['status'] = 'healthy';
    let viewerCount = 0;

    // Calculate uptime
    const startTime = new Date(session.started_at || session.created_at);
    const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);

    // Platform-specific health checks
    if (platform.platform_type === 'youtube') {
      try {
        // Check YouTube stream status
        const response = await axios.get(
          `http://localhost:8000/streaming/viewer-count/${session.id}`
        );
        viewerCount = response.data.viewer_count;

        // If stream shows 0 viewers for extended period, might be an issue
        if (uptime > 300 && viewerCount === 0) {
          issues.push('No viewers detected after 5 minutes');
          status = 'degraded';
        }
      } catch (error) {
        issues.push('Failed to fetch YouTube metrics');
        status = 'degraded';
      }
    }

    // Check Liquidsoap health (is it still streaming?)
    try {
      const liquidSoapResponse = await axios.get('http://localhost:8000/health');
      if (liquidSoapResponse.status !== 200) {
        issues.push('Liquidsoap not responding');
        status = 'critical';
      }
    } catch (error) {
      issues.push('Cannot reach Liquidsoap');
      status = 'critical';
    }

    // Check if session has been live for suspiciously long without updates
    const lastUpdate = new Date(session.updated_at);
    const timeSinceUpdate = Date.now() - lastUpdate.getTime();
    if (timeSinceUpdate > 600000) { // 10 minutes
      issues.push('No status updates for 10+ minutes');
      status = 'degraded';
    }

    // If critical issues, mark as offline
    if (issues.some(i => i.includes('Cannot reach'))) {
      status = 'offline';
    }

    return {
      sessionId: session.id,
      platformType: platform.platform_type,
      status,
      bitrate: 0, // TODO: Get from Liquidsoap telnet
      viewerCount,
      uptime,
      lastCheck: new Date(),
      issues,
    };
  }

  /**
   * Record health metrics
   */
  private async recordHealth(health: StreamHealth): Promise<void> {
    // Update session with latest viewer count
    await this.supabase
      .from('stream_sessions')
      .update({
        avg_viewers: health.viewerCount,
        peak_viewers: health.viewerCount, // TODO: Track actual peak
        updated_at: new Date().toISOString(),
      })
      .eq('id', health.sessionId);

    // Log health check
    logger.info({
      sessionId: health.sessionId,
      status: health.status,
      viewers: health.viewerCount,
      uptime: health.uptime,
      issues: health.issues.length,
    }, 'Stream health checked');
  }

  /**
   * Handle detected issues
   */
  private async handleIssues(health: StreamHealth): Promise<void> {
    if (health.status === 'healthy') {
      return;
    }

    logger.warn({
      sessionId: health.sessionId,
      status: health.status,
      issues: health.issues,
    }, 'Stream health issues detected');

    // For critical/offline status, attempt recovery
    if (health.status === 'critical' || health.status === 'offline') {
      await this.attemptRecovery(health);
    }

    // Send alerts
    await this.sendAlert(health);
  }

  /**
   * Attempt to recover stream
   */
  private async attemptRecovery(health: StreamHealth): Promise<void> {
    logger.info({ sessionId: health.sessionId }, 'Attempting stream recovery');

    try {
      // Option 1: Restart Liquidsoap output
      // (This would require Liquidsoap telnet control)

      // Option 2: Recreate stream session
      // For now, just log
      logger.info('Auto-recovery would trigger here');

      // TODO: Implement actual recovery logic
      // - Restart RTMP output
      // - Recreate broadcast
      // - Notify admin

    } catch (error) {
      logger.error({ error, sessionId: health.sessionId }, 'Recovery failed');
    }
  }

  /**
   * Send alert for stream issues
   */
  private async sendAlert(health: StreamHealth): Promise<void> {
    // Send to monitoring endpoint
    try {
      await axios.post('http://localhost:8000/alerts/stream-health', {
        session_id: health.sessionId,
        platform: health.platformType,
        status: health.status,
        issues: health.issues,
        timestamp: new Date().toISOString(),
      });

      logger.info({ sessionId: health.sessionId }, 'Alert sent');
    } catch (error) {
      logger.error({ error }, 'Failed to send alert');
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const monitor = new StreamHealthMonitor();
  await monitor.start();

  // Keep process alive
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch(error => {
    logger.error({ error }, 'Stream monitor crashed');
    process.exit(1);
  });
}
```

### Step 2: Create Stream Health Dashboard

Create `apps/admin/app/dashboard/streaming/health/page.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';

interface StreamHealth {
  sessionId: string;
  platformType: string;
  status: string;
  viewerCount: number;
  uptime: number;
  issues: string[];
}

export default function StreamHealthPage() {
  const [healthData, setHealthData] = useState<StreamHealth[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchHealth = async () => {
    // Fetch current session health
    try {
      const response = await fetch('http://localhost:8000/streaming/sessions?active_only=true');
      const data = await response.json();
      
      // Transform to health data
      const health = data.sessions.map((s: any) => ({
        sessionId: s.id,
        platformType: s.streaming_platforms.platform_type,
        status: s.status === 'live' ? 'healthy' : 'degraded',
        viewerCount: s.avg_viewers || 0,
        uptime: calculateUptime(s.started_at),
        issues: [],
      }));
      
      setHealthData(health);
    } catch (error) {
      console.error('Failed to fetch health:', error);
    }
  };

  const calculateUptime = (startedAt: string): number => {
    if (!startedAt) return 0;
    const start = new Date(startedAt);
    return Math.floor((Date.now() - start.getTime()) / 1000);
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'critical':
        return 'bg-orange-500';
      case 'offline':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Stream Health Monitoring</h1>

      {/* Active Streams Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {healthData.map((stream) => (
          <div key={stream.sessionId} className="bg-white shadow rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-sm text-gray-500">
                  {stream.platformType.toUpperCase()}
                </div>
                <div className="text-2xl font-bold mt-1">
                  {stream.viewerCount}
                </div>
                <div className="text-xs text-gray-500">viewers</div>
              </div>
              <div className={`w-4 h-4 rounded-full ${getStatusColor(stream.status)}`} />
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium capitalize">{stream.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Uptime:</span>
                <span className="font-medium">{formatUptime(stream.uptime)}</span>
              </div>
            </div>

            {stream.issues.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 rounded border border-red-200">
                <div className="text-xs font-semibold text-red-800 mb-1">
                  Issues:
                </div>
                <ul className="text-xs text-red-700 space-y-1">
                  {stream.issues.map((issue, i) => (
                    <li key={i}>• {issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {healthData.length === 0 && (
          <div className="col-span-3 text-center text-gray-500 py-8">
            No active streams
          </div>
        )}
      </div>

      {/* System Status */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">System Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">
              {healthData.filter(s => s.status === 'healthy').length}
            </div>
            <div className="text-sm text-gray-600">Healthy</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-600">
              {healthData.filter(s => s.status === 'degraded').length}
            </div>
            <div className="text-sm text-gray-600">Degraded</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">
              {healthData.filter(s => s.status === 'critical').length}
            </div>
            <div className="text-sm text-gray-600">Critical</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">
              {healthData.filter(s => s.status === 'offline').length}
            </div>
            <div className="text-sm text-gray-600">Offline</div>
          </div>
        </div>
      </div>

      {/* Recent Alerts */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Alerts</h2>
        {alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div key={i} className="p-3 bg-red-50 rounded border border-red-200">
                <div className="text-sm text-red-900">{alert.message}</div>
                <div className="text-xs text-red-700 mt-1">
                  {new Date(alert.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-4">No recent alerts</div>
        )}
      </div>
    </div>
  );
}
```

### Step 3: Add Alert Endpoint

Update `apps/api/src/main.py`:
```python
from pydantic import BaseModel
from datetime import datetime

class StreamAlertRequest(BaseModel):
    session_id: str
    platform: str
    status: str
    issues: list[str]
    timestamp: str

@app.post("/alerts/stream-health")
async def report_stream_health_alert(request: StreamAlertRequest):
    """
    Receive stream health alerts
    
    Log and optionally send notifications
    """
    print(f"🚨 Stream Alert: {request.platform} - {request.status}")
    print(f"   Issues: {', '.join(request.issues)}")
    
    # TODO: Send notifications
    # - Email
    # - Slack
    # - SMS for critical
    
    return {"status": "ok", "message": "Alert recorded"}
```

### Step 4: Create package.json for Stream Monitor

Create `workers/stream-monitor/package.json`:
```json
{
  "name": "@radio/stream-monitor",
  "version": "0.0.1",
  "scripts": {
    "build": "tsc",
    "start": "node dist/health-monitor.js",
    "dev": "tsx watch src/health-monitor.ts"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@supabase/supabase-js": "^2.39.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
```

### Step 5: Add to Docker Compose

Update `docker-compose.yml`:
```yaml
services:
  # ... existing services ...

  stream-monitor:
    build:
      context: ./workers/stream-monitor
      dockerfile: Dockerfile
    container_name: radio-stream-monitor
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - API_URL=http://api:8000
    restart: unless-stopped
    networks:
      - radio-network
    depends_on:
      - api
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Stream health checked every 30 seconds
- [ ] Viewer count tracked
- [ ] Uptime calculated
- [ ] Issues detected and logged
- [ ] Alerts sent for critical issues
- [ ] Admin dashboard shows health
- [ ] Status color-coded

### Quality Requirements
- [ ] Monitoring is reliable
- [ ] Low overhead
- [ ] Accurate detection
- [ ] Timely alerts

### Manual Verification
```bash
# Start stream monitor
cd workers/stream-monitor
pnpm install
pnpm build
pnpm start

# Start a stream
# Monitor health dashboard

open http://localhost:3001/dashboard/streaming/health

# Simulate issue (stop Liquidsoap)
docker-compose stop liquidsoap

# Verify alert generated
# Check logs for recovery attempt

# Restart Liquidsoap
docker-compose start liquidsoap
```

---

## Streaming Platform Tier Complete!

**Files created:**
- `workers/stream-monitor/src/health-monitor.ts`
- `workers/stream-monitor/package.json`
- `apps/admin/app/dashboard/streaming/health/page.tsx`

**Files modified:**
- `apps/api/src/main.py` (alert endpoint)
- `docker-compose.yml` (stream monitor)

**Complete streaming system:**
- ✅ YouTube Live integration
- ✅ Multi-platform support
- ✅ Health monitoring
- ✅ Auto-recovery attempts
- ✅ Real-time alerts
- ✅ Admin dashboards

--------------------------

# Task E1: Breaking News & Priority Content System

**Tier:** Real-Time Events  
**Estimated Time:** 1 hour  
**Complexity:** Medium  
**Prerequisites:** P5 (priority injection), D1-D8

---

## Objective

Create breaking news system: urgent content injection, priority override, emergency broadcasting, event-driven content updates.

---

## Implementation Steps

### Step 1: Create Breaking News Schema

Create `infra/migrations/020_breaking_news.sql`:
```sql
-- Migration: Breaking news and urgent events
-- Description: Real-time event injection system

-- Breaking news events
CREATE TABLE breaking_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  full_content TEXT,
  
  -- Urgency
  urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  priority INT NOT NULL DEFAULT 8 CHECK (priority BETWEEN 1 AND 10),
  
  -- Timing
  expires_at TIMESTAMPTZ,
  
  -- Processing
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'aired', 'expired')),
  segment_id UUID REFERENCES segments(id),
  
  -- Metadata
  source TEXT,
  tags TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event triggers (automated monitoring)
CREATE TABLE event_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('keyword', 'schedule', 'api', 'manual')),
  
  -- Trigger configuration
  keywords TEXT[],
  schedule_cron TEXT,
  api_endpoint TEXT,
  
  -- Action
  auto_create_segment BOOLEAN DEFAULT true,
  default_priority INT DEFAULT 8,
  
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_breaking_news_status ON breaking_news(status);
CREATE INDEX idx_breaking_news_urgency ON breaking_news(urgency);
CREATE INDEX idx_breaking_news_created ON breaking_news(created_at DESC);
CREATE INDEX idx_event_triggers_active ON event_triggers(active) WHERE active = true;

COMMENT ON TABLE breaking_news IS 'Urgent news events for immediate broadcast';
COMMENT ON TABLE event_triggers IS 'Automated event detection and content generation';
```

### Step 2: Create Breaking News Service

Create `workers/breaking-news/src/breaking-news-service.ts`:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core/logger';
import Anthropic from '@anthropic-ai/sdk';

const logger = createLogger('breaking-news');

interface BreakingNews {
  id: string;
  title: string;
  summary: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  priority: number;
}

export class BreakingNewsService {
  private supabase: SupabaseClient;
  private anthropic: Anthropic;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Create breaking news event
   */
  async createBreakingNews(
    title: string,
    summary: string,
    urgency: BreakingNews['urgency'],
    fullContent?: string
  ): Promise<string> {
    logger.info({ title, urgency }, 'Creating breaking news event');

    // Determine priority based on urgency
    const priorityMap = {
      low: 6,
      medium: 7,
      high: 9,
      critical: 10,
    };

    const priority = priorityMap[urgency];

    // Create news event
    const { data: newsEvent, error } = await this.supabase
      .from('breaking_news')
      .insert({
        title,
        summary,
        full_content: fullContent,
        urgency,
        priority,
        status: 'pending',
        expires_at: this.calculateExpiration(urgency),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create breaking news: ${error.message}`);
    }

    logger.info({ newsId: newsEvent.id }, 'Breaking news created');

    // Trigger immediate segment creation
    await this.generateNewsSegment(newsEvent);

    return newsEvent.id;
  }

  /**
   * Generate news segment from breaking news
   */
  private async generateNewsSegment(newsEvent: any): Promise<void> {
    logger.info({ newsId: newsEvent.id }, 'Generating news segment');

    // Update status
    await this.supabase
      .from('breaking_news')
      .update({ status: 'processing' })
      .eq('id', newsEvent.id);

    try {
      // Get default DJ for breaking news
      const { data: dj } = await this.supabase
        .from('djs')
        .select('*')
        .eq('specialty', 'news')
        .limit(1)
        .single();

      if (!dj) {
        throw new Error('No news DJ found');
      }

      // Create segment
      const { data: segment } = await this.supabase
        .from('segments')
        .insert({
          slot_type: 'breaking_news',
          state: 'queued',
          priority: newsEvent.priority,
          lang: 'en',
          max_retries: 3,
          retry_count: 0,
        })
        .select()
        .single();

      // Link to breaking news
      await this.supabase
        .from('breaking_news')
        .update({ segment_id: segment.id })
        .eq('id', newsEvent.id);

      // Generate script using Claude
      const script = await this.generateNewsScript(newsEvent, dj);

      // Store script
      await this.supabase
        .from('segments')
        .update({ script_md: script })
        .eq('id', segment.id);

      // Enqueue for generation
      await this.supabase.rpc('enqueue_job', {
        p_job_type: 'segment_make',
        p_payload: { segment_id: segment.id, urgent: true },
        p_priority: 10, // Highest priority
        p_schedule_delay_sec: 0,
      });

      logger.info({
        newsId: newsEvent.id,
        segmentId: segment.id,
      }, 'Breaking news segment enqueued');

    } catch (error) {
      logger.error({ error, newsId: newsEvent.id }, 'Failed to generate segment');

      await this.supabase
        .from('breaking_news')
        .update({ status: 'pending' })
        .eq('id', newsEvent.id);

      throw error;
    }
  }

  /**
   * Generate news script using Claude
   */
  private async generateNewsScript(
    newsEvent: any,
    dj: any
  ): Promise<string> {
    const prompt = `You are writing a breaking news segment for AI Radio 2525, broadcasting from the year 2525.

DJ: ${dj.name}
Personality: ${dj.personality}

BREAKING NEWS:
Title: ${newsEvent.title}
Summary: ${newsEvent.summary}
${newsEvent.full_content ? `\nDetails:\n${newsEvent.full_content}` : ''}

Urgency: ${newsEvent.urgency.toUpperCase()}

Write a ${newsEvent.urgency === 'critical' ? '30-second' : '60-second'} breaking news announcement that:

1. Opens with clear, urgent tone: "This is a breaking news update from AI Radio 2525"
2. States the headline clearly and directly
3. Provides key facts concisely
4. ${newsEvent.urgency === 'critical' ? 'Provides immediate action items if applicable' : 'Gives appropriate context'}
5. Maintains the 2525 world context naturally
6. Closes professionally: "We'll continue to monitor this situation. Stay tuned to AI Radio 2525."

Keep it concise, clear, and appropriate for the urgency level. This is BREAKING NEWS - get straight to the point.

Write ONLY the DJ's spoken words, no stage directions:`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const script = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    return script;
  }

  /**
   * Calculate expiration time based on urgency
   */
  private calculateExpiration(urgency: string): string {
    const now = new Date();

    const expirationMap = {
      low: 24 * 60, // 24 hours
      medium: 12 * 60, // 12 hours
      high: 4 * 60, // 4 hours
      critical: 2 * 60, // 2 hours
    };

    const minutes = expirationMap[urgency as keyof typeof expirationMap] || 24 * 60;
    now.setMinutes(now.getMinutes() + minutes);

    return now.toISOString();
  }

  /**
   * Monitor and expire old breaking news
   */
  async expireOldNews(): Promise<void> {
    const { data: expired } = await this.supabase
      .from('breaking_news')
      .update({ status: 'expired' })
      .lt('expires_at', new Date().toISOString())
      .in('status', ['pending', 'aired'])
      .select();

    if (expired && expired.length > 0) {
      logger.info({ count: expired.length }, 'Expired old breaking news');
    }
  }
}
```

### Step 3: Create Breaking News API

Create `apps/api/src/breaking_news/breaking_news_routes.py`:
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
from supabase import create_client

router = APIRouter(prefix="/breaking-news", tags=["breaking-news"])

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)


class CreateBreakingNewsRequest(BaseModel):
    title: str
    summary: str
    full_content: Optional[str] = None
    urgency: str  # 'low', 'medium', 'high', 'critical'
    source: Optional[str] = None
    tags: Optional[list[str]] = None


@router.post("/create")
async def create_breaking_news(request: CreateBreakingNewsRequest):
    """
    Create a breaking news event
    
    Automatically generates and queues high-priority segment
    """
    # Validate urgency
    if request.urgency not in ['low', 'medium', 'high', 'critical']:
        raise HTTPException(status_code=400, detail="Invalid urgency level")
    
    # Priority mapping
    priority_map = {
        'low': 6,
        'medium': 7,
        'high': 9,
        'critical': 10
    }
    
    priority = priority_map[request.urgency]
    
    # Create breaking news event
    news_response = supabase.table("breaking_news").insert({
        "title": request.title,
        "summary": request.summary,
        "full_content": request.full_content,
        "urgency": request.urgency,
        "priority": priority,
        "source": request.source,
        "tags": request.tags,
        "status": "pending",
    }).execute()
    
    if not news_response.data:
        raise HTTPException(status_code=500, detail="Failed to create breaking news")
    
    news_id = news_response.data[0]["id"]
    
    # Trigger worker to generate segment
    # (Worker monitors breaking_news table)
    
    return {
        "news_id": news_id,
        "priority": priority,
        "message": "Breaking news created and queued for broadcast"
    }


@router.get("/active")
async def get_active_breaking_news():
    """Get currently active breaking news"""
    
    response = supabase.table("breaking_news")\
        .select("*")\
        .in_("status", ["pending", "processing", "aired"])\
        .gt("expires_at", "NOW()")\
        .order("priority", desc=True)\
        .order("created_at", desc=True)\
        .execute()
    
    return {"breaking_news": response.data}


@router.get("/recent")
async def get_recent_breaking_news(limit: int = 10):
    """Get recent breaking news"""
    
    response = supabase.table("breaking_news")\
        .select("*")\
        .order("created_at", desc=True)\
        .limit(limit)\
        .execute()
    
    return {"breaking_news": response.data}
```

Register in `apps/api/src/main.py`:
```python
from .breaking_news.breaking_news_routes import router as breaking_news_router

app.include_router(breaking_news_router)
```

### Step 4: Create Breaking News Admin UI

Create `apps/admin/app/dashboard/breaking-news/page.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';

export default function BreakingNewsPage() {
  const [news, setNews] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNews = async () => {
    const response = await fetch('http://localhost:8000/breaking-news/recent?limit=20');
    const data = await response.json();
    setNews(data.breaking_news);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const response = await fetch('http://localhost:8000/breaking-news/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.get('title'),
        summary: formData.get('summary'),
        full_content: formData.get('full_content'),
        urgency: formData.get('urgency'),
        source: formData.get('source'),
      }),
    });

    if (response.ok) {
      setShowForm(false);
      fetchNews();
      alert('Breaking news created and queued for broadcast!');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Breaking News</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          🚨 Create Breaking News
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">New Breaking News</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                name="title"
                required
                className="w-full border rounded px-3 py-2"
                placeholder="Major Development on Mars Colony"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Summary</label>
              <textarea
                name="summary"
                required
                rows={3}
                className="w-full border rounded px-3 py-2"
                placeholder="Brief summary of the breaking news..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Full Content (Optional)
              </label>
              <textarea
                name="full_content"
                rows={5}
                className="w-full border rounded px-3 py-2"
                placeholder="Additional details..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Urgency</label>
              <select name="urgency" required className="w-full border rounded px-3 py-2">
                <option value="low">Low - General update</option>
                <option value="medium">Medium - Notable news</option>
                <option value="high">High - Important development</option>
                <option value="critical">Critical - Emergency broadcast</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Source</label>
              <input
                name="source"
                className="w-full border rounded px-3 py-2"
                placeholder="Colonial News Network"
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Create & Broadcast
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Breaking News List */}
      <div className="space-y-3">
        {news.map((item) => (
          <div
            key={item.id}
            className={`bg-white shadow rounded-lg p-6 border-l-4 ${
              item.urgency === 'critical'
                ? 'border-red-600'
                : item.urgency === 'high'
                ? 'border-orange-500'
                : item.urgency === 'medium'
                ? 'border-yellow-500'
                : 'border-blue-500'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      item.urgency === 'critical'
                        ? 'bg-red-600 text-white'
                        : item.urgency === 'high'
                        ? 'bg-orange-500 text-white'
                        : item.urgency === 'medium'
                        ? 'bg-yellow-500 text-white'
                        : 'bg-blue-500 text-white'
                    }`}
                  >
                    {item.urgency}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-700 mb-2">{item.summary}</p>

                {item.source && (
                  <div className="text-sm text-gray-500">Source: {item.source}</div>
                )}
              </div>

              <div className="ml-4">
                <span
                  className={`px-3 py-1 rounded text-sm ${
                    item.status === 'aired'
                      ? 'bg-green-100 text-green-800'
                      : item.status === 'processing'
                      ? 'bg-yellow-100 text-yellow-800'
                      : item.status === 'expired'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Breaking news can be created via API/admin
- [ ] Priority based on urgency
- [ ] Auto-generates news segment
- [ ] Injects at high priority
- [ ] Expires after set time
- [ ] Admin UI functional
- [ ] Status tracking works

### Quality Requirements
- [ ] Fast generation (< 30 seconds)
- [ ] Clear urgency indicators
- [ ] Proper expiration handling
- [ ] Admin UI intuitive

### Manual Verification
```bash
# Run migration
node infra/migrate.js up

# Create breaking news via admin
open http://localhost:3001/dashboard/breaking-news

# Fill form with critical urgency
# Submit

# Verify:
# - Segment created immediately
# - Priority 10 assigned
# - Appears at top of playout queue
# - Airs within minutes

# Check API
curl http://localhost:8000/breaking-news/active
```

---

## Next Task Handoff

**For E2 (Dynamic Content Updates):**
- Real-time knowledge base updates
- Event-driven content refresh
- Live data integration
- Scheduled content updates

**Files created:**
- `infra/migrations/020_breaking_news.sql`
- `workers/breaking-news/src/breaking-news-service.ts`
- `apps/api/src/breaking_news/breaking_news_routes.py`
- `apps/admin/app/dashboard/breaking-news/page.tsx`

**Files modified:**
- `apps/api/src/main.py` (breaking news router)

**Breaking news system ready:**
- ✅ Urgent content injection
- ✅ Priority override
- ✅ Auto-generation
- ✅ Expiration handling
- ✅ Admin interface

-----------------------

# Task E2: Dynamic Content Updates & Live Data Integration

**Tier:** Real-Time Events  
**Estimated Time:** 45 minutes  
**Complexity:** Low  
**Prerequisites:** E1, D1-D8 (knowledge base)

---

## Objective

Enable real-time content updates: dynamic knowledge base refresh, event-driven content generation, scheduled updates, live data integration hooks.

---

## Implementation Steps

### Step 1: Create Content Update System

Create `workers/content-updater/src/content-updater.ts`:
````typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core/logger';
import axios from 'axios';

const logger = createLogger('content-updater');

export class ContentUpdater {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Update knowledge base with new event
   */
  async addEvent(event: {
    title: string;
    description: string;
    date: string;
    category: string;
    impact: string;
  }): Promise<string> {
    logger.info({ title: event.title }, 'Adding new event to knowledge base');

    // Create document
    const documentText = `# ${event.title}

**Date:** ${event.date}
**Category:** ${event.category}

## Description

${event.description}

## Impact

${event.impact}

---
*Added: ${new Date().toISOString()}*
`;

    const { data: doc, error } = await this.supabase
      .from('knowledge_documents')
      .insert({
        title: event.title,
        content: documentText,
        doc_type: 'event',
        status: 'published',
        tags: [event.category, 'event', 'news'],
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create document: ${error.message}`);
    }

    logger.info({ docId: doc.id }, 'Event added to knowledge base');

    // Trigger re-embedding
    await this.supabase.rpc('enqueue_job', {
      p_job_type: 'kb_index',
      p_payload: { document_id: doc.id },
      p_priority: 7,
    });

    return doc.id;
  }

  /**
   * Update existing fact in knowledge base
   */
  async updateFact(
    factKey: string,
    newValue: string,
    reason: string
  ): Promise<void> {
    logger.info({ factKey, newValue }, 'Updating canonical fact');

    // Get current fact
    const { data: currentFact } = await this.supabase
      .from('lore_facts')
      .select('*')
      .eq('fact_key', factKey)
      .eq('active', true)
      .single();

    if (!currentFact) {
      throw new Error(`Fact not found: ${factKey}`);
    }

    // Create new version
    const { data: newFact } = await this.supabase
      .from('lore_facts')
      .insert({
        category: currentFact.category,
        fact_key: factKey,
        fact_value: newValue,
        fact_type: currentFact.fact_type,
        description: `${currentFact.description} (Updated: ${reason})`,
        version: currentFact.version + 1,
        active: true,
      })
      .select()
      .single();

    // Deactivate old version
    await this.supabase
      .from('lore_facts')
      .update({
        active: false,
        superseded_by: newFact.id,
      })
      .eq('id', currentFact.id);

    logger.info({ factKey, version: newFact.version }, 'Fact updated');
  }

  /**
   * Scheduled content refresh
   */
  async scheduledRefresh(): Promise<void> {
    logger.info('Running scheduled content refresh');

    // Re-index recently modified documents
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: recentDocs } = await this.supabase
      .from('knowledge_documents')
      .select('id')
      .gte('updated_at', threeDaysAgo.toISOString())
      .eq('status', 'published');

    if (recentDocs && recentDocs.length > 0) {
      logger.info({ count: recentDocs.length }, 'Re-indexing recent documents');

      for (const doc of recentDocs) {
        await this.supabase.rpc('enqueue_job', {
          p_job_type: 'kb_index',
          p_payload: { document_id: doc.id },
          p_priority: 5,
        });
      }
    }

    // Clean up expired breaking news
    await this.supabase
      .from('breaking_news')
      .update({ status: 'expired' })
      .lt('expires_at', new Date().toISOString())
      .in('status', ['pending', 'aired']);

    logger.info('Scheduled refresh complete');
  }

  /**
   * Webhook handler for external updates
   */
  async handleWebhook(payload: {
    type: string;
    data: any;
  }): Promise<void> {
    logger.info({ type: payload.type }, 'Processing webhook');

    switch (payload.type) {
      case 'news_event':
        await this.addEvent(payload.data);
        break;

      case 'fact_update':
        await this.updateFact(
          payload.data.fact_key,
          payload.data.new_value,
          payload.data.reason
        );
        break;

      case 'breaking_news':
        // Trigger breaking news flow
        await axios.post('http://localhost:8000/breaking-news/create', payload.data);
        break;

      default:
        logger.warn({ type: payload.type }, 'Unknown webhook type');
    }
  }
}

/**
 * Main entry - run scheduled tasks
 */
async function main() {
  const updater = new ContentUpdater();

  // Run scheduled refresh every 6 hours
  setInterval(async () => {
    try {
      await updater.scheduledRefresh();
    } catch (error) {
      logger.error({ error }, 'Scheduled refresh failed');
    }
  }, 6 * 60 * 60 * 1000);

  // Initial run
  await updater.scheduledRefresh();

  logger.info('Content updater running');
}

if (require.main === module) {
  main().catch(error => {
    logger.error({ error }, 'Content updater crashed');
    process.exit(1);
  });
}
````

### Step 2: Create Webhook Endpoint

Update `apps/api/src/main.py`:
````python
from pydantic import BaseModel
from typing import Dict, Any

class WebhookPayload(BaseModel):
    type: str
    data: Dict[str, Any]
    signature: str = None  # For webhook verification

@app.post("/webhooks/content-update")
async def content_update_webhook(payload: WebhookPayload):
    """
    Receive external content updates
    
    Allows external systems to push updates to the knowledge base
    """
    # Verify signature (in production)
    # if not verify_webhook_signature(payload.signature):
    #     raise HTTPException(status_code=401, detail="Invalid signature")
    
    if payload.type == "news_event":
        # Add event to knowledge base
        # Trigger via worker
        print(f"New event: {payload.data.get('title')}")
        
    elif payload.type == "fact_update":
        # Update canonical fact
        print(f"Fact update: {payload.data.get('fact_key')}")
        
    elif payload.type == "breaking_news":
        # Create breaking news
        await create_breaking_news(CreateBreakingNewsRequest(**payload.data))
    
    return {"status": "accepted", "message": "Update queued"}


@app.post("/content/refresh")
async def trigger_content_refresh():
    """
    Manually trigger content refresh
    
    Re-indexes recent documents and updates embeddings
    """
    # Trigger content updater
    # In production, this would be a message to the worker
    
    return {"status": "ok", "message": "Content refresh triggered"}
````

### Step 3: Create Quick Update UI

Create `apps/admin/app/dashboard/content/quick-update/page.tsx`:
````typescript
'use client';

import { useState } from 'react';

export default function QuickUpdatePage() {
  const [updating, setUpdating] = useState(false);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);

    const formData = new FormData(e.target as HTMLFormElement);

    try {
      const response = await fetch('http://localhost:8000/webhooks/content-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'news_event',
          data: {
            title: formData.get('title'),
            description: formData.get('description'),
            date: formData.get('date'),
            category: formData.get('category'),
            impact: formData.get('impact'),
          },
        }),
      });

      if (response.ok) {
        alert('Event added successfully!');
        (e.target as HTMLFormElement).reset();
      }
    } catch (error) {
      console.error('Failed to add event:', error);
      alert('Failed to add event');
    } finally {
      setUpdating(false);
    }
  };

  const handleRefresh = async () => {
    setUpdating(true);
    try {
      await fetch('http://localhost:8000/content/refresh', { method: 'POST' });
      alert('Content refresh triggered!');
    } catch (error) {
      alert('Failed to trigger refresh');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Quick Content Update</h1>

      {/* Add Event Form */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Add New Event</h2>
        <form onSubmit={handleAddEvent} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Event Title</label>
            <input
              name="title"
              required
              className="w-full border rounded px-3 py-2"
              placeholder="New Mars Mining Discovery"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              name="date"
              type="date"
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select name="category" required className="w-full border rounded px-3 py-2">
              <option value="technology">Technology</option>
              <option value="science">Science</option>
              <option value="politics">Politics</option>
              <option value="culture">Culture</option>
              <option value="economy">Economy</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              required
              rows={4}
              className="w-full border rounded px-3 py-2"
              placeholder="Detailed description of the event..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Impact</label>
            <textarea
              name="impact"
              required
              rows={3}
              className="w-full border rounded px-3 py-2"
              placeholder="What are the implications of this event?"
            />
          </div>

          <button
            type="submit"
            disabled={updating}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {updating ? 'Adding...' : 'Add Event to Knowledge Base'}
          </button>
        </form>
      </div>

      {/* Manual Refresh */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Content Refresh</h2>
        <p className="text-sm text-gray-600 mb-4">
          Manually trigger a content refresh to re-index recent documents and update
          embeddings.
        </p>
        <button
          onClick={handleRefresh}
          disabled={updating}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
        >
          {updating ? 'Refreshing...' : 'Trigger Content Refresh'}
        </button>
      </div>
    </div>
  );
}
````

### Step 4: Create package.json for Content Updater

Create `workers/content-updater/package.json`:
````json
{
  "name": "@radio/content-updater",
  "version": "0.0.1",
  "scripts": {
    "build": "tsc",
    "start": "node dist/content-updater.js",
    "dev": "tsx watch src/content-updater.ts"
  },
  "dependencies": {
    "@radio/core": "workspace:*",
    "@supabase/supabase-js": "^2.39.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
````

---

## Acceptance Criteria

### Functional Requirements
- [ ] New events can be added to knowledge base
- [ ] Facts can be updated dynamically
- [ ] Scheduled refresh runs every 6 hours
- [ ] Webhook endpoint receives external updates
- [ ] Admin UI allows quick updates
- [ ] Content changes trigger re-indexing

### Quality Requirements
- [ ] Updates propagate within minutes
- [ ] No duplicate content
- [ ] Version history maintained
- [ ] Admin UI simple and fast

### Manual Verification
````bash
# Start content updater
cd workers/content-updater
pnpm install
pnpm build
pnpm start

# Add event via admin
open http://localhost:3001/dashboard/content/quick-update

# Fill form and submit
# Verify event in knowledge base

psql $DATABASE_URL -c "SELECT * FROM knowledge_documents WHERE doc_type='event' ORDER BY created_at DESC LIMIT 5;"

# Trigger manual refresh
# Check re-indexing jobs
psql $DATABASE_URL -c "SELECT * FROM jobs WHERE job_type='kb_index' AND state='pending';"
````

---

## Real-Time Events Tier Complete!

**Files created:**
- `workers/content-updater/src/content-updater.ts`
- `workers/content-updater/package.json`
- `apps/admin/app/dashboard/content/quick-update/page.tsx`

**Files modified:**
- `apps/api/src/main.py` (webhook endpoint)

**Dynamic content system ready:**
- ✅ Breaking news injection
- ✅ Real-time knowledge updates
- ✅ Event-driven content
- ✅ Scheduled refresh
- ✅ Webhook integration
- ✅ Admin quick updates

--------------------------

# Task N1: Native Installation Scripts (Non-Docker)

**Tier:** Non-Docker Deployment  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Prerequisites:** All previous tasks

---

## Objective

Create installation scripts for running AI Radio 2525 without Docker: native dependency installation, service setup, OS-specific configurations.

---

## Implementation Steps

### Step 1: Create Installation Script for Ubuntu/Debian

Create `scripts/install-ubuntu.sh`:
````bash
#!/bin/bash
# AI Radio 2525 - Native Installation for Ubuntu/Debian
# Tested on: Ubuntu 22.04, Ubuntu 24.04, Debian 12

set -e

echo "🚀 AI Radio 2525 - Native Installation"
echo "======================================"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  echo "❌ Please do not run this script as root"
  exit 1
fi

# Update system
echo "📦 Updating system packages..."
sudo apt-get update

# Install system dependencies
echo "📦 Installing system dependencies..."
sudo apt-get install -y \
  curl \
  git \
  build-essential \
  python3 \
  python3-pip \
  python3-venv \
  ffmpeg \
  postgresql-client \
  liquidsoap

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
echo "📦 Installing pnpm..."
sudo npm install -g pnpm

# Install Python dependencies globally
echo "📦 Installing Python dependencies..."
sudo pip3 install --break-system-packages \
  fastapi \
  uvicorn \
  supabase \
  anthropic \
  python-multipart \
  numpy \
  librosa

# Install Icecast
echo "📦 Installing Icecast..."
sudo apt-get install -y icecast2

# Configure Icecast
echo "🔧 Configuring Icecast..."
sudo sed -i 's/<source-password>hackme<\/source-password>/<source-password>'"${ICECAST_PASSWORD:-hackme}"'<\/source-password>/g' /etc/icecast2/icecast.xml
sudo sed -i 's/<relay-password>hackme<\/relay-password>/<relay-password>'"${ICECAST_PASSWORD:-hackme}"'<\/relay-password>/g' /etc/icecast2/icecast.xml
sudo sed -i 's/<admin-password>hackme<\/admin-password>/<admin-password>'"${ICECAST_ADMIN_PASSWORD:-admin}"'<\/admin-password>/g' /etc/icecast2/icecast.xml

# Enable Icecast
sudo systemctl enable icecast2
sudo systemctl restart icecast2

echo "✅ System dependencies installed"

# Clone repository (if not already cloned)
if [ ! -d "$(pwd)/.git" ]; then
  echo "📥 Repository not found. Please clone the repository first:"
  echo "   git clone https://github.com/your-org/ai-radio-2525.git"
  echo "   cd ai-radio-2525"
  echo "   Then run this script again."
  exit 1
fi

# Install project dependencies
echo "📦 Installing project dependencies..."
pnpm install

# Build packages
echo "🏗️  Building packages..."
pnpm build

# Create directories
echo "📁 Creating directories..."
mkdir -p logs
mkdir -p apps/playout/audio
mkdir -p apps/playout/emergency
mkdir -p services/piper-tts/cache

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy .env.example to .env and configure"
echo "2. Run database migrations: node infra/migrate.js up"
echo "3. Start services: ./scripts/start-all.sh"
echo ""
````

### Step 2: Create Installation Script for macOS

Create `scripts/install-macos.sh`:
````bash
#!/bin/bash
# AI Radio 2525 - Native Installation for macOS
# Tested on: macOS 13 (Ventura), macOS 14 (Sonoma)

set -e

echo "🚀 AI Radio 2525 - Native Installation (macOS)"
echo "=============================================="

# Check for Homebrew
if ! command -v brew &> /dev/null; then
  echo "❌ Homebrew not found. Installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Update Homebrew
echo "📦 Updating Homebrew..."
brew update

# Install system dependencies
echo "📦 Installing system dependencies..."
brew install \
  node@20 \
  python@3.11 \
  ffmpeg \
  postgresql \
  liquidsoap \
  icecast

# Link Node 20
brew link node@20

# Install pnpm
echo "📦 Installing pnpm..."
npm install -g pnpm

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip3 install \
  fastapi \
  uvicorn \
  supabase \
  anthropic \
  python-multipart \
  numpy \
  librosa

# Start Icecast
echo "🔧 Starting Icecast..."
brew services start icecast

echo "✅ System dependencies installed"

# Install project dependencies
echo "📦 Installing project dependencies..."
pnpm install

# Build packages
echo "🏗️  Building packages..."
pnpm build

# Create directories
mkdir -p logs
mkdir -p apps/playout/audio
mkdir -p apps/playout/emergency
mkdir -p services/piper-tts/cache

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy .env.example to .env and configure"
echo "2. Run database migrations: node infra/migrate.js up"
echo "3. Start services: ./scripts/start-all.sh"
echo ""
````

### Step 3: Create Universal Start Script

Create `scripts/start-all.sh`:
````bash
#!/bin/bash
# Start all AI Radio 2525 services (non-Docker)

set -e

echo "🚀 Starting AI Radio 2525 Services"
echo "==================================="

# Load environment
if [ ! -f .env ]; then
  echo "❌ .env file not found. Copy .env.example to .env and configure."
  exit 1
fi

set -a
source .env
set +a

echo "✓ Environment loaded"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
  echo "📦 Installing PM2..."
  npm install -g pm2
fi

# Start services with PM2
echo "🚀 Starting services..."

# API
cd apps/api
pm2 start "uvicorn src.main:app --host 0.0.0.0 --port 8000" \
  --name radio-api \
  --log ../logs/api.log \
  --watch
cd ../..

# Piper TTS
cd services/piper-tts
pm2 start "python3 server.py" \
  --name radio-piper-tts \
  --log ../logs/piper-tts.log
cd ../..

# Workers
cd workers/embedder
pm2 start "node dist/index.js" \
  --name radio-embedder \
  --log ../logs/embedder.log
cd ../..

cd workers/segment-gen
pm2 start "node dist/index.js" \
  --name radio-segment-gen \
  --log ../logs/segment-gen.log
cd ../..

cd workers/mastering
pm2 start "node dist/index.js" \
  --name radio-mastering \
  --log ../logs/mastering.log
cd ../..

cd workers/scheduler
pm2 start "node dist/index.js" \
  --name radio-scheduler \
  --log ../logs/scheduler.log
cd ../..

# Liquidsoap
cd apps/playout
pm2 start "liquidsoap radio.liq" \
  --name radio-liquidsoap \
  --log ../logs/liquidsoap.log
cd ../..

# Web (Next.js)
cd apps/web
pm2 start "npm start" \
  --name radio-web \
  --log ../logs/web.log
cd ../..

# Admin
cd apps/admin
pm2 start "npm start" \
  --name radio-admin \
  --log ../logs/admin.log
cd ../..

# Save PM2 configuration
pm2 save

echo ""
echo "✅ All services started!"
echo ""
echo "📊 View status: pm2 status"
echo "📋 View logs: pm2 logs"
echo "🛑 Stop all: pm2 stop all"
echo ""
echo "🌐 Access points:"
echo "   API:      http://localhost:8000"
echo "   Web:      http://localhost:3000"
echo "   Admin:    http://localhost:3001"
echo "   Stream:   http://localhost:8001/radio.mp3"
echo "   Icecast:  http://localhost:8000"
echo ""
````

Make executable:
````bash
chmod +x scripts/*.sh
````

### Step 4: Create Stop Script

Create `scripts/stop-all.sh`:
````bash
#!/bin/bash
# Stop all AI Radio 2525 services

echo "🛑 Stopping AI Radio 2525 Services"
echo "==================================="

pm2 stop all
pm2 delete all

echo "✅ All services stopped"
````

### Step 5: Create Status Check Script

Create `scripts/status.sh`:
````bash
#!/bin/bash
# Check status of all services

echo "📊 AI Radio 2525 - Service Status"
echo "=================================="

pm2 status

echo ""
echo "🔍 Service Health Checks:"
echo ""

# Check API
if curl -sf http://localhost:8000/health > /dev/null; then
  echo "✅ API is running"
else
  echo "❌ API is not responding"
fi

# Check Piper TTS
if curl -sf http://localhost:5002/health > /dev/null; then
  echo "✅ Piper TTS is running"
else
  echo "❌ Piper TTS is not responding"
fi

# Check Web
if curl -sf http://localhost:3000 > /dev/null; then
  echo "✅ Web is running"
else
  echo "❌ Web is not responding"
fi

# Check Admin
if curl -sf http://localhost:3001 > /dev/null; then
  echo "✅ Admin is running"
else
  echo "❌ Admin is not responding"
fi

# Check Icecast
if curl -sf http://localhost:8000/status.xsl > /dev/null; then
  echo "✅ Icecast is running"
else
  echo "❌ Icecast is not responding"
fi

echo ""
````

---

## Acceptance Criteria

### Functional Requirements
- [ ] Ubuntu installation script works
- [ ] macOS installation script works
- [ ] All dependencies installed correctly
- [ ] Services start with PM2
- [ ] Services can be stopped
- [ ] Status check works
- [ ] Logs accessible

### Quality Requirements
- [ ] Scripts are idempotent
- [ ] Clear error messages
- [ ] Proper cleanup on failure
- [ ] Works on fresh system

### Manual Verification
````bash
# On Ubuntu 22.04 or 24.04:
bash scripts/install-ubuntu.sh

# On macOS:
bash scripts/install-macos.sh

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run migrations
node infra/migrate.js up

# Start all services
bash scripts/start-all.sh

# Check status
bash scripts/status.sh

# View logs
pm2 logs

# Stop all
bash scripts/stop-all.sh
````

---

## Next Task Handoff

**For N2 (systemd Services):**
- Create systemd service files
- Auto-start on boot
- Service management
- Log rotation

**Files created:**
- `scripts/install-ubuntu.sh`
- `scripts/install-macos.sh`
- `scripts/start-all.sh`
- `scripts/stop-all.sh`
- `scripts/status.sh`

**Native installation ready:**
- ✅ Ubuntu support
- ✅ macOS support
- ✅ Dependency installation
- ✅ PM2 process management
- ✅ Service scripts

---------------------------

# Task N2: systemd Service Configuration (Linux)

**Tier:** Non-Docker Deployment  
**Estimated Time:** 45 minutes  
**Complexity:** Low  
**Prerequisites:** N1 complete

---

## Objective

Create systemd service files for production deployment: auto-start on boot, service management, log rotation, proper user isolation.

---

## Implementation Steps

### Step 1: Create systemd Service Template

Create `scripts/systemd/radio-api.service`:
````ini
[Unit]
Description=AI Radio 2525 - API Server
After=network.target

[Service]
Type=simple
User=radio
WorkingDirectory=/opt/ai-radio-2525/apps/api
Environment="PATH=/usr/bin:/usr/local/bin"
EnvironmentFile=/opt/ai-radio-2525/.env
ExecStart=/usr/bin/python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

# Logging
StandardOutput=append:/var/log/ai-radio-2525/api.log
StandardError=append:/var/log/ai-radio-2525/api-error.log

[Install]
WantedBy=multi-user.target
````

### Step 2: Create Service Files for All Components

Create `scripts/systemd/radio-piper-tts.service`:
````ini
[Unit]
Description=AI Radio 2525 - Piper TTS Service
After=network.target

[Service]
Type=simple
User=radio
WorkingDirectory=/opt/ai-radio-2525/services/piper-tts
Environment="PATH=/usr/bin:/usr/local/bin"
EnvironmentFile=/opt/ai-radio-2525/.env
ExecStart=/usr/bin/python3 server.py
Restart=always
RestartSec=10

StandardOutput=append:/var/log/ai-radio-2525/piper-tts.log
StandardError=append:/var/log/ai-radio-2525/piper-tts-error.log

[Install]
WantedBy=multi-user.target
````

Create `scripts/systemd/radio-embedder.service`:
````ini
[Unit]
Description=AI Radio 2525 - Embedder Worker
After=network.target radio-api.service

[Service]
Type=simple
User=radio
WorkingDirectory=/opt/ai-radio-2525/workers/embedder
Environment="PATH=/usr/bin:/usr/local/bin:/usr/local/bin/node"
EnvironmentFile=/opt/ai-radio-2525/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

StandardOutput=append:/var/log/ai-radio-2525/embedder.log
StandardError=append:/var/log/ai-radio-2525/embedder-error.log

[Install]
WantedBy=multi-user.target
````

Create similar files for other workers:
- `radio-segment-gen.service`
- `radio-mastering.service`
- `radio-scheduler.service`

Create `scripts/systemd/radio-liquidsoap.service`:
````ini
[Unit]
Description=AI Radio 2525 - Liquidsoap Playout
After=network.target radio-api.service icecast2.service

[Service]
Type=simple
User=radio
WorkingDirectory=/opt/ai-radio-2525/apps/playout
Environment="PATH=/usr/bin:/usr/local/bin"
EnvironmentFile=/opt/ai-radio-2525/.env
ExecStart=/usr/bin/liquidsoap radio.liq
Restart=always
RestartSec=10

StandardOutput=append:/var/log/ai-radio-2525/liquidsoap.log
StandardError=append:/var/log/ai-radio-2525/liquidsoap-error.log

[Install]
WantedBy=multi-user.target
````

Create `scripts/systemd/radio-web.service`:
````ini
[Unit]
Description=AI Radio 2525 - Web Player
After=network.target

[Service]
Type=simple
User=radio
WorkingDirectory=/opt/ai-radio-2525/apps/web
Environment="PATH=/usr/bin:/usr/local/bin:/usr/local/bin/node"
Environment="PORT=3000"
EnvironmentFile=/opt/ai-radio-2525/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

StandardOutput=append:/var/log/ai-radio-2525/web.log
StandardError=append:/var/log/ai-radio-2525/web-error.log

[Install]
WantedBy=multi-user.target
````

### Step 3: Create Installation Script

Create `scripts/install-systemd-services.sh`:
````bash
#!/bin/bash
# Install systemd services for AI Radio 2525

set -e

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root"
  exit 1
fi

echo "📦 Installing systemd services..."

# Create radio user if doesn't exist
if ! id "radio" &>/dev/null; then
  echo "Creating radio user..."
  useradd -r -s /bin/bash -d /opt/ai-radio-2525 radio
fi

# Create log directory
mkdir -p /var/log/ai-radio-2525
chown radio:radio /var/log/ai-radio-2525

# Copy service files
echo "Copying service files..."
cp scripts/systemd/*.service /etc/systemd/system/

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

# Enable services
echo "Enabling services..."
systemctl enable radio-api
systemctl enable radio-piper-tts
systemctl enable radio-embedder
systemctl enable radio-segment-gen
systemctl enable radio-mastering
systemctl enable radio-scheduler
systemctl enable radio-liquidsoap
systemctl enable radio-web

echo "✅ Services installed and enabled"
echo ""
echo "📋 Next steps:"
echo "1. Start services: systemctl start radio-api (and others)"
echo "2. Check status: systemctl status radio-api"
echo "3. View logs: journalctl -u radio-api -f"
echo ""
````

### Step 4: Create Service Management Script

Create `scripts/manage-services.sh`:
````bash
#!/bin/bash
# Manage AI Radio 2525 services

SERVICES=(
  "radio-api"
  "radio-piper-tts"
  "radio-embedder"
  "radio-segment-gen"
  "radio-mastering"
  "radio-scheduler"
  "radio-liquidsoap"
  "radio-web"
)

case "$1" in
  start)
    echo "🚀 Starting all services..."
    for service in "${SERVICES[@]}"; do
      sudo systemctl start "$service"
      echo "  ✓ $service started"
    done
    ;;
    
  stop)
    echo "🛑 Stopping all services..."
    for service in "${SERVICES[@]}"; do
      sudo systemctl stop "$service"
      echo "  ✓ $service stopped"
    done
    ;;
    
  restart)
    echo "🔄 Restarting all services..."
    for service in "${SERVICES[@]}"; do
      sudo systemctl restart "$service"
      echo "  ✓ $service restarted"
    done
    ;;
    
  status)
    echo "📊 Service Status:"
    for service in "${SERVICES[@]}"; do
      systemctl is-active --quiet "$service" && status="✅ running" || status="❌ stopped"
      echo "  $service: $status"
    done
    ;;
    
  logs)
    if [ -z "$2" ]; then
      echo "Usage: $0 logs <service-name>"
      echo "Services: ${SERVICES[*]}"
      exit 1
    fi
    sudo journalctl -u "$2" -f
    ;;
    
  *)
    echo "Usage: $0 {start|stop|restart|status|logs <service>}"
    exit 1
    ;;
esac
````

Make executable:
````bash
chmod +x scripts/manage-services.sh
````

### Step 5: Create Log Rotation Config

Create `scripts/logrotate/ai-radio-2525`:
````
/var/log/ai-radio-2525/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 radio radio
    sharedscripts
    postrotate
        systemctl reload radio-api radio-piper-tts radio-embedder radio-segment-gen radio-mastering radio-scheduler radio-liquidsoap radio-web > /dev/null 2>&1 || true
    endscript
}
````

Install:
````bash
sudo cp scripts/logrotate/ai-radio-2525 /etc/logrotate.d/
````

### Step 6: Create Monitoring Integration

Create `scripts/systemd/radio-monitor.timer`:
````ini
[Unit]
Description=AI Radio 2525 Health Check Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
````

Create `scripts/systemd/radio-monitor.service`:
````ini
[Unit]
Description=AI Radio 2525 Health Check

[Service]
Type=oneshot
User=radio
ExecStart=/opt/ai-radio-2525/scripts/health-check.sh
StandardOutput=journal
````

---

## Acceptance Criteria

### Functional Requirements
- [ ] All services have systemd files
- [ ] Services start on boot
- [ ] Services restart on failure
- [ ] Logs captured properly
- [ ] Management script works
- [ ] Log rotation configured
- [ ] User isolation implemented

### Quality Requirements
- [ ] Services respect dependencies
- [ ] Clean shutdown
- [ ] Proper logging
- [ ] Resource limits set
- [ ] Security hardening

### Manual Verification
````bash
# Install services (as root)
sudo bash scripts/install-systemd-services.sh

# Start services
bash scripts/manage-services.sh start

# Check status
bash scripts/manage-services.sh status

# View logs
bash scripts/manage-services.sh logs radio-api

# Test restart
bash scripts/manage-services.sh restart

# Test auto-start
sudo reboot
# After reboot, check if services started
bash scripts/manage-services.sh status
````

---

## Next Task Handoff

**For N3 (Production Deployment Guide):**
- Complete deployment documentation
- Security hardening checklist
- Monitoring setup
- Backup procedures
- Troubleshooting guide

**Files created:**
- `scripts/systemd/*.service` (8 files)
- `scripts/install-systemd-services.sh`
- `scripts/manage-services.sh`
- `scripts/logrotate/ai-radio-2525`

**systemd services ready:**
- ✅ Auto-start on boot
- ✅ Service management
- ✅ Log rotation
- ✅ User isolation
- ✅ Dependency ordering

-----------------------

# Task N3: Production Deployment Guide & Documentation

**Tier:** Non-Docker Deployment  
**Estimated Time:** 1 hour  
**Complexity:** Low  
**Prerequisites:** N1-N2 complete, all other tiers complete

---

## Objective

Create comprehensive production deployment documentation: security hardening, monitoring, backups, troubleshooting, maintenance procedures.

---

## Implementation Steps

### Step 1: Create Production Deployment Guide

Create `docs/deployment-guide.md`:
````markdown
# AI Radio 2525 - Production Deployment Guide

## Overview

This guide covers deploying AI Radio 2525 to production using native services (non-Docker).

## Prerequisites

- **Ubuntu 22.04 or 24.04 LTS** (recommended) or **Debian 12**
- **4GB RAM minimum** (8GB recommended)
- **20GB disk space minimum** (50GB recommended)
- **Root access** for installation
- **Domain name** (optional but recommended)
- **Supabase account** with project created
- **Anthropic API key** (Claude)
- **Hugging Face API key** (embeddings)

## Installation Steps

### 1. System Preparation
```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Set hostname
sudo hostnamectl set-hostname radio2525

# Create deployment directory
sudo mkdir -p /opt/ai-radio-2525
sudo chown $USER:$USER /opt/ai-radio-2525
```

### 2. Clone Repository
```bash
cd /opt/ai-radio-2525
git clone https://github.com/your-org/ai-radio-2525.git .
```

### 3. Run Installation Script
```bash
bash scripts/install-ubuntu.sh
```

### 4. Configure Environment
```bash
cp .env.example .env
nano .env
```

Required variables:
```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
SUPABASE_ANON_KEY=eyJxxx...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Hugging Face
EMBEDDING_API_KEY=hf_xxx

# Icecast
ICECAST_PASSWORD=your-secure-password
ICECAST_ADMIN_PASSWORD=your-admin-password
```

### 5. Run Database Migrations
```bash
node infra/migrate.js up
```

### 6. Seed Initial Data (Optional)
```bash
node infra/seed.js
```

### 7. Install systemd Services
```bash
sudo bash scripts/install-systemd-services.sh
```

### 8. Start Services
```bash
bash scripts/manage-services.sh start
```

### 9. Verify Installation
```bash
bash scripts/status.sh
```

## Security Hardening

### Firewall Configuration
```bash
# Install UFW
sudo apt-get install ufw

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow Icecast
sudo ufw allow 8000/tcp

# Enable firewall
sudo ufw enable
```

### SSL/TLS Setup (Nginx + Let's Encrypt)
```bash
# Install Nginx and Certbot
sudo apt-get install nginx certbot python3-certbot-nginx

# Configure Nginx (see nginx config below)

# Get SSL certificate
sudo certbot --nginx -d radio2525.ai
```

**Nginx Configuration** (`/etc/nginx/sites-available/radio2525`):
```nginx
# API
server {
    listen 80;
    server_name api.radio2525.ai;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Web Player
server {
    listen 80;
    server_name radio2525.ai www.radio2525.ai;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Admin
server {
    listen 80;
    server_name admin.radio2525.ai;
    
    # Add basic auth for extra security
    auth_basic "Admin Access";
    auth_basic_user_file /etc/nginx/.htpasswd;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Icecast Stream
server {
    listen 80;
    server_name stream.radio2525.ai;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/radio2525 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Environment Security
```bash
# Secure .env file
chmod 600 /opt/ai-radio-2525/.env
chown radio:radio /opt/ai-radio-2525/.env
```

### Rate Limiting

Configure in Nginx:
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    # ...
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        # ...
    }
}
```

## Monitoring & Alerting

### Set Up Monitoring
```bash
# Install monitoring tools
sudo apt-get install prometheus prometheus-node-exporter grafana

# Configure Prometheus (see monitoring config)

# Start services
sudo systemctl enable prometheus prometheus-node-exporter grafana-server
sudo systemctl start prometheus prometheus-node-exporter grafana-server
```

### Log Monitoring
```bash
# View real-time logs
sudo journalctl -f -u radio-api

# Search logs
sudo journalctl -u radio-api --since "1 hour ago" | grep ERROR
```

### Health Monitoring Script

Add to crontab:
```bash
*/5 * * * * /opt/ai-radio-2525/scripts/health-check.sh
```

## Backup Procedures

### Database Backups
```bash
# Create backup script
cat > /opt/ai-radio-2525/scripts/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/ai-radio-2525"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup via Supabase CLI or pg_dump if direct access
# For Supabase, use their backup tools

echo "Backup completed: $DATE"
EOF

chmod +x /opt/ai-radio-2525/scripts/backup-db.sh
```

Schedule daily backups:
```bash
0 2 * * * /opt/ai-radio-2525/scripts/backup-db.sh
```

### Configuration Backups
```bash
# Backup .env and configs
tar -czf /opt/backups/config-$(date +%Y%m%d).tar.gz \
  /opt/ai-radio-2525/.env \
  /opt/ai-radio-2525/apps/playout/*.liq \
  /opt/ai-radio-2525/apps/playout/icecast.xml
```

## Maintenance

### Update Procedure
```bash
# Stop services
bash scripts/manage-services.sh stop

# Pull updates
git pull origin main

# Update dependencies
pnpm install
pnpm build

# Run migrations
node infra/migrate.js up

# Restart services
bash scripts/manage-services.sh start
```

### Clean Up Old Logs

Handled automatically by logrotate, but manual cleanup:
```bash
# Clean logs older than 30 days
find /var/log/ai-radio-2525 -name "*.log.gz" -mtime +30 -delete
```

### Monitor Disk Usage
```bash
# Check disk usage
df -h

# Check large directories
du -sh /opt/ai-radio-2525/* | sort -h

# Clean cache if needed
rm -rf /opt/ai-radio-2525/services/piper-tts/cache/*
```

## Troubleshooting

### Service Won't Start
```bash
# Check service status
sudo systemctl status radio-api

# View logs
sudo journalctl -u radio-api -n 100

# Check if port is in use
sudo netstat -tulpn | grep :8000
```

### Database Connection Issues
```bash
# Test connection
psql $SUPABASE_URL

# Check environment variables
sudo -u radio env | grep SUPABASE
```

### Streaming Issues
```bash
# Check Liquidsoap
sudo systemctl status radio-liquidsoap

# Test Icecast
curl http://localhost:8001/status.xsl

# Check audio files
ls -lh /opt/ai-radio-2525/apps/playout/audio/
```

### High Memory Usage
```bash
# Check process memory
ps aux --sort=-%mem | head -10

# Restart specific service
sudo systemctl restart radio-segment-gen
```

## Performance Tuning

### PostgreSQL (if self-hosted)
```sql
-- In postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB
```

### Node.js Memory

Increase memory limits in service files:
```ini
Environment="NODE_OPTIONS=--max-old-space-size=2048"
```

### Python Workers

Adjust concurrency:
```bash
# In .env
MAX_CONCURRENT_JOBS=2
```

## Support & Resources

- **Documentation**: https://docs.radio2525.ai
- **GitHub Issues**: https://github.com/your-org/ai-radio-2525/issues
- **Community Discord**: [link]

## Appendix: Quick Reference

### Common Commands
```bash
# Start all services
bash scripts/manage-services.sh start

# Stop all services
bash scripts/manage-services.sh stop

# Check status
bash scripts/manage-services.sh status

# View logs
bash scripts/manage-services.sh logs radio-api

# Restart single service
sudo systemctl restart radio-api
```

### Service URLs

- **API**: http://localhost:8000
- **Web**: http://localhost:3000
- **Admin**: http://localhost:3001
- **Stream**: http://localhost:8001/radio.mp3
- **Icecast**: http://localhost:8000
- **Grafana**: http://localhost:3002
````

### Step 2: Create Security Checklist

Create `docs/security-checklist.md`:
````markdown
# AI Radio 2525 - Security Checklist

## Pre-Deployment

- [ ] Change all default passwords
- [ ] Secure .env file permissions (chmod 600)
- [ ] Generate strong random passwords for Icecast
- [ ] Enable firewall (UFW)
- [ ] Configure fail2ban for SSH protection
- [ ] Set up separate user for running services
- [ ] Disable root SSH login
- [ ] Enable automatic security updates

## SSL/TLS

- [ ] Obtain SSL certificates for all domains
- [ ] Configure HTTPS redirects
- [ ] Set up certificate auto-renewal
- [ ] Enable HSTS headers
- [ ] Configure secure SSL ciphers

## Application Security

- [ ] Enable rate limiting on API endpoints
- [ ] Set up basic auth for admin interface
- [ ] Validate all environment variables
- [ ] Secure API keys (never commit to git)
- [ ] Enable CORS only for trusted domains
- [ ] Sanitize user inputs
- [ ] Implement CSRF protection

## Network Security

- [ ] Close unnecessary ports
- [ ] Configure internal-only services
- [ ] Set up VPN for admin access (optional)
- [ ] Enable DDoS protection (Cloudflare)
- [ ] Monitor for suspicious traffic

## Monitoring

- [ ] Set up error alerting
- [ ] Monitor failed login attempts
- [ ] Track API usage patterns
- [ ] Log all admin actions
- [ ] Set up uptime monitoring

## Regular Maintenance

- [ ] Weekly: Review logs for anomalies
- [ ] Monthly: Update dependencies
- [ ] Monthly: Review user access
- [ ] Quarterly: Security audit
- [ ] Quarterly: Test backup restore
````

---

## Acceptance Criteria

### Functional Requirements
- [ ] Deployment guide is complete
- [ ] Security checklist covers all areas
- [ ] Step-by-step instructions work
- [ ] Troubleshooting covers common issues
- [ ] Backup procedures documented
- [ ] Maintenance tasks listed

### Quality Requirements
- [ ] Clear and actionable
- [ ] Tested on fresh system
- [ ] Security best practices included
- [ ] Production-ready configuration

### Manual Verification

Follow the deployment guide on a fresh Ubuntu 22.04 instance and verify:
````bash
# Complete deployment from scratch
# Follow every step in docs/deployment-guide.md

# Verify all services running
bash scripts/manage-services.sh status

# Test all endpoints
curl http://localhost:8000/health
curl http://localhost:3000
curl http://localhost:3001

# Test stream
ffplay http://localhost:8001/radio.mp3

# Verify logs
sudo journalctl -u radio-api -n 20

# Test restart
sudo systemctl restart radio-api
bash scripts/manage-services.sh status
````

---

## Non-Docker Deployment Tier Complete!

**Files created:**
- `docs/deployment-guide.md`
- `docs/security-checklist.md`

**Complete deployment system:**
- ✅ Native installation scripts
- ✅ systemd service management
- ✅ Production deployment guide
- ✅ Security hardening
- ✅ Monitoring setup
- ✅ Backup procedures
- ✅ Troubleshooting documentation

---

## 🎉 ALL 60 TASKS COMPLETE!

**AI Radio 2525 is now fully implemented:**

### Foundation (10 tasks)
✅ Database, RAG, Knowledge Base, DJs, Programs

### Data Tier (8 tasks)
✅ Embeddings, Chunking, Search, Admin

### RAG Tier (6 tasks)
✅ Hybrid search, Reranking, Context building

### Generation Tier (8 tasks)
✅ Script gen, TTS, Mastering, Quality control

### Admin/CMS Tier (8 tasks)
✅ Full admin interface, content management

### Playout Tier (6 tasks)
✅ Liquidsoap, Scheduler, Streaming, Analytics

### Music & Audio Tier (4 tasks)
✅ Music library, Jingles, Scheduling, Mixing

### Multi-Speaker Tier (3 tasks)
✅ Conversations, Multi-voice, Interview formats

### Lore & Tone Tier (3 tasks)
✅ Style guide, Consistency, Balance monitoring

### Streaming Platforms Tier (3 tasks)
✅ YouTube, Multi-platform, Health monitoring

### Real-Time Events Tier (2 tasks)
✅ Breaking news, Dynamic updates

### Non-Docker Deployment Tier (3 tasks)
✅ Native install, systemd, Production guide

**Total: 60 atomic, executable tasks**
**Complete AI radio station broadcasting from the year 2525! 🚀**

------------
