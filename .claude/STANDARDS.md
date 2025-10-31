# Development Standards for AI Radio 2525

**Version:** 1.0  
**Last Updated:** 2025-01-01  
**Status:** MANDATORY - All code must follow these standards

---

## Security Standards

### SEC-001: No Hardcoded Credentials

**Rule:** All secrets, API keys, and credentials must be loaded from environment variables.

**Rationale:** Hardcoded secrets are the #1 security vulnerability. They get committed to git and exposed in logs.

**Enforcement:** Automated via `check-hardcoded-values.sh`

**Example - DO:**
```typescript
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY environment variable not set');
}
```

**Example - DON'T:**
```typescript
const apiKey = 'sk-ant-abc123';  // ❌ NEVER
```

---

### SEC-002: Input Validation

**Rule:** All external inputs must be validated with Zod schemas before processing.

**Rationale:** Prevents injection attacks and data corruption.

**Enforcement:** Code review

**Example - DO:**
```typescript
import { segmentSchema } from '@radio/core';

const segment = segmentSchema.parse(requestBody);
```

**Example - DON'T:**
```typescript
const segment = requestBody;  // ❌ No validation
```

---

### SEC-003: SQL Parameterization

**Rule:** All database queries must use parameterized statements, never string concatenation.

**Rationale:** Prevents SQL injection attacks.

**Enforcement:** Automated via `check-sql-injection.sh`

**Example - DO:**
```typescript
const result = await db.query(
  'SELECT * FROM segments WHERE id = $1',
  [segmentId]
);
```

**Example - DON'T:**
```typescript
const result = await db.query(
  `SELECT * FROM segments WHERE id = '${segmentId}'`  // ❌ INJECTION RISK
);
```

---

### SEC-004: Environment Variables Documentation

**Rule:** All environment variables used in code must be documented in `.env.example`.

**Rationale:** Ensures deployment environments are properly configured.

**Enforcement:** Automated via `check-env-vars.sh`

**Example - DO:**
```bash
# In .env.example
# Anthropic API key for LLM generation
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

---

### SEC-005: No Secrets in Logs

**Rule:** Never log sensitive data (API keys, passwords, tokens).

**Rationale:** Logs are often stored insecurely or sent to third parties.

**Enforcement:** Code review

**Example - DO:**
```typescript
logger.info({ userId: user.id }, 'User authenticated');
```

**Example - DON'T:**
```typescript
logger.info({ password: user.password }, 'User authenticated');  // ❌ NEVER
```

---

## Code Quality Standards

### CQ-001: Type Imports

**Rule:** All types must be imported from `@radio/core`. Never define types locally.

**Rationale:** Ensures type consistency across the codebase.

**Enforcement:** Automated via `check-type-imports.sh`

**Example - DO:**
```typescript
import { Segment, SegmentState } from '@radio/core';
```

**Example - DON'T:**
```typescript
type Segment = {  // ❌ Local type definition
  id: string;
  // ...
};
```

---

### CQ-002: No Any Type

**Rule:** Never use `any` type. Use `unknown` if type is truly unknown.

**Rationale:** `any` defeats the purpose of TypeScript.

**Enforcement:** TypeScript compiler (strict mode)

**Example - DO:**
```typescript
function process(data: unknown) {
  if (typeof data === 'string') {
    // Now TypeScript knows it's a string
  }
}
```

**Example - DON'T:**
```typescript
function process(data: any) {  // ❌ No type safety
  // ...
}
```

---

### CQ-003: JSDoc Comments

**Rule:** All exported functions must have JSDoc comments.

**Rationale:** Provides inline documentation and IDE hints.

**Enforcement:** Code review

**Example - DO:**
```typescript
/**
 * Generates a radio segment from a script
 * @param script - The segment script in Markdown
 * @param voiceId - The voice model to use
 * @returns Audio asset ID
 */
export async function generateSegment(
  script: string, 
  voiceId: string
): Promise<string> {
  // ...
}
```

---

### CQ-004: Error Handling

**Rule:** Use try-catch with specific error classes from `@radio/core/errors`.

**Rationale:** Provides structured error handling and better debugging.

**Enforcement:** Code review

**Example - DO:**
```typescript
import { ValidationError } from '@radio/core/errors';

try {
  const data = schema.parse(input);
} catch (error) {
  throw new ValidationError('Invalid input', { 
    field: 'email',
    originalError: error 
  });
}
```

**Example - DON'T:**
```typescript
throw new Error('Something went wrong');  // ❌ Not specific
```

---

### CQ-005: No Console.log

**Rule:** Use the shared logger from `@radio/core/logger`. Never use `console.log`.

**Rationale:** Structured logging is searchable and filterable.

**Enforcement:** Automated via `check-logging.sh`

**Example - DO:**
```typescript
import { createLogger } from '@radio/core/logger';
const logger = createLogger('segment-worker');

logger.info({ segmentId }, 'Processing segment');
```

**Example - DON'T:**
```typescript
console.log('Processing segment', segmentId);  // ❌ NEVER
```

---

### CQ-006: No TODO Without Issue

**Rule:** All TODO comments must reference a GitHub issue.

**Rationale:** Prevents forgotten technical debt.

**Enforcement:** Automated via `check-todos.sh`

**Example - DO:**
```typescript
// TODO(#123): Implement retry logic
```

**Example - DON'T:**
```typescript
// TODO: Fix this later  // ❌ No issue reference
```

---

### CQ-007: DRY Principle

**Rule:** Don't repeat yourself. Extract duplicated code into shared functions.

**Rationale:** Reduces bugs and maintenance burden.

**Enforcement:** Code review

**Threshold:** Max 2 repetitions allowed before extraction required.

---

### CQ-008: Function Length

**Rule:** Functions should be max 50 lines. Break into smaller functions if longer.

**Rationale:** Long functions are hard to understand and test.

**Enforcement:** Code review

---

### CQ-009: File Length

**Rule:** Files should be max 300 lines. Split into multiple files if longer.

**Rationale:** Large files are hard to navigate.

**Enforcement:** Code review

---

### CQ-010: Meaningful Names

**Rule:** Variables, functions, and files must have descriptive names.

**Rationale:** Code should be self-documenting.

**Enforcement:** Code review

**Example - DO:**
```typescript
const segmentDurationSeconds = 180;
```

**Example - DON'T:**
```typescript
const x = 180;  // ❌ Not descriptive
```

---

## Testing Standards

### TEST-001: Test Coverage

**Rule:** Minimum 70% code coverage for business logic.

**Rationale:** Tests catch regressions and document behavior.

**Enforcement:** Coverage reports

---

### TEST-002: Test Naming

**Rule:** Use `should_when` pattern for test names.

**Rationale:** Makes tests self-documenting.

**Enforcement:** Code review

**Example - DO:**
```typescript
it('should create segment when valid data provided', async () => {
  // ...
});
```

**Example - DON'T:**
```typescript
it('test 1', () => {  // ❌ Not descriptive
  // ...
});
```

---

### TEST-003: Test Isolation

**Rule:** Tests must not share state. Use beforeEach to reset state.

**Rationale:** Prevents flaky tests.

**Enforcement:** Code review

---

### TEST-004: Test Data

**Rule:** Use factories from `@radio/test-utils`, not hardcoded data.

**Rationale:** Keeps tests maintainable when schemas change.

**Enforcement:** Code review

**Example - DO:**
```typescript
import { createSegment } from '@radio/test-utils';

const segment = createSegment({ state: 'ready' });
```

**Example - DON'T:**
```typescript
const segment = {  // ❌ Hardcoded
  id: '123',
  state: 'ready',
  // ...
};
```

---

### TEST-005: Integration Tests

**Rule:** All API endpoints must have integration tests.

**Rationale:** Unit tests alone don't catch integration issues.

**Enforcement:** Code review

---

### TEST-006: Mock External Services

**Rule:** External APIs must be mocked in tests.

**Rationale:** Tests should be fast and not depend on external services.

**Enforcement:** Code review

---

### TEST-007: Test Documentation

**Rule:** Complex test setups must have comments explaining the scenario.

**Rationale:** Makes tests understandable to others.

**Enforcement:** Code review

---

### TEST-008: Performance Tests

**Rule:** Critical paths must have performance assertions.

**Rationale:** Prevents performance regressions.

**Enforcement:** Code review

**Example:**
```typescript
it('should complete RAG retrieval in under 2 seconds', async () => {
  const start = Date.now();
  await retrieve(query);
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(2000);
});
```

---

## Database Standards

### DB-001: Migration Naming

**Rule:** Migration files must use timestamp-description format.

**Rationale:** Ensures migrations run in order.

**Enforcement:** Code review

**Example:** `20250101120000_create_segments_table.sql`

---

### DB-002: Parameterized Queries

**Rule:** Always use parameterized queries, never string concatenation.

**Rationale:** Prevents SQL injection.

**Enforcement:** Automated via `check-sql-injection.sh`

---

### DB-003: Index Creation

**Rule:** All indexes must be defined in migrations with comments explaining why.

**Rationale:** Undocumented indexes are often removed by mistake.

**Enforcement:** Code review

---

### DB-004: Transaction Usage

**Rule:** Multi-statement operations must use transactions.

**Rationale:** Ensures data consistency.

**Enforcement:** Code review

---

### DB-005: Schema Validation

**Rule:** All migrations must be tested against a test database before committing.

**Rationale:** Prevents production schema issues.

**Enforcement:** CI/CD pipeline

---

### DB-006: Rollback Migrations

**Rule:** All migrations must have a corresponding down migration.

**Rationale:** Allows safe rollbacks.

**Enforcement:** Code review

---

### DB-007: Connection Pooling

**Rule:** Database connections must use pooling with documented max connections.

**Rationale:** Prevents connection exhaustion.

**Enforcement:** Code review

---

## API Standards

### API-001: Request Validation

**Rule:** All API endpoints must validate request bodies with Zod schemas.

**Rationale:** Prevents invalid data from entering the system.

**Enforcement:** Code review

---

### API-002: Error Responses

**Rule:** All error responses must use structured error format.

**Rationale:** Provides consistent error handling for clients.

**Enforcement:** Code review

**Format:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "statusCode": 400,
    "context": { "field": "email" }
  }
}
```

---

### API-003: Response Types

**Rule:** All API responses must match documented TypeScript types.

**Rationale:** Ensures type safety across client-server boundary.

**Enforcement:** Code review

---

### API-004: Rate Limiting

**Rule:** Public endpoints must have rate limiting.

**Rationale:** Prevents abuse.

**Enforcement:** Code review

---

## AI Coding Rules

### AI-001: Load Architecture

**Rule:** Always load relevant ARCHITECTURE.md sections before starting a task.

**Rationale:** Ensures alignment with system design.

**Enforcement:** Task execution protocol

---

### AI-002: Import Types

**Rule:** Import types from `@radio/core`, never define locally.

**Rationale:** Prevents type drift.

**Enforcement:** Automated via `check-type-imports.sh`

---

### AI-003: Use Shared Logger

**Rule:** Use shared logger from `@radio/core/logger`.

**Rationale:** Ensures consistent logging.

**Enforcement:** Automated via `check-logging.sh`

---

### AI-004: Run Quality Gate

**Rule:** Run quality gate script before marking task complete.

**Rationale:** Catches common mistakes.

**Enforcement:** Task execution protocol

---

### AI-005: Update Changelog

**Rule:** Update CHANGELOG.md when deviating from architecture.

**Rationale:** Documents architectural decisions.

**Enforcement:** Task execution protocol

---

### AI-006: Ask Questions

**Rule:** Ask clarifying questions before making assumptions.

**Rationale:** Prevents implementing wrong solutions.

**Enforcement:** Task execution protocol

---

### AI-007: Read Previous Deliverables

**Rule:** Read previous task deliverables before starting.

**Rationale:** Ensures integration with existing code.

**Enforcement:** Task execution protocol

---

### AI-008: Test Real Data

**Rule:** Test against real data from previous tasks.

**Rationale:** Catches integration issues early.

**Enforcement:** Task execution protocol

---

### AI-009: Document Dependencies

**Rule:** Document any external dependencies added.

**Rationale:** Keeps dependency tree manageable.

**Enforcement:** Code review

---

### AI-010: Create Integration Tests

**Rule:** Create integration tests for vertical slices.

**Rationale:** Ensures end-to-end functionality.

**Enforcement:** Task execution protocol

---

## Summary

These standards are **non-negotiable**. All code must follow them.

**Before committing:**
1. Run `pnpm run quality-gate`
2. Run `pnpm test`
3. Run `pnpm typecheck`
4. Review security checklist
5. Review code quality checklist

**If quality gate fails:**
- Fix issues immediately
- Re-run quality gate
- Do not commit until all checks pass