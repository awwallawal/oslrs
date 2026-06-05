# Prep Story: Type-check + lint operator scripts in CI

Status: ready-for-dev

<!--
Authored 2026-06-05 by Bob (SM) via canonical *create-story --yolo workflow.

Surfaced during the Story 9-16 follow-up session (2026-06-03/05): the new
magic-link UAT scripts (`_list-public-users.ts`, `_seed-test-public-user.ts`)
were written, but a check revealed `apps/api/tsconfig.json` includes only
`src/**/*` and the api lint runs only `eslint src` — so EVERY file under
`apps/api/scripts/` is type-checked and linted by NOTHING in CI. They run via
`tsx` at runtime, which transpiles per-file without type-checking.

This is a latent prod-safety risk: those scripts MUTATE PRODUCTION DATA over
Tailscale (`_seed-test-public-user`, `_enumerator-path-smoke-test`,
`_backfill-*`, `_cohort-a-supplemental-survey-blast`, `_reengagement-email-blast`,
`dashboard.ts`). A type error or a renamed-import typo in any of them ships
undetected and only surfaces when an operator runs it against prod.
-->

## Story

As **the OSLRS maintainer**,
I want **operator scripts under `apps/api/scripts/` type-checked and linted in CI**,
So that **a type error or stale import in a production-mutating Tailscale script is caught before it ships, not when I run it against prod**.

## Acceptance Criteria

1. **AC#1 — Separate scripts tsconfig (build stays scoped to `src/`).** New `apps/api/tsconfig.scripts.json` that `extends` the base `tsconfig.json` and sets `include: ["scripts/**/*", "src/**/*"]`, `noEmit: true` (scripts import from `../src/**`, so `src` must be in the graph for resolution). The production build (`tsc -p tsconfig.json`) is UNCHANGED — it still includes only `src/**/*`; scripts are NEVER compiled into `dist/` (they are `tsx`-run). [Source: apps/api/tsconfig.json — current include `["src/**/*"]`, exclude `__tests__`].

2. **AC#2 — `typecheck:scripts` package script.** Add `"typecheck:scripts": "tsc -p tsconfig.scripts.json --noEmit"` to `apps/api/package.json`.

3. **AC#3 — Wired into CI.** The `test-api` job (or the lint-and-build job) in `.github/workflows/ci-cd.yml` runs `pnpm --filter @oslsr/api typecheck:scripts` so a scripts type error fails the pipeline. Optionally also add it to the husky pre-commit hook (consistent with the existing `tsc --noEmit` pre-commit step on src) — dev judgment on whether pre-commit or CI-only.

4. **AC#4 — Lint covers `scripts/`.** Extend the api lint from `eslint src` to `eslint src scripts`. Surface and FIX any pre-existing lint violations in the current scripts (budget for this — the scripts have never been linted). If a script legitimately needs a rule disabled (e.g. `no-console` — these are CLI tools), add a scoped ESLint override for `scripts/**` rather than inline-disabling every line.

5. **AC#5 — Existing scripts pass clean.** After wiring, `typecheck:scripts` AND `eslint src scripts` both pass on the current tree (all of `_enumerator-path-smoke-test.ts`, `_list-public-users.ts`, `_seed-test-public-user.ts`, `_backfill-*.ts`, `_cohort-a-supplemental-survey-blast.ts`, `_reengagement-email-blast.ts`, `dashboard.ts`, `drizzle-runtime-smoke.ts`). Fix any errors uncovered — that is the whole point of the story (those errors are latent prod bugs).

6. **AC#6 — Proven to catch regressions.** Demonstrate the gate works: introduce a deliberate type error in a scratch script, confirm CI (and/or pre-commit) fails, remove it. Note the evidence in the Dev Agent Record.

7. **AC#7 — No runtime behaviour change, no new deps.** Pure tooling/config. No change to any script's behaviour; no new dependencies (uses the existing `typescript` + `eslint`).

## Tasks / Subtasks

- [ ] **Task 1 — tsconfig.scripts.json + package script (AC: #1, #2)**
  - [ ] 1.1 Add `apps/api/tsconfig.scripts.json` (extends base; include scripts + src; noEmit).
  - [ ] 1.2 Add `typecheck:scripts` to `apps/api/package.json`.
  - [ ] 1.3 Run it; FIX every type error the scripts surface (AC#5).
- [ ] **Task 2 — Lint coverage (AC: #4, #5)**
  - [ ] 2.1 Change api lint to `eslint src scripts`; add a `scripts/**` override block if CLI-appropriate (`no-console` off).
  - [ ] 2.2 Run it; FIX every lint violation surfaced.
- [ ] **Task 3 — CI wiring (AC: #3, #6)**
  - [ ] 3.1 Add `pnpm --filter @oslsr/api typecheck:scripts` to the CI pipeline (+ optional pre-commit).
  - [ ] 3.2 Deliberate-error smoke: confirm the gate fails, then revert. Record evidence.
- [ ] **Task 4 — Verify + close (AC: #7)**
  - [ ] 4.1 Full api tsc (src) + lint + tests still green; build (`dist/`) unchanged (no scripts emitted).
  - [ ] 4.2 Code review on the uncommitted tree per `feedback_review_before_commit.md`.

## Dev Notes

### Why this is worth a story (not just a chore)

This project runs an unusually high number of **production-mutating operator scripts over Tailscale** — backups, blasts, backfills, smoke tests, seeds. Every one is currently outside static analysis. The cost of a latent error is paid at the worst possible time (operator running a one-off against prod). The fix is small and one-time; the protection is permanent and compounds as more scripts are added (Story 9-38's backfill script will be the next beneficiary).

### Design decision (locked, yolo)

- **Separate `tsconfig.scripts.json`, NOT extending the build `include`.** Adding `scripts/` to the build tsconfig would pull them into `dist/` on `tsc` build — wrong; they're `tsx`-run. A dedicated `--noEmit` config type-checks them in isolation while keeping the build scoped. This mirrors how many monorepos separate "typecheck everything" from "build the shippable."

### Risk

- Enabling tsc + lint on never-checked scripts will likely surface **pre-existing errors**. That is expected and is the value — budget Task 1.3 / 2.2 to fix them. If any fix is non-trivial (a real bug in a prod script), call it out separately; do not paper over with `any`/`eslint-disable` without a comment.

### References

- Current api tsconfig (include `src/**/*` only): [Source: apps/api/tsconfig.json]
- Current api lint (`eslint src`): [Source: apps/api/package.json "lint" script]
- The scripts at risk: [Source: apps/api/scripts/*.ts]
- Sibling prep-tooling precedent: [Source: _bmad-output/implementation-artifacts/prep-tsc-pre-commit-hook.md]
- Origin: Story 9-16 follow-up session (2026-06-03/05) "make it better" point #3.

## Dev Agent Record

### Agent Model Used

_(unset — authored by Bob/SM; dev agent fills on pickup)_

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-06-05 | Prep story drafted by Bob (SM) via `*create-story --yolo`. 7 ACs / 4 Tasks. Adds `tsconfig.scripts.json` + `typecheck:scripts` + lint-scripts coverage + CI wiring so operator scripts get static analysis. | Story 9-16 follow-up surfaced that `apps/api/scripts/` (incl. prod-mutating Tailscale scripts) is type-checked + linted by NOTHING — a latent prod-safety gap. |
