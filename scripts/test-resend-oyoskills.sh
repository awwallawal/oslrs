#!/usr/bin/env bash
# One-shot Resend send test for the oyoskills.com domain swap.
# Reads RESEND_API_KEY from ../.env, sends from noreply@oyoskills.com to TO_ADDR.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found at $(pwd)/.env"
  exit 1
fi

RESEND_API_KEY="$(grep -E '^RESEND_API_KEY=' .env | head -1 | cut -d= -f2-)"
TO_ADDR="${1:-lawalkolade@gmail.com}"

if [ -z "$RESEND_API_KEY" ]; then
  echo "ERROR: RESEND_API_KEY not set in .env"
  exit 1
fi

echo "Sending test email FROM noreply@oyoskills.com TO $TO_ADDR ..."

HTTP_RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"from\": \"OSLRS Test <noreply@oyoskills.com>\",
    \"to\": [\"${TO_ADDR}\"],
    \"subject\": \"OSLRS Resend domain swap verification\",
    \"html\": \"<p>If you see this, <strong>oyoskills.com</strong> is sending via Resend correctly.</p><p>Check headers for dkim=pass / spf=pass / dmarc=pass.</p>\"
  }")

HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n1)
BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

echo ""
echo "HTTP $HTTP_CODE"
echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "SUCCESS — check $TO_ADDR inbox in ~30s. Open the email, click 'Show original', and verify dkim=pass / spf=pass / dmarc=pass."
  exit 0
else
  echo "FAILED — Resend rejected the request. Likely causes: domain not yet verified, API key invalid, or From address mismatch."
  exit 1
fi
