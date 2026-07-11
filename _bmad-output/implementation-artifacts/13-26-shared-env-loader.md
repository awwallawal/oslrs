# Story 13-26: Shared `loadEnv()` — kill the hardcoded dotenv path + unify env-loading across entrypoints

Status: ready-for-dev

<!-- Authored 2026-07-10 by Bob (SM) via *create-story. EMERGENT from the 13-21 backfill / DIAG3 diagnostics: `db/index.ts:11` loads env via a hardcoded relative path `dotenv.config({ path: __dirname/../../../../.env })`. Three smells: (1) magic `../../../../` (miscount-prone, opaque), (2) move-fragile (silent no-op if the file moves — dotenv doesn't error on a missing file), (3) inconsistent env-loading across entrypoints — the ROOT of the DIAG3 surprise where a naive script got the MOCK email provider because `.env` wasn't loaded before app modules imported. POST-LAUNCH: this is a BOOT-PATH change (SEC-3 crash-loop class) — do NOT touch it before the blast. -->

## Story
As **a developer running the app, a script, or a worker**,
I want **one shared `loadEnv()` that resolves the monorepo `.env` robustly and is imported first by every entrypoint**,
so that **env-loading is consistent and move-proof — no magic `../../../../`, no silent mis-load, and no "naive script gets the mock provider" surprise.**

## Context & Evidence
- `apps/api/src/db/index.ts:11` — `dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })`. Works today (relative to the file, not CWD — which is why the 13-21 backfill ran from any directory), but it's fragile:
  - **Magic count:** `../../../../` = 4 levels; nobody can verify it at a glance; a refactor that moves `db/index.ts` (e.g. the 12-3 utils-barrel-split) silently breaks it — dotenv no-ops on a missing file, so `DATABASE_URL` becomes undefined and the app only fails at the boot guard.
  - **Inconsistent across entrypoints:** the DB path is pinned here, but other modules' env timing isn't — the DIAG3 diagnostic got the MOCK email provider because a script imported app modules before any `.env` load. The inconsistency is the real bug class.
- **NOT launch-gating.** Latent fragility, not an active break. But it's a boot-path change → the SEC-3 crash-loop lesson says never days before launch. Ship it in the first post-launch hygiene pass.

## Acceptance Criteria
1. **AC1 — Single shared `loadEnv()`.** A small module (e.g. `apps/api/src/lib/load-env.ts` or `packages/config`) exports `loadEnv()` that resolves the monorepo root by a **marker walk-up** (`pnpm-workspace.yaml` / `.git`), NOT a `../` count, and loads that `.env`. Idempotent (safe to call twice). It ERRORS loudly (or logs a clear warning) if no `.env` is found in a non-test env, instead of silently no-op'ing.
2. **AC2 — Every entrypoint calls it FIRST.** The app (`src/index.ts`), every runnable script in `apps/api/scripts/`, and every worker entry import/call `loadEnv()` before importing any module that reads `process.env` (esp. the email provider + DB). The hardcoded `dotenv.config({ path: ../../../../ })` in `db/index.ts` is removed in favour of the shared loader (or `db/index.ts` calls `loadEnv()`).
3. **AC3 — Provider-init determinism (closes the DIAG3 class).** A test proves that after `loadEnv()`, the email provider resolves to the REAL provider when the env says so (no mock-unless-dotenv-first race). Document the ordering contract: `loadEnv()` before app-module import.
4. **AC4 — Move-proof + no behavior change.** A test asserts the marker walk-up finds the repo root from a nested file location (simulating a moved file), and that the resolved `.env` path equals the current `/root/oslrs/.env` target. No runtime behavior change beyond env-resolution robustness.
5. **AC5 — Tests + suites green; prod boot verified.** Full api suite green; tsc/eslint clean. Because this is a boot-path change: verify locally that the app boots + reads env correctly, and (operator) confirm a clean prod boot after deploy (health 200 + the app's `email.service.initialized` = resend at boot).

## Tasks / Subtasks
- [ ] **Task 1 (AC1)** — `loadEnv()` with marker walk-up + loud-on-missing (non-test); unit tests for the walk-up + idempotency.
- [ ] **Task 2 (AC2)** — adopt it in `src/index.ts` + `db/index.ts` (drop the hardcoded path) + the scripts/workers; grep for stray `dotenv.config(` and consolidate.
- [ ] **Task 3 (AC3, AC4)** — provider-determinism test + moved-file walk-up test.
- [ ] **Task 4 (AC5)** — suites; local boot check; operator prod-boot confirmation post-deploy.

## Dev Notes
- **Alternative considered — `node --env-file` / pm2-injected env:** cleanest in principle (app code shouldn't know where `.env` lives), but it changes every launch path (pm2 ecosystem, CI, local dev) — bigger blast radius. The shared `loadEnv()` is the lower-risk win now; a move to injected env can be a later story if desired. State the choice in the File List.
- **Boot-path risk (why post-launch):** an env-resolution change that only bites at startup is the SEC-3 crash-loop shape. Land it in a quiet window with an explicit prod-boot verification (AC5), never in the pre-blast window.
- **The hardcoded path is NOT blocking anything today** — the 13-21 backfill proved it works from any CWD. This story removes latent fragility + the DIAG3 inconsistency, not an active break.

### References
- [Source: apps/api/src/db/index.ts:11 — the hardcoded `dotenv.config({ path: __dirname/../../../../.env })`]
- [Source: DIAG3 diagnostic (13-21) — naive script got the MOCK email provider because `.env` wasn't loaded before app-module import]
- [Source: SEC-3 crash-loop lesson — env/boot changes must be verified on prod boot before relying on them]

## Dev Agent Record
### File List

## PM Validation (John, 2026-07-10)

**Validated — approved. POST-LAUNCH hygiene, explicitly NOT pre-blast.**

1. **Right problem, right timing.** The three smells are real (magic path, move-fragility, cross-entrypoint inconsistency), and the DIAG3 mock-provider surprise is the concrete cost. But it's a boot-path change — the SEC-3 rule is absolute: not in the pre-launch window. Queue it for the first post-launch hygiene pass.
2. **AC3 is the real prize.** The `../` count is cosmetic; the durable value is a deterministic env-load ordering so a script/worker can never again silently run on the mock provider. Keep the provider-determinism test.
3. **Scope guard:** the shared `loadEnv()` is the win; do NOT balloon into a full "inject env at the process boundary" migration (that's a separate, bigger story if we ever want it). Marker walk-up + adopt-everywhere is enough.
4. **AC5 prod-boot verification is mandatory** given the boot-path class — never assume; confirm health + provider-at-boot after deploy.

**No AC changes.** Dev-ready; schedule post-launch.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-10 | Story drafted via *create-story — replace the hardcoded `../../../../.env` dotenv path with a shared marker-walk-up `loadEnv()` adopted by all entrypoints; closes the DIAG3 provider-init inconsistency. POST-LAUNCH (boot-path/SEC-3 risk). EMERGENT from the 13-21 backfill/DIAG3 diagnostics. | Bob (SM) |
