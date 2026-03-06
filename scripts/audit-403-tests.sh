#!/usr/bin/env bash
# audit-403-tests.sh — 403 authorization test coverage auditor
#
# Scans protected API routes for authorize() middleware and checks that
# corresponding controller test files include 403/FORBIDDEN assertions.
#
# Usage:
#   bash scripts/audit-403-tests.sh
#
# Exit codes:
#   0 - All protected routes have 403 test coverage
#   1 - Gaps or missing test files found
#
# Canonical 403 test pattern: report.controller.test.ts:214-232
# Source: Team agreement P3 (Epic 6 retro) — "403 test enforcement must be tooling-based"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROUTES_DIR="$PROJECT_ROOT/apps/api/src/routes"
TESTS_DIR="$PROJECT_ROOT/apps/api/src/controllers/__tests__"

# Counters
total_protected=0
covered=0
gaps=0
missing=0

# Arrays for report
covered_lines=()
gap_lines=()
missing_lines=()

# Enable nullglob so unmatched globs expand to nothing
shopt -s nullglob

for route_file in "$ROUTES_DIR"/*.routes.ts; do
  route_name=$(basename "$route_file")

  # Skip if no authorize() usage — public route
  if ! grep -q 'authorize(' "$route_file"; then
    continue
  fi

  total_protected=$((total_protected + 1))

  # Derive base name: e.g., staff.routes.ts -> staff
  base_name="${route_name%.routes.ts}"

  # Find matching controller test files (dot and hyphen variants)
  test_files=("$TESTS_DIR"/${base_name}.controller*.test.ts "$TESTS_DIR"/${base_name}-*.controller*.test.ts)

  if [ ${#test_files[@]} -eq 0 ]; then
    missing=$((missing + 1))
    missing_lines+=("  $route_name -> NO controller test file found")
    continue
  fi

  # Check test files for 403/FORBIDDEN/Rejected roles assertions
  total_assertions=0
  for test_file in "${test_files[@]}"; do
    count=$(grep -c -E '403|FORBIDDEN|Rejected roles' "$test_file" 2>/dev/null || true)
    total_assertions=$((total_assertions + count))
  done

  # Build test file name list for display
  test_names=""
  for tf in "${test_files[@]}"; do
    if [ -n "$test_names" ]; then
      test_names="$test_names, $(basename "$tf")"
    else
      test_names="$(basename "$tf")"
    fi
  done

  # Singular/plural label
  if [ "$total_assertions" -eq 1 ]; then label="assertion"; else label="assertions"; fi

  if [ "$total_assertions" -gt 0 ]; then
    covered=$((covered + 1))
    covered_lines+=("  $route_name -> $test_names ($total_assertions $label)")
  else
    gaps=$((gaps + 1))
    gap_lines+=("  $route_name -> $test_names (0 $label)")
  fi
done

shopt -u nullglob

# Output report
echo ""
echo "## 403 Test Coverage Audit"
echo ""
echo "Protected routes: $total_protected | Covered: $covered | Gaps: $gaps | Missing: $missing"
echo ""

if [ ${#covered_lines[@]} -gt 0 ]; then
  echo "COVERED:"
  for line in "${covered_lines[@]}"; do
    echo "$line"
  done
  echo ""
fi

if [ ${#gap_lines[@]} -gt 0 ]; then
  echo "GAPS:"
  for line in "${gap_lines[@]}"; do
    echo "$line"
  done
  echo ""
fi

if [ ${#missing_lines[@]} -gt 0 ]; then
  echo "MISSING TEST FILES:"
  for line in "${missing_lines[@]}"; do
    echo "$line"
  done
  echo ""
fi

# Exit code: 0 if all covered, 1 if any gaps or missing files
if [ "$gaps" -gt 0 ] || [ "$missing" -gt 0 ]; then
  echo "RESULT: FAIL — $((gaps + missing)) route(s) need 403 test coverage"
  exit 1
else
  echo "RESULT: PASS — All protected routes have 403 test coverage"
  exit 0
fi
