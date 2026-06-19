# Story 9.43: Export & Reporting Data-Safety Hardening (CSV injection, unbounded export, audit reliability, verify-endpoint minimization)

Status: done

<!--
Authored 2026-06-07 by Bob (SM) via canonical *create-story --yolo workflow.
Source: sprint-change-proposal-2026-06-06-security-r2-remediation.md §4.1 + REMEDIATION-BRIEF.md.
LAUNCH-GATE story (Phase 2 🚦). One atomic commit PER F-ID + a fail-old/pass-new test each.
Findings: F-008 (CSV/Excel formula injection), F-009 (unbounded CSV export), F-013 (export
audit logging unreliable), F-020 (public verify endpoint over-shares).
-->

## Story

As **the OSLSR custodian of bulk PII exports and the public verification surface**,
I want **every exported cell neutralized against formula injection, CSV exports bounded and streamed, PII-access audit writes made reliable, and the public verify endpoint minimized**,
so that **an export can't weaponize a spreadsheet, can't exhaust memory, can't silently drop its audit trail, and the public verify path leaks no more than necessary**.

## Acceptance Criteria

1. **AC#1 — F-008: centralized formula-injection sanitization on EVERY cell.** Add a `sanitizeCell()` that prefixes `'` to any value whose first char is `= + - @`, tab, or CR, and apply it to **every** exported cell. Today only `nin`+`phone` get a `\t` prefix; names, `lgaName`, and all dynamic `full`-mode answers are written raw [Source: apps/api/src/services/export.service.ts:202-210]. The existing `\t` is display formatting, not a security control. **Test:** export a record whose name field is `=HYPERLINK("http://x")` → the output cell begins with `'`.
2. **AC#2 — F-009: bound + stream CSV export.** The 1000-row cap is PDF-only; CSV buffers the whole table in memory [Source: apps/api/src/controllers/export.controller.ts:154-191; export-query.service.ts]. Enforce a hard max row count for CSV (reject with 413/explicit cap, or stream) and **stream** the response instead of buffering a single Buffer. **Test:** an export exceeding the cap is streamed or returns 413/explicit cap — not a full in-memory buffer.
3. **AC#3 — F-013: make export audit logging reliable (fail-closed).** `logPiiAccess` is not awaited; failures only `logger.warn` [Source: apps/api/src/controllers/export.controller.ts:115-121,168-174]. Use the transactional `logPiiAccessTx` (or await) and **fail the export if the audit write fails**; alert on `audit.pii_log_failed`. **Test:** simulate an audit-write failure → export returns an error and **no data is sent**.
4. **AC#4 — F-020: minimize the public verify endpoint.** Reduce the fields returned by public `GET /verify/:id` to the minimum needed for verification; proxy the photo through the API instead of returning a raw signed Spaces URL [Source: apps/api/src/...users verify route]. **Test:** response contains only the minimized field set; no raw signed Spaces URL in the body.
5. **AC#5 — Tests + zero regression; no control weakened.** Full API + web suites green; existing export RBAC, consent gating, and rate limits intact. Per-F-ID commit hashes recorded.

## Tasks / Subtasks

- [x] **Task 1 — F-008 `sanitizeCell()` on every cell (AC: #1)**
  - [x] 1.1 Central `sanitizeCell()` exported from `export.service.ts`; applied to EVERY cell via a shared `formatCell()` used by both `generateCsvExport` (all callers benefit) and the new `streamCsvExport`. Display `\t` (Story 9-26) folded in: skipped when sanitize already prefixed `'` (which also forces Excel text mode), so no double-prefix.
- [x] **Task 2 — F-009 CSV row cap + streaming (AC: #2)**
  - [x] `CSV_MAX_ROWS` (100k) → explicit 413 on all CSV modes (summary/full; unified keeps its 50k ceiling). CSV body STREAMED row-by-row via `ExportService.streamCsvExport(res,…)` instead of one in-memory Buffer.
- [x] **Task 3 — F-013 transactional/awaited PII-access audit + fail-closed + alert (AC: #3)**
  - [x] `ExportController.auditExportOrFail()` wraps `logPiiAccessTx` in `db.transaction` and AWAITS it; on failure the export aborts (`AUDIT_WRITE_FAILED` 500, no data) + best-effort Telegram page on `audit.pii_log_failed`. Applied to all three CSV/PDF audit sites.
- [x] **Task 4 — F-020 minimize verify payload + proxy photo (AC: #4)**
  - [x] `verifyStaff` payload minimized (dropped internal `id`; NO raw signed Spaces URL). New `GET /verify/:id/photo` proxies the JPEG through the API; body `photoUrl` is the proxy path.
- [x] **Task 5 — Regression sweep + per-F-ID commit hashes (AC: #5)**
  - [x] API tsc + lint clean; full build green; touched suites green (export.service 30, export.controller 76-incl, productivity/respondent CSV callers unaffected — 150 across the batch). Verify-endpoint assertions added to the DB-gated `user.id-card.test.ts` (runs in CI). Per-F-ID commit hashes recorded at commit time (post-review).

### Review Follow-ups (AI)

Adversarial code review 2026-06-18 (security-R2 track, fresh context). **0 High / 2 Medium / 3 Low** — all four findings (F-008/009/013/020) verified genuinely closed; fail-old/pass-new tests are real; integration points (`logPiiAccessTx` 9-arg, `getPhotoBuffer`) confirmed. All findings fixed in-pass. api tsc 0, web tsc 0, eslint 0; 77 export-suite + 3 VerificationPage tests green.

- [x] [AI-Review][Medium] **M1 — F-009 streaming ignored backpressure**, so a slow client could buffer the whole capped set in the csv-stringify queue (memory bounded by the 100k cap, not a small window). Fixed: `streamCsvExport` now uses a drain-aware pump (honors `write()` === false, resumes on `drain`). +1 backpressure test (slow sink, every row still delivered). [export.service.ts]
- [x] [AI-Review][Medium] **M2 — F-020 changed the public verify contract** (`photoUrl` absolute signed URL → relative proxy path); the web consumer rendered it directly as `<img src>`, which works in prod (same-origin) but breaks in local dev (relative path resolves to the web origin). Fixed: `VerificationPage` builds the photo src from `API_URL` + id (works dev + prod); `photoUrl` is now a presence flag. +2 web tests (proxy-src + null-photo placeholder). [VerificationPage.tsx]
- [x] [AI-Review][Low] **L1 — photo proxy cached PII with `Cache-Control: public`** (shared/CDN-cacheable selfie). Fixed → `private, max-age=300`. [user.controller.ts]
- [x] [AI-Review][Low] **L2 — inconsistent cap status codes** (CSV 413 vs unified 400). Fixed: unified cap → 413 (harmonized with the CSV cap). PDF cap stays 400 BY DESIGN (a format-choice rejection "use CSV", not a payload-size one). Test updated. [export.controller.ts]
- [x] [AI-Review][Low] **L3 — a CSV stream failing AFTER headers were sent** would make the catch `next(err)` throw `ERR_HTTP_HEADERS_SENT`. Fixed: `if (res.headersSent) { res.destroy(); return; }` so the client gets a truncated download (clear failure) instead. [export.controller.ts]
- _Observation (no change): `sanitizeCell` renders a leading-`-` numeric answer as text in Excel — the standard OWASP security>fidelity tradeoff, accepted._

## Dev Notes
- **One atomic commit per F-ID.** F-013 is the highest-integrity one (silent audit loss on a PII export is the worst failure mode here) — fail-closed is mandatory.
- Reuse the existing audit/alert infrastructure (`logPiiAccessTx`, `alert.service.ts`); no new primitive.
- Testing: backend `__tests__/`; for streaming, assert no single full Buffer is materialized.

### Project Structure Notes
- Touch: `services/export.service.ts`, `controllers/export.controller.ts`, `services/export-query.service.ts`, the public `users` verify route/controller, audit service wiring.

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-security-r2-remediation.md#section-4-detailed-change-proposals]
- [Source: security-assessment/REMEDIATION-BRIEF.md] (F-008/009/013/020)
- [Source: apps/api/src/services/export.service.ts:202] · [Source: apps/api/src/controllers/export.controller.ts:115]

## Dev Agent Record
### Agent Model Used
claude-opus-4-8[1m] (Amelia / dev agent) — security-r2 track, worktree `../oslrs-security` on `track/security-r2-41-45`.

### Debug Log References
- export.service.test: 30 green (incl. sanitizeCell, formula-injection, streaming). export.controller.test: reworked for fail-closed audit (`db.transaction`+`logPiiAccessTx`) + CSV streaming + 413 cap — green. Batch run with productivity + respondent CSV callers: 150 green.
- API tsc 0, eslint 0, full workspace build green.
- F-020 assertions live in `user.id-card.test.ts` (DB-gated integration — runs in CI; verified compatible: existing `toMatchObject` subset still holds).

### Completion Notes List
- **F-008** — `sanitizeCell()` prefixes `'` to any cell starting with `= + - @ \t \r`, applied to EVERY cell through a shared `formatCell()`. Distinct from the Story 9-26 `\t` display formatting (kept, but skipped when sanitize already added `'`). Benefits ALL CSV exports (productivity/respondent too), not just the respondent export.
- **F-009** — `CSV_MAX_ROWS=100000` hard ceiling → explicit 413 (was: unbounded in-memory buffer). CSV body streamed row-by-row via `streamCsvExport` (csv-stringify stream piped to the response) so memory is bounded by the cap, not the row width × count Buffer.
- **F-013** — fail-closed: audit write is awaited inside a transaction BEFORE any bytes leave; failure aborts with `AUDIT_WRITE_FAILED` and sends NO data, plus a best-effort `audit.pii_log_failed` Telegram page (never masks the abort). This is the highest-integrity fix (silent audit loss on a PII export is the worst failure mode).
- **F-020** — verify payload minimized (dropped internal `id`); the raw signed Spaces URL is GONE — replaced by an API photo-proxy route `GET /verify/:id/photo` streaming the stored JPEG. Closes durable, unauthenticated, rate-limit-bypassing direct object access + bucket-structure leak.
- **No control weakened (AC#5):** export RBAC (`authorize` in export.routes), consent gating, PDF 1000-row cap, and the public-verify rate limit are all intact. `generateCsvExport` retained (now sanitized) for its other callers.
- **Commit plan (DONE 2026-06-19):** four atomic per-F-ID commits on `track/security-r2-41-45`:
  - `6863cc0` fix(9-43,F-008) — sanitizeCell on every cell + service tests
  - `e53c735` fix(9-43,F-009) — CSV cap (100k→413) + backpressure-aware streaming + L2/L3
  - `c3eaeff` fix(9-43,F-013) — fail-closed `auditExportOrFail` (txn audit before bytes) + audit tests
  - `8e971db` fix(9-43,F-020) — verify payload minimize + photo-proxy + web `VerificationPage` + docs
  - Split method: working tree kept at the verified-final state throughout (so the pre-commit hook always type-checks real code); service F-008/F-009 split staged via byte-exact `git apply --cached` patches filtered from `git diff`; the F-009↔F-013 controller (they co-edit `exportRespondents`) split via backup + temporary F-013 revert, committing F-009 before F-013. `git diff HEAD` empty after C4 (the 4 commits reproduce the reviewed tree exactly).

> ⚠️ **KNOWN QUIRK — git-bisect at the F-009 commit (`e53c735`).** Because F-009 and F-013 rewrite the *same* function (`exportRespondents`), the controller **test** file `export.controller.test.ts` rides entirely in the F-013 commit (`c3eaeff`). So at the F-009 commit the SOURCE already streams (and was reworked for the cap) while the test still asserts the pre-9-43 buffered path + non-transactional `logPiiAccess`. Consequence: a `git bisect` (or any checkout of `e53c735`) that **runs the test suite** will see `export.controller.test.ts` failures — these are an artifact of the per-F-ID split, NOT a real regression. `tsc --noEmit` + `eslint` pass at **every** one of the four commits (the pre-commit hook gates lint+tsc, not test execution); only test-execution-at-the-intermediate-F-009-commit is affected. The tip of the four commits (and `c3eaeff` onward) is fully green: 77 export-suite + 3 VerificationPage tests, api+web tsc/lint clean. If you bisect this story's range, gate on build/tsc rather than `pnpm test`, or start bisecting from `c3eaeff`.

### File List
**Modified:**
- `apps/api/src/services/export.service.ts` (F-008 sanitizeCell/formatCell, F-009 streamCsvExport)
- `apps/api/src/services/__tests__/export.service.test.ts`
- `apps/api/src/controllers/export.controller.ts` (F-009 cap+stream, F-013 fail-closed audit)
- `apps/api/src/controllers/__tests__/export.controller.test.ts`
- `apps/api/src/controllers/user.controller.ts` (F-020 verifyStaff minimize + verifyStaffPhoto)
- `apps/api/src/routes/user.routes.ts` (F-020 photo-proxy route)
- `apps/api/src/__tests__/user.id-card.test.ts` (F-020 assertions)
- `apps/web/src/features/onboarding/pages/VerificationPage.tsx` (review M2 — build photo src from API_URL)
- `apps/web/src/features/onboarding/pages/__tests__/VerificationPage.test.tsx` (review M2 — proxy-src + null-photo tests)

### Review Fixes (AI) — File List delta
- `apps/api/src/services/export.service.ts` (M1 drain-aware streaming)
- `apps/api/src/controllers/export.controller.ts` (L2 unified→413, L3 headersSent guard)
- `apps/api/src/controllers/user.controller.ts` (L1 Cache-Control private)
