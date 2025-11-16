# Task L1: Review & Architecture Alignment

**Status:** Requires Modifications
**Reviewed:** 2025-11-16
**Reviewer:** Claude Code

---

## Executive Summary

Task L1 (Sci-Fi Style Guide & Prompt Engineering) is **well-structured** but requires **significant modifications** to align with current architecture. Key issues:

- ✅ **Concept is sound**: Style guide, tone validation, and prompt engineering are necessary
- ⚠️ **Hardcoded values**: Model names, temperatures, and years need env var configuration
- ❌ **Wrong file paths**: References non-existent files
- ❌ **Missing schema**: Database fields for tone validation don't exist
- ⚠️ **Architecture mismatch**: Task assumes different file structure than exists

---

## Critical Issues

### 1. Hardcoded Model Name

**Location:** Step 3 - Update Script Generation

```typescript
// ❌ PROBLEM: Hardcoded model (from task)
const message = await this.anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',  // HARDCODED!
  max_tokens: 3000,
  temperature: 0.8,
  // ...
});
```

**Current Reality:**
- Model is already hardcoded as `'claude-3-5-haiku-20241022'` in [claude-client.ts:12](workers/segment-gen/src/llm/claude-client.ts#L12)
- Env var `SCRIPT_MODEL` exists in [.env.example:35](.env.example#L35) but is **NOT USED**
- Same for `SCRIPT_TEMPERATURE` and `SCRIPT_MAX_TOKENS`

**Required Fix:**
```typescript
// ✅ SOLUTION: Use env vars
const model = process.env.SCRIPT_MODEL || 'claude-3-5-haiku-20241022';
const maxTokens = parseInt(process.env.SCRIPT_MAX_TOKENS || '2048');
const temperature = parseFloat(process.env.SCRIPT_TEMPERATURE || '0.7');

const message = await this.anthropic.messages.create({
  model,
  max_tokens: maxTokens,
  temperature,
  // ...
});
```

---

### 2. Wrong File Path: segment-maker.ts

**Location:** Step 5 - Integrate Tone Validation

Task says:
```
Update `workers/segment-gen/src/segment-maker.ts`:
```

**Problem:** This file **does not exist!**

**Actual File:** [workers/segment-gen/src/worker/segment-gen-handler.ts](workers/segment-gen/src/worker/segment-gen-handler.ts)

**Required Fix:** All references to `segment-maker.ts` should be changed to `segment-gen-handler.ts`

---

### 3. Missing Database Schema Fields

**Location:** Step 5 & 6 - Tone validation storage

Task wants to store:
```typescript
await this.supabase
  .from('segments')
  .update({
    validation_issues: toneAnalysis.issues,           // ❌ Does not exist
    validation_suggestions: toneAnalysis.suggestions, // ❌ Does not exist
    tone_score: toneAnalysis.score,                   // ❌ Does not exist
    tone_balance: `${optimismPct}/${realismPct}/${wonderPct}`, // ❌ Does not exist
  })
  .eq('id', segment.id);
```

**Current Schema:** See [infra/migrations/001_create_segments_table.sql](infra/migrations/001_create_segments_table.sql)

Existing fields in segments table:
- `id`, `program_id`, `asset_id`, `slot_type`, `lang`, `state`
- `script_md`, `citations`, `duration_sec`
- `scheduled_start_ts`, `aired_at`
- `retry_count`, `max_retries`, `last_error`
- `generation_metrics` (JSONB)
- `cache_key`, `parent_segment_id`, `idempotency_key`
- `created_at`, `updated_at`

**Missing Fields:**
- `validation_issues` (TEXT[] or JSONB)
- `validation_suggestions` (TEXT[] or JSONB)
- `tone_score` (INTEGER 0-100)
- `tone_balance` (TEXT, e.g., "60/30/10")

**Required Fix:** Create migration to add these fields

---

### 4. Hardcoded Future Year

**Location:** Step 2 - System Prompt (implicitly referenced)

Current implementation in [segment-gen-handler.ts:100](workers/segment-gen/src/worker/segment-gen-handler.ts#L100):
```typescript
futureYear: 2525  // ❌ HARDCODED
```

**Env Var Exists:** `FUTURE_YEAR_OFFSET=500` in [.env.example:48](.env.example#L48)

**Better Approach:**
```typescript
const currentYear = new Date().getFullYear();
const offset = parseInt(process.env.FUTURE_YEAR_OFFSET || '500');
const futureYear = currentYear + offset; // 2025 + 500 = 2525
```

**Benefit:** Automatically updates as time passes, maintains "500 years in future" concept

---

### 5. System Prompt Architecture Mismatch

**Task Assumption:** Simple string replacement

**Current Reality:** Complex prompt template system with:
- Character-based prompting (DJ personalities from DB)
- RAG context injection (5 knowledge base chunks)
- Format-specific prompts (news vs culture vs tech vs interview)
- Multi-speaker conversation formats (4 types)

**Required Integration Points:**

1. **Monologue Prompts** ([prompt-templates.ts](workers/segment-gen/src/llm/prompt-templates.ts))
   - Inject style guide into `buildSystemPrompt()`
   - Add 60/30/10 balance instructions
   - Reference sci-fi terminology

2. **Conversation Prompts** ([conversation-prompts.ts](workers/segment-gen/src/llm/conversation-prompts.ts))
   - Update all 4 formats: interview, panel, debate, dialogue
   - Add 2525 world context to each
   - Ensure multi-speaker maintains tone

3. **Claude Client** ([claude-client.ts](workers/segment-gen/src/llm/claude-client.ts))
   - Make `defaultModel` configurable via env var
   - Make `maxTokens` and `temperature` defaults configurable

---

## Non-Critical Issues

### 6. Admin UI TypeScript Strictness

**Location:** Step 6 - Add Tone Display to Admin

Task shows inline TypeScript in JSX:
```tsx
{segment.validation_issues && segment.validation_issues.length > 0 && (
  // ...
)}
```

**Current Admin:** Uses server components, no type assertions on DB results

**Required:** Add proper TypeScript types to segment data:
```typescript
interface SegmentWithTone {
  // ... existing fields
  tone_score?: number;
  tone_balance?: string;
  validation_issues?: string[];
  validation_suggestions?: string[];
}
```

---

## Missing Prerequisites

### Database Migration Required

Before implementing Step 5 & 6, must create:

**File:** `infra/migrations/003_add_tone_validation.sql`

```sql
-- Add tone validation fields to segments table
ALTER TABLE segments
  ADD COLUMN tone_score INTEGER CHECK (tone_score >= 0 AND tone_score <= 100),
  ADD COLUMN tone_balance TEXT,
  ADD COLUMN validation_issues JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN validation_suggestions JSONB DEFAULT '[]'::jsonb;

-- Add index for filtering segments with low tone scores
CREATE INDEX idx_segments_tone_score ON segments(tone_score) WHERE tone_score IS NOT NULL;

-- Add comment
COMMENT ON COLUMN segments.tone_score IS 'Automated tone validation score (0-100)';
COMMENT ON COLUMN segments.tone_balance IS 'Optimism/Realism/Wonder ratio, e.g., "60/30/10"';
COMMENT ON COLUMN segments.validation_issues IS 'List of tone/style issues detected';
COMMENT ON COLUMN segments.validation_suggestions IS 'Suggestions for improving tone';
```

---

## Recommended Implementation Order

### Phase 1: Configuration Foundation
1. **Update ClaudeClient** to use env vars for model/temp/tokens
2. **Update segment-gen-handler** to calculate futureYear dynamically
3. **Create migration** for tone validation fields
4. **Run migration** on dev database

### Phase 2: Style Guide & Prompts
1. **Create style guide** `docs/style-guide-2525.md` (as specified)
2. **Create style config** `workers/segment-gen/src/llm/style-config.ts`
3. **Update prompt-templates.ts** to inject style rules
4. **Update conversation-prompts.ts** to inject style rules

### Phase 3: Tone Validation
1. **Create ToneValidator** class (as specified)
2. **Integrate into segment-gen-handler** (NOT segment-maker.ts)
3. **Store tone metrics** in DB
4. **Test with sample segments**

### Phase 4: Admin UI
1. **Update segment detail page** to show tone metrics
2. **Add filtering** by tone score in segment list
3. **Add regeneration button** for failed validation

---

## Correct File Mapping

| Task Reference | Actual File | Notes |
|---------------|-------------|-------|
| `workers/segment-gen/src/script-generator.ts` | `workers/segment-gen/src/llm/script-generator.ts` | Moved to llm/ subdirectory |
| `workers/segment-gen/src/segment-maker.ts` | `workers/segment-gen/src/worker/segment-gen-handler.ts` | File doesn't exist, use handler instead |
| `workers/segment-gen/src/prompts/system-prompt.ts` | **NEW FILE** (create as specified) | Good location |
| `workers/segment-gen/src/validators/tone-validator.ts` | **NEW FILE** (create as specified) | Good location |
| `apps/admin/app/dashboard/segments/[id]/page.tsx` | ✅ Exists | Correct path |

---

## Updated Implementation Plan

### Step 1: Create Style Guide ✅
No changes needed - create `docs/style-guide-2525.md` as specified.

### Step 2: Create Prompt System ✅
No changes needed - create `workers/segment-gen/src/prompts/system-prompt.ts` as specified, but export for reuse.

### Step 3: Update Script Generation ⚠️

**Files to Modify:**
1. `workers/segment-gen/src/llm/claude-client.ts`
2. `workers/segment-gen/src/llm/script-generator.ts`
3. `workers/segment-gen/src/llm/prompt-templates.ts`

**Changes:**
```typescript
// claude-client.ts
export class ClaudeClient {
  private readonly defaultModel: string;

  constructor(apiKey?: string) {
    this.defaultModel = process.env.SCRIPT_MODEL || 'claude-3-5-haiku-20241022';
    // ... rest
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const {
      maxTokens = parseInt(process.env.SCRIPT_MAX_TOKENS || '2048'),
      temperature = parseFloat(process.env.SCRIPT_TEMPERATURE || '0.7'),
      model = this.defaultModel
    } = request;
    // ... rest
  }
}

// prompt-templates.ts
import { RADIO_2525_SYSTEM_PROMPT } from '../prompts/system-prompt';

buildSystemPrompt(context: SegmentContext): string {
  const basePrompt = `You are ${context.djName}, a radio DJ in the year ${context.futureYear}.

  YOUR PERSONALITY:
  ${context.djPersonality}

  ${RADIO_2525_SYSTEM_PROMPT}  // <-- Inject style guide

  // ... rest of prompt
  `;
}
```

### Step 4: Create Tone Validator ✅
No changes needed - create `workers/segment-gen/src/validators/tone-validator.ts` as specified.

### Step 5: Integrate Tone Validation ⚠️

**File to Modify:** `workers/segment-gen/src/worker/segment-gen-handler.ts` (NOT segment-maker.ts)

**Location:** In the `processSegment()` method, after script generation (around line 200-250)

**Changes:**
```typescript
import { ToneValidator } from '../validators/tone-validator';

export class SegmentGenHandler extends JobHandler {
  private toneValidator: ToneValidator;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'segment-generation');
    // ... existing code
    this.toneValidator = new ToneValidator();
  }

  async processSegment(segmentId: string): Promise<void> {
    // ... existing script generation

    // After scriptResult is generated:
    const toneAnalysis = this.toneValidator.analyzeScript(scriptResult.scriptMd);

    // Store tone metrics (requires migration first!)
    await this.supabase
      .from('segments')
      .update({
        tone_score: toneAnalysis.score,
        tone_balance: `${toneAnalysis.optimismPct}/${toneAnalysis.realismPct}/${toneAnalysis.wonderPct}`,
        validation_issues: toneAnalysis.issues,
        validation_suggestions: toneAnalysis.suggestions,
      })
      .eq('id', segmentId);

    // Log warning if validation fails
    if (!this.toneValidator.isAcceptable(toneAnalysis)) {
      logger.warn({
        segmentId,
        score: toneAnalysis.score,
        issues: toneAnalysis.issues,
      }, 'Segment failed tone validation but continuing');
    }

    // Continue with rest of generation (TTS, etc.)
  }
}
```

### Step 6: Add Tone Display to Admin ⚠️

**File:** `apps/admin/app/dashboard/segments/[id]/page.tsx`

**Changes:** Insert after line 103 (after Created timestamp):

```tsx
{/* Tone Analysis */}
{segment.tone_score !== null && segment.tone_score !== undefined && (
  <div className="col-span-2">
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Tone Analysis
    </label>
    <div className="bg-gray-50 p-4 rounded">
      <div className="flex items-center space-x-4 mb-3">
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

      {segment.validation_issues && Array.isArray(segment.validation_issues) && segment.validation_issues.length > 0 && (
        <div className="mb-3">
          <div className="text-sm font-medium text-red-600 mb-1">Issues:</div>
          <ul className="text-sm text-gray-700 list-disc list-inside">
            {segment.validation_issues.map((issue: string, i: number) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {segment.validation_suggestions && Array.isArray(segment.validation_suggestions) && segment.validation_suggestions.length > 0 && (
        <div>
          <div className="text-sm font-medium text-blue-600 mb-1">Suggestions:</div>
          <ul className="text-sm text-gray-700 list-disc list-inside">
            {segment.validation_suggestions.map((suggestion: string, i: number) => (
              <li key={i}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </div>
)}
```

---

## Environment Variables to Add

**File:** `.env.example`

These already exist but aren't used - ensure they're documented:
```bash
# Script generation settings
SCRIPT_MODEL=claude-3-5-haiku-20241022  # ✅ Already exists
SCRIPT_TEMPERATURE=0.7                  # ✅ Already exists
SCRIPT_MAX_TOKENS=2000                  # ✅ Already exists

# Future year calculation (already exists)
FUTURE_YEAR_OFFSET=500                  # ✅ Already exists

# NEW: Tone validation thresholds (optional)
TONE_MIN_ACCEPTABLE_SCORE=70
TONE_AUTO_REGENERATE_ON_FAIL=false
```

---

## Testing Plan

### 1. Test Style Guide Integration
```bash
# Generate a news segment
cd /Users/pavel/radio3
pnpm --filter @radio/segment-gen-worker start

# Check logs for:
# - Style guide prompt injection
# - 2525 world references in script
# - No anachronisms (TikTok, etc.)
# - Optimistic but realistic tone
```

### 2. Test Tone Validator
```bash
# Unit test the validator with sample scripts
# Create: workers/segment-gen/src/validators/__tests__/tone-validator.test.ts

# Test cases:
# ✅ "The warp gate opened..." → High optimism, good score
# ❌ "Humanity is doomed..." → Dystopian keyword, low score
# ❌ "Captain used psychic powers..." → Fantasy keyword, low score
# ❌ "Just like on Twitter..." → Anachronism, low score
```

### 3. Test Database Integration
```bash
# After migration:
psql $DATABASE_URL -c "SELECT id, tone_score, tone_balance FROM segments WHERE tone_score IS NOT NULL LIMIT 5;"

# Should show:
#   id   | tone_score | tone_balance
# -------|------------|-------------
#  uuid1 |    85      | 65/25/10
#  uuid2 |    72      | 55/35/10
```

### 4. Test Admin UI
```bash
# Start admin app
pnpm --filter @radio/admin dev

# Visit: http://localhost:3001/dashboard/segments/[any-segment-id]
# Check for tone analysis section
# Verify color coding (green/yellow/red)
```

---

## Summary of Required Changes

### ✅ Can Use As-Is
- Step 1: Style guide creation
- Step 2: System prompt file (with export)
- Step 4: Tone validator class

### ⚠️ Needs Modification
- Step 3: Use correct file paths, add env var support
- Step 5: Use `segment-gen-handler.ts` not `segment-maker.ts`
- Step 6: Proper TypeScript handling in admin

### ❌ Must Add First
- **Database migration** for tone validation fields
- **Update ClaudeClient** to use env vars
- **Calculate futureYear** dynamically

---

## Final Recommendation

**Verdict:** Task L1 is **APPROVED WITH MODIFICATIONS**

The core concept is excellent and necessary for maintaining consistent 2525 world-building. However, implementation must be adapted to:

1. **Current architecture** (llm/ subdirectory, segment-gen-handler.ts)
2. **Configuration best practices** (env vars, dynamic year calculation)
3. **Database schema** (migration required first)
4. **Existing prompt system** (integration not replacement)

**Estimated Time (Revised):** 2-3 hours (includes migration + testing)

**Suggested Next Steps:**
1. Create database migration
2. Refactor ClaudeClient for env var support
3. Create style guide and tone validator
4. Integrate into prompt templates
5. Update admin UI
6. Test with sample segments

---

**Questions for Clarification:**

1. Should tone validation **block** segment completion or just **warn**?
2. Should failed tone segments auto-regenerate (retry with adjusted prompt)?
3. What tone_score threshold should trigger admin review? (Currently: 70)
4. Should conversation formats (interview/panel) have different tone rules?

---

**Review Complete**
Date: 2025-11-16
Reviewer: Claude Code
Status: Ready for Implementation (with modifications)
