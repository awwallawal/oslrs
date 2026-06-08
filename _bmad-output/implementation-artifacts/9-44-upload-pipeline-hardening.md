# Story 9.44: Upload Pipeline Hardening (header reflection, MIME trust, magic-byte sniffing)

Status: ready-for-dev

<!--
Authored 2026-06-07 by Bob (SM) via canonical *create-story --yolo workflow.
Source: sprint-change-proposal-2026-06-06-security-r2-remediation.md §4.1 + REMEDIATION-BRIEF.md.
LAUNCH-GATE story (Phase 2 🚦). One atomic commit PER F-ID + fail-old/pass-new test.
Findings: F-016 + F-017 (upload header reflection & client-MIME trust). Class-fix, not
just instance: selfies already go through `sharp`; the receipt/evidence path does not.
-->

## Story

As **the OSLSR custodian of file uploads (receipts, XLSForms, evidence)**,
I want **response headers derived from a server-side allowlist, filenames sanitized, and file type validated by extension AND magic bytes — never by client-supplied MIME**,
so that **a spoofed MIME or a crafted filename can't reflect attacker-controlled content into response headers or smuggle a disallowed file type through the pipeline**.

## Acceptance Criteria

1. **AC#1 — F-016: stop reflecting stored client MIME + raw filename into response headers.** `remuneration.controller.ts:287-288` and `questionnaire.controller.ts:185-186` reflect stored client MIME + raw filename into response headers. Derive `Content-Type` from a **server-side allowlist** and set `Content-Disposition` with a sanitized filename (`[A-Za-z0-9._-]`) using `filename*=UTF-8''<encoded>` [Source: apps/api/src/controllers/remuneration.controller.ts:287; apps/api/src/controllers/questionnaire.controller.ts:185]. **Test:** upload with a spoofed MIME / a `"`-containing filename → response headers are safe/normalized.
2. **AC#2 — F-017: validate by extension AND mime; add magic-byte sniffing.** `user.routes.ts` / `remuneration.routes.ts` fileFilters trust client `file.mimetype`; `upload.middleware.ts:20-28` uses extension **OR** mime [Source: apps/api/src/middleware/upload.middleware.ts:20-28]. Change the XLSForm filter to require extension **AND** mime, and add **magic-byte sniffing** to the receipt/evidence path (selfies already go through `sharp`, which validates). **Test:** a file whose extension/mime claims an allowed type but whose magic bytes disagree is rejected.
3. **AC#3 — Class-fix confirmation.** Enumerate every upload entry point (selfie, receipt, evidence, XLSForm) and confirm each derives type server-side and sniffs magic bytes (or is covered by `sharp`). List the matrix in Dev Notes.
4. **AC#4 — Tests + zero regression; no control weakened.** Full API + web suites green; existing upload size limits, auth, and storage paths intact. Per-F-ID commit hashes recorded.

## Tasks / Subtasks

- [ ] **Task 1 — F-016 server-side Content-Type + sanitized Content-Disposition (AC: #1)** _(test first)_
- [ ] **Task 2 — F-017 extension-AND-mime filter + magic-byte sniffing on receipt/evidence (AC: #2)**
- [ ] **Task 3 — Upload entry-point matrix / class-fix confirmation (AC: #3)**
- [ ] **Task 4 — Regression sweep + per-F-ID commit hashes (AC: #4)**

## Dev Notes
- **One atomic commit per F-ID.** Prefer a small shared `magic-byte` util reused across receipt/evidence; selfies stay on `sharp`.
- Sanitized filename + `filename*=UTF-8''` is the canonical safe Content-Disposition; never echo the raw client filename.
- Testing: craft fixtures where mime/extension and magic bytes disagree.

### Project Structure Notes
- Touch: `controllers/remuneration.controller.ts`, `controllers/questionnaire.controller.ts`, `middleware/upload.middleware.ts`, `routes/user.routes.ts`, `routes/remuneration.routes.ts`, a shared magic-byte helper.

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-security-r2-remediation.md#section-4-detailed-change-proposals]
- [Source: security-assessment/REMEDIATION-BRIEF.md] (F-016/017)
- [Source: apps/api/src/middleware/upload.middleware.ts:20]

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
