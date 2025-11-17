# Time-Awareness System Fix

## Executive Summary

This document details a critical bug in the time-awareness system and provides a comprehensive fix to restore the immersive "year 2525" experience that is core to Radio Vox Futura's product vision.

**Bug Severity**: HIGH - Breaks core product vision
**Impact**: All segment generation
**Estimated Fix Time**: 1-2 hours
**Risk Level**: LOW - Isolated changes, easy rollback

---

## Configuration Note

**IMPORTANT**: This fix uses the `FUTURE_YEAR_OFFSET` environment variable for all time calculations. There are **NO hardcoded year offsets** in the implementation.

All year offset calculations use:
```typescript
import { getFutureYear, getFutureYearOffset } from '@radio/core/utils/time.utils';

// Reads from process.env.FUTURE_YEAR_OFFSET (default: 500)
const futureYear = getFutureYear();
```

The "500 years" and "2525" mentioned in examples throughout this document refer to the **default** value of `FUTURE_YEAR_OFFSET`, not hardcoded constants.

---

## Product Vision: Time-Awareness

From `.claude/PRODUCT VISION.md`:

> **time aware** - The AI maintains temporal context, referencing current events and dates appropriately for the fictional year 2525 (real date + FUTURE_YEAR_OFFSET from environment)

**Note**: The offset is configured via the `FUTURE_YEAR_OFFSET` environment variable (default: 500 years), not hardcoded.

### Expected Behavior

**Example** (with default FUTURE_YEAR_OFFSET=500):

- **Real World**: Thursday, January 16, 2025, 10:30 AM
- **Fictional World**: Thursday, January 16, 2525, 10:30 AM (2025 + 500)
- **DJ Says**: "Good morning listeners, it's Thursday, January 16th, 2525..."
- **RAG Retrieves**: Events from knowledge base dated around "January 16, 2525"
- **Result**: Perfect immersion - listeners feel they're in the future

**Note**: The future year is calculated dynamically using `getFutureYear()` which reads `FUTURE_YEAR_OFFSET` from environment variables.

---

## Current Broken Behavior

### What Actually Happens

1. ✅ **Scheduler** correctly creates segments with `scheduled_start_ts = 2525-01-16T10:30:00Z`
2. ❌ **Segment Generator** calls RAG with real date: `2025-01-16T10:30:00Z`
3. ❌ **RAG Client** asks: "What events happened on January 16, **2025**?" (wrong year!)
4. ❌ **LLM Prompt** contains contradictory dates:
   - "Current date/time: 2025-01-16..."
   - "You are in year 2525"
5. ❌ **Claude LLM** gets confused by contradiction
6. ❓ **Generated Script** might reference wrong year or be temporally confused

### Evidence in Code

**File**: `workers/segment-gen/src/worker/segment-gen-handler.ts:92-96`
```typescript
// BUG: Uses real current date instead of segment's scheduled time
const ragQuery = this.ragClient.buildQuery(
  segment,
  new Date().toISOString() // ❌ This is 2025-01-16, not 2525-01-16!
);
```

**File**: `workers/segment-gen/src/worker/segment-gen-handler.ts:109-117`
```typescript
// BUG: Same issue - real date passed to script generator
const scriptResult = await this.scriptGen.generateScript({
  slotType: segment.slot_type,
  targetDuration: this.getTargetDuration(segment.slot_type),
  djName: dj.name,
  djPersonality: dj.personality_traits,
  referenceTime: new Date().toISOString(), // ❌ Real date again!
  ragChunks: ragResult.chunks,
  futureYear: getFutureYear() // ✅ This is correct (2525)
});
```

**File**: `workers/segment-gen/src/rag/rag-client.ts:71-91`
```typescript
buildQuery(segment: any, referenceTime: string): RAGQuery {
  const refDate = new Date(referenceTime); // Gets 2025 date
  const year = refDate.getFullYear(); // year = 2025 ❌

  // RAG queries use wrong year
  const queries = {
    'news': `What events are happening around ${month} ${day}, ${year}?`
    // Asks about 2025, not 2525! ❌
  };
}
```

**File**: `workers/segment-gen/src/llm/prompt-templates.ts:59-70`
```typescript
buildUserPrompt(context: SegmentContext): string {
  return `Current date/time: ${context.referenceTime}` // Shows 2025 ❌
  // ...
  Remember: You are speaking to listeners in the year ${context.futureYear}. // Shows 2525 ✅
  // CONTRADICTION! LLM gets conflicting information
}
```

### Impact Assessment

**Critical Issues**:
1. **Immersion Broken**: DJs might say "2025" instead of "2525"
2. **Anachronistic Content**: RAG retrieves 2025 events for a 2525 broadcast
3. **Confused Scripts**: LLM receives contradictory temporal context
4. **Product Vision Violated**: "Time aware" feature completely broken

**User Experience**:
- Listener expects: "Welcome to Mars Colony News, January 16th, 2525..."
- Might actually hear: "It's January 16th, 2025... wait, we're in 2525?" (confused)
- Knowledge base content mismatched to broadcast time

---

## Root Cause Analysis

### Why This Bug Exists

The system has **two separate time contexts** but only uses one:

1. **Scheduled Time** (`segment.scheduled_start_ts`): Correct future time (2525-01-16)
   - Calculated by scheduler: `realTime + FUTURE_YEAR_OFFSET`
   - Already has the proper offset applied from environment variable
   - Stored in database
   - Used by playout system
   - ✅ This is correct!

2. **Generation Time** (`new Date()`): Wrong real-world time (2025-01-16)
   - Used during RAG retrieval (BUG!)
   - Passed to LLM prompt (BUG!)
   - Ignores the FUTURE_YEAR_OFFSET that was already applied to scheduled_start_ts
   - ❌ This is wrong!

### The Missing Link

The segment generator **ignores** `segment.scheduled_start_ts` and uses `new Date()` instead.

**Why?** Likely oversight during initial development. The generation happens asynchronously, so developers used "current time" without considering it should use "scheduled broadcast time".

---

## The Fix

### Overview

Use `segment.scheduled_start_ts` as the reference time for RAG and LLM instead of `new Date()`.

### Changes Required

1. Extract scheduled time from segment
2. Pass to RAG client
3. Pass to script generator
4. Update prompts for clarity

---

## Implementation Plan

### Phase 1: Extract Scheduled Time

**File**: `workers/segment-gen/src/worker/segment-gen-handler.ts`

**Location**: Line ~92, in the `handle()` method after fetching segment

**Change**:
```typescript
// OLD (broken):
const ragQuery = this.ragClient.buildQuery(
  segment,
  new Date().toISOString() // ❌ Real current time
);

// NEW (fixed):
// Use the segment's scheduled broadcast time, not current time
const broadcastTime = segment.scheduled_start_ts || new Date().toISOString();

logger.info({
  segment_id,
  scheduled_start: segment.scheduled_start_ts,
  broadcast_time: broadcastTime,
}, 'Using scheduled broadcast time for generation');

const ragQuery = this.ragClient.buildQuery(
  segment,
  broadcastTime // ✅ Scheduled broadcast time (2525)
);
```

**Explanation**:
- `segment.scheduled_start_ts` is the future time (e.g., 2525-01-16T10:30:00Z)
- This timestamp was already calculated by the scheduler using `FUTURE_YEAR_OFFSET` from environment
- No need to add offset again - just use the scheduled time directly
- Fallback to `new Date()` only for edge cases (unscheduled segments)
- Log both values for debugging

---

### Phase 2: Update Script Generation

**File**: `workers/segment-gen/src/worker/segment-gen-handler.ts`

**Location**: Line ~109-117, when calling `generateScript()`

**Change**:
```typescript
// OLD (broken):
const scriptResult = await this.scriptGen.generateScript({
  slotType: segment.slot_type,
  targetDuration: this.getTargetDuration(segment.slot_type),
  djName: dj.name,
  djPersonality: dj.personality_traits,
  referenceTime: new Date().toISOString(), // ❌ Real time
  ragChunks: ragResult.chunks,
  futureYear: getFutureYear()
});

// NEW (fixed):
const scriptResult = await this.scriptGen.generateScript({
  slotType: segment.slot_type,
  targetDuration: this.getTargetDuration(segment.slot_type),
  djName: dj.name,
  djPersonality: dj.personality_traits,
  referenceTime: broadcastTime, // ✅ Use same broadcast time as RAG
  ragChunks: ragResult.chunks,
  futureYear: getFutureYear() // ✅ Uses FUTURE_YEAR_OFFSET from env
});
```

**Explanation**:
- Use the same `broadcastTime` variable for consistency
- Both RAG and LLM now use the same temporal context
- `getFutureYear()` dynamically reads `FUTURE_YEAR_OFFSET` environment variable
- Eliminates contradiction in prompts

---

### Phase 3: Update Multi-Speaker Segment Handler

**File**: `workers/segment-gen/src/worker/segment-gen-handler.ts`

**Location**: In `handleMultiSpeakerSegment()` method (around line ~240-260)

**Find and update** similar patterns:
```typescript
// In handleMultiSpeakerSegment method:

// OLD:
const ragQuery = this.ragClient.buildQuery(
  segment,
  new Date().toISOString() // ❌
);

// NEW:
const broadcastTime = segment.scheduled_start_ts || new Date().toISOString();
const ragQuery = this.ragClient.buildQuery(
  segment,
  broadcastTime // ✅
);

// And later when generating conversation:
const conversationResult = await this.conversationGen.generateConversation({
  // ... other params
  referenceTime: broadcastTime, // ✅ Not new Date()
  futureYear: getFutureYear() // ✅ Uses FUTURE_YEAR_OFFSET from env
});
```

**Explanation**:
- Same pattern as single-speaker segments
- `getFutureYear()` reads from `FUTURE_YEAR_OFFSET` environment variable
- No hardcoded year offsets anywhere in the codebase

---

### Phase 4: Improve Prompt Clarity

**File**: `workers/segment-gen/src/llm/prompt-templates.ts`

**Location**: Line ~59-70 in `buildUserPrompt()`

**Change**:
```typescript
// OLD (confusing):
buildUserPrompt(context: SegmentContext): string {
  return `Current date/time: ${context.referenceTime}

RELEVANT INFORMATION FROM KNOWLEDGE BASE:
// ...

Using the information above, create a ${context.slotType} segment.
Remember: You are speaking to listeners in the year ${context.futureYear}.
// ...

// NEW (crystal clear):
buildUserPrompt(context: SegmentContext): string {
  const broadcastDate = new Date(context.referenceTime);
  const formattedDate = broadcastDate.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  });

  return `BROADCAST TIME: ${formattedDate} (Year ${context.futureYear})
This is the current date and time in your world.

RELEVANT INFORMATION FROM KNOWLEDGE BASE:
${chunks}

---

Using the information above, create a ${context.slotType} segment for broadcast.
You are speaking to listeners living in the year ${context.futureYear}.
Naturally reference today's date (${formattedDate}) as appropriate for your segment.

Begin your script now:`;
}
```

**Explanation**:
- Single source of truth for broadcast time
- Clear formatting shows both date AND year context
- `context.futureYear` comes from `getFutureYear()` which reads `FUTURE_YEAR_OFFSET` env var
- Eliminates any ambiguity for the LLM
- Makes it obvious this is the "current" time in the fictional world

**Important**: This phase doesn't require code changes if `context.futureYear` is already passed correctly from Phase 2. The prompt template simply uses the value provided by the caller.

---

### Phase 5: Update RAG Query Comments

**File**: `workers/segment-gen/src/rag/rag-client.ts`

**Location**: Lines ~69-100

**Change** (documentation only, logic already correct):
```typescript
/**
 * Build time-aware RAG query
 *
 * IMPORTANT: referenceTime should be the segment's scheduled_start_ts (future time),
 * NOT the real-world current time. This ensures RAG retrieves content appropriate
 * for the broadcast date in the fictional year 2525.
 *
 * Creates time-aware, context-specific queries
 */
buildQuery(segment: any, referenceTime: string): RAGQuery {
  // Parse reference time for context
  // NOTE: This should be the BROADCAST time (e.g. 2525-01-16), not generation time
  const refDate = new Date(referenceTime);
  const year = refDate.getFullYear(); // Should be 2525, not 2025!
  const month = refDate.toLocaleDateString('en-US', { month: 'long' });
  const day = refDate.getDate();

  // Build time-aware queries based on slot type
  const queries: Record<string, string> = {
    'news': `What significant events, news developments, and current affairs are happening around ${month} ${day}, ${year}?`,
    // ... rest of queries
  };
```

---

## Testing Plan

### Test 1: Verify Scheduled Time is Used

**Setup**:
1. Create a segment with scheduled time: `2525-06-15T14:00:00Z`
2. Trigger segment generation

**Verification**:
```bash
# Check worker logs
docker logs <segment-gen-worker-container> | grep "broadcast_time"

# Expected output:
# {
#   "segment_id": "abc-123",
#   "scheduled_start": "2525-06-15T14:00:00Z",
#   "broadcast_time": "2525-06-15T14:00:00Z"
# }
```

**Success Criteria**: `broadcast_time` matches `scheduled_start` (both show 2525)

---

### Test 2: RAG Query Uses Future Year

**Setup**:
1. Add logging to RAG client before query
2. Generate a segment scheduled for `2525-03-20T10:00:00Z`

**Verification**:
```bash
# Check RAG client logs
docker logs <segment-gen-worker-container> | grep "Built time-aware RAG query"

# Expected output:
# {
#   "slot_type": "news",
#   "referenceTime": "2525-03-20T10:00:00Z",
#   "year": 2525  # ← This should be 2525, not 2025!
# }
```

**Success Criteria**: Year in RAG query is 2525, not 2025

---

### Test 3: Generated Script References Correct Year

**Setup**:
1. Generate a news segment scheduled for `2525-12-25T09:00:00Z`
2. Read the generated script

**Verification**:
```sql
SELECT script_md FROM segments WHERE scheduled_start_ts = '2525-12-25T09:00:00Z';
```

**Expected Script Content**:
```
Good morning, and Merry Christmas! It's December 25th, 2525...
[Should mention 2525 or future context like "Mars colonies," "warp gates," etc.]
```

**Success Criteria**:
- Script mentions correct date (December 25th)
- References year 2525 or future context
- NO mention of 2025

---

### Test 4: Multiple Time Zones Work

**Setup**:
1. Create segments with different scheduled times:
   - Morning: `2525-01-16T06:00:00Z`
   - Afternoon: `2525-01-16T14:00:00Z`
   - Evening: `2525-01-16T22:00:00Z`

**Verification**:
Each script should reference the appropriate time of day:
- Morning: "Good morning," "sunrise," "breakfast"
- Afternoon: "Good afternoon," "midday"
- Evening: "Good evening," "sunset"

**Success Criteria**: Time-of-day references match scheduled time

---

### Test 5: Unscheduled Segments Fallback

**Setup**:
1. Create a manual segment with `scheduled_start_ts = NULL`
2. Trigger generation

**Verification**:
```bash
# Check logs
docker logs <segment-gen-worker-container> | grep "broadcast_time"

# Expected: Falls back to current time
# {
#   "scheduled_start": null,
#   "broadcast_time": "2025-01-16T..." # Uses new Date() as fallback
# }
```

**Success Criteria**: System doesn't crash, uses fallback gracefully

---

### Test 6: Historical Context Alignment

**Setup**:
1. Add knowledge base entry: "Mars Colony Alpha founded on June 15, 2523"
2. Generate history segment scheduled for `2525-06-15T10:00:00Z`

**Verification**:
Check generated script references the historical event appropriately:
```
Today marks the second anniversary of Mars Colony Alpha's founding...
[Should calculate 2525 - 2523 = 2 years ago]
```

**Success Criteria**: Historical references use correct temporal math

---

### Test 7: Conversation Segments

**Setup**:
1. Create multi-DJ segment (interview format)
2. Scheduled for `2525-07-04T12:00:00Z`

**Verification**:
Both speakers should reference consistent time:
```
**[Host]:** Welcome to Independence Day 2525! Today we're celebrating...
**[Guest]:** Thanks for having me on this historic July 4th...
```

**Success Criteria**: All speakers reference same date (2525)

---

### Test 8: End-to-End Broadcast

**Setup**:
1. Run full pipeline:
   - Scheduler creates segments for tomorrow
   - Segment-gen generates scripts
   - TTS synthesizes audio
   - Playout broadcasts

**Verification**:
Listen to stream and verify DJ naturally mentions current date in year 2525

**Success Criteria**:
- Dates mentioned sound natural
- No temporal confusion
- Immersion maintained

---

## Backward Compatibility

### Existing Segments

**Question**: What about segments already generated with the bug?

**Answer**: They're already in `ready` or `aired` state. No need to regenerate.

**Reasoning**:
- Script is already generated and stored in `script_md`
- Audio already synthesized
- Changing the fix won't affect historical data
- Only new generations use the fixed code

### Manual Segments

**Question**: What about unscheduled manual segments?

**Answer**: Fallback to `new Date()` still works.

**Code**:
```typescript
const broadcastTime = segment.scheduled_start_ts || new Date().toISOString();
```

**Reasoning**:
- Manual segments created via `/segments/create-conversation` might not have scheduled time yet
- Graceful fallback prevents crashes
- User can still schedule them later

---

## Rollback Plan

If issues are discovered after deployment:

### Step 1: Revert Code Changes

```bash
# Revert the segment-gen-handler.ts changes
git checkout HEAD~1 -- workers/segment-gen/src/worker/segment-gen-handler.ts

# Revert prompt changes
git checkout HEAD~1 -- workers/segment-gen/src/llm/prompt-templates.ts

# Rebuild
pnpm --filter @radio/segment-gen-worker build
```

### Step 2: Restart Worker

```bash
# Restart segment-gen worker
docker-compose restart segment-gen-worker

# Or if running locally:
pkill -f segment-gen
pnpm --filter @radio/segment-gen-worker start
```

### Step 3: Verify Rollback

```bash
# Check worker started successfully
docker logs segment-gen-worker --tail 50

# Generate a test segment
curl -X POST http://localhost:8000/test/generate-segment
```

**Recovery Time**: < 5 minutes
**Data Loss**: None (only affects new generations)

---

## Additional Improvements (Optional)

### Enhancement 1: Add Timezone Support

Currently uses UTC. Could add timezone awareness:

```typescript
// Get timezone from segment or program
const timezone = segment.programs?.timezone || 'America/Los_Angeles';

// Format time in station's timezone
const stationTime = new Date(broadcastTime).toLocaleString('en-US', {
  timeZone: timezone,
  // ...
});
```

**Benefit**: DJs could say "Good morning here on the West Coast..." or "It's 3 PM in Neo Tokyo..."

**Priority**: LOW (nice-to-have)

---

### Enhancement 2: Time-of-Day Personality

Adjust DJ personality based on time:

```typescript
const hour = new Date(broadcastTime).getUTCHours();
const timePersonality = {
  morning: "energetic and cheerful",
  afternoon: "informative and steady",
  evening: "relaxed and conversational",
  night: "mellow and contemplative"
};

const personality = hour < 12 ? timePersonality.morning :
                   hour < 17 ? timePersonality.afternoon :
                   hour < 22 ? timePersonality.evening :
                   timePersonality.night;
```

**Benefit**: More natural time-appropriate energy levels

**Priority**: MEDIUM (enhances experience)

---

### Enhancement 3: Seasonal Context

Add seasonal awareness to prompts:

```typescript
const month = new Date(broadcastTime).getUTCMonth();
const season = month >= 2 && month <= 4 ? 'spring' :
               month >= 5 && month <= 7 ? 'summer' :
               month >= 8 && month <= 10 ? 'fall' : 'winter';

// Add to prompt:
`It's ${season} in the Northern Hemisphere...`
```

**Benefit**: More contextual content

**Priority**: LOW (nice-to-have)

---

## Success Criteria

### Must Have (Required)

- ✅ RAG queries use `scheduled_start_ts` year (2525)
- ✅ LLM prompts use `scheduled_start_ts` date (2525-XX-XX)
- ✅ No contradictory dates in prompts
- ✅ Generated scripts reference correct year
- ✅ All existing tests pass
- ✅ Backward compatible with existing data

### Should Have (Important)

- ✅ Clear logging of broadcast_time vs real time
- ✅ Graceful fallback for unscheduled segments
- ✅ Documentation updated
- ✅ Multi-speaker segments work correctly

### Nice to Have (Optional)

- ⚪ Timezone support
- ⚪ Time-of-day personality adjustment
- ⚪ Seasonal context awareness

---

## Timeline

| Phase | Task | Estimated Time |
|-------|------|----------------|
| 1 | Extract scheduled time | 15 minutes |
| 2 | Update script generation | 10 minutes |
| 3 | Update multi-speaker handler | 15 minutes |
| 4 | Improve prompts | 20 minutes |
| 5 | Update documentation | 10 minutes |
| **Testing** | Run all tests | 30 minutes |
| **Total** | | **~1.5 hours** |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Wrong time format | Low | Medium | Extensive testing with various dates |
| Null scheduled_start_ts | Low | Low | Fallback to new Date() |
| Timezone confusion | Low | Low | Use consistent UTC |
| LLM confused by new format | Very Low | Medium | Clear, unambiguous prompts |
| Breaking existing segments | Very Low | Low | No changes to existing data |

**Overall Risk**: LOW - Isolated changes with clear fallbacks

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review this document with team
- [ ] Backup database (optional, no schema changes)
- [ ] Verify current worker is running correctly
- [ ] Note current segment generation time (baseline)

### Implementation
- [ ] Phase 1: Extract scheduled time in handle()
- [ ] Phase 2: Update script generation call
- [ ] Phase 3: Update multi-speaker handler
- [ ] Phase 4: Improve prompt clarity
- [ ] Phase 5: Update RAG query comments

### Testing
- [ ] Test 1: Verify scheduled time is used
- [ ] Test 2: RAG query uses future year
- [ ] Test 3: Generated script references correct year
- [ ] Test 4: Multiple time zones work
- [ ] Test 5: Unscheduled segments fallback
- [ ] Test 6: Historical context alignment
- [ ] Test 7: Conversation segments
- [ ] Test 8: End-to-end broadcast

### Deployment
- [ ] Build segment-gen worker: `pnpm --filter @radio/segment-gen-worker build`
- [ ] Restart worker: `docker-compose restart segment-gen-worker`
- [ ] Monitor logs for errors
- [ ] Generate test segment
- [ ] Verify logs show correct broadcast_time

### Post-Deployment
- [ ] Monitor first 10 generated segments
- [ ] Check scripts for year references
- [ ] Verify no errors in logs
- [ ] Listen to broadcast for quality check
- [ ] Update product documentation

---

## Questions & Answers

### Q: Why not just change FUTURE_YEAR_OFFSET in .env?

**A**: The FUTURE_YEAR_OFFSET is already being used correctly by the scheduler and other components. The bug is that segment generation ignores the scheduled time (which already has the offset applied) and uses real-world current time instead. This fix ensures segment generation uses the scheduled time that was calculated with the proper offset.

**In other words**: The scheduler correctly creates `scheduled_start_ts = realTime + FUTURE_YEAR_OFFSET`, but segment generation was ignoring this and using `new Date()` instead.

### Q: Will this affect segments already in the queue?

**A**: No. The fix only affects NEW segment generation. Queued segments already have their scripts generated.

### Q: What if scheduled_start_ts is in the past?

**A**: That's fine. The code extracts the date/time components (year, month, day, hour) regardless of whether it's past or future relative to real world time.

### Q: Does this fix the conversation segments too?

**A**: Yes, Phase 3 updates `handleMultiSpeakerSegment()` with the same fix.

### Q: Will RAG find relevant content for year 2525?

**A**: That depends on your knowledge base content. If you have entries dated "2525", RAG will retrieve them. If your KB only has 2025 content, you might want to update KB entries to use the fictional timeline.

---

## Related Documentation

- [Product Vision](.claude/PRODUCT VISION.md) - Time-awareness requirement
- [Architecture](.claude/ARCHITECTURE.md) - System design
- [Segment Generation](workers/segment-gen/README.md) - Worker details
- [RAG System](packages/radio-core/src/rag/README.md) - RAG implementation

---

## Conclusion

This fix is **critical** for maintaining the immersive "year 2525" experience that defines Radio Vox Futura. The changes are minimal, isolated, and low-risk, with clear testing procedures and rollback options.

**Recommendation**: Implement immediately. The bug breaks a core product feature mentioned in the vision document.

**Next Steps**:
1. Review and approve this document
2. Implement phases 1-5 (1.5 hours)
3. Run all tests (30 minutes)
4. Deploy and monitor

Total time investment: **~2 hours** for a critical fix that restores product vision compliance.
