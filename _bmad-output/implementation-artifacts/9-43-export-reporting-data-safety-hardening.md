# Story 9.43: Export & Reporting Data-Safety Hardening (CSV injection, unbounded export, audit reliability, verify-endpoint minimization)

Status: ready-for-dev

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

- [ ] **Task 1 — F-008 `sanitizeCell()` on every cell (AC: #1)** _(test first)_
  - [ ] 1.1 Central helper; apply to all columns incl. dynamic full-mode answers; keep display `\t` separate or fold in.
- [ ] **Task 2 — F-009 CSV row cap + streaming (AC: #2)**
- [ ] **Task 3 — F-013 transactional/awaited PII-access audit + fail-closed + alert (AC: #3)**
- [ ] **Task 4 — F-020 minimize verify payload + proxy photo (AC: #4)**
- [ ] **Task 5 — Regression sweep + per-F-ID commit hashes (AC: #5)**

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
### Debug Log References
### Completion Notes List
### File List
