#!/bin/bash
set -e

FOUND=0

# Find TODOs without issue reference
# Valid: TODO(#123) or TODO(username)
# Invalid: TODO without parentheses
if grep -r -n \
  -E "(//|#)\s*(TODO|FIXME|HACK|XXX)(?!\()" \
  --include="*.ts" \
  --include="*.js" \
  --include="*.py" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  . 2>/dev/null; then
  FOUND=1
fi

exit $FOUND