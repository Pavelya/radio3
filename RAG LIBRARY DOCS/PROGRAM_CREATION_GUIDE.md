# Radio 2525 - Program Creation Guide
## Building Shows That Honor the Great Tradition

---

## Standing on the Shoulders of Giants

Before you create a program for Radio 2525, remember: you're not just making a "show format." You're designing a vehicle for great science fiction storytelling.

The literary tradition we honor—Le Guin's anthropological depth, Asimov's problem-solving optimism, Clarke's cosmic wonder, Butler's unflinching examination, Gibson's lived-in texture—doesn't live in Universe Docs alone. **It lives in how programs structure time, select content, and frame conversations.**

A well-designed program is like a well-structured novel: it has pacing, rhythm, thematic coherence, and a voice. It knows when to zoom in (intimate interview) and when to zoom out (big-picture news). It understands that **context is storytelling**.

When NPR's "All Things Considered" transitions from hard news to a feature on climate adaptation, that's worldbuilding. When a talk show host frames a question, that's character voice. When a format clock balances information density with breathing room, that's pacing.

**You're not building a radio show—you're building a narrative architecture that science fiction will inhabit for hours, days, months.**

That's the bar. That's the tradition.

---

## What Is a Program?

In Radio 2525, a **program** is a scheduled show with:
- **One or more DJs** (hosts/personalities)
- **A format clock** (hourly structure template)
- **A broadcast schedule** (when it airs)
- **Editorial identity** (genre, tone, purpose)

Programs are the **primary organizing unit** of the station. They determine:
- **What content gets created** (news, culture, interviews, tech, music)
- **How that content is framed** (serious analysis, conversational exploration, debate)
- **Who presents it** (which DJ voices and personalities)
- **When it airs** (morning commute, afternoon deep-dive, late-night reflection)

Every hour of Radio 2525 broadcast is an instance of a program. Programs repeat across days and weeks, creating familiar rhythms and expectations for listeners.

---

## How Programs Work: The Technical Flow

Understanding the technical flow helps you design better programs.

### 1. Program Definition (You Create This)
```
Program: "Morning Frontier"
├── DJs: Zara Nova (host)
├── Format Clock: "Standard News Hour"
├── Genre: News
├── Preferred Time: Morning (6am-12pm)
├── Broadcast Schedule: Mon-Fri, 6:00-10:00
└── Active: Yes
```

### 2. Format Clock (Hourly Template)
```
"Standard News Hour" (60 minutes total):
├── Station ID (30 sec)
├── News (15 min)
├── Music (3 min)
├── News (10 min)
├── Music (4 min)
├── Culture (12 min)
├── Music (3 min)
├── Station ID (30 sec)
└── Tech (7 min)
```

### 3. Scheduler Worker (Automatic)
- Runs every hour
- Looks at broadcast schedule: "What program airs at 8am on Tuesday?"
- Finds "Morning Frontier" scheduled for that slot
- Creates segments from format clock slots:
  - 8:00:00 - Station ID segment (program_id: Morning Frontier)
  - 8:00:30 - News segment (program_id: Morning Frontier)
  - 8:15:30 - Music segment (program_id: Morning Frontier)
  - etc.

### 4. Segment Generation Worker (Automatic)
- Finds queued segments
- For each segment:
  - Loads program details (DJs, conversation format)
  - Queries knowledge base (RAG) for relevant content
  - Generates script using LLM
  - For multi-DJ programs: automatically creates conversation_participants
  - Script reflects DJ personality, program genre, slot type

### 5. Audio Pipeline (Automatic)
- Text-to-speech synthesis (Piper TTS)
- Audio mastering (normalization, compression)
- Segment marked "ready" for playout

### 6. Playout (Automatic)
- Liquidsoap plays segments in chronological order
- Listener hears: "Good morning, this is Zara Nova with Morning Frontier..."

**Your job**: Design the program (step 1) and format clock (step 2). The rest happens automatically.

---

## Program Fields: Complete Reference

### Core Identity

#### **Name** (Required)
- **What**: Display name for the program
- **Requirements**:
  - Unique across all programs
  - 3-50 characters
  - Should convey program's essence
- **Good Examples**:
  - "Morning Frontier" (news/optimism)
  - "Culture Synthesis" (exploration/analysis)
  - "Voices from the Frontier" (interviews/depth)
  - "The Midnight Archive" (late-night/reflective)
  - "Intersections" (cross-disciplinary connections)
- **Avoid**:
  - Generic names ("The Show", "Radio Program")
  - Overly long names ("The Daily Morning News and Culture Hour with Commentary")
  - Names that don't reflect content ("Happy Fun Time" for serious news)

#### **Description** (Strongly Recommended)
- **What**: 2-4 sentence summary of program's purpose and approach
- **Purpose**:
  - Helps content writers understand editorial direction
  - Guides segment generation workers
  - Displayed in admin dashboard
- **Structure**:
  - Sentence 1: What the show covers
  - Sentence 2: How it approaches the material (tone/style)
  - Sentence 3: Who hosts it (optional but recommended)
- **Examples**:
```
Morning Frontier:
"Wake up to the latest news, tech breakthroughs, and cultural happenings
across the Federation. Zara Nova brings energy and optimism to start your
day, exploring how innovation and adaptation shape our multi-world civilization."

Culture Synthesis:
"Exploring the intersection of art, science, philosophy, and society. Marcus
Chen guides you through the cultural landscape of 2525, where human creativity
spans planets and perspectives collide in fascinating ways."

Voices from the Frontier:
"In-depth conversations with fascinating people shaping our future. Luna Voss
sits down with scientists, artists, colonists, and dreamers for thoughtful
explorations of ideas, challenges, and possibilities."

The Midnight Archive:
"Late-night reflection on history, memory, and meaning. Kwame Osei explores
forgotten stories, revisits pivotal moments, and connects past to present with
poetic contemplation. For listeners who think better in the quiet hours."

Tech Undercurrents:
"Surface-level tech news bores you. Ravi Sharma digs into second-order effects,
unintended consequences, and societal implications of emerging technologies.
What happens *after* the breakthrough?"
```

#### **Genre** (Required)
- **What**: Primary content category
- **Options**: `news`, `culture`, `talk`, `music`, `sports`, `technology`, `arts`, `science`
- **Purpose**: Influences segment generation priorities and content retrieval
- **Guidance**:
  - **News**: Current events, Federation politics, breaking developments
  - **Culture**: Arts, society, philosophy, anthropology, cultural trends
  - **Talk**: Interviews, conversations, panel discussions, debates
  - **Music**: Music-focused programming (with cultural context, not just playlists)
  - **Sports**: Competitive events, athletic culture, zero-g games
  - **Technology**: Deep technical analysis, engineering, innovation
  - **Arts**: Visual arts, literature, performance, creative expression
  - **Science**: Research, discovery, scientific method, cosmic exploration

#### **Active** (Required, Default: true)
- **What**: Whether program is currently broadcasting
- **When to Deactivate**:
  - Seasonal hiatus
  - Major redesign in progress
  - DJ unavailable/on leave
  - Testing new program before activating
- **Note**: Inactive programs don't generate segments but remain in database

---

### DJ Assignment

#### **DJs** (Required, 1+ DJs)
- **What**: The host(s)/personality(ies) presenting this program
- **Single-DJ Programs** (Most Common):
  - Select one DJ
  - No conversation format needed
  - DJ's voice and personality define the program
  - Examples: Morning Frontier (Zara Nova), Culture Synthesis (Marcus Chen)

- **Multi-DJ Programs** (Advanced):
  - Select 2-5 DJs
  - Must choose conversation format (see below)
  - Enables interview, panel, dialogue, debate formats
  - First DJ selected = primary host (marked with ★)
  - Speaking order determined by selection order
  - Examples:
    - Interview: Luna Voss (host) + rotating guests
    - Panel: 3-4 DJs discussing topic from different angles
    - Dialogue: 2 DJs in conversational exchange
    - Debate: 2 DJs with contrasting perspectives

#### **Conversation Format** (Required for Multi-DJ Programs)
- **What**: How multiple DJs interact
- **Options**: `interview`, `panel`, `dialogue`, `debate`
- **Only Appears**: When 2+ DJs selected

**Interview** (1 host + 1+ guests)
- Host asks questions, guests respond
- Asymmetric power dynamic
- Best for: Subject matter experts, deep dives, exploratory conversations
- Example: Luna Voss interviews xenobiologist about Enceladus life forms
- Script structure: 60% guest talking, 40% host questions/follow-ups

**Panel** (3-5 DJs, collaborative exploration)
- Multiple voices, relatively equal participation
- Host facilitates but doesn't dominate
- Best for: Complex topics requiring multiple perspectives
- Example: 4 DJs discuss terraforming ethics from scientific, cultural, economic, philosophical angles
- Script structure: Rotating speakers, host transitions topics

**Dialogue** (2 DJs, conversational exchange)
- Two voices in balanced conversation
- Peers, not interviewer/subject
- Best for: Two co-hosts with chemistry, paired explorations
- Example: Engineer + anthropologist discuss how technology changes culture
- Script structure: 50/50 speaking time, natural back-and-forth

**Debate** (2 DJs, contrasting positions)
- Explicit disagreement or opposing viewpoints
- Intellectual sparring
- Best for: Controversial topics, "on the one hand / on the other hand"
- Example: Preservationist vs expansionist on Mars wilderness preservation
- Script structure: Position → counterposition → rebuttal → synthesis/conclusion

**Choosing the Right Format**:
- **How many voices?** 2 = interview/dialogue/debate, 3+ = panel
- **Are they equals?** Yes = dialogue/panel, No = interview
- **Do they agree?** Mostly yes = interview/dialogue/panel, No = debate
- **What's the goal?** Learn from expert = interview, Explore complexity = panel, Understand trade-offs = debate

---

### Scheduling

#### **Format Clock** (Required)
- **What**: Template defining hourly segment structure
- **Technical**: References `format_clocks` table
- **Purpose**: Determines what types of content air and for how long
- **Cannot Change**: Once program is scheduled and generating segments, changing format clock creates inconsistency
- **See**: "Format Clocks Explained" section below

#### **Preferred Time of Day** (Optional, Scheduling Hint)
- **What**: When this program works best
- **Options**: `morning` (6am-12pm), `afternoon` (12pm-6pm), `evening` (6pm-10pm), `night` (10pm-6am)
- **Purpose**: Scheduler uses this as a hint when auto-generating broadcast schedules
- **Note**: Currently advisory; future versions may auto-schedule programs
- **Examples**:
  - Morning: News (wake-up context), upbeat energy
  - Afternoon: Culture/exploration (engaged listening, less rushed)
  - Evening: Interviews/long-form (winding down, deeper attention)
  - Night: Reflective/archival (contemplative mood, lower energy)

#### **Preferred Days** (Optional, Scheduling Hint)
- **What**: Which days of week this program should air
- **Format**: Array of day names: `["monday", "tuesday", "wednesday", "thursday", "friday"]`
- **Purpose**: Scheduler hint
- **Examples**:
  - Weekdays only: `["monday", "tuesday", "wednesday", "thursday", "friday"]`
  - Weekends only: `["saturday", "sunday"]`
  - All days: `null` (or empty array)
  - Specific days: `["tuesday", "thursday"]` (twice-weekly)

**Important**: These are *hints*, not guarantees. Actual broadcast times are set in the **Broadcast Schedule** (separate table/interface). Preferred time/days guide initial scheduling but can be overridden.

---

## Format Clocks Explained

A **format clock** is a reusable hourly template that defines the structure of broadcast time. Think of it as the "skeleton" that programs use to organize content.

### Anatomy of a Format Clock

Every format clock consists of:
- **Name**: "Standard News Hour", "Culture Mix", "Interview Format"
- **Description**: What type of program this suits
- **Slots**: Ordered list of time segments

### Slots (The Building Blocks)

Each slot has:
- **Type**: news, culture, music, interview, tech, station_id, etc.
- **Duration**: Seconds (must total 3600 = 1 hour)
- **Order**: Position in the hour (0, 1, 2...)

### Existing Format Clocks

#### "Standard News Hour"
**Best for**: News-focused programs, morning shows, information-dense content

```
Total: 60 minutes (3600 seconds)

0:00 - Station ID (30 sec)
0:00 - News (15 min)          ← Breaking stories, headlines, analysis
3:00 - Music (3 min)           ← Breathing room
3:00 - News (10 min)           ← Deeper dive or secondary stories
10:00 - Music (4 min)
14:00 - Culture (12 min)       ← Cultural context, society news
26:00 - Music (3 min)
29:00 - Station ID (30 sec)
29:30 - Tech (7 min)           ← Technology segment
```

**Content Mix**: 55% news/culture/tech, 17% music, 2% station ID
**Pacing**: Fast, information-rich, frequent topic changes
**Energy**: High to medium
**Use Cases**: Morning commute shows, hourly news blocks, current affairs

#### "Culture Mix"
**Best for**: Arts & culture programs, exploratory shows, afternoon listening

```
Total: 60 minutes (3600 seconds)

0:00 - Station ID (30 sec)
0:00 - News (8 min)            ← Context-setting, lighter news
8:00 - Music (4 min)
12:00 - Culture (15 min)       ← Main cultural segment
27:00 - Music (3 min)
30:00 - Culture (10 min)       ← Secondary culture topic
40:00 - Music (4 min)
44:00 - News (5 min)           ← Closing news summary
```

**Content Mix**: 63% culture, 20% music, 22% news, 2% station ID
**Pacing**: Slower, more contemplative, longer segments
**Energy**: Medium to low
**Use Cases**: Cultural exploration, arts coverage, society deep-dives

#### "Interview Format"
**Best for**: Conversation programs, long-form interviews, talk shows

```
Total: 60 minutes (3600 seconds)

0:00 - Station ID (30 sec)
0:00 - News (5 min)            ← Brief context/headlines
5:00 - Music (3 min)
8:00 - Interview (30 min)      ← Main conversation segment
38:00 - Music (4 min)
42:00 - Culture (7 min)        ← Related cultural context
```

**Content Mix**: 50% interview, 20% music, 20% culture/news, 2% station ID
**Pacing**: Very slow, deep focus, sustained attention
**Energy**: Conversational, variable
**Use Cases**: Guest interviews, panel discussions, expert dialogues

### Designing Your Own Format Clock

**If existing clocks don't fit your program**, you can create a custom format clock. Guidelines:

1. **Total Duration = 3600 seconds (60 minutes)**
   - Must be exact
   - Validate: sum all slot durations

2. **Start with Station ID** (30 seconds)
   - Legal requirement (station identification)
   - Branding/orientation for listeners

3. **Balance Content Types**
   - News-heavy: 50-60% news/info, 15-20% music
   - Culture-heavy: 60-70% culture/arts, 15-20% music
   - Interview-heavy: 40-50% interview, 20-25% music
   - Music should be 15-25% of total (breathing room, pacing)

4. **Consider Attention Spans**
   - Segments >15 minutes: Interview, long-form culture
   - Segments 7-15 minutes: News, culture, tech
   - Segments 3-7 minutes: Quick topics, music, transitions
   - Segments <3 minutes: Station ID, very brief updates

5. **Create Rhythm**
   - **Fast-slow-fast**: News (fast) → Culture (slow) → News (fast)
   - **Bookends**: Start/end with same energy level
   - **Breathing room**: Music between dense content

6. **Match Program Genre**
   - News programs: Multiple news slots, shorter segments
   - Culture programs: Longer culture slots, fewer transitions
   - Talk programs: One dominant interview/discussion slot
   - Mixed programs: Balanced variety, frequent topic changes

**Example: Custom "Deep Dive" Clock** (for investigative/analysis programs)
```
0:00 - Station ID (30 sec)
0:00 - News (5 min)               ← Context/setup
5:00 - Music (3 min)
8:00 - Culture (20 min)           ← Main analysis segment
28:00 - Music (4 min)
32:00 - Tech (15 min)             ← Related technical deep-dive
47:00 - Music (3 min)
50:00 - News (5 min)              ← Closing synthesis/implications
```

---

## Program Archetypes & Examples

### Archetype 1: The Morning Information Blast

**Purpose**: Wake listeners up with energy, optimism, and need-to-know information
**Target Time**: 6am-10am weekdays
**Pacing**: Fast, high energy, frequent topic changes
**DJ Profile**: Energetic, optimistic, clear communicator

**Example: "Morning Frontier"**
```
DJs: Zara Nova (host)
Format Clock: Standard News Hour
Genre: News
Conversation Format: N/A (single DJ)
Preferred Time: Morning
Preferred Days: Monday-Friday
Description: "Wake up to the latest news, tech breakthroughs, and cultural
happenings across the Federation. Zara Nova brings energy and optimism to
start your day, exploring how innovation and adaptation shape our multi-world
civilization."
```

**Why It Works**:
- High-energy DJ matches morning mood
- News-heavy format delivers information density
- Optimistic framing (not cynical morning news)
- Frequent music breaks prevent fatigue
- Reflects Le Guin's anthropological lens ("how do people live?") and Asimov's problem-solving optimism

**Content Priorities**:
- Breaking Federation news (politics, economics, major events)
- Technology breakthroughs (new innovations, practical applications)
- Cultural happenings (what's trending, what people are talking about)
- Positive framing: challenges = opportunities for adaptation

---

### Archetype 2: The Afternoon Cultural Deep-Dive

**Purpose**: Explore ideas, culture, society with depth and nuance
**Target Time**: 12pm-6pm any day
**Pacing**: Slow, contemplative, sustained segments
**DJ Profile**: Thoughtful, curious, interdisciplinary

**Example: "Culture Synthesis"**
```
DJs: Marcus Chen (host)
Format Clock: Culture Mix
Genre: Culture
Conversation Format: N/A (single DJ)
Preferred Time: Afternoon
Preferred Days: null (every day)
Description: "Exploring the intersection of art, science, philosophy, and
society. Marcus Chen guides you through the cultural landscape of 2525,
where human creativity spans planets and perspectives collide in fascinating ways."
```

**Why It Works**:
- Slower pacing matches afternoon listening (less rushed than morning)
- Culture-heavy format allows deep exploration
- Interdisciplinary approach (art + science + philosophy)
- Reflects Robinson's marriage of science to humanity and Chiang's philosophical depth

**Content Priorities**:
- Arts coverage (visual, performance, literature, new forms)
- Social trends (how communities are evolving)
- Philosophical questions (what does it mean to be human in 2525?)
- Cross-planetary cultural exchange

---

### Archetype 3: The Evening Long-Form Interview

**Purpose**: Thoughtful conversations with fascinating people
**Target Time**: 6pm-10pm, multiple days/week
**Pacing**: Very slow, single sustained conversation
**DJ Profile**: Empathetic, inquisitive, great listener

**Example: "Voices from the Frontier"**
```
DJs: Luna Voss (host) + rotating guest experts
Format Clock: Interview Format
Genre: Talk
Conversation Format: Interview
Preferred Time: Evening
Preferred Days: null (every day)
Description: "In-depth conversations with fascinating people shaping our
future. Luna Voss sits down with scientists, artists, colonists, and
dreamers for thoughtful explorations of ideas, challenges, and possibilities."
```

**Why It Works**:
- Interview format creates intimacy and depth
- Evening timing suits sustained attention
- Rotating guests keep content fresh
- Reflects Butler's focus on individual agency and Clarke's sense of wonder

**Content Priorities**:
- Scientists discussing research (accessible, not jargon-heavy)
- Artists explaining creative process and vision
- Colonists/pioneers sharing lived experience
- Thinkers exploring big ideas (ethics, future, meaning)

**Multi-DJ Note**: This is a 2-person program (host + guest). Guest DJ rotates depending on topic:
- Xenobiology topic? Invite DJ with science expertise
- Mars colonization? Invite DJ with frontier/survival background
- Art installation? Invite DJ with arts focus

---

### Archetype 4: The Late-Night Reflective Archive

**Purpose**: Quiet contemplation, historical perspective, poetic reflection
**Target Time**: 10pm-2am
**Pacing**: Very slow, meditative, low energy
**DJ Profile**: Contemplative, poetic, skeptical of "the new"

**Example: "The Midnight Archive"**
```
DJs: Kwame Osei (host)
Format Clock: Culture Mix (or custom slow clock)
Genre: Culture
Conversation Format: N/A (single DJ)
Preferred Time: Night
Preferred Days: null (every day)
Description: "Late-night reflection on history, memory, and meaning. Kwame
Osei explores forgotten stories, revisits pivotal moments, and connects past
to present with poetic contemplation. For listeners who think better in the
quiet hours."
```

**Why It Works**:
- Low energy matches late-night mood
- Historical focus provides perspective (not just breaking news)
- Poetic voice suits contemplative listening
- Reflects Bradbury's lyrical approach and Le Guin's anthropological patience

**Content Priorities**:
- Historical events (anniversaries, forgotten stories)
- Archival material (old recordings, documents, memories)
- Connections between past and present
- Meaning-making, not just information delivery

---

### Archetype 5: The Multi-Perspective Panel

**Purpose**: Complex topics explored from multiple expert viewpoints
**Target Time**: Afternoon/evening
**Pacing**: Medium, rotating speakers
**DJ Profile**: 3-4 DJs with complementary expertise

**Example: "Intersections"**
```
DJs: Marcus Chen (host), Ravi Sharma (tech), Luna Voss (culture), Zara Nova (optimist)
Format Clock: Interview Format (modified for panel use)
Genre: Talk
Conversation Format: Panel
Preferred Time: Afternoon
Preferred Days: ["tuesday", "thursday"] (twice weekly)
Description: "Four voices, infinite angles. Marcus Chen moderates as
technologists, cultural critics, and futurists dissect the week's most
complex challenges. No easy answers, just honest exploration from people
who think differently."
```

**Why It Works**:
- Multiple perspectives prevent single-viewpoint dominance
- Panel format shows complexity (no simple answers)
- Complementary DJ expertise creates productive tension
- Reflects Jemisin's political awareness and Liu's cosmic scale

**Content Priorities**:
- Controversial topics (terraforming ethics, AI rights, resource allocation)
- Technology + society intersections
- Policy debates (Federation governance, planetary autonomy)
- Questions without clear answers

**Panel Composition**:
- **Host/Moderator** (Marcus): Guides conversation, asks clarifying questions, keeps balance
- **Technical Expert** (Ravi): Engineering/science perspective, "here's how it actually works"
- **Cultural/Humanist** (Luna): Social implications, "how does this affect people?"
- **Optimist/Pragmatist** (Zara): Solutions-oriented, "what can we do about it?"

---

### Archetype 6: The Adversarial Debate

**Purpose**: Intellectual sparring on contentious issues
**Target Time**: Evening (prime listening)
**Pacing**: Fast, argumentative, structured
**DJ Profile**: 2 DJs with genuinely different viewpoints

**Example: "The Opposition"**
```
DJs: Kwame Osei (preservationist) + Zara Nova (progressivist)
Format Clock: Custom debate clock
Genre: Talk
Conversation Format: Debate
Preferred Time: Evening
Preferred Days: ["wednesday"] (weekly)
Description: "Can humans preserve wilderness while expanding civilization?
Should we prioritize Earth restoration or solar colonization? Kwame Osei
and Zara Nova don't agree—and they're not afraid to argue about it.
Respectful disagreement, rigorous thinking, no BS."
```

**Why It Works**:
- Genuine disagreement (not manufactured conflict)
- Structured format prevents chaos
- Respectful but firm ("we disagree, but we respect each other")
- Reflects Butler's unflinching examination and Robinson's political depth

**Content Priorities**:
- Contentious policies (expansion vs conservation, innovation vs caution)
- Ethical dilemmas (rights of AIs, genetic modification, resource distribution)
- Trade-offs with no perfect answer
- "Steel-manning" (argue opponent's best case, not straw man)

**Debate Structure** (custom format clock):
```
0:00 - Station ID (30 sec)
0:00 - News (3 min) - Topic introduction
3:00 - Music (2 min)
5:00 - Opening Statements (10 min) - Each DJ: position (5 min each)
15:00 - Cross-Examination (20 min) - Direct questions, rebuttals
35:00 - Music (3 min)
38:00 - Synthesis/Conclusion (17 min) - Common ground? Listener takeaways?
```

---

## Single-DJ vs Multi-DJ: Decision Matrix

### Choose Single-DJ When:

**Simplicity**
- You want a clear, consistent voice
- Program is about information delivery, not dialogue
- DJ personality *is* the program identity

**Examples**:
- Morning news (Zara Nova = optimistic news voice)
- Cultural exploration (Marcus Chen = interdisciplinary guide)
- Late-night reflection (Kwame Osei = poetic contemplation)

**Pros**:
- Simpler to manage
- Consistent tone/voice
- DJ becomes synonymous with program
- Works for 90% of programs

**Cons**:
- Limited perspective (one voice, one viewpoint)
- Can't do interviews/panels/debates
- Less dynamic interaction

---

### Choose Multi-DJ When:

**Complexity**
- Topic requires multiple perspectives
- You want dialogue/conversation, not monologue
- Interplay between voices adds value

**Examples**:
- Interviews (host + expert guest)
- Panel discussions (4 experts analyzing policy)
- Debates (2 opposing viewpoints)
- Co-hosted dialogue (2 complementary voices)

**Pros**:
- Richer, more dynamic content
- Multiple expertise areas
- Conversational energy
- Shows complexity (no single "right" answer)

**Cons**:
- More complex to manage
- Requires careful DJ selection (chemistry matters)
- Can feel chaotic if poorly structured
- Conversation format must match content

---

### The Decision Tree

```
Start: Do you need more than one voice?
├─ No → Single-DJ Program
│        └─ Pick DJ whose personality matches program mission
│
└─ Yes → Multi-DJ Program
         ├─ How many voices?
         │   ├─ 2 voices → Interview, Dialogue, or Debate
         │   │   ├─ Is one an expert being interviewed? → Interview
         │   │   ├─ Are they peers exploring together? → Dialogue
         │   │   └─ Do they disagree on fundamentals? → Debate
         │   │
         │   └─ 3-5 voices → Panel
         │       └─ Pick complementary expertise (not redundant perspectives)
         │
         └─ Select conversation format based on goal:
             ├─ Learn from expert → Interview
             ├─ Explore complexity → Panel
             ├─ Understand trade-offs → Debate
             └─ Conversational chemistry → Dialogue
```

---

## Broadcast Schedule Integration

**Programs** and **Broadcast Schedules** are separate but connected.

### How It Works

1. **You create a Program**: "Morning Frontier" with all its properties
2. **You create a Broadcast Schedule entry**: "Morning Frontier airs Mon-Fri, 6am-10am"
3. **Scheduler worker reads schedule**: "It's 8am Tuesday → What program airs? → Morning Frontier"
4. **Segments are generated**: Using Morning Frontier's format clock, DJs, genre

### Broadcast Schedule Table

```sql
broadcast_schedule
├─ program_id (which program)
├─ day_of_week (0=Sunday, 6=Saturday, NULL=every day)
├─ start_time (e.g., '06:00:00')
├─ end_time (e.g., '10:00:00')
├─ priority (higher = wins in conflicts)
└─ active (can disable schedule without deleting)
```

### Scheduling Examples

**Weekday Morning Show**
```
Program: Morning Frontier
Schedule Entry 1:
  day_of_week: 1 (Monday)
  start_time: 06:00:00
  end_time: 10:00:00
Schedule Entry 2:
  day_of_week: 2 (Tuesday)
  start_time: 06:00:00
  end_time: 10:00:00
[... repeat for Wed, Thu, Fri]
```

**Every Day, All Day**
```
Program: Culture Synthesis
Schedule Entry:
  day_of_week: NULL (every day)
  start_time: 12:00:00
  end_time: 18:00:00
```

**Weekly Deep-Dive**
```
Program: The Opposition (debate show)
Schedule Entry:
  day_of_week: 3 (Wednesday)
  start_time: 19:00:00
  end_time: 20:00:00
```

**Priority Conflicts**
If two programs are scheduled for the same time, **priority** determines winner:
```
Program A: priority 10
Program B: priority 5
Both scheduled: Wednesday 7pm-8pm
→ Program A wins (higher priority)
```

---

## Content Strategy: How Programs Shape Worldbuilding

Programs aren't just organizational units—they're **narrative lenses** through which the world of 2525 is revealed.

### Programs as Thematic Filters

Each program prioritizes different RAG content:

**"Morning Frontier" (News)**
- RAG retrieves: Recent events, breaking developments, political updates
- Frames content as: Immediate, relevant, actionable
- Reflects: Asimov's optimism ("we'll figure it out")

**"Culture Synthesis" (Culture)**
- RAG retrieves: Arts, society, anthropological docs, cultural trends
- Frames content as: Exploration, connection, meaning
- Reflects: Le Guin's anthropology + Bradbury's poetry

**"Voices from the Frontier" (Talk/Interview)**
- RAG retrieves: Deep-dive docs related to guest expertise
- Frames content as: Personal stories, expert insight, human experience
- Reflects: Butler's individual agency + Clarke's wonder

**"The Midnight Archive" (Culture/Historical)**
- RAG retrieves: Historical events, archival docs, past perspectives
- Frames content as: Memory, continuity, perspective
- Reflects: Bradbury's lyricism + Le Guin's patience

### Program Mix = World Texture

The right mix of programs creates a **lived-in world**:

- **Too much news**: World feels reactive, crisis-driven, shallow
- **Too much culture**: World feels abstract, disconnected from events
- **Too much talk**: World feels personality-driven, not grounded
- **Balanced mix**: World feels rich, multi-layered, inhabited

**Recommended Station Mix** (24/7 operation):
- 40% News programs (current events, breaking stories, analysis)
- 30% Culture programs (arts, society, exploration, ideas)
- 20% Talk programs (interviews, panels, debates)
- 10% Specialty (music deep-dives, archival, experimental)

This mirrors how people actually consume media: some news (stay informed), some culture (explore ideas), some conversation (hear voices), some variety (surprise me).

---

## Quality Standards & Best Practices

### The Literary Bar

Remember: you're writing science fiction that happens to air on radio.

**Ask yourself:**
- Would this program structure serve a story in a Le Guin novel?
- Does it have the pacing of good Bradbury?
- Does it ask questions like Chiang?
- Does it show complexity like Robinson?
- Does it feel lived-in like Gibson?

If not—redesign.

### Practical Quality Checks

**Program Name**
- [ ] Conveys purpose/tone
- [ ] Unique and memorable
- [ ] 3-50 characters
- [ ] Not generic

**Description**
- [ ] 2-4 sentences
- [ ] Explains what + how + who
- [ ] Evokes program's voice
- [ ] Guides content generation

**DJ Selection**
- [ ] Personality matches program mission
- [ ] Energy level matches time of day
- [ ] For multi-DJ: complementary voices (not redundant)
- [ ] For interviews: host has empathy + curiosity
- [ ] For panels: diverse expertise
- [ ] For debates: genuine disagreement (not manufactured)

**Format Clock**
- [ ] Matches program genre (news programs use news-heavy clocks)
- [ ] Pacing matches listening context (fast for morning, slow for evening)
- [ ] Music breaks provide breathing room (15-25% of hour)
- [ ] Segment lengths match attention spans
- [ ] Total duration = exactly 3600 seconds

**Conversation Format** (multi-DJ only)
- [ ] Interview: Clear host/guest dynamic
- [ ] Panel: 3-5 voices with complementary expertise
- [ ] Dialogue: 2 peers with chemistry
- [ ] Debate: Genuine disagreement, respectful sparring

**Broadcast Schedule**
- [ ] Time of day matches program energy
- [ ] Frequency matches content depth (daily news vs weekly deep-dive)
- [ ] No unintended conflicts (check schedule overlaps)

---

## The Program Creation Checklist

Use this when creating a new program:

### Step 1: Concept
- [ ] What is this program's purpose? (inform, explore, converse, debate)
- [ ] What niche does it fill in station programming?
- [ ] What literary tradition does it honor? (which authors' spirit?)

### Step 2: Core Identity
- [ ] Name chosen (3-50 chars, unique, evocative)
- [ ] Description written (2-4 sentences, what + how + who)
- [ ] Genre selected (news, culture, talk, etc.)

### Step 3: DJ Assignment
- [ ] Single or multi-DJ? (Decision matrix consulted)
- [ ] DJ(s) selected (personality matches mission)
- [ ] If multi-DJ: Conversation format chosen (interview/panel/dialogue/debate)
- [ ] If multi-DJ: Speaking order set (primary host first)

### Step 4: Format Clock
- [ ] Existing clock fits program? (Standard News Hour, Culture Mix, Interview Format)
- [ ] If not: Custom clock designed (totals 3600 sec, matches pacing/genre)

### Step 5: Scheduling Hints
- [ ] Preferred time of day selected (morning/afternoon/evening/night)
- [ ] Preferred days selected (weekdays/weekends/specific days/all days)

### Step 6: Broadcast Schedule
- [ ] Schedule entry created (day_of_week, start_time, end_time)
- [ ] Priority set (if conflicts possible)
- [ ] Active = true

### Step 7: Quality Check
- [ ] Run through quality standards checklist (above)
- [ ] Imagine listening to this program—does it work?
- [ ] Would this make Le Guin proud?

### Step 8: Activate & Monitor
- [ ] Program set to active = true
- [ ] Wait 1 hour for scheduler to generate segments
- [ ] Check dashboard: segments being created?
- [ ] Listen to playout: does it sound right?
- [ ] Adjust if needed (but avoid changing format clock after launch)

---

## Common Mistakes & How to Avoid Them

### Mistake 1: Generic Program Names
**Bad**: "The Show", "Radio Program", "News Hour"
**Why**: Forgettable, doesn't convey identity
**Fix**: Make it specific and evocative ("Morning Frontier", "Culture Synthesis")

### Mistake 2: Mismatched DJ Energy
**Bad**: High-energy DJ (1.2x speed) hosting late-night contemplative show
**Why**: Energy level fights program mission
**Fix**: Match DJ energy to program context (morning = high, night = low)

### Mistake 3: Multi-DJ Without Clear Format
**Bad**: 3 DJs selected, conversation format = blank
**Why**: System doesn't know how to structure dialogue
**Fix**: Always select conversation format for multi-DJ programs

### Mistake 4: Wrong Format Clock
**Bad**: Interview program using "Standard News Hour" (lots of short segments)
**Why**: Interview needs sustained conversation, not frequent topic changes
**Fix**: Use "Interview Format" clock or create custom clock with long interview slot

### Mistake 5: Over-Scheduling
**Bad**: Same program 24/7 for weeks
**Why**: Listeners (and content) need variety
**Fix**: Mix programs across day/week, create rotation

### Mistake 6: No Description
**Bad**: Leaving description blank
**Why**: Content writers don't understand program mission, segment generation lacks context
**Fix**: Always write 2-4 sentence description

### Mistake 7: Redundant Panel Members
**Bad**: Panel with 4 DJs who all have same expertise/perspective
**Why**: No productive tension, conversation feels repetitive
**Fix**: Choose complementary expertise (scientist + humanist + engineer + artist)

### Mistake 8: Changing Format Clock Mid-Stream
**Bad**: Program has 1000 generated segments, you change format clock
**Why**: Old segments don't match new clock, schedule breaks
**Fix**: Deactivate old program, create new program with new clock, schedule transition

---

## Final Thoughts: Programs as Storytelling

You're not building a radio show. You're building a **narrative architecture**.

Every program is a lens through which listeners experience the world of 2525. News programs reveal current events. Culture programs explore meaning. Interview programs surface individual voices. Debate programs show contested terrain.

The mix of programs = the texture of the world. Too much of any one thing, and the world flattens. The right balance, and the world feels **inhabited, complex, real**.

That's the bar. That's the tradition. That's what Radio 2525 demands.

**You're writing science fiction. Make it worthy of the shelf.**

---

## Quick Reference

### Program Field Summary
- **Name**: 3-50 chars, unique, evocative
- **Description**: 2-4 sentences, what + how + who
- **Genre**: news, culture, talk, music, sports, technology, arts, science
- **DJs**: 1+ DJs, first = primary host
- **Conversation Format**: interview, panel, dialogue, debate (multi-DJ only)
- **Format Clock**: Standard News Hour, Culture Mix, Interview Format, or custom
- **Preferred Time**: morning, afternoon, evening, night
- **Preferred Days**: Array of days or null for all days
- **Active**: true/false

### Conversation Formats
- **Interview**: 1 host + 1+ guests, host asks questions
- **Panel**: 3-5 DJs, collaborative exploration
- **Dialogue**: 2 DJs, conversational peers
- **Debate**: 2 DJs, contrasting positions

### Format Clocks
- **Standard News Hour**: News-heavy, fast-paced (55% info, 17% music)
- **Culture Mix**: Culture-heavy, contemplative (63% culture, 20% music)
- **Interview Format**: Long-form conversation (50% interview, 20% music)

### Scheduling
- Create program → Create broadcast_schedule entry → Scheduler generates segments
- day_of_week: 0-6 (Sun-Sat) or NULL for every day
- Priority: Higher number wins conflicts

---

**Print this guide and keep it next to DJ_PERSONALITY_GUIDE.md and CONTENT_WRITING_GUIDE.md. Together, they form the complete creative reference for Radio 2525.**

Welcome to program creation. Make Le Guin proud.
