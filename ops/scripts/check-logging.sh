#!/bin/bash
set -e

FOUND=0

# Find console.log statements (excluding test files)
if grep -r -n \
  -E "console\.(log|error|warn|debug|info)" \
  --include="*.ts" \
  --include="*.js" \
  --include="*.py" \
  --exclude="*.test.ts" \
  --exclude="*.spec.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir=build \
  . 2>/dev/null; then
  FOUND=1
fi

exit $FOUND