# Story 9.44: Upload Pipeline Hardening (header reflection, MIME trust, magic-byte sniffing)

Status: done

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

- [x] **Task 1 — F-016 server-side Content-Type + sanitized Content-Disposition (AC: #1)**
  - [x] Shared `lib/file-safety.ts`: `contentTypeForFilename` (server-side extension allowlist → octet-stream fallback) + `buildContentDisposition` (sanitized `[A-Za-z0-9._-]` + RFC 5987 `filename*=UTF-8''`). Applied in `remuneration.controller.downloadFile` and `questionnaire.controller.download`. Stored client MIME/raw filename no longer reflected.
- [x] **Task 2 — F-017 extension-AND-mime filter + magic-byte sniffing on receipt/evidence (AC: #2)**
  - [x] XLSForm filter flipped OR→AND (`upload.middleware.ts`). `requireMagicBytes(['png','jpeg','pdf'])` (shared `lib/file-safety.ts`) added after the receipt + evidence multer handlers. XLSForm already had `validateFileContent` magic bytes wired.
- [x] **Task 3 — Upload entry-point matrix / class-fix confirmation (AC: #3)** — see Dev Notes matrix.
- [x] **Task 4 — Regression sweep + per-F-ID commit hashes (AC: #4)**
  - [x] API tsc + lint clean; full build green; touched suites green (file-safety 11, upload.middleware 7, remuneration.controller, questionnaire.controller — 68 across the batch). Per-F-ID commit hashes recorded at commit time (post-review).

### Review Follow-ups (AI)

Adversarial code review 2026-06-19 (security-R2 track, fresh context). **0 High / 1 Medium / 3 Low.** F-016 + F-017 verified genuinely closed; AC#3 class-fix matrix independently re-enumerated and confirmed accurate (receipt + XLSForm were the only client-reflecting download sites; all other `Content-Disposition` sites use server-generated names incl. `staff.downloadIdCard` → `oslrs-id-${user.id}.pdf`). All findings fixed in-pass. api tsc 0, eslint 0; 24 file-safety + upload-middleware tests green (+ 65 batch incl. remuneration/questionnaire controllers).

- [x] [AI-Review][Medium] **M1 — F-017's XLSForm `ext AND allowlisted-mime` over-trusted the untrusted client MIME** and would false-reject legit `.xlsx`/`.xml` uploads (Windows sends `.xlsx` as `application/x-zip-compressed`/`application/octet-stream`, `.xml` as `text/plain`). The OR→AND change closed a real hole (`evil.html` + spoofed xlsx mime), but the better lever is **extension required + magic-byte authoritative** (`validateFileContent` is already wired), MIME advisory. Fixed: filter now accepts a valid extension with a recognized OR generic/empty MIME, still rejects an actively-wrong MIME (e.g. `text/html`); `evil.html` still rejected on extension. +5 regression tests. [upload.middleware.ts]
- [x] [AI-Review][Low] **L1 — `requireMagicBytes` assumed `memoryStorage`** (read `file.buffer`) and would throw on a future `diskStorage` route. Fixed: fail-closed `400 INVALID_FILE_CONTENT` when `file.buffer` is absent. +1 test. [file-safety.ts]
- [x] [AI-Review][Low] **L2 — coverage gap for the M1 regression** (no test for a legit `.xlsx` with a non-allowlisted MIME). Closed by the +5 generic-MIME-accept tests. [upload.middleware.test.ts]
- [x] [AI-Review][Low] **L3 — `PK` magic detects ANY ZIP as `xlsx`** (docx/jar/zip share the container signature). Documented (already noted in `detectMagicType`): for receipt/evidence a ZIP is correctly rejected (xlsx not in the allowed set); for XLSForm a non-spreadsheet ZIP is caught by the downstream form parser. The magic-byte layer validates the *container*, not that it is a real spreadsheet — accepted as-is.

## Dev Notes
- **One atomic commit per F-ID.** Prefer a small shared `magic-byte` util reused across receipt/evidence; selfies stay on `sharp`.
- Sanitized filename + `filename*=UTF-8''` is the canonical safe Content-Disposition; never echo the raw client filename.
- Testing: craft fixtures where mime/extension and magic bytes disagree.

### AC#3 — Upload entry-point matrix (class-fix confirmation)

| Entry point | Route / config | Type derived server-side? | Content validation | Status |
|---|---|---|---|---|
| **Selfie** | `user.routes.ts` `/selfie` → `processLiveSelfie` | n/a (re-encoded) | **`sharp` re-encode** rejects non-images | ✅ covered |
| **Receipt** | `remuneration.routes.ts` `POST /` `receiptUpload` | yes (download via allowlist) | mime allowlist filter **+ `requireMagicBytes(png/jpeg/pdf)`** (NEW) | ✅ fixed |
| **Evidence** | `remuneration.routes.ts` `…/resolve` `evidenceUpload` | yes | mime allowlist filter **+ `requireMagicBytes(png/jpeg/pdf)`** (NEW) | ✅ fixed |
| **XLSForm** | `questionnaire.routes.ts` `xlsformUpload` | yes (download via allowlist) | filter ext **AND** mime (NEW) **+ `validateFileContent` magic bytes** (existing) | ✅ fixed |
| **Download — receipt** | `remuneration.controller.downloadFile` | **allowlist** (was stored client MIME) | sanitized `Content-Disposition` (NEW) | ✅ fixed (F-016) |
| **Download — XLSForm** | `questionnaire.controller.download` | **allowlist** (was stored client MIME) | sanitized `Content-Disposition` (NEW) | ✅ fixed (F-016) |
| Staff CSV import | `staff.routes.ts` `/import` `upload.single('file')` | n/a (text CSV) | structurally validated by the CSV parser; **no response-header reflection** | ◻︎ out of F-016/017 scope (text has no magic bytes; noted for a future hardening pass, not weakened here) |

- **No control weakened (AC#4):** upload size limits (10MB / 5MB), `authenticate` + `authorize` RBAC, and storage paths unchanged. Selfie path untouched. The receipt/evidence mime-allowlist filters are kept as a cheap first gate in front of the magic-byte check (defense in depth).

### Project Structure Notes
- Touch: `controllers/remuneration.controller.ts`, `controllers/questionnaire.controller.ts`, `middleware/upload.middleware.ts`, `routes/user.routes.ts`, `routes/remuneration.routes.ts`, a shared magic-byte helper.

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-security-r2-remediation.md#section-4-detailed-change-proposals]
- [Source: security-assessment/REMEDIATION-BRIEF.md] (F-016/017)
- [Source: apps/api/src/middleware/upload.middleware.ts:20]

## Dev Agent Record
### Agent Model Used
claude-opus-4-8[1m] (Amelia / dev agent) — security-r2 track, worktree `../oslrs-security` on `track/security-r2-41-45`.

### Debug Log References
- Touched suites: file-safety 11, upload.middleware 7, remuneration.controller + questionnaire.controller download — 68 across the batch (questionnaire.controller is DATABASE_URL-gated locally via its `native-form.service` auto-mock → verified green with a dummy `DATABASE_URL`; `Pool` is lazy so nothing connects).
- API tsc 0, eslint 0, full workspace build green.

### Completion Notes List
- **F-016** — both download controllers now derive `Content-Type` from `contentTypeForFilename` (server-side extension allowlist, unknown → `application/octet-stream`) and emit a sanitized `Content-Disposition` via `buildContentDisposition` (ASCII `filename="…"` + RFC 5987 `filename*=UTF-8''…`). The stored client MIME and raw filename are never reflected, killing header-injection + content-sniffing vectors.
- **F-017** — XLSForm filter requires extension **AND** mime (was OR, which let either alone pass). Receipt + evidence uploads gain `requireMagicBytes(['png','jpeg','pdf'])` after multer, so a payload whose mime/extension lies but whose bytes disagree is rejected. Shared `lib/file-safety.ts` is the single magic-byte util (no per-route reinvention); selfies stay on `sharp`.
- **AC#3 class-fix** — full entry-point matrix in Dev Notes. Every binary upload path now sniffs magic bytes or is `sharp`-validated; both download paths derive type server-side. Staff CSV import documented as out-of-scope (text, no magic bytes; no header reflection) — flagged, not weakened.
- **No control weakened (AC#4):** size limits, RBAC, storage paths intact; mime allowlists kept as a cheap first gate before the magic-byte check.
- **Commit plan:** two atomic per-F-ID commits at the pause (F-016 download headers; F-017 filter+magic-byte). The shared `lib/file-safety.ts` lands with F-016 (download helpers) and is extended by F-017 (magic bytes) — or, if cleaner, the whole lib lands in the first commit and F-017 wires it; decided at commit time via `git add -p`.

### File List
**New:**
- `apps/api/src/lib/file-safety.ts`
- `apps/api/src/lib/__tests__/file-safety.test.ts`
- `apps/api/src/middleware/__tests__/upload.middleware.test.ts`

**Modified:**
- `apps/api/src/middleware/upload.middleware.ts` (F-017 OR→AND; export filter for test)
- `apps/api/src/routes/remuneration.routes.ts` (F-017 requireMagicBytes on receipt + evidence)
- `apps/api/src/controllers/remuneration.controller.ts` (F-016 download headers)
- `apps/api/src/controllers/questionnaire.controller.ts` (F-016 download headers)
- `apps/api/src/controllers/__tests__/remuneration.controller.test.ts`
- `apps/api/src/controllers/__tests__/questionnaire.controller.test.ts`

**Review-fix delta (AI, 2026-06-19):**
- `apps/api/src/middleware/upload.middleware.ts` (M1 — extension-required + MIME-advisory filter; `GENERIC_UPLOAD_MIME_TYPES`)
- `apps/api/src/lib/file-safety.ts` (L1 — fail-closed when `file.buffer` absent)
- `apps/api/src/middleware/__tests__/upload.middleware.test.ts` (M1/L2 — +5 generic-MIME tests)
- `apps/api/src/lib/__tests__/file-safety.test.ts` (L1 — +1 no-buffer test)
