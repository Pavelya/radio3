#!/bin/bash
set -e

# Extract env vars from code
ENV_VARS=$(grep -r -h -o \
  -E "process\.env\.[A-Z_]+" \
  --include="*.ts" \
  --include="*.js" \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir=build \
  . 2>/dev/null | sed 's/process\.env\.//' | sort -u)

# Check if .env.example exists
if [ ! -f ".env.example" ]; then
  echo "Error: .env.example not found"
  exit 1
fi

MISSING=()

for var in $ENV_VARS; do
  if ! grep -q "^$var=" .env.example 2>/dev/null; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Missing env vars in .env.example:"
  printf '  %s\n' "${MISSING[@]}"
  exit 1
fi

exit 0