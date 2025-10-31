# @radio/core

Core contracts package for AI Radio 2525. Contains all shared types, schemas, and utilities.

## Installation
```bash
pnpm add @radio/core
```

## Usage

### Schemas

Import and use Zod schemas for runtime validation:
```typescript
import { segmentSchema, Segment } from '@radio/core';

// Parse and validate
const segment: Segment = segmentSchema.parse(data);

// Safe parse (returns result object)
const result = segmentSchema.safeParse(data);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

### Logger

Create structured loggers for services:
```typescript
import { createLogger } from '@radio/core/logger';

const logger = createLogger('my-service');

logger.info({ userId: '123' }, 'User action performed');
logger.error({ error: err }, 'Operation failed');
```

### Errors

Throw structured errors:
```typescript
import { ValidationError, RAGError } from '@radio/core/errors';

throw new ValidationError('Invalid input', { field: 'email' });
throw new RAGError('Retrieval timeout', { query: 'test' });
```

### Time Utilities
```typescript
import { toFutureTime, formatBroadcastTime } from '@radio/core/utils';

const futureDate = toFutureTime(new Date(), 500); // Add 500 years
const formatted = formatBroadcastTime(futureDate);
```

### Constants
```typescript
import { 
  SEGMENT_STATE_TRANSITIONS, 
  RAG_TIMEOUT_MS,
  AUDIO_TARGET_LUFS 
} from '@radio/core/constants';
```

## Development
```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Type check
pnpm typecheck
```

## Rules

**CRITICAL:** This package defines the contracts for the entire system.

- Never define types locally in application code
- Always import from `@radio/core`
- Never use `any` type
- All schemas must have Zod validation
- All exported functions must have JSDoc comments

## API Documentation

See individual schema files for detailed field documentation.