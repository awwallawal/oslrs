# Story sec.4: Dependency Pinning & Audit CI Gate

Status: done

<!-- Source: security-audit-report-2026-03-01.md — SEC-4 (P3 LOW) -->
<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a DevOps engineer,
I want to pin critical dependency versions and add `pnpm audit` to the CI pipeline,
so that new vulnerabilities are caught before merge and dependency drift is controlled.

## Acceptance Criteria

1. **AC1:** A `pnpm audit --audit-level=high` step is added to the GitHub Actions CI workflow (`.github/workflows/ci-cd.yml`). The step runs after `pnpm install` and **fails the build** if any high or critical vulnerability is found in production dependencies. Build-only/dev-only vulnerabilities do not block.

2. **AC2:** Root `package.json` has a `pnpm.overrides` section that force-resolves known-vulnerable transitive dependencies where a direct update isn't possible. (Note: SEC-1 may have already created this section — extend it if so.)

3. **AC3:** Accepted build-only risks are documented in `project-context.md` under a new "Accepted Dependency Risks" section with justification (no runtime exposure): `minimatch`, `rollup`, `serialize-javascript`, `esbuild`, `ajv`, `phin`.

4. **AC4:** Security-critical packages use exact versions (no `^` or `~`) in their respective `package.json` files:
   - `apps/api/package.json`: `bcrypt` (via utils), `jsonwebtoken`, `helmet`, `express`, `drizzle-orm`, `multer`, `cors`, `cookie-parser`
   - `packages/utils/package.json`: `bcrypt`
   - Root `package.json`: `drizzle-orm`

5. **AC5:** An `.npmrc` file is created at the project root with security-hardening settings.

6. **AC6:** The `project-context.md` bcrypt version reference is corrected from `5.x` to `6.x` to match the actual installed version.

7. **AC7:** All existing tests pass with zero regressions. The new CI audit step passes. **Prerequisite:** SEC-1 must land first — `fast-xml-parser`, `multer`, and `react-router-dom` are production deps whose CVEs would fail the `--prod` audit regardless of flag usage.

## Tasks / Subtasks

- [x] **Task 1: Add `pnpm audit` step to CI pipeline** (AC: #1)
  - [x] 1.1 Open `.github/workflows/ci-cd.yml`
  - [x] 1.2 Add a new step in the `lint-and-build` job, AFTER `pnpm install` (line ~52) and BEFORE `pnpm lint`:
    ```yaml
    - name: Security audit (production dependencies)
      run: pnpm audit --audit-level=high --prod
    ```
  - [x] 1.3 The `--prod` flag ensures only production dependencies are audited — build/dev-only vulnerabilities (`minimatch`, `rollup`, `esbuild`, `ajv`) won't block the pipeline
  - [x] 1.4 Verify the step fails when a high/critical vuln exists and passes when clean
  - [x] 1.5 If `pnpm audit --prod` is not supported in the project's pnpm version, use `pnpm audit --audit-level=high` with `continue-on-error: false` and document accepted dev-only risks

- [x] **Task 2: Create or extend `pnpm.overrides` in root `package.json`** (AC: #2)
  - [x] 2.1 Check if SEC-1 already created a `pnpm.overrides` section (it should have added `fast-xml-parser` and possibly `rollup` overrides)
  - [x] 2.2 If it exists: verify and extend as needed
  - [x] 2.3 If it doesn't exist: create the section:
    ```json
    "pnpm": {
      "overrides": {
        "fast-xml-parser": ">=5.3.5",
        "rollup": ">=4.59.0"
      }
    }
    ```
  - [x] 2.4 Run `pnpm install` to apply overrides and verify resolution
  - [x] 2.5 Run `pnpm audit` to confirm the overrides resolved the targeted CVEs

- [x] **Task 3: Pin security-critical dependencies to exact versions** (AC: #4)
  - [x] 3.1 In `apps/api/package.json`, remove `^` prefix from these dependencies:
    | Package | Current | Pin To |
    |---------|---------|--------|
    | `express` | `^4.19.2` | Check current lockfile resolution → pin that exact version |
    | `jsonwebtoken` | `^9.0.3` | Pin to resolved version |
    | `helmet` | `^7.1.0` | Pin to resolved version |
    | `drizzle-orm` | `^0.30.10` | Pin to resolved version |
    | `multer` | `^2.0.2` (or `^2.1.0` if SEC-1 updated it) | Pin to resolved version |
    | `cors` | `^2.8.5` | Pin to resolved version |
    | `cookie-parser` | `^1.4.7` | Pin to resolved version |
  - [x] 3.2 In `packages/utils/package.json`, remove `^` from `bcrypt`:
    | Package | Current | Pin To |
    |---------|---------|--------|
    | `bcrypt` | `^6.0.0` | Pin to resolved version |
  - [x] 3.3 In root `package.json`, remove `^` from `drizzle-orm`:
    | Package | Current | Pin To |
    |---------|---------|--------|
    | `drizzle-orm` | `^0.30.10` | Pin to resolved version |
  - [x] 3.4 To find exact resolved versions, run: `pnpm list <package> --depth=0` for each package
  - [x] 3.5 Run `pnpm install` and verify lockfile is consistent
  - [x] 3.6 Do NOT pin non-security packages (TanStack Query, Recharts, etc.) — only security-critical ones

- [x] **Task 4: Create `.npmrc` with security settings** (AC: #5)
  - [x] 4.1 Create `.npmrc` at project root with:
    ```ini
    # Security hardening
    audit-level=high
    engine-strict=true
    ```
  - [x] 4.2 Do NOT add `ignore-scripts=true` — bcrypt and sharp require native compilation scripts
  - [x] 4.3 Do NOT add `strict-peer-dependencies=true` — many packages have loose peer dep specs that would break install
  - [x] 4.4 Verify `pnpm install` still works correctly with the new `.npmrc`

- [x] **Task 5: Document accepted risks in project-context.md** (AC: #3, #6)
  - [x] 5.1 Add a new section "### Accepted Dependency Risks" under the Technology Stack section
  - [x] 5.2 Document each accepted build-only vulnerability with justification:
    ```markdown
    ### Accepted Dependency Risks (Build-Only, No Runtime Exposure)
    - `minimatch` (HIGH x12 — ReDoS): Transitive via eslint, drizzle-kit, workbox-build. Build tooling only, never runs in production.
    - `rollup` (HIGH x2 — path traversal): Transitive via vite. Build tooling only. Mitigated by pnpm.overrides where possible.
    - `serialize-javascript` (HIGH — RCE): Transitive via workbox-build → @rollup/plugin-terser. Build-only.
    - `esbuild` (MODERATE — dev server cross-origin): Dev-only via tsx/vite. Not deployed to production.
    - `ajv` (MODERATE x2 — ReDoS): Dev-only via eslint → @eslint/eslintrc. Not deployed.
    - `phin` (MODERATE — header leak on redirect): Dev-only via potrace → jimp. Not deployed.
    - `qs` (LOW — arrayLimit bypass): Transitive via express → body-parser. Low severity, no fix without express major version change.
    ```
  - [x] 5.3 Fix the bcrypt version discrepancy: change `bcrypt 5.x` reference to `bcrypt 6.x` to match `packages/utils/package.json`
  - [x] 5.4 Add a review cadence note: "Pinned security-critical deps should be reviewed quarterly for available patches. The CI `pnpm audit` gate catches known CVEs automatically, but non-CVE security improvements require manual review."

- [x] **Task 6: Full regression test** (AC: #7)
  - [x] 6.1 Run `pnpm install` to verify lockfile consistency after all changes
  - [x] 6.2 Run `pnpm test` from project root — all tests must pass
  - [x] 6.3 Run `pnpm build` to verify TypeScript compilation succeeds
  - [x] 6.4 Run `pnpm audit --audit-level=high --prod` and verify it passes (zero high/critical in production deps)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] `qs` misclassified as "Build-Only" in project-context.md — it's a production dep via express->body-parser. Split section into "Build-Only" and "Production (Accepted)" subsections. [_bmad-output/project-context.md:68-80]
- [x] [AI-Review][MEDIUM] `pnpm-lock.yaml` modified but not documented in Dev Agent Record File List. Added entry. [sec-4 story File List]
- [x] [AI-Review][MEDIUM] `sprint-status.yaml` modified but not documented in Dev Agent Record File List. Added entry. [sec-4 story File List]
- [x] [AI-Review][MEDIUM] `.npmrc` missing `save-exact=true` — future `pnpm add` commands would default to `^version`, undermining pinning discipline. Added setting. [.npmrc]
- [x] [AI-Review][LOW] Express version bump from specifier `^4.19.2` to pinned `4.22.1` (and helmet `^7.1.0` to `7.2.0`) not explicitly noted in completion notes. Documented. [sec-4 story completion notes]
- [x] [AI-Review][LOW] `express-rate-limit` (`^8.2.1`) is security-adjacent (brute-force prevention) but not in AC4's pin list. Design gap noted — not a missed implementation. [sec-4 story Dev Notes]

## Dev Notes

### Priority & Context
- **P3 LOW** — Process improvement, preventive measure
- **Depends on:** SEC-1 (dependency CVE fixes must land first for the audit step to pass — otherwise the CI audit step would immediately fail on the existing CVEs)
- **Source:** [security-audit-report-2026-03-01.md](_bmad-output/planning-artifacts/security-audit-report-2026-03-01.md) Story SEC-4

### Current CI/CD Pipeline State
- **Two workflow files:** `.github/workflows/ci-cd.yml` (main) and `.github/workflows/e2e.yml`
- **7 jobs in main pipeline:** lint-and-build → test-unit + test-api + test-web → dashboard → lighthouse → deploy
- **ZERO security scanning** — no `pnpm audit`, no Snyk, no Dependabot, no CodeQL, no SAST/DAST
- **No `.npmrc`** — no package manager security settings
- **No `pnpm.overrides`** — no transitive dependency patching (SEC-1 should create this)
- **E2E tests are non-blocking** (`continue-on-error: true`) — do NOT change this (separate concern)

### Current Pinning State
- **~80 total dependencies** across all package.json files
- **Only 7 are exact-pinned:** `react@18.3.1`, `react-dom@18.3.1`, `leaflet@1.9.4`, `react-leaflet@4.2.1`, `@types/react@18.3.1`, `@types/react-dom@18.3.1`, `workbox-window@7.4.0`
- **ALL security-critical packages use `^` ranges** — `bcrypt`, `jsonwebtoken`, `helmet`, `express`, `drizzle-orm`, `multer`, `cors`, `cookie-parser`, `@aws-sdk/*`, `sharp`, `socket.io`
- project-context.md line 28 says "CRITICAL: Lock to these exact versions" but this is NOT enforced

### Which Packages to Pin (and Why)
Pin only **security-critical** packages where an unreviewed minor/patch bump could introduce vulnerabilities or break security behavior:

| Package | Why Pin | Location |
|---------|---------|----------|
| `express` | Web framework — any change to request handling could affect security middleware | `apps/api` |
| `jsonwebtoken` | JWT signing/verification — version changes could affect token validation | `apps/api` |
| `helmet` | Security headers — version changes affect CSP, HSTS behavior | `apps/api` |
| `bcrypt` | Password hashing — algorithm changes could weaken hashes | `packages/utils` |
| `drizzle-orm` | ORM — changes to query building could introduce SQL injection surface | root + `apps/api` |
| `multer` | File upload — changes to parsing could affect upload validation | `apps/api` |
| `cors` | CORS policy — changes could widen allowed origins | `apps/api` |
| `cookie-parser` | Cookie handling — changes could affect session security | `apps/api` |

Do NOT pin: `@aws-sdk/*` (too many sub-packages, better managed via overrides), `sharp` (native bindings, needs to track platform compat), `socket.io` (rapid iteration, security patches often in minor versions), `zod` (validation library, safe to auto-update).

**Considered but deferred:** `express-rate-limit` (`^8.2.1`) is security-adjacent (brute-force prevention) but was not included in AC4's pin list. Future security reviews should evaluate whether to add it.

### `pnpm audit --prod` vs `pnpm audit`
- `pnpm audit` scans ALL dependencies (dev + production) — will flag build-only vulns like minimatch/rollup
- `pnpm audit --prod` scans only production dependencies — won't flag dev-only issues
- **Use `--prod`** in CI to avoid false positives from build tooling vulnerabilities
- If `--prod` is not supported by the project's pnpm version, use the full `pnpm audit --audit-level=high` and accept that some manual triage may be needed

### project-context.md Discrepancy: bcrypt 5.x vs 6.x
- **project-context.md line 56** says: `bcrypt 5.x - Password hashing (10-12 rounds)`
- **packages/utils/package.json** has: `"bcrypt": "^6.0.0"`
- **Actual installed version:** bcrypt 6.x (per the `^6.0.0` range)
- The project-context.md was written during initial project setup and not updated when bcrypt was upgraded
- Fix: Update the reference to `bcrypt 6.x`

### What NOT to Do
- Do NOT pin ALL dependencies — only security-critical ones. Over-pinning creates maintenance burden and makes security patches harder to apply.
- Do NOT add `ignore-scripts=true` to `.npmrc` — bcrypt and sharp require post-install native compilation
- Do NOT add `strict-peer-dependencies=true` — this would break `pnpm install` due to loose peer dep specs in several packages
- Do NOT pin GitHub Actions to SHAs in this story — that's a separate supply-chain hardening concern and out of scope
- Do NOT make E2E tests blocking (`continue-on-error: false`) — that's a separate reliability concern
- Do NOT add Dependabot/Snyk/CodeQL — the `pnpm audit` step is sufficient for now, and adding third-party tools is a separate story

### Previous Story Intelligence (SEC-1, SEC-2, SEC-3)
- **SEC-1** should have: created `pnpm.overrides` for `fast-xml-parser`, possibly `rollup`; updated `multer`, `react-router-dom`, `@aws-sdk/client-s3`; resolved all production high/critical CVEs. If SEC-1 is done, the CI audit step should pass immediately.
- **SEC-2** modified `app.ts` (Helmet config) — no overlap with this story's changes
- **SEC-3** modified `app.ts` (`requiredProdVars`) and several controllers — no overlap with this story's CI/package.json changes
- If SEC-1 is NOT done, the CI audit step will immediately fail on existing CVEs — either do SEC-1 first or add the audit step with `continue-on-error: true` initially and create a follow-up to enforce

### Files to Modify

| File | Change |
|------|--------|
| `.github/workflows/ci-cd.yml` | Add `pnpm audit --audit-level=high --prod` step |
| `package.json` (root) | Add/extend `pnpm.overrides`, pin `drizzle-orm` |
| `apps/api/package.json` | Pin 7 security-critical deps to exact versions |
| `packages/utils/package.json` | Pin `bcrypt` to exact version |
| `.npmrc` | NEW — security-hardening settings |
| `_bmad-output/project-context.md` | Add accepted risks section, fix bcrypt version |

### Files NOT to Modify
- `.github/workflows/e2e.yml` — E2E pipeline is separate, no security scanning needed there
- `apps/web/package.json` — React/Leaflet already pinned, no additional security-critical deps to pin
- `packages/types/package.json` — zod is not security-critical enough to pin
- `pnpm-workspace.yaml` — no changes needed

### References

- [Source: _bmad-output/planning-artifacts/security-audit-report-2026-03-01.md — SEC-4 Story Definition]
- [Source: .github/workflows/ci-cd.yml — Current CI pipeline (no audit step)]
- [Source: _bmad-output/project-context.md:28 — "Lock to exact versions" rule (not enforced)]
- [Source: _bmad-output/project-context.md:56 — bcrypt 5.x reference (outdated)]
- [Source: docs/infrastructure-cicd-playbook.md — Deployment pipeline documentation]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- **Task 1 (CI audit step):** Added `pnpm audit --audit-level=high --prod` step in `lint-and-build` job, positioned after `pnpm install` and before `pnpm lint`. Confirmed pnpm 9.15.0 supports `--prod` flag. The step exits 0 locally (only 1 LOW `qs` vulnerability, which is below the `--audit-level=high` threshold).
- **Task 2 (pnpm.overrides):** SEC-1 had already created the `pnpm.overrides` section with `fast-xml-parser>=5.3.5`, `minimatch>=9.0.7`, `rollup>=4.59.0`. Verified and confirmed — no extension needed.
- **Task 3 (pinning):** Pinned 9 security-critical packages to exact resolved versions across 3 files. Resolved versions via `pnpm list`: express@4.22.1 (was `^4.19.2` — lockfile had already resolved to 4.22.1), jsonwebtoken@9.0.3, helmet@7.2.0 (was `^7.1.0`), drizzle-orm@0.30.10, multer@2.1.0, cors@2.8.5, cookie-parser@1.4.7, bcrypt@6.0.0. Lockfile verified consistent after `pnpm install`.
- **Task 4 (.npmrc):** Created `.npmrc` with `audit-level=high`, `engine-strict=true`, and `save-exact=true` (ensures future `pnpm add` defaults to exact versions, reinforcing pinning discipline). Verified `pnpm install` succeeds with the new settings. Did not add `ignore-scripts` (bcrypt/sharp need native compilation) or `strict-peer-dependencies` (would break install).
- **Task 5 (documentation):** Added "Accepted Dependency Risks" section to project-context.md documenting 7 build-only vulnerabilities with justifications. Fixed bcrypt version from 5.x to 6.x. Added quarterly review cadence note.
- **Task 6 (regression):** Full test suite passes — 1939 web + API + utils + testing tests. Build succeeds (2/2 turbo tasks). `pnpm audit --audit-level=high --prod` exits 0.

### File List

- `.github/workflows/ci-cd.yml` — Added security audit step after pnpm install
- `package.json` (root) — Pinned `drizzle-orm` to exact version `0.30.10`
- `apps/api/package.json` — Pinned 7 security-critical deps to exact versions (express@4.22.1, jsonwebtoken@9.0.3, helmet@7.2.0, drizzle-orm@0.30.10, multer@2.1.0, cors@2.8.5, cookie-parser@1.4.7)
- `packages/utils/package.json` — Pinned `bcrypt` to exact version `6.0.0`
- `pnpm-lock.yaml` — Updated lockfile reflecting exact-pinned dependency versions
- `.npmrc` — NEW: Security hardening settings (audit-level=high, engine-strict=true, save-exact=true)
- `_bmad-output/project-context.md` — Added "Accepted Dependency Risks" section (split into Build-Only and Production subsections), fixed bcrypt 5.x -> 6.x, added quarterly review cadence note
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated sec-4 status to review

## Change Log

- **2026-03-01:** Implemented dependency pinning & audit CI gate (SEC-4). Added `pnpm audit --audit-level=high --prod` to CI pipeline, pinned 9 security-critical deps to exact versions, created `.npmrc` with security settings, documented accepted build-only risks in project-context.md, fixed bcrypt version discrepancy.
- **2026-03-01 (Code Review):** Adversarial review found 6 issues (1H, 3M, 2L). All fixed: (H1) Split accepted risks into Build-Only and Production subsections — `qs` was misclassified as build-only. (M1/M2) Added `pnpm-lock.yaml` and `sprint-status.yaml` to File List. (M3) Added `save-exact=true` to `.npmrc`. (L1) Documented express/helmet version jumps in completion notes. (L2) Noted `express-rate-limit` as future pinning candidate.
