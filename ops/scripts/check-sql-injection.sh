#!/bin/bash
set -e

FOUND=0

# Check for string concatenation in SQL
# Dangerous patterns: query(` ... ${var} ... `) or query('...' + var + '...')
if grep -r -n \
  -E "(query|execute)\s*\(\s*[\`'\"].*\$\{|query\s*\(\s*.*\s*\+\s*" \
  --include="*.ts" \
  --include="*.js" \
  --include="*.py" \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir=build \
  . 2>/dev/null; then
  FOUND=1
fi

exit $FOUND