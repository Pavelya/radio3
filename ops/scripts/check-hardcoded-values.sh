#!/bin/bash
set -e

PATTERNS_FILE="$(dirname "$0")/../config/hardcoded-patterns.txt"
FOUND=0

# Check if patterns file exists
if [ ! -f "$PATTERNS_FILE" ]; then
  echo "Error: Patterns file not found: $PATTERNS_FILE"
  exit 1
fi

# Check each pattern
while IFS= read -r pattern; do
  # Skip empty lines and comments
  [[ -z "$pattern" || "$pattern" =~ ^#.* ]] && continue
  
  if grep -r -n -E "$pattern" \
    --include="*.ts" \
    --include="*.js" \
    --include="*.py" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=build \
    --exclude-dir=.git \
    . 2>/dev/null; then
    FOUND=1
  fi
done < "$PATTERNS_FILE"

exit $FOUND