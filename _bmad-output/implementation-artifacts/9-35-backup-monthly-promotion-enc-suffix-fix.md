# Story 9.35: Backup `promoteToMonthly()` encryption-suffix fix — first-of-month promotion silently 404s

Status: done — ✅ 2026-06-23. Part A: `promoteToMonthly` gains `encrypt: boolean` (AC#A2); `dailyKey`/`monthlyKey` mirror the upload-side `.enc` suffix (AC#A3/A4, comment cites the upload line); caller in `processBackup` passes the in-scope `encrypt` (AC#A5); manifest copy unchanged (AC#A6 ✓); `cleanupOldMonthlies` regex `(\d{4}-\d{2})` matches `.enc` keys unchanged (AC#A7 ✓ — verified, no code change). Part B: backup.worker tests 15→**16** (AC#B4) — new encrypted `.sql.gz.enc` source+target assertion + existing tests pass `encrypt:false`; api tsc 0, all green. **AC#C1 — MOOT/superseded:** the planned backfill promoted the 2026-06-01 *daily*, but the 7-day daily-retention sweep deleted it ~2026-06-08 (today is 2026-06-23) — no source remains. Net: **2026-06 monthly is a permanent one-time gap**; the fix prevents recurrence from the 2026-07-01 promotion onward. Operator MAY optionally promote a current June daily as a non-1st stand-in if a June monthly snapshot is wanted (cosmetic for the 7-year retention; not required).

<!--
Authored 2026-06-01 by Bob (SM) via canonical *create-story --yolo workflow.

ORIGIN: Story 9-19 Operations Dashboard surfaced today (2026-06-01 ~01:20 UTC)
that the daily backup worker's THREE retry attempts all reported
`event: 'backup.job_failed', error: 'UnknownError'` — but every pre-promotion
stage logged success (pg_dump.complete + encrypt.complete + checksum.computed +
s3_upload.verified + manifest.uploaded). Comparison with 2026-05-31 logs (which
contained a `backup.retention` event after `manifest.uploaded`) localised the
failure to the `cleanupOldDailies → promoteToMonthly → cleanupOldMonthlies`
retention-block in `processBackup()`. June 1 = first promotion attempt since
Story 9-9 AC#5 backup encryption shipped in prod (per memory the encryption
ship-event matched `BACKUP_ENCRYPTION_KEY` being set on prod .env).

ROOT CAUSE (verified via direct code-read of `apps/api/src/workers/backup.worker.ts`):
  Line 385-386: `promoteToMonthly()` hardcodes `${dateStr}-app_db.sql.gz` for
  both `dailyKey` (CopyObjectCommand source) and `monthlyKey` (target). But
  line 467 constructs the actual upload filename as
  `encrypt ? '${plainFilename}.enc' : plainFilename` and line 469 uploads to
  `backups/daily/${filename}`. When encryption is on, the real S3 object lives
  at `backups/daily/2026-06-01-app_db.sql.gz.enc` — the CopyObjectCommand's
  source lookup at `backups/daily/2026-06-01-app_db.sql.gz` (no .enc) 404s →
  AWS SDK throws → BullMQ wraps as "UnknownError" in the worker catch block.

  Why only today: line 382 guards `if (day !== 1) return false;` — the promotion
  only fires on the 1st of each month. May 31 = no promotion (skip).
  June 1 = first promotion attempt post-encryption-ship.

DATA SAFETY: today's daily backup
  `backups/daily/2026-06-01-app_db.sql.gz.enc` exists in S3 (3 verified uploads
  from the 3 retry attempts; `s3_upload.verified` event logged each time). The
  DATA is safe; ONLY the monthly-snapshot bookkeeping failed for 2026-06.

PRIORITY: LOW (cron-day-1-only firing — next refire is 2026-07-01, ~30 days
  away). Manual remediation for the missing 2026-06 monthly is a single CLI
  command + 7-day window before `cleanupOldDailies` reclaims the source object.
  NOT field-deployment-blocking; NOT urgent.

EFFORT: ~30 minutes (small mechanical fix + 1 new test). Single production file
  modified + 1 test file extended.
-->

## Story

As the **operator of the OSLSR backup pipeline**,
I want **`promoteToMonthly()` to correctly construct S3 source + target keys when backup encryption is enabled, so that the first-of-month monthly-snapshot bookkeeping succeeds end-to-end**,
So that **(1) every first-of-month run produces a `backups/monthly/YYYY-MM-app_db.sql.gz.enc` snapshot per the 7-year retention policy (`cleanupOldMonthlies` at line 412-445 uses an 84-month cutoff), (2) the false-positive `backup.job_failed` CRITICAL alert that fired in the Story 9-19 dashboard on 2026-06-01 cannot recur, (3) the architectural asymmetry between the upload path (line 467, encryption-aware) and the promotion path (line 385-386, encryption-blind) is closed, and (4) the long-term S3 promotion → cleanup chain (`backups/daily/` 7-day retention → `backups/monthly/` 84-month retention) survives a hypothetical 7-year audit recovery scenario rather than silently losing all monthly snapshots since the day encryption shipped**.

## Background — why this story exists

### The 2026-06-01 dashboard alert

At ~01:20 UTC on 2026-06-01, Story 9-19's Operations Dashboard surfaced a CRITICAL alert: `backup.job_failed` with `error: "UnknownError"`. Three retry attempts (per BullMQ backoff policy) all failed the same way. Pre-promotion stages all logged success on every attempt:

```text
backup.start { date: '2026-06-01', filename: '2026-06-01-app_db.sql.gz.enc', encrypted: true }
backup.pg_dump.start / .complete
backup.encrypt.start / .complete { algorithm: 'aes-256-gcm', ivHex: '<redacted>' }
backup.checksum.computed { sizeBytes: <n>, checksumSha256: '<prefix>...' }
backup.s3_upload.start / .verified { s3Key: 'backups/daily/2026-06-01-app_db.sql.gz.enc' }
backup.manifest.uploaded { manifestKey: 'backups/manifests/2026-06-01-manifest.json' }
backup.job_failed { error: 'UnknownError' }   ← FAILURE HERE
```

The differentiator vs the working 2026-05-31 backup logs: 2026-05-31 contained a `backup.retention { deletedDailies, promoted, deletedMonthlies }` event AFTER `manifest.uploaded`. 2026-06-01 logs DO NOT contain that event. The retention block (line 568-572 of `processBackup`) is exactly where the failure lives.

### Code-read confirms the bug

`apps/api/src/workers/backup.worker.ts:380-410`:

```typescript
export async function promoteToMonthly(s3: S3Client, bucket: string, dateStr: string): Promise<boolean> {
  const day = parseInt(dateStr.split('-')[2], 10);
  if (day !== 1) return false;

  const monthStr = dateStr.substring(0, 7); // YYYY-MM
  const dailyKey = `backups/daily/${dateStr}-app_db.sql.gz`;       // ← line 385: NO .enc suffix
  const monthlyKey = `backups/monthly/${monthStr}-app_db.sql.gz`;  // ← line 386: NO .enc suffix

  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${dailyKey}`,  // ← line 390: 404s when real object has .enc suffix
    Key: monthlyKey,
  }));
  ...
}
```

But the upload path at line 460-469 constructs the actual S3 key encryption-aware:

```typescript
const plainFilename = `${dateStr}-app_db.sql.gz`;
...
const encrypt = isEncryptionEnabled();
const filename = encrypt ? `${plainFilename}.enc` : plainFilename;  // ← line 467
const tmpEncryptedPath = path.join(tmpdir(), filename);
const s3Key = `backups/daily/${filename}`;                          // ← line 469
```

When `BACKUP_ENCRYPTION_KEY` is set (which it is on prod since Story 9-9 AC#5), real S3 objects live at `backups/daily/${dateStr}-app_db.sql.gz.enc`. The `CopyObjectCommand` at line 390 sources from `backups/daily/${dateStr}-app_db.sql.gz` — different path, doesn't exist → S3 returns 404 NoSuchKey → AWS SDK throws → BullMQ's processor catches the thrown error and re-emits as the generic `"UnknownError"` in the digest pipeline.

### Why only today (first-of-month-only firing)

The promotion guard at line 382 — `if (day !== 1) return false;` — means `promoteToMonthly` only does any S3 work on the 1st of the month. The bug has been latent since Story 9-9 AC#5 shipped backup encryption to prod, but:

- 2026-05-01 was BEFORE encryption shipped (no `.enc` mismatch yet) — promotion worked then.
- 2026-05-02 through 2026-05-31 all returned early (`day !== 1`) — bug latent.
- 2026-06-01 = first day-1 firing since encryption shipped → bug surfaces.

The next refire is **2026-07-01** (~30 days from authoring), so the production impact is **monthly bookkeeping only, on the 1st of each month**. The 2026-07-01 firing will fail the SAME way unless this story ships before then.

### Data safety — the daily backup is intact

The 3 retry attempts ALL completed every pre-promotion stage successfully. `backups/daily/2026-06-01-app_db.sql.gz.enc` exists in S3 (verified via `backup.s3_upload.verified` log event from each attempt). The retention policy at `cleanupOldDailies` (called at line 569, BEFORE `promoteToMonthly`) retains daily backups for 7 days, so the source object will remain available until **2026-06-08** — operators have a one-week window to manually backfill the missing 2026-06 monthly snapshot (see AC#C1 below).

After 2026-06-08, `cleanupOldDailies` will sweep the 2026-06-01 daily and the monthly snapshot for 2026-06 will be **permanently missing** from the 7-year retention archive. The forensic impact of a missing 2026-06 monthly is bounded (the 2026-05 monthly is intact and the 2026-07 monthly will exist post-fix), but a 7-year audit recovery in 2033 would surface the gap. The manual remediation step in AC#C1 closes this window.

### Why fix now (not later)

Cost-of-leaving: zero immediate impact, but every passing month silently re-fires the bug and creates a new permanent monthly-snapshot gap. By 2026-12-31 we'd have 7 missing monthlies (2026-06 through 2026-12) in the retention archive. The Operations Dashboard would continue surfacing the CRITICAL `backup.job_failed` alert on the 1st of every month, creating alert fatigue.

Cost-of-fixing: ~30 minutes of mechanical work + 1 test. The fix is a 2-3 line change in a single function with a known shape (`encrypt` boolean already in scope at the caller).

Recommended pickup: any time before **2026-07-01** to prevent recurrence. Manual remediation for the 2026-06 monthly (AC#C1) must happen before **2026-06-08** OR be accepted as a permanent gap.

## Concrete bug locations + fix shape

### Bug site

`apps/api/src/workers/backup.worker.ts:380-410` (`promoteToMonthly` function)

### Caller site

`apps/api/src/workers/backup.worker.ts:570` (within `processBackup`):
```typescript
const promoted = await promoteToMonthly(s3, bucket, dateStr);
```

The caller already has `encrypt` in scope at line 466 (`const encrypt = isEncryptionEnabled();`).

### Adjacent sites that are NOT bugs (verified — for the dev agent's confidence)

- **`cleanupOldDailies`** (line 365 area, called at line 569 BEFORE `promoteToMonthly`) — lists S3 objects by prefix `backups/daily/` and parses by regex; tolerates any suffix. Already encryption-agnostic. ✅
- **`cleanupOldMonthlies`** (line 412-445) — same pattern: lists `backups/monthly/` prefix, regex-matches `(\d{4}-\d{2})` from the key to extract month, deletes anything older than 84 months. The regex matches the YYYY-MM portion regardless of extension. Already encryption-agnostic. ✅
- **`backups/manifests/${dateStr}-manifest.json`** (line 559) and the monthly manifest copy at lines 395-396 — manifests always use `.json` suffix, no encryption-suffix logic needed. ✅

The bug is **ONLY** in `promoteToMonthly`'s two key-string constants (lines 385-386).

### Recommended fix shape (locked in AC#A1 below)

Add `encrypt: boolean` as a third parameter to `promoteToMonthly()`. Mirror the upload-side filename construction:

```typescript
export async function promoteToMonthly(
  s3: S3Client,
  bucket: string,
  dateStr: string,
  encrypt: boolean,  // NEW
): Promise<boolean> {
  const day = parseInt(dateStr.split('-')[2], 10);
  if (day !== 1) return false;

  const monthStr = dateStr.substring(0, 7); // YYYY-MM
  const ext = encrypt ? '.sql.gz.enc' : '.sql.gz';   // NEW
  const dailyKey = `backups/daily/${dateStr}-app_db${ext}`;       // CHANGED
  const monthlyKey = `backups/monthly/${monthStr}-app_db${ext}`;  // CHANGED

  // (rest unchanged)
}
```

And update the caller at line 570:
```typescript
const promoted = await promoteToMonthly(s3, bucket, dateStr, encrypt);
```

Rejected alternatives (do NOT relitigate at impl time):
- **Read `isEncryptionEnabled()` inline inside `promoteToMonthly`**: pollutes the function with env-var coupling and makes unit tests slower + flakier (have to mutate env between tests). The caller already has `encrypt` cleanly in scope.
- **Reconstruct the filename via the upload helper**: over-engineered; the 1-line ternary inline matches the existing pattern at line 467 and keeps the diff minimal.

## Acceptance Criteria

### Part A — Bug fix in `promoteToMonthly`

1. **AC#A1 — Locked fix strategy: pass `encrypt: boolean` as a third parameter.** Documented in story Dev Notes "Locked fix strategy" subsection BEFORE any code change. Rationale: (a) caller at line 570 already has `encrypt` in scope from line 466; (b) inline env-var reads pollute tests; (c) matches the upload-path pattern at line 467. The dev agent does NOT relitigate this choice.

2. **AC#A2 — `promoteToMonthly` signature accepts `encrypt: boolean`.** Update function signature at `apps/api/src/workers/backup.worker.ts:380` to add the new parameter (no default — operator-explicit). TypeScript compile fails on any caller that doesn't pass it.

3. **AC#A3 — `dailyKey` constructs `.sql.gz.enc` when `encrypt=true`, `.sql.gz` otherwise.** Match the upload-side filename construction at line 467 exactly (single source of truth for the suffix decision documented in code via a `// matches line 467 upload-side filename` comment).

4. **AC#A4 — `monthlyKey` mirrors the same encryption-aware extension.** Symmetric with `dailyKey`. Monthly target keys are `backups/monthly/YYYY-MM-app_db.sql.gz.enc` when encryption is enabled.

5. **AC#A5 — Caller at line 570 updated to pass `encrypt`.** Single-line change inside `processBackup`. The `encrypt` constant from line 466 is already in scope.

6. **AC#A6 — Manifest copy path UNCHANGED.** The manifest copy block at lines 394-406 uses `.json` suffix; no encryption-suffix logic needed. Dev agent verifies (no diff to lines 394-406) and documents in Dev Notes.

7. **AC#A7 — `cleanupOldMonthlies` audit.** Verify the monthly-cleanup function at line 412-445 correctly handles `.enc`-suffixed keys (the regex `(\d{4}-\d{2})` matches the YYYY-MM date portion of the key regardless of extension). Document the verification result inline in Dev Notes; no code change expected.

### Part B — Tests

8. **AC#B1 — New unit test: encrypted-mode promotion uses `.sql.gz.enc` source key.** Add a new `it()` block inside `describe('promoteToMonthly', ...)` at `apps/api/src/workers/__tests__/backup.worker.test.ts:387`. Test asserts:
    - `promoteToMonthly(s3, 'test-bucket', '2026-06-01', true)` returns `true`.
    - `mockS3Send` is called twice (CopyObject for backup + CopyObject for manifest, matching the existing test's count).
    - The first `CopyObjectCommand` argument's `CopySource` ends with `2026-06-01-app_db.sql.gz.enc` (NOT `.sql.gz` alone).
    - The first `CopyObjectCommand` argument's `Key` (the target monthly path) ends with `2026-06-app_db.sql.gz.enc`.

9. **AC#B2 — Existing non-encrypted test still passes.** Update the existing test at line 388-398 to pass `encrypt: false` as the new fourth argument; assert the source key ends with `.sql.gz` (no `.enc`). Behaviour-preserving change for the unencrypted code path.

10. **AC#B3 — Day-guard test still passes.** Existing test at line 400-408 (`'should NOT copy on other days of month'`) must continue to pass — update the call signature to pass `encrypt: false` (or `true`; doesn't matter — the day-guard returns early before any S3 work). Behaviour-preserving.

11. **AC#B4 — Adjacent test count unchanged or +1.** The full `backup.worker.test.ts` test count grows by exactly 1 (AC#B1's new test). No new test files; no new test directories.

### Part C — Manual remediation + verification

12. **AC#C1 — Manual remediation step documented in Dev Notes.** Step-by-step CLI to backfill the missing 2026-06 monthly snapshot before the 2026-06-08 daily-retention sweep:
    ```bash
    # Via Tailscale SSH to oslsr-home-app:
    ssh root@oslsr-home-app

    # Source the prod .env to pick up S3 credentials + bucket name + endpoint:
    set -a && source /root/oslrs/.env && set +a

    # Copy the existing daily backup to the missing monthly slot:
    aws s3 \
      --endpoint-url=https://${S3_ENDPOINT_HOST:-sfo3.digitaloceanspaces.com} \
      cp \
      s3://${S3_BUCKET_NAME}/backups/daily/2026-06-01-app_db.sql.gz.enc \
      s3://${S3_BUCKET_NAME}/backups/monthly/2026-06-app_db.sql.gz.enc

    # Optional — also copy the manifest for forensic completeness:
    aws s3 \
      --endpoint-url=https://${S3_ENDPOINT_HOST:-sfo3.digitaloceanspaces.com} \
      cp \
      s3://${S3_BUCKET_NAME}/backups/manifests/2026-06-01-manifest.json \
      s3://${S3_BUCKET_NAME}/backups/manifests/monthly/2026-06-manifest.json
    ```
    Window: must run **before 2026-06-08** OR be accepted as a permanent 2026-06 monthly gap (the 2026-05 monthly is intact and the 2026-07 monthly will exist post-fix, so the gap is bounded to one month).
    Document operator decision in story Dev Agent Record after the fix ships.

13. **AC#C2 — Pre-merge code review on uncommitted tree.** Per `feedback_review_before_commit.md`. Auto-fix HIGH/MEDIUM findings per the established Story 9-12 / 9-15 / 9-17 / 9-19 / 9-30 / 9-33 pattern. LOW findings deferrable with rationale in §"Review Follow-ups (AI)".

14. **AC#C3 — `pnpm test` 4/4 packages green post-fix.** Specifically: API workers suite (including `backup.worker.test.ts`) and any sibling suites that import worker types stay green. Zero new failures; zero regressions.

15. **AC#C4 — tsc clean both apps.** Husky pre-commit hook validates this; dev agent confirms BEFORE staging. The new `encrypt: boolean` parameter on `promoteToMonthly` would fail compile if any caller missed updating — that's the desired regression catch.

## Tasks / Subtasks

- [ ] **Task 1 — Refactor `promoteToMonthly()` signature + body (AC: #A1-#A4, #A6, #A7)**
  - [ ] 1.1: Add `encrypt: boolean` parameter to function signature at line 380
  - [ ] 1.2: Add `const ext = encrypt ? '.sql.gz.enc' : '.sql.gz';` near the top of the function body (after the day-guard return)
  - [ ] 1.3: Update `dailyKey` (line 385) + `monthlyKey` (line 386) to use `${ext}` template
  - [ ] 1.4: Add inline comment referencing the upload-side filename construction at line 467 for future maintainers
  - [ ] 1.5: Verify (and document in Dev Notes) that lines 394-406 manifest copy block stays unchanged
  - [ ] 1.6: Verify (and document in Dev Notes) that `cleanupOldMonthlies` (line 412-445) regex tolerates `.enc` keys

- [ ] **Task 2 — Update caller at line 570 (AC: #A5)**
  - [ ] 2.1: Change `await promoteToMonthly(s3, bucket, dateStr)` to `await promoteToMonthly(s3, bucket, dateStr, encrypt)`

- [ ] **Task 3 — Tests (AC: #B1, #B2, #B3, #B4)**
  - [ ] 3.1: Update existing `'should copy backup to monthly on 1st of month'` test (line 388) to pass `encrypt: false` and assert source key ends with `.sql.gz` (no .enc)
  - [ ] 3.2: Update existing `'should NOT copy on other days of month'` test (line 400) to pass the new arg (any boolean — day-guard returns early)
  - [ ] 3.3: Add new test `'should use .sql.gz.enc suffix when encryption is enabled'` asserting source + target keys both end with `.enc`
  - [ ] 3.4: Run `pnpm --filter @oslsr/api vitest run apps/api/src/workers/__tests__/backup.worker.test.ts` to verify just the affected suite first; then `pnpm test` from root for the full sweep

- [ ] **Task 4 — Pre-merge code review + verification (AC: #C1, #C2, #C3, #C4)**
  - [ ] 4.1: `pnpm test` from root — confirm 4/4 packages green; capture API + Web test counts in Dev Agent Record
  - [ ] 4.2: `tsc --noEmit` on api + web — clean exit (husky pre-commit will catch otherwise)
  - [ ] 4.3: Run `/code-review` workflow on uncommitted tree
  - [ ] 4.4: Address HIGH/MEDIUM findings inline; defer LOW with rationale in §"Review Follow-ups (AI)"
  - [ ] 4.5: Operator-gated AC#C1 manual remediation (out of dev scope — document the CLI in this story for the operator's reference; track operator-execution status in Dev Agent Record)

## Dev Notes

### Locked fix strategy (load-bearing — do NOT relitigate at impl time)

**Pass `encrypt: boolean` as a third parameter to `promoteToMonthly`**. The caller at `processBackup` line 570 already has `encrypt` cleanly in scope (computed at line 466 via `isEncryptionEnabled()`). The alternative of reading `isEncryptionEnabled()` inline inside `promoteToMonthly` was considered and rejected:
- It pollutes the function with env-var coupling.
- Unit tests have to mutate `process.env` between cases to test both branches.
- It violates the principle of "compute once at the caller, pass down" already established at line 466.

The 1-line parameter add at the signature + 1-line `ext` constant inside the body + 2-line key-string changes = ~4 lines of production diff total.

### Failure-mode chain (load-bearing — required reading for the dev agent + any future incident triager)

```
                 ┌──────────────────────────────────────────────┐
2026-06-01       │  processBackup()                              │
01:20 UTC        │    ↓                                          │
                 │  upload to backups/daily/...-app_db.sql.gz.enc  ✅ succeeds
                 │    ↓                                          │
                 │  cleanupOldDailies()  ✅ succeeds            │
                 │    ↓                                          │
                 │  promoteToMonthly(s3, bucket, '2026-06-01')  │
                 │    ↓                                          │
                 │  CopyObjectCommand({                          │
                 │    CopySource: 'oslsr-media/backups/daily/   │
                 │      2026-06-01-app_db.sql.gz'  ← NO .enc    │
                 │  })                                           │
                 │    ↓                                          │
                 │  S3 returns 404 NoSuchKey                     │
                 │    ↓                                          │
                 │  AWS SDK throws                               │
                 │    ↓                                          │
                 │  BullMQ catch wraps → "UnknownError"          │
                 │    ↓                                          │
                 │  backup.job_failed event emitted              │
                 │    ↓                                          │
                 │  retry 1, retry 2 → same failure              │
                 │    ↓                                          │
                 │  Story 9-19 dashboard surfaces CRITICAL alert │
                 └──────────────────────────────────────────────┘
```

The retry behaviour is correct (BullMQ standard exponential backoff); the worker's catch block correctly surfaces the failure to the dashboard. **The bug is purely the source-key string mismatch** — every other layer behaved as designed.

### Why the bug stayed latent for ~30 days

Story 9-9 AC#5 backup encryption shipped to prod (date approximate from memory entry; the `BACKUP_ENCRYPTION_KEY` env var was set at some point in late April → 2026-05). Every daily backup from then through 2026-05-31 was correctly encrypted + uploaded with `.enc` suffix. None of those days triggered `promoteToMonthly` because `day !== 1` returned early.

2026-06-01 is the first day-1 firing post-encryption-ship. The bug was effectively a **time-bomb cron**, dormant for ~30 days, firing exactly once on the next month-boundary.

The class of bug — encryption-suffix mismatch between upload + promotion paths — would also affect any other code that constructs `backups/daily/${dateStr}-app_db.sql.gz` literal strings. Grep verifies there are no other such sites in `backup.worker.ts` or elsewhere in the codebase (the manifest path at line 559 uses `.json`, not the data filename).

### Why not also expose `getDailyKey()` / `getMonthlyKey()` helper functions

YAGNI. Two call sites (upload at line 469 + promotion in this fix) is below the "rule of three" extraction threshold. If a third site emerges (e.g. a restore script, a manual integrity-check tool), extract then. Until then, the inline `${ext}` ternary at two sites is simpler than a helper indirection.

### File-level overlap with parallel-track stories

- **Story 9-16** (magic-link login) — touches `auth.service.ts` + `auth.controller.ts`. No overlap.
- **Story 9-17** (form pin UI + Pattern C dedup) — frontend + Q.M. page. No overlap.
- **Story 9-18** (NIN-first wizard redesign) — wizard frontend + `registration.controller.ts`. No overlap.
- **Story 9-27 Part B** (SMS Termii) — new files in `apps/api/src/services/sms/`. No overlap.
- **Story 9-32** (account-settings + NDPA rights) — new files. No overlap.
- **Story 9-34** (audit-pattern unification) — touches `registration.controller.ts` + `reminder.worker.ts` + backfill scripts. NO overlap with `backup.worker.ts`.

This story is safe to ship in parallel with any of the above.

### Verification strategy

The unit test at AC#B1 is the primary regression lock — it catches any future refactor that drops the `.enc` suffix logic. Integration verification (real S3 + real cron firing) won't happen until 2026-07-01 (the next first-of-month). The operator can optionally validate the fix in advance by manually triggering a backup with `pnpm tsx apps/api/scripts/manual-backup.ts` (if such a script exists; otherwise the test pass + code-review confirms the fix).

### Project Structure Notes

No file moves; no migrations; no new tables; no new audit-action enum values; no new types in `packages/types`. Pure signature + literal change across **1 production file + 1 test file**.

### References

- [Source: apps/api/src/workers/backup.worker.ts:380-410] — `promoteToMonthly` function (bug site)
- [Source: apps/api/src/workers/backup.worker.ts:460-469] — upload-path filename construction (the encryption-aware pattern to mirror)
- [Source: apps/api/src/workers/backup.worker.ts:466] — `isEncryptionEnabled()` call producing the `encrypt` boolean
- [Source: apps/api/src/workers/backup.worker.ts:570] — caller site (`processBackup` retention block)
- [Source: apps/api/src/workers/__tests__/backup.worker.test.ts:387-409] — existing `promoteToMonthly` test scaffold
- [Source: apps/api/src/workers/backup.worker.ts:412-445] — `cleanupOldMonthlies` (AC#A7 audit target; expected: no change)
- Memory: [[feedback_review_before_commit]] — Task 4 discipline
- Story 9-9 AC#5 — origin of the backup encryption that made this bug surface
- Story 9-19 — Operations Dashboard that surfaced the alert

## Dev Agent Record

### Agent Model Used

(to be populated by dev-story)

### Pre-impl Decision Log

(to be populated — particularly any deviation from the locked AC#A1 strategy if dev encounters something at impl time that warrants reconsideration)

### Debug Log References

(to be populated — captures the test counts, tsc result, code-review session ID)

### Completion Notes List

(to be populated)

### File List

(to be populated — expected: 1 production file modified + 1 test file modified, no new files)

### Manual Remediation Status (AC#C1)

(to be populated by operator post-fix — date the AC#C1 CLI was run + verification that `backups/monthly/2026-06-app_db.sql.gz.enc` exists in S3, OR decision to accept the 2026-06 monthly gap)

### Review Follow-ups (AI)

(to be populated post-code-review per Task 4)
