# Task Execution Order

**Last Updated:** 2025-11-02
**Status:** Ready for implementation

This document defines the correct order to execute all tasks for AI Radio 2525, including dependencies and prerequisites.

---

## Summary

- **Total Tasks:** 70 (63 original + 7 new - 6 removed duplicates = 64 unique tasks)
- **Estimated Total Time:** ~300-400 hours
- **Team Size Recommendation:** 2-3 developers
- **Timeline Estimate:** 3-4 months (part-time) or 6-8 weeks (full-time)

---

## Phase 1: Data Foundation (D1-D10)
**Goal:** Create all database tables, migrations, and seed data
**Estimated Time:** 15-20 hours
**Prerequisites:** None (start here)

### Execution Sequence:
```
D1: Segments Table Migration (2h)
  ↓
D2: Jobs Table Migration (2h)
  ↓
D3: Assets Table Migration (2h)
  ↓
D4: Knowledge Base Tables Migration (3h)
  ↓
D5: Segment State Machine Trigger (1h)
  ↓
D6: Job Queue Enqueue Function (1h)
  ↓
D7: Job Queue Claim Function (2h)
  ↓
D8: Job Complete and Fail Functions (1h)
  ↓
D9: Programs & Format Clocks Migration (NEW - 3h)
  ↓
D10: Database Seeding & Sample Data (NEW - 4h)
```

**Deliverables:**
- All database tables created
- Job queue system functional
- Sample data loaded (3 DJs, 3 programs, 3 format clocks, universe lore, events)

**Validation:**
```bash
psql $DATABASE_URL -c "\dt"  # List all tables
pnpm seed  # Run seeding script
```

---

## Phase 2: RAG System (R1-R6)
**Goal:** Build knowledge base indexing and retrieval system
**Estimated Time:** 25-30 hours
**Prerequisites:** D4 complete (KB tables exist)

### Execution Sequence:
```
R1: Text Chunking Service - Core Logic (4h)
  ↓
R2: Text Chunking - Language Detection (2h)
  ↓
R3: Embedding Service - API Client (3h)
  ↓
R4: Embedder Worker - Main Loop (4h)
  ↓
R5: Embedder Worker - Job Handler (5h)
  ↓
R6: Retrieval Service - Hybrid Search (6h)
```

**Deliverables:**
- Text chunking service (300-800 tokens)
- Embedder worker that indexes universe docs and events
- Retrieval service with hybrid search (semantic + keyword)

**Validation:**
```bash
# Index sample data
curl -X POST http://localhost:8000/admin/index-all

# Test retrieval
curl -X POST http://localhost:8000/rag/retrieve \
  -d '{"query":"Mars Colony", "top_k":5}'
```

---

## Phase 3: Generation Pipeline (G1-G8)
**Goal:** Implement TTS, LLM, and audio processing
**Estimated Time:** 35-40 hours
**Prerequisites:** D1-D8 complete, R6 complete (for G5)

### Execution Sequence:
```
┌─ G1: Piper TTS HTTP Server (5h)
│    ↓
│  G2: Piper TTS Cache Layer (3h)
│
└─ G3: Claude LLM Service (3h)
     ↓
   G4: Script Generation Core Logic (NEW - 6h)
     ↓
   G5: Segment Gen Worker - RAG Integration (6h) [requires R6]
     ↓
   G6: Segment Gen Worker - TTS Integration (5h) [requires G2]
     ↓
   G7: Audio Mastering Worker - Normalization (6h)
     ↓
   G8: Audio Mastering - Deduplication (3h)
```

**Deliverables:**
- Piper TTS service running on port 5002
- Script generation with DJ personality and RAG context
- Complete segment generation pipeline (queued → ready)
- Normalized audio files

**Validation:**
```bash
# Test TTS
curl -X POST http://localhost:5002/synthesize \
  -d '{"text":"Hello from the future","model":"en_US-lessac-medium"}'

# Generate test segment
curl -X POST http://localhost:8000/admin/segments \
  -d '{"program_id":"prog-001","slot_type":"news"}'

# Check segment state progression
watch -n 5 'psql $DATABASE_URL -c "SELECT id, state FROM segments ORDER BY created_at DESC LIMIT 5;"'
```

---

## Phase 4: Admin CMS (A1-A12)
**Goal:** Build admin interface for content management
**Estimated Time:** 45-50 hours
**Prerequisites:** D1-D10 complete (all tables exist)

### Execution Sequence:
```
A1: Admin API - Authentication & Setup (6h)
  ↓
├─ A2: Content Management - Universe Docs (5h)
├─ A3: Content Management - Events (5h)
└─ A4: DJ Management (4h)
     ↓
   A9: Program Management UI (NEW - 5h) [requires D9]
     ↓
   A10: Format Clock Editor UI (NEW - 6h)
     ↓
   A11: Broadcast Schedule/Timetable Manager UI (NEW - 6h)
     ↓
   A5: Segment Queue Management (4h)
     ↓
├─ A6: Monitoring Dashboard (5h)
├─ A7: Audio Preview & Player (4h)
└─ A8: Dead Letter Queue Review (3h)
```

**Additional (after Music tier):**
```
A12: Music Library Management UI (NEW - 5h) [after M1]
```

**Deliverables:**
- Admin authentication (username/password)
- Universe docs CRUD
- Events CRUD
- DJ management
- Program management
- Format clock editor
- Broadcast schedule manager
- Segment queue dashboard
- Monitoring and audio preview

**Validation:**
- Log in to admin at http://localhost:3001
- Create universe document
- Create event
- Create DJ
- Create program
- Edit format clock
- View segment queue

---

## Phase 5: Playout System (P1-P6)
**Goal:** Broadcasting and scheduling
**Estimated Time:** 30-35 hours
**Prerequisites:** G1-G8 complete (segments can be generated), D9 complete (programs exist)

### Execution Sequence:
```
P1: Liquidsoap Configuration - Basic Setup (6h)
  ↓
P2: Playout API Endpoints (5h)
  ↓
P3: Scheduler Worker - Schedule Generation (8h) [requires D9]
  ↓
P4: Liquidsoap - Dead Air Detection (4h)
  ↓
P5: Priority Segment Injection (4h)
  ↓
P6: Schedule Visualization & Analytics (5h)
```

**Deliverables:**
- Liquidsoap broadcasting to Icecast
- Playout API serving segment URLs
- Scheduler generating hourly segments
- Dead air detection and recovery
- Priority/breaking news injection
- Schedule visualization

**Validation:**
```bash
# Start Liquidsoap
liquidsoap apps/playout/radio.liq

# Check stream
curl http://localhost:8000/radio.opus

# View schedule
curl http://localhost:8000/playout/schedule
```

---

## Phase 6: Public Frontend (F1-F4)
**Goal:** Public-facing radio player
**Estimated Time:** 20-25 hours
**Prerequisites:** P1-P6 complete (streaming active)

### Execution Sequence:
```
F1: Public Player - Basic Setup (6h)
  ↓
F2: Program Schedule Display (5h)
  ↓
F3: About & Info Pages (4h)
  ↓
F4: PWA & Mobile Optimization (6h)
```

**Deliverables:**
- Public player at http://localhost:3000
- Now playing display
- Program schedule
- About pages with world lore
- PWA for mobile

**Validation:**
- Open http://localhost:3000
- Play stream
- View schedule
- Add to home screen (mobile)

---

## Phase 7: Music & Multi-Speaker (M1-M4, S1-S3)
**Goal:** Music integration and multi-voice content
**Estimated Time:** 35-40 hours
**Prerequisites:** D1-D10, G1-G8 complete

### Execution Sequence:

**Music Track:**
```
M1: Music Library & Database Schema (5h)
  ↓
A12: Music Library Management UI (NEW - 5h)
  ↓
M2: Jingles & Sound Effects System (5h)
  ↓
M3: Music Scheduling & Liquidsoap Integration (8h)
  ↓
M4: Audio Ducking & Professional Mixing (7h)
```

**Multi-Speaker Track (parallel):**
```
S1: Multi-Speaker Script Generation (6h) [requires G4]
  ↓
S2: Multi-Voice TTS Synthesis (7h) [requires G4, G6]
  ↓
S3: Interview & Panel Format Templates (5h)
```

**Deliverables:**
- Music library with metadata
- Music upload UI
- Jingles and SFX integration
- Music scheduling in Liquidsoap
- Professional audio mixing
- Multi-speaker segments (interviews, panels)

---

## Phase 8: Streaming Platforms (ST1-ST3)
**Goal:** Multi-platform streaming (YouTube, etc.)
**Estimated Time:** 20-25 hours
**Prerequisites:** P1-P6 complete

### Execution Sequence:
```
ST1: YouTube Live Integration (8h)
  ↓
ST2: Multi-Platform Broadcasting (8h)
  ↓
ST3: Stream Health Monitoring & Auto-Recovery (6h)
```

**Deliverables:**
- YouTube Live stream
- Multi-platform management
- Health monitoring and auto-recovery

---

## Phase 9: Advanced Features (L1-L3, E1-E2)
**Goal:** Style consistency and real-time events
**Estimated Time:** 25-30 hours
**Prerequisites:** Full system operational

### Execution Sequence:

**Lore & Tone:**
```
L1: Sci-Fi Style Guide & Prompt Engineering (6h)
  ↓
L2: World Consistency Checker (8h)
  ↓
L3: Optimism/Realism Balance Monitor (6h)
```

**Real-Time Events (parallel):**
```
E1: Breaking News & Priority Content System (6h)
  ↓
E2: Dynamic Content Updates & Live Data Integration (8h)
```

**Deliverables:**
- Style guide enforcement
- Consistency checking
- Tone monitoring
- Breaking news system
- Live data integration

---

## Phase 10: Integration & Deployment (I1-I3, N1-N3)
**Goal:** Production readiness
**Estimated Time:** 30-35 hours
**Prerequisites:** All features complete

### Execution Sequence:
```
I1: End-to-End Integration Tests (10h)
  ↓
I2: Deployment & Orchestration (8h)
  ↓
I3: Monitoring & Observability (8h)
  ↓
N1: Native Installation Scripts (3h)
  ↓
N2: systemd Service Configuration (3h)
  ↓
N3: Production Deployment Guide & Documentation (5h)
```

**Deliverables:**
- E2E test suite
- Deployment automation
- Monitoring dashboards
- Installation scripts
- systemd services
- Production documentation

---

## Quick Reference: Task Dependencies

| Task | Depends On | Blocks |
|------|------------|--------|
| D1 | None | D2, D5 |
| D2 | D1 | D6 |
| D9 | D8 | D10, A9, P3 |
| G4 | G3, R6 | G5, G6, S1, S2 |
| A9 | A1, A4, D9 | A10 |
| A10 | A9 | A11 |
| A11 | A10 | P3 |
| P3 | P2, D9 | P4 |

---

## Critical Path

The longest path through the dependency graph (determines minimum time):

```
D1 → D2 → D3 → D4 → R1 → R2 → R3 → R4 → R5 → R6 →
D5 → D6 → D7 → D8 → D9 → D10 →
G3 → G4 → G5 → G6 → G7 → G8 →
A1 → A4 → A9 → A10 → A11 →
P1 → P2 → P3 → P4 → P5 → P6 →
F1 → F2 → F3 → F4 →
I1 → I2 → I3 → N1 → N2 → N3
```

**Critical Path Duration:** ~180-200 hours minimum

---

## Parallelization Opportunities

With 3 developers, these tasks can run in parallel:

**Week 1-2:**
- Dev 1: D1-D10 (Data layer)
- Dev 2: Setup infrastructure, documentation
- Dev 3: R1-R3 (RAG foundation)

**Week 3-4:**
- Dev 1: G1-G4 (Generation core)
- Dev 2: R4-R6 (RAG completion)
- Dev 3: A1-A4 (Admin foundation)

**Week 5-6:**
- Dev 1: G5-G8 (Generation pipeline)
- Dev 2: A9-A11 (Program management)
- Dev 3: P1-P3 (Playout foundation)

And so on...

---

## Daily Standup Checklist

Use this to track progress:

**Data Tier:** ☐ D1 ☐ D2 ☐ D3 ☐ D4 ☐ D5 ☐ D6 ☐ D7 ☐ D8 ☐ D9 ☐ D10

**RAG Tier:** ☐ R1 ☐ R2 ☐ R3 ☐ R4 ☐ R5 ☐ R6

**Generation Tier:** ☐ G1 ☐ G2 ☐ G3 ☐ G4 ☐ G5 ☐ G6 ☐ G7 ☐ G8

**Admin Tier:** ☐ A1 ☐ A2 ☐ A3 ☐ A4 ☐ A9 ☐ A10 ☐ A11 ☐ A5 ☐ A6 ☐ A7 ☐ A8 ☐ A12

**Playout Tier:** ☐ P1 ☐ P2 ☐ P3 ☐ P4 ☐ P5 ☐ P6

**Frontend Tier:** ☐ F1 ☐ F2 ☐ F3 ☐ F4

**Music Tier:** ☐ M1 ☐ M2 ☐ M3 ☐ M4

**Multi-Speaker Tier:** ☐ S1 ☐ S2 ☐ S3

**Streaming Tier:** ☐ ST1 ☐ ST2 ☐ ST3

**Lore & Tone Tier:** ☐ L1 ☐ L2 ☐ L3

**Real-Time Events Tier:** ☐ E1 ☐ E2

**Integration Tier:** ☐ I1 ☐ I2 ☐ I3

**Deployment Tier:** ☐ N1 ☐ N2 ☐ N3

---

## Notes

- **Start with Phase 1** (Data tier) - nothing else can proceed without it
- **G4 is critical** - blocks segment generation, must be completed early
- **A9-A11 chain** - program management blocks scheduler
- **Test frequently** - don't wait until integration phase
- **Seed data early** - having realistic data helps development
