# Multi-DJ Programs Implementation Plan

## Executive Summary

This document provides a comprehensive, step-by-step guide to refactor the radio system to support multi-DJ programs at the program level instead of requiring manual segment creation. The implementation ensures backward compatibility with existing single-DJ programs while enabling flexible multi-speaker content generation.

## Current Architecture

### Database Schema
- **programs** table has `dj_id UUID NOT NULL` (single DJ only)
- **conversation_participants** table exists for manual multi-speaker segments
- **segments** table has `conversation_format TEXT` and `participant_count INT`

### Workflow
1. **Single-DJ Programs** (90%): Scheduler creates segments → segment-gen worker generates mono script → TTS synthesis
2. **Multi-DJ Segments** (10%): Manual creation via `/segments/create-conversation` → stays unscheduled → requires manual scheduling

### Problems
- Two separate workflows for content management
- No program-level control over conversation format
- Multi-DJ segments require manual creation AND manual scheduling
- Inconsistent UX between single and multi-speaker content

## Target Architecture

### Database Schema Changes
- **programs** table gets:
  - Many-to-many relationship with DJs via **program_djs** join table
  - `conversation_format TEXT` field (NULL, 'interview', 'panel', 'dialogue')
  - `dj_id` becomes nullable during migration, then removed
- **Segment generation** automatically creates conversation_participants when program has multiple DJs

### Workflow
1. **All Programs**: Create program → select DJ(s) → select conversation format (if multiple DJs) → scheduler auto-generates segments with proper format → segment-gen creates conversation_participants → multi-voice generation

### Benefits
- Single unified workflow for all content
- Program-level control over conversation format
- Automatic multi-DJ segment generation
- Better UX - manage everything from programs interface

---

## Implementation Steps

## Phase 1: Database Migration

### Step 1.1: Create program_djs Join Table

**File**: `infra/migrations/024_multi_dj_programs.sql`

```sql
-- Migration 024: Multi-DJ Programs Support
-- Description: Enable programs to have multiple DJs and conversation formats
-- Author: AI Radio Team
-- Date: 2025-01-16

-- Create program_djs join table (many-to-many)
CREATE TABLE program_djs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  dj_id UUID NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('host', 'co-host', 'guest', 'panelist')) DEFAULT 'host',
  speaking_order INT, -- Order in conversations (1, 2, 3...)
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(program_id, dj_id) -- Prevent duplicate DJ assignments
);

-- Indexes for efficient queries
CREATE INDEX idx_program_djs_program ON program_djs(program_id);
CREATE INDEX idx_program_djs_dj ON program_djs(dj_id);
CREATE INDEX idx_program_djs_order ON program_djs(program_id, speaking_order);

-- Add conversation_format to programs table
ALTER TABLE programs
  ADD COLUMN conversation_format TEXT CHECK (conversation_format IN ('interview', 'panel', 'dialogue', 'debate'));

-- Comments
COMMENT ON TABLE program_djs IS 'Many-to-many relationship between programs and DJs';
COMMENT ON COLUMN program_djs.role IS 'Role of DJ in this program (host, co-host, guest, panelist)';
COMMENT ON COLUMN program_djs.speaking_order IS 'Order for multi-speaker programs (1=primary host, 2=secondary, etc)';
COMMENT ON COLUMN programs.conversation_format IS 'Format for multi-DJ programs: interview (2 people), panel (3-5), dialogue (2 DJs chatting), debate';

-- Migrate existing single-DJ programs to program_djs table
INSERT INTO program_djs (program_id, dj_id, role, speaking_order)
SELECT id, dj_id, 'host', 1
FROM programs
WHERE dj_id IS NOT NULL;

-- Make dj_id nullable (will be removed in future migration after full transition)
ALTER TABLE programs
  ALTER COLUMN dj_id DROP NOT NULL;

-- Add helper comment
COMMENT ON COLUMN programs.dj_id IS 'DEPRECATED: Use program_djs table instead. Will be removed in future version.';
```

**File**: `infra/migrations/024_multi_dj_programs_down.sql`

```sql
-- Migration 024 Down: Rollback multi-DJ programs

-- Restore dj_id for programs that only have one DJ
UPDATE programs p
SET dj_id = (
  SELECT dj_id
  FROM program_djs
  WHERE program_id = p.id
  LIMIT 1
)
WHERE dj_id IS NULL;

-- Make dj_id NOT NULL again
ALTER TABLE programs
  ALTER COLUMN dj_id SET NOT NULL;

-- Drop conversation_format
ALTER TABLE programs
  DROP COLUMN conversation_format;

-- Drop program_djs table
DROP TABLE IF EXISTS program_djs CASCADE;
```

### Step 1.2: Run Migration

```bash
# Test migration on development database
node infra/migrate.js

# Verify migration
psql radio3_dev -c "SELECT * FROM program_djs LIMIT 5;"
psql radio3_dev -c "\d programs"
```

---

## Phase 2: Frontend Changes

### Step 2.1: Update Program Form Component

**File**: `apps/admin/components/program-form.tsx`

**Changes Required**:

1. **Add State for Multiple DJs**:
```typescript
// Replace line 49
const [djIds, setDjIds] = useState<string[]>(
  program?.dj_id ? [program.dj_id] : []
);

// Add new state
const [conversationFormat, setConversationFormat] = useState(
  program?.conversation_format || ''
);
```

2. **Replace DJ Dropdown with Multi-Select**:
```typescript
// Replace lines 205-226 with:
<div>
  <label className="block text-sm font-medium text-gray-700">
    DJ(s) *
    <span className="text-xs text-gray-500 ml-2">
      Select multiple for conversations
    </span>
  </label>

  {/* Multi-select checkboxes */}
  <div className="mt-2 max-h-60 overflow-y-auto border border-gray-300 rounded-md p-3">
    {djs.length === 0 ? (
      <p className="text-sm text-yellow-600">
        No DJs available. Please create a DJ first.
      </p>
    ) : (
      <div className="space-y-2">
        {djs.map((dj) => (
          <label
            key={dj.id}
            className={`flex items-center p-2 rounded cursor-pointer transition-colors ${
              djIds.includes(dj.id)
                ? 'bg-blue-50 border border-blue-300'
                : 'hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={djIds.includes(dj.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  setDjIds([...djIds, dj.id]);
                } else {
                  setDjIds(djIds.filter(id => id !== dj.id));
                }
              }}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <span className="ml-2 text-sm font-medium text-gray-900">
              {dj.name}
            </span>
            <span className="ml-auto text-xs text-gray-500">{dj.slug}</span>
          </label>
        ))}
      </div>
    )}
  </div>

  <p className="mt-1 text-xs text-gray-500">
    {djIds.length === 0 && 'Select at least one DJ'}
    {djIds.length === 1 && '1 DJ selected (monologue format)'}
    {djIds.length > 1 && `${djIds.length} DJs selected (conversation format)`}
  </p>
</div>
```

3. **Add Conversation Format Selection (conditional)**:
```typescript
// Add after DJ selection, before Format Clock selection:
{djIds.length > 1 && (
  <div>
    <label className="block text-sm font-medium text-gray-700">
      Conversation Format *
    </label>
    <select
      required={djIds.length > 1}
      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      value={conversationFormat}
      onChange={(e) => setConversationFormat(e.target.value)}
    >
      <option value="">Select conversation format...</option>
      {djIds.length === 2 && (
        <>
          <option value="interview">Interview (Q&A with expert guest)</option>
          <option value="dialogue">DJ Dialogue (Two DJs chatting)</option>
        </>
      )}
      {djIds.length >= 3 && (
        <>
          <option value="panel">Panel Discussion (Multiple experts)</option>
          <option value="debate">Debate (Opposing viewpoints)</option>
        </>
      )}
    </select>
    <p className="mt-1 text-xs text-gray-500">
      {djIds.length === 2 && 'Interview: One host interviews a guest. Dialogue: Two DJs discuss a topic.'}
      {djIds.length >= 3 && 'Panel: Multiple experts discuss. Debate: Opposing viewpoints clash.'}
    </p>
  </div>
)}
```

4. **Update Validation**:
```typescript
// Update handleSubmit validation (after line 79):
if (djIds.length === 0) {
  setError('Please select at least one DJ');
  setLoading(false);
  return;
}

if (djIds.length > 1 && !conversationFormat) {
  setError('Please select a conversation format for multi-DJ programs');
  setLoading(false);
  return;
}
```

5. **Update Submit Logic**:
```typescript
// Replace lines 98-133 with:
const programData: any = {
  name: name.trim(),
  format_clock_id: formatClockId,
  description: description.trim() || null,
  genre: genre || null,
  preferred_time_of_day: preferredTimeOfDay || null,
  preferred_days: preferredDays.length > 0 ? preferredDays : null,
  conversation_format: djIds.length > 1 ? conversationFormat : null,
  active,
};

try {
  if (mode === 'create') {
    // Insert program
    const { data: newProgram, error: insertError } = await supabase
      .from('programs')
      .insert([programData])
      .select()
      .single();

    if (insertError) throw insertError;

    // Insert program_djs relationships
    const programDjsData = djIds.map((djId, index) => ({
      program_id: newProgram.id,
      dj_id: djId,
      role: index === 0 ? 'host' : (djIds.length === 2 ? 'guest' : 'panelist'),
      speaking_order: index + 1,
    }));

    const { error: djsError } = await supabase
      .from('program_djs')
      .insert(programDjsData);

    if (djsError) throw djsError;

    router.push('/dashboard/programs');

  } else {
    // Update program
    const { error: updateError } = await supabase
      .from('programs')
      .update(programData)
      .eq('id', program.id);

    if (updateError) throw updateError;

    // Delete existing program_djs
    const { error: deleteError } = await supabase
      .from('program_djs')
      .delete()
      .eq('program_id', program.id);

    if (deleteError) throw deleteError;

    // Insert new program_djs relationships
    const programDjsData = djIds.map((djId, index) => ({
      program_id: program.id,
      dj_id: djId,
      role: index === 0 ? 'host' : (djIds.length === 2 ? 'guest' : 'panelist'),
      speaking_order: index + 1,
    }));

    const { error: djsError } = await supabase
      .from('program_djs')
      .insert(programDjsData);

    if (djsError) throw djsError;

    router.push('/dashboard/programs');
  }
} catch (err: any) {
  console.error('Program save error:', err);
  setError(err.message || 'Failed to save program');
  setLoading(false);
}
```

### Step 2.2: Update Program Edit Page to Load DJs

**File**: `apps/admin/app/dashboard/programs/[id]/edit/page.tsx`

**Changes Required**:

1. **Fetch program_djs**:
```typescript
// Add to query on line ~10:
const { data: program, error } = await supabase
  .from('programs')
  .select(`
    *,
    program_djs(dj_id, role, speaking_order)
  `)
  .eq('id', params.id)
  .single();

// Extract DJ IDs for form
const djIds = program.program_djs
  ?.sort((a, b) => a.speaking_order - b.speaking_order)
  .map(pd => pd.dj_id) || [];

// Pass to ProgramForm
<ProgramForm
  mode="edit"
  program={{ ...program, djIds }} // Add djIds to program object
  djs={djsResult.data || []}
  formatClocks={formatClocksResult.data || []}
/>
```

2. **Update ProgramForm to accept djIds**:
```typescript
// In program-form.tsx, update initialization:
const [djIds, setDjIds] = useState<string[]>(
  program?.djIds || (program?.dj_id ? [program.dj_id] : [])
);
```

### Step 2.3: Update Programs List Page

**File**: `apps/admin/app/dashboard/programs/page.tsx`

**Changes Required**:

```typescript
// Update query to fetch DJs (line ~7):
const { data: programs, error } = await supabase
  .from('programs')
  .select(`
    *,
    program_djs(
      dj:djs!program_djs_dj_id_fkey(id, name, slug)
    ),
    format_clock:format_clocks!fk_programs_format_clock(id, name)
  `)
  .order('created_at', { ascending: false });

// Update table cell to show multiple DJs (line ~70):
<td className="px-4 py-4 text-sm text-gray-900">
  {program.program_djs && program.program_djs.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {program.program_djs
        .sort((a, b) => a.speaking_order - b.speaking_order)
        .map((pd, idx) => (
          <span
            key={pd.dj.id}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
          >
            {pd.dj.name}
            {idx === 0 && <span className="ml-1 text-blue-600">★</span>}
          </span>
        ))}
    </div>
  ) : (
    <span className="text-gray-400">No DJ assigned</span>
  )}
</td>

// Add conversation format column (optional, or show in existing columns):
{program.conversation_format && (
  <span className="ml-2 text-xs text-gray-500">
    ({program.conversation_format})
  </span>
)}
```

---

## Phase 3: Backend Changes

### Step 3.1: Update Schedule Generator

**File**: `workers/scheduler/src/schedule-generator.ts`

**Changes Required**:

1. **Fetch program_djs in query** (line ~70):
```typescript
const { data: programs, error: programsError } = await this.db
  .from('programs')
  .select(`
    id,
    name,
    dj_id,
    format_clock_id,
    conversation_format,
    program_djs(dj_id, role, speaking_order),
    format_clocks!fk_programs_format_clock(id, name, description)
  `)
  .eq('active', true);
```

2. **Set conversation_format on segments** (line ~159):
```typescript
// Determine participant count
const programDjs = program.program_djs || [];
const participantCount = programDjs.length || 1;

// Create segment
const segment = {
  program_id: program.id,
  slot_type: slot.slot_type,
  conversation_format: program.conversation_format || null,
  participant_count: participantCount,
  lang: 'en',
  state: 'queued',
  scheduled_start_ts: futureSlotStart.toISOString(),
  max_retries: 3,
  retry_count: 0
};
```

### Step 3.2: Update Segment Generation Worker

**File**: `workers/segment-gen/src/worker/segment-gen-handler.ts`

**Changes Required**:

1. **Fetch program_djs when loading segment** (find where segment is queried):
```typescript
const { data: segment, error: segmentError } = await this.db
  .from('segments')
  .select(`
    *,
    programs!fk_segments_program(
      id,
      name,
      conversation_format,
      program_djs(
        dj_id,
        role,
        speaking_order,
        dj:djs(id, name, slug, voice_id, personality, expertise)
      )
    )
  `)
  .eq('id', segmentId)
  .single();
```

2. **Create conversation_participants before generation**:
```typescript
// After fetching segment, before script generation:
if (segment.conversation_format && segment.programs?.program_djs?.length > 1) {
  // Check if conversation_participants already exist
  const { data: existingParticipants } = await this.db
    .from('conversation_participants')
    .select('id')
    .eq('segment_id', segment.id);

  if (!existingParticipants || existingParticipants.length === 0) {
    // Create conversation_participants from program_djs
    const participants = segment.programs.program_djs.map(pd => ({
      segment_id: segment.id,
      dj_id: pd.dj_id,
      role: pd.role,
      speaking_order: pd.speaking_order,
    }));

    const { error: participantsError } = await this.db
      .from('conversation_participants')
      .insert(participants);

    if (participantsError) {
      logger.error({ error: participantsError }, 'Failed to create conversation participants');
      throw participantsError;
    }

    logger.info({ segmentId: segment.id, participants: participants.length }, 'Created conversation participants');
  }
}
```

3. **Pass multiple DJs to script generator**:
```typescript
// When building context for script generator:
const djs = segment.conversation_format && segment.programs?.program_djs?.length > 1
  ? segment.programs.program_djs
      .sort((a, b) => a.speaking_order - b.speaking_order)
      .map(pd => pd.dj)
  : [segment.programs.program_djs[0]?.dj]; // Fallback to first DJ

const context = {
  segmentType: segment.slot_type,
  djs: djs, // Now an array
  conversationFormat: segment.conversation_format,
  // ... other context
};
```

### Step 3.3: Update Script Generator (Core Package)

**File**: `packages/radio-core/src/services/script-generator.ts`

**Changes Required**:

1. **Update GenerateScriptOptions interface**:
```typescript
export interface GenerateScriptOptions {
  context: PromptContext;
  temperature?: number;
  maxTokens?: number;
  cacheKey?: string;
  conversationFormat?: string | null; // NEW
}
```

2. **Update PromptContext type** (in `packages/radio-core/src/prompts/script-generation.ts`):
```typescript
export interface PromptContext {
  segmentType: string;
  djs: DJ[]; // Changed from single `dj` to array `djs`
  conversationFormat?: string | null;
  ragContext: RAGResult;
  // ... other fields
}
```

3. **Update buildSystemPrompt**:
```typescript
export function buildSystemPrompt(context: PromptContext): string {
  const { conversationFormat, djs } = context;

  if (conversationFormat && djs.length > 1) {
    // Multi-speaker prompt
    return `You are a script writer for Radio Vox Futura 2525, an AI-powered radio station set in the year 2525.

${getStyleGuide()}

CONVERSATION FORMAT: ${conversationFormat}

SPEAKERS:
${djs.map((dj, idx) => `
${idx + 1}. ${dj.name} (${dj.personality || 'broadcaster'})
   - Voice: ${dj.voice_id}
   - Role: ${idx === 0 ? 'Host' : (conversationFormat === 'interview' ? 'Guest' : 'Panelist')}
   ${dj.expertise ? `- Expertise: ${dj.expertise}` : ''}
`).join('\n')}

${getConversationFormatGuidelines(conversationFormat)}

Generate an engaging ${conversationFormat} script with natural back-and-forth dialogue.
Format each line as: **[Speaker Name]:** Dialogue text

Do NOT include stage directions, sound effects, or meta-commentary.`;

  } else {
    // Single-speaker prompt (existing logic)
    const dj = djs[0];
    return `You are ${dj.name}, a radio DJ on Radio Vox Futura 2525...
${getStyleGuide()}
Generate a script for a ${context.segmentType} segment...`;
  }
}

function getConversationFormatGuidelines(format: string): string {
  switch (format) {
    case 'interview':
      return `INTERVIEW FORMAT:
- Host asks thoughtful questions
- Guest provides expert insights
- Natural follow-up questions
- 50/50 speaking time balance`;

    case 'panel':
      return `PANEL DISCUSSION FORMAT:
- Host moderates and asks questions
- Panelists provide diverse perspectives
- Allow disagreement and debate
- Build on each other's points`;

    case 'dialogue':
      return `DJ DIALOGUE FORMAT:
- Casual, conversational tone
- DJs build on each other's comments
- Natural topic flow
- Balanced speaking time`;

    case 'debate':
      return `DEBATE FORMAT:
- Clear opposing viewpoints
- Structured arguments
- Respectful disagreement
- Host maintains balance`;

    default:
      return '';
  }
}
```

### Step 3.4: Update TTS Synthesis Worker

**File**: `workers/mastering/src/index.ts` (or wherever TTS synthesis happens)

**Changes Required**:

1. **Check for conversation_participants**:
```typescript
// When processing segment for TTS:
const { data: participants } = await db
  .from('conversation_participants')
  .select('*, dj:djs(voice_id)')
  .eq('segment_id', segmentId)
  .order('speaking_order');

if (participants && participants.length > 1) {
  // Multi-speaker synthesis
  await synthesizeConversation(segment, participants);
} else {
  // Single-speaker synthesis (existing logic)
  await synthesizeMonologue(segment);
}
```

2. **Parse and synthesize multi-speaker script**:
```typescript
async function synthesizeConversation(segment, participants) {
  const script = segment.script_md;

  // Parse script into turns: **[Speaker Name]:** dialogue
  const turnRegex = /\*\*\[([^\]]+)\]:\*\*\s*(.+?)(?=\*\*\[|$)/gs;
  const turns = [];
  let match;

  while ((match = turnRegex.exec(script)) !== null) {
    const speakerName = match[1];
    const text = match[2].trim();

    // Find matching participant
    const participant = participants.find(p =>
      p.character_name === speakerName || p.dj.name === speakerName
    );

    if (participant) {
      turns.push({
        participant_id: participant.id,
        speaker_name: speakerName,
        text_content: text,
        voice_id: participant.dj.voice_id,
        turn_number: turns.length + 1,
      });
    }
  }

  // Synthesize each turn
  const audioFiles = [];
  for (const turn of turns) {
    const audioPath = await synthesizeTurn(turn);
    audioFiles.push(audioPath);

    // Save turn to conversation_turns table
    await db.from('conversation_turns').insert({
      segment_id: segment.id,
      participant_id: turn.participant_id,
      turn_number: turn.turn_number,
      speaker_name: turn.speaker_name,
      text_content: turn.text_content,
      audio_path: audioPath,
    });
  }

  // Concatenate all audio files
  const finalAudio = await concatenateAudio(audioFiles);
  return finalAudio;
}
```

---

## Phase 4: Testing Plan

### Step 4.1: Database Migration Testing

```bash
# 1. Backup database
pg_dump radio3_dev > backup_pre_multi_dj.sql

# 2. Run migration
node infra/migrate.js

# 3. Verify data integrity
psql radio3_dev -c "
  SELECT
    p.name,
    p.conversation_format,
    COUNT(pd.dj_id) as dj_count,
    ARRAY_AGG(d.name ORDER BY pd.speaking_order) as djs
  FROM programs p
  LEFT JOIN program_djs pd ON p.id = pd.program_id
  LEFT JOIN djs d ON pd.dj_id = d.id
  GROUP BY p.id, p.name, p.conversation_format;
"

# Expected: All existing programs should have 1 DJ, conversation_format NULL
```

### Step 4.2: Frontend Testing

1. **Test Single-DJ Program Creation**:
   - Go to /dashboard/programs/new
   - Select 1 DJ
   - Verify conversation_format dropdown doesn't appear
   - Create program
   - Verify in programs list, shows 1 DJ

2. **Test Multi-DJ Program Creation (Interview)**:
   - Go to /dashboard/programs/new
   - Select 2 DJs
   - Verify conversation_format dropdown appears with "Interview" and "DJ Dialogue" options
   - Select "Interview"
   - Create program
   - Verify in programs list, shows 2 DJs with format "interview"

3. **Test Multi-DJ Program Creation (Panel)**:
   - Go to /dashboard/programs/new
   - Select 3 DJs
   - Verify conversation_format dropdown shows "Panel Discussion" and "Debate"
   - Select "Panel Discussion"
   - Create program
   - Verify in programs list, shows 3 DJs

4. **Test Program Editing**:
   - Edit existing single-DJ program
   - Add second DJ
   - Verify conversation_format dropdown appears
   - Select format and save
   - Verify changes persist

### Step 4.3: Backend Testing

1. **Test Scheduler**:
```bash
# Run scheduler manually
SCHEDULER_MODE=once pnpm --filter @radio/scheduler-worker start

# Verify segments have conversation_format
psql radio3_dev -c "
  SELECT
    s.id,
    s.slot_type,
    s.conversation_format,
    s.participant_count,
    p.name as program_name
  FROM segments s
  JOIN programs p ON s.program_id = p.id
  WHERE s.created_at > NOW() - INTERVAL '1 hour'
  LIMIT 10;
"
```

2. **Test Segment Generation**:
```bash
# Find a multi-DJ segment
psql radio3_dev -c "
  SELECT id, program_id, conversation_format
  FROM segments
  WHERE conversation_format IS NOT NULL
  LIMIT 1;
"

# Check conversation_participants were created
psql radio3_dev -c "
  SELECT
    cp.*,
    d.name as dj_name
  FROM conversation_participants cp
  JOIN djs d ON cp.dj_id = d.id
  WHERE segment_id = '<segment_id>'
  ORDER BY speaking_order;
"

# Verify script has multiple speakers
psql radio3_dev -c "
  SELECT script_md
  FROM segments
  WHERE id = '<segment_id>';
"
```

3. **Test TTS Synthesis**:
```bash
# Check conversation_turns
psql radio3_dev -c "
  SELECT
    turn_number,
    speaker_name,
    substring(text_content, 1, 50) as excerpt,
    audio_path
  FROM conversation_turns
  WHERE segment_id = '<segment_id>'
  ORDER BY turn_number;
"

# Verify audio files exist
ls -lh /path/to/audio/segments/<segment_id>/
```

---

## Phase 5: Backward Compatibility Verification

### Step 5.1: Verify Existing Programs Still Work

```sql
-- Check all programs have at least one DJ in program_djs
SELECT
  p.id,
  p.name,
  COUNT(pd.dj_id) as dj_count
FROM programs p
LEFT JOIN program_djs pd ON p.id = pd.program_id
GROUP BY p.id, p.name
HAVING COUNT(pd.dj_id) = 0;

-- Should return 0 rows
```

### Step 5.2: Verify Scheduler Still Creates Single-DJ Segments

```sql
-- After running scheduler, verify single-DJ programs create segments without conversation_format
SELECT
  s.id,
  s.conversation_format,
  s.participant_count,
  p.name
FROM segments s
JOIN programs p ON s.program_id = p.id
JOIN program_djs pd ON p.id = pd.program_id
WHERE s.created_at > NOW() - INTERVAL '1 hour'
GROUP BY s.id, s.conversation_format, s.participant_count, p.name, p.id
HAVING COUNT(pd.dj_id) = 1;

-- Should show conversation_format = NULL, participant_count = 1
```

### Step 5.3: Verify Existing Segments Still Playable

```bash
# Test playout of existing segment
curl -I http://localhost:8000/stream/segment/<old_segment_id>/audio.opus

# Should return 200 OK
```

---

## Phase 6: Cleanup (Future Migration)

After verifying everything works for 2-4 weeks, create a cleanup migration:

**File**: `infra/migrations/025_remove_programs_dj_id.sql`

```sql
-- Migration 025: Remove deprecated programs.dj_id column
-- Run this only after multi-DJ programs are fully tested

ALTER TABLE programs
  DROP COLUMN dj_id;

DROP INDEX IF EXISTS idx_programs_dj;
```

---

## Rollback Plan

If issues are discovered:

### Step 1: Stop All Workers
```bash
./ops/stop-all.sh
```

### Step 2: Rollback Migration
```bash
# Run down migration
node infra/migrate.js down
```

### Step 3: Restore Frontend Code
```bash
git checkout HEAD~1 -- apps/admin/components/program-form.tsx
git checkout HEAD~1 -- apps/admin/app/dashboard/programs/
```

### Step 4: Restore Database from Backup (if needed)
```bash
psql radio3_dev < backup_pre_multi_dj.sql
```

---

## Success Criteria

- ✅ All existing single-DJ programs continue to work
- ✅ Can create multi-DJ programs via programs interface
- ✅ Scheduler generates segments with correct conversation_format
- ✅ Segment-gen worker creates conversation_participants automatically
- ✅ Multi-speaker scripts are generated correctly
- ✅ Multi-voice TTS synthesis works
- ✅ No manual segment creation needed for multi-DJ content
- ✅ All tests pass
- ✅ No data loss

---

## Timeline Estimate

- **Phase 1** (Database Migration): 1 hour
- **Phase 2** (Frontend Changes): 3-4 hours
- **Phase 3** (Backend Changes): 4-5 hours
- **Phase 4** (Testing): 2-3 hours
- **Phase 5** (Verification): 1 hour

**Total**: 11-14 hours of development + testing time

---

## Notes & Considerations

1. **Guest Generation**: The "Auto-generate guest character using AI" feature from manual segment creation can be preserved as metadata in program_djs for interview format programs

2. **Migration Safety**: The migration keeps `dj_id` nullable initially to allow gradual transition

3. **Query Performance**: Added indexes on program_djs table to maintain query performance

4. **UI/UX**: Multi-select DJ interface is more flexible than the manual workflow

5. **Future Enhancements**: Could add drag-and-drop DJ ordering for speaking_order in the UI

---

## Questions to Resolve Before Implementation

1. ~~Should we remove `/segments/create-conversation` entirely or keep it as a secondary workflow?~~ → Keep it for now, can deprecate later

2. ~~How to handle "generate guest character" for interviews? Store in program metadata or conversation_participant?~~ → Store in program metadata, generate on-demand during segment creation

3. ~~Should conversation_format be required when multiple DJs selected?~~ → Yes, required for clarity

4. ~~Default speaking_order when adding DJs?~~ → Assign sequentially (1, 2, 3...) based on selection order

---

This plan ensures a smooth transition while maintaining all existing functionality. Each phase can be tested independently before moving to the next.
