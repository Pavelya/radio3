#!/bin/bash

echo "Phase 0 Completion Verification"
echo "================================"
echo ""

# F1: Core Package
echo "F1: Core Contracts Package"
if [ -f packages/radio-core/dist/index.js ]; then
  echo "  ✅ Package built"
else
  echo "  ❌ Package not built - run: cd packages/radio-core && pnpm build"
fi

if cd packages/radio-core && pnpm test >/dev/null 2>&1; then
  echo "  ✅ Tests pass"
else
  echo "  ❌ Tests fail - run: cd packages/radio-core && pnpm test"
fi
cd ../..

# F2: Standards
echo ""
echo "F2: Development Standards"
[ -f .claude/STANDARDS.md ] && echo "  ✅ STANDARDS.md exists" || echo "  ❌ STANDARDS.md missing"
[ -f .claude/QUICK-REFERENCE.md ] && echo "  ✅ QUICK-REFERENCE.md exists" || echo "  ❌ QUICK-REFERENCE.md missing"
[ -d .claude/checklists ] && echo "  ✅ Checklists directory exists" || echo "  ❌ Checklists missing"
[ -f .claude/checklists/security-checklist.md ] && echo "  ✅ Security checklist exists" || echo "  ❌ Security checklist missing"

# F3: Architecture
echo ""
echo "F3: Architecture Document"
[ -f .claude/ARCHITECTURE.md ] && echo "  ✅ ARCHITECTURE.md exists" || echo "  ❌ ARCHITECTURE.md missing"

# F4: Quality Gates
echo ""
echo "F4: Quality Gate Scripts"
[ -x ops/quality-gate.sh ] && echo "  ✅ Main script executable" || echo "  ❌ Make executable: chmod +x ops/quality-gate.sh"
[ -f ops/config/hardcoded-patterns.txt ] && echo "  ✅ Patterns configured" || echo "  ❌ Patterns missing"
[ -x ops/scripts/check-hardcoded-values.sh ] && echo "  ✅ Check scripts executable" || echo "  ❌ Make executable: chmod +x ops/scripts/*.sh"

# F5: Test Utils
echo ""
echo "F5: Test Utilities Package"
if [ -f packages/radio-test-utils/dist/index.js ]; then
  echo "  ✅ Package built"
else
  echo "  ❌ Package not built - run: cd packages/radio-test-utils && pnpm build"
fi

echo ""
echo "================================"

# Count issues
ISSUES=0
[ ! -f packages/radio-core/dist/index.js ] && ((ISSUES++))
[ ! -f .claude/STANDARDS.md ] && ((ISSUES++))
[ ! -f .claude/ARCHITECTURE.md ] && ((ISSUES++))
[ ! -x ops/quality-gate.sh ] && ((ISSUES++))
[ ! -f packages/radio-test-utils/dist/index.js ] && ((ISSUES++))

if [ $ISSUES -eq 0 ]; then
  echo "✅ Phase 0 Complete!"
  echo ""
  echo "Next steps:"
  echo "1. git add ."
  echo "2. git commit -m 'feat: complete Phase 0 foundation'"
  echo "3. Begin development tiers"
else
  echo "⚠️  Found $ISSUES issue(s)"
  echo "Fix the issues above before proceeding"
fi