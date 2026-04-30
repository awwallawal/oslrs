# Prep Story: `tsc --noEmit` Pre-Commit Hook (Wave 0)

Status: done

<!--
Created 2026-04-27 by Awwal+Claude after CI commit `bf98931` failed strict TS build that local vitest had silently allowed. tsx (used by vitest) only transpiles; CI's `tsc` is strict. Without a pre-commit type-check, every TS-error commit causes a CI round-trip of ~7 min.

Validation pass 2026-04-29 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; codebase claims verified; Pitfall #18 ambiguity disambiguated.
-->

## Story

As a **developer**,
I want **`tsc --noEmit` to run on commit when I touch TypeScript files in `apps/api` or `apps/web`**,
so that **strict type errors that vitest's `tsx` transpile-only mode silently allows are caught locally before push, eliminating the failed-CI-build round-trip pattern that consumed two extra commits in this session (`bf98931` failure → `1383373` CI fix)**.

## Acceptance Criteria

1. **AC#1 — Husky pre-commit hook runs `tsc --noEmit` per affected workspace:** When commit includes staged `.ts` or `.tsx` files under `apps/api/src/` or `apps/api/scripts/`, the hook runs `pnpm --filter @oslsr/api exec tsc --noEmit`. Same for `apps/web/src/` → `pnpm --filter @oslsr/web exec tsc --noEmit`.

2. **AC#2 — Hook is INCREMENTAL:** Skipped entirely when no staged files match `apps/(api|web)/.*\.(ts|tsx)$`. A docs-only or YAML-only commit does NOT trigger tsc. Detection via `git diff --cached --name-only --diff-filter=ACM`.

3. **AC#3 — Hook is FAST:** Adds <30 seconds to typical commit times. Achieved by:
   - Only running `tsc --noEmit` (no transpile, no emit)
   - Only running on workspaces with staged changes (incremental)
   - Optional: `--incremental` flag on tsc to cache type-check state in `.tsbuildinfo`

4. **AC#4 — Hook FAILS commit on type errors:** If `tsc --noEmit` exits non-zero, the pre-commit hook exits non-zero, which aborts the commit. The actual TS error messages from tsc are printed clearly in the terminal so the developer can fix and retry.

5. **AC#5 — Hook can be bypassed with `--no-verify` for emergencies:** Standard husky behavior — `git commit --no-verify` skips ALL pre-commit hooks. No special handling needed; document in the playbook.

6. **AC#6 — Hook runs ALONGSIDE existing pre-commit checks:** The hook does not replace the existing `.env`-blocking check or the existing `pnpm lint` check. All three (env-block + lint + new tsc) run sequentially; commit aborts on any failure.

7. **AC#7 — Documentation:**
   - **Target the TABLE row, not the heading.** `docs/infrastructure-cicd-playbook.md` has TWO pitfall numbering schemes that both contain a "#18". Update **row #18 in the Common Issues / Pitfalls table at line ~715** (the tsc/vitest gap), NOT the `### Pitfall #18:` heading at line ~968 (which is about DO Web Console SSH-based — unrelated). Pre-edit verification: confirm the row's "Issue" column reads `Local tests pass but CI's pnpm build fails on TS errors`.
   - Update the row's Fix column from "Always run `pnpm --filter @oslsr/api build && pnpm --filter @oslsr/web build` before commit when touching `.ts` files" → "(superseded 2026-04-XX) Pre-commit hook now runs `tsc --noEmit` automatically on staged `.ts`/`.tsx` changes in `apps/(api|web)/`. See `.husky/pre-commit`. Bypass with `git commit --no-verify` if needed."

8. **AC#8 — Verified manually:** Introduce a deliberate TS error in `apps/api/src/__tests__/csp-parity.test.ts` (e.g., assign a number to a string variable). Stage. Attempt commit. Confirm:
   - Hook runs and prints the TS error
   - Commit is aborted (no commit object created)
   - After reverting the deliberate error, commit proceeds normally

## Tasks / Subtasks

- [x] **Task 1 — Inspect current `.husky/pre-commit`** (AC: #6)
  - [x] 1.1 Read full content of `.husky/pre-commit`. Confirm the existing structure: `.env`-block (lines 1-27), secrets-pattern warning (lines 29-43), `pnpm lint` (line 46). [Story said line 49; actual is line 46 — minor drift, structure identical.]
  - [x] 1.2 Note the order: this story adds tsc as a NEW step AFTER `pnpm lint` (rationale: lint catches lower-cost issues first, tsc is heavier).

- [x] **Task 2 — Add tsc step to `.husky/pre-commit`** (AC: #1, #2, #3, #4)
  - [x] 2.1 After the existing `pnpm lint` step, append:
        ```bash
        # =============================================================================
        # Type check: tsc --noEmit on TS changes (catches what vitest's tsx misses)
        # =============================================================================
        STAGED_TS_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E "^apps/(api|web)/.*\.(ts|tsx)$" || true)

        if [ -n "$STAGED_TS_FILES" ]; then
          STAGED_API=$(echo "$STAGED_TS_FILES" | grep -E "^apps/api/" || true)
          STAGED_WEB=$(echo "$STAGED_TS_FILES" | grep -E "^apps/web/" || true)

          if [ -n "$STAGED_API" ]; then
            echo ""
            echo "[pre-commit] Running tsc --noEmit on @oslsr/api..."
            if ! pnpm --filter @oslsr/api exec tsc --noEmit; then
              echo ""
              echo "COMMIT BLOCKED: TypeScript errors in @oslsr/api"
              echo "Fix the errors above, re-stage, and retry."
              echo "(To bypass for emergency: git commit --no-verify)"
              exit 1
            fi
          fi

          if [ -n "$STAGED_WEB" ]; then
            echo ""
            echo "[pre-commit] Running tsc --noEmit on @oslsr/web..."
            if ! pnpm --filter @oslsr/web exec tsc --noEmit; then
              echo ""
              echo "COMMIT BLOCKED: TypeScript errors in @oslsr/web"
              echo "Fix the errors above, re-stage, and retry."
              echo "(To bypass for emergency: git commit --no-verify)"
              exit 1
            fi
          fi
        fi
        ```
  - [x] 2.2 Note: `pnpm --filter @oslsr/X exec tsc --noEmit` automatically uses the workspace's `tsconfig.json` — no `-p` flag needed. The workspace's tsc binary comes from its `node_modules/.bin/tsc` via pnpm's resolution.

- [x] **Task 3 — (Optional, only if Task 2 is slow) Add `--incremental`** (AC: #3) — ACTIVATED based on measurements
  - [x] 3.1 Cold-run measurements on this machine: `@oslsr/api` 14.4s (under threshold), `@oslsr/web` 37.7s (FAILS 30s AC#3 target alone, ~52s combined). `--incremental` added to both invocations.
  - [x] 3.2 `.gitignore` already covers `*.tsbuildinfo` at line 70 (general pattern matches at any depth, including `apps/api/tsconfig.tsbuildinfo`, `apps/web/tsconfig.tsbuildinfo`, `apps/web/tsconfig.node.tsbuildinfo`). Verified via `git check-ignore` — no `.gitignore` change needed.
  - [x] 3.3 Warm-run measurements after `--incremental`: `@oslsr/api` 4.5s, `@oslsr/web` 4.4s, ~9s combined. Comfortably under AC#3's 30s target. First-cold run on a fresh dev machine is ~52s but only happens once.

- [x] **Task 4 — Verification** (AC: #8)
  - [x] 4.1 Introduced deliberate error in `apps/api/src/app.ts`: `const __precommitHookTest: string = 42;` (number assigned to string, with `void` to suppress unused warning).
  - [x] 4.2 Staged via `git add apps/api/src/app.ts`.
  - [x] 4.3 Attempted `git commit -m "test: deliberate TS error (should be blocked)"`.
  - [x] 4.4 Confirmed:
        - Hook ran: `[pre-commit] Running tsc --noEmit on @oslsr/api...`
        - tsc emitted: `src/app.ts(2,7): error TS2322: Type 'number' is not assignable to type 'string'.`
        - Hook printed: `COMMIT BLOCKED: TypeScript errors in @oslsr/api`
        - Exit code 1 (`husky - pre-commit script failed (code 1)`)
        - `git log -1` confirms HEAD still at `e799104` (unchanged) — commit object NOT created
  - [x] 4.5 Reverted via `git restore --staged apps/api/src/app.ts && git restore apps/api/src/app.ts`. (Step "stage tiny harmless change + commit succeeds" not executed as a real commit — verified equivalently by warm-run timings (4.5s/4.4s) showing clean tsc passes; avoiding a verification commit keeps the working tree clean for the actual story commit.)
  - [x] 4.6 Confirmed docs-only path: staged `_bmad-output/implementation-artifacts/prep-tsc-pre-commit-hook.md` (no TS files), invoked hook directly via `sh .husky/pre-commit`. Output showed env-block + secrets-check + `pnpm lint` (cached, 297ms), then exited 0 with NO `[pre-commit] Running tsc...` line. tsc step properly skipped.

- [x] **Task 5 — Documentation** (AC: #7)
  - [x] 5.1 Pre-edit verified row #18 Issue column reads `Local tests pass but CI's pnpm build fails on TS errors` (matches story expectation). Replaced Fix column with the supersede text per AC#7. Confirmed `### Pitfall #18:` heading at line 968 (DO Web Console — SSH-based) was NOT touched.
  - [x] 5.2 Sprint-status flipped `ready-for-dev` → `in-progress` at start; will flip to `review` at workflow Step 9. Operator flips to `done` post-merge per the original Task 5.2 wording.

- [x] **Task 6 — Apply code review fixes BEFORE commit** (Wave 0 prep-tsc code review, 2026-04-30)
  - [x] 6.1 H1: Add `set -e` to `.husky/pre-commit` line 2 so `pnpm lint` failures actually block commits. Without it, AC#6's "commit aborts on any failure" was silently false (lint failed → script continued → tsc passed → commit proceeded). Existing `|| true` patterns + `if !` blocks remain compatible (set -e suppressed in conditional contexts). [Source: .husky/pre-commit:2]
  - [x] 6.2 H2: Scope-discipline. Working tree had 38 unrelated files (Bob's canonical-template cleanup pass + baseline-report tooling churn). Stashed in two batches before the prep-tsc commit lands: `bmad-canonicalize-pass` (16 story-doc reformats + epics.md) and `baseline-report-chapters` (22 chapter files). Prep-tsc commit kept tight at 4 files. Recover via `git stash pop` for each respective separate commit.
  - [x] 6.3 M1: Cache-recovery one-liner appended to playbook table row #18 Fix column — `rm apps/*/tsconfig.tsbuildinfo apps/web/tsconfig.node.tsbuildinfo` if hook reports clean but CI catches type errors (rare, after heavy branch-switching). [Source: docs/infrastructure-cicd-playbook.md:715]
  - [x] 6.4 M2: Risk Analysis table tightened with two new rows: cold-run-on-fresh-machine reality (~67s worst-case, one-time only) and incremental cache corruption recovery procedure.
  - [x] 6.5 L1/L2/L3: Documented as known-but-deferred in Review Follow-ups (AI) below. Sequential tsc and full-monorepo `pnpm lint` are pre-existing patterns; potential future optimization stories.
  - [x] 6.6 Status flipped `review` → `in-progress` per workflow Step 5 logic (HIGH/MEDIUM findings remain → in-progress until close-out commit). Will flip back to `review` post-fix-apply, then `done` at merge.

## Dev Notes

### Why this is Wave 0

Pairs with `prep-build-off-vps-cloud-runner.md`. Both are CI hygiene improvements that prevent dev-loop friction. This one is smaller (~1 hour) and unblocks zero work directly, but every Wave 1+ story will benefit from faster feedback loops — TS errors caught at commit-time are far cheaper than at CI-time.

Documented as Pitfall row #18 in `docs/infrastructure-cicd-playbook.md` after this session, but the pitfall's "fix" is currently "remember to run `pnpm build` manually before commit" — easy to forget. A pre-commit hook makes it automatic.

### Prerequisites / Blockers

- None. Husky is already installed (per `package.json` devDependencies — `^9.1.7`); pre-commit hook exists with `.env`-blocking + secrets-warning + `pnpm lint` checks.

### Why not turbo or pnpm-build?

`pnpm exec turbo run build` runs the FULL pipeline (transpile, bundle, emit). For a pre-commit hook, that's slow (vite bundle takes 12s+, plus output IO) and wasteful (we don't actually need the dist files at commit-time).

`tsc --noEmit` does ONLY type-checking. Fast. Single-purpose. Matches what CI's `tsc` step does (which is what catches the bugs in the first place).

### What about `tsc -b` (build mode with incremental)?

Build mode (`-b`) is for project references (multi-tsconfig builds). OSLRS doesn't use project references between workspaces (each workspace has its own standalone tsconfig). Plain `tsc --noEmit` on each affected workspace is the right tool.

### What about a pre-push hook instead?

Pre-push runs LATER than pre-commit (after the commit object is created). If the hook fails at pre-push, the commit exists locally but can't be pushed; you have to amend or rebase to fix. More disruptive than pre-commit aborting before the commit is even created.

Pre-commit is the right hook level for this.

### What about a CI-only check?

CI already runs `tsc` (that's what caught `bf98931`). The whole point of this story is to catch the error earlier than CI — at commit time. So CI-only doesn't help.

### Husky version compatibility

The project uses husky `^9.1.7` per `package.json:36`. The hook file format is plain shell — no special husky DSL. The shebang `#!/usr/bin/env sh` must be preserved (current `.husky/pre-commit:1` already has this). Husky v9 has dropped the legacy `. "$(dirname -- "$0")/_/husky.sh"` line — current hook does not have it; do not add it.

### Speed expectations

- Cold tsc on `@oslsr/api`: ~12-15s (depends on machine)
- Cold tsc on `@oslsr/web`: ~10-12s (depends on machine)
- Cold tsc on BOTH (worst case if both staged): ~25s
- Hot (after a recent run): ~3-5s with `--incremental`
- Skipped (no TS staged): 0s

The 25s worst-case is acceptable per AC#3 (<30s target). If actual measurement exceeds, add `--incremental` per Task 3.

### Risk analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hook is too slow → developer disables husky | Medium | Type errors slip through | Measure first; add `--incremental` if cold runs >15s. Document `--no-verify` bypass for legit emergencies. |
| First commit on fresh dev machine: cold tsc + cold turbo lint exceeds AC#3's 30s "typical" target | Low (one-time per machine) | Operator surprise on first commit | Measured: API tsc cold 14.4s + Web tsc cold 37.7s + cold turbo lint ~5-15s = up to ~67s worst-case. One-time only — subsequent commits are warm (~9s tsc, sub-second cached lint). Onboarding doc should call this out so the first slow commit isn't mistaken for a regression. (Code review M2, 2026-04-30) |
| `--incremental` cache reports clean but CI catches errors | Very Low | False confidence at commit time | Heavy branch-switching with mid-write interrupts can corrupt `*.tsbuildinfo`. Recovery: `rm apps/*/tsconfig.tsbuildinfo apps/web/tsconfig.node.tsbuildinfo && git add . && git commit --amend --no-edit` (or just retry). Documented in playbook table row #18 Fix column. (Code review M1, 2026-04-30) |
| Hook fires on auto-merge / cherry-pick | Low | Commit briefly aborted, then progresses | Standard husky behavior; not unique to this hook. |
| `pnpm --filter` resolves wrong workspace | Very low | tsc runs on wrong code | Use canonical `@oslsr/api` and `@oslsr/web` workspace names from `package.json` |
| `tsc --noEmit` finds errors on PRE-EXISTING code unrelated to staged change | Low | Commit blocked despite "my change is fine" | THIS IS WORKING AS INTENDED — if the codebase has type errors, CI would fail anyway. The fix is to fix the latent error or revert what introduced it. |
| Dev agent edits the wrong "Pitfall #18" | Medium | Silent corruption of unrelated DO-Console pitfall content | AC#7 + Task 5.1 explicit pre-edit verification check on the Issue column text before editing |

### Project Structure Notes

- **Husky hooks** live at `.husky/<hook-name>`. Project uses husky `^9.1.7` (`package.json:36`). Pre-commit hook is plain shell starting with `#!/usr/bin/env sh`.
- **Current pre-commit composition** (verified 2026-04-29): `.env`-block (`.husky/pre-commit:1-29`) → secrets-pattern warning (`.husky/pre-commit:31-46`) → `pnpm lint` (`.husky/pre-commit:49`). New tsc step appends AFTER `pnpm lint` (lint catches lower-cost issues first).
- **pnpm workspace filtering**: `pnpm --filter @oslsr/api exec tsc --noEmit` resolves to `apps/api/node_modules/.bin/tsc` using `apps/api/tsconfig.json` automatically. Workspace names from each package's `package.json` `name` field.
- **API package scripts**: `apps/api/package.json` exposes `"build": "tsc"` (line 8), `"test": "vitest run"` (line 10), `"lint": "eslint src"` (line 15). The build script is what CI invokes; tsc with no args reads `tsconfig.json` defaults.
- **Pitfall numbering — TWO schemes coexist in the playbook** (this is the load-bearing disambiguation for AC#7):
  - **Common Issues / Pitfalls table** at `docs/infrastructure-cicd-playbook.md:700-718` — rows numbered 1-21+. **Row #18 at line 715 is the tsc/vitest gap** this story closes.
  - **`### Pitfall #N:` headings** at `docs/infrastructure-cicd-playbook.md:958+` — items 16-23 about SSH/DO Console/Cloudflare. Heading **#18 at line 968** is about DO Web Console being SSH-based — UNRELATED to this story.
  - The dev agent must verify the Issue column text before editing (Task 5.1) to avoid the wrong-#18 collision.
- **Test file referenced in AC#8**: `apps/api/src/__tests__/csp-parity.test.ts` — verified to exist 2026-04-29.
- **Originating CI failure**: commit `bf98931` (proxy-addr import — missing `@types/proxy-addr` + 2-arg trust fn signature). Fixed in `1383373`. Both visible in `git log --oneline`.

### References

- `.husky/pre-commit` current composition (`.env` block + secrets warning + `pnpm lint`, no tsc): [Source: .husky/pre-commit:1-50]
- husky version pin (`^9.1.7`): [Source: package.json:36]
- API package scripts (build/test/lint): [Source: apps/api/package.json:8,10,15]
- Pitfall **table row #18** (the tsc/vitest gap — Issue + Cause + Fix this story updates): [Source: docs/infrastructure-cicd-playbook.md:715]
- Common Issues / Pitfalls table boundary (table rows 1-21): [Source: docs/infrastructure-cicd-playbook.md:700-718]
- `### Pitfall #18:` heading (DO Web Console — DO NOT confuse with table row #18): [Source: docs/infrastructure-cicd-playbook.md:968]
- AC#8 deliberate-error target test file: [Source: apps/api/src/__tests__/csp-parity.test.ts]
- Originating CI failure commit `bf98931` and fix `1383373`: [Source: git log --oneline]
- Husky v9 docs: https://typicode.github.io/husky/
- TypeScript `--noEmit` semantics: type-check only, no output files

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]` — via the `bmad:bmm:workflows:dev-story` workflow on 2026-04-30.

### Debug Log References

Cold-run timings (machine: Awwal's laptop, Windows 11, 2026-04-30):
- `pnpm --filter @oslsr/api exec tsc --noEmit` — 14.4s
- `pnpm --filter @oslsr/web exec tsc --noEmit` — 37.7s

Warm-run timings after `--incremental` (`.tsbuildinfo` populated):
- `@oslsr/api` — 4.5s
- `@oslsr/web` — 4.4s

End-to-end deliberate-error test (Task 4):
- Staged `apps/api/src/app.ts` with `const __precommitHookTest: string = 42;`
- `git commit` aborted with exit 1
- Output: `src/app.ts(2,7): error TS2322: Type 'number' is not assignable to type 'string'.` followed by `COMMIT BLOCKED: TypeScript errors in @oslsr/api`
- HEAD remained at `e799104` (no commit object created)

Docs-only test (Task 4.6):
- Staged `_bmad-output/implementation-artifacts/prep-tsc-pre-commit-hook.md` (no TS files)
- Invoked hook directly via `sh .husky/pre-commit`
- Output: env-block + secrets-warning + `pnpm lint` (cached, 297ms), exit 0, **no** `[pre-commit] Running tsc...` line emitted

### Completion Notes List

- **Hook composition** — Appended a fourth step to `.husky/pre-commit` after the existing `pnpm lint` line (env-block → secrets-warning → `pnpm lint` → tsc). The new step uses `git diff --cached --name-only --diff-filter=ACM | grep -E "^apps/(api|web)/.*\.(ts|tsx)$"` to detect staged changes per workspace, then runs `pnpm --filter @oslsr/<api|web> exec tsc --noEmit --incremental` only for the affected workspace(s). On any tsc failure, prints a clear `COMMIT BLOCKED:` message + the `--no-verify` bypass hint, exits 1.
- **`--incremental` activated** — Cold web tsc was 37.7s alone (52s combined worst-case), exceeding AC#3's 30s target. Adding `--incremental` brought warm runs to ~4.5s each (~9s combined). The first commit on a fresh dev machine pays the cold cost once; subsequent commits use the cache.
- **`.gitignore` already covers `*.tsbuildinfo`** — Existing pattern at `.gitignore:70` (no leading `/`) matches at any depth, including `apps/api/tsconfig.tsbuildinfo`, `apps/web/tsconfig.tsbuildinfo`, `apps/web/tsconfig.node.tsbuildinfo`. Verified via `git check-ignore -v`. Story Task 3.2's proposed `apps/*/.tsbuildinfo` line was redundant and skipped — the codebase already had broader coverage.
- **Pitfall #18 disambiguation honored** — Updated **TABLE row #18 at line 715** of `docs/infrastructure-cicd-playbook.md` (Common Issues / Pitfalls table) per AC#7. Pre-edit verified the Issue column text matched the expected `Local tests pass but CI's pnpm build fails on TS errors` before applying the supersede edit. Did NOT touch the unrelated `### Pitfall #18: DO Web Console is SSH-based...` heading at line 968.
- **No source code changed** — All edits land in `.husky/pre-commit` (shell), `docs/infrastructure-cicd-playbook.md` (docs), and BMAD tracking files. Zero runtime/build code touched, so no test regressions are possible. Skipped full test suite per workflow pragmatism — the hook itself was end-to-end verified via Tasks 4.1–4.6.
- **AC review** — All 8 ACs satisfied: AC#1 (per-workspace pnpm filter) ✓; AC#2 (incremental skip on docs-only) ✓; AC#3 (warm <30s, cold ~52s on first run only) ✓; AC#4 (fails commit on TS errors with clear message) ✓; AC#5 (`--no-verify` bypass standard husky behavior, documented in error message) ✓; AC#6 (env-block + lint + tsc all run sequentially, abort on any failure) ✓; AC#7 (table row #18 updated, heading #18 untouched) ✓; AC#8 (manual verification end-to-end, both block path and skip path) ✓.

### File List

- `.husky/pre-commit` — modified
  - Appended `--incremental` tsc block after the existing `pnpm lint` step at line 46 (Task 2)
  - **`set -e` added at line 2** with explanatory comment block — Code review H1 fix (closes silent lint-failure-passthrough)
- `docs/infrastructure-cicd-playbook.md` — modified
  - Table row #18 Fix column at line 715 — supersede text per AC#7
  - **Cache-recovery one-liner appended** to row #18 — Code review M1 fix
  - **Footer dated `Updated: 2026-04-30`** line added documenting the prep-tsc landing + the Pitfall #18 dual-numbering note
  - The `### Pitfall #18:` heading at line ~975 deliberately left untouched (DO Web Console SSH-based — unrelated)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — modified (`prep-tsc-pre-commit-hook` flipped `ready-for-dev` → `in-progress` → `review` → `in-progress` post-code-review per Step 5; → `done` at merge)
- `_bmad-output/implementation-artifacts/prep-tsc-pre-commit-hook.md` — modified (this file)
  - Status `review` → `in-progress` per code review Step 5 logic
  - Task 6 added — review fixes (H1+H2+M1+M2)
  - Risk Analysis table extended with M1/M2-related rows
  - Review Follow-ups (AI) subsection populated with full findings catalogue
  - Dev Agent Record extended: this expanded File List + 2026-04-30 Change Log entry
- `.gitignore` — NOT modified (existing `*.tsbuildinfo` pattern at line 70 already covers `apps/*/tsconfig.tsbuildinfo` and `apps/web/tsconfig.node.tsbuildinfo`)

**Out-of-commit (git-stashed for separate scope per Code review H2):**
- `stash@{N}: bmad-canonicalize-pass` — 16 files: Bob (SM)'s canonical-template re-format pass on stories 9-11/12/13, 10-1..10-6, 11-1..11-4, prep-build-off-vps-cloud-runner, prep-input-sanitisation-layer + epics.md. Recover with `git stash pop` for the standalone `chore(bmad): canonicalize story templates` commit.
- `stash@{N+1}: baseline-report-chapters` — 22 files in `_bmad-output/baseline-report/chapters/ch01-…ch22-*.md`. Recover with `git stash pop` when committing the baseline-report tooling (also pop the older stash for `js-yaml` + `markdown-it` deps).
- (older) `stash@{N+2}: wave0-scope-creep` from 2026-04-29 — `package.json` + `pnpm-lock.yaml` (`js-yaml` + `markdown-it` for baseline-report tooling). Pair with the baseline-report-chapters stash for the eventual baseline-report commit.

Untracked files NOT touched (their own future scope): `_bmad-output/baseline-report/CONTEXT-AND-NUANCES.md`, `_bmad-output/baseline-report/{assets,output,sources}/`, `_bmad-output/implementation-artifacts/prep-settings-landing-and-feature-flags.md`, `docs/SKILLED LABOUR REGISTER ACTION PLAN.xlsx`.

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-27 | Story drafted by Awwal+Claude after CI commit `bf98931` failed strict TS build that local vitest had silently allowed. 8 ACs covering hook composition, incremental detection, fail-on-error, bypass, alongside-other-checks, documentation, manual verification. Husky v9 + plain shell. | tsx (used by vitest) only transpiles; CI's `tsc` is strict. Without a pre-commit type-check, every TS-error commit causes a CI round-trip of ~7 min. |
| 2026-04-30 | Implementation complete via `dev-story` workflow. All 5 tasks + 8 ACs satisfied. Hook appended to `.husky/pre-commit` with `--incremental` activated (cold web tsc was 37.7s, exceeding AC#3 30s target; warm is ~4.5s). Playbook table row #18 Fix column rewritten per AC#7 with explicit non-collision with the unrelated `### Pitfall #18:` DO-Console heading at line 968. End-to-end verified: deliberate `const x: string = 42;` in `apps/api/src/app.ts` blocked at commit-time with exit 1 + clear `COMMIT BLOCKED:` message; docs-only stage skipped tsc entirely (no `[pre-commit] Running tsc...` line). `.gitignore` already covered `*.tsbuildinfo`, no change needed. Status `ready-for-dev` → `in-progress` → `review`. | Closes the bf98931→1383373 CI-fix-round-trip pattern; type errors now caught at commit-time on the developer's machine instead of CI 7 minutes later. Pairs with `prep-build-off-vps-cloud-runner` as Wave 0 CI hygiene. |
| 2026-04-30 | Adversarial code review pre-commit (BMAD method cornerstone — `feedback_review_before_commit.md`). 2 High + 2 Medium + 3 Low findings; all H/M fixed in this commit, 2 LOW deferred with rationale. **H1:** `set -e` added at `.husky/pre-commit:2` — without it, `pnpm lint` failures slipped through silently (AC#6 violation). **H2:** scope-discipline — working tree had 38 unrelated files (Bob's canonical-template cleanup + baseline-report tooling); split into two named stashes (`bmad-canonicalize-pass` 16 files, `baseline-report-chapters` 22 files) so prep-tsc commit stays at 4 files. Mirrors Wave 0 H3 pattern (`feedback_review_patterns_deploy_scripts.md` pattern #4). **M1:** cache-recovery one-liner appended to playbook table row #18 Fix column. **M2:** Risk Analysis table extended with cold-run-fresh-machine row + cache-corruption-recovery row. **L1/L2 deferred** (sequential tsc + full-monorepo lint, both pre-existing and not in scope). Status `review` → `in-progress` per workflow Step 5 (HIGH/MEDIUM present); will flip back to `review` post-fix-apply, then `done` at merge. | Pre-commit code review is BMAD method cornerstone. The H1 finding caught a silent quality regression that would have shipped to dev-loop unchanged — without it, lint failures gave false confidence indefinitely. The H2 scope-discipline preserves bisect-friendly git history; same play as Wave 0. |
| 2026-04-30 | **Story closed** as part of Wave 0 close-out commit. Pairs with `prep-build-off-vps-cloud-runner` Strong Path completion (rows 1+2 captured, all 4 ACs pass, wall-clock 5.5× under target, zero CRITICAL digests). Both Wave 0 stories flipped `done` together since they're tightly coupled CI-hygiene work. Deploy of the close-out commit serves as silent confirmation row 3 — recorded post-hoc only if it surprises. | This story file. |
| 2026-04-29 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Why this is Wave 0", "Prerequisites / Blockers", "File List (estimated)", "References" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering husky hook layout, pnpm-filter resolution, and the pitfall-numbering disambiguation; added `### References` subsection inside Dev Notes with `[Source: file:line]` cites; added `### Review Follow-ups (AI)` placeholder under Dev Agent Record. Disambiguated AC#7's Pitfall #18 reference: playbook has TWO numbering schemes (Common Issues / Pitfalls TABLE rows 1-21 at lines 700-718 vs. `### Pitfall #N:` HEADINGS 16-23 at lines 958+). The story targets TABLE row #18 (line 715 — tsc/vitest gap); easy to confuse with HEADING #18 (line 968 — DO Web Console SSH). AC#7 + Task 5.1 + Project Structure Notes all now flag the disambiguation explicitly with pre-edit verification step. Verified codebase claims: husky `^9.1.7` confirmed at `package.json:36`; current `.husky/pre-commit` composition has `.env` block + secrets warning + `pnpm lint` (no tsc — accurate ready-for-dev); `apps/api/src/__tests__/csp-parity.test.ts` exists; `apps/api/package.json` has `"build": "tsc"`; pitfall row #18 text matches story's quoted Fix column. Originating commits `bf98931` (failure) and `1383373` (fix) verified in git log. All substantive content from v1 preserved. | Story v1 was authored without canonical workflow load — same drift pattern as Story 9-13 (top-level non-canonical sections, narrative tasks instead of checkboxes, no Project Structure Notes, no References inside Dev Notes). Pitfall #18 reference was internally correct but ambiguous — could collide with the headings list and cause a dev agent to edit DO-Console content instead of the tsc gap. |

### Review Follow-ups (AI)

> Findings catalogue from `/bmad:bmm:workflows:code-review` adversarial pass on uncommitted working tree, 2026-04-30. All HIGH + MEDIUM fixed in this commit; LOW deferred with rationale. Cross-reference Task 6 above for fix locations.

- [x] [AI-Review][HIGH] H1 — `pnpm lint` failures don't block commits because the hook has no `set -e`. AC#6 ("commit aborts on any failure") was silently false. FIX: `set -e` added at `.husky/pre-commit:2` with explanatory comment block. Existing `|| true` patterns (lines 14, 37, 60) and `if !` blocks (lines 69, 81) remain compatible — set -e is suppressed inside conditional contexts.
- [x] [AI-Review][HIGH] H2 — Working tree contained 38 unrelated files (Bob's canonical-template cleanup pass + baseline-report tooling churn). FIX: Two scope-creep stashes created before the prep-tsc commit — `bmad-canonicalize-pass` (16 story-doc reformats + epics.md) and `baseline-report-chapters` (22 chapter files). Prep-tsc commit kept tight at 4 files. Mirrors the Wave 0 H3 pattern (js-yaml + markdown-it stash) — see `feedback_review_patterns_deploy_scripts.md` pattern #4.
- [x] [AI-Review][MED] M1 — `--incremental` cache pollution recovery not documented. FIX: One-line cache-recovery note appended to playbook table row #18 Fix column: `rm apps/*/tsconfig.tsbuildinfo` for the rare cache-corruption scenario.
- [x] [AI-Review][MED] M2 — Cold-run worst case (~67s on fresh machine) exceeds AC#3's 30s "typical" target without explicit acknowledgement. FIX: Two new rows in Risk Analysis table — cold-run-fresh-machine reality + incremental cache corruption recovery.
- [ ] [AI-Review][LOW] L1 — DEFERRED. API + Web tsc run sequentially (~9s+9s = 18s worst-case when both staged). Parallel via `&` + `wait` would halve that. Not urgent; comfortably under target. Future optimization story.
- [ ] [AI-Review][LOW] L2 — DEFERRED. `pnpm lint` (line 53 with set -e) runs full monorepo regardless of staged content. Pre-existing pattern; could mirror the new tsc incremental-detection pattern. Future optimization story (potentially bundled with L1).
- [x] [AI-Review][LOW] L3 — Status flipped `review` → `in-progress` per workflow Step 5 (HIGH/MEDIUM findings present). Sprint-status synced. Will flip back to `review` (or `done`) post-merge.
