#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKS_DIR="$SCRIPT_DIR/scripts"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Banner
echo "╔════════════════════════════════════════╗"
echo "║   AI Radio 2525 - Quality Gate        ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Running checks..."
echo ""

# Array to store results
declare -a failed_checks

# Run each check
for check in "$CHECKS_DIR"/*.sh; do
  check_name=$(basename "$check" .sh)
  
  if "$check"; then
    echo -e "${GREEN}✅${NC} $check_name"
  else
    echo -e "${RED}❌${NC} $check_name"
    failed_checks+=("$check_name")
  fi
done

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#failed_checks[@]} -eq 0 ]; then
  echo -e "${GREEN}✓ RESULT: All checks passed${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo -e "${RED}✗ RESULT: ${#failed_checks[@]} check(s) failed${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Failed checks:"
  for check in "${failed_checks[@]}"; do
    echo "  - $check"
  done
  echo ""
  echo -e "${YELLOW}Run with --fix to auto-fix some issues${NC}"
  exit 1
fi