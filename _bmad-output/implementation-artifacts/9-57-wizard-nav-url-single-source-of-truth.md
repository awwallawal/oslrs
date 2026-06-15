# Story 9.57: WizardPage Navigation — URL-as-Single-Source-of-Truth Refactor (retire the dual-effect URL↔state race)

Status: review

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

- [x] **Task 1 — Make the URL canonical (AC1)**
  - [x] Promote `stepFromUrl` (clamped to `maxReachedStepIndex`) to the rendered current step; stop reading `draft.currentStepIndex` for navigation.
  - [x] Route Continue / Back / `goToStep` / `WizardStepIndicator` jumps through `setSearchParams({ step })`.
  - [x] Delete the URL→state + state→URL effects, the `lastSyncSource` + `hasReconciledInitialUrl` refs, and their eslint-disables.
- [x] **Task 2 — Write-only draft persistence (AC2)**
  - [x] Add one write-only effect mirroring the URL-derived step into `useWizardDraft`; confirm autosave debounce parity.
- [x] **Task 3 — One-time resume seed (AC3)**
  - [x] On `?token` mount with no `?step`, seed the URL from `draft.currentStepIndex` once; explicit `?step` wins when both present.
- [x] **Task 4 — Parity sweep (AC4)**
  - [x] Verify 9-54 AC6.1 clamp, 9-18 AC#E5 auto-skip, back/forward, and Step-5 guard/submit all behave identically.
- [x] **Task 5 — Tests (AC5)**
  - [x] Keep + green all `WizardPage.test.tsx` URL-race + clamp tests; extracted nav derivation to a pure helper (`lib/wizard-navigation.ts`, precedent: `lib/review-completeness.ts`) with direct unit coverage.
  - [x] Author the Playwright e2e (clamp + back/forward active smoke-level; resume / autosave-across-reload `test.skip()` with re-enable preconditions per the file's full-stack convention).
  - [x] web `tsc` + `eslint src e2e` + full web suite + utils suite green; flip sprint-status 9-57 → review.

### Review Follow-ups (AI) — code-review 2026-06-15 (Amelia)

- [x] **[AI-Review][High] H1 — resume + explicit `?step` nav race.** The over-reach self-correction effect read `maxReachedStepIndex` from a lagging effect; when the form query settled before the draft hydrated, it clamped an explicit `?step` resume down to step 0. PROVEN with a forced form-settles-first test. FIXED: introduced a synchronous `effectiveMaxReached = Math.max(maxReachedStepIndex, isHydrated ? draft.currentStepIndex : 0)` consumed by the render clamp + over-reach guard. `[WizardPage.tsx:142-160, :193-200]`
- [x] **[AI-Review][Medium] M2 — `maxReachedStepIndex` was effect-derived state feeding navigation (root cause of H1).** Resolved by the same synchronous `effectiveMaxReached` derivation — the navigation ceiling is no longer read one commit stale. `[WizardPage.tsx:142-160]`
- [x] **[AI-Review][Medium] M1 — AC5.2(a/b) resume + autosave-across-reload e2e are now ACTIVE (no longer `test.skip()`).** RESOLVED in-session (2026-06-15) rather than deferred again. The skip rationale was partly stale: the e2e CI job (`.github/workflows/e2e.yml`) already stands up the full stack (postgres + redis + API + web + `db:seed:dev`) as a real blocking gate. The only true blocker was obtaining a `wizard_resume` token (stored SHA-256-hashed; plaintext lives only in the email). Resolution + remediation:
  - **Token (zero prod surface):** added a TEST-ONLY api script `apps/api/scripts/_mint-wizard-resume-token.ts` that calls the REAL `MagicLinkService.issueToken` and prints a `MINT_RESULT=` JSON line. It is never imported by `app.ts`/the router, so it adds NO HTTP route (chosen over a `/test/*` endpoint precisely to avoid a standing attack surface); guarded to refuse `NODE_ENV=production`.
  - **Wiring:** a new Playwright setup project `wizard-resume.setup.ts` (dependency of the `wizard` project, mirrors `auth-setup`) mints one token per test into a gitignored fixture; a plain `helpers/wizard-resume-fixture.ts` shares the path/types so the spec never imports the setup's `setup()` registration.
  - **Tests:** the draft is created by the wizard's OWN autosave during the test; the survey-skipped 4-step model landing on **Consent (index 2)** exercises the full resume-seed + clamp + write-only-persistence machinery WITHOUT a pinned multi-section form (Consent is always index 2 regardless of sections). AC5.2a uses a fresh browser context = genuine cross-device.
  - **Verified GREEN against the live local stack** (docker postgres+redis already running): `playwright --project=wizard` → 11 passed / 4 skipped (the 4 = the *other* pre-existing full-stack flows, not M1). `[apps/api/scripts/_mint-wizard-resume-token.ts, apps/web/e2e/wizard-resume.setup.ts, apps/web/e2e/helpers/wizard-resume-fixture.ts, apps/web/e2e/wizard-registration.spec.ts, apps/web/playwright.config.ts]`. Full how-to + re-enable/extend notes: `docs/runbooks/e2e-wizard-resume-harness.md`.
- [x] **[AI-Review][Low] L1 — Dev Notes said "React Router v7"; app is on `react-router-dom ^6.30.4`.** FIXED: corrected the idiom reference to v6. `[Dev Notes "Critical implementation rules"]`

## Dev Notes

### Architecture & seam map (cite these exact targets)
- **The seam:** `apps/web/src/features/registration/pages/WizardPage.tsx` — `stepFromUrl` derivation (`:104-110`), `maxReachedStepIndex` (`:125-129`, Story 9-54 AC6.1), the two sync effects to retire (`:158-210`), `goToStep` (`:212-218`), `isStepSkippable`/AC#E5 (`:223+`), the `reviewCompleteness` memo (now delegates to `lib/review-completeness.ts`).
- **Draft hook:** `apps/web/src/features/registration/hooks/useWizardDraft.ts` — owns `currentStepIndex`, `setCurrentStepIndex`, `isHydrated`, and the 2s-debounced server autosave. The refactor changes WHO drives `currentStepIndex` (URL, not buttons) but keeps the hook as the persistence/resume store.
- **Step indicator:** `apps/web/src/features/registration/components/WizardStepIndicator.tsx` (forward-jump already guarded) — route its jumps through the URL.
- **Pure-helper precedent:** `apps/web/src/features/registration/lib/review-completeness.ts` (extracted during 9-55) shows the pattern for pulling testable logic out of the component.

### Critical implementation rules (project-context.md)
- **No new render loops:** a single source of truth is the structural guarantee; do not reintroduce an effect that both reads and writes the step.
- **React Router v6** idioms (`react-router-dom ^6.30.4`) — URL/searchParams as state; `setSearchParams(next, { replace: true })` for in-wizard step changes (avoid history spam, preserve back/forward semantics deliberately).
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

claude-opus-4-8[1m] (Amelia / dev-story workflow) — 2026-06-15.

### Debug Log References

- Web regression net: `pnpm --filter @oslsr/web exec vitest run src/features/registration/pages/__tests__/WizardPage.test.tsx` → 8/8 (6 original URL-race + 9-54 AC6.1 clamp + 2 new AC3 resume-seed).
- Pure helper: `…/lib/__tests__/wizard-navigation.test.ts` → 19/19.
- Full web suite: `pnpm --filter @oslsr/web test` → **239 files, 2621 passed / 2 todo, 0 failures**.
- `pnpm --filter @oslsr/utils test` → 118/118. `tsc --noEmit` exit 0. `eslint src e2e` → 0 errors / 0 warnings.

### Completion Notes List

**What changed (the seam, retired).** `WizardPage` no longer keeps the current step in two mirrors. The rendered step is now **derived** purely from the URL: `currentStepIndex = clampToReached(parseStepParam(?step), maxReachedStepIndex)`. The two opposing sync effects (URL→state / state→URL), the `lastSyncSource` ref, and the `hasReconciledInitialUrl` ref — and both `react-hooks/exhaustive-deps` eslint-disables on them — are **deleted**. The 2026-05-12 doom-loop is now structurally impossible (no effect both reads and writes the step in opposing directions). [AC1]

**Navigation is URL-only.** Continue/Back/`goToStep`/indicator jumps all route through a single `navigateToStep(idx)` → `setSearchParams`. `handleContinue` is the only forward path; it bumps `maxReachedStepIndex` **explicitly + atomically** with the URL push, so the derived step isn't clamped straight back and a crafted `?step=99` still can't inflate the ceiling (it's `current+1` from the already-clamped step). `advanceStep`/`retreatStep` (pure helpers) preserve the 9-18 AC#E5 auto-skip. [AC1, AC4.2]

**Write-only persistence (AC2).** One effect mirrors the URL-derived step into `useWizardDraft` for autosave/resume; it never feeds render. Guarded on `stepFromUrl != null` so it can't clobber a `?token` resume's saved step back to 0 before the one-time seed lands. The hook's `setCurrentStepIndex` was made a **stable** callback (reads `formData` via a ref) so this effect needs no `draft`-object dep / eslint-disable.

**One-time resume seed (AC3).** A ref-guarded effect seeds the URL once when `?step` is absent — from the saved draft step on `?token` resume, else `0`. An explicit `?step` always wins (never overwritten). A separate one-directional effect self-corrects an over-reaching `?step` down to the clamp using `replace` (no history spam). [AC3, AC4.1]

**Deliberate deviation from a Dev Note (flag for review).** Dev Note line 83 suggested `setSearchParams(next, { replace: true })` for *in-wizard* step changes. That is incompatible with **AC4.3 + AC5.2(d)** ("browser back/forward still moves between visited steps"): `replace` collapses the wizard to a single history entry, so back exits the wizard rather than stepping. Resolution: **push** for user navigation (Continue/Back/jumps) so back/forward works, **replace** only for the system-initiated seed + over-reach corrections (which addresses the Dev Note's actual concern — "avoid history spam"). The original code used `replace` and therefore never truly supported step-wise back/forward; this is a net behavioural improvement the ACs require. Worth a reviewer's eye since the Dev Note text says otherwise.

**Tests.** Nav derivation extracted to `lib/wizard-navigation.ts` (pure, precedent `lib/review-completeness.ts`) with 19 unit tests. The 6 URL-race + 2 clamp regression tests stay green (the net for this refactor) + 2 new jsdom AC3 resume-seed tests (saved-step seed; explicit-`?step` wins). Playwright e2e: **clamp** + **browser back/forward** are active smoke-level (need only the app — the form fetch 404s → survey-skipped 4-step model — no DB writes); **cross-device resume** (AC5.2a) + **autosave-across-reload** (AC5.2b) are `test.skip()` with detailed re-enable preconditions, matching this spec's existing full-stack convention (CI provisions no pinned form / email sink / resume token).

**Scope.** Strictly web-only: `apps/web/src/features/registration/**` + `apps/web/e2e/**`. No API, schema, or shared-package changes. The API suite has zero changed files (not re-run); the full `pnpm test` turbo gate runs on push.

### File List

- `apps/web/src/features/registration/pages/WizardPage.tsx` (modified — URL-canonical navigation; dual-effect seam retired)
- `apps/web/src/features/registration/hooks/useWizardDraft.ts` (modified — stable `setCurrentStepIndex` via `formDataRef`)
- `apps/web/src/features/registration/lib/wizard-navigation.ts` (new — pure nav derivation helpers)
- `apps/web/src/features/registration/lib/__tests__/wizard-navigation.test.ts` (new — 19 unit tests)
- `apps/web/src/features/registration/pages/__tests__/WizardPage.test.tsx` (modified — +2 AC3 resume-seed jsdom tests)
- `apps/web/e2e/wizard-registration.spec.ts` (modified — +Story 9-57 nav describe: clamp + back/forward active; **resume (AC5.2a) + autosave-reload (AC5.2b) now ACTIVE** via the resume-token harness, AI-Review M1)
- `apps/api/scripts/_mint-wizard-resume-token.ts` (new, AI-Review M1 — test-only `wizard_resume` token mint; zero server surface; prod-guarded)
- `apps/web/e2e/wizard-resume.setup.ts` (new, AI-Review M1 — Playwright setup project that mints tokens into a fixture; dependency of the `wizard` project)
- `apps/web/e2e/helpers/wizard-resume-fixture.ts` (new, AI-Review M1 — shared fixture path/types, plain module so the spec doesn't import the setup's `setup()`)
- `apps/web/playwright.config.ts` (modified, AI-Review M1 — added `wizard-resume-setup` project + `wizard` depends on it)
- `.gitignore` (modified, AI-Review M1 — ignore `apps/web/e2e/.wizard-resume-tokens.json`)
- `docs/runbooks/e2e-wizard-resume-harness.md` (new, AI-Review M1 — harness how-to, run/extend/security rationale)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — 9-57 → in-progress → review)

### Change Log

| Date | Change |
|---|---|
| 2026-06-15 | Implemented Story 9-57 — retired the WizardPage dual-effect URL↔state doom-loop in favour of URL-as-single-source-of-truth. Extracted `lib/wizard-navigation.ts` pure helpers (19 tests); stabilised `useWizardDraft.setCurrentStepIndex`; write-only draft persistence + one-time resume seed + over-reach self-correct effects. Added Playwright e2e (clamp + back/forward active; resume + autosave-reload skipped). web tsc + lint + full web suite (2621 pass) + utils (118) green. Status → review. |
| 2026-06-15 | Code-review (Amelia) — 1 High / 2 Medium / 1 Low. Fixed H1+M2 (resume + explicit `?step` nav race: over-reach effect read a stale `maxReachedStepIndex`; replaced with synchronous `effectiveMaxReached` folding in the hydrated draft step) + L1 (Dev Note "v7"→v6). Added forced form-settles-first regression test (`WizardPage.test.tsx` → 9 tests). Targeted suites 28/28, WizardPage eslint clean. |
| 2026-06-15 | Code-review follow-through — **M1 RESOLVED in-session** (no second deferral). Un-skipped AC5.2a (cross-device resume) + AC5.2b (autosave-across-reload) e2e. Added test-only `_mint-wizard-resume-token.ts` (real `issueToken`, zero server route, prod-guarded) + `wizard-resume.setup.ts` Playwright setup project + shared fixture helper; `wizard` project now depends on it. Verified GREEN on the live stack: `playwright --project=wizard` → 11 passed / 4 skipped. New runbook `docs/runbooks/e2e-wizard-resume-harness.md`. web+api tsc/eslint clean. |
