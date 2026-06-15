# Runbook — reference-code backfill (Story 9-58, Deliverable B / AC4.3)

**Purpose:** assign a human-friendly `OSL-<YYYY>-<6 base32>` reference code to
every pre-9-58 respondent that has none. New respondents get a code at creation
(wizard / enumerator / clerk chokepoints); this one-shot fills the historical
rows so support (9-56), the public status check (9-58 Deliverable A), and the
re-engagement blasts (9-27 / 9-28) can quote / resolve by the code.

**Script:** `apps/api/scripts/_backfill-reference-code.ts`. Year namespace = each
respondent's `created_at` year. Emits one `OPERATOR_REFERENCE_CODE_BACKFILLED`
audit row per assigned code.

## ⛔ Hard precondition: deploy first

The script + the `reference_code` column + its UNIQUE index ship on the 9-58
branch. Production Postgres is **localhost-only on the VPS**, so the backfill
**cannot run from a laptop and cannot run until 9-58 is merged to `main` and
deployed** (the deploy runs `db:push` then `migrate-reference-code-init.ts`).
Sequence:

1. Merge 9-58 → CI deploys `main` to the VPS (column + UNIQUE index created).
2. Confirm the deploy: `ssh root@oslsr-home-app 'cd /root/<repo> && git log --oneline -1'`.
3. Then run the steps below **on the VPS**.

## Procedure (on the VPS, over Tailscale)

```bash
# 1. PREVIEW (no writes) — counts rows + samples the first 10:
ssh root@oslsr-home-app 'cd /root/<repo>/apps/api && pnpm tsx scripts/_backfill-reference-code.ts --dry-run'

# 2. APPLY (writes a code per row, one audit row each):
ssh root@oslsr-home-app 'cd /root/<repo>/apps/api && pnpm tsx scripts/_backfill-reference-code.ts --apply --confirm-i-am-not-dry-running'
```

## Safety properties (built into the script)
- **PREVIEW by default** — `--dry-run` (or `--apply` without
  `--confirm-i-am-not-dry-running`) writes nothing.
- **Idempotent** — only touches `reference_code IS NULL` rows, and re-checks
  `IS NULL` inside each row's transaction (`SELECT … FOR UPDATE`). A row that
  got a code between selection and write is skipped, never overwritten. Re-runs
  are safe.
- **Unique** — codes are minted via `ReferenceCodeService.generateUnique`
  (collision-retry against the `idx_respondents_reference_code` UNIQUE index).
- **Audited** — one `operator.reference_code_backfilled` row per assignment,
  carrying the assigned code + `operator_marker`.

## Verify after applying
- Summary line should read `assigned=N skipped=0 failed=0`.
- No rows left: `ssh root@oslsr-home-app "docker exec -i oslsr-postgres psql -U oslsr_user -d oslsr_db -c \"SELECT count(*) FROM respondents WHERE reference_code IS NULL;\""` → expect 0.
- Confirm audit rows: `... -c "SELECT count(*) FROM audit_logs WHERE action = 'operator.reference_code_backfilled';"` → expect N.

## Run it before the Cohort A/B blasts
The re-engagement blast emails (`_reengagement-email-blast.ts` /
`_cohort-a-supplemental-survey-blast.ts`) carry the recipient's application
reference once those scripts adopt the optional `referenceCode` block (flagged
in 9-58 Dev Notes). Backfill **before** the blasts fire so every email can quote
the code. Updated sequencing: 9-58 Deliverable B (this backfill) → 9-20 Resend
Pro → fire blast.

## NOT applicable
- Phone-only registrants with no email still get a code (the code is
  per-respondent, channel-agnostic); SMS delivery of the code waits for Termii
  (out of scope here, Story 9-27 Part B).
