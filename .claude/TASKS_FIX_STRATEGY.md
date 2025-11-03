# TASKS.md Cleanup Strategy

## Issues Found

### 1. Duplicate Task IDs
- **P1** at lines 11389 (Liquidsoap Config) and 23409 (YouTube Live)
- **P2** at lines 11818 (Playout API) and 24301 (Multi-Platform Broadcasting)
- **P3** THREE times: 12215 (Scheduler), 24861 (Scheduler duplicate), 26429 (Stream Health)
- **P4** at lines 12711 and 25357 (both Dead Air Detection - identical)
- **P6** at lines 13031 and 26038 (both Schedule Visualization - identical)

### 2. Missing Tasks
- **G4**: Script Generation Core Logic (referenced in S2 but doesn't exist)
- **D9**: Programs & Format Clocks Migration (currently buried in P3)
- **D10**: Database Seeding & Sample Data
- **A9**: Program Management UI
- **A10**: Format Clock Editor UI
- **A11**: Broadcast Schedule/Timetable Manager UI
- **A12**: Music Library Management UI

### 3. Phase 0 References
- Multiple tasks reference "Phase 0 complete (F1-F10)" which is outdated
- Need to remove all Phase 0 references

### 4. Structural Issues
- Programs/format_clocks migration is in P3 but should be in Data tier
- Creates circular dependency

## Fix Plan

### Step 1: Rename Duplicate Streaming Tasks
The second set of P1-P6 tasks are all related to streaming platforms. Rename them to ST (Streaming) tier:

- Line 23409: P1 (YouTube Live) → **ST1: YouTube Live Integration**
- Line 24301: P2 (Multi-Platform) → **ST2: Multi-Platform Broadcasting**
- Line 24861: P3 (Scheduler duplicate) → **DELETE** (exact duplicate of line 12215)
- Line 26429: P3 (Stream Health) → **ST3: Stream Health Monitoring & Auto-Recovery**
- Line 25357: P4 (Dead Air duplicate) → **DELETE** (exact duplicate of line 12711)
- Line 25677: P5 (Priority Injection) → **Keep as P5** (only occurrence)
- Line 26038: P6 (Schedule Viz duplicate) → **DELETE** (exact duplicate of line 13031)

### Step 2: Extract Programs Migration
Extract programs/format_clocks migration from P3 (line 12215) and create as new D9 task

### Step 3: Create Missing Tasks
Insert new tasks in correct tier positions:
- After G3: Insert **G4: Script Generation Core Logic**
- After D8: Insert **D9: Programs & Format Clocks Migration** (extracted from P3)
- After D9: Insert **D10: Database Seeding & Sample Data**
- After A8: Insert **A9: Program Management UI**
- After A9: Insert **A10: Format Clock Editor UI**
- After A10: Insert **A11: Broadcast Schedule/Timetable Manager UI**
- After M1: Insert **A12: Music Library Management UI**

### Step 4: Remove Phase 0 References
Search and replace in prerequisite sections:
- "Phase 0 complete (F1-F10)" → "D1-D10 complete (Data tier)"
- Or adjust based on actual prerequisites

### Step 5: Update Prerequisites
Update prerequisite chains:
- G5, G6 now depend on G4 (not G3)
- S2 now correctly references G4
- P3 no longer includes programs migration (that's D9)
- A9-A11 form a chain: A4 → A9 → A10 → A11
- All tasks depending on "programs table" now depend on D9

## New Task Order

### Data Tier (D1-D10)
1. D1: Segments Table
2. D2: Jobs Table
3. D3: Assets Table
4. D4: Knowledge Base Tables
5. D5: Segment State Machine Trigger
6. D6: Job Queue Enqueue Function
7. D7: Job Queue Claim Function
8. D8: Job Complete and Fail Functions
9. **D9: Programs & Format Clocks Migration** (NEW - extracted from P3)
10. **D10: Database Seeding & Sample Data** (NEW)

### Generation Tier (G1-G8)
1. G1: Piper TTS HTTP Server
2. G2: Piper TTS Cache Layer
3. G3: LLM Service - Claude Client
4. **G4: Script Generation Core Logic** (NEW)
5. G5: Segment Generation Worker - RAG Integration
6. G6: Segment Generation Worker - TTS Integration
7. G7: Audio Mastering Worker - Normalization
8. G8: Audio Mastering - Deduplication

### Admin Tier (A1-A12)
1. A1: Admin API - Authentication & Setup
2. A2: Content Management - Universe Docs
3. A3: Content Management - Events
4. A4: DJ Management
5. **A9: Program Management UI** (NEW)
6. **A10: Format Clock Editor UI** (NEW)
7. **A11: Broadcast Schedule/Timetable Manager UI** (NEW)
8. A5: Segment Queue Management
9. A6: Monitoring Dashboard
10. A7: Audio Preview & Player
11. A8: Dead Letter Queue Review
12. **A12: Music Library Management UI** (NEW - goes after M1)

### Playout Tier (P1-P5) - cleaned up
1. P1: Liquidsoap Configuration - Basic Setup
2. P2: Playout API Endpoints
3. P3: Scheduler Worker - Schedule Generation (programs migration removed)
4. P4: Liquidsoap - Dead Air Detection
5. P5: Priority Segment Injection (moved from duplicate section)
6. P6: Schedule Visualization & Analytics

### Streaming Tier (ST1-ST3) - NEW tier name
1. **ST1: YouTube Live Integration** (was P1 duplicate)
2. **ST2: Multi-Platform Broadcasting** (was P2 duplicate)
3. **ST3: Stream Health Monitoring & Auto-Recovery** (was P3 #3)

## Files to Create
1. `.claude/TASKS.md` - Cleaned version
2. `.claude/EXECUTION_ORDER.md` - Proper execution sequence with dependencies
3. `.claude/TASKS_FIX_STRATEGY.md` - This file

## Files to Keep
- `.claude/TASKS_ORIGINAL_BACKUP.md` - Original file backup
- `.claude/TASKS_BACKUP.md` - User's backup (don't touch)
