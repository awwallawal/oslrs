#!/usr/bin/env bash
# Pre-deploy environment variable safety check
# Prevents crash-restart loops by validating required env vars BEFORE app restart.
#
# Parses requiredProdVars from apps/api/src/app.ts (single source of truth)
# and checks that each var is present in the target .env file.
#
# Usage:
#   bash scripts/check-env.sh [OPTIONS]
#
# Options:
#   --env-file PATH    Path to .env file (default: .env)
#   --app-ts PATH      Path to app.ts file (default: apps/api/src/app.ts)
#
# Exit codes:
#   0 = All required vars present (deploy safe)
#   1 = Missing required vars (deploy MUST abort)
#
# Background: SEC-3 incident (2026-03-02) — CORS_ORIGIN added to requiredProdVars
# but not set on VPS .env before deploying. Result: 12+ PM2 crash-restart cycles.

set -euo pipefail

# Defaults
ENV_FILE=".env"
APP_TS="apps/api/src/app.ts"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --app-ts) APP_TS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate inputs
if [ ! -f "$ENV_FILE" ]; then
  echo "DEPLOY ABORTED: Env file not found: $ENV_FILE"
  exit 1
fi

if [ ! -f "$APP_TS" ]; then
  echo "DEPLOY ABORTED: app.ts not found: $APP_TS"
  exit 1
fi

echo "Pre-deploy env var safety check"
echo "=================================="
echo "  Env file: $ENV_FILE"
echo "  Source:   $APP_TS"
echo ""

# Extract required vars from app.ts (single source of truth)
# Parses the requiredProdVars array between [ and ]; — captures ALL quoted strings per line
REQUIRED_VARS=$(sed -n '/const requiredProdVars/,/];/p' "$APP_TS" | grep -o "'[^']*'" | tr -d "'")

if [ -z "$REQUIRED_VARS" ]; then
  echo "DEPLOY ABORTED: Could not parse requiredProdVars from $APP_TS"
  echo "  The array format may have changed. Fix the extraction logic in scripts/check-env.sh"
  echo "  before deploying. Do NOT bypass this check."
  exit 1
fi

FAIL=0
PASS_COUNT=0
FAIL_COUNT=0

# Check required vars
echo "Required Variables:"
for var in $REQUIRED_VARS; do
  # Check if var is defined (non-empty value after =); handles both VAR= and export VAR= formats
  if grep -q "^\(export \)\?${var}=" "$ENV_FILE" 2>/dev/null; then
    VAL=$(grep "^\(export \)\?${var}=" "$ENV_FILE" | head -1 | cut -d= -f2-)
    # Strip surrounding quotes (dotenv strips them at runtime, so we must too)
    VAL=$(echo "$VAL" | sed "s/^[\"']//;s/[\"']$//")
    if [ -z "$VAL" ]; then
      echo "  FAIL $var -- defined but EMPTY"
      FAIL=1
      FAIL_COUNT=$((FAIL_COUNT + 1))
    else
      echo "  PASS $var"
      PASS_COUNT=$((PASS_COUNT + 1))
    fi
  else
    echo "  FAIL $var -- MISSING"
    FAIL=1
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

# JWT_SECRET length check (min 32 chars per app.ts validation)
JWT_VAL=$(grep "^\(export \)\?JWT_SECRET=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
JWT_VAL=$(echo "$JWT_VAL" | sed "s/^[\"']//;s/[\"']$//")
if [ -n "$JWT_VAL" ] && [ ${#JWT_VAL} -lt 32 ]; then
  echo "  FAIL JWT_SECRET too short (${#JWT_VAL} chars, minimum 32)"
  FAIL=1
  FAIL_COUNT=$((FAIL_COUNT + 1))
  PASS_COUNT=$((PASS_COUNT - 1))
fi

# Optional group checks (warnings only, never fail deployment)
echo ""
echo "Optional Variable Groups:"
WARN_COUNT=0

# S3/Backups
S3_MISSING=""
for var in S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET_NAME; do
  if ! grep -q "^\(export \)\?${var}=" "$ENV_FILE" 2>/dev/null; then
    S3_MISSING="$S3_MISSING $var"
  fi
done
if [ -n "$S3_MISSING" ]; then
  echo "  WARN S3/Backups: Missing$S3_MISSING (backup worker will fail)"
  WARN_COUNT=$((WARN_COUNT + 1))
else
  echo "  PASS S3/Backups"
fi

# Email/Resend
if ! grep -q "^\(export \)\?RESEND_API_KEY=" "$ENV_FILE" 2>/dev/null; then
  echo "  WARN Email: Missing RESEND_API_KEY (email sending will fail)"
  WARN_COUNT=$((WARN_COUNT + 1))
else
  echo "  PASS Email/Resend"
fi

# Google OAuth
if ! grep -q "^\(export \)\?GOOGLE_CLIENT_ID=" "$ENV_FILE" 2>/dev/null; then
  echo "  WARN OAuth: Missing GOOGLE_CLIENT_ID (Google login unavailable)"
  WARN_COUNT=$((WARN_COUNT + 1))
else
  echo "  PASS Google OAuth"
fi

# Summary
echo ""
echo "=================================="
if [ $FAIL -eq 1 ]; then
  echo "DEPLOY ABORTED: $FAIL_COUNT required var(s) missing or invalid"
  echo ""
  echo "Fix: Add missing variables to VPS .env file, then re-deploy."
  echo "See: docs/infrastructure-cicd-playbook.md#pre-deploy-env-var-check"
  exit 1
fi

echo "All $PASS_COUNT required env vars present"
if [ $WARN_COUNT -gt 0 ]; then
  echo "  $WARN_COUNT optional group warning(s) -- features may be limited"
fi
exit 0
