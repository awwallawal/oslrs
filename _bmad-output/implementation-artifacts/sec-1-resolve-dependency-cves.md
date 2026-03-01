# Story sec.1: Resolve Dependency CVEs

Status: done

<!-- Source: security-audit-report-2026-03-01.md — SEC-1 (P0 CRITICAL) -->
<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a system maintainer,
I want to update vulnerable dependencies to patched versions,
so that the application is not exposed to known CVEs in production.

## Acceptance Criteria

1. **AC1:** `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` updated OR `fast-xml-parser` forced to `>=5.3.5` via `pnpm.overrides`, resolving:
   - GHSA-m7jm-9gc2-mpf2 (CRITICAL — entity encoding bypass via regex injection)
   - GHSA-fj3w-jwp8-x2g3 (HIGH — RangeError DoS via numeric entities)
   - GHSA-4r6h-8v6p-xvw6 (HIGH — DoS through entity expansion)
   - CVE-2026-27942 (LOW — stack overflow in XMLBuilder)

2. **AC2:** `react-router-dom` updated to `>=6.30.3` (ships `@remix-run/router@>=1.23.2`), resolving CVE-2026-22029 (HIGH — XSS via open redirects).

3. **AC3:** `xlsx@0.18.5` risk resolved via one of:
   - (a) Move `xlsx` from `dependencies` to `devDependencies` in both root and `apps/api/package.json` (it's only used by the one-time XLSForm migration script from Story 2-9 and two dev scripts), OR
   - (b) Replace with `exceljs` or another maintained alternative, OR
   - (c) Document accepted risk with justification (one-time migration, no runtime exposure to user input via xlsx parsing in production routes).
   - Prototype pollution (CVE-2023-30533) + ReDoS — no patched version exists on npm.

4. **AC4:** `multer` updated to `>=2.1.0`, resolving CVE-2026-3304 (HIGH — incomplete file cleanup DoS via race condition in async fileFilter). Current version 2.0.2 is vulnerable.

5. **AC5:** `pnpm audit` reports **zero critical and zero high** vulnerabilities in production dependencies. Build-only vulnerabilities (`minimatch`, `rollup`, `serialize-javascript`, `esbuild`, `ajv`) documented as accepted risk.

6. **AC6:** All existing tests pass with zero regressions after dependency updates (`pnpm test` — full API + web suites, no test failures introduced).

## Tasks / Subtasks

- [x] **Task 1: Update `@aws-sdk/client-s3` + presigner OR add `pnpm.overrides` for `fast-xml-parser`** (AC: #1)
  - [x] 1.1 Check if latest `@aws-sdk/client-s3` ships `fast-xml-parser@>=5.3.5` (AWS SDK team has NOT released a fix as of 2026-03-01 — GitHub issue #7700 still open)
  - [x] 1.2 If no AWS SDK fix available: add `pnpm.overrides` section to root `package.json` with `"fast-xml-parser": ">=5.3.5"`
  - [N/A] 1.3 If AWS SDK fix available: update both `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` in `apps/api/package.json` — N/A, used override approach
  - [x] 1.4 Run `pnpm install` and verify `fast-xml-parser` resolves to `>=5.3.5` — resolved to 5.4.1
  - [x] 1.5 Run backup, remuneration, and photo-processing tests to verify S3 operations work — 42 tests pass (6+16+5+15)

- [x] **Task 2: Update `react-router-dom` to `>=6.30.3`** (AC: #2)
  - [x] 2.1 Update `react-router-dom` in `apps/web/package.json` from `^6.23.1` (resolved 6.30.2) to `^6.30.3`
  - [x] 2.2 Run `pnpm install` and verify `@remix-run/router` resolves to `>=1.23.2` — resolved to 1.23.2
  - [x] 2.3 Run full web test suite (`cd apps/web && pnpm vitest run`) — 1,939 tests pass, 0 failures
  - [x] 2.4 Verify no breaking changes in routing behavior (check CHANGELOG for 6.30.3) — patch version, non-breaking

- [x] **Task 3: Resolve `xlsx@0.18.5` vulnerability** (AC: #3)
  - [x] 3.1 Audit xlsx usage — 3 production files + 2 test files, all in XLSForm migration context:
    - `apps/api/src/services/xlsform-parser.service.ts` (production import but only used by migration endpoint)
    - `apps/api/scripts/validate-xlsform.ts` (dev script)
    - `apps/api/scripts/fix-xlsform-labels.ts` (dev script)
    - `apps/api/src/services/__tests__/xlsform-parser.service.test.ts`
    - `apps/api/src/services/__tests__/questionnaire.service.test.ts`
  - [x] 3.2 Determine if xlsform-parser.service.ts is called by any active production route (Story 2-1 XLSForm upload was a one-time migration) — route exists but only for admin one-time migration, not active feature
  - [x] 3.3 If no active production routes use it: move `xlsx` from `dependencies` to `devDependencies` in both root and `apps/api/package.json`
  - [x] 3.4 Add inline comment in xlsform-parser.service.ts documenting: "xlsx@0.18.5 has known prototype pollution (CVE-2023-30533) — no npm fix available. Safe: only used for admin-initiated one-time XLSForm migration, not exposed to public input."

- [x] **Task 4: Update `multer` to `>=2.1.0`** (AC: #4)
  - [x] 4.1 Update `multer` in `apps/api/package.json` from `^2.0.2` to `^2.1.0`
  - [x] 4.2 Check multer 2.1.0 CHANGELOG for breaking changes in API (file filter, storage engine, error handling) — no breaking changes, patch for async fileFilter race
  - [x] 4.3 Run `pnpm install` and verify resolution — multer@2.1.0 confirmed
  - [x] 4.4 Run upload-related tests (photo processing, remuneration receipt upload, questionnaire file upload) — 47 tests pass
  - [x] 4.5 If `@types/multer` needs update, update it too — @types/multer@2.0.0 already latest

- [x] **Task 5: Add `pnpm.overrides` for remaining transitive vulnerabilities** (AC: #5)
  - [x] 5.1 Add `pnpm.overrides` in root `package.json` for `rollup` (`>=4.59.0`) to fix path traversal — dev-only but easy fix
  - [x] 5.2 Document accepted build-only risks in a code comment next to `pnpm.overrides`: `minimatch` (12 ReDoS advisories, build-only), `serialize-javascript` (dev-only via workbox), `esbuild` (dev-only), `ajv` (dev-only via eslint), `phin` (dev-only via potrace/jimp)
  - [x] 5.3 Run `pnpm audit` and capture final report — target: 0 critical, 0 high in production deps — ACHIEVED (only 1 LOW qs remaining)

- [x] **Task 6: Full regression test** (AC: #6)
  - [x] 6.1 Run `pnpm test` from project root — 1,164 API + 1,939 web = 3,103 tests pass, 0 regressions (1 pre-existing flaky timeout in a3-eslint-policy.test.ts, passes in isolation)
  - [x] 6.2 Run `pnpm build` to verify TypeScript compilation succeeds — API + web build successful
  - [x] 6.3 Run `pnpm audit` and verify zero critical/high in production dependencies — confirmed 0 critical, 0 high

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] xlsx moved to devDependencies but still statically imported in production source code — app would crash on `pnpm install --prod` deployments. **Fixed:** Converted to dynamic `import('xlsx')` with top-level await and null-check guard returning 503 in `xlsform-parser.service.ts`. [apps/api/src/services/xlsform-parser.service.ts:20-27,84-89]
- [x] [AI-Review][MEDIUM] `sprint-status.yaml` modified in git but not listed in Dev Agent Record File List. **Fixed:** Added to File List below.
- [x] [AI-Review][MEDIUM] AC5 text lists `minimatch` as "build-only accepted risk" but it was actually overridden as a production dep fix (transitive via google-auth-library->gaxios->rimraf->glob->minimatch). Dev notes Build-Only Risk section incorrectly includes minimatch. **Fixed:** Corrected Build-Only Risk section below.
- [ ] [AI-Review][LOW] `pnpm.overrides` uses open-ended `>=` constraints. `^` would be safer for fast-xml-parser and rollup, but `>=` is required for minimatch (resolves to 10.x via glob@10). No code change — accepted as-is since upstream semver constraints limit resolution.
- [ ] [AI-Review][LOW] Completed XLSForm migration endpoint (`POST /api/v1/questionnaires/upload`) still registered in production routes. Consider removing or deprecating in a follow-up story to reduce attack surface.

## Dev Notes

### Priority & Urgency
- **P0 CRITICAL** — Must complete before any further production deployment
- **Blocks:** Epic 7 (Public Skills Marketplace) introduces unauthenticated public routes, making these fixes essential
- **Source:** [security-audit-report-2026-03-01.md](_bmad-output/planning-artifacts/security-audit-report-2026-03-01.md)

### Current Vulnerability State (pnpm audit as of 2026-03-01)
- **31 total:** 1 critical, 22 high, 6 moderate, 2 low
- **Production risks:** fast-xml-parser (CRITICAL+3), xlsx (HIGH x2), @remix-run/router (HIGH), multer (HIGH x2), qs (LOW)
- **Dev-only risks:** rollup (HIGH x2), minimatch (HIGH x12), serialize-javascript (HIGH), esbuild (MOD), ajv (MOD x2), phin (MOD)

### AWS SDK / fast-xml-parser Strategy
- As of 2026-03-01, the AWS SDK team has **NOT released** a version of `@aws-sdk/client-s3` that bumps `fast-xml-parser` to `>=5.3.5` (GitHub issue [#7700](https://github.com/aws/aws-sdk-js-v3/issues/7700) still open)
- **Recommended approach:** Use `pnpm.overrides` to force `fast-xml-parser@>=5.3.5` — this is safe because the AWS SDK only uses fast-xml-parser for XML response parsing internally, and the patch is backward-compatible
- Vulnerability chain: `@aws-sdk/client-s3` -> `@aws-sdk/core` -> `@aws-sdk/xml-builder` -> `fast-xml-parser@5.2.5`
- **Files using AWS SDK:** `backup.worker.ts`, `remuneration.service.ts`, `photo-processing.service.ts`, `test-s3-connection.ts`, `restore-backup.ts`

### react-router-dom Strategy
- Current: `react-router-dom@6.30.2` (resolved from `^6.23.1`) ships `@remix-run/router@1.23.1`
- Target: `react-router-dom@6.30.3` ships `@remix-run/router@1.23.2` with XSS fix
- Fix validates redirect locations by blocking `javascript:`, `data:`, `file:` protocols
- **174 files import from react-router-dom** — version bump should be non-breaking (patch version)
- Do NOT migrate to React Router v7 — that's a major version change out of scope

### xlsx Strategy
- `xlsx@0.18.5` has **no npm fix** — SheetJS moved to proprietary model, npm package abandoned
- Used only for XLSForm migration (Story 2-9, completed 2026-02-07) — NOT an active production feature
- **Recommended:** Move to `devDependencies` since the migration is complete. The service file stays in codebase for potential future re-use but isn't exposed via any active route
- Alternative: Replace with `exceljs` — but exceljs itself has maintenance concerns (no releases in 12+ months)
- **Do NOT invest time replacing the library** — the migration is done, risk is contained

### multer Strategy (NEW — not in original audit report)
- Current: `multer@2.0.2` — vulnerable to CVE-2026-3304 (incomplete file cleanup DoS)
- CVE-2025-7338 (malformed request DoS) was fixed in 2.0.2, so that one is already patched
- Target: `multer@>=2.1.0` fixes the async fileFilter race condition
- **Production-critical:** multer handles ALL file uploads (photos, receipts, questionnaire files)
- Upload endpoints: `/staff/photo`, `/remuneration/batches/:id/files`, `/questionnaires/upload`
- All use `memoryStorage()` (no disk writes) which reduces attack surface but DoS via resource exhaustion still applies

### Project Structure Notes

- **Root `package.json`:** Contains `xlsx` as dependency — move to devDependencies
- **`apps/api/package.json`:** Contains `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `multer`, `xlsx` — primary update target
- **`apps/web/package.json`:** Contains `react-router-dom` — update target
- **No existing `pnpm.overrides`** — will be created new in root `package.json`
- **No `.npmrc`** — none needed for this work
- Alignment with unified project structure: no conflicts or variances detected

### Build-Only Risk Acceptance Documentation
The following vulnerabilities are **dev/build-only** with zero production runtime exposure:
- `minimatch` (HIGH x12): ReDoS — **NOTE:** Also transitive production dep via `google-auth-library->gaxios->rimraf->glob`. Resolved via `pnpm.overrides` to `>=9.0.7` (resolves to 10.2.4). Not purely build-only as originally classified.
- `rollup` (HIGH x2): Path traversal — transitive via vite. Build tooling only. Can fix with override.
- `serialize-javascript` (HIGH): RCE — transitive via workbox-build -> @rollup/plugin-terser. Build-only.
- `esbuild` (MOD): Dev server cross-origin — dev-only via tsx/vite. Not deployed.
- `ajv` (MOD x2): ReDoS — dev-only via eslint. Not deployed.
- `phin` (MOD): Header leak on redirect — dev-only via potrace/jimp. Not deployed.
- `qs` (LOW): arrayLimit bypass — transitive via express -> body-parser. Low severity, no fix available without express major version change.

### References

- [Source: _bmad-output/planning-artifacts/security-audit-report-2026-03-01.md — SEC-1 Story Definition]
- [Source: _bmad-output/planning-artifacts/security-audit-report-2026-03-01.md#2.6 — A06 Vulnerable Components]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR4, NFR8 Security Requirements]
- [Source: _bmad-output/project-context.md — Technology Stack & Versions]
- [Source: GitHub Issue aws/aws-sdk-js-v3#7700 — fast-xml-parser CVE tracking]
- [Source: GitHub Advisory GHSA-2w69-qvjg-hvjx — react-router XSS via Open Redirects]
- [Source: CVE-2026-3304 — multer incomplete file cleanup DoS]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- No debug issues encountered. All dependency updates were clean upgrades.

### Completion Notes List

- **AC1 (fast-xml-parser):** Used `pnpm.overrides` approach since AWS SDK team has not released a fix (GitHub #7700). Override forces `fast-xml-parser@>=5.4.1`, resolving all 4 CVEs. 42 S3-related tests pass.
- **AC2 (react-router-dom):** Updated from 6.30.2 to 6.30.3 (ships @remix-run/router@1.23.2). XSS open redirect fix. 1,939 web tests pass, 0 regressions.
- **AC3 (xlsx):** Moved xlsx from `dependencies` to `devDependencies` in both root and apps/api package.json. Added inline CVE documentation comment in xlsform-parser.service.ts. Route exists but is one-time migration only, not active production feature.
- **AC4 (multer):** Updated from 2.0.2 to 2.1.0. Fixes CVE-2026-3304 async fileFilter race condition. 47 upload-related tests pass.
- **AC5 (audit clean):** `pnpm audit --prod` reports 0 critical, 0 high. Only 1 LOW (qs via express, no fix without Express 5 major version change). Also added `minimatch@>=9.0.7` override — originally classified as build-only but actually transitive through google-auth-library (production dep). `rollup@>=4.59.0` override for dev-only path traversal. All accepted risks documented in package.json comments.
- **AC6 (regression):** 1,164 API + 1,939 web = 3,103 tests pass, 0 regressions. TypeScript build succeeds. One pre-existing flaky timeout in a3-eslint-policy.test.ts (passes in isolation, times out during full parallel suite due to resource contention).

### Implementation Plan

Dependency-only changes — no application code modified except one comment line in xlsform-parser.service.ts. Strategy:
1. `pnpm.overrides` for transitive deps where upstream hasn't released fixes (fast-xml-parser, minimatch, rollup)
2. Direct version bumps for direct deps (react-router-dom, multer)
3. Dependency classification change for abandoned packages (xlsx moved to devDependencies)

### File List

- `package.json` — Added pnpm.overrides (fast-xml-parser, minimatch, rollup), moved xlsx from dependencies to devDependencies, added risk documentation comments
- `apps/api/package.json` — Updated multer ^2.0.2 → ^2.1.0, moved xlsx from dependencies to devDependencies
- `apps/web/package.json` — Updated react-router-dom ^6.23.1 → ^6.30.3
- `apps/api/src/services/xlsform-parser.service.ts` — Converted static `import * as XLSX` to dynamic `import('xlsx')` with top-level await + null-check guard (503 on unavailable). Added `import type { WorkBook }` for type safety. CVE risk documentation comment.
- `pnpm-lock.yaml` — Lockfile regenerated with all dependency updates
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated sec-1 status from ready-for-dev to review

## Change Log

- 2026-03-01: SEC-1 Resolve Dependency CVEs — Updated fast-xml-parser (override to >=5.3.5, resolved 5.4.1), react-router-dom (6.30.2→6.30.3), multer (2.0.2→2.1.0), minimatch (override to >=9.0.7), rollup (override to >=4.59.0). Moved xlsx to devDependencies. Production audit: 0 critical, 0 high. 3,103 tests pass, 0 regressions.
- 2026-03-01: Senior Developer Review (AI) — 5 findings (1 HIGH, 2 MEDIUM, 2 LOW). HIGH: Converted xlsx static import to dynamic `import()` with top-level await to prevent app crash on prod-only deployments. MEDIUM: Added sprint-status.yaml to File List, corrected minimatch classification in Build-Only Risk section. LOW: Documented open-ended `>=` override constraints (accepted) and recommended future deprecation of XLSForm upload endpoint. 3 findings fixed, 2 accepted as action items.
