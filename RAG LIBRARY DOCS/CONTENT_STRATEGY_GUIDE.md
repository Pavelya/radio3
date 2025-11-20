# Radio 2525 - Content Strategy Guide
## RAG Optimization & Content Volume Planning

---

## Overview

This guide answers: **How much content do you need, and how often should you create it?**

Understanding the RAG system's technical constraints helps you create the optimal amount of content for maximum variety without dilution.

---

## Table of Contents

1. [RAG Technical Constraints](#rag-technical-constraints)
2. [Universe Documents Strategy](#universe-documents-strategy)
3. [Events Strategy](#events-strategy)
4. [Content Refresh Cycle](#content-refresh-cycle)
5. [Content Mix Recommendations](#content-mix-recommendations)
6. [Measuring Content Health](#measuring-content-health)
7. [Scaling Your Content Library](#scaling-your-content-library)

---

## RAG Technical Constraints

Understanding how RAG works helps you plan content volume.

### How Retrieval Works

**Per Segment Generation:**
1. System builds a query based on slot_type (news, culture, tech, interview)
2. Retrieves **top 12 chunks** using hybrid search:
   - 30% lexical (keyword matching)
   - 70% semantic (vector similarity)
   - Recency boost for events (recent = higher score)
3. Top 5 chunks are sent to LLM for script generation

### Chunking Math

**Universe Documents:**
- 800-word doc → ~8-10 chunks
- 1500-word doc → ~12-15 chunks
- 3000-word doc → ~20-30 chunks

**Events:**
- 400-word event → ~4-5 chunks
- 800-word event → ~8-10 chunks
- 1500-word event → ~12-15 chunks

### Retrieval Pool

**Total retrievable chunks** = All chunks from all Universe Docs + All chunks from all Events

**Reality:**
- System retrieves **top 12** from potentially thousands of chunks
- If you have 50 docs × 10 chunks = 500 chunks + 100 events × 5 chunks = 500 chunks = **1,000 total chunks**
- RAG picks best 12 (1.2% of library)

**Implication:** Quality > Quantity. Better to have 30 excellent, focused docs than 200 generic ones.

---

## Universe Documents Strategy

### Minimum Viable Library

**To avoid repetition:** At least **20-30 Universe Documents** covering core worldbuilding areas.

**Why:**
- Ensures variety in retrieval results
- Each segment generation can pull from different docs
- Reduces "same facts repeated every broadcast" problem

**Recommended minimum by category:**

| Category | Minimum Docs | Examples |
|----------|--------------|----------|
| **Locations** | 8-12 | Cities, space stations, natural wonders, transportation hubs |
| **Technology** | 6-10 | Energy systems, AI, transportation, medicine, communication |
| **Culture** | 5-8 | Social movements, art forms, religions, languages, traditions |
| **History** | 3-5 | Key historical periods, wars, discoveries, founding events |
| **Economy** | 2-4 | Currency, trade, corporations, labor systems |
| **Politics** | 3-5 | Governments, laws, treaties, factions, power structures |

**Total: 27-44 documents minimum**

### Optimal Library Size

**For smooth operation:** **50-100 Universe Documents**

**Why this range:**
- Provides excellent topic diversity
- Each document averages 10 chunks = 500-1,000 chunks in pool
- Low chance of retrieving same chunks repeatedly
- Still manageable for content team to maintain consistency

**Sweet spot: ~75 Universe Documents** (750 chunks)

### When to Stop Adding Universe Docs

**Diminishing returns begin around 150-200 documents** (1,500-2,000 chunks)

**Symptoms of too many docs:**
- Important core worldbuilding gets "buried" in retrieval
- Contradictions become hard to track
- Writers lose consistency
- Docs become too narrow/niche to be useful

**Better strategy:** Instead of doc #201, **improve/expand existing docs**
- Update older docs with fresh details
- Add sections to underdeveloped docs
- Merge related docs that overlap

### Document Distribution by Topic Depth

**Core topics (must-have worldbuilding):** 8-15 docs each
- Example: "Mars" might have 12 docs covering:
  - Martian Canals (infrastructure)
  - Mars Independence Movement (politics)
  - Martian Cuisine (culture)
  - Olympus City (location)
  - Red Planet Mining Corp (economy)
  - Mars-Earth Relations (politics)
  - Martian Gothic Architecture (culture)
  - Deimos Shipyards (technology/location)
  - Martian Water Crisis of 2510 (history)
  - Children of the Red Soil (social movement)
  - etc.

**Secondary topics:** 3-6 docs each
- Example: "Asteroid Belt" might have 5 docs

**Tertiary topics:** 1-2 docs each
- Example: "Mercury Mining Outposts" - 1 doc

**Guideline:** If a topic appears in 10+ events, it deserves 3+ Universe Docs

---

## Events Strategy

Events are fundamentally different from Universe Docs—they're time-sensitive and meant to feel current.

### Events Are Consumable Content

**Key principle:** Events have a **relevance window**

**Recency boost effect:**
- Events from last 7 days: High boost (1.5-2.0× score multiplier)
- Events from 2-4 weeks ago: Medium boost (1.2-1.5×)
- Events from 1-3 months ago: Low boost (1.0-1.2×)
- Events older than 3 months: No boost (1.0×)

**Implication:** Old events don't disappear, but fade into "historical context" rather than "current news"

### Minimum Event Cadence

**To maintain "current news" feel:** At least **3-5 events per week**

**Why:**
- News segments air multiple times per day
- Need variety to avoid repetition within same day
- Creates sense of ongoing world activity

**Minimum: 12-20 events per month**

### Optimal Event Cadence

**For vibrant, dynamic world:** **5-10 events per week**

**Why:**
- Provides multiple storylines per week
- Different importance levels (some major, some minor)
- Enough variety that morning news ≠ evening news
- Supports ongoing narrative arcs (protests → resolution, discovery → reactions)

**Optimal: 20-40 events per month**

### When to Create Events in Clusters

**Major developments deserve event clusters:**

**Example: Ganymede Discovery**
- Jan 15: "Discovery Announcement" (Importance: 9)
- Jan 17: "Scientific Community Reacts" (Importance: 6)
- Jan 18: "Religious Leaders Respond" (Importance: 5)
- Jan 20: "Technical Details Released" (Importance: 5)
- Jan 22: "Europa Collective Announces Protection Zone" (Importance: 7)
- Jan 25: "First Submersible Deployed" (Importance: 6)

**Result:** Major story feels ongoing, not just a one-day blip

### Event Lifespan & Archiving

**You don't need to delete old events** (they're historical record), but understand their role changes:

**Week 1 (Current News):**
- High recency boost
- Referenced frequently in news segments
- Treated as "breaking" or "developing"

**Weeks 2-4 (Recent History):**
- Medium recency boost
- Referenced as "last week's discovery"
- Background context for new developments

**Months 2-6 (Context):**
- Low/no recency boost
- Referenced occasionally for context
- Used in historical retrospectives

**6+ Months (Archive):**
- No recency boost
- Only retrieved if highly semantically relevant
- Acts like Universe Doc content (timeless context)

**Strategy:** Don't delete old events, but understand they naturally "fade" from daily rotation

### Event Diversity by Importance

**Don't make everything Importance: 9-10**

**Recommended distribution per month:**

| Importance | Count/Month | Examples |
|------------|-------------|----------|
| **9-10** (Historic) | 1-2 | Major discoveries, wars, first contact, revolutionary inventions |
| **7-8** (Major) | 3-5 | Policy changes, significant protests, breakthrough tech, treaties |
| **5-6** (Significant) | 8-12 | Elections, corporate mergers, cultural movements, local crises |
| **3-4** (Noteworthy) | 10-15 | Product launches, local politics, awards, medium protests |
| **1-2** (Minor) | 5-10 | Community events, minor incidents, routine announcements |

**Total: 27-44 events per month (optimal range)**

**Why variety matters:**
- All Importance: 9 = "world always ending" fatigue
- Mix of major + minor = lived-in world with varying scales
- Minor events provide texture and normalcy

---

## Content Refresh Cycle

### Universe Documents: Evergreen + Occasional Updates

**Primary creation phase: Months 1-3**
- Build core library (50-75 docs)
- Cover essential worldbuilding
- Establish consistency

**Ongoing maintenance: Monthly**
- Add 2-5 new docs per month (filling gaps)
- Update/expand 1-3 existing docs per month
- Refresh docs referenced in recent events

**Example refresh trigger:**
- Event: "Martian Canal System Expanded with New Southern Branch"
- Action: Update Universe Doc "The Martian Canals" to reflect expansion

**Universe Docs don't expire—they evolve**

### Events: Weekly Cadence

**Weekly event creation schedule:**

**Week 1-4 (Launch Phase):**
- Create 5-10 events per week
- Build initial event library (20-40 events)
- Cover diverse topics and importance levels

**Ongoing (Steady State):**
- Create 5-10 events per week
- Mix of standalone events + narrative arcs
- Replace "aged" content naturally (old events fade, new ones take prominence)

**Monthly review:**
- Check last 30 days: Are there 20-40 events?
- Check importance distribution: Too many 9s? Not enough minor events?
- Check topic diversity: Too much Mars, not enough Earth?

### Natural Content Cycling

**Events have built-in lifecycle:**
- Week 1: Current news (high retrieval)
- Week 2-4: Recent context (medium retrieval)
- Month 2+: Historical background (low retrieval)

**You don't "replace" events—you add new ones, and old ones naturally fade from daily rotation.**

**Storage strategy:**
- Keep all events indefinitely (they're your world history)
- No need to delete old events (recency boost handles relevance)
- Exception: If you want to retcon/remove something, delete it

---

## Content Mix Recommendations

### Launch Phase (Month 1)

**Goal:** Establish core worldbuilding quickly

**Universe Documents:**
- Week 1: Create 10-15 core location docs
- Week 2: Create 8-12 technology/culture docs
- Week 3: Create 5-8 history/politics docs
- Week 4: Create 5-10 economy/society docs

**Total Month 1: 28-45 Universe Docs**

**Events:**
- Week 1: Create 5-8 events (mix of importance levels)
- Week 2: Create 5-8 events
- Week 3: Create 5-8 events
- Week 4: Create 5-8 events

**Total Month 1: 20-32 Events**

**By end of Month 1:**
- 48-77 total documents
- ~500-800 chunks in RAG pool
- Enough variety for non-repetitive broadcasts

### Growth Phase (Months 2-4)

**Goal:** Fill gaps, add depth, create ongoing storylines

**Universe Documents:**
- Add 3-5 new docs per month
- Update 2-3 existing docs per month
- Focus on areas that feel underdeveloped

**Events:**
- Maintain 5-10 events per week
- ~20-40 new events per month
- Develop narrative arcs (multi-event storylines)

**By end of Month 4:**
- 60-95 Universe Docs
- ~100-160 total events created (but only last ~40 are "current")
- ~700-1,100 chunks in RAG pool

### Steady State (Month 5+)

**Goal:** Maintain freshness, respond to listener feedback, evolve world

**Universe Documents:**
- Add 2-3 new docs per month (as needed)
- Update 1-2 existing docs per month
- Focus on quality over quantity

**Events:**
- Maintain 5-10 events per week
- Create event arcs that span weeks/months
- Respond to what's working (if Mars content is popular, create more Mars events)

**Steady State Library:**
- 75-125 Universe Docs (stable)
- 20-40 current events (rolling window)
- 800-1,500 chunks in RAG pool

---

## Measuring Content Health

### RAG Coverage Metrics

**Check these regularly:**

#### 1. Slot Type Coverage

Each slot_type should have adequate content:

| Slot Type | Recommended Universe Docs | Recommended Current Events |
|-----------|---------------------------|----------------------------|
| **news** | 15-25 (politics, economy, crisis) | 15-25 (last 30 days) |
| **culture** | 15-25 (art, music, social movements) | 8-15 (last 30 days) |
| **tech** | 12-20 (innovations, infrastructure) | 10-20 (last 30 days) |
| **interview** | 20-30 (people, organizations, movements) | 5-10 (recent newsmakers) |
| **history** | 10-15 (past events, context) | 5-10 (historical anniversaries) |

**How to check:**
- Listen to broadcasts: Are news segments repetitive? → Need more news content
- Are culture segments always about same topics? → Need more culture content

#### 2. Geographic Diversity

**Don't let one location dominate:**

| Location Type | Minimum Docs | Ideal Docs |
|---------------|--------------|------------|
| Earth locations | 10-15 | 20-30 |
| Mars | 8-12 | 15-20 |
| Luna (Moon) | 5-8 | 8-12 |
| Jovian system (Europa, Ganymede, etc.) | 5-8 | 10-15 |
| Other (Saturn, Belt, etc.) | 5-10 | 10-15 |

**Warning sign:** If 50%+ of events are about one location, diversify

#### 3. Content Freshness

**Events age distribution (last 90 days):**
- Last 7 days: 5-10 events (current)
- Days 8-30: 15-30 events (recent)
- Days 31-90: 30-60 events (context)

**If last 7 days has < 5 events:** You're falling behind, increase cadence

**If last 7 days has > 15 events:** Possible content burnout, might be creating too much

#### 4. Importance Balance

**Check last 30 days of events:**
- If avg importance > 7: "World always ending" problem—add minor events
- If avg importance < 4: "Nothing matters" problem—add impactful events
- **Ideal avg importance: 5-6**

### Retrieval Analytics (Future Feature)

**Coming soon to admin dashboard:**
- Which docs/events are retrieved most often?
- Which slot_types have low retrieval diversity?
- Which time periods have content gaps?

**For now, manual check:**
- Listen to broadcasts across different times of day
- Note repetitive facts/topics
- Create content to fill those gaps

---

## Scaling Your Content Library

### Small Team (1-2 Writers)

**Sustainable cadence:**
- **Universe Docs:** 2-3 per week during launch, 1-2 per week steady state
- **Events:** 3-5 per week
- **Total:** 5-8 content pieces per week

**Result:**
- Month 1: ~20-35 pieces
- Month 2: ~20-35 pieces
- Month 3: ~20-35 pieces
- **After 3 months: 60-105 total pieces** (sufficient for launch)

**Recommended focus:**
- Month 1: Core worldbuilding (Universe Docs)
- Month 2: Balance (50/50 Universe Docs and Events)
- Month 3+: Event-focused (70% Events, 30% Universe Docs)

### Medium Team (3-5 Writers)

**Sustainable cadence:**
- **Universe Docs:** 3-5 per week during launch, 2-3 per week steady state
- **Events:** 5-10 per week
- **Total:** 8-15 content pieces per week

**Result:**
- Month 1: ~35-60 pieces
- Month 2: ~30-50 pieces
- Month 3: ~25-45 pieces
- **After 3 months: 90-155 total pieces** (excellent library)

**Recommended focus:**
- Writers can specialize: e.g., one focuses on Mars, one on Earth, one on culture, one on tech

### Large Team (6+ Writers)

**Sustainable cadence:**
- **Universe Docs:** 5-10 per week during launch, 2-4 per week steady state
- **Events:** 10-15 per week
- **Total:** 15-25 content pieces per week

**Result:**
- Month 1: ~60-100 pieces
- **After Month 1: Already at optimal library size**

**Risk: Content bloat**
- With large team, watch for:
  - Contradictions between writers
  - Overlapping/redundant docs
  - Too many niche topics diluting core worldbuilding

**Solution:**
- Assign clear domains to each writer
- Regular consistency reviews
- Content editor role to maintain coherence

---

## Content Strategy by Broadcast Phase

### Pre-Launch (2-4 weeks before broadcast)

**Goal:** Build minimum viable library

**Must-have:**
- 25-40 Universe Docs (core worldbuilding)
- 10-20 Events (seeded history)

**Why this works:**
- ~300-500 chunks in RAG pool
- Enough variety for first week of broadcasts
- Can expand during live operation

**Writer focus:**
- Quality over quantity
- Cover essential topics
- Establish tone and style

### Launch Week

**Goal:** Support daily broadcasts, gather feedback

**Universe Docs:**
- Add 3-5 new docs based on gaps identified in broadcasts

**Events:**
- Create 5-10 events per week
- Focus on current/recent timeframe (make world feel active)

**Listen actively:**
- Are DJs repeating same facts? → Need more content
- Are certain topics never mentioned? → Need docs on those topics
- Do transitions feel awkward? → Might be contradictory content

### Weeks 2-4

**Goal:** Rapid expansion to optimal library

**Universe Docs:**
- Add 3-5 per week
- Target: 50-75 total by end of Week 4

**Events:**
- Maintain 5-10 per week
- Begin developing multi-event story arcs

### Month 2+

**Goal:** Steady state operation

**Universe Docs:**
- Slow to 1-3 per week (filling gaps, updating existing)
- Focus shifts from creation to maintenance

**Events:**
- Maintain 5-10 per week
- This becomes primary content creation activity

---

## Quick Reference

### Absolute Minimums (To Avoid Repetition)

- **Universe Docs:** 25-30
- **Current Events (last 30 days):** 15-20
- **New Events per week:** 3-5

### Recommended Targets (Smooth Operation)

- **Universe Docs:** 50-100
- **Current Events (last 30 days):** 20-40
- **New Events per week:** 5-10

### When to Stop Adding More

- **Universe Docs:** 150-200 (diminishing returns)
- **Events:** Never stop (but maintain 5-10/week cadence, not more)

### Content Health Checklist (Weekly)

- [ ] Created 5-10 new events this week
- [ ] Events cover diverse topics (not all about same location/theme)
- [ ] Events have varied importance (mix of major + minor)
- [ ] Added 1-3 Universe Docs (during growth phase)
- [ ] Updated 0-1 existing Universe Docs (as needed)
- [ ] Listened to broadcasts—any repetitive content?
- [ ] Geographic diversity maintained (not all Mars/Earth/etc.)

### Warning Signs

**🚨 Content is too sparse:**
- DJs repeat same facts across segments
- Same events referenced all day
- Lack of geographic/topical variety

**Fix:** Increase content creation pace temporarily

**🚨 Content is too diluted:**
- Core worldbuilding never gets mentioned
- Retrieval pulls random niche docs
- World feels inconsistent

**Fix:** Improve existing docs rather than creating new ones, merge overlapping docs

**🚨 Events feel stale:**
- News segments reference week-old events as "current"
- Lack of sense of progression

**Fix:** Increase event creation pace to 5-10/week

---

## Example Content Calendar (Month 1)

### Week 1: Foundation
- **Universe Docs:** 10 (core locations, key tech, major factions)
- **Events:** 5 (mix importance 3-8, diverse topics)
- **Total:** 15 pieces

### Week 2: Expansion
- **Universe Docs:** 8 (culture, history, economy)
- **Events:** 7 (including first multi-event arc)
- **Total:** 15 pieces

### Week 3: Depth
- **Universe Docs:** 6 (filling identified gaps from broadcasts)
- **Events:** 8 (continuing arcs, adding variety)
- **Total:** 14 pieces

### Week 4: Balance
- **Universe Docs:** 6 (refinement, updates)
- **Events:** 10 (steady cadence established)
- **Total:** 16 pieces

**Month 1 Total:**
- 30 Universe Docs
- 30 Events
- ~400-500 chunks in RAG pool
- **Ready for sustainable operation**

---

## Final Recommendations

### For New Radio 2525 Stations

**Week 0 (Pre-launch):**
- Create 20-30 Universe Docs
- Create 10-15 seed Events
- **Total: 30-45 pieces before launch**

**Month 1 (Launch + Growth):**
- Add 20-30 more Universe Docs
- Create 20-40 Events (5-10/week)
- **Total library: 70-115 pieces**

**Month 2+ (Steady State):**
- Universe Docs: 50-100 (slow growth)
- Events: 5-10 per week (ongoing)
- **Focus: Quality, consistency, responsiveness to feedback**

### For Established Stations

**Audit current library:**
- Count Universe Docs by category
- Check event distribution (last 7/30/90 days)
- Listen for repetition

**If < 50 Universe Docs:**
- Increase Universe Doc creation to 3-5/week until you hit 50-75

**If < 15 events in last 30 days:**
- Increase event creation to 5-10/week

**If 100+ Universe Docs:**
- Slow Universe Doc creation
- Focus on improving/updating existing docs
- Maintain event cadence

---

**Remember:** RAG pulls top 12 chunks per segment. Your goal isn't infinite content—it's the right amount of excellent, diverse content that makes every broadcast feel fresh and coherent.

**Quality × Consistency × Variety = Great Radio**

---

**Version 1.0 | Last Updated: January 17, 2525 (Real: 2025)**
