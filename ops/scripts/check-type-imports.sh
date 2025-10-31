#!/bin/bash
set -e

FOUND=0

# Find local type definitions (excluding allowed locations)
if grep -r -n \
  -E "^export (type|interface)" \
  --include="*.ts" \
  --exclude="*.test.ts" \
  --exclude="*.spec.ts" \
  --exclude="*.generated.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=packages/radio-core \
  --exclude-dir=packages/radio-test-utils \
  apps/ workers/ 2>/dev/null; then
  FOUND=1
fi

exit $FOUND