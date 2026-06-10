# Large multi-part story workflow

For stories big enough to span many days and several structural parts (e.g.
Story 9-18, which carries Parts A–F across 7–11 dev-days). Goal: a clean,
reviewable history landing on `main` as **one coherent push**, without the
risk that a long-lived local-only branch normally carries.

## The shape

1. **One feature branch for the whole story** — `feat/<story>-...`.
2. **One atomic commit per part** (e.g. `feat(9-18): Part B — ...`). Each commit
   is independently green (the pre-commit hook gates `lint` + `tsc`; run the
   relevant test suite before committing — the pre-commit hook does *not* run
   tests).
3. **Back up the branch to `origin` periodically.** CI/CD fires only on push to
   `main` or PR-to-`main` (`.github/workflows/ci-cd.yml`, `e2e.yml`), so a
   feature-branch push triggers **no CI and no deploy** — it is free off-site
   insurance against laptop loss. A backup push is *not* the coherent push.
4. **Rebase `main` into the branch every couple of parts.** `main` keeps moving;
   catching a conflict on a shared hot file (`FormRenderer.tsx`, `skipLogic.ts`,
   `sprint-status.yaml`) on day 2 is trivial, on day 11 it is not.
5. **Keep `sprint-status.yaml` (and other cross-story doc flips) out of the
   per-part commits.** It is the repo's #1 merge-conflict generator on a
   long-lived branch. Do the status flip in a single commit right before the
   final merge.
6. **Final coherent push:** rebase `main` in one last time → run the full suite
   (`pnpm test`, or `PREPUSH_FULL=1 git push`) → open the PR (or rebase-merge
   locally and push `main`). **Rebase-and-merge, not squash** — the per-part
   atomic commits are retro input and must survive on `main`.

## Guard rails in place

- **`.husky/pre-commit`** — `lint` + `tsc --noEmit` on staged TS; blocks the
  commit on any failure. Secrets/`.env` scan.
- **`.husky/pre-push`** — asymmetric gate:
  - push to `main` → full `pnpm test` (so the single coherent push can never be
    a surprise CI failure);
  - any other push (branch backups, WIP) → skipped, stays instant.
  - Force the suite anywhere: `PREPUSH_FULL=1 git push`. Emergency bypass:
    `git push --no-verify` (use sparingly).
- **Base tag** — tag the `main` commit the story branched from
  (`git tag <story>-base`) so the whole story is one `git diff <story>-base` and
  there is a clean fallback point if the branch goes wrong.

## Why not just push each part to main as you go?

Intermediate parts are intentionally incomplete and can carry *latent* bugs that
only activate once a later part lands (Story 9-18 Part B's stale-NIN purge was
latent until Part A moves NIN to Step 1). Landing those on `main` piecemeal would
ship half-wired behaviour and fire deploys on every part. The branch keeps the
story coherent; `main` only ever sees the finished, all-parts-green result.
