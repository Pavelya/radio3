# AI Radio 2525 - P1-P3 Final Validation
**Date:** 2025-11-10
**Status:** All P1-P3 code complete, validation pending

---

## 🎯 TL;DR - What's Actually Left

**P1-P3 code is 100% COMPLETE and committed to git.**

**Only 3 items remain before P4:**
1. Fix 1 bug in playout API (15 min)
2. Start Icecast + Liquidsoap services (10 min)
3. Run validation tests (10 min)

**Total time: ~35 minutes**

After completion: Ready to proceed to P4 (Dead Air Detection)

---

## Current Status

### ✅ What's Complete (Code)

**P1: Liquidsoap Configuration**
- ✅ [radio.liq](apps/playout/radio.liq) - Liquidsoap script
- ✅ [docker-compose.yml](apps/playout/docker-compose.yml) - Container orchestration
- ✅ [Dockerfile](apps/playout/Dockerfile) - Liquidsoap container image
- ✅ [icecast.xml](apps/playout/icecast.xml) - Icecast configuration

**P2: Playout API**
- ✅ [playout-routes.ts](apps/api/src/playout/playout-routes.ts) - API endpoints
- ✅ Route registered in server.ts
- ⚠️ **Has runtime bug** (schema cache error)

**P3: Scheduler Worker**
- ✅ [schedule-generator.ts](workers/scheduler/src/schedule-generator.ts) - Schedule logic
- ✅ Worker tested and created schedule entries
- ✅ Multi-program scheduling working

**Phase 3: Generation Pipeline (G1-G8)**
- ✅ 100% Complete
- ✅ 63 segments in 'ready' state
- ✅ Piper TTS server operational
- ✅ Audio mastering working

### ❌ What's Missing (Validation Only)

1. **P2 bug fix** - Playout API returns schema error
2. **P1 validation** - Services not started (Icecast, Liquidsoap)
3. **P1 validation** - Stream endpoint not tested
4. **P3 validation** - Schedule completeness not verified

---

## REMAINING TASK 1: Fix Playout API Bug (15 min)

### Problem
Playout API endpoint returns:
```json
{
  "error": "Failed to fetch segments",
  "code": "PGRST200",
  "details": "Could not find a relationship between 'segments' and 'djs'"
}
```

### Root Cause
The API query tries to join segments directly with djs table, but the relationship is:
```
segments → broadcast_schedule → programs → djs
```

### Fix Steps

**Step 1.1:** Read the current playout API implementation

```bash
cd /Users/pavel/radio3
cat apps/api/src/playout/playout-routes.ts
```

**Step 1.2:** Locate the problematic query

Look for a Supabase query that includes:
```typescript
.select('*, djs(*)')
```

**Step 1.3:** Fix the query

Replace with proper join path:

```typescript
// BEFORE (broken):
.select('*, djs(*)')

// AFTER (fixed):
.select(`
  *,
  broadcast_schedule!inner(
    scheduled_at,
    programs!inner(
      name,
      djs(name, voice_id)
    )
  )
`)
```

OR if DJ info isn't needed for playout:
```typescript
// Simple fix - remove DJ join
.select('*')
```

**Step 1.4:** Rebuild and restart API

```bash
# Build API
pnpm --filter @radio/api build

# Stop existing API if running
pkill -f "pnpm --filter @radio/api"

# Start API
PORT=8000 pnpm --filter @radio/api dev > logs/api.log 2>&1 &
API_PID=$!
echo "API started, PID: $API_PID"

# Wait for startup
sleep 5
```

**Step 1.5:** Test the fixed API

```bash
# Test playout endpoint
curl -s 'http://localhost:8000/playout/next?limit=3' | python3 -m json.tool
```

**Expected output:**
```json
[
  {
    "id": "uuid-here",
    "slot_type": "news",
    "duration_sec": 57.19,
    "script_md": "...",
    "asset_id": "uuid-here"
  },
  ...
]
```

**Step 1.6:** Verify segment assets are accessible

```bash
# Check that segments have audio URLs via storage
psql $DATABASE_URL -c "
SELECT s.id, s.slot_type, a.storage_path
FROM segments s
JOIN assets a ON s.asset_id = a.id
WHERE s.state = 'ready'
LIMIT 3;
"
```

### Success Criteria for Task 1
- ✅ `/playout/next` returns JSON array (not error)
- ✅ Each segment has: id, slot_type, duration_sec, asset_id
- ✅ No schema cache errors
- ✅ At least 3 segments returned

---

## REMAINING TASK 2: Start Streaming Services (10 min)

### Prerequisites
- Docker installed
- API server running with working playout endpoint (Task 1 complete)
- At least 10 segments in 'ready' state

### Step 2.1: Start Icecast

```bash
cd /Users/pavel/radio3/apps/playout

# Start Icecast streaming server
docker compose up -d icecast

# Wait for startup
sleep 5

# Check status
docker compose ps icecast
```

**Expected output:** `Up`

**Step 2.2:** Verify Icecast

```bash
# Test admin interface
curl -I http://localhost:8001/admin/

# Should return: HTTP/1.0 200 OK

# Check status page
curl -s http://localhost:8001/status-json.xsl | python3 -m json.tool | head -20
```

**Expected output:** JSON with icestats object

**Step 2.3:** Start Liquidsoap

```bash
# Start Liquidsoap broadcast engine
docker compose up -d liquidsoap

# Wait for startup
sleep 10

# Check status
docker compose ps liquidsoap
```

**Expected output:** `Up`

**Step 2.4:** Monitor Liquidsoap logs

```bash
# Watch logs for 30 seconds
timeout 30 docker compose logs -f liquidsoap
```

**Look for:**
- ✅ "Liquidsoap started"
- ✅ "Connecting to Icecast"
- ✅ "Fetching playlist from API"
- ✅ "Prepared next track: <segment_id>"
- ❌ "Connection refused" → Check Icecast
- ❌ "Failed to fetch playlist" → Check API

**Step 2.5:** Verify Liquidsoap is feeding Icecast

```bash
# Check Icecast sources
curl -s http://localhost:8001/status-json.xsl | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'icestats' in data and 'source' in data['icestats']:
    print('✅ Stream is active')
    source = data['icestats']['source']
    if isinstance(source, list):
        source = source[0]
    print(f\"  Mount: {source.get('listenurl', 'N/A')}\")
    print(f\"  Type: {source.get('server_type', 'N/A')}\")
else:
    print('❌ No active stream sources')
"
```

**Expected output:**
```
✅ Stream is active
  Mount: http://localhost:8001/radio.opus
  Type: audio/ogg
```

### Success Criteria for Task 2
- ✅ Icecast container running
- ✅ Liquidsoap container running
- ✅ Liquidsoap logs show "Prepared next track"
- ✅ Icecast shows active source

---

## REMAINING TASK 3: Validate End-to-End (10 min)

### Prerequisites
- Task 1 complete (API working)
- Task 2 complete (Services running)

### Step 3.1: Test Stream Endpoint

```bash
# Check stream is accessible
curl -I http://localhost:8001/radio.opus
```

**Expected output:**
```
HTTP/1.0 200 OK
Content-Type: audio/ogg
```

### Step 3.2: Download Stream Sample

```bash
# Capture 10 seconds of stream
timeout 10 curl -s http://localhost:8001/radio.opus > /tmp/radio-test.opus

# Check file size (should be >100KB)
ls -lh /tmp/radio-test.opus

# Verify it's valid audio
file /tmp/radio-test.opus
```

**Expected output:**
```
-rw-r--r-- 1 user group 250K Nov 10 22:00 /tmp/radio-test.opus
/tmp/radio-test.opus: Ogg data, Opus audio
```

### Step 3.3: Test Continuous Streaming (60 seconds)

```bash
# Test 60 seconds of continuous stream
echo "Testing stream for 60 seconds..."
START_SIZE=$(curl -s http://localhost:8001/radio.opus 2>&1 | head -c 1000 | wc -c)
sleep 60
END_SIZE=$(curl -s http://localhost:8001/radio.opus 2>&1 | head -c 1000 | wc -c)

if [ "$START_SIZE" -gt 0 ] && [ "$END_SIZE" -gt 0 ]; then
    echo "✅ Stream is continuous"
else
    echo "❌ Stream has issues"
fi
```

### Step 3.4: Verify Track Transitions

```bash
# Watch Liquidsoap logs for track changes
timeout 120 docker compose logs -f liquidsoap | grep -E "(Prepared|Finished)"
```

**Expected output (every ~60 seconds):**
```
[2025-11-10 22:00:00] Prepared next track: <segment_id_1>
[2025-11-10 22:01:00] Finished track: <segment_id_1>
[2025-11-10 22:01:00] Prepared next track: <segment_id_2>
```

### Step 3.5: Test Playback (Optional)

If you have a media player installed:

```bash
# On Mac
ffplay -nodisp -autoexit -t 30 http://localhost:8001/radio.opus

# On Linux with mpv
mpv --no-video --length=30 http://localhost:8001/radio.opus

# On Linux with VLC
cvlc --no-video --play-and-exit --run-time=30 http://localhost:8001/radio.opus
```

**Expected result:** Hear AI-generated radio content (voice, clear audio, no stuttering)

### Step 3.6: Verify P3 Schedule

```bash
# Check schedule has future entries
psql $DATABASE_URL -c "
SELECT
  COUNT(*) FILTER (WHERE scheduled_at > NOW()) as future_segments,
  COUNT(*) FILTER (WHERE scheduled_at <= NOW()) as past_segments,
  COUNT(*) as total_segments
FROM broadcast_schedule;
"
```

**Expected output:**
```
 future_segments | past_segments | total_segments
-----------------+---------------+----------------
              10 |             5 |             15
```

### Step 3.7: Integration Test - Full Pipeline

```bash
echo "=== P1-P3 Integration Test ==="
echo ""

echo "1. Check segments are ready:"
READY=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM segments WHERE state = 'ready';")
echo "   Ready segments: $READY"
if [ "$READY" -ge 10 ]; then
    echo "   ✅ Sufficient segments"
else
    echo "   ⚠️  Low segment count"
fi

echo ""
echo "2. Check API is serving segments:"
API_RESPONSE=$(curl -s 'http://localhost:8000/playout/next?limit=1')
if echo "$API_RESPONSE" | grep -q "slot_type"; then
    echo "   ✅ API working"
else
    echo "   ❌ API error: $API_RESPONSE"
fi

echo ""
echo "3. Check Liquidsoap is fetching:"
TRACK_COUNT=$(docker compose logs liquidsoap --tail=50 | grep -c "Prepared" || echo 0)
echo "   Tracks prepared: $TRACK_COUNT"
if [ "$TRACK_COUNT" -gt 0 ]; then
    echo "   ✅ Liquidsoap active"
else
    echo "   ⚠️  No tracks prepared yet"
fi

echo ""
echo "4. Check stream is live:"
if curl -I http://localhost:8001/radio.opus 2>&1 | grep -q "200 OK"; then
    echo "   ✅ Stream is live"
else
    echo "   ❌ Stream not accessible"
fi

echo ""
echo "=== Test Complete ==="
```

### Success Criteria for Task 3
- ✅ Stream returns 200 OK
- ✅ Stream file is valid Opus audio
- ✅ Stream runs continuously for 60+ seconds
- ✅ Track transitions visible in logs
- ✅ Schedule has future entries
- ✅ Integration test passes all checks

---

## Final Validation Checklist

Before proceeding to P4, verify all items:

### Phase 3: Generation Pipeline (G1-G8) ✅
- [x] Piper TTS running on port 5002
- [x] 50+ segments in 'ready' state
- [x] Audio files normalized to -16 LUFS
- [x] Script generation with Claude working

### Phase 5: Playout System (P1-P3)

**P1: Liquidsoap Configuration** ☐
- [ ] Icecast container running (`docker compose ps icecast`)
- [ ] Liquidsoap container running (`docker compose ps liquidsoap`)
- [ ] Stream accessible at http://localhost:8001/radio.opus
- [ ] Stream plays continuously for 60+ seconds

**P2: Playout API Endpoints** ☐
- [ ] API returns segments (not error) at `/playout/next`
- [ ] Segments have required fields (id, slot_type, duration_sec, asset_id)
- [ ] No schema cache errors in logs

**P3: Scheduler Worker** ☐
- [ ] Schedule has 10+ future entries
- [ ] Schedule spans multiple programs
- [ ] Segments match schedule slots

### When ALL boxes checked: ✅ Ready for P4

---

## Quick Reference Commands

### Start All Services
```bash
# Terminal 1: API Server
PORT=8000 pnpm --filter @radio/api dev

# Terminal 2: TTS Server
cd workers/piper-tts
PORT=5002 venv/bin/python server.py

# Terminal 3: Streaming
cd apps/playout
docker compose up icecast liquidsoap
```

### Health Checks
```bash
# API
curl http://localhost:8000/health

# TTS
curl http://localhost:5002/health

# Playout API
curl 'http://localhost:8000/playout/next?limit=1'

# Icecast
curl http://localhost:8001/status.xsl

# Liquidsoap logs
docker compose -f apps/playout/docker-compose.yml logs liquidsoap --tail=20

# Stream
curl -I http://localhost:8001/radio.opus
```

### Stop All Services
```bash
# Stop streaming
cd apps/playout
docker compose down

# Stop API
pkill -f "pnpm --filter @radio/api"

# Stop TTS
pkill -f "python.*server.py"
```

---

## Troubleshooting

### Issue: Playout API still returns error after fix

```bash
# Check the fix was applied
grep -A10 "playout/next" apps/api/src/playout/playout-routes.ts

# Verify rebuild happened
ls -lt apps/api/dist/apps/api/src/playout/ | head -5

# Check API logs
tail -50 logs/api.log | grep -i error
```

### Issue: Liquidsoap can't reach API

```bash
# Test from Liquidsoap container
docker exec radio-liquidsoap curl http://host.docker.internal:8000/health

# If fails, check API is running
curl http://localhost:8000/health

# Check Docker network
docker network inspect playout_radio-network | grep -A5 "radio-liquidsoap"
```

### Issue: Stream has no audio

```bash
# Check Liquidsoap is fetching segments
docker compose logs liquidsoap | grep "Prepared next track"

# If no tracks, check API returns data
curl -s 'http://localhost:8000/playout/next?limit=5' | python3 -m json.tool

# Check segments have audio files
psql $DATABASE_URL -c "
SELECT s.id, s.state, a.storage_path
FROM segments s
JOIN assets a ON s.asset_id = a.id
WHERE s.state = 'ready'
LIMIT 5;
"
```

### Issue: Port conflicts

```bash
# Check what's using ports
lsof -i :8000  # API
lsof -i :8001  # Icecast
lsof -i :5002  # TTS

# Kill conflicting processes if needed
kill <PID>
```

---

## What Happens After This

Once all 3 tasks are complete and validation passes:

1. **Update progress tracking:**
   ```
   Phase 5: ☑ P1 ☑ P2 ☑ P3 ☐ P4 ☐ P5 ☐ P6
   ```

2. **Ready to start P4:** Dead Air Detection (4 hours)
   - Prerequisites: All met ✅
   - Can proceed immediately

3. **Or start Admin CMS in parallel:**
   - Phase 4 (A1-A12) has no dependencies on P4-P6
   - Can build admin UI while refining playout

4. **Document any issues encountered:**
   - Playout API query fix details
   - Docker networking quirks
   - Performance observations

---

## Time Breakdown

- **Task 1 (Fix API):** 15 minutes
- **Task 2 (Start Services):** 10 minutes
- **Task 3 (Validation):** 10 minutes
- **Contingency:** 10 minutes

**Total: 45 minutes maximum**

This is the **ONLY** work needed to complete P1-P3 and unlock P4-P6.
