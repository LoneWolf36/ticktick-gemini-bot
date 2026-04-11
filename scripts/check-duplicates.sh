#!/bin/bash
set -e

echo "========================================="
echo "  Duplicate Code Detection"
echo "========================================="
echo ""

# Track overall status
EXIT_CODE=0

# 1. JavaScript/TypeScript duplicate detection with JSCPD
echo "📊 Running JSCPD duplicate detection..."
echo ""
npx jscpd --threshold 5 || {
  echo ""
  echo "⚠️  JSCPD found duplicates above threshold"
  echo "   Review the report in docs/jscpd-baseline.html"
  EXIT_CODE=1
}

echo ""
echo "-----------------------------------------"
echo ""

# 2. Python similarity detection with Pylint
echo "🐍 Running Pylint similarity check..."
echo ""
pylint --disable=all --enable=similarities,R0801 \
  .kittify/overrides/scripts/*.py \
  .kittify/overrides/scripts/tasks/*.py 2>&1 || {
  echo ""
  echo "⚠️  Pylint found similarities"
  echo "   Consider refactoring the duplicates"
  # Don't fail the build for pylint similarities, just warn
}

echo ""
echo "========================================="
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Duplicate detection passed"
else
  echo "❌ Duplicate detection found issues"
fi
echo "========================================="

exit $EXIT_CODE
