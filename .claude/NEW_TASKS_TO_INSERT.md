# New Tasks to Insert into TASKS.md

## INSERT AFTER G3 (Line ~3700)

------------------------------------------------------------

# Task G4: Script Generation Core Logic

**Tier:** Generation
**Estimated Time:** 4-6 hours
**Complexity:** High
**Prerequisites:** G3 (Claude client), R6 (Retrieval service)

---

## Objective

Implement the core script generation logic that takes RAG context and generates radio scripts using Claude LLM. This is the heart of content generation, responsible for prompt engineering, context assembly, citation tracking, and output parsing.

---

## Context from Architecture

**From ARCHITECTURE.md Section 6:**

The script generation flow:
1. Receive segment specification (type, DJ, program, time)
2. Retrieve RAG context (from R6)
3. Assemble prompt with system instructions, DJ personality, retrieved context
4. Call Claude LLM (via G3)
5. Parse output into structured format
6. Extract and validate citations
7. Return script in Markdown format

**Key Requirements:**
- Context-aware generation (time, current events, world state)
- DJ personality injection
- Citation tracking for transparency
- Markdown output format
- Idempotency via caching

---

## What You're Building

A TypeScript module that:
1. Assembles prompts from templates + context
2. Calls Claude LLM with proper parameters
3. Parses and validates LLM output
4. Tracks citations back to source documents
5. Handles retries and errors gracefully

---

## Implementation Steps

### Step 1: Create Prompt Templates

Create `packages/radio-core/src/prompts/script-generation.ts`:
```typescript
import { DJPersonality, SegmentType } from '../schemas';

export interface PromptContext {
  segmentType: SegmentType;
  dj: DJPersonality;
  ragContext: RAGResult;
  currentTime: Date;
  futureYear: number;
  programName: string;
  previousSegmentSummary?: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { dj, futureYear, currentTime } = ctx;

  return `You are ${dj.name}, a radio DJ broadcasting in the year ${futureYear}.

PERSONALITY:
${dj.personality_traits}

SPEAKING STYLE:
${dj.speaking_style}

CURRENT TIME: ${formatFutureTime(currentTime, futureYear)}

INSTRUCTIONS:
- Stay in character as ${dj.name}
- Reference the current date and time naturally
- Use information from the provided context
- Keep the tone ${dj.tone} but realistic
- Cite sources using [SOURCE: title] format
- Target length: ${getTargetLength(ctx.segmentType)} words
- Format output in Markdown`;
}

export function buildUserPrompt(ctx: PromptContext): string {
  const { segmentType, ragContext, previousSegmentSummary } = ctx;

  let prompt = `Generate a ${segmentType} segment script.\n\n`;

  if (previousSegmentSummary) {
    prompt += `PREVIOUS SEGMENT: ${previousSegmentSummary}\n\n`;
  }

  prompt += `RELEVANT INFORMATION:\n`;
  for (const chunk of ragContext.chunks) {
    prompt += `\n[SOURCE: ${chunk.title}]\n${chunk.content}\n`;
  }

  prompt += `\n\nGenerate the script now:`;

  return prompt;
}

function getTargetLength(type: SegmentType): number {
  const lengths = {
    news: 200,
    culture: 300,
    interview: 400,
    station_id: 50,
    weather: 150,
    tech: 250,
  };
  return lengths[type] || 200;
}

function formatFutureTime(now: Date, futureYear: number): string {
  const month = now.toLocaleString('en-US', { month: 'long' });
  const day = now.getDate();
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${month} ${day}, ${futureYear} at ${time}`;
}
```

### Step 2: Create Script Generator Service

Create `packages/radio-core/src/services/script-generator.ts`:
```typescript
import { Anthropic } from '@anthropic-ai/sdk';
import { createLogger } from '../logger';
import { SegmentScript, segmentScriptSchema } from '../schemas';
import { buildSystemPrompt, buildUserPrompt, PromptContext } from '../prompts/script-generation';

const logger = createLogger('script-generator');

export interface GenerateScriptOptions {
  context: PromptContext;
  temperature?: number;
  maxTokens?: number;
  cacheKey?: string;
}

export class ScriptGenerator {
  private anthropic: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-3-5-haiku-20241022') {
    this.anthropic = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateScript(options: GenerateScriptOptions): Promise<SegmentScript> {
    const { context, temperature = 0.7, maxTokens = 2000 } = options;

    const systemPrompt = buildSystemPrompt(context);
    const userPrompt = buildUserPrompt(context);

    logger.info({
      segmentType: context.segmentType,
      djName: context.dj.name,
      ragChunks: context.ragContext.chunks.length,
    }, 'Generating script');

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt,
        }],
      });

      const scriptText = this.extractText(response);
      const citations = this.extractCitations(scriptText, context.ragContext);

      const script: SegmentScript = {
        text: scriptText,
        citations,
        tokens_in: response.usage.input_tokens,
        tokens_out: response.usage.output_tokens,
        model: this.model,
        temperature,
      };

      // Validate
      return segmentScriptSchema.parse(script);

    } catch (error) {
      logger.error({ error, context }, 'Script generation failed');
      throw new Error(`Script generation failed: ${error.message}`);
    }
  }

  private extractText(response: Anthropic.Message): string {
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }
    return content.text;
  }

  private extractCitations(
    script: string,
    ragContext: RAGResult
  ): Citation[] {
    const citations: Citation[] = [];
    const citationRegex = /\[SOURCE:\s*([^\]]+)\]/g;

    let match;
    while ((match = citationRegex.exec(script)) !== null) {
      const title = match[1].trim();
      const chunk = ragContext.chunks.find(c => c.title === title);

      if (chunk) {
        citations.push({
          doc_id: chunk.doc_id,
          chunk_id: chunk.chunk_id,
          title: chunk.title,
          relevance_score: chunk.score,
        });
      }
    }

    return citations;
  }
}
```

### Step 3: Create Script Schemas

Add to `packages/radio-core/src/schemas/index.ts`:
```typescript
import { z } from 'zod';

export const citationSchema = z.object({
  doc_id: z.string().uuid(),
  chunk_id: z.string().uuid(),
  title: z.string(),
  relevance_score: z.number().min(0).max(1),
});

export type Citation = z.infer<typeof citationSchema>;

export const segmentScriptSchema = z.object({
  text: z.string().min(50).max(5000),
  citations: z.array(citationSchema),
  tokens_in: z.number().int().positive(),
  tokens_out: z.number().int().positive(),
  model: z.string(),
  temperature: z.number().min(0).max(2),
  generated_at: z.date().default(() => new Date()),
});

export type SegmentScript = z.infer<typeof segmentScriptSchema>;

export const djPersonalitySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  personality_traits: z.string(),
  speaking_style: z.string(),
  tone: z.enum(['optimistic', 'neutral', 'serious', 'playful']),
  voice_id: z.string(),
});

export type DJPersonality = z.infer<typeof djPersonalitySchema>;
```

### Step 4: Create Unit Tests

Create `packages/radio-core/src/services/__tests__/script-generator.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptGenerator } from '../script-generator';
import { PromptContext } from '../../prompts/script-generation';

describe('ScriptGenerator', () => {
  let generator: ScriptGenerator;

  beforeEach(() => {
    const apiKey = process.env.ANTHROPIC_API_KEY || 'test-key';
    generator = new ScriptGenerator(apiKey);
  });

  it('should build system prompt with DJ personality', () => {
    const context: PromptContext = {
      segmentType: 'news',
      dj: {
        id: '123',
        name: 'Zara Nova',
        personality_traits: 'Energetic, curious, optimistic',
        speaking_style: 'Fast-paced, enthusiastic',
        tone: 'optimistic',
        voice_id: 'en_US-lessac-medium',
      },
      ragContext: {
        chunks: [],
        query_time_ms: 100,
      },
      currentTime: new Date('2025-01-15T10:30:00Z'),
      futureYear: 2525,
      programName: 'Morning Briefing',
    };

    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('Zara Nova');
    expect(prompt).toContain('2525');
    expect(prompt).toContain('Energetic, curious');
  });

  it('should extract citations from script', () => {
    const script = `
    Breaking news from Mars Colony! [SOURCE: Mars Daily Herald]
    Scientists discovered something amazing. [SOURCE: Science Today]
    `;

    const ragContext = {
      chunks: [
        {
          doc_id: 'doc-1',
          chunk_id: 'chunk-1',
          title: 'Mars Daily Herald',
          content: '...',
          score: 0.95,
        },
        {
          doc_id: 'doc-2',
          chunk_id: 'chunk-2',
          title: 'Science Today',
          content: '...',
          score: 0.87,
        },
      ],
      query_time_ms: 50,
    };

    const citations = generator['extractCitations'](script, ragContext);

    expect(citations).toHaveLength(2);
    expect(citations[0].title).toBe('Mars Daily Herald');
    expect(citations[1].title).toBe('Science Today');
  });
});
```

### Step 5: Integration Test

Create `packages/radio-core/src/services/__tests__/script-generator.integration.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ScriptGenerator } from '../script-generator';
import { PromptContext } from '../../prompts/script-generation';

describe('ScriptGenerator Integration', () => {
  it('should generate real script from Claude', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('Skipping: ANTHROPIC_API_KEY not set');
      return;
    }

    const generator = new ScriptGenerator(apiKey);

    const context: PromptContext = {
      segmentType: 'news',
      dj: {
        id: '123',
        name: 'Zara Nova',
        personality_traits: 'Energetic, optimistic, curious',
        speaking_style: 'Fast-paced, enthusiastic',
        tone: 'optimistic',
        voice_id: 'en_US-lessac-medium',
      },
      ragContext: {
        chunks: [
          {
            doc_id: 'doc-1',
            chunk_id: 'chunk-1',
            title: 'Mars Colony Update',
            content: 'The Mars Colony celebrated its 50th anniversary this week with a grand ceremony.',
            score: 0.95,
          },
        ],
        query_time_ms: 100,
      },
      currentTime: new Date(),
      futureYear: 2525,
      programName: 'Morning News',
    };

    const script = await generator.generateScript({ context });

    expect(script.text).toBeTruthy();
    expect(script.text.length).toBeGreaterThan(50);
    expect(script.citations).toBeDefined();
    expect(script.tokens_in).toBeGreaterThan(0);
    expect(script.tokens_out).toBeGreaterThan(0);
  }, 30000); // 30 second timeout for API call
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Prompt templates exist for all segment types
- [ ] System prompt includes DJ personality and current time
- [ ] User prompt includes RAG context
- [ ] Citations are extracted and tracked
- [ ] Output is validated with Zod schema
- [ ] Retries on transient failures

### Quality Requirements
- [ ] All types imported from @radio/core
- [ ] Comprehensive error handling
- [ ] Structured logging
- [ ] Unit test coverage >80%
- [ ] Integration test with real API call

### Manual Verification
- [ ] Generate script for news segment
- [ ] Verify DJ personality reflected in output
- [ ] Verify citations match RAG sources
- [ ] Verify time reference is correct
- [ ] Verify output is valid Markdown

---

## Testing Strategy
```bash
# Unit tests
pnpm test packages/radio-core/src/services/__tests__/script-generator.test.ts

# Integration test (requires API key)
export ANTHROPIC_API_KEY=sk-ant-...
pnpm test packages/radio-core/src/services/__tests__/script-generator.integration.test.ts

# Type check
pnpm typecheck
```

---

## Configuration

Add to `.env.example`:
```bash
# Claude API for script generation
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Script generation settings
SCRIPT_MODEL=claude-3-5-haiku-20241022
SCRIPT_TEMPERATURE=0.7
SCRIPT_MAX_TOKENS=2000
```

---

## Next Task Handoff

**What this task provides for G5 and G6:**

1. **Script Generator Service:** `ScriptGenerator` class ready to use
2. **Prompt Templates:** Reusable templates for different segment types
3. **Citation Tracking:** Automatic extraction of source references
4. **Schema Validation:** `segmentScriptSchema` for output validation

**Files created:**
- `packages/radio-core/src/services/script-generator.ts`
- `packages/radio-core/src/prompts/script-generation.ts`
- `packages/radio-core/src/schemas/script.ts` (new schemas)
- Tests

**G5 (Segment Gen Worker) will:**
- Import and use `ScriptGenerator`
- Pass RAG context from R6
- Save generated script to database

**G6 (TTS Integration) will:**
- Receive script from G5
- Pass script text to Piper TTS
- Handle audio generation

------------------------------------------------------------

## INSERT AFTER D8 (Line ~8150)

------------------------------------------------------------

# Task D9: Programs & Format Clocks Migration

**Tier:** Data
**Estimated Time:** 2-3 hours
**Complexity:** Medium
**Prerequisites:** D1-D8 complete

---

## Objective

Create SQL migrations for the `programs` and `format_clocks` tables. These tables define the radio station's programming structure: what shows exist, who hosts them, and what the hourly structure looks like.

---

## Context from Architecture

**From ARCHITECTURE.md Section 3:**

Programs represent radio shows (e.g., "Morning Briefing", "Tech Talk", "Evening Jazz"). Each program has:
- A DJ (host)
- A format clock (hourly structure)
- Metadata (name, description, genre)

Format clocks define the hourly structure with slots:
- Slot type (news, music, culture, interview, station_id, etc.)
- Duration in seconds
- Order within the hour

---

## What You're Building

SQL migrations that create:
1. `format_clocks` table for hourly broadcast templates
2. `format_slots` table for individual slots within a clock
3. `programs` table for radio shows
4. Foreign key constraints linking them together

---

## Implementation Steps

### Step 1: Create Format Clocks Migration

Create `infra/migrations/009_create_format_clocks.sql`:
```sql
-- Migration: Create format clocks tables
-- Description: Defines hourly broadcast structure templates
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create format clocks table
CREATE TABLE format_clocks (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clock metadata
  name TEXT NOT NULL UNIQUE,
  description TEXT,

  -- Total duration should equal 3600 seconds (1 hour)
  total_duration_sec INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create format slots table
CREATE TABLE format_slots (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key
  format_clock_id UUID NOT NULL REFERENCES format_clocks(id) ON DELETE CASCADE,

  -- Slot configuration
  slot_type TEXT NOT NULL,  -- 'news', 'music', 'culture', 'interview', 'station_id', etc.
  duration_sec INT NOT NULL CHECK (duration_sec > 0),
  order_index INT NOT NULL,  -- Position within the hour

  -- Optional constraints
  required BOOLEAN DEFAULT true,  -- Can this slot be skipped?

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique ordering within a clock
  UNIQUE(format_clock_id, order_index)
);

-- Indexes
CREATE INDEX idx_format_slots_clock ON format_slots(format_clock_id, order_index);

-- Triggers
CREATE TRIGGER format_clocks_updated_at
  BEFORE UPDATE ON format_clocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER format_slots_updated_at
  BEFORE UPDATE ON format_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE format_clocks IS 'Templates defining hourly broadcast structure';
COMMENT ON TABLE format_slots IS 'Individual slots within a format clock';
COMMENT ON COLUMN format_slots.slot_type IS 'Type of content for this slot';
COMMENT ON COLUMN format_slots.order_index IS 'Position within the hour (0-based)';
```

### Step 2: Create Programs Migration

Create `infra/migrations/010_create_programs.sql`:
```sql
-- Migration: Create programs table
-- Description: Defines radio shows/programs
-- Author: AI Radio Team
-- Date: 2025-01-01

-- Create programs table
CREATE TABLE programs (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  dj_id UUID NOT NULL,              -- References djs(id) - created in A4
  format_clock_id UUID NOT NULL REFERENCES format_clocks(id),

  -- Program metadata
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  genre TEXT,                       -- 'news', 'culture', 'music', 'talk', etc.

  -- Scheduling hints (used by scheduler worker)
  preferred_time_of_day TEXT,       -- 'morning', 'afternoon', 'evening', 'night'
  preferred_days JSONB,              -- ['monday', 'tuesday', ...] or null for any

  -- Active status
  active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_programs_dj ON programs(dj_id);
CREATE INDEX idx_programs_format_clock ON programs(format_clock_id);
CREATE INDEX idx_programs_active ON programs(active) WHERE active = true;

-- Add foreign key to segments table (created in D1)
ALTER TABLE segments
  ADD CONSTRAINT fk_segments_program
  FOREIGN KEY (program_id)
  REFERENCES programs(id)
  ON DELETE RESTRICT;

-- Trigger
CREATE TRIGGER programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE programs IS 'Radio shows/programs with assigned DJs and format clocks';
COMMENT ON COLUMN programs.dj_id IS 'Host DJ for this program';
COMMENT ON COLUMN programs.format_clock_id IS 'Hourly structure template for this program';
COMMENT ON COLUMN programs.preferred_time_of_day IS 'Scheduler hint for optimal broadcast time';
```

### Step 3: Create Rollback Migrations

Create `infra/migrations/010_create_programs_down.sql`:
```sql
-- Rollback: Drop programs table

-- Remove foreign key from segments
ALTER TABLE segments DROP CONSTRAINT IF EXISTS fk_segments_program;

DROP TRIGGER IF EXISTS programs_updated_at ON programs;
DROP TABLE IF EXISTS programs;
```

Create `infra/migrations/009_create_format_clocks_down.sql`:
```sql
-- Rollback: Drop format clocks tables

DROP TRIGGER IF EXISTS format_slots_updated_at ON format_slots;
DROP TRIGGER IF EXISTS format_clocks_updated_at ON format_clocks;
DROP TABLE IF EXISTS format_slots;
DROP TABLE IF EXISTS format_clocks;
```

### Step 4: Update Migration Runner

Update `infra/migrate.js` to handle the new migrations (it should already work, just verify).

### Step 5: Create Test Script

Create `infra/test-programs-migration.sh`:
```bash
#!/bin/bash
# Test programs and format clocks migrations

set -e

echo "Testing format clocks and programs migrations..."

# Run migrations
node infra/migrate.js up

# Test format clock insertion
psql $DATABASE_URL -c "
INSERT INTO format_clocks (name, description)
VALUES ('Standard Hour', 'Standard hourly format')
RETURNING id;
"

# Test format slot insertion
CLOCK_ID=$(psql $DATABASE_URL -t -c "SELECT id FROM format_clocks LIMIT 1;")
psql $DATABASE_URL -c "
INSERT INTO format_slots (format_clock_id, slot_type, duration_sec, order_index)
VALUES ('$CLOCK_ID', 'news', 600, 0)
RETURNING id;
"

# Verify foreign key works
psql $DATABASE_URL -c "
SELECT c.name, s.slot_type, s.duration_sec
FROM format_clocks c
JOIN format_slots s ON s.format_clock_id = c.id;
"

echo "✓ Migration test passed"
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] `format_clocks` table created with all columns
- [ ] `format_slots` table created with foreign key to format_clocks
- [ ] `programs` table created with foreign key to format_clocks
- [ ] Foreign key added from `segments.program_id` to `programs.id`
- [ ] All indexes created
- [ ] Rollback migrations work

### Quality Requirements
- [ ] SQL syntax valid for PostgreSQL
- [ ] Constraints properly named
- [ ] Comments explain table purposes
- [ ] Migrations are idempotent

### Manual Verification
- [ ] Create format clock succeeds
- [ ] Create format slots linked to clock succeeds
- [ ] Cannot create program without valid format_clock_id
- [ ] Cannot delete format clock with linked programs
- [ ] Rollback works cleanly

---

## Testing Strategy
```bash
# Test migrations
./infra/test-programs-migration.sh

# Test rollback
node infra/migrate.js down
node infra/migrate.js down
node infra/migrate.js up

# Verify schema
psql $DATABASE_URL -c "\d format_clocks"
psql $DATABASE_URL -c "\d format_slots"
psql $DATABASE_URL -c "\d programs"
```

---

## Next Task Handoff

**What this task provides for D10:**

1. **Empty tables ready for seeding**
2. **Schema for sample data creation**

**What this task provides for A9:**

1. **Programs table to query/insert/update**
2. **Foreign key constraints enforced**

**Files created:**
- `infra/migrations/009_create_format_clocks.sql`
- `infra/migrations/009_create_format_clocks_down.sql`
- `infra/migrations/010_create_programs.sql`
- `infra/migrations/010_create_programs_down.sql`
- `infra/test-programs-migration.sh`

**D10 will:**
- Use these tables to insert seed data
- Create sample programs and format clocks

**A9 will:**
- Build UI on top of programs table
- Allow CRUD operations on programs

------------------------------------------------------------

## INSERT AFTER D9 (Line ~TBD)

------------------------------------------------------------

# Task D10: Database Seeding & Sample Data

**Tier:** Data
**Estimated Time:** 3-4 hours
**Complexity:** Medium
**Prerequisites:** D9 (Programs tables), D4 (KB tables)

---

## Objective

Create a seeding script that populates the database with initial sample data so the radio station can broadcast immediately. Includes sample DJs, programs, format clocks, universe lore, and events.

---

## Context from Product Vision

**From PRODUCT VISION.md:**

The radio broadcasts from the year 2525, inspired by 20th century sci-fi authors. We need initial world-building content that establishes:
- The future universe setting
- Multiple planets and civilizations
- Optimistic but realistic tone
- Rich history and current events

---

## What You're Building

A seeding script and sample data files that create:
1. 3 sample DJs with distinct personalities
2. 2-3 radio programs
3. 2-3 format clocks (hourly structures)
4. Initial universe lore documents
5. Sample current events
6. Sample music metadata (placeholders)

---

## Implementation Steps

### Step 1: Create Seed Data Structure

Create `infra/seed-data/djs.json`:
```json
[
  {
    "id": "dj-001",
    "name": "Zara Nova",
    "personality_traits": "Energetic, optimistic, curious about new discoveries. Always sees the bright side of things while staying grounded in reality.",
    "speaking_style": "Fast-paced, enthusiastic, uses contemporary slang mixed with retro 20th-century expressions. Loves to make connections between past and present.",
    "tone": "optimistic",
    "voice_id": "en_US-lessac-medium",
    "bio": "Zara hosts the morning show, bringing infectious energy to listeners across three solar systems. Born on Europa Station, she's fascinated by both cutting-edge technology and ancient Earth history."
  },
  {
    "id": "dj-002",
    "name": "Marcus Chen",
    "personality_traits": "Thoughtful, analytical, dry wit. Balances facts with philosophical musings. Calm and measured delivery.",
    "speaking_style": "Moderate pace, contemplative, occasional sardonic humor. References classic science fiction literature frequently.",
    "tone": "neutral",
    "voice_id": "en_US-danny-low",
    "bio": "Marcus brings depth to afternoon programming with 'Culture Synthesis,' exploring how art, science, and society intertwine. Based on Mars Colony Prime, he's a former xenoanthropologist turned broadcaster."
  },
  {
    "id": "dj-003",
    "name": "Luna Voss",
    "personality_traits": "Warm, conversational, deeply empathetic. Great listener who draws out interesting stories. Passionate about human (and alien) connection.",
    "speaking_style": "Relaxed, intimate tone. Uses pauses effectively. Asks thoughtful questions. Narrative-driven.",
    "tone": "playful",
    "voice_id": "en_US-amy-medium",
    "bio": "Luna's evening interview show 'Voices from the Frontier' features fascinating individuals from across the Federation. Originally from Earth's Pacific Arcology, she's known for her ability to make anyone feel comfortable sharing their story."
  }
]
```

Create `infra/seed-data/format-clocks.json`:
```json
[
  {
    "id": "clock-001",
    "name": "Standard News Hour",
    "description": "Standard hourly format for news-focused programming",
    "slots": [
      { "slot_type": "station_id", "duration_sec": 30, "order_index": 0 },
      { "slot_type": "news", "duration_sec": 900, "order_index": 1 },
      { "slot_type": "music", "duration_sec": 180, "order_index": 2 },
      { "slot_type": "news", "duration_sec": 600, "order_index": 3 },
      { "slot_type": "music", "duration_sec": 240, "order_index": 4 },
      { "slot_type": "culture", "duration_sec": 720, "order_index": 5 },
      { "slot_type": "music", "duration_sec": 180, "order_index": 6 },
      { "slot_type": "station_id", "duration_sec": 30, "order_index": 7 },
      { "slot_type": "tech", "duration_sec": 420, "order_index": 8 }
    ]
  },
  {
    "id": "clock-002",
    "name": "Culture Mix",
    "description": "Balanced format emphasizing culture and society",
    "slots": [
      { "slot_type": "station_id", "duration_sec": 30, "order_index": 0 },
      { "slot_type": "news", "duration_sec": 480, "order_index": 1 },
      { "slot_type": "music", "duration_sec": 240, "order_index": 2 },
      { "slot_type": "culture", "duration_sec": 900, "order_index": 3 },
      { "slot_type": "music", "duration_sec": 180, "order_index": 4 },
      { "slot_type": "culture", "duration_sec": 600, "order_index": 5 },
      { "slot_type": "music", "duration_sec": 240, "order_index": 6 },
      { "slot_type": "news", "duration_sec": 300, "order_index": 7 }
    ]
  },
  {
    "id": "clock-003",
    "name": "Interview Format",
    "description": "Long-form interview and discussion format",
    "slots": [
      { "slot_type": "station_id", "duration_sec": 30, "order_index": 0 },
      { "slot_type": "news", "duration_sec": 300, "order_index": 1 },
      { "slot_type": "music", "duration_sec": 180, "order_index": 2 },
      { "slot_type": "interview", "duration_sec": 1800, "order_index": 3 },
      { "slot_type": "music", "duration_sec": 240, "order_index": 4 },
      { "slot_type": "culture", "duration_sec": 420, "order_index": 5 }
    ]
  }
]
```

Create `infra/seed-data/programs.json`:
```json
[
  {
    "id": "prog-001",
    "dj_id": "dj-001",
    "format_clock_id": "clock-001",
    "name": "Morning Frontier",
    "description": "Wake up to the latest news, tech breakthroughs, and cultural happenings across the Federation. Zara Nova brings energy and optimism to start your day.",
    "genre": "news",
    "preferred_time_of_day": "morning",
    "preferred_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "active": true
  },
  {
    "id": "prog-002",
    "dj_id": "dj-002",
    "format_clock_id": "clock-002",
    "name": "Culture Synthesis",
    "description": "Exploring the intersection of art, science, philosophy, and society. Marcus Chen guides you through the cultural landscape of our multi-world civilization.",
    "genre": "culture",
    "preferred_time_of_day": "afternoon",
    "preferred_days": null,
    "active": true
  },
  {
    "id": "prog-003",
    "dj_id": "dj-003",
    "format_clock_id": "clock-003",
    "name": "Voices from the Frontier",
    "description": "In-depth conversations with fascinating people shaping our future. Luna Voss sits down with scientists, artists, colonists, and dreamers.",
    "genre": "talk",
    "preferred_time_of_day": "evening",
    "preferred_days": null,
    "active": true
  }
]
```

Create `infra/seed-data/universe-docs.json`:
```json
[
  {
    "title": "The Federation of Worlds - Overview",
    "body": "# The Federation of Worlds\n\nFounded in 2287 after the First Contact Accord, the Federation of Worlds represents humanity's greatest achievement: peaceful cooperation across solar systems.\n\n## Member Worlds\n\n**Core Worlds:**\n- Earth (Sol III) - Original homeworld, now primarily an ecological preserve and cultural center\n- Mars Colony Prime - Industrial and agricultural hub\n- Europa Station - Scientific research center beneath the ice\n- Titan Settlement - Energy production and resource extraction\n\n**Outer Colonies:**\n- Alpha Centauri System - Three inhabited worlds\n- Tau Ceti Outpost - Frontier colony, known for independence\n- Proxima Station - Trading hub\n\n## Government\n\nThe Federation Council meets monthly via quantum-entangled communication. Each world sends representatives based on population. Decisions require a 60% supermajority.\n\n## Technology Level\n\nFaster-than-light travel achieved in 2401 via the Alcubierre-Yamamoto Drive. Travel between core worlds takes weeks; to outer colonies, months. Quantum communication is instantaneous but expensive.\n\n## Population\n\nTotal human population: ~47 billion across all worlds. Earth: 2 billion. Mars: 8 billion. Space stations and habitats: 5 billion. Outer colonies: 32 billion.",
    "lang": "en",
    "content_type": "lore"
  },
  {
    "title": "The Andromedans - First Contact Species",
    "body": "# The Andromedans\n\n## First Contact\n\nIn 2283, humanity detected and successfully communicated with the Andromedans, a species from a neighboring galaxy (actually a mistranslation - they're from the Andromeda sector of our galaxy, ~2,500 light-years away).\n\n## Biology\n\nAndromedans are silicon-based lifeforms existing at much higher temperatures than humans. They perceive time differently due to faster neural processes - what's a minute to us is like an hour to them.\n\n## Society\n\nHighly collective intelligence. Individual Andromedans are semi-autonomous but share thoughts through electromagnetic resonance. They find human individualism both fascinating and inefficient.\n\n## Relations with Humanity\n\nThe Andromedans helped humanity refine FTL technology in exchange for cultural exchanges. They're obsessed with human art, music, and literature, finding our emotional expressions exotic and compelling.\n\n## Current Status\n\nAndromedan ambassador to the Federation resides on Mercury (comfortable temperature). Regular cultural exchanges continue. Trade agreements cover exotic materials and information.",
    "lang": "en",
    "content_type": "lore"
  },
  {
    "title": "History: The Mars Rebellion of 2311",
    "body": "# The Mars Rebellion (2311-2314)\n\n## Background\n\nBy 2310, Mars Colony had 5 billion residents but limited autonomy. Earth-based corporations controlled Martian resources. Growing frustration with \"taxation without representation\" echoed Earth's own history.\n\n## The Spark\n\nIn January 2311, Earth's Federation Council voted to increase mining quotas without consulting Martian representatives. Mars Colony Prime declared independence.\n\n## The Conflict\n\nLargely bloodless. Mars controlled its own infrastructure and life support. Earth couldn't afford a military campaign across interplanetary distances. Standoff lasted three years.\n\n## Resolution\n\nThe Treaty of Olympus Mons (2314) granted Mars full voting rights and resource sovereignty. This precedent established the modern Federation structure where all worlds have equal say.\n\n## Legacy\n\nMars Rebellion Day (March 15) is a Federation holiday celebrating self-determination. The conflict proved violence wasn't inevitable - negotiation and mutual respect could resolve even existential disputes.",
    "lang": "en",
    "content_type": "lore"
  }
]
```

Create `infra/seed-data/events.json`:
```json
[
  {
    "title": "Breakthrough in Quantum Agriculture Announced",
    "summary": "Scientists at Europa Station have successfully grown crops using quantum-entangled photosynthesis, potentially solving food scarcity in deep-space colonies.",
    "body": "Dr. Kenji Yamamoto's team published results showing 300% increase in growth rates with 50% less energy. The technique involves entangling chlorophyll molecules with a quantum field generator. Initial trials will begin on Titan Settlement next month.",
    "event_date": "2025-11-02T10:00:00Z",
    "event_type": "science",
    "importance": 8,
    "tags": ["agriculture", "quantum-tech", "europa", "food-security"]
  },
  {
    "title": "Andromedan Cultural Festival Opens on Mars",
    "summary": "First-ever Andromedan cultural festival showcasing art, music, and literature opens in New Shanghai, Mars Colony Prime.",
    "body": "The three-week festival features Andromedan crystalline sculptures, thermal art installations, and translated literature. Ambassador Resonance-7 emphasized this as a milestone in human-Andromedan relations. Festival runs through November 25th.",
    "event_date": "2025-11-01T14:00:00Z",
    "event_type": "culture",
    "importance": 7,
    "tags": ["andromedans", "culture", "mars", "festival", "first-contact"]
  },
  {
    "title": "Tau Ceti Colony Votes on Federation Membership",
    "summary": "The independent Tau Ceti Outpost holds referendum on joining the Federation after decades of autonomy.",
    "body": "Polls show narrow margin. Proponents cite economic benefits and protection. Opponents fear loss of independence and cultural identity. Results expected within 48 hours. This could set precedent for other frontier colonies.",
    "event_date": "2025-11-02T08:00:00Z",
    "event_type": "politics",
    "importance": 9,
    "tags": ["tau-ceti", "politics", "federation", "colony-rights", "referendum"]
  },
  {
    "title": "Historic Earth-Mars Supernova Visible Tonight",
    "summary": "Supernova SN-2525A in Cygnus constellation will be visible to naked eye from Earth and Mars tonight - first time in 500 years.",
    "event_date": "2025-11-02T20:00:00Z",
    "event_type": "science",
    "importance": 6,
    "tags": ["astronomy", "supernova", "earth", "mars", "sky-watching"]
  }
]
```

### Step 2: Create Seeding Script

Create `infra/seed.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // 1. Seed Format Clocks
    console.log('📋 Seeding format clocks...');
    const formatClocksData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/format-clocks.json'), 'utf8')
    );

    for (const clock of formatClocksData) {
      const { slots, ...clockData } = clock;

      // Insert format clock
      const { data: insertedClock, error: clockError } = await supabase
        .from('format_clocks')
        .insert({
          id: clockData.id,
          name: clockData.name,
          description: clockData.description,
        })
        .select()
        .single();

      if (clockError) {
        console.error(`  ❌ Error inserting clock ${clockData.name}:`, clockError.message);
        continue;
      }

      console.log(`  ✓ Created format clock: ${clockData.name}`);

      // Insert slots
      for (const slot of slots) {
        await supabase.from('format_slots').insert({
          format_clock_id: insertedClock.id,
          slot_type: slot.slot_type,
          duration_sec: slot.duration_sec,
          order_index: slot.order_index,
        });
      }
      console.log(`    → Added ${slots.length} slots`);
    }

    // 2. Seed DJs (Note: DJ table created in A4, might not exist yet)
    console.log('\n🎙️  Seeding DJs...');
    const djsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/djs.json'), 'utf8')
    );

    // Check if djs table exists
    const { error: djCheckError } = await supabase
      .from('djs')
      .select('id')
      .limit(1);

    if (djCheckError && djCheckError.code === '42P01') {
      console.log('  ⚠️  DJs table does not exist yet (created in A4). Skipping DJ seeding.');
      console.log('     Run this seeder again after completing A4.');
    } else {
      for (const dj of djsData) {
        const { error } = await supabase.from('djs').insert(dj);
        if (error) {
          console.error(`  ❌ Error inserting DJ ${dj.name}:`, error.message);
        } else {
          console.log(`  ✓ Created DJ: ${dj.name}`);
        }
      }
    }

    // 3. Seed Programs
    console.log('\n📺 Seeding programs...');
    const programsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/programs.json'), 'utf8')
    );

    for (const program of programsData) {
      const { error } = await supabase.from('programs').insert(program);
      if (error) {
        console.error(`  ❌ Error inserting program ${program.name}:`, error.message);
      } else {
        console.log(`  ✓ Created program: ${program.name}`);
      }
    }

    // 4. Seed Universe Docs
    console.log('\n🌌 Seeding universe lore...');
    const universeDocsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/universe-docs.json'), 'utf8')
    );

    for (const doc of universeDocsData) {
      const { error } = await supabase.from('universe_docs').insert(doc);
      if (error) {
        console.error(`  ❌ Error inserting doc ${doc.title}:`, error.message);
      } else {
        console.log(`  ✓ Created lore doc: ${doc.title}`);
      }
    }

    // 5. Seed Events
    console.log('\n📰 Seeding current events...');
    const eventsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/events.json'), 'utf8')
    );

    for (const event of eventsData) {
      const { error } = await supabase.from('events').insert(event);
      if (error) {
        console.error(`  ❌ Error inserting event ${event.title}:`, error.message);
      } else {
        console.log(`  ✓ Created event: ${event.title}`);
      }
    }

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Format Clocks: ${formatClocksData.length}`);
    console.log(`   DJs: ${djsData.length} (if table exists)`);
    console.log(`   Programs: ${programsData.length}`);
    console.log(`   Universe Docs: ${universeDocsData.length}`);
    console.log(`   Events: ${eventsData.length}`);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
```

### Step 3: Add Seed Script to package.json

Update `package.json`:
```json
{
  "scripts": {
    "seed": "tsx infra/seed.ts",
    "seed:reset": "node infra/migrate.js down && node infra/migrate.js up && tsx infra/seed.ts"
  }
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Seed script creates 3 format clocks with slots
- [ ] Seed script creates 3 DJs (if table exists)
- [ ] Seed script creates 3 programs
- [ ] Seed script creates 3+ universe lore documents
- [ ] Seed script creates 4+ current events
- [ ] Script is idempotent (can run multiple times)

### Quality Requirements
- [ ] Sample data reflects product vision (year 2525, optimistic sci-fi)
- [ ] DJ personalities are distinct and compelling
- [ ] Universe lore is coherent and internally consistent
- [ ] Events are diverse (science, culture, politics)
- [ ] All JSON files are valid

### Manual Verification
- [ ] Run seed script successfully
- [ ] Query database and verify data exists
- [ ] Verify foreign key relationships work
- [ ] Verify unicode/special characters handled correctly

---

## Testing Strategy
```bash
# Run seeding
pnpm seed

# Verify data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM format_clocks;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM format_slots;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM programs;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM universe_docs;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM events;"

# Reset and re-seed
pnpm seed:reset
```

---

## Next Task Handoff

**What this task provides:**

1. **Working radio station:** Immediate content to broadcast
2. **Sample data patterns:** Templates for creating more content
3. **Test fixtures:** Realistic data for development

**Files created:**
- `infra/seed.ts`
- `infra/seed-data/*.json` (5 files)

**All subsequent tasks can now:**
- Test against realistic data
- See the radio station actually work
- Understand the content structure

------------------------------------------------------------

## INSERT AFTER A4 (Line ~14250)

------------------------------------------------------------

# Task A9: Program Management UI

**Tier:** Admin/CMS
**Estimated Time:** 4-5 hours
**Complexity:** Medium
**Prerequisites:** A1 (Admin auth), A4 (DJ management), D9 (Programs tables)

---

## Objective

Create admin UI for managing radio programs (shows). Programs are the core organizational unit - they define which DJ hosts what type of content, using which format clock.

---

## Context from Architecture

**From ARCHITECTURE.md:**

Programs tie together:
- DJ (who hosts)
- Format clock (hourly structure)
- Scheduling hints (when it airs)
- Genre and metadata

Admins need CRUD operations plus ability to activate/deactivate programs.

---

## What You're Building

Admin pages for:
1. Program list with search/filter
2. Create new program form
3. Edit existing program
4. Delete/deactivate program
5. Preview program structure

---

## Implementation Steps

### Step 1: Create Programs API Routes

Create `apps/api/src/routes/admin/programs.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, UUID4
from typing import Optional, List
from supabase import Client
from ..deps import get_supabase, require_admin

router = APIRouter(prefix="/admin/programs", tags=["admin-programs"])

class ProgramCreate(BaseModel):
    dj_id: UUID4
    format_clock_id: UUID4
    name: str
    description: Optional[str] = None
    genre: Optional[str] = None
    preferred_time_of_day: Optional[str] = None
    preferred_days: Optional[List[str]] = None
    active: bool = True

class ProgramUpdate(BaseModel):
    dj_id: Optional[UUID4] = None
    format_clock_id: Optional[UUID4] = None
    name: Optional[str] = None
    description: Optional[str] = None
    genre: Optional[str] = None
    preferred_time_of_day: Optional[str] = None
    preferred_days: Optional[List[str]] = None
    active: Optional[bool] = None

@router.get("")
async def list_programs(
    active_only: bool = False,
    genre: Optional[str] = None,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """List all programs with optional filters"""
    query = supabase.from_("programs").select("""
        *,
        dj:djs(*),
        format_clock:format_clocks(
            *,
            slots:format_slots(*)
        )
    """)

    if active_only:
        query = query.eq("active", True)

    if genre:
        query = query.eq("genre", genre)

    response = query.execute()
    return {"programs": response.data}

@router.get("/{program_id}")
async def get_program(
    program_id: UUID4,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Get single program by ID"""
    response = supabase.from_("programs").select("""
        *,
        dj:djs(*),
        format_clock:format_clocks(
            *,
            slots:format_slots(*)
        )
    """).eq("id", str(program_id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Program not found")

    return response.data[0]

@router.post("")
async def create_program(
    program: ProgramCreate,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Create new program"""
    # Verify DJ exists
    dj_check = supabase.from_("djs").select("id").eq("id", str(program.dj_id)).execute()
    if not dj_check.data:
        raise HTTPException(status_code=400, detail="DJ not found")

    # Verify format clock exists
    clock_check = supabase.from_("format_clocks").select("id").eq("id", str(program.format_clock_id)).execute()
    if not clock_check.data:
        raise HTTPException(status_code=400, detail="Format clock not found")

    # Insert program
    response = supabase.from_("programs").insert(program.dict()).execute()

    return {"program": response.data[0]}

@router.patch("/{program_id}")
async def update_program(
    program_id: UUID4,
    updates: ProgramUpdate,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Update existing program"""
    # Only include non-None fields
    update_data = {k: v for k, v in updates.dict().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")

    response = supabase.from_("programs").update(update_data).eq("id", str(program_id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Program not found")

    return {"program": response.data[0]}

@router.delete("/{program_id}")
async def delete_program(
    program_id: UUID4,
    soft_delete: bool = True,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Delete program (soft delete by default)"""
    if soft_delete:
        # Set active = false instead of deleting
        response = supabase.from_("programs").update({"active": False}).eq("id", str(program_id)).execute()
    else:
        # Hard delete (will fail if segments reference this program)
        response = supabase.from_("programs").delete().eq("id", str(program_id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Program not found")

    return {"success": True}
```

Register routes in `apps/api/src/main.py`:
```python
from .routes.admin import programs

app.include_router(programs.router)
```

### Step 2: Create Frontend Program List Page

Create `apps/admin/src/pages/programs/index.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Program } from '@radio/core';
import { Badge, Button, Table } from '@/components/ui';

export default function ProgramsPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ activeOnly: false, genre: '' });

  useEffect(() => {
    loadPrograms();
  }, [filter]);

  async function loadPrograms() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.activeOnly) params.append('active_only', 'true');
    if (filter.genre) params.append('genre', filter.genre);

    const res = await fetch(`/api/admin/programs?${params}`);
    const data = await res.json();
    setPrograms(data.programs);
    setLoading(false);
  }

  function handleCreate() {
    router.push('/programs/new');
  }

  function handleEdit(id: string) {
    router.push(`/programs/${id}`);
  }

  async function handleToggleActive(program: Program) {
    await fetch(`/api/admin/programs/${program.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !program.active }),
    });
    loadPrograms();
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Programs</h1>
        <Button onClick={handleCreate}>Create Program</Button>
      </div>

      <div className="mb-4 flex gap-4">
        <label>
          <input
            type="checkbox"
            checked={filter.activeOnly}
            onChange={(e) => setFilter({ ...filter, activeOnly: e.target.checked })}
          />
          Active only
        </label>

        <select
          value={filter.genre}
          onChange={(e) => setFilter({ ...filter, genre: e.target.value })}
          className="border px-2 py-1"
        >
          <option value="">All genres</option>
          <option value="news">News</option>
          <option value="culture">Culture</option>
          <option value="talk">Talk</option>
          <option value="music">Music</option>
        </select>
      </div>

      <Table>
        <thead>
          <tr>
            <th>Name</th>
            <th>DJ</th>
            <th>Genre</th>
            <th>Time of Day</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {programs.map((program) => (
            <tr key={program.id}>
              <td className="font-semibold">{program.name}</td>
              <td>{program.dj.name}</td>
              <td><Badge>{program.genre}</Badge></td>
              <td>{program.preferred_time_of_day || 'Any'}</td>
              <td>
                <Badge variant={program.active ? 'success' : 'gray'}>
                  {program.active ? 'Active' : 'Inactive'}
                </Badge>
              </td>
              <td className="space-x-2">
                <Button size="sm" onClick={() => handleEdit(program.id)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggleActive(program)}
                >
                  {program.active ? 'Deactivate' : 'Activate'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
```

### Step 3: Create Program Editor Page

Create `apps/admin/src/pages/programs/[id].tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Program, DJ, FormatClock } from '@radio/core';
import { Button, Input, Select, Textarea } from '@/components/ui';

export default function ProgramEditPage() {
  const router = useRouter();
  const { id } = router.query;
  const isNew = id === 'new';

  const [program, setProgram] = useState<Partial<Program>>({
    active: true,
    preferred_days: [],
  });
  const [djs, setDjs] = useState<DJ[]>([]);
  const [formatClocks, setFormatClocks] = useState<FormatClock[]>([]);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    loadResources();
    if (!isNew && id) {
      loadProgram(id as string);
    }
  }, [id]);

  async function loadResources() {
    const [djsRes, clocksRes] = await Promise.all([
      fetch('/api/admin/djs'),
      fetch('/api/admin/format-clocks'),
    ]);
    setDjs((await djsRes.json()).djs);
    setFormatClocks((await clocksRes.json()).format_clocks);
  }

  async function loadProgram(programId: string) {
    const res = await fetch(`/api/admin/programs/${programId}`);
    const data = await res.json();
    setProgram(data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const url = isNew
      ? '/api/admin/programs'
      : `/api/admin/programs/${id}`;
    const method = isNew ? 'POST' : 'PATCH';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(program),
    });

    if (res.ok) {
      router.push('/programs');
    }
  }

  function updateField(field: string, value: any) {
    setProgram({ ...program, [field]: value });
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">
        {isNew ? 'Create Program' : 'Edit Program'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Program Name"
          value={program.name || ''}
          onChange={(e) => updateField('name', e.target.value)}
          required
        />

        <Select
          label="DJ"
          value={program.dj_id || ''}
          onChange={(e) => updateField('dj_id', e.target.value)}
          required
        >
          <option value="">Select DJ</option>
          {djs.map((dj) => (
            <option key={dj.id} value={dj.id}>
              {dj.name}
            </option>
          ))}
        </Select>

        <Select
          label="Format Clock"
          value={program.format_clock_id || ''}
          onChange={(e) => updateField('format_clock_id', e.target.value)}
          required
        >
          <option value="">Select Format</option>
          {formatClocks.map((clock) => (
            <option key={clock.id} value={clock.id}>
              {clock.name}
            </option>
          ))}
        </Select>

        <Textarea
          label="Description"
          value={program.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          rows={3}
        />

        <Select
          label="Genre"
          value={program.genre || ''}
          onChange={(e) => updateField('genre', e.target.value)}
        >
          <option value="">Select Genre</option>
          <option value="news">News</option>
          <option value="culture">Culture</option>
          <option value="talk">Talk</option>
          <option value="music">Music</option>
        </Select>

        <Select
          label="Preferred Time of Day"
          value={program.preferred_time_of_day || ''}
          onChange={(e) => updateField('preferred_time_of_day', e.target.value)}
        >
          <option value="">Any Time</option>
          <option value="morning">Morning</option>
          <option value="afternoon">Afternoon</option>
          <option value="evening">Evening</option>
          <option value="night">Night</option>
        </Select>

        <div className="flex gap-4">
          <Button type="submit">Save Program</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] List all programs with DJ and format clock info
- [ ] Filter by active status and genre
- [ ] Create new program with validation
- [ ] Edit existing program
- [ ] Soft delete (deactivate) program
- [ ] Cannot create program without valid DJ and format clock

### Quality Requirements
- [ ] Form validation prevents invalid data
- [ ] Error messages are user-friendly
- [ ] Loading states shown during API calls
- [ ] Responsive design works on mobile

### Manual Verification
- [ ] Create new program successfully
- [ ] Edit program and see changes reflected
- [ ] Deactivate program and verify it's hidden from active list
- [ ] Reactivate program
- [ ] Try to create program with invalid DJ ID (should fail)

---

## Next Task Handoff

**What this task provides for A10:**

1. **Program selection:** A10 needs to show which programs use which format clocks
2. **API patterns:** Similar CRUD patterns for format clock management

**Files created:**
- `apps/api/src/routes/admin/programs.py`
- `apps/admin/src/pages/programs/index.tsx`
- `apps/admin/src/pages/programs/[id].tsx`

**A10 will:**
- Build similar UI for format clocks
- Allow editing format clock slots
- Show which programs use each clock

------------------------------------------------------------

## INSERT AFTER A9 (Line ~TBD)

------------------------------------------------------------

# Task A10: Format Clock Editor UI

**Tier:** Admin/CMS
**Estimated Time:** 5-6 hours
**Complexity:** Medium-High
**Prerequisites:** A9 (Program Management), D9 (Format clocks tables)

---

## Objective

Create admin UI for managing format clocks (hourly broadcast structure templates). Format clocks define what types of content air during each hour - the "clockwheel" that traditional radio uses.

---

## Context from Architecture

**From ARCHITECTURE.md:**

Format clocks contain slots defining the hourly structure:
- Slot type (news, music, culture, interview, station_id, etc.)
- Duration in seconds
- Order within the hour

Each program is assigned a format clock, which the scheduler uses to generate segment queues.

---

## What You're Building

Admin UI for:
1. List all format clocks
2. Visual editor for clock slots (drag & drop)
3. Slot duration management (must total 3600 seconds)
4. Preview clock structure
5. Show which programs use each clock
6. Clone existing clocks

---

## Implementation Steps

### Step 1: Create Format Clocks API Routes

Create `apps/api/src/routes/admin/format_clocks.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, UUID4, validator
from typing import List, Optional
from supabase import Client
from ..deps import get_supabase, require_admin

router = APIRouter(prefix="/admin/format-clocks", tags=["admin-format-clocks"])

class FormatSlotCreate(BaseModel):
    slot_type: str
    duration_sec: int
    order_index: int

    @validator('duration_sec')
    def duration_positive(cls, v):
        if v <= 0:
            raise ValueError('Duration must be positive')
        return v

class FormatClockCreate(BaseModel):
    name: str
    description: Optional[str] = None
    slots: List[FormatSlotCreate]

    @validator('slots')
    def validate_slots(cls, v):
        if not v:
            raise ValueError('At least one slot required')

        total_duration = sum(slot.duration_sec for slot in v)
        if total_duration != 3600:
            raise ValueError(f'Total duration must be 3600 seconds (1 hour), got {total_duration}')

        # Check order_index is sequential
        indices = sorted([slot.order_index for slot in v])
        if indices != list(range(len(v))):
            raise ValueError('Slot order_index must be sequential starting from 0')

        return v

class FormatClockUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    slots: Optional[List[FormatSlotCreate]] = None

@router.get("")
async def list_format_clocks(
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """List all format clocks with slots and usage count"""
    response = supabase.from_("format_clocks").select("""
        *,
        slots:format_slots(*),
        programs:programs(id, name)
    """).execute()

    # Add usage count
    for clock in response.data:
        clock['usage_count'] = len(clock.get('programs', []))

    return {"format_clocks": response.data}

@router.get("/{clock_id}")
async def get_format_clock(
    clock_id: UUID4,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Get single format clock by ID"""
    response = supabase.from_("format_clocks").select("""
        *,
        slots:format_slots(*),
        programs:programs(id, name)
    """).eq("id", str(clock_id)).order("slots.order_index").execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Format clock not found")

    return response.data[0]

@router.post("")
async def create_format_clock(
    clock: FormatClockCreate,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Create new format clock with slots"""
    # Check if name already exists
    existing = supabase.from_("format_clocks").select("id").eq("name", clock.name).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Format clock with this name already exists")

    # Insert format clock
    clock_response = supabase.from_("format_clocks").insert({
        "name": clock.name,
        "description": clock.description,
        "total_duration_sec": sum(slot.duration_sec for slot in clock.slots)
    }).execute()

    clock_id = clock_response.data[0]['id']

    # Insert slots
    slots_data = [
        {
            "format_clock_id": clock_id,
            "slot_type": slot.slot_type,
            "duration_sec": slot.duration_sec,
            "order_index": slot.order_index
        }
        for slot in clock.slots
    ]

    supabase.from_("format_slots").insert(slots_data).execute()

    # Return complete clock
    return await get_format_clock(clock_id, supabase, _user)

@router.put("/{clock_id}")
async def update_format_clock(
    clock_id: UUID4,
    updates: FormatClockUpdate,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Update format clock and optionally replace all slots"""
    # Check clock exists
    existing = supabase.from_("format_clocks").select("id").eq("id", str(clock_id)).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Format clock not found")

    # Update clock metadata
    update_data = {}
    if updates.name is not None:
        update_data['name'] = updates.name
    if updates.description is not None:
        update_data['description'] = updates.description

    if update_data:
        supabase.from_("format_clocks").update(update_data).eq("id", str(clock_id)).execute()

    # If slots provided, replace all slots
    if updates.slots is not None:
        # Delete existing slots
        supabase.from_("format_slots").delete().eq("format_clock_id", str(clock_id)).execute()

        # Insert new slots
        slots_data = [
            {
                "format_clock_id": str(clock_id),
                "slot_type": slot.slot_type,
                "duration_sec": slot.duration_sec,
                "order_index": slot.order_index
            }
            for slot in updates.slots
        ]

        supabase.from_("format_slots").insert(slots_data).execute()

        # Update total duration
        total = sum(slot.duration_sec for slot in updates.slots)
        supabase.from_("format_clocks").update({"total_duration_sec": total}).eq("id", str(clock_id)).execute()

    # Return updated clock
    return await get_format_clock(clock_id, supabase, _user)

@router.post("/{clock_id}/clone")
async def clone_format_clock(
    clock_id: UUID4,
    new_name: str,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Clone an existing format clock"""
    # Get original clock
    original = await get_format_clock(clock_id, supabase, _user)

    # Create new clock with copied slots
    new_clock = FormatClockCreate(
        name=new_name,
        description=f"Cloned from {original['name']}",
        slots=[
            FormatSlotCreate(
                slot_type=slot['slot_type'],
                duration_sec=slot['duration_sec'],
                order_index=slot['order_index']
            )
            for slot in sorted(original['slots'], key=lambda x: x['order_index'])
        ]
    )

    return await create_format_clock(new_clock, supabase, _user)

@router.delete("/{clock_id}")
async def delete_format_clock(
    clock_id: UUID4,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Delete format clock (only if not used by any programs)"""
    # Check if used by programs
    programs = supabase.from_("programs").select("id").eq("format_clock_id", str(clock_id)).execute()

    if programs.data:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete format clock: used by {len(programs.data)} program(s)"
        )

    # Delete slots (cascade should handle this, but explicit is better)
    supabase.from_("format_slots").delete().eq("format_clock_id", str(clock_id)).execute()

    # Delete clock
    response = supabase.from_("format_clocks").delete().eq("id", str(clock_id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Format clock not found")

    return {"success": True}
```

Register in `apps/api/src/main.py`:
```python
from .routes.admin import format_clocks

app.include_router(format_clocks.router)
```

### Step 2: Create Format Clock List Page

Create `apps/admin/src/pages/format-clocks/index.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { FormatClock } from '@radio/core';
import { Badge, Button, Table } from '@/components/ui';

export default function FormatClocksPage() {
  const router = useRouter();
  const [clocks, setClocks] = useState<FormatClock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClocks();
  }, []);

  async function loadClocks() {
    setLoading(true);
    const res = await fetch('/api/admin/format-clocks');
    const data = await res.json();
    setClocks(data.format_clocks);
    setLoading(false);
  }

  function handleCreate() {
    router.push('/format-clocks/new');
  }

  function handleEdit(id: string) {
    router.push(`/format-clocks/${id}`);
  }

  async function handleClone(clock: FormatClock) {
    const newName = prompt(`Clone "${clock.name}" as:`, `${clock.name} (Copy)`);
    if (!newName) return;

    await fetch(`/api/admin/format-clocks/${clock.id}/clone?new_name=${encodeURIComponent(newName)}`, {
      method: 'POST',
    });
    loadClocks();
  }

  async function handleDelete(clock: FormatClock) {
    if (!confirm(`Delete format clock "${clock.name}"?`)) return;

    const res = await fetch(`/api/admin/format-clocks/${clock.id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const error = await res.json();
      alert(error.detail);
      return;
    }

    loadClocks();
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Format Clocks</h1>
        <Button onClick={handleCreate}>Create Format Clock</Button>
      </div>

      <Table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slots</th>
            <th>Total Duration</th>
            <th>Used By</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {clocks.map((clock) => (
            <tr key={clock.id}>
              <td className="font-semibold">{clock.name}</td>
              <td>{clock.slots?.length || 0} slots</td>
              <td>
                <Badge variant={clock.total_duration_sec === 3600 ? 'success' : 'warning'}>
                  {formatDuration(clock.total_duration_sec || 0)}
                </Badge>
              </td>
              <td>{clock.usage_count || 0} program(s)</td>
              <td className="space-x-2">
                <Button size="sm" onClick={() => handleEdit(clock.id)}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleClone(clock)}>
                  Clone
                </Button>
                {clock.usage_count === 0 && (
                  <Button size="sm" variant="danger" onClick={() => handleDelete(clock)}>
                    Delete
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
```

### Step 3: Create Visual Format Clock Editor

Create `apps/admin/src/pages/format-clocks/[id].tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { FormatClock, FormatSlot } from '@radio/core';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SLOT_TYPES = [
  { value: 'news', label: 'News', color: 'bg-red-100' },
  { value: 'culture', label: 'Culture', color: 'bg-purple-100' },
  { value: 'tech', label: 'Tech', color: 'bg-blue-100' },
  { value: 'interview', label: 'Interview', color: 'bg-green-100' },
  { value: 'music', label: 'Music', color: 'bg-yellow-100' },
  { value: 'station_id', label: 'Station ID', color: 'bg-gray-100' },
  { value: 'weather', label: 'Weather', color: 'bg-cyan-100' },
];

function SortableSlot({ slot, index, onUpdate, onDelete }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: slot.id || index,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const slotTypeInfo = SLOT_TYPES.find(t => t.value === slot.slot_type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-4 border rounded ${slotTypeInfo?.color} mb-2`}
      {...attributes}
    >
      <div className="flex items-center gap-4">
        <div {...listeners} className="cursor-move text-gray-400">
          ⋮⋮
        </div>

        <div className="flex-1 grid grid-cols-3 gap-4">
          <Select
            value={slot.slot_type}
            onChange={(e) => onUpdate(index, 'slot_type', e.target.value)}
          >
            {SLOT_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </Select>

          <Input
            type="number"
            value={slot.duration_sec}
            onChange={(e) => onUpdate(index, 'duration_sec', parseInt(e.target.value))}
            placeholder="Duration (seconds)"
          />

          <div className="text-sm text-gray-600 self-center">
            {Math.floor(slot.duration_sec / 60)}:{(slot.duration_sec % 60).toString().padStart(2, '0')} min
          </div>
        </div>

        <Button size="sm" variant="danger" onClick={() => onDelete(index)}>
          ✕
        </Button>
      </div>
    </div>
  );
}

export default function FormatClockEditPage() {
  const router = useRouter();
  const { id } = router.query;
  const isNew = id === 'new';

  const [clock, setClock] = useState<Partial<FormatClock>>({
    name: '',
    description: '',
  });
  const [slots, setSlots] = useState<Partial<FormatSlot>[]>([
    { slot_type: 'station_id', duration_sec: 30, order_index: 0 },
  ]);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!isNew && id) {
      loadClock(id as string);
    }
  }, [id]);

  async function loadClock(clockId: string) {
    const res = await fetch(`/api/admin/format-clocks/${clockId}`);
    const data = await res.json();
    setClock(data);
    setSlots(data.slots.sort((a: any, b: any) => a.order_index - b.order_index));
    setLoading(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSlots((items) => {
      const oldIndex = items.findIndex((_, i) => i === active.id);
      const newIndex = items.findIndex((_, i) => i === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  function addSlot() {
    setSlots([...slots, {
      slot_type: 'news',
      duration_sec: 300,
      order_index: slots.length,
    }]);
  }

  function updateSlot(index: number, field: string, value: any) {
    const updated = [...slots];
    updated[index] = { ...updated[index], [field]: value };
    setSlots(updated);
  }

  function deleteSlot(index: number) {
    setSlots(slots.filter((_, i) => i !== index));
  }

  const totalDuration = slots.reduce((sum, slot) => sum + (slot.duration_sec || 0), 0);
  const isValidDuration = totalDuration === 3600;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isValidDuration) {
      alert('Total duration must be exactly 60 minutes (3600 seconds)');
      return;
    }

    // Update order_index based on current order
    const orderedSlots = slots.map((slot, index) => ({
      ...slot,
      order_index: index,
    }));

    const payload = {
      name: clock.name,
      description: clock.description,
      slots: orderedSlots,
    };

    const url = isNew
      ? '/api/admin/format-clocks'
      : `/api/admin/format-clocks/${id}`;
    const method = isNew ? 'POST' : 'PUT';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      router.push('/format-clocks');
    } else {
      const error = await res.json();
      alert(error.detail);
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">
        {isNew ? 'Create Format Clock' : 'Edit Format Clock'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Clock Name"
          value={clock.name || ''}
          onChange={(e) => setClock({ ...clock, name: e.target.value })}
          required
        />

        <Textarea
          label="Description"
          value={clock.description || ''}
          onChange={(e) => setClock({ ...clock, description: e.target.value })}
          rows={2}
        />

        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Slots</h2>
            <div className="flex items-center gap-4">
              <div className={`font-semibold ${isValidDuration ? 'text-green-600' : 'text-red-600'}`}>
                Total: {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, '0')}
                {isValidDuration ? ' ✓' : ' (must be 60:00)'}
              </div>
              <Button type="button" onClick={addSlot}>Add Slot</Button>
            </div>
          </div>

          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={slots.map((_, i) => i)} strategy={verticalListSortingStrategy}>
              {slots.map((slot, index) => (
                <SortableSlot
                  key={index}
                  slot={slot}
                  index={index}
                  onUpdate={updateSlot}
                  onDelete={deleteSlot}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={!isValidDuration}>
            Save Format Clock
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>

      {/* Visual Preview */}
      <div className="mt-8 border-t pt-8">
        <h3 className="text-lg font-bold mb-4">Hour Preview</h3>
        <div className="relative h-16 bg-gray-100 rounded overflow-hidden">
          {slots.reduce((acc, slot) => {
            const percentage = ((slot.duration_sec || 0) / 3600) * 100;
            const slotTypeInfo = SLOT_TYPES.find(t => t.value === slot.slot_type);
            const left = acc.offset;

            acc.elements.push(
              <div
                key={acc.index}
                className={`absolute h-full ${slotTypeInfo?.color} border-r border-gray-400`}
                style={{
                  left: `${left}%`,
                  width: `${percentage}%`,
                }}
                title={`${slot.slot_type} - ${slot.duration_sec}s`}
              >
                <div className="text-xs p-1 truncate">{slot.slot_type}</div>
              </div>
            );

            return {
              offset: left + percentage,
              elements: acc.elements,
              index: acc.index + 1,
            };
          }, { offset: 0, elements: [] as JSX.Element[], index: 0 }).elements}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0:00</span>
          <span>15:00</span>
          <span>30:00</span>
          <span>45:00</span>
          <span>60:00</span>
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Install Drag & Drop Dependencies

Update `apps/admin/package.json`:
```json
{
  "dependencies": {
    "@dnd-kit/core": "^6.0.8",
    "@dnd-kit/sortable": "^7.0.2",
    "@dnd-kit/utilities": "^3.2.1"
  }
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] List all format clocks with slot count and usage
- [ ] Create new format clock with slots
- [ ] Visual drag-and-drop slot reordering
- [ ] Edit slot type and duration
- [ ] Add/remove slots dynamically
- [ ] Validation: total duration must be 3600 seconds
- [ ] Clone existing format clock
- [ ] Cannot delete clock used by programs
- [ ] Visual hour preview shows slot proportions

### Quality Requirements
- [ ] Drag-and-drop is smooth and intuitive
- [ ] Real-time duration calculation updates
- [ ] Visual feedback for valid/invalid duration
- [ ] Color-coded slot types for easy identification
- [ ] Responsive design

### Manual Verification
- [ ] Create format clock with 4-5 slots totaling 60 minutes
- [ ] Drag slots to reorder them
- [ ] Try to save with duration != 60 minutes (should fail)
- [ ] Edit existing clock and add a slot
- [ ] Clone a format clock
- [ ] Try to delete clock used by a program (should fail)
- [ ] Delete unused clock successfully

---

## Testing Strategy
```bash
# Test API
curl -X POST http://localhost:8000/admin/format-clocks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Clock",
    "description": "Test",
    "slots": [
      {"slot_type": "news", "duration_sec": 1800, "order_index": 0},
      {"slot_type": "music", "duration_sec": 1800, "order_index": 1}
    ]
  }'

# Test validation (should fail - not 3600 seconds)
curl -X POST http://localhost:8000/admin/format-clocks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Invalid Clock",
    "slots": [
      {"slot_type": "news", "duration_sec": 1000, "order_index": 0}
    ]
  }'
```

---

## Next Task Handoff

**What this task provides for A11:**

1. **Format clock selection:** A11 can assign programs to time slots
2. **Visual patterns:** Drag-and-drop patterns for schedule management

**Files created:**
- `apps/api/src/routes/admin/format_clocks.py`
- `apps/admin/src/pages/format-clocks/index.tsx`
- `apps/admin/src/pages/format-clocks/[id].tsx`

**A11 will:**
- Build weekly/daily schedule grid
- Allow assigning programs to time slots
- Show format clock structure within schedule

------------------------------------------------------------

## INSERT AFTER A10 (Line ~TBD)

------------------------------------------------------------

# Task A11: Broadcast Schedule/Timetable Manager UI

**Tier:** Admin/CMS
**Estimated Time:** 6-7 hours
**Complexity:** High
**Prerequisites:** A10 (Format Clock Editor), A9 (Program Management)

---

## Objective

Create admin UI for managing the broadcast schedule - defining which programs air at which times and days. This is the "program grid" that schedulers use to plan the broadcast day.

---

## Context from Product Vision

**From PRODUCT VISION.md:**

Admins need to manage the timetable - deciding which programs run at which times. Different programs might air during morning vs evening, weekdays vs weekends.

---

## What You're Building

Admin UI for:
1. Weekly broadcast grid view
2. Assign programs to time slots
3. Set recurring schedules (e.g., "Monday-Friday 6-9 AM")
4. Conflict detection (overlapping programs)
5. Template schedules for weekdays/weekends
6. Preview upcoming broadcasts

---

## Implementation Steps

### Step 1: Create Schedule Tables Migration

Create `infra/migrations/011_create_broadcast_schedule.sql`:
```sql
-- Migration: Create broadcast schedule tables
-- Description: Defines which programs air at which times
-- Author: AI Radio Team
-- Date: 2025-01-01

CREATE TABLE broadcast_schedule (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,

  -- Day of week (0 = Sunday, 6 = Saturday, NULL = every day)
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),

  -- Time range
  start_time TIME NOT NULL,  -- e.g., '06:00:00' for 6 AM
  end_time TIME NOT NULL,    -- e.g., '09:00:00' for 9 AM

  -- Active status
  active BOOLEAN DEFAULT true,

  -- Priority (higher = takes precedence in conflicts)
  priority INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation: end_time must be after start_time
  CHECK (end_time > start_time)
);

-- Indexes
CREATE INDEX idx_broadcast_schedule_program ON broadcast_schedule(program_id);
CREATE INDEX idx_broadcast_schedule_day ON broadcast_schedule(day_of_week);
CREATE INDEX idx_broadcast_schedule_time ON broadcast_schedule(start_time, end_time);
CREATE INDEX idx_broadcast_schedule_active ON broadcast_schedule(active) WHERE active = true;

-- Trigger
CREATE TRIGGER broadcast_schedule_updated_at
  BEFORE UPDATE ON broadcast_schedule
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to detect schedule conflicts
CREATE OR REPLACE FUNCTION check_schedule_conflicts(
  p_day_of_week INT,
  p_start_time TIME,
  p_end_time TIME,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE(
  conflict_id UUID,
  program_name TEXT,
  start_time TIME,
  end_time TIME
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    p.name,
    s.start_time,
    s.end_time
  FROM broadcast_schedule s
  JOIN programs p ON p.id = s.program_id
  WHERE s.active = true
    AND (s.day_of_week = p_day_of_week OR s.day_of_week IS NULL OR p_day_of_week IS NULL)
    AND (s.id != p_exclude_id OR p_exclude_id IS NULL)
    AND (
      (s.start_time <= p_start_time AND s.end_time > p_start_time) OR
      (s.start_time < p_end_time AND s.end_time >= p_end_time) OR
      (s.start_time >= p_start_time AND s.end_time <= p_end_time)
    );
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE broadcast_schedule IS 'Defines which programs air at which times/days';
COMMENT ON COLUMN broadcast_schedule.day_of_week IS '0=Sunday, 6=Saturday, NULL=every day';
COMMENT ON COLUMN broadcast_schedule.start_time IS 'Local time when program starts';
COMMENT ON COLUMN broadcast_schedule.priority IS 'Higher priority wins in conflicts';
```

Rollback `infra/migrations/011_create_broadcast_schedule_down.sql`:
```sql
DROP FUNCTION IF EXISTS check_schedule_conflicts;
DROP TRIGGER IF EXISTS broadcast_schedule_updated_at ON broadcast_schedule;
DROP TABLE IF EXISTS broadcast_schedule;
```

### Step 2: Create Schedule API Routes

Create `apps/api/src/routes/admin/broadcast_schedule.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, UUID4, validator
from datetime import time
from typing import Optional, List
from supabase import Client
from ..deps import get_supabase, require_admin

router = APIRouter(prefix="/admin/broadcast-schedule", tags=["admin-schedule"])

class ScheduleSlotCreate(BaseModel):
    program_id: UUID4
    day_of_week: Optional[int] = None  # None = every day
    start_time: time
    end_time: time
    priority: int = 0

    @validator('day_of_week')
    def validate_day(cls, v):
        if v is not None and not (0 <= v <= 6):
            raise ValueError('day_of_week must be 0-6 or None')
        return v

    @validator('end_time')
    def validate_times(cls, v, values):
        if 'start_time' in values and v <= values['start_time']:
            raise ValueError('end_time must be after start_time')
        return v

class ScheduleSlotUpdate(BaseModel):
    program_id: Optional[UUID4] = None
    day_of_week: Optional[int] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    priority: Optional[int] = None
    active: Optional[bool] = None

@router.get("")
async def get_full_schedule(
    day_of_week: Optional[int] = None,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Get full broadcast schedule"""
    query = supabase.from_("broadcast_schedule").select("""
        *,
        program:programs(
            id,
            name,
            dj:djs(name),
            format_clock:format_clocks(name)
        )
    """)

    if day_of_week is not None:
        # Get slots for specific day OR slots that apply to all days
        query = query.or_(f"day_of_week.eq.{day_of_week},day_of_week.is.null")

    response = query.order("start_time").execute()
    return {"schedule": response.data}

@router.get("/grid")
async def get_schedule_grid(
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Get schedule organized as weekly grid"""
    all_slots = await get_full_schedule(supabase=supabase, _user=_user)

    # Organize by day
    grid = {day: [] for day in range(7)}
    grid['all_days'] = []

    for slot in all_slots['schedule']:
        day = slot.get('day_of_week')
        if day is None:
            grid['all_days'].append(slot)
        else:
            grid[day].append(slot)

    return {"grid": grid}

@router.post("")
async def create_schedule_slot(
    slot: ScheduleSlotCreate,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Create new schedule slot with conflict detection"""
    # Check for conflicts
    conflicts = supabase.rpc('check_schedule_conflicts', {
        'p_day_of_week': slot.day_of_week,
        'p_start_time': slot.start_time.isoformat(),
        'p_end_time': slot.end_time.isoformat(),
    }).execute()

    if conflicts.data:
        return {
            "conflicts": conflicts.data,
            "message": "Schedule conflicts detected. Set higher priority to override."
        }

    # Insert schedule slot
    response = supabase.from_("broadcast_schedule").insert(slot.dict()).execute()
    return {"schedule_slot": response.data[0]}

@router.patch("/{slot_id}")
async def update_schedule_slot(
    slot_id: UUID4,
    updates: ScheduleSlotUpdate,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Update schedule slot"""
    update_data = {k: v for k, v in updates.dict().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")

    response = supabase.from_("broadcast_schedule").update(update_data).eq("id", str(slot_id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Schedule slot not found")

    return {"schedule_slot": response.data[0]}

@router.delete("/{slot_id}")
async def delete_schedule_slot(
    slot_id: UUID4,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Delete schedule slot"""
    response = supabase.from_("broadcast_schedule").delete().eq("id", str(slot_id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Schedule slot not found")

    return {"success": True}

@router.post("/template/{template_name}")
async def apply_schedule_template(
    template_name: str,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Apply a pre-defined schedule template"""
    # This is a placeholder for template functionality
    # Could be expanded to load templates from config/database
    templates = {
        "24_7_continuous": {
            "description": "Same program 24/7",
            # Would contain schedule slot definitions
        },
        "weekday_weekend": {
            "description": "Different schedules for weekdays vs weekends",
        }
    }

    if template_name not in templates:
        raise HTTPException(status_code=404, detail="Template not found")

    # Implementation would create schedule slots based on template
    return {"message": f"Template '{template_name}' applied"}
```

### Step 3: Create Schedule Grid UI

Create `apps/admin/src/pages/broadcast-schedule/index.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface ScheduleSlot {
  id: string;
  program: {
    id: string;
    name: string;
    dj: { name: string };
  };
  start_time: string;
  end_time: string;
  day_of_week: number | null;
  priority: number;
}

export default function BroadcastSchedulePage() {
  const [grid, setGrid] = useState<Record<string, ScheduleSlot[]>>({});
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [gridRes, programsRes] = await Promise.all([
      fetch('/api/admin/broadcast-schedule/grid'),
      fetch('/api/admin/programs?active_only=true'),
    ]);

    const gridData = await gridRes.json();
    const programsData = await programsRes.json();

    setGrid(gridData.grid);
    setPrograms(programsData.programs);
    setLoading(false);
  }

  async function addScheduleSlot(day: number, hour: number) {
    if (!selectedProgram) {
      alert('Please select a program first');
      return;
    }

    const slot = {
      program_id: selectedProgram,
      day_of_week: day,
      start_time: `${hour.toString().padStart(2, '0')}:00:00`,
      end_time: `${((hour + 1) % 24).toString().padStart(2, '0')}:00:00`,
      priority: 0,
    };

    const res = await fetch('/api/admin/broadcast-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slot),
    });

    const data = await res.json();

    if (data.conflicts && data.conflicts.length > 0) {
      const override = confirm(
        `Conflicts detected with:\n${data.conflicts.map((c: any) => c.program_name).join('\n')}\n\nAdd anyway?`
      );
      if (!override) return;

      // Add with higher priority
      slot.priority = 10;
      await fetch('/api/admin/broadcast-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slot),
      });
    }

    loadData();
  }

  async function deleteSlot(slotId: string) {
    if (!confirm('Remove this schedule slot?')) return;

    await fetch(`/api/admin/broadcast-schedule/${slotId}`, {
      method: 'DELETE',
    });

    loadData();
  }

  function getSlotForCell(day: number, hour: number): ScheduleSlot | null {
    const daySlots = grid[day] || [];
    const allDaySlots = grid['all_days'] || [];

    const allSlots = [...daySlots, ...allDaySlots];

    for (const slot of allSlots) {
      const startHour = parseInt(slot.start_time.split(':')[0]);
      const endHour = parseInt(slot.end_time.split(':')[0]);

      if (hour >= startHour && hour < endHour) {
        return slot;
      }
    }

    return null;
  }

  function getCellColor(slot: ScheduleSlot | null): string {
    if (!slot) return 'bg-gray-50 hover:bg-gray-100';

    const colors = [
      'bg-blue-100', 'bg-green-100', 'bg-yellow-100',
      'bg-purple-100', 'bg-pink-100', 'bg-indigo-100',
    ];

    const index = programs.findIndex(p => p.id === slot.program.id);
    return colors[index % colors.length];
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">Broadcast Schedule</h1>

        <div className="flex gap-4 items-center">
          <label className="font-semibold">Select Program:</label>
          <select
            className="border px-3 py-2 rounded"
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
          >
            <option value="">-- Choose Program --</option>
            {programs.map(program => (
              <option key={program.id} value={program.id}>
                {program.name} ({program.dj.name})
              </option>
            ))}
          </select>

          <span className="text-sm text-gray-600">
            Click on a time slot to assign the selected program
          </span>
        </div>
      </div>

      {/* Weekly Grid */}
      <div className="overflow-x-auto">
        <table className="border-collapse border w-full text-sm">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-200 sticky left-0">Hour</th>
              {DAYS.map((day, idx) => (
                <th key={idx} className="border p-2 bg-gray-200">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour}>
                <td className="border p-2 font-semibold bg-gray-100 sticky left-0">
                  {hour.toString().padStart(2, '0')}:00
                </td>
                {DAYS.map((_, day) => {
                  const slot = getSlotForCell(day, hour);
                  return (
                    <td
                      key={day}
                      className={`border p-1 cursor-pointer ${getCellColor(slot)}`}
                      onClick={() => !slot && addScheduleSlot(day, hour)}
                    >
                      {slot ? (
                        <div className="relative group">
                          <div className="text-xs font-semibold truncate">
                            {slot.program.name}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            {slot.program.dj.name}
                          </div>
                          <button
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-red-600 font-bold"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSlot(slot.id);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="text-center text-gray-400 text-xs">+</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded">
        <h3 className="font-bold mb-2">Programs:</h3>
        <div className="grid grid-cols-3 gap-2">
          {programs.map((program, idx) => {
            const colors = [
              'bg-blue-100', 'bg-green-100', 'bg-yellow-100',
              'bg-purple-100', 'bg-pink-100', 'bg-indigo-100',
            ];
            return (
              <div key={program.id} className={`p-2 rounded ${colors[idx % colors.length]}`}>
                <div className="font-semibold text-sm">{program.name}</div>
                <div className="text-xs text-gray-600">{program.dj.name}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Display weekly schedule grid (7 days × 24 hours)
- [ ] Click to assign program to time slot
- [ ] Remove program from time slot
- [ ] Conflict detection warns about overlaps
- [ ] Color-coded programs in grid
- [ ] Support "all days" slots (applies to every day)
- [ ] Responsive grid (scrollable on mobile)

### Quality Requirements
- [ ] Grid is intuitive and easy to use
- [ ] Visual feedback on hover
- [ ] Conflict warnings are clear
- [ ] Performance is good even with full schedule

### Manual Verification
- [ ] Create schedule slot for program
- [ ] Assign program to multiple days/times
- [ ] Try to create overlapping slots (see conflict warning)
- [ ] Remove schedule slot
- [ ] View schedule for different days

---

## Testing Strategy
```bash
# Run migration
node infra/migrate.js up

# Test API
curl -X POST http://localhost:8000/admin/broadcast-schedule \
  -H "Content-Type: application/json" \
  -d '{
    "program_id": "prog-001",
    "day_of_week": 1,
    "start_time": "06:00:00",
    "end_time": "09:00:00"
  }'

# Test conflict detection
curl -X POST http://localhost:8000/admin/broadcast-schedule \
  -H "Content-Type: application/json" \
  -d '{
    "program_id": "prog-002",
    "day_of_week": 1,
    "start_time": "08:00:00",
    "end_time": "10:00:00"
  }'
```

---

## Next Task Handoff

**What this task provides for P3:**

1. **Schedule data:** P3 Scheduler Worker reads this to generate segments
2. **Program timing:** Knows which program to generate segments for at any given time

**Files created:**
- `infra/migrations/011_create_broadcast_schedule.sql`
- `apps/api/src/routes/admin/broadcast_schedule.py`
- `apps/admin/src/pages/broadcast-schedule/index.tsx`

**P3 will:**
- Query broadcast_schedule to determine current/upcoming programs
- Generate segments based on assigned programs and format clocks
- Respect schedule priorities

------------------------------------------------------------

## INSERT AFTER M1 (Music Tier)

------------------------------------------------------------

# Task A12: Music Library Management UI

**Tier:** Admin/CMS (Music & Audio tier)
**Estimated Time:** 5-6 hours
**Complexity:** Medium
**Prerequisites:** M1 (Music database schema), A1 (Admin auth)

---

## Objective

Create admin UI for uploading and managing music files. Allows admins to build the music library with metadata, tagging, and organization for use in broadcasts.

---

## Context from Architecture

**From M1:** Music library includes tracks with metadata (title, artist, album, genre, mood, energy level) and audio files stored in Supabase Storage.

---

## What You're Building

Admin UI for:
1. Music library browser/grid view
2. File upload with metadata
3. Bulk upload support
4. Metadata editing
5. Tag management (genre, mood, energy)
6. Audio preview player
7. Search and filter

---

## Implementation Steps

### Step 1: Create Music API Routes

Create `apps/api/src/routes/admin/music.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, UUID4
from typing import Optional, List
from supabase import Client
from ..deps import get_supabase, require_admin
import hashlib

router = APIRouter(prefix="/admin/music", tags=["admin-music"])

class MusicTrackCreate(BaseModel):
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    mood: Optional[str] = None
    energy_level: Optional[int] = None
    duration_sec: Optional[float] = None
    tags: Optional[List[str]] = []

class MusicTrackUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    mood: Optional[str] = None
    energy_level: Optional[int] = None
    tags: Optional[List[str]] = None

@router.get("")
async def list_music(
    genre: Optional[str] = None,
    mood: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """List music tracks with filters"""
    query = supabase.from_("music_tracks").select("*")

    if genre:
        query = query.eq("genre", genre)
    if mood:
        query = query.eq("mood", mood)
    if search:
        query = query.or_(f"title.ilike.%{search}%,artist.ilike.%{search}%")

    response = query.order("created_at", desc=True).limit(limit).offset(offset).execute()
    return {"tracks": response.data, "total": len(response.data)}

@router.get("/{track_id}")
async def get_music_track(
    track_id: UUID4,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Get single music track"""
    response = supabase.from_("music_tracks").select("*").eq("id", str(track_id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Track not found")

    # Get signed URL for audio file
    if response.data[0].get('storage_path'):
        signed_url = supabase.storage.from_("music").create_signed_url(
            response.data[0]['storage_path'],
            3600  # 1 hour
        )
        response.data[0]['audio_url'] = signed_url['signedURL']

    return response.data[0]

@router.post("/upload")
async def upload_music_file(
    file: UploadFile = File(...),
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Upload music file to storage"""
    # Validate file type
    if not file.content_type or not file.content_type.startswith('audio/'):
        raise HTTPException(status_code=400, detail="File must be audio format")

    # Read file content
    content = await file.read()

    # Generate content hash for deduplication
    file_hash = hashlib.sha256(content).hexdigest()

    # Check if file already exists
    existing = supabase.from_("music_tracks").select("id, title").eq("file_hash", file_hash).execute()
    if existing.data:
        return {
            "duplicate": True,
            "existing_track": existing.data[0],
            "message": "File already exists in library"
        }

    # Upload to Supabase Storage
    storage_path = f"tracks/{file_hash[:2]}/{file_hash}.{file.filename.split('.')[-1]}"

    supabase.storage.from_("music").upload(
        storage_path,
        content,
        {"content-type": file.content_type}
    )

    return {
        "storage_path": storage_path,
        "file_hash": file_hash,
        "filename": file.filename
    }

@router.post("")
async def create_music_track(
    track: MusicTrackCreate,
    storage_path: str,
    file_hash: str,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Create music track metadata after upload"""
    track_data = track.dict()
    track_data['storage_path'] = storage_path
    track_data['file_hash'] = file_hash

    response = supabase.from_("music_tracks").insert(track_data).execute()
    return {"track": response.data[0]}

@router.patch("/{track_id}")
async def update_music_track(
    track_id: UUID4,
    updates: MusicTrackUpdate,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Update music track metadata"""
    update_data = {k: v for k, v in updates.dict().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")

    response = supabase.from_("music_tracks").update(update_data).eq("id", str(track_id)).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Track not found")

    return {"track": response.data[0]}

@router.delete("/{track_id}")
async def delete_music_track(
    track_id: UUID4,
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Delete music track and file"""
    # Get track info
    track = await get_music_track(track_id, supabase, _user)

    # Delete file from storage
    if track.get('storage_path'):
        supabase.storage.from_("music").remove([track['storage_path']])

    # Delete database record
    supabase.from_("music_tracks").delete().eq("id", str(track_id)).execute()

    return {"success": True}

@router.get("/stats/overview")
async def get_music_stats(
    supabase: Client = Depends(get_supabase),
    _user = Depends(require_admin)
):
    """Get music library statistics"""
    total = supabase.from_("music_tracks").select("id", count="exact").execute()

    by_genre = supabase.from_("music_tracks").select("genre").execute()
    genre_counts = {}
    for track in by_genre.data:
        genre = track.get('genre') or 'Unknown'
        genre_counts[genre] = genre_counts.get(genre, 0) + 1

    return {
        "total_tracks": total.count,
        "by_genre": genre_counts,
    }
```

### Step 2: Create Music Library UI

Create `apps/admin/src/pages/music/index.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Input, Select, Badge } from '@/components/ui';

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  mood: string;
  duration_sec: number;
  tags: string[];
  audio_url?: string;
}

export default function MusicLibraryPage() {
  const router = useRouter();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ genre: '', mood: '', search: '' });
  const [stats, setStats] = useState<any>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);

  useEffect(() => {
    loadTracks();
    loadStats();
  }, [filter]);

  async function loadTracks() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.genre) params.append('genre', filter.genre);
    if (filter.mood) params.append('mood', filter.mood);
    if (filter.search) params.append('search', filter.search);

    const res = await fetch(`/api/admin/music?${params}`);
    const data = await res.json();
    setTracks(data.tracks);
    setLoading(false);
  }

  async function loadStats() {
    const res = await fetch('/api/admin/music/stats/overview');
    const data = await res.json();
    setStats(data);
  }

  function handleUpload() {
    router.push('/music/upload');
  }

  function handleEdit(id: string) {
    router.push(`/music/${id}`);
  }

  async function handleDelete(track: MusicTrack) {
    if (!confirm(`Delete "${track.title}"?`)) return;

    await fetch(`/api/admin/music/${track.id}`, {
      method: 'DELETE',
    });

    loadTracks();
    loadStats();
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Music Library</h1>
          {stats && (
            <p className="text-gray-600 mt-1">
              {stats.total_tracks} tracks • {Object.keys(stats.by_genre).length} genres
            </p>
          )}
        </div>
        <Button onClick={handleUpload}>Upload Music</Button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <Input
          placeholder="Search title or artist..."
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          className="max-w-xs"
        />

        <Select
          value={filter.genre}
          onChange={(e) => setFilter({ ...filter, genre: e.target.value })}
        >
          <option value="">All Genres</option>
          <option value="electronic">Electronic</option>
          <option value="ambient">Ambient</option>
          <option value="jazz">Jazz</option>
          <option value="classical">Classical</option>
          <option value="rock">Rock</option>
        </Select>

        <Select
          value={filter.mood}
          onChange={(e) => setFilter({ ...filter, mood: e.target.value })}
        >
          <option value="">All Moods</option>
          <option value="energetic">Energetic</option>
          <option value="calm">Calm</option>
          <option value="uplifting">Uplifting</option>
          <option value="melancholic">Melancholic</option>
        </Select>
      </div>

      {/* Music Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tracks.map((track) => (
          <div key={track.id} className="border rounded-lg p-4 hover:shadow-md transition">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold truncate">{track.title}</h3>
                <p className="text-sm text-gray-600 truncate">{track.artist}</p>
                {track.album && (
                  <p className="text-xs text-gray-500 truncate">{track.album}</p>
                )}
              </div>
              <div className="text-sm text-gray-500">
                {formatDuration(track.duration_sec || 0)}
              </div>
            </div>

            <div className="flex gap-2 mb-3 flex-wrap">
              {track.genre && <Badge size="sm">{track.genre}</Badge>}
              {track.mood && <Badge size="sm" variant="secondary">{track.mood}</Badge>}
            </div>

            {track.tags && track.tags.length > 0 && (
              <div className="mb-3 flex gap-1 flex-wrap">
                {track.tags.map((tag, idx) => (
                  <span key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {track.audio_url && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setCurrentlyPlaying(track.id);
                    // Play audio logic here
                  }}
                >
                  ▶ Play
                </Button>
              )}
              <Button size="sm" onClick={() => handleEdit(track.id)}>
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={() => handleDelete(track)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {tracks.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-4">No music tracks found</p>
          <Button onClick={handleUpload}>Upload Your First Track</Button>
        </div>
      )}
    </div>
  );
}
```

### Step 3: Create Upload Page

Create `apps/admin/src/pages/music/upload.tsx`:
```typescript
import { useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Input, Select, Textarea } from '@/components/ui';

export default function MusicUploadPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({
    title: '',
    artist: '',
    album: '',
    genre: '',
    mood: '',
    energy_level: 5,
    tags: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      alert('Please select a file');
      return;
    }

    setUploading(true);

    try {
      // Step 1: Upload file
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/admin/music/upload', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadRes.json();

      if (uploadData.duplicate) {
        alert(`This file already exists in the library: "${uploadData.existing_track.title}"`);
        setUploading(false);
        return;
      }

      // Step 2: Create track metadata
      const trackData = {
        ...metadata,
        tags: metadata.tags.split(',').map(t => t.trim()).filter(Boolean),
      };

      await fetch(`/api/admin/music?storage_path=${uploadData.storage_path}&file_hash=${uploadData.file_hash}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackData),
      });

      router.push('/music');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed');
      setUploading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Upload Music</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-semibold mb-2">Audio File</label>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="border p-2 w-full"
            required
          />
          {file && (
            <p className="text-sm text-gray-600 mt-1">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        <Input
          label="Title"
          value={metadata.title}
          onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
          required
        />

        <Input
          label="Artist"
          value={metadata.artist}
          onChange={(e) => setMetadata({ ...metadata, artist: e.target.value })}
        />

        <Input
          label="Album"
          value={metadata.album}
          onChange={(e) => setMetadata({ ...metadata, album: e.target.value })}
        />

        <Select
          label="Genre"
          value={metadata.genre}
          onChange={(e) => setMetadata({ ...metadata, genre: e.target.value })}
        >
          <option value="">Select Genre</option>
          <option value="electronic">Electronic</option>
          <option value="ambient">Ambient</option>
          <option value="jazz">Jazz</option>
          <option value="classical">Classical</option>
          <option value="rock">Rock</option>
        </Select>

        <Select
          label="Mood"
          value={metadata.mood}
          onChange={(e) => setMetadata({ ...metadata, mood: e.target.value })}
        >
          <option value="">Select Mood</option>
          <option value="energetic">Energetic</option>
          <option value="calm">Calm</option>
          <option value="uplifting">Uplifting</option>
          <option value="melancholic">Melancholic</option>
        </Select>

        <Input
          label="Energy Level (1-10)"
          type="number"
          min="1"
          max="10"
          value={metadata.energy_level}
          onChange={(e) => setMetadata({ ...metadata, energy_level: parseInt(e.target.value) })}
        />

        <Input
          label="Tags (comma-separated)"
          value={metadata.tags}
          onChange={(e) => setMetadata({ ...metadata, tags: e.target.value })}
          placeholder="futuristic, synthwave, upbeat"
        />

        <div className="flex gap-4">
          <Button type="submit" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload Music'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] Upload audio files (MP3, WAV, FLAC, etc.)
- [ ] Add metadata (title, artist, album, genre, mood)
- [ ] Tag tracks for organization
- [ ] Duplicate detection via file hash
- [ ] Search tracks by title/artist
- [ ] Filter by genre and mood
- [ ] Preview audio playback
- [ ] Edit track metadata
- [ ] Delete tracks (removes from storage)

### Quality Requirements
- [ ] File upload progress indication
- [ ] Error handling for invalid files
- [ ] Grid view is visually appealing
- [ ] Mobile-responsive design

### Manual Verification
- [ ] Upload music file successfully
- [ ] Try uploading same file twice (see duplicate warning)
- [ ] Edit track metadata
- [ ] Search for track
- [ ] Filter by genre
- [ ] Preview track audio
- [ ] Delete track

---

## Next Task Handoff

**What this task provides for M2-M4:**

1. **Music library:** Tracks available for jingles, background music
2. **Metadata:** Genre/mood tagging for smart music selection

**Files created:**
- `apps/api/src/routes/admin/music.py`
- `apps/admin/src/pages/music/index.tsx`
- `apps/admin/src/pages/music/upload.tsx`

**M2-M4 will:**
- Use music library for scheduling
- Play music during broadcast
- Mix music with speech

------------------------------------------------------------

