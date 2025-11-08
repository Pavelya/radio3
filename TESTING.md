# Testing Guide - AI Radio 2525

This guide provides all commands needed to test the radio system components.

## Prerequisites

Ensure you have:
- PostgreSQL running (Supabase)
- Redis running (optional, for caching)
- Node.js and pnpm installed
- Environment variables configured in `.env`

## Quick Start

```bash
# 1. Build all packages
pnpm build

# 2. Run migrations
node infra/migrate.js up

# 3. Seed database
pnpm seed

# 4. Start services (in separate terminals)
# Terminal 1: Admin UI
pnpm --filter @radio/admin dev

# Terminal 2: API Server
PORT=8000 pnpm --filter @radio/api dev

# Terminal 3: Segment Generation Worker
pnpm --filter @radio/segment-gen-worker start

# Terminal 4: Embedder Worker (if needed)
pnpm --filter @radio/embedder-worker start
```

---

## Database Operations

### Migrations

```bash
# Apply all migrations
node infra/migrate.js up

# Rollback last migration
node infra/migrate.js down

# Check migration status
node infra/migrate.js status
```

**Expected Outcome**: Should show all migrations applied successfully.

### Seeding

```bash
# Seed database with test data
pnpm seed
```

**Expected Outcome**:
- Creates DJs (3 personalities)
- Creates Programs (linked to DJs)
- Creates Format Clocks (broadcast schedules)
- Creates Events (historical events)
- Creates KB Chunks (universe documentation)
- Creates Segments (216 segments across different time slots)

**Verification**:
```bash
psql "${DATABASE_URL}" -c "
  SELECT 'djs' as table_name, COUNT(*) FROM djs
  UNION ALL SELECT 'programs', COUNT(*) FROM programs
  UNION ALL SELECT 'format_clocks', COUNT(*) FROM format_clocks
  UNION ALL SELECT 'events', COUNT(*) FROM events
  UNION ALL SELECT 'kb_chunks', COUNT(*) FROM kb_chunks
  UNION ALL SELECT 'segments', COUNT(*) FROM segments;
"
```

### Full Reset

```bash
# Drop all data, rerun migrations, and reseed
pnpm seed:reset
```

**Expected Outcome**: Fresh database with clean seed data.

---

## Cleanup Operations

### Clean Dynamic Data Only

```bash
# Remove all test data (segments, jobs, DLQ, health checks)
pnpm cleanup
```

**What Gets Deleted**:
- All segments
- All jobs
- All dead_letter_queue items
- All worker health_checks

**What Stays**:
- DJs
- Programs
- Format Clocks
- Events
- KB Chunks
- Voices

**Expected Outcome**:
```
Jobs deleted: 0
DLQ items deleted: 0
Segments deleted: 216
Health checks deleted: 1
```

**Verification**:
```bash
psql "${DATABASE_URL}" -c "
  SELECT 'segments' as table_name, COUNT(*) FROM segments
  UNION ALL SELECT 'jobs', COUNT(*) FROM jobs
  UNION ALL SELECT 'dead_letter_queue', COUNT(*) FROM dead_letter_queue
  UNION ALL SELECT 'health_checks', COUNT(*) FROM health_checks;
"
```

---

## Service Management

### Admin UI (Frontend)

```bash
# Development mode (with hot reload)
pnpm --filter @radio/admin dev

# Production mode
pnpm --filter @radio/admin build
pnpm --filter @radio/admin start
```

**Expected Outcome**:
```
▲ Next.js 14.1.0
- Local:        http://localhost:3001
- Network:      http://192.168.x.x:3001

✓ Ready in 2.5s
```

**Verify**:
Open browser to http://localhost:3001

**Available Pages**:
- `/` - Landing page
- `/login` - Authentication
- `/dashboard` - Main dashboard
- `/dashboard/content` - Knowledge base content management
- `/dashboard/events` - Historical events management
- `/dashboard/djs` - DJ personalities management
- `/dashboard/programs` - Radio programs management
- `/dashboard/format-clocks` - Broadcast schedule templates
- `/dashboard/segments` - View generated segments
- `/dashboard/broadcast-schedule` - Live broadcast schedule
- `/dashboard/monitoring` - System monitoring
- `/dashboard/dlq` - Dead Letter Queue management

**Features**:
- Create/Edit/Delete DJs, Events, Programs
- Manage format clocks and broadcast schedules
- Monitor segment generation status
- View scripts and segment details
- Check dead letter queue for failed jobs
- Real-time system monitoring

### API Server (RAG Endpoints)

```bash
# Development mode (with hot reload)
PORT=8000 pnpm --filter @radio/api dev

# Production mode
pnpm --filter @radio/api build
pnpm --filter @radio/api start
```

**Expected Outcome**:
```json
{"level":"info","port":"8000","msg":"API server started"}
```

**Verify**:
```bash
curl http://localhost:8000/health
```

### Segment Generation Worker

```bash
# Build first (if not already built)
pnpm --filter @radio/segment-gen-worker build

# Start worker
pnpm --filter @radio/segment-gen-worker start
```

**Expected Outcome**:
```json
{"level":"info","name":"base-worker","msg":"Worker initialized"}
{"level":"info","name":"rag-client","msg":"RAG client initialized"}
{"level":"info","name":"segment-gen-handler","msg":"Segment generation handler initialized"}
{"level":"info","name":"base-worker","msg":"Worker starting"}
```

### Embedder Worker

```bash
# Build first (if not already built)
pnpm --filter @radio/embedder-worker build

# Start worker
pnpm --filter @radio/embedder-worker start
```

**Expected Outcome**:
```json
{"level":"info","name":"base-worker","msg":"Worker initialized"}
{"level":"info","name":"embedder-worker","msg":"Embedder worker initialized"}
```

### Piper TTS Service (Optional)

```bash
# Check if Piper is installed
which piper

# Start Piper TTS server (if available)
pnpm --filter @radio/piper-tts start
```

**Note**: Piper TTS is optional. Without it, script generation will work but audio synthesis will fail.

---

## Testing Workflows

### Test 1: Generate One Segment (Script Only)

This tests RAG retrieval + script generation without audio synthesis.

```bash
# 1. Clean up previous test data
pnpm cleanup

# 2. Ensure API server is running
PORT=8000 pnpm --filter @radio/api dev

# 3. Start segment-gen-worker (in another terminal)
pnpm --filter @radio/segment-gen-worker start

# 4. Create a test job
psql "${DATABASE_URL}" -c "
  UPDATE segments
  SET state = 'queued'
  WHERE id IN (SELECT id FROM segments LIMIT 1)
  RETURNING id;
"

# Note the returned segment ID, then enqueue a job
psql "${DATABASE_URL}" -c "
  SELECT enqueue_job(
    'segment_make',
    '{\"segment_id\": \"<PASTE_SEGMENT_ID_HERE>\"}'::jsonb,
    5,
    0
  );
"
```

**Expected Outcome**:

Worker logs should show:
1. Job claimed
2. RAG retrieval complete (0-12 chunks)
3. Script generated (500-2000 characters)
4. TTS synthesis fails (if Piper not running)
5. Segment marked as 'failed' (due to TTS)

**Verification**:
```bash
# Check segment has script
psql "${DATABASE_URL}" -c "
  SELECT id, state, LENGTH(script_md) as script_length
  FROM segments
  WHERE id = '<SEGMENT_ID>';
"
```

**Expected**: `state = 'failed'`, `script_length > 0`

### Test 2: Embedder Worker (Chunk Processing)

```bash
# 1. Start embedder worker
pnpm --filter @radio/embedder-worker start

# 2. Create an embed job
psql "${DATABASE_URL}" -c "
  SELECT enqueue_job(
    'chunk_embed',
    '{\"chunk_id\": \"<CHUNK_ID>\", \"chunk_text\": \"Test text\"}'::jsonb,
    5,
    0
  );
"
```

**Expected Outcome**:
- Worker claims job
- Generates embedding vector
- Updates kb_chunks table with embedding
- Job marked as complete

### Test 3: Full Pipeline (with TTS)

**Requirements**: Piper TTS must be running on port 5002.

```bash
# 1. Start all services
# Terminal 1: API
PORT=8000 pnpm --filter @radio/api dev

# Terminal 2: Piper TTS (if available)
pnpm --filter @radio/piper-tts start

# Terminal 3: Segment worker
pnpm --filter @radio/segment-gen-worker start

# 2. Enqueue a segment job
# Follow Test 1 steps to create job
```

**Expected Outcome**:
- Script generation succeeds
- TTS synthesis succeeds
- Audio asset stored
- Mastering job enqueued
- Segment state = 'normalizing'

---

## Verification Commands

### Check Service Status

```bash
# Check if Admin UI is running
curl http://localhost:3001
# Expected: HTML response with Next.js app

# Check if API is responding
curl http://localhost:8000/health

# Check if Piper TTS is running
curl http://localhost:5002/health

# Check Redis connection
redis-cli ping
```

### Check Database State

```bash
# Count jobs by state
psql "${DATABASE_URL}" -c "
  SELECT state, COUNT(*)
  FROM jobs
  GROUP BY state;
"

# Count segments by state
psql "${DATABASE_URL}" -c "
  SELECT state, COUNT(*)
  FROM segments
  GROUP BY state;
"

# Check recent jobs
psql "${DATABASE_URL}" -c "
  SELECT id, job_type, state, created_at
  FROM jobs
  ORDER BY created_at DESC
  LIMIT 10;
"

# Check worker health
psql "${DATABASE_URL}" -c "
  SELECT worker_type, instance_id, last_heartbeat
  FROM health_checks;
"

# View dead letter queue
psql "${DATABASE_URL}" -c "
  SELECT job_type, COUNT(*)
  FROM dead_letter_queue
  GROUP BY job_type;
"
```

### Check Segment Details

```bash
# View segment with script
psql "${DATABASE_URL}" -c "
  SELECT
    id,
    slot_type,
    state,
    LENGTH(script_md) as script_length,
    array_length(citations, 1) as citation_count,
    last_error
  FROM segments
  WHERE script_md IS NOT NULL
  LIMIT 5;
"

# View full script
psql "${DATABASE_URL}" -c "
  SELECT script_md
  FROM segments
  WHERE id = '<SEGMENT_ID>';
"
```

---

## Monitoring Logs

### Watch Worker Logs

```bash
# Segment generation worker
pnpm --filter @radio/segment-gen-worker start | grep -E 'Job claimed|Script generated|failed'

# Embedder worker
pnpm --filter @radio/embedder-worker start | grep -E 'Job claimed|Embedding generated|failed'
```

### Filter Specific Events

```bash
# Only show errors
pnpm --filter @radio/segment-gen-worker start | grep '"level":"error"'

# Only show info logs
pnpm --filter @radio/segment-gen-worker start | grep '"level":"info"'

# Show RAG-related logs
pnpm --filter @radio/segment-gen-worker start | grep '"name":"rag-client"'
```

---

## Common Issues & Solutions

### Issue: "Cannot find module" errors

**Solution**:
```bash
pnpm install
pnpm build
```

### Issue: Port 8000 already in use

**Solution**:
```bash
# Find process using port 8000
lsof -ti:8000

# Kill the process
kill $(lsof -ti:8000)

# Or use a different port
PORT=8001 pnpm --filter @radio/api dev
```

### Issue: Worker not claiming jobs

**Possible causes**:
1. No jobs in queue
2. All jobs already claimed
3. Worker crashed

**Solution**:
```bash
# Check if jobs exist
psql "${DATABASE_URL}" -c "SELECT COUNT(*) FROM jobs WHERE state = 'pending';"

# Check worker health
psql "${DATABASE_URL}" -c "SELECT * FROM health_checks;"

# Restart worker
# Ctrl+C to stop, then restart
pnpm --filter @radio/segment-gen-worker start
```

### Issue: RAG retrieval fails

**Possible causes**:
1. API server not running
2. Wrong port configuration

**Solution**:
```bash
# Verify API is running on correct port
curl http://localhost:8000/health

# Check .env configuration
grep PORT .env

# Restart API with explicit port
PORT=8000 pnpm --filter @radio/api dev
```

### Issue: Database connection errors

**Solution**:
```bash
# Verify DATABASE_URL is set
echo $DATABASE_URL

# Test connection
psql "${DATABASE_URL}" -c "SELECT NOW();"

# Check .env file
cat .env | grep DATABASE_URL
```

### Issue: Too many failed segments

**Solution**:
```bash
# Clean up and start fresh
pnpm cleanup
pnpm seed
```

---

## Performance Testing

### Measure Script Generation Time

```bash
psql "${DATABASE_URL}" -c "
  SELECT
    AVG((generation_metrics->>'generation_time_ms')::int) as avg_generation_ms,
    MIN((generation_metrics->>'generation_time_ms')::int) as min_generation_ms,
    MAX((generation_metrics->>'generation_time_ms')::int) as max_generation_ms
  FROM segments
  WHERE generation_metrics IS NOT NULL;
"
```

### Measure RAG Query Time

Check worker logs for RAG timing:
```bash
pnpm --filter @radio/segment-gen-worker start | grep 'RAG retrieval complete'
```

### Check Job Processing Rate

```bash
psql "${DATABASE_URL}" -c "
  SELECT
    DATE_TRUNC('minute', completed_at) as minute,
    COUNT(*) as jobs_completed
  FROM jobs
  WHERE state = 'completed'
  GROUP BY minute
  ORDER BY minute DESC
  LIMIT 10;
"
```

---

## Development Commands

### Type Checking

```bash
# Check all packages
pnpm typecheck

# Check specific package
pnpm --filter @radio/segment-gen-worker typecheck
pnpm --filter @radio/api typecheck
pnpm --filter @radio/core typecheck
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @radio/core test
```

### Code Quality

```bash
# Run full quality gate
pnpm quality-gate

# Run with auto-fix
pnpm quality-gate:fix
```

---

## Emergency Commands

### Kill All Workers

```bash
pkill -f "segment-gen-worker"
pkill -f "embedder-worker"
pkill -f "@radio/api"
```

### Reset Everything

```bash
# Nuclear option: reset database and reseed
pnpm seed:reset

# Stop all workers (Ctrl+C in each terminal)

# Rebuild everything
pnpm build

# Restart services
PORT=8000 pnpm --filter @radio/api dev
pnpm --filter @radio/segment-gen-worker start
```

---

## Summary of Key Commands

| Operation | Command | Expected Outcome |
|-----------|---------|------------------|
| Build all | `pnpm build` | All packages compiled |
| Seed DB | `pnpm seed` | 216 segments, 3 DJs, events, etc. |
| Clean data | `pnpm cleanup` | Segments, jobs, DLQ cleared |
| Full reset | `pnpm seed:reset` | Fresh database |
| Start Admin UI | `pnpm --filter @radio/admin dev` | UI on http://localhost:3001 |
| Start API | `PORT=8000 pnpm --filter @radio/api dev` | Server on port 8000 |
| Start worker | `pnpm --filter @radio/segment-gen-worker start` | Worker claims jobs |
| Check DB | `psql "${DATABASE_URL}" -c "..."` | Query results |
| Type check | `pnpm typecheck` | No type errors |

---

## Next Steps

After verifying the basic pipeline works:

1. **Add Piper TTS** - Install Piper binary for audio synthesis
2. **Test Mastering Worker** - Build and test audio normalization
3. **Test Scheduler Worker** - Verify broadcast schedule generation
4. **End-to-End Test** - Generate full 24-hour broadcast

---

**Last Updated**: 2025-11-07
**System Status**: ✅ RAG + Script Generation Working | ⚠️ TTS Pending
