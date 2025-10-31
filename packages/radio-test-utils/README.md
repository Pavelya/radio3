# @radio/test-utils

Test utilities for AI Radio 2525. Provides factories, fixtures, and test helpers.

## Installation
```bash
pnpm add -D @radio/test-utils
```

## Usage

### Factories
```typescript
import { createSegment, createSegmentInState } from '@radio/test-utils';

// Create with defaults
const segment = createSegment();

// Create with overrides
const newsSegment = createSegment({
  slot_type: 'news',
  lang: 'en'
});

// Create in specific state
const readySegment = createSegmentInState('ready');

// Create multiple
const segments = createSegments(5);
```

### Database Helpers
```typescript
import { cleanDatabase, seedTestData, waitForCondition } from '@radio/test-utils';

beforeEach(async () => {
  await cleanDatabase();
});

test('example', async () => {
  // Seed test data
  const segment = createSegment();
  await seedTestData('segments', segment);
  
  // Wait for condition
  await waitForCondition(async () => {
    const result = await checkSomething();
    return result === true;
  }, { timeout: 5000 });
});
```

## Development
```bash
pnpm install
pnpm build
pnpm test
```