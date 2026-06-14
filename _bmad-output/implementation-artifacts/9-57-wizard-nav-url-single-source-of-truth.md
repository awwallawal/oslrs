# Story 9.57: WizardPage Navigation — URL-as-Single-Source-of-Truth Refactor (retire the dual-effect URL↔state race)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-14 by Bob (SM) via canonical *create-story --yolo. HYGIENE / TECH-DEBT — NOT launch-gating (roadmap Phase 4). John (PM) concurrence: latent maintainability risk on working+green code → Phase-4 hygiene, must NOT delay the launch critical path. Emerged from the Story 9-55 dev-story session (operator asked to investigate the "fragile WizardPage URL-race test"). -->

## Story

As the **engineer who maintains the public registration wizard**,
I want the **wizard's current-step navigation to have a single source of truth (the URL), instead of two state mirrors reconciled by competing effects**,
so that **the 2026-05-12 infinite-render-loop class of bug becomes structurally impossible — not merely guarded by a delicate test + eslint-disabled stale-closure deps that any future edit can break**.

## Context & Why This Is Hygiene (not launch-gating)

`WizardPage.tsx` keeps the current step in **two sources of truth at once**:

1. the URL query param `?step=N` (for deep-linking + browser back/forward), and
2. `draft.currentStepIndex`, persisted by `useWizardDraft` (cross-device resume + 2s-debounced server autosave).

They are reconciled by **two opposing `useEffect`s** — "URL→state" and "state→URL" (`WizardPage.tsx:158-210`) — coordinated by a mutable `lastSyncSource` ref (to suppress the opposite-direction sync on the next tick) and a `hasReconciledInitialUrl` ref (to protect token-resume), with `draft` **deliberately omitted from both dep arrays** (eslint-disabled `react-hooks/exhaustive-deps`) because `useWizardDraft` returns a fresh object every render.

This is the classic two-way-binding **doom-loop anti-pattern**. It was the literal cause of the 2026-05-12 infinite-render-loop bug (clicking Continue on Step 1 left the wizard flickering on Step 1 forever); the refs are band-aids over it.

**What is NOT broken (do not re-scope as a bug):** the code WORKS in production today, and `WizardPage.test.tsx` (6 URL-race tests) is **stable** — verified 5/5 clean runs on 2026-06-14. A *separate* earlier DOM-collision flake was already fixed (`afterEach(cleanup)`). The remaining issue is purely a **latent maintainability hazard**: any future dep-array edit (e.g. "fixing" the eslint-disable by adding `draft`) reintroduces the loop. That is why this is **Phase-4 hygiene, NOT launch-gating** — there is no live defect to fix before launch.

**Decision (Awwal, 2026-06-14):** resolve the design at the root, but as a deliberate, e2e-covered story — NOT a drive-by inside a feature story (the same scope discipline applied to the bcrypt test-cost fix and the 9-54 NG2 pre-push de-flake).

## Acceptance Criteria

### AC1 — URL is the single source of truth for the current step
1. The rendered current step is **derived** from the URL (`searchParams.get('step')`), clamped to `[0, steps.length-1]` and to `maxReachedStepIndex` (preserving the Story 9-54 AC6.1 deep-link clamp). `draft.currentStepIndex` is NO LONGER read as a navigation source.
2. All navigation actions — Continue, Back, `goToStep`, and `WizardStepIndicator` forward/back jumps — change the step by calling `setSearchParams({ step })` ONLY (never a state setter that a reverse effect must then mirror).
3. The two opposing sync effects (`WizardPage.tsx:158-210`), the `lastSyncSource` ref, and the `hasReconciledInitialUrl` ref are REMOVED. No `react-hooks/exhaustive-deps` eslint-disable remains on the navigation effects.
4. It is structurally impossible for navigation to enter a render loop (no effect both reads and writes the same step source in opposing directions).

### AC2 — Draft persistence is write-only (no reverse coupling)
1. The step is still persisted to the draft for autosave/resume via a SINGLE **write-only** effect that mirrors the URL-derived step into `useWizardDraft` — it never feeds back into navigation/render.
2. Autosave behaviour is unchanged from the user's perspective: advancing/▸retreating steps still updates the persisted `currentStepIndex` within the existing debounce window.

### AC3 — Cross-device token-resume preserved (one-time URL seed)
1. On mount with a `?token=<wizard_resume>`, the saved `draft.currentStepIndex` is read ONCE and, when the URL has no `?step`, the URL is seeded to it via `setSearchParams` (one-time reconciliation). The user lands on the saved step.
2. When BOTH a resume token AND an explicit `?step` are present, the explicit `?step` wins (clamped per AC1), matching current behaviour.

### AC4 — Behavioural parity with the current wizard (no regressions)
1. Story 9-54 AC6.1 deep-link clamp holds: `?step=<beyond furthest-reached>` lands on the furthest-reached step and self-corrects the URL.
2. Story 9-18 AC#E5 empty-section auto-skip still skips fully-hidden section steps on Continue/Back.
3. Browser back/forward still moves between visited steps; the URL stays the canonical `?step=N`.
4. The Step-5 review completeness guard (now `lib/review-completeness.ts`) and submit flow are unaffected.

### AC5 — Tests
1. ALL existing `WizardPage.test.tsx` URL-race guards + the 9-54 AC6.1 deep-link clamp tests remain and pass (they are the unit regression net for this refactor).
2. **NEW Playwright e2e** (the explicit reason this was deferred from inline fixes) covering what the jsdom unit tests cannot verify end-to-end: (a) cross-device resume via magic-link/resume token lands on the saved step; (b) autosave persists the current step across a reload; (c) deep-link clamp cannot reach Review past unfilled steps; (d) browser back/forward navigates steps correctly.
3. Full `pnpm test` green (api + web + utils); web `tsc` + `eslint src e2e` clean; flip sprint-status 9-57 → review at close.

## Tasks / Subtasks

- [ ] **Task 1 — Make the URL canonical (AC1)**
  - [ ] Promote `stepFromUrl` (clamped to `maxReachedStepIndex`) to the rendered current step; stop reading `draft.currentStepIndex` for navigation.
  - [ ] Route Continue / Back / `goToStep` / `WizardStepIndicator` jumps through `setSearchParams({ step })`.
  - [ ] Delete the URL→state + state→URL effects, the `lastSyncSource` + `hasReconciledInitialUrl` refs, and their eslint-disables.
- [ ] **Task 2 — Write-only draft persistence (AC2)**
  - [ ] Add one write-only effect mirroring the URL-derived step into `useWizardDraft`; confirm autosave debounce parity.
- [ ] **Task 3 — One-time resume seed (AC3)**
  - [ ] On `?token` mount with no `?step`, seed the URL from `draft.currentStepIndex` once; explicit `?step` wins when both present.
- [ ] **Task 4 — Parity sweep (AC4)**
  - [ ] Verify 9-54 AC6.1 clamp, 9-18 AC#E5 auto-skip, back/forward, and Step-5 guard/submit all behave identically.
- [ ] **Task 5 — Tests (AC5)**
  - [ ] Keep + green all `WizardPage.test.tsx` URL-race + clamp tests; consider extracting nav derivation to a pure helper (precedent: `lib/review-completeness.ts`) for direct unit coverage.
  - [ ] Author the Playwright e2e (resume / autosave-across-reload / clamp / back-forward).
  - [ ] Full `pnpm test` + tsc + lint green; flip sprint-status 9-57 → review.

## Dev Notes

### Architecture & seam map (cite these exact targets)
- **The seam:** `apps/web/src/features/registration/pages/WizardPage.tsx` — `stepFromUrl` derivation (`:104-110`), `maxReachedStepIndex` (`:125-129`, Story 9-54 AC6.1), the two sync effects to retire (`:158-210`), `goToStep` (`:212-218`), `isStepSkippable`/AC#E5 (`:223+`), the `reviewCompleteness` memo (now delegates to `lib/review-completeness.ts`).
- **Draft hook:** `apps/web/src/features/registration/hooks/useWizardDraft.ts` — owns `currentStepIndex`, `setCurrentStepIndex`, `isHydrated`, and the 2s-debounced server autosave. The refactor changes WHO drives `currentStepIndex` (URL, not buttons) but keeps the hook as the persistence/resume store.
- **Step indicator:** `apps/web/src/features/registration/components/WizardStepIndicator.tsx` (forward-jump already guarded) — route its jumps through the URL.
- **Pure-helper precedent:** `apps/web/src/features/registration/lib/review-completeness.ts` (extracted during 9-55) shows the pattern for pulling testable logic out of the component.

### Critical implementation rules (project-context.md)
- **No new render loops:** a single source of truth is the structural guarantee; do not reintroduce an effect that both reads and writes the step.
- **React Router v7** idioms — URL/searchParams as state; `setSearchParams(next, { replace: true })` for in-wizard step changes (avoid history spam, preserve back/forward semantics deliberately).
- **Tests:** web tests co-located / vitest; e2e under `apps/web/e2e` (Playwright). NEVER run `pnpm vitest run` from root for web tests.

### Risk
- **HIGH blast radius** — this is the core navigation of the live public-registration wizard (Story 9-18, the launch long-pole). A subtle regression affects EVERY registration. The unit URL-race tests cover navigation; **resume + autosave are only fully verifiable via the new e2e (AC5.2)** — that e2e is a hard gate for this story, not optional.

### Project Structure Notes
- Web-only change (`apps/web/src/features/registration/**` + `apps/web/e2e/**`). No API, schema, or shared-package changes expected.

### Dependencies & sequencing
- **Depends on (already shipped):** Story 9-18 (wizard section-as-step + nav), Story 9-54 (AC6.1 `maxReachedStepIndex` clamp), Story 9-55 (extracted `review-completeness.ts`).
- **Sequencing:** Phase-4 hygiene — run AFTER launch, or in a dedicated cleanup pass; must NOT delay Phases 0–2. Do not bundle with a feature story.

### References
- [Source: apps/web/src/features/registration/pages/WizardPage.tsx#104-210] — the dual-source / dual-effect seam to retire
- [Source: apps/web/src/features/registration/hooks/useWizardDraft.ts] — persistence/resume store
- [Source: apps/web/src/features/registration/pages/__tests__/WizardPage.test.tsx] — URL-race + 9-54 AC6.1 clamp regression net
- [Source: apps/web/src/features/registration/lib/review-completeness.ts] — pure-helper extraction precedent (Story 9-55)
- [Source: docs/roadmap-to-launch.md#Phase-4] — hygiene tier, non-blocking
- [Source: docs/follow-ups/2026-06-14-test-bcrypt-cost-downcost.md] — sibling "fix the root cause of a delicate test, separately from feature work" precedent
- [Source: _bmad-output/project-context.md] — React 18.3 / React Router v7 / test-org rules

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
