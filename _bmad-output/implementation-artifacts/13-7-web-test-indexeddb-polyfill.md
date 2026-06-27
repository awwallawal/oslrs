# Story 13.7: Web-test IndexedDB polyfill — kill the non-deterministic CI unhandled-rejection that blocks deploys

Status: done

<!-- Authored 2026-06-27 by Bob (SM) via canonical *create-story, grounded in a verified code recon (this session). Emergent from the 13-1 deploy: a flaky IndexedDB unhandled rejection blocked CI test-web (passed on re-run). 🚦 launch-deploy-reliability — de-risks every launch-week deploy. PM (John): pure test-infra, NO PRD/requirement/roadmap-scope change. -->

## Story

As the **operator shipping daily during launch week**,
I want **the web test suite to provide a global IndexedDB polyfill so no test throws a non-deterministic `MissingAPIError` unhandled rejection**,
so that **CI `test-web` stops failing at random and blocking deploys — including the launch-critical pushes between now and go-live.**

## Context & Root Cause (verified 2026-06-27)

The 13-1 deploy was blocked by a **non-deterministic** CI failure: **all 2716 web tests PASSED**, but a stray unhandled rejection — `MissingAPIError: IndexedDB API missing` — surfaced from `apps/web/src/__tests__/route-resolution.integration.test.tsx` (it renders WizardPage → `useWizardDraft` → IndexedDB, absent under jsdom). It passed on re-run, confirming it's a race between the async IndexedDB access and test teardown, not a real regression.

Verified facts:
- `fake-indexeddb@^6.2.5` **is already installed** but imported in **exactly one test**: `apps/web/src/lib/offline-db.test.ts:5` (`import 'fake-indexeddb/auto'`). [Source: apps/web/package.json; apps/web/src/lib/offline-db.test.ts:5]
- The shared global setupFile is `test/setup.ts`, loaded for **BOTH api and web** via the base config [Source: vitest.base.ts:85 `setupFiles: [path.resolve(workspaceRoot, 'test/setup.ts')]`]. fake-indexeddb therefore **cannot** be added there — the api package has no such dep and would break.
- `apps/web/vitest.config.ts` `mergeConfig`s the base and does NOT override `setupFiles` [Source: apps/web/vitest.config.ts:5-19]. Web tests register jest-dom **per-file** (`expect.extend(matchers)`), so `apps/web/src/test/setup.ts` may be legacy/unused — **the dev must verify whether it is actually loaded** before relying on it.

**Net:** any web test that transitively touches IndexedDB can throw the unhandled rejection and randomly red the build. This is a launch-path landmine.

## Acceptance Criteria

1. **AC#1 — Global web IndexedDB polyfill.** `fake-indexeddb/auto` is loaded for **every** web test (not just `offline-db.test.ts`). Implemented as a **web-only** vitest setupFile (e.g. `apps/web/src/test/fake-indexeddb.setup.ts` → `import 'fake-indexeddb/auto';`) wired into `apps/web/vitest.config.ts` `test.setupFiles`, **APPENDED to** (never replacing) the base `test/setup.ts` [Source: vitest.base.ts:85; apps/web/vitest.config.ts]. After load, `globalThis.indexedDB` is defined in the jsdom test env.
2. **AC#2 — The flake is gone.** `route-resolution.integration.test.tsx` (and the full web suite) run with **zero** `MissingAPIError: IndexedDB API missing` unhandled rejections. Verify by running the suite (ideally 2–3× to account for the prior non-determinism); the suite exits 0 with no "Unhandled Rejection" section.
3. **AC#3 — API tests UNAFFECTED.** The api package must NOT import `fake-indexeddb` (it has no such dep). The full **api** suite stays green; confirm the change is web-scoped only (no edit to `test/setup.ts` or the api config).
4. **AC#4 — Full web suite + CI green.** `pnpm --filter @oslsr/web test` (or `cd apps/web && pnpm vitest run`) green; `tsc` + lint clean (0 warnings); CI `test-web` green on push.
5. **AC#5 — Redundant import resolved.** Decide + document whether to remove the now-redundant per-test `import 'fake-indexeddb/auto'` at `offline-db.test.ts:5` (it's harmless once global, but redundant). State the decision in the Dev Agent Record.

## Tasks / Subtasks

- [x] **Task 1 — Web-only IndexedDB setup (AC#1, AC#3)**
  - [x] Create `apps/web/src/test/fake-indexeddb.setup.ts` → `import 'fake-indexeddb/auto';` (+ a one-line comment citing this story + the flake).
  - [x] Wire it into `apps/web/vitest.config.ts` `test.setupFiles` as an APPEND (preserve the base `test/setup.ts` — verify mergeConfig behaviour; if `mergeConfig` replaces rather than concatenates `setupFiles`, list BOTH explicitly). Do NOT touch `test/setup.ts` or any api config (AC#3).
  - [x] Confirm `globalThis.indexedDB` is defined inside a web test after the change.
- [x] **Task 2 — Verify the flake is dead (AC#2)**
  - [x] Run `route-resolution.integration.test.tsx` 2–3× — no `MissingAPIError` / "Unhandled Rejection". Run the full web suite — same.
- [x] **Task 3 — Regression + redundant-import decision (AC#4, AC#5)**
  - [x] Full web suite + api suite green; `tsc` + lint clean. Remove (or consciously keep) the `offline-db.test.ts:5` import; document the call.
  - [x] Pre-commit `[CR]` per the review-before-commit discipline.

## Dev Notes

- **Scope OUT:** the api package; `test/setup.ts` (shared — never add a web-only dep there); the underlying `useWizardDraft` IndexedDB usage (it's correct in real browsers — the fix is the TEST ENV, not the hook). Do NOT mock/disable IndexedDB in app code.
- **mergeConfig caveat (read first):** `apps/web/vitest.config.ts` uses `mergeConfig(baseConfig, …)`. Vitest's `mergeConfig` deep-merges, but `setupFiles` array merge behaviour must be VERIFIED — if it replaces, you must re-list the base `test/setup.ts` alongside the new file, or the global jest-dom/window mocks silently drop (a worse regression than the flake). Assert both setups still apply (jest-dom matchers + window.location mock still work).
- **Why a separate file (not `apps/web/src/test/setup.ts`):** that file's load status is unverified (tests extend jest-dom per-file). A new, explicitly-wired setupFile removes the ambiguity. If recon proves `src/test/setup.ts` IS loaded web-only, adding the import there is acceptable — dev's call, documented.
- **Verification is empirical** (the flake is non-deterministic) — run repeatedly, not once.

### References
- [Source: vitest.base.ts:85] shared `setupFiles` (api + web)
- [Source: apps/web/vitest.config.ts:5-19] web mergeConfig (no setupFiles override today)
- [Source: apps/web/package.json] `fake-indexeddb@^6.2.5` already a devDep
- [Source: apps/web/src/lib/offline-db.test.ts:5] the lone existing `fake-indexeddb/auto` import
- [Source: apps/web/src/__tests__/route-resolution.integration.test.tsx] the test that surfaced the flake (9-21)

## Dev Agent Record
### Agent Model Used
Amelia (BMAD dev agent) — claude-opus-4-8[1m], dev-story workflow, 2026-06-27.

### Completion Notes List
- **AC#1** — new web-only setupFile `apps/web/src/test/fake-indexeddb.setup.ts` (`import 'fake-indexeddb/auto'`) wired into `apps/web/vitest.config.ts` `test.setupFiles`. **mergeConfig CONCATENATES** setupFiles (verified: setup time rose 71ms→~180ms = base `test/setup.ts` + the new file BOTH load; full web suite stayed green = base mocks preserved). `globalThis.indexedDB` is now defined for every web test.
- **AC#2** — `route-resolution.integration.test.tsx` run 3× clean (56/56, zero `MissingAPIError`/Unhandled). The polyfill makes the IndexedDB API *present*, so the "API missing" rejection can no longer fire.
- **AC#3** — api package UNTOUCHED (no `fake-indexeddb` import; shared `test/setup.ts` untouched). Full api suite green (198 files / 2822).
- **AC#4** — full web suite green (245 files / 2716); web tsc 0; eslint clean.
- **AC#5** — **KEPT** the `offline-db.test.ts:5` `import 'fake-indexeddb/auto'`: it's idempotent (harmless once global) and documents that file's explicit IndexedDB dependency; removing it is pure churn for a de-flake whose whole point is minimizing risk.

### File List
**New:** `apps/web/src/test/fake-indexeddb.setup.ts`
**Modified:** `apps/web/vitest.config.ts` (append the web-only setupFile) · `_bmad-output/implementation-artifacts/sprint-status.yaml` · `_bmad-output/planning-artifacts/epics.md` · `docs/roadmap-to-launch.md`

### Review Follow-ups (AI) — code-review 2026-06-27
- [x] [AI-Review][Med] **M1 — concat-vs-replace had no guard.** FIXED: added `apps/web/src/test/__tests__/setup-files.test.ts` asserting BOTH `globalThis.indexedDB` is defined (web polyfill loaded) AND `window.location.assign` is mocked (base setup survived) — so a future `setupFiles` regression that drops either fails loudly (2/2 pass).
- [x] [AI-Review][Low] L1 (keep redundant `offline-db.test.ts:5` import — idempotent, documents intent) + L2 (setupFiles order) — accepted by design.

## Senior Developer Review (AI)

**Reviewer:** Amelia (BMAD code-review workflow — adversarial) · **Date:** 2026-06-27 · **Outcome:** ✅ APPROVE (all findings resolved)

- **Scope verified:** git == File List; **AC#3 confirmed — zero `fake-indexeddb` in the shared `test/setup.ts` or any api config** (web-scoped only).
- **The critical risk (concat vs replace) is now PROVEN + GUARDED:** the base `test/setup.ts` provides the `window.location` mock; the new guard test asserts it's still active alongside the IndexedDB polyfill → mergeConfig appends, base preserved. The flake is genuinely FIXED (IndexedDB API now present), not masked.
- **Findings:** 0 Critical · 0 High · **1 Medium (fixed)** · 2 Low (accepted).
- **Post-fix verification:** web tsc 0; eslint 0; route-resolution clean 3×; full web 2716 + api 2822 green; guard test 2/2.
- **Decision:** Status **done**.
- **Review File List (added):** `apps/web/src/test/__tests__/setup-files.test.ts`.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-27 | Authored (emergent from the 13-1 deploy flake) — wire fake-indexeddb globally for web tests; web-only setupFile, api untouched. 5 ACs / 3 Tasks. Grounded in verified code recon. | Bob (SM) |
| 2026-06-27 | Dev (Amelia): web-only setupFile appended to vitest.config (concat verified); route-resolution clean 3×; web 2716 + api 2822 green. Code-review: 1 Med fixed (setupFiles concat guard test) + 2 Low accepted. Status → done. | Amelia (Dev + Review) |
