# Prep Story: `tsc --noEmit` Pre-Commit Hook (Wave 0)

Status: ready-for-dev

<!-- Created 2026-04-27 by Awwal+Claude after CI commit `bf98931` failed strict TS build that local vitest had silently allowed. tsx (used by vitest) only transpiles; CI's `tsc` is strict. Without a pre-commit type-check, every TS-error commit causes a CI round-trip of ~7 min. -->

## Story

As a **developer**,
I want **`tsc --noEmit` to run on commit when I touch TypeScript files in `apps/api` or `apps/web`**,
so that **strict type errors that vitest's `tsx` transpile-only mode silently allows are caught locally before push, eliminating the failed-CI-build round-trip pattern that consumed two extra commits in this session (`bf98931` failure → `1383373` CI fix)**.

## Why this is Wave 0

Pairs with `prep-build-off-vps-cloud-runner.md`. Both are CI hygiene improvements that prevent dev-loop friction. This one is smaller (~1 hour) and unblocks zero work, but every Wave 1+ story will benefit from faster feedback loops — TS errors caught at commit-time are far cheaper than at CI-time.

Documented as Pitfall #18 in `docs/infrastructure-cicd-playbook.md` after this session, but the pitfall's "fix" is currently "remember to run `pnpm build` manually before commit" — easy to forget. A pre-commit hook makes it automatic.

## Acceptance Criteria

1. **AC#1 — Husky pre-commit hook runs `tsc --noEmit` per affected workspace:** When commit includes staged `.ts` or `.tsx` files under `apps/api/src/` or `apps/api/scripts/`, the hook runs `pnpm --filter @oslsr/api exec tsc --noEmit`. Same for `apps/web/src/` → `pnpm --filter @oslsr/web exec tsc --noEmit`.

2. **AC#2 — Hook is INCREMENTAL:** Skipped entirely when no staged files match `apps/(api|web)/.*\.(ts|tsx)$`. A docs-only or YAML-only commit does NOT trigger tsc. Detection via `git diff --cached --name-only --diff-filter=ACM`.

3. **AC#3 — Hook is FAST:** Adds <30 seconds to typical commit times. Achieved by:
   - Only running `tsc --noEmit` (no transpile, no emit)
   - Only running on workspaces with staged changes (incremental)
   - Optional: `--incremental` flag on tsc to cache type-check state in `.tsbuildinfo`

4. **AC#4 — Hook FAILS commit on type errors:** If `tsc --noEmit` exits non-zero, the pre-commit hook exits non-zero, which aborts the commit. The actual TS error messages from tsc are printed clearly in the terminal so the developer can fix and retry.

5. **AC#5 — Hook can be bypassed with `--no-verify` for emergencies:** Standard husky behavior — `git commit --no-verify` skips ALL pre-commit hooks. No special handling needed; document in the playbook.

6. **AC#6 — Hook runs ALONGSIDE existing pre-commit checks:** The hook does not replace the existing `.env`-blocking check or the existing lint-via-turbo check. All three (env-block + lint + new tsc) run sequentially; commit aborts on any failure.

7. **AC#7 — Documentation:**
   - `docs/infrastructure-cicd-playbook.md` Pitfall #18 row gets a "FIX SHIPPED" note pointing to this story.
   - The "fix" column in Pitfall #18 is updated from "Always run `pnpm --filter @oslsr/api build && pnpm --filter @oslsr/web build` before commit when touching `.ts` files" → "(superseded) Pre-commit hook now runs `tsc --noEmit` automatically on TS file changes — see `.husky/pre-commit`."

8. **AC#8 — Verified manually:** Introduce a deliberate TS error in `apps/api/src/__tests__/csp-parity.test.ts` (e.g., assign a number to a string variable). Stage. Attempt commit. Confirm:
   - Hook runs and prints the TS error
   - Commit is aborted (no commit object created)
   - After reverting the deliberate error, commit proceeds normally

## Prerequisites / Blockers

- None. Husky is already installed (per `package.json` devDependencies); pre-commit hook exists with `.env`-blocking + lint checks.

## Tasks / Subtasks

### Task 1 — Inspect current `.husky/pre-commit` (AC#6 baseline)

1.1. Read full content of `.husky/pre-commit`. Identify the structure of the existing checks (.env block, lint).
1.2. Note the order: this story adds tsc as a NEW step AFTER lint (rationale: lint catches lower-cost issues first).

### Task 2 — Add tsc step to `.husky/pre-commit` (AC#1, AC#2, AC#3, AC#4)

2.1. After the existing lint step, add:
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
2.2. Note: `pnpm --filter @oslsr/X exec tsc --noEmit` automatically uses the workspace's `tsconfig.json` — no `-p` flag needed. The workspace's tsc binary comes from its `node_modules/.bin/tsc` via pnpm's resolution.

### Task 3 — (Optional, only if Task 2 is slow) Add `--incremental` (AC#3)

3.1. If `tsc --noEmit` runs slower than 15s on either workspace, add `--incremental` to both invocations:
   - `pnpm --filter @oslsr/api exec tsc --noEmit --incremental`
   - `pnpm --filter @oslsr/web exec tsc --noEmit --incremental`
3.2. Add to root `.gitignore`:
   ```
   # tsc --incremental cache (used by pre-commit hook)
   apps/*/.tsbuildinfo
   ```
3.3. Note: incremental adds a ~10MB file but cuts subsequent runs to ~3-5s. Worth it if base is slow.

### Task 4 — Verification (AC#8)

4.1. Introduce deliberate error: in `apps/api/src/app.ts`, add a line `const x: string = 42;` (number assigned to string).
4.2. Stage: `git add apps/api/src/app.ts`.
4.3. Commit: `git commit -m "test: deliberate TS error"`.
4.4. Confirm:
   - Hook runs (`[pre-commit] Running tsc --noEmit on @oslsr/api...`)
   - tsc prints `Type 'number' is not assignable to type 'string'.`
   - Hook prints `COMMIT BLOCKED: TypeScript errors in @oslsr/api`
   - Exit code non-zero — `git log -1` shows the commit was NOT created
4.5. Revert: `git checkout apps/api/src/app.ts`. Stage a tiny harmless change instead. Commit succeeds.
4.6. Confirm a docs-only commit: edit `README.md`, `git add README.md`, `git commit`. Hook should SKIP the tsc step entirely (no TS files staged) — print no `[pre-commit] Running tsc...` line.

### Task 5 — Documentation (AC#7)

5.1. Update `docs/infrastructure-cicd-playbook.md` Pitfall #18:
   - Add "(superseded by `.husky/pre-commit` 2026-04-27)" to the Fix column
   - The Fix text becomes: "Pre-commit hook now runs `tsc --noEmit` automatically on staged `.ts`/`.tsx` changes in `apps/(api|web)/`. See `.husky/pre-commit`. Bypass with `git commit --no-verify` if needed."
5.2. Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `prep-tsc-pre-commit-hook` from `ready-for-dev` → `done` after merge.

## Dev Notes

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

The project uses husky v9 per `package.json`. The hook file format is plain shell — no special husky DSL. The shebang `#!/usr/bin/env sh` must be preserved (some husky-managed hooks have a `. "$(dirname -- "$0")/_/husky.sh"` line at the top — preserve that if it exists, or skip if husky v9 has dropped it).

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
| Hook is too slow → developer disables husky | Medium | Type errors slip through | Measure first; add --incremental if cold runs >15s. Document `--no-verify` bypass for legit emergencies. |
| Hook fires on auto-merge / cherry-pick | Low | Commit briefly aborted, then progresses | Standard husky behavior; not unique to this hook. |
| `pnpm --filter` resolves wrong workspace | Very low | tsc runs on wrong code | Use canonical `@oslsr/api` and `@oslsr/web` workspace names from package.json |
| `tsc --noEmit` finds errors on PRE-EXISTING code unrelated to staged change | Low | Commit blocked despite "my change is fine" | THIS IS WORKING AS INTENDED — if the codebase has type errors, CI would fail anyway. The fix is to fix the latent error or revert what introduced it. |

## File List (estimated)

- `.husky/pre-commit` — modified (new tsc block added after lint)
- `docs/infrastructure-cicd-playbook.md` — modified (Pitfall #18 row Fix column)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — modified (status flip + entry)
- `.gitignore` — possibly modified (only if --incremental added per Task 3)

## References

- Originating evidence: this session 2026-04-27 — commit `bf98931` failed CI's strict tsc; commit `1383373` was the fix. Local vitest had run green on both `bf98931`'s code.
- Husky v9 docs: https://typicode.github.io/husky/
- TypeScript `--noEmit` semantics: type-check only, no output files

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

### File List
