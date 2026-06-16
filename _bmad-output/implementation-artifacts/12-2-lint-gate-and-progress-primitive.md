# Story 12.2: Lint gate + Progress primitive

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Drafted 2026-06-16 by Bob (SM) via *create-story (Epic 12 Tier-0 foundation). Track-B design-system enforcement: the primitive + the rule, NOT the migrations (those are 12-10/12-11). POST-LAUNCH, NON-GATING. -->

## Story

As a **front-end developer maintaining the OSLRS dashboards**,
I want **a shared `Progress` primitive for legitimate dynamic widths plus a lint rule that bans *arbitrary* inline `style={{}}` and lints Tailwind usage**,
so that **design-system drift is mechanically prevented going forward — dynamic runtime values flow through one accessible primitive instead of hand-rolled inline styles, and CI catches new violations instead of relying on review vigilance.**

## Context & Why (the verified problem this resolves)

shadcn/ui *is* set up (16 `components/ui` primitives + `components.json` + `cn()`) and mostly used — **but its use is never enforced.** Two concrete gaps:

1. **No `Progress` primitive.** Several surfaces hand-roll dynamic progress bars with inline `style={{ width: `${pct}%` }}` — a *legitimate* runtime value (you cannot express a computed percentage as a static Tailwind class), but each one is a bespoke `<div>` with no shared a11y semantics. Prod examples: `apps/web/src/features/forms/components/ProgressBar.tsx:23` and `apps/web/src/features/dashboard/pages/OfficialHome.tsx:154` both use `style={{ width: `${pct}%` }}`. These should migrate to one `Progress` primitive — **not** be banned outright.
2. **No lint rule** in `apps/web/eslint.config.js` bans *arbitrary* inline `style={{}}` or lints Tailwind class usage. The codebase carries arbitrary inline styles on **6 dashboard pages / 25 instances** (verified by `style={{` grep, excluding test files and the legitimate dynamic-width chart bars): `RegistryTestPage` (20 — a test page slated for retirement in 12-10), plus `EnumeratorMessagesPage`, `OfficialHome`, `OfficialProductivityPage`, `SupervisorMessagesPage`, `SystemHealthPage` (1 each).

**This is the keystone of Track B's *enforcement* half:** ship the affordance (`Progress`) and the guard (lint rules) here, so the migration sweeps (12-10 raw-table, 12-11 inline-style) have a target to migrate *to* and a rule to flip *on*.

**POST-LAUNCH, NON-GATING.** No Field Readiness Certificate (FRC) item depends on this story; it must not block the field survey or the re-engagement blasts. Reuse the existing shadcn primitives + `cn()` — compose, do not rebuild.

### Dependencies, sequencing & effort
- **Tier 0 (foundation)** alongside 12-1 (DataTable), 12-3 (barrel-split), 12-4 (registryTotals). Independent of those — can land in parallel.
- **Blocks / feeds:** `12-2/12-3 → {12-10, 12-11}`. 12-11 (inline-style migration sweep) migrates the 6 pages to `Progress` / remove arbitrary styles **and then flips this story's inline-style rule from warn → error**. 12-10 (raw-table sweep) retires `RegistryTestPage` (which holds 20 of the 25 instances).
- **⚠️ Enforcement-cutover decision (SM, baked in):** land the inline-style ban at **`warn`** (CI stays green — `pnpm lint` must report 0 *errors* on the current tree) in THIS story. The flip to **`error`** is explicitly deferred to **12-11**, after the offending surfaces are migrated. Landing it as `error` now would red-CI on the existing 25 instances. (Alternative the dev may choose: scope the rule to error only in already-clean directories via an eslint `files`/`ignores` override — but the simpler warn-now/error-in-12-11 path is recommended.) The `eslint-plugin-tailwindcss` rules may land at their plugin defaults provided they produce **0 errors** on the current tree; downgrade to `warn` any that don't.
- **Effort:** ~0.5–1 dev-day.

## Acceptance Criteria

### AC1 — `Progress` primitive (shadcn, Radix-backed)
1. A `Progress` primitive is added at `apps/web/src/components/ui/progress.tsx`, following the existing house style (verified against `badge.tsx`/`skeleton.tsx`): `cn` imported from `../../lib/utils`, a `data-slot` attribute, full `className` passthrough, a named export. It wraps `@radix-ui/react-progress` (added as a dependency — see AC4), accepts a `value` (0–100) prop, and renders the indicator width from that value so consumers never write inline `style`.
2. The primitive is accessible by default (Radix provides `role="progressbar"` + `aria-valuenow/min/max`); a short usage note documents the intended replacement for `style={{ width: `${pct}%` }}` bars.
3. **No page migrations in this story** — only the primitive is added. The actual migration of the 6 pages + the dynamic-width bars happens in 12-11.

### AC2 — Tailwind lint plugin
1. `eslint-plugin-tailwindcss` is added as a devDependency (exact version pin, in lockstep with the repo's ESLint major) and wired into `apps/web/eslint.config.js` (flat config).
2. Its rules produce **0 errors** on the current tree — any rule that would error on existing code is set to `warn` (or its default if already non-erroring). `pnpm lint` exit code is unchanged (still passes).

### AC3 — Arbitrary inline-`style` ban (warn now, error in 12-11)
1. A lint rule is added to `apps/web/eslint.config.js` that flags arbitrary inline `style={{}}` on DOM elements — via `react/forbid-dom-props` (`forbid: ['style']`) **or** a `no-restricted-syntax` JSXAttribute selector. The rule's message points the developer to the `Progress` primitive / a CSS variable for dynamic values.
2. The rule lands at **`warn`** severity (or directory-scoped) so `pnpm lint` reports **0 errors** on the current tree (which still has 25 instances). The story documents — in Dev Notes and a code comment by the rule — that **12-11 flips it to `error`** after migration.
3. The rule does **not** ban dynamic values categorically; the documented escape hatch is "route through `Progress` or a CSS custom property," not "never use computed widths."

### AC4 — Verification
1. `pnpm lint` (web) passes with 0 errors on the unchanged tree (warnings permitted).
2. `pnpm --filter @oslsr/web build` (vite build) and `tsc --noEmit` (web) both pass with the new dependency + primitive.
3. A render/smoke test for `Progress` (co-located `progress.test.tsx`) asserts it renders the indicator at a given `value` and exposes the progressbar role.

## Tasks / Subtasks

- [ ] Task 1 — Add the `Progress` primitive (AC: #1, #2)
  - [ ] Add `@radix-ui/react-progress` to `apps/web/package.json` (exact pin) + `pnpm install`.
  - [ ] Create `apps/web/src/components/ui/progress.tsx` matching `badge.tsx`/`skeleton.tsx` house style (`cn` from `../../lib/utils`, `data-slot`, `className` passthrough, named export).
  - [ ] Add a short usage note (JSDoc on the component or a line in the components doc) describing the `style={{ width }}` replacement.
- [ ] Task 2 — Add `eslint-plugin-tailwindcss` (AC: #2)
  - [ ] Add the plugin as a devDependency (exact pin) + wire into `eslint.config.js`.
  - [ ] Run `pnpm lint`; downgrade to `warn` any tailwindcss rule that errors on the current tree.
- [ ] Task 3 — Add the arbitrary inline-`style` ban at warn level (AC: #3)
  - [ ] Add `react/forbid-dom-props` (forbid `style`) or a `no-restricted-syntax` JSXAttribute rule at `warn`, with a message pointing to `Progress` / CSS-var.
  - [ ] Add a code comment by the rule noting the 12-11 flip-to-`error` cutover.
- [ ] Task 4 — Verification + tests (AC: #4)
  - [ ] `pnpm lint` (0 errors), `pnpm --filter @oslsr/web build`, `tsc --noEmit` all green.
  - [ ] Co-located `progress.test.tsx` render/role smoke test.

## Dev Notes

### Project-bible compliance (the dev MUST follow — project-context.md)
- **shadcn house style:** match the existing `components/ui` primitives exactly — `cn` from `../../lib/utils` (relative, NOT the `@/` alias, per the existing primitives), `data-slot` attribute, `className` passthrough, named export. Confirmed against `badge.tsx`/`skeleton.tsx`.
- **No spinners:** unrelated to this story, but the `Progress` primitive is a determinate progress bar, not a loading spinner — loading states still use the skeleton components.
- **Tests:** web tests are co-located (`progress.test.tsx` next to `progress.tsx`).
- **Version pins:** new deps (`@radix-ui/react-progress`, `eslint-plugin-tailwindcss`) get **exact** pins in lockstep with the repo's React 18.3 / ESLint major; bounded `>=x <nextMajor` if a range is unavoidable (project lesson: unbounded `>=` silently jumps majors).

### Reuse, don't fork
- Do NOT hand-roll a progress bar — wrap `@radix-ui/react-progress` exactly as the other shadcn primitives wrap their Radix counterparts.
- Do NOT migrate any page here. The 6 inline-style pages + the dynamic-width chart bars (`ProgressBar.tsx`, `OfficialHome.tsx`) are 12-11's scope. This story only provides the destination + the rule.

### Enforcement cutover (the load-bearing decision)
Landing the inline-style ban as `error` now would red-CI on the existing 25 instances across 6 pages. Therefore: **warn now, error in 12-11.** The pre-push gate already runs lint+tsc+build+test, so a future arbitrary `style={{}}` will surface as a warning immediately and become a hard error once 12-11 clears the backlog and flips the severity.

### Project Structure Notes
- Primitive: `apps/web/src/components/ui/progress.tsx` (+ co-located test) — joins the existing 16 `components/ui` primitives.
- Lint config: `apps/web/eslint.config.js` (flat config) — add the tailwindcss plugin + the inline-style rule.
- No API, schema, or backend changes. No new routes.

### References
- [Source: apps/web/src/components/ui/badge.tsx] — house style for a shadcn primitive (`cn` import path, `data-slot`, named export).
- [Source: apps/web/src/components/ui/skeleton.tsx] — second house-style reference; the loading-state primitive (not replaced by Progress).
- [Source: apps/web/eslint.config.js] — current flat config; no inline-style/tailwind rule present.
- [Source: apps/web/src/features/forms/components/ProgressBar.tsx:23] — legitimate dynamic-width bar to migrate to `Progress` (in 12-11), not ban.
- [Source: apps/web/src/features/dashboard/pages/OfficialHome.tsx:154] — second dynamic-width example; OfficialHome is one of the 6 inline-style pages.
- [Source: _bmad-output/planning-artifacts/epic-12-dashboard-system-refresh-brief.md §3c] — Track-B drift work-list (6 inline-style pages / 25 instances; "several are dynamic width bars → migrate to a Progress primitive, not banned outright").
- [Source: _bmad-output/implementation-artifacts/12-11-inline-style-migration-sweep.md] — the consumer story that migrates the pages + flips this rule to `error`.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story drafted via SM *create-story (Epic 12 Tier-0 foundation, Track-B design-system enforcement). Scope: add the `Progress` primitive + the Tailwind lint plugin + the arbitrary-inline-`style` ban at `warn` (error-cutover deferred to 12-11). Reality-grounded: `progress.tsx`/`@radix-ui/react-progress` confirmed absent (story adds both); inline-style count confirmed 6 pages / 25 instances. Status → ready-for-dev. |
