# Story 12.11: Inline-style migration sweep

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Drafted 2026-06-16 by Bob (SM) via canonical *create-story, grounded against the codebase scan 2026-06-16 (real `style={{` grep) + epic-12-dashboard-system-refresh-brief.md §3c/§4 + project-context.md. Epic 12 "Dashboard System Refresh", Track B (design-system enforcement), Tier 1. This is the migration that lets 12-2's arbitrary-inline-style lint rule be flipped warn→error. POST-LAUNCH, NON-GATING. Depends on 12-2 (Progress primitive + warn-level rule) and coordinates with 12-10 (which retires RegistryTestPage, ~20 of the 25 instances). -->

## Story

As a **front-end engineer maintaining the OSLRS dashboards**,
I want **every dynamic-width inline style moved onto the shadcn `Progress` primitive and every arbitrary inline `style={{}}` replaced with Tailwind classes (behavior-preserving), then the 12-2 inline-style lint rule flipped from `warn` to `error`**,
so that **the design system is actually enforced — no surface can silently reintroduce ad-hoc inline styling, and dynamic widths render through one consistent, accessible primitive.**

## Context & Why

**POST-LAUNCH, NON-GATING — no FRC item depends on it; must not block the field survey or the re-engagement blasts.** This is Track-B (design-system enforcement) hygiene; it changes no runtime behavior and gates nothing operational.

The Epic 12 brief verified the drift: shadcn/ui *is* set up and mostly used, **but never enforced**. A handful of pages still carry inline `style={{}}` — some are legitimate dynamic `width:${pct}%` progress bars (runtime values that *can't* be a static Tailwind class), and some are arbitrary static styles that should just be Tailwind classes. There was **no lint rule** preventing this drift [Source: _bmad-output/planning-artifacts/epic-12-dashboard-system-refresh-brief.md:67-70].

Story **12-2 (Tier 0)** adds the two things this story consumes: (1) a shadcn `Progress` primitive at `apps/web/src/components/ui/progress.tsx` for dynamic widths, and (2) an arbitrary-inline-`style` ban lint rule landed at `warn` plus `eslint-plugin-tailwindcss` [Source: _bmad-output/planning-artifacts/epic-12-dashboard-system-refresh-brief.md:81]. **This story (12-11) does the migration that lets that rule be flipped to `error`**: migrate dynamic widths to `Progress`, remove arbitrary inline styles from the offending pages, then flip the rule `warn → error` in `apps/web/eslint.config.js` and confirm `pnpm lint` passes at error level.

The migrations are **behavior-preserving** (a project-context convention) — the rendered output, accessibility attributes, and dynamic values are unchanged; only the *mechanism* (inline `style` → primitive / Tailwind class) changes.

### Dependencies, sequencing & effort

**Dependency spine (Track B):** `12-2 (Progress primitive + warn-level lint rule) → 12-11`; the brief states `12-2/12-3 (lint/barrel) → {12-10, 12-11}` [Source: _bmad-output/planning-artifacts/epic-12-dashboard-system-refresh-brief.md:97].

- **Depends on 12-2 (HARD):** the `Progress` primitive (`apps/web/src/components/ui/progress.tsx`) and the arbitrary-inline-style lint rule must already exist (rule at `warn`). **Verified 2026-06-16: neither exists yet** — no `progress.tsx`, no inline-style rule, no `eslint-plugin-tailwindcss` in `eslint.config.js`. **12-2 must land before this story starts.** If 12-2 named the primitive or rule differently, adapt the import path / rule selector accordingly.
- **Coordinates with 12-10 (HARD ordering):** 12-10 ("Raw-table migration sweep") **retires `RegistryTestPage`** [Source: _bmad-output/planning-artifacts/epic-12-dashboard-system-refresh-brief.md:90]. `RegistryTestPage` holds **20 of the 25** inline-style instances (all static, all in a throwaway test page). **By the time 12-11 runs, RegistryTestPage should be deleted** — so only ~5 instances remain across 5 pages. **This story MUST run after 12-10 retires it.** If RegistryTestPage is still present when 12-11 starts, handle it gracefully: prefer deleting it here too (it is a non-routed dev test page), and note the coordination gap so 12-10's File List doesn't double-count.
- **Reuses (do NOT fork):** the 12-2 `Progress` primitive; existing Tailwind utility classes; the shared `ProgressBar` component pattern. Converting the shared `ProgressBar.tsx` (forms) to compose `Progress` migrates all of its call-sites at once.
- **Effort:** ~0.5–1 dev-day (5 surfaces post-12-10, plus the shared `ProgressBar`, plus the lint flip + verification).

## Acceptance Criteria

### AC1 — Dynamic-width inline styles migrated to `Progress`
1. Every dynamic-width `style={{ width: \`${pct}%\` }}` bar on the in-scope surfaces is migrated to the 12-2 `Progress` primitive (`apps/web/src/components/ui/progress.tsx`), composing it rather than rebuilding. Confirmed dynamic-width bars: `OfficialHome.tsx:154` (`progressPct`), `OfficialProductivityPage.tsx:35` (local `ProgressBar`, `width`), `SystemHealthPage.tsx:45` (local `ProgressBar`, `Math.min(value, 100)`), and the shared `forms/components/ProgressBar.tsx:23` (`fillPercent`).
2. The migration is **behavior-preserving**: the rendered fill percentage, the threshold-driven color states (e.g. SystemHealthPage red/amber/green, OfficialHome emerald/maroon ≥100% switch), and existing accessibility attributes (`role="progressbar"`, `aria-valuenow/min/max` on `forms/ProgressBar.tsx`) are unchanged. Where the `Progress` primitive does not expose a color/threshold prop, the color is driven via a Tailwind class / CSS var on the indicator — never a reintroduced inline `style`.

### AC2 — Arbitrary inline styles removed/replaced (behavior-preserving)
1. Every **arbitrary static** inline `style={{}}` on the remaining in-scope pages is replaced with an equivalent Tailwind class (or a CSS var where a class is impossible), preserving the rendered layout. Confirmed static arbitrary styles: `EnumeratorMessagesPage.tsx:111` and `SupervisorMessagesPage.tsx:149` — both `style={{ height: 'calc(100vh - 220px)' }}` → Tailwind arbitrary-value class `h-[calc(100vh-220px)]`.
2. `RegistryTestPage.tsx` (20 static instances, lines 45,46,51,58,63,65–71,77–82,88,90) is **assumed already retired by 12-10**. Verify it is gone; if still present, delete it here (non-routed dev test page) and note the coordination in the File List. No attempt is made to "migrate" it — it is removed, not converted.

### AC3 — 12-2 inline-style lint rule flipped to `error`
1. The arbitrary-inline-style ban rule that 12-2 landed at `warn` in `apps/web/src/**/*.{ts,tsx}` (production config block, excluding tests) is flipped to `error` in `apps/web/eslint.config.js`.
2. After the flip, `pnpm lint` (web) **passes with zero errors and zero warnings** for that rule — proving every offending instance is migrated. Any genuinely-required residual inline style (none expected) carries a narrowly-scoped `eslint-disable-next-line` with a written rationale, per the project's existing disable-with-rationale convention.

### AC4 — Gates green + tests updated
1. `pnpm lint` (error level), `tsc --noEmit`, `pnpm build` (vite), and the web test suite all pass — the existing pre-push gate (lint+tsc+build+test) covers this.
2. Co-located web tests for every changed component/page are updated to assert behavior is preserved (the progress bar still renders the right fill/state; the message-panel layout still mounts). Tests assert via accessible queries (role/label/text/testid), not CSS selectors (Team Agreement A3). Existing `data-testid="progress-bar"` hooks are kept so current tests keep passing.

## Tasks / Subtasks

- [ ] Task 1 — Pre-flight: confirm 12-2 + 12-10 landed (AC: #1, #2, #3) — verify `apps/web/src/components/ui/progress.tsx` exists, the inline-style `warn` rule + `eslint-plugin-tailwindcss` are present in `eslint.config.js`, and `RegistryTestPage.tsx` is gone (or plan to delete it). Re-run the `style={{` grep to get the live instance list before starting.
- [ ] Task 2 — Migrate shared `forms/components/ProgressBar.tsx` to `Progress` (AC: #1) — compose the 12-2 primitive for the fill bar (`forms/components/ProgressBar.tsx:23`), preserving `role="progressbar"` + `aria-valuenow/min/max` + the section-dots row + the `data-testid="progress-bar"`. This is a shared component → migrates all its call-sites at once.
- [ ] Task 3 — Migrate `OfficialHome` collection-progress bar (AC: #1) — `OfficialHome.tsx:154` (`width:${progressPct}%`) → `Progress`, preserving the ≥100% emerald-vs-maroon color switch and `data-testid="progress-bar"` + `data-testid="progress-count"`/`progress-stats`.
- [ ] Task 4 — Migrate `OfficialProductivityPage` local `ProgressBar` (AC: #1) — `OfficialProductivityPage.tsx:35` (`width:${width}%`) → `Progress`, preserving the ≥100% green-vs-maroon color + the `{percent}%` label.
- [ ] Task 5 — Migrate `SystemHealthPage` local `ProgressBar` (AC: #1) — `SystemHealthPage.tsx:45` (`width:${Math.min(value,100)}%`) → `Progress`, preserving the red/amber/green threshold (`criticalAt`/`warningAt`) color states + the `data-testid="progress-bar"`.
- [ ] Task 6 — Replace `EnumeratorMessagesPage` arbitrary height style (AC: #2) — `EnumeratorMessagesPage.tsx:111` `style={{ height: 'calc(100vh - 220px)' }}` → Tailwind `h-[calc(100vh-220px)]` on the same element; layout unchanged.
- [ ] Task 7 — Replace `SupervisorMessagesPage` arbitrary height style (AC: #2) — `SupervisorMessagesPage.tsx:149` `style={{ height: 'calc(100vh - 220px)' }}` → Tailwind `h-[calc(100vh-220px)]`; layout unchanged.
- [ ] Task 8 — Handle `RegistryTestPage` (AC: #2.2) — verify 12-10 deleted it; if still present, delete the file + any route/import reference and note in the File List. (Expected: already gone — no work.)
- [ ] Task 9 — Flip the 12-2 inline-style rule `warn → error` in `apps/web/eslint.config.js` (AC: #3) — change only the rule severity in the production `src/**/*.{ts,tsx}` block; do NOT touch the unrelated `no-restricted-syntax` localStorage/sessionStorage selectors or the test-file blocks.
- [ ] Task 10 — Update co-located tests for changed components/pages (AC: #4.2) — `forms/components` ProgressBar test, `OfficialHome`, `OfficialProductivityPage`, `SystemHealthPage`, and the two Messages pages; assert fill/state/layout via accessible queries; keep existing `data-testid` hooks.
- [ ] Task 11 — Full-gate verification (AC: #3.2, #4.1) — run web `pnpm lint` (now error level → 0/0), `tsc --noEmit`, `pnpm build`, and `pnpm --filter @oslsr/web test`; all green with zero regressions.

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- **shadcn skeletons not spinners** — N/A to this story's changed code (no loading states added), but do not introduce spinners; if any touched element shows loading, use the existing skeleton pattern.
- **Behavior-preserving migrations** — this is the core constraint. The rendered output, color/threshold states, dynamic fill values, and a11y attributes must be byte-for-byte equivalent in behavior. Only the styling *mechanism* changes (inline `style` → `Progress` / Tailwind class).
- **Web tests are co-located** (`__tests__/` next to the component or `*.test.tsx`) — vitest, accessible queries only (Team Agreement A3 bans CSS/id selectors and `toHaveClass()` on selector-discovered nodes; enforced by `no-restricted-syntax` in the test-file config block).
- **Pre-push gate runs lint+tsc+build+test** — the flip to `error` (AC3) means a single un-migrated instance now fails CI, so the migration must be complete before the flip lands in the same change.
- **Reuse / compose, don't rebuild** — compose the 12-2 `Progress` primitive; do not hand-roll a new bar. Converting the shared `forms/ProgressBar.tsx` is the highest-leverage migration (one change, many call-sites).

### Migration mechanics
- **Dynamic width → `Progress`:** the four bars all compute a percent in TS (`fillPercent`, `progressPct`, `width`, `Math.min(value,100)`) and apply it via `style={{ width: \`${pct}%\` }}`. The 12-2 `Progress` primitive (Radix-based shadcn `Progress`) takes a `value` prop and renders the indicator transform internally — pass the computed percent as `value`. **Color/threshold states** (SystemHealthPage red/amber/green via `criticalAt`/`warningAt`; OfficialHome + OfficialProductivityPage maroon-vs-green at ≥100%) are NOT a width concern — drive them with a conditional Tailwind class on the `Progress` indicator (e.g. via the `Progress` primitive's `className`/indicator className, or a CSS var), never a reintroduced inline `style`. Confirm how 12-2's primitive exposes indicator styling and follow that contract.
- **Static arbitrary style → Tailwind:** the two `height: 'calc(100vh - 220px)'` cases map directly to the Tailwind arbitrary-value class `h-[calc(100vh-220px)]` (Tailwind v4) on the same element that already carries `className="bg-white rounded-lg border shadow-sm overflow-hidden"`.
- **a11y preservation:** `forms/ProgressBar.tsx` carries `role="progressbar"` + `aria-valuenow/min/max` on the inner fill div — the Radix `Progress` primitive provides equivalent ARIA, but verify the values map correctly (valuenow = `currentIndex + 1`, valuemax = `totalVisible`); if the primitive's ARIA semantics differ from the current 1-based scheme, keep the explicit aria attributes so existing tests/assistive tech are unaffected.

### Lint flip (AC3)
- The production-code rule lives in the `files: ['src/**/*.{ts,tsx}'], ignores: [tests]` block of `apps/web/eslint.config.js` (currently lines ~47–119). 12-2 adds the inline-style ban there. Flip ONLY that rule's severity to `error`. Do **not** alter the three existing `no-restricted-syntax` blocks (test-file A3 selectors at ~13, e2e locator ban at ~37, and the localStorage/sessionStorage token ban at ~91) — those are unrelated and already `error`.
- After the flip, `pnpm lint` must be 0 errors / 0 warnings. If 12-2 implemented the ban *as* a `no-restricted-syntax` JSXAttribute selector rather than `react/forbid-dom-props`, flip the severity in whichever construct 12-2 used.

### Project Structure Notes
- Changed files are all under `apps/web/src/features/dashboard/pages/` (OfficialHome, OfficialProductivityPage, SystemHealthPage, EnumeratorMessagesPage, SupervisorMessagesPage) + `apps/web/src/features/forms/components/ProgressBar.tsx` (shared) + the lint config `apps/web/eslint.config.js`. RegistryTestPage is expected already-deleted by 12-10.
- No new files except possibly test additions; the `Progress` primitive itself is owned by 12-2 (do not create or modify it here beyond importing).
- **Out of scope (do NOT migrate here):** the many `style={{}}` instances inside `features/dashboard/components/charts/*` and other chart components (e.g. `DemographicCharts`, `CrossTabTable`, `LgaChoroplethMap`, `EnrollmentForecastCard`, `ActivationStatusPanel`, `CrossLgaStaffTable`, `LgaComparisonCard`, `ThresholdGuard`, `TodayProgressCard`, `GroupComparisonCard`, etc.) and the activation/registration wizard bars (`WizardProgressBar`, `WizardStepIndicator`) and `LiveSelfieCapture`. The brief's §3c Track-B inline-style work-list is explicitly the **6 pages** above (25 instances). Chart-component inline styles are largely dynamic SVG/chart-height values handled by the "no rebuild of the 41 chart components" non-goal; do not expand scope. If the 12-2 rule's file-glob would also flag those, that is a 12-2 scoping decision — surface it, don't silently widen this sweep.

### Verified inline-style inventory (codebase scan 2026-06-16 — matches brief §3c "6 pages / 25 instances")
| Surface | File:line | Kind | Migration |
|---|---|---|---|
| RegistryTestPage | `RegistryTestPage.tsx` (20 instances: 45,46,51,58,63,65–71,77–82,88,90) | static | RETIRED by 12-10 (delete, don't migrate) |
| OfficialHome | `OfficialHome.tsx:154` | dynamic width | → `Progress` |
| OfficialProductivityPage | `OfficialProductivityPage.tsx:35` | dynamic width (local `ProgressBar`) | → `Progress` |
| SystemHealthPage | `SystemHealthPage.tsx:45` | dynamic width (local `ProgressBar`) | → `Progress` |
| EnumeratorMessagesPage | `EnumeratorMessagesPage.tsx:111` | static `height: calc(...)` | → Tailwind `h-[calc(100vh-220px)]` |
| SupervisorMessagesPage | `SupervisorMessagesPage.tsx:149` | static `height: calc(...)` | → Tailwind `h-[calc(100vh-220px)]` |
| (shared, prompt-flagged) | `forms/components/ProgressBar.tsx:23` | dynamic width | → `Progress` (migrates all call-sites) |

**Divergence from the brief:** none on the headline figure — 6 pages / 25 instances confirmed exactly (RegistryTestPage 20 + the other 5 pages 1 each). The one addition the brief's §3c page-list does not name is the **shared `forms/components/ProgressBar.tsx`** dynamic-width bar (flagged by the prompt), which is *not* a page so it falls outside the "6 pages" framing — include it because converting it is behavior-preserving and removes a dynamic-width inline style the `error`-level rule would otherwise flag. (It is not part of the 25-instance count, which was page-scoped.)

### References
- [Source: _bmad-output/planning-artifacts/epic-12-dashboard-system-refresh-brief.md:67-70] — Track-B design-system drift detail: 6 inline-style pages, dynamic bars → `Progress`, no lint rule yet.
- [Source: _bmad-output/planning-artifacts/epic-12-dashboard-system-refresh-brief.md:81] — 12-2 adds `Progress` + the warn-level inline-style ban + `eslint-plugin-tailwindcss`; flip to error after 12-10/12-11 clear.
- [Source: _bmad-output/planning-artifacts/epic-12-dashboard-system-refresh-brief.md:90-91] — 12-10 retires RegistryTestPage; 12-11 flips the lint rule to error.
- [Source: _bmad-output/planning-artifacts/epic-12-dashboard-system-refresh-brief.md:97] — dependency spine `12-2/12-3 (lint/barrel) → {12-10, 12-11}`.
- [Source: apps/web/src/features/forms/components/ProgressBar.tsx:20-29] — shared dynamic-width bar (`role="progressbar"` + aria) to compose `Progress`.
- [Source: apps/web/src/features/dashboard/pages/OfficialHome.tsx:150-156] — collection-progress bar, ≥100% emerald/maroon switch, `data-testid="progress-bar"`.
- [Source: apps/web/src/features/dashboard/pages/OfficialProductivityPage.tsx:29-40] — local `ProgressBar`, ≥100% green/maroon.
- [Source: apps/web/src/features/dashboard/pages/SystemHealthPage.tsx:37-49] — local `ProgressBar`, red/amber/green thresholds, `data-testid="progress-bar"`.
- [Source: apps/web/src/features/dashboard/pages/EnumeratorMessagesPage.tsx:111] — `style={{ height: 'calc(100vh - 220px)' }}`.
- [Source: apps/web/src/features/dashboard/pages/SupervisorMessagesPage.tsx:149] — `style={{ height: 'calc(100vh - 220px)' }}`.
- [Source: apps/web/src/features/dashboard/pages/RegistryTestPage.tsx:44-93] — 20 static inline styles (retired by 12-10).
- [Source: apps/web/eslint.config.js:47-119] — production `src/**/*.{ts,tsx}` rules block where 12-2's inline-style rule lands and where AC3 flips it to `error`.

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Initial draft (Bob/SM, canonical *create-story). Epic 12 Track-B Tier-1 inline-style migration sweep: dynamic widths → 12-2 `Progress` primitive, arbitrary static styles → Tailwind, then flip the 12-2 inline-style lint rule warn→error. Grounded against the live `style={{` scan (6 pages / 25 instances confirmed) + shared `forms/ProgressBar.tsx`. Depends on 12-2; coordinates with 12-10 (RegistryTestPage retirement = 20/25 instances). Status → ready-for-dev. |
