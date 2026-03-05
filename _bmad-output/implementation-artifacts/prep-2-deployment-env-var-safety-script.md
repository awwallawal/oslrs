# Story 7.prep-2: Deployment Env Var Safety Script

Status: ready-for-dev

## Story

As a **developer deploying to production**,
I want a pre-deploy script that validates all required environment variables exist on the VPS before the app restarts,
so that deployments never cause crash-restart loops from missing env vars (like the SEC-3 CORS_ORIGIN incident).

## Problem Statement

On 2026-03-02, SEC-3 added `CORS_ORIGIN` to `requiredProdVars` in `app.ts`. The code was deployed to production without setting the var on the VPS `.env` file first. Result: **12+ PM2 crash-restart cycles** until the variable was manually added. The current `validateEnvironment()` in `app.ts` is reactive (crashes after deploy), not preventive (catches before deploy).

Epic 7 will introduce new env vars (marketplace config, CAPTCHA keys, etc.), making this class of incident increasingly likely.

## Acceptance Criteria

1. **Given** the deploy job runs in CI, **when** a required env var is missing on VPS, **then** deployment aborts with a clear error listing the missing var(s) — the app is NOT restarted.
2. **Given** all required vars are present on VPS, **when** the deploy job runs, **then** deployment proceeds normally.
3. **Given** a developer adds a new var to `requiredProdVars` in `app.ts`, **when** they deploy, **then** the pre-deploy check catches the missing var before the app restarts.
4. **Given** optional env var groups (S3, email/Resend), **when** checked, **then** warnings are emitted (not failures) for missing optional vars.
5. **Given** the existing CI/CD pipeline, **when** the safety script is integrated, **then** it runs as the first step in the deploy job, before `git pull` or `pm2 restart`.
6. **Given** the existing test suite, **when** all tests run, **then** zero regressions.

## Tasks / Subtasks

- [ ] Task 1: Create pre-deploy validation script (AC: #1, #2, #3, #4)
  - [ ] 1.1 Create `scripts/check-env.sh` (runs on VPS via SSH)
  - [ ] 1.2 Parse `requiredProdVars` from `apps/api/src/app.ts` (grep/sed extraction) — single source of truth
  - [ ] 1.3 Check each required var exists in the VPS `.env` file (or environment)
  - [ ] 1.4 Add JWT_SECRET length check (must be >= 32 chars, matching app.ts validation)
  - [ ] 1.5 Add optional group warnings: S3 vars (if backup worker active), Resend vars (if EMAIL_PROVIDER=resend), VITE_API_URL (build-time)
  - [ ] 1.6 Exit with non-zero code if any required var is missing (blocks deployment)
  - [ ] 1.7 Print clear summary: required vars (PASS/FAIL), optional groups (PASS/WARN)
- [ ] Task 2: Integrate into CI/CD pipeline (AC: #5)
  - [ ] 2.1 In `.github/workflows/ci-cd.yml` deploy job, add env check step BEFORE `git pull`
  - [ ] 2.2 SSH to VPS, run the check script against production `.env`
  - [ ] 2.3 If check fails, abort deploy job with clear error message
- [ ] Task 3: Document in playbook (AC: #3)
  - [ ] 3.1 Add "Pre-Deploy Env Var Check" section to `docs/infrastructure-cicd-playbook.md`
  - [ ] 3.2 Document how to add new required vars: add to `requiredProdVars` in app.ts + set on VPS `.env` BEFORE deploying
- [ ] Task 4: Verify (AC: #6)
  - [ ] 4.1 `pnpm test` — all tests pass, zero regressions

## Dev Notes

### SEC-3 Incident Timeline (What We're Preventing)

1. SEC-3 story added `'CORS_ORIGIN'` to `requiredProdVars` array in `app.ts:36`
2. Code pushed to `main`, CI passed all tests
3. Deploy job pulled code onto VPS, ran `pm2 restart`
4. API crashed immediately: `[SECURITY] Missing required production environment variables: CORS_ORIGIN`
5. PM2 auto-restarted. Crashed again. 12+ cycles.
6. Manual fix: SSH in, add `CORS_ORIGIN=https://oyotradeministry.com.ng` to `.env`, `pm2 restart`

### Current Validation (Reactive — app.ts:20-54)

```typescript
// apps/api/src/app.ts:32-38
const requiredProdVars = [
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'DATABASE_URL',
  'HCAPTCHA_SECRET_KEY',
  'CORS_ORIGIN',
];
const missing = requiredProdVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`[SECURITY] Missing required production environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
```

This runs at startup — too late. The pre-deploy script runs the same check BEFORE restarting.

### Current Deploy Job (ci-cd.yml:549-585)

The deploy job SSHs into the VPS, pulls code, runs db:push, builds frontend, copies dist, and restarts PM2. The safety script should run as the **very first SSH command**, before `git pull`.

### Script Design

The script should be self-contained (no Node.js dependency), shell-based, and runnable on the VPS directly. It reads the `.env` file and checks against a declared list.

**Key design decisions:**
- **Extract from app.ts** (not hardcoded list) — ensures the script stays in sync as new vars are added. **Caveat:** grep/sed extraction is fragile — if someone refactors the array to a single line or adds inline comments, parsing breaks silently. If extraction proves brittle, fall back to a maintained list in the script with a CI test step that asserts the script's list matches `app.ts` (catch divergence at build time, not deploy time).
- **Shell script** (not Node.js) — works before `npm install`, no dependency on app being buildable
- **Warnings for optional groups** — S3 and email vars aren't required for app startup but missing them causes silent failures in backup/email workers

### All Env Var Groups

**Required (enforced in app.ts — deploy MUST fail if missing):**
| Variable | Purpose |
|----------|---------|
| JWT_SECRET | Access token signing (min 32 chars) |
| REFRESH_TOKEN_SECRET | Refresh token signing |
| DATABASE_URL | PostgreSQL connection |
| HCAPTCHA_SECRET_KEY | Server-side CAPTCHA verification (NOT `HCAPTCHA_SECRET`) |
| CORS_ORIGIN | Allowed frontend origin |

**Optional warnings (app starts fine but features break):**
| Group | Variables | Impact if missing |
|-------|-----------|-------------------|
| S3/Backups | S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_NAME | Backup worker fails silently |
| Email/Resend | RESEND_API_KEY (when EMAIL_PROVIDER=resend) | Email sending fails |
| OAuth | GOOGLE_CLIENT_ID | Google login unavailable |
| Build-time | VITE_API_URL | Frontend calls wrong API URL |

### Project Structure Notes

- Script location: `scripts/check-env.sh` (new file)
- CI/CD: `.github/workflows/ci-cd.yml:549-585` (modify deploy job)
- App validation: `apps/api/src/app.ts:20-54` (source of truth for required vars)
- Playbook: `docs/infrastructure-cicd-playbook.md` (add documentation)
- Env template: `.env.example` (reference, 138 lines)
- VPS `.env` location: project root on production server

### Anti-Patterns to Avoid

- **Do NOT hardcode the required var list in the script** — extract from `app.ts` or maintain a shared list. Hardcoded lists diverge silently.
- **Do NOT make the script require Node.js** — it must run before any npm/pnpm commands in the deploy pipeline.
- **Do NOT fail on optional vars** — S3/email missing should warn, not block deployment.
- **Do NOT read `.env` files with `source`** — use grep/awk to check key existence. Sourcing untrusted env files is a security risk.

### References

- [Source: epic-6-retro-2026-03-04.md#Challenge 3] — SEC-3 CORS_ORIGIN Production Crash Loop
- [Source: epic-6-retro-2026-03-04.md#Key Insight 5] — Deployment Safety Requires Env Var Coordination
- [Source: epic-6-retro-2026-03-04.md#Process Improvements P1] — Deployment env var safety gate
- [Source: epic-6-retro-2026-03-04.md#Prep Tasks prep-2] — Deployment env var safety script
- [Source: apps/api/src/app.ts:20-54] — Current validateEnvironment() implementation
- [Source: .github/workflows/ci-cd.yml:549-585] — Current deploy job
- [Source: docs/infrastructure-cicd-playbook.md] — Deployment documentation
- [Source: docs/team-context-brief.md:47] — "Any code adding required env vars MUST set the var on production BEFORE deploying"

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
