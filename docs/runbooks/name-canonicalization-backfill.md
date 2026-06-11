# Runbook — respondent name-canonicalization backfill (Story 9-18 Part F, Task 5.5)

**Purpose:** fix the swapped `first_name`/`last_name` on pre-9-18 respondent rows
(the old wizard parsed a single "Full Name" first-token-first; Yoruba/Nigerian
surname-first entries were stored mis-split). Operator-gated, audited, one-shot.

**Script:** `apps/api/scripts/_backfill-name-canonicalization.ts` (surname-designation
model: the operator fills a `surname` column; `family = surname`, `given = name −
surname`). Emits one `OPERATOR_RESPONDENT_NAME_CANONICALIZED` audit row per change.

## ⛔ Hard precondition: deploy first
The script (and its `exceljs` dependency) live on the 9-18 branch, **not on `main`**.
Production Postgres is **localhost-only on the VPS**, so the backfill **cannot run
from a laptop and cannot run until 9-18 is merged to `main` and deployed.** Sequence:

1. Merge 9-18 → CI deploys `main` to the VPS.
2. Confirm the deploy: `ssh root@oslsr-home-app 'cd /root/<repo> && git log --oneline -1'`.
3. Then run the steps below **on the VPS**.

## Procedure (on the VPS, over Tailscale)

The reviewed worksheet (the operator-filled surnames) lives on the laptop at
`_bmad-output/scratch/name-backfill-surname-model/proposed.xlsx`
(139 rows verified 2026-06-11: 128 change / 11 no-change / 0 unmatched).

```bash
# 1. Copy the reviewed file to the VPS (NOT into the git tree — use /tmp):
scp _bmad-output/scratch/name-backfill-surname-model/proposed.xlsx root@oslsr-home-app:/tmp/

# 2. PREVIEW (no writes) — prints every row that WOULD change:
ssh root@oslsr-home-app 'cd /root/<repo>/apps/api && pnpm tsx scripts/_backfill-name-canonicalization.ts --apply --file /tmp/proposed.xlsx'

# 3. APPLY (writes 128 rows, one audit row each):
ssh root@oslsr-home-app 'cd /root/<repo>/apps/api && pnpm tsx scripts/_backfill-name-canonicalization.ts --apply --confirm-i-am-not-dry-running --file /tmp/proposed.xlsx'

# 4. Clean up the copied file:
ssh root@oslsr-home-app 'rm -f /tmp/proposed.xlsx'
```

## Safety properties (built into the script)
- **PREVIEW by default** — `--apply` without `--confirm-i-am-not-dry-running` writes nothing.
- **Live-row guard (`dbMatchesSnapshot`)** — each row is re-read inside its txn and
  swapped only if the live DB still matches the reviewed snapshot. Drifted /
  already-applied / missing rows are **skipped** (logged + counted as `drift-skipped`),
  never clobbered or double-swapped. So a re-run is safe (idempotent).
- **Audit `previous`** records the actual DB values (not the worksheet), per row.

## Verify after applying
- Summary line should read `changed=128 no-change=11 unmatched=0 drift-skipped=0 failed=0`.
- Spot-check a swapped row: `ssh root@oslsr-home-app "docker exec -i oslsr-postgres psql -U oslsr_user -d oslsr_db -c \"SELECT first_name, last_name FROM respondents WHERE id = '<a-changed-id>';\""`
- Confirm audit rows: `... -c "SELECT count(*) FROM audit_logs WHERE action = 'operator.respondent_name_canonicalized';"` → expect 128.

## Run it before the Cohort A/B blasts
Re-engagement emails greet by given name — run this so greetings are canonical
(see `_reengagement-email-blast.ts`, which prefers `respondents.first_name`).

## NOT applicable
- **ID cards (Task 5.8 / AC#F4):** moot — ID cards are generated for staff/`users`,
  not `respondents`. The backfill does not touch any card.
