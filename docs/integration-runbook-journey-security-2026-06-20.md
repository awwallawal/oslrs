# Integration Runbook — merge `journey` + `security-r2` into `main`

**Prepared:** 2026-06-20 (SM/Bob, verified against live branch state) · **Base:** `main` @ `fdbb33f` (9-60 realtime hotfix)
**Status:** PRE-MERGE PLANNING — nothing merged yet. This is the verified order + conflict resolutions so the eventual integration is mechanical.

> ⚠️ This runbook was authored by inspecting branch state read-only. Branch tips move as the CLIs work — re-run the "State check" before acting.

---

## 0. State check (re-run before merging)

```bash
cd /c/Users/DELL/Desktop/oslrs
git fetch --all 2>/dev/null
git worktree list
git log --oneline main..track/journey-9-39-40-21
git log --oneline main..track/security-r2-41-45
git -C ../oslrs-journey  status -sb   # must be clean
git -C ../oslrs-security status -sb    # must be clean (9-45 committed)
```

## 1. Verified state (as of 2026-06-20)

| Track | Branch | Tip | Stories | Mergeable? |
|---|---|---|---|---|
| **Journey** | `track/journey-9-39-40-21` | `773c1d5` | 9-21, 9-39, 9-40 **done**; 9-60 (registration-edit) **done + committed**, HOLD lifted | YES — after the **9-60→9-61 renumber** (§3) + conflict resolutions (§4). Handoff: `oslrs-journey/HANDOFF.md` |
| **Security R2** | `track/security-r2-41-45` | `ced033d` | 9-41/43/44/45 **all done + committed**; tree clean (only the untracked handoff) | YES — **after the journey merge** + the **NODE_ENV deploy gate (§5)**. 16 commits / 74 files. Handoff: `oslrs-security/MERGE-HANDOFF-…md` (untracked, do NOT merge it) |

> **Both handoffs independently agree: journey first, then security.** Verified conflict surface confirms it — see §4.

**Merge order: journey FIRST, then security.** Why (verified):
1. **Journey owns the only structural conflicts with `main`** — `apps/web/src/App.tsx` (route-tree extraction + new routes) and `vitest.base.ts` (worker-cap rewrite). Security touches **neither**.
2. **Security is purely additive** — its sole overlap with journey is `sprint-status.yaml`; it has **zero** structural conflict with `main`. Rebasing the additive branch onto the structural one is always easier than the reverse.
3. **Journey carries a merge prerequisite** security doesn't: the 9-60 number collision (§3).

## 2. Prerequisites (do these BEFORE merging the respective branch)

- **Journey:** run the **9-60→9-61 renumber** (§3) on `track/journey-9-39-40-21`, commit it, then merge. Also satisfy the journey HANDOFF's "operator app-run gate" (manual smoke).
- **Security:** ✅ DONE — 9-45 committed (`ced033d`); tree clean. **The hard precondition is now operational, not code:** the **`NODE_ENV=production` deploy gate (§5)** must be satisfied on the VPS *before* the deploy job runs, or prod boots-crash (9-45/F-005 fail-closed). Use **rebase-merge** to preserve the per-finding audit trail; beware the §5 git-bisect quirk.

## 3. Journey 9-60 → 9-61 renumber (collision with `main`'s realtime 9-60)

`main` already owns **9-60** = `9-60-realtime-reconnect-and-errorboundary-hotfix` (pushed, `fdbb33f`). Journey independently authored **9-60** = `authenticated-registration-edit-and-session-resume`. The journey one must become **9-61** (verified free across all refs).

**Run in the JOURNEY worktree, on `track/journey-9-39-40-21`, with a CLEAN tree.** It renames the story file and replaces story-tag references in an explicit allowlist only (no repo-wide sed → SVG/coordinate `9.60` strings are never touched). Review `git diff` before committing.

```bash
cd /c/Users/DELL/Desktop/oslrs-journey
test -z "$(git status --porcelain)" || { echo "TREE NOT CLEAN — stash/commit first"; exit 1; }

# 1) rename the story file (history-preserving)
git mv _bmad-output/implementation-artifacts/9-60-authenticated-registration-edit-and-session-resume.md \
       _bmad-output/implementation-artifacts/9-61-authenticated-registration-edit-and-session-resume.md

# 2a) DOC files — replace both hyphen (9-60) and dot (9.60, used in the story H1) story forms
DOCS=(
  _bmad-output/implementation-artifacts/9-61-authenticated-registration-edit-and-session-resume.md
  _bmad-output/implementation-artifacts/9-40-public-dashboard-registration-status-home.md
  _bmad-output/implementation-artifacts/sprint-status.yaml
  _bmad-output/planning-artifacts/epics.md
  HANDOFF.md
)
for f in "${DOCS[@]}"; do
  sed -i -E 's/\b9-60\b/9-61/g; s/\bStory 9\.60\b/Story 9.61/g' "$f"
done

# 2b) CODE files — hyphen story-tag form only (these use "Story 9-60"; no decimals)
CODE=(
  apps/api/src/controllers/me.controller.ts
  apps/api/src/controllers/registration.controller.ts
  apps/api/src/routes/me.routes.ts
  apps/api/src/routes/__tests__/me.routes.test.ts
  apps/api/src/services/me.service.ts
  apps/api/src/services/__tests__/me.service.test.ts
  apps/api/src/services/audit.service.ts
  apps/api/src/validation/registration.schema.ts
  apps/web/src/App.tsx
  apps/web/src/__tests__/known-routes.ts
  apps/web/src/features/dashboard/pages/PublicUserHome.tsx
  apps/web/src/features/dashboard/pages/__tests__/PublicUserHome.test.tsx
  apps/web/src/features/registration/api/wizard.api.ts
  apps/web/src/features/registration/hooks/useWizardDraft.ts
  apps/web/src/features/registration/pages/WizardPage.tsx
  apps/web/src/features/registration/pages/__tests__/WizardPage.test.tsx
)
for f in "${CODE[@]}"; do
  sed -i -E 's/\b9-60\b/9-61/g' "$f"
done

# 3) verify — should print NOTHING from story-context files (coordinate 9.60 in SVGs is expected + untouched)
echo "=== stray hyphen 9-60 in allowlist (must be empty) ==="
git grep -nE '\b9-60\b' -- "${DOCS[@]}" "${CODE[@]}" || echo "(clean)"
echo "=== sanity: story file renamed + key updated ==="
ls _bmad-output/implementation-artifacts/9-61-authenticated-*.md
grep -n '9-61-authenticated' _bmad-output/implementation-artifacts/sprint-status.yaml
git status --short

# 4) eyeball `git diff`, then commit
# git commit -am "chore(9-61): renumber registration-edit story 9-60→9-61 (collision with realtime 9-60 on main)"
```

**Note:** the realtime 9-60 on `main` uses tokens like `reconnect`/`errorboundary` — the allowlist contains none of those files, so there is zero chance of touching it. After this lands, `main` will have **9-60 = realtime hotfix** and **9-61 = registration-edit**, no collision.

## 4. Conflict map + resolutions (journey → `main`)

### 4a. `apps/web/src/App.tsx` — STRUCTURAL (not a line conflict)
- **`main` (9-60):** wraps the inline `<Routes>` with `<RouteErrorBoundary>` inside `App()`, and adds `import { RouteErrorBoundary } from './components/RouteErrorBoundary'`.
- **journey:** extracts the whole route tree into a new exported `export function AppRoutes()`; `App()` now renders `<AppRoutes />`. (Done so the 9-21 `route-resolution.integration.test` can mount the *same* tree in a MemoryRouter.)

**Resolution — take journey's structure, then re-apply main's boundary by wrapping `<AppRoutes/>`:**
```tsx
// keep main's import:
import { RouteErrorBoundary } from './components/RouteErrorBoundary';

function App() {
  return (
    <ErrorBoundary fallbackProps={{ title: 'Application Error', /* … */ }}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ /* … */ }}>
          <ScrollToTop />
          <AuthProvider>
            <RouteErrorBoundary>      {/* ← main 9-60: route-scoped self-heal */}
              <AppRoutes />            {/* ← journey: extracted route tree */}
            </RouteErrorBoundary>
            <ReAuthModal />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
      <Toaster /* … */ />
    </ErrorBoundary>
  );
}

export function AppRoutes() {          // journey — PURE route tree, NO boundary
  return <Routes>{/* … */}</Routes>;
}
```
**Why wrap `<AppRoutes/>` and NOT put the boundary inside `AppRoutes`:** the 9-21 test mounts `AppRoutes` directly. Keeping the boundary out of `AppRoutes` means a throwing route surfaces as a **test failure** (the 9-21 guard's whole point), not a swallowed "Page Error". Production still gets the self-heal because `App()` wraps it. Both stories' intent preserved.

### 4b. `vitest.base.ts` — take JOURNEY's version (strict superset)
- **`main`:** `const maxWorkers = VITEST_MAX_THREADS ? Math.max(1, Number(…)) : undefined` (cap only when env set).
- **journey:** `const explicitCap = …; const maxWorkers = explicitCap ?? (process.env.CI ? undefined : 2)` (off-CI default cap of 2; explicit env still wins; CI stays full-parallel).

**Resolution: keep journey's** — it preserves the env override AND adds the off-CI default that ends the local oversubscription flake (Pitfall #37). No behavior lost vs `main`.

### 4c. `_bmad-output/implementation-artifacts/sprint-status.yaml` — UNION
Three editors: `main` (9-60 realtime added), journey (9-21/39/40 done + 9-61 entries), security (41/43/44/45). Conflicts are line-adjacent, not semantic — **keep every story's line**. After both merges, confirm one entry each for 9-21/39/40/41/43/44/45/60(realtime)/61(reg-edit), no dupes.

### 4d. Security → `main` (after journey lands)
- **`apps/web/src/hooks/useRealtimeConnection.ts` — SAME FILE as main's 9-60, different regions → expect AUTO-MERGE, but VERIFY.** Security's change is the **F-003 fix in `getSocketUrl()` (top, ~line 13** — makes the `localhost:3000` literal dev-only/tree-shaken). Main's 9-60 rewrote the **hook body (~line 28+** — reconnect cap, `reconnect_failed`, focus re-arm). Non-overlapping, so git 3-way merges cleanly. **After merge, grep the file for BOTH `import.meta.env.DEV` (F-003) AND `reconnect_failed`/`MAX_RECONNECTION_ATTEMPTS` (9-60) — never resolve this with `-X ours/theirs`, which would silently drop one fix.**
- **`sprint-status.yaml` + `epics.md`** — union (as 4c). 9-60(realtime) stays; 9-61(reg-edit) from journey; add 9-41/43/44/45.
- **`.env.example`, `.github/workflows/ci-cd.yml`, `infra/nginx/oslsr.conf`, `apps/api/src/app.ts`** — security-only; `main` did not touch them since merge-base → **clean apply**.
- **No other overlap** with journey (verified: journey∩security = `sprint-status.yaml` only). 9-41 reveal UX and 9-40 consent toggle do NOT share a component.

### 4e. Security merge mechanics (from its handoff)
- **Use `rebase-merge`, not squash** — the history is one-commit-per-finding (audit trail for the R2 register). Squash loses traceability.
- **git-bisect quirk at `e53c735` (9-43/F-009):** F-009 and F-013 co-edit `exportRespondents`; the controller test rides in F-013's commit (`c3eaeff`), so `e53c735` fails the *export test* in isolation — an artifact of the per-finding split, **not a regression** (`tsc`+`eslint` pass at every commit; tip is green). If you bisect this range, gate on build/tsc or start from `c3eaeff`.

## 5. ⚠️ SECURITY DEPLOY GATE — set BEFORE the deploy job hits prod (HARD precondition)
9-45/F-005 makes the API **fail-closed**: an unset `NODE_ENV` now `process.exit(1)`. Prod was last verified (2026-06-06) running with `NODE_ENV` **unset** → **deploying security without setting it first = boot crash / outage.**
1. **On the VPS, BEFORE the security deploy runs:** set `NODE_ENV=production` (and confirm `REDIS_URL=…`) in the PM2/`.env` environment. (Operator side of finding F-026, tracked in Story 9-9.)
2. **nginx (`infra/nginx/oslsr.conf`, F-002)** ships via the CI deploy path (backup → `nginx -t` → reload); never hand-edit the VPS copy. **After reload, verify:** `/api` responses carry **no** `X-Proxy-Upstream` and are **not** double-stamped with the static-app CSP/HSTS (Helmet owns API headers).
3. **DB migration (9-41):** new nullable cols `contact_reveals.purpose` + `tos_accepted_at` via `migrate-reveal-purpose-init.ts` — already wired into `ci-cd.yml` (`ADD COLUMN IF NOT EXISTS`); no manual step, but a schema change ships.
4. **New optional env:** `REVEAL_*` tunables in `.env.example` (anomaly-shaped defaults; nothing required).

## 6. Gate sequence (per merge)
1. Resolve conflicts → `pnpm lint` + build + **full** `pnpm test` locally (journey's off-CI cap makes this deterministic).
2. Push to `main`; let the **pre-push gate** (turbo build + capped suite) finish — do NOT cancel (`feedback_space_pushes_to_main`).
3. Confirm GitHub CI green incl. **real-DB integration tests** (journey's `me.service` `updateMarketplaceConsent` + 9-60/9-61 NIN-edit paths, and security's export/upload/access-control tests) + `lint-and-build` + prod deploy.
4. Only then start the second merge.

## 7. Post-merge smoke (after BOTH land)
- Logged-out header: **Sign in + Register**; `/login` magic-link-primary (journey 9-39).
- `public_user` dashboard shows **real** registration state + in-session edit at `registration/manage` (journey 9-40/9-61); marketplace consent toggle persists.
- Post-login renders without white screen; dashboard left open settles to degraded/polling, no dev-server peg (main 9-60 realtime — operator gate M1).
- Marketplace reveal step-up + purpose UX; bounded/streamed CSV export; upload magic-byte validation; access-control boot hardening (security 9-41/43/44/45).

## 8. Open items
- **Journey 9-40 M1/M2 / L1/L2** — endorsed-for-launch deviations (magic-link re-entry vs session wizard; consent-toggle vs full edit; slug vs LGA-name). Documented in the 9-40 story; not blockers.
- **Main 9-60 (realtime) M1** — white-screen efficacy is an operator-repro gate (capture the console stack); socket-storm fix is independent + verified.
