# Quick Reference - AI Radio 2525

## Import Rules
```typescript
// ✅ Correct
import { Segment, SegmentState } from '@radio/core';

// ❌ Wrong
type Segment = { ... };  // Never define types locally
```

## Logging
```typescript
// ✅ Correct
import { createLogger } from '@radio/core/logger';
const logger = createLogger('my-service');
logger.info({ context }, 'Message');

// ❌ Wrong
console.log('Message');  // Never use console
```

## Error Handling
```typescript
// ✅ Correct
import { ValidationError } from '@radio/core/errors';
throw new ValidationError('Invalid input', { field: 'email' });

// ❌ Wrong
throw new Error('Invalid input');  // Use specific error classes
```

## Environment Variables
```typescript
// ✅ Correct
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

// ❌ Wrong
const apiKey = process.env.ANTHROPIC_API_KEY || 'default-key';
```

## Database Queries
```typescript
// ✅ Correct
const result = await db.query(
  'SELECT * FROM segments WHERE id = $1',
  [segmentId]
);

// ❌ Wrong
const result = await db.query(
  `SELECT * FROM segments WHERE id = '${segmentId}'`
);
```

## Test Structure
```typescript
// ✅ Correct
import { createSegment } from '@radio/test-utils';

describe('SegmentService', () => {
  it('should create segment when valid data provided', async () => {
    // Arrange
    const data = createSegment();
    
    // Act
    const result = await service.create(data);
    
    // Assert
    expect(result.id).toBeDefined();
  });
});
```

## Before Marking Complete

1. Run `pnpm test`
2. Run `pnpm typecheck`
3. Run `pnpm run quality-gate`
4. Review security checklist
5. Update CHANGELOG.md

## Common Commands
```bash
# Quality checks
pnpm run quality-gate
pnpm run check:security
pnpm run check:types

# Testing
pnpm test
pnpm test:integration

# Build
pnpm build
pnpm typecheck
```