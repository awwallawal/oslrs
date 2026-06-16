# Story 12.3: @oslsr/utils barrel-split — client-safe entry + server subpath (build-hygiene guard)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-16 by Bob (SM) via the create-story workflow against the create-story checklist + project-context.md. CARVED OUT of 9-59's "ex-Task 6" (see 9-59 Dev Notes "Carved out (SM, 2026-06-16)" note, line ~80): the @oslsr/utils barrel-split / lint-enforcement hygiene is a design-system / build-hygiene concern, not part of the export feature — it belongs in Epic 12 "Dashboard System Refresh", Track B (build-hygiene foundation), as its own small story. GROUNDED in the real package.json exports, src/index.ts barrel, and the actual web deep-import workaround comments (FormFillerPage.tsx:22-24, ClerkDataEntryPage.tsx:15-17). POST-LAUNCH, NON-GATING. -->

## Story

As a **developer on the OSLRS web + api codebase**,
I want **`@oslsr/utils` split into a client-safe entry and an explicit `@oslsr/utils/server` subpath, with a guard that fails fast when web code imports server-only code through the barrel**,
so that **a future `import … from '@oslsr/utils'` in the web app cannot silently pull server-only code (bcrypt / `node:crypto`) into the browser bundle and break `vite build` — the exact failure mode the 9-58 work hit.**

> **POST-LAUNCH, NON-GATING — no FRC item depends on this story; it must NOT block the field survey or the re-engagement (Cohort A/B) blasts.** This is pure build-hygiene / developer-experience: it codifies an import boundary that today is enforced only by hand-written "do not use the barrel" comments. It is one of the **Epic 12 Track-B build-hygiene foundation** stories.

## Context & Why (the root-cause this resolves)

`@oslsr/utils` (`packages/utils`) has **no `dist/`** — its `main`/`module`/`types` all point straight at `./src/index.ts` (TS source), consumed by both `apps/api` and `apps/web` over the pnpm workspace [Source: packages/utils/package.json:6-16]. The bare barrel re-exports **everything**, including server-only code:

```ts
// packages/utils/src/index.ts
export * from './errors.js';            // AppError — pure, but server-convention home
export * from './crypto.js';            // SERVER-ONLY: imports node:crypto + bcrypt
export * from './validation.js';        // client-safe (pure)
export * from './skip-logic.js';        // client-safe (pure; type-only @oslsr/types)
export * from './xlsform-calculate.js'; // client-safe (pure; type-only @oslsr/types)
export * from './form-completeness.js'; // client-safe (pure)
export * from './minor-guardian.js';    // client-safe (pure)
export * from './reference-code.js';    // client-safe (pure)
```

[Source: packages/utils/src/index.ts:1-8]

`crypto.ts` imports `node:crypto` and `bcrypt` at the top of the module [Source: packages/utils/src/crypto.ts:1-2]. Because the barrel re-exports it, **any** `import { … } from '@oslsr/utils'` in the web app would drag bcrypt + `node:crypto` into the Vite browser bundle, which cannot be bundled — this is the `vite build` break the 9-58 work hit.

The web app **dodges this today by deep-importing** the specific client-safe modules and never the barrel — with hand-written warning comments that are the only thing keeping the boundary intact:

```tsx
// apps/web/src/features/forms/pages/FormFillerPage.tsx:22-24
// Deep import (NOT the @oslsr/utils barrel) so the browser bundle does not pull
// in server-only crypto.ts (bcrypt + node:crypto) — vite can't bundle that.
import { generateReferenceCode } from '@oslsr/utils/src/reference-code';
```

[Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:22-24; apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx:15-17]

Every web `@oslsr/utils` import uses the `@oslsr/utils/src/<module>` deep-path form — `validation`, `xlsform-calculate`, `form-completeness`, `minor-guardian`, `reference-code` [Source: apps/web/src/features/forms/utils/formSchema.ts:2; apps/web/src/features/forms/components/FormRenderer.tsx:14; apps/web/src/features/registration/lib/review-completeness.ts:10-12; apps/web/src/features/forms/hooks/useNinCheck.ts:2; apps/web/src/features/registration/pages/Step1BasicInfo.tsx:3]. The api, by contrast, freely imports `AppError` and others through the bare barrel across ~96 files [Source: apps/api/src/controllers/export.controller.ts:11 `import { AppError } from '@oslsr/utils'`].

The boundary works only because a human remembered to comment it. **This story makes the boundary structural** (package `exports` subpaths) **plus adds a fail-fast guard** so a future bare-barrel import in web breaks at lint/build time, not in a surprise production bundle.

This is an analogue of the existing project rule **"Drizzle schema files must NOT import from `@oslsr/types`"** (drizzle-kit runs compiled JS without a `dist/`) — same class of "a barrel re-export silently pulls in something the consumer can't run" hazard.

### Dependencies, sequencing & effort

- **Epic:** 12 — Dashboard System Refresh, **Track B (build-hygiene foundation)**. _[Source: epic-12-dashboard-system-refresh-brief.md]_
- **Carved out of:** Story 9-59 "ex-Task 6" — see the 9-59 "Carved out (SM, 2026-06-16)" note [Source: _bmad-output/implementation-artifacts/9-59-unified-registry-export.md:80].
- **Dependency spine:** `12-2 / 12-3 -> { 12-10, 12-11 }` — 12-3 (with 12-2) is the Track-B build-hygiene foundation that the later Track-B stories (12-10, 12-11) build on. 12-3 has **no upstream code dependency** and can be done independently.
- **Reuses (do NOT fork):** the existing pnpm-workspace `exports` map already present in `packages/utils/package.json` (it already exposes five `./src/<module>` subpaths) — extend it; do not rewrite it. Reuse the web app's existing deep-import call sites (no churn needed there if the chosen exports-map shape preserves the `@oslsr/utils/src/<module>` specifiers).
- **Effort:** ~0.5–1 dev-day.
- **POST-LAUNCH, NON-GATING** — must not block the field survey or the Cohort A/B re-engagement blasts.

## Acceptance Criteria

### AC1 — Client-safe entry excludes server-only modules
1. The `@oslsr/utils` package exposes a **client-safe** import surface that re-exports ONLY the pure modules (`validation`, `skip-logic`, `xlsform-calculate`, `form-completeness`, `minor-guardian`, `reference-code`, and `errors`/`AppError`) and does NOT transitively pull in `crypto.ts` (the only `node:crypto` + `bcrypt` module).
2. The bare `@oslsr/utils` barrel must NOT, by any import path reachable from the web app's chosen entry, transitively load `crypto.ts`.

### AC2 — Explicit server subpath for server-only code
1. Server-only code is reachable from a dedicated `@oslsr/utils/server` subpath (or equivalent explicit non-client entry) that exposes the `crypto.ts` exports (`hashPassword`, `comparePassword`, `sha256Hex`, `hashInvitationToken`, `generateInvitationToken`, `generateVerificationToken`, `generateOtpCode`, `encryptToken`, `decryptToken`, `requireEncryptionKey`).
2. The api keeps working: its existing `import { AppError } from '@oslsr/utils'` (and any other current barrel imports across the ~96 api files) continue to resolve. Where the api imports crypto helpers, those resolve from the appropriate entry (bare barrel or `/server`) without code churn beyond what the chosen split requires.

### AC3 — Web imports continue to resolve from the client entry
1. Every existing web `@oslsr/utils/src/<module>` deep-import (FormFillerPage, ClerkDataEntryPage, FormRenderer, formSchema, useNinCheck, Step1BasicInfo, PersonalInfoStep, review-completeness, and the test `vi.mock` specifiers) continues to resolve and bundle. No web call site is forced to break unless intentionally migrated to a cleaner client entry as part of this story (in which case ALL of them are migrated consistently and the deep-path comments updated).

### AC4 — `vite build` passes (the load-bearing acceptance — NOT just tsc)
1. `pnpm --filter @oslsr/web build` (the real `vite build`) completes successfully. This is the canonical regression check, because the 9-58 break manifested as a Vite bundling failure that `tsc --noEmit` does not catch.
2. `tsc --noEmit` passes in `apps/web`, `apps/api`, and `packages/utils`.

### AC5 — Fail-fast guard against future web->server-barrel imports
1. A guard exists so a future web file importing server-only code through the bare `@oslsr/utils` barrel (or directly importing `@oslsr/utils/src/crypto` / `@oslsr/utils/server` from web) fails fast — at lint and/or build time, not silently in a shipped bundle. Acceptable implementations (dev's choice, documented in Dev Notes):
   - an ESLint `no-restricted-imports` rule scoped to `apps/web/**` banning the bare `@oslsr/utils` barrel and the server subpath (steering to the client-safe deep paths / client entry), OR
   - a package `exports` map shape that makes the server code unreachable from the client entry such that the import errors at build, plus a thin lint guard for the bare-barrel specifier.
2. The guard is demonstrated to actually fire: a deliberate violating import (in a scratch/throwaway file or a lint-rule unit assertion) produces a lint error or build failure, then is removed.

### AC6 — Tests + version pins
1. `pnpm --filter @oslsr/utils test` (existing utils vitest suite, incl. `crypto.test.ts`) stays green; api + web suites show no regressions from the import-surface change.
2. Any new dev dependency added for the guard (e.g. an ESLint plugin) is pinned with a **bounded** range (`>=x <nextMajor`), never an unbounded `>=` — per the project "bounded overrides" rule.

## Tasks / Subtasks

- [ ] Task 1 — Decide + document the split strategy (AC: #1, #2, #5)
  - [ ] Choose the implementation: package `exports`-subpath split (`.` = client-safe, `./server` = crypto) and/or an ESLint `no-restricted-imports` guard. Record the decision + rationale in Dev Notes (the Project Structure Notes section), noting the analogy to the "Drizzle schema must not import `@oslsr/types`" rule.
  - [ ] Confirm the **real split surface** from grounding: server-only = `crypto.ts` (only module importing `node:crypto` + `bcrypt`); client-safe = `validation`, `skip-logic`, `xlsform-calculate`, `form-completeness`, `minor-guardian`, `reference-code`, `errors` (all pure; only type-only `@oslsr/types` imports).

- [ ] Task 2 — Implement the client-safe entry (AC: #1, #3)
  - [ ] Create a client-safe barrel/index that re-exports ONLY the pure modules (NOT `crypto.js`). Either repurpose `src/index.ts` as the client-safe entry (drop the `crypto.js` re-export from it) or add a dedicated client index — whichever keeps existing web deep-import specifiers working.
  - [ ] Update `packages/utils/package.json` `exports` so `.` resolves to the client-safe entry and the existing `./src/<module>` subpaths still resolve (so the web deep-imports keep working). Keep `main`/`module`/`types` consistent with the no-`dist` source-pointed convention.

- [ ] Task 3 — Implement the `@oslsr/utils/server` subpath (AC: #2)
  - [ ] Add a `./server` export entry resolving to a server index that exposes `crypto.ts` (and any other server-only code added later). Update api crypto-helper imports to the `/server` subpath if (and only if) the chosen split removes them from the bare barrel; otherwise leave api barrel imports untouched (AppError etc. stay on `.`).
  - [ ] Verify api `AppError` imports (e.g. `export.controller.ts:11`) still resolve from the chosen client-safe/bare entry.

- [ ] Task 4 — Add the fail-fast guard + prove it fires (AC: #5)
  - [ ] Add the ESLint `no-restricted-imports` rule (scoped to `apps/web/**`) banning the bare `@oslsr/utils` barrel + the `/server` + `…/src/crypto` specifiers, with a message pointing devs at the client-safe deep paths / client entry. (If using exports-map-only enforcement, still add the bare-barrel lint guard.)
  - [ ] Demonstrate the guard fires: add a deliberate violating web import, confirm lint error / build failure, then remove it (or encode the assertion in a lint-rule test). Record the demonstration in the Dev Agent Record.

- [ ] Task 5 — Acceptance: `vite build` + tsc + suites (AC: #4, #6)
  - [ ] Run `pnpm --filter @oslsr/web build` (real `vite build`) — MUST pass. This is the load-bearing acceptance.
  - [ ] Run `tsc --noEmit` in `apps/web`, `apps/api`, `packages/utils` — all clean.
  - [ ] Run `pnpm --filter @oslsr/utils test` (incl. `crypto.test.ts`) + api + web suites — green, no regressions.
  - [ ] If a guard dependency was added, confirm its version range is bounded (`>=x <nextMajor`) and `pnpm audit --prod` is clean.

## Dev Notes

### Project-bible compliance (the dev MUST follow these — project-context.md)
- **No `dist/` convention:** `@oslsr/utils` is consumed as TS source over the workspace (`main`/`module`/`types` -> `./src/index.ts`). Preserve this — do NOT introduce a build step for the package as part of this story; the split is via `exports` map + index shaping only.
- **ESM `.js` specifiers:** the barrel uses `./errors.js` etc. (ESM-correct extensions on relative imports). Any new index file must follow the same `.js`-suffixed relative-import convention.
- **AppError not raw Error:** `errors.ts` is the home of `AppError` (project rule: throw `AppError`, never raw `Error`). It is technically pure (no node builtins) but lives with server-convention utils; keep it reachable from BOTH the client entry and the api barrel so neither side regresses. (Note: `crypto.ts` itself throws raw `Error` in `encryptToken`/`decryptToken`/`requireEncryptionKey` — that is PRE-EXISTING and OUT OF SCOPE here; do not refactor it in this story.)
- **Bounded version pins:** any new ESLint plugin/dep gets `>=x <nextMajor`, never unbounded `>=` (project "prod-audit bounded overrides" rule — unbounded `>=` silently jumps majors).
- **Tests:** utils tests live in `packages/utils/src/__tests__/` (e.g. `crypto.test.ts` imports `node:crypto` directly — server-side, unaffected by the client split). Web tests are co-located and `vi.mock('@oslsr/utils/src/validation', …)` against the deep paths — keep those specifiers resolvable.

### The real split surface (grounded 2026-06-16)
- **SERVER-ONLY (must NOT reach the web bundle):** `crypto.ts` — the only module importing `node:crypto` + `bcrypt` [Source: packages/utils/src/crypto.ts:1-2]. Exports: `generateInvitationToken`, `sha256Hex`, `hashInvitationToken`, `hashPassword`, `comparePassword`, `generateVerificationToken`, `generateOtpCode`, `encryptToken`, `decryptToken`, `requireEncryptionKey`.
- **CLIENT-SAFE (pure; only type-only `@oslsr/types` imports):** `validation.ts`, `skip-logic.ts`, `xlsform-calculate.ts`, `form-completeness.ts`, `minor-guardian.ts`, `reference-code.ts`, `errors.ts` [Source: grep of `packages/utils/src` — only `crypto.ts` pulls node builtins; the others import at most `import type { … } from '@oslsr/types'` and `./skip-logic.js`].
- **Why `vite build` is the acceptance, not `tsc`:** `tsc --noEmit` happily type-checks a `from '@oslsr/utils'` import — the failure only surfaces when Vite tries to *bundle* `bcrypt` / `node:crypto` for the browser. The 9-58 break was exactly this. So AC4.1 runs the real `vite build`.

### Implementation guidance (don't over-engineer)
- Smallest correct change: drop `export * from './crypto.js';` out of the client-facing barrel (`src/index.ts` becomes the client-safe entry), add a `src/server.ts` that re-exports `./crypto.js`, and add `"./server": "./src/server.ts"` to `exports`. Then point the api's crypto-helper imports at `@oslsr/utils/server`. AppError stays on `.` (works for both web and api).
- Verify the existing five `./src/<module>` subpath exports stay intact so the web deep-imports (`@oslsr/utils/src/validation`, `…/src/reference-code`, etc.) keep resolving with zero web churn — the cleanest outcome leaves the comment-guarded deep-import call sites working as-is while ALSO making the barrel safe.
- The ESLint guard is belt-and-suspenders: even with the exports split, a bare `from '@oslsr/utils'` in web should be a lint error so the intent is explicit and a reviewer doesn't have to reason about transitive bundling.

### Project Structure Notes
- `packages/utils/package.json` — `exports` map already has `.` + five `./src/<module>` subpaths [Source: packages/utils/package.json:9-16]; this story extends it with a `./server` (or equivalent) and re-targets `.` to a client-safe entry.
- `packages/utils/src/index.ts` — current all-inclusive barrel [Source: packages/utils/src/index.ts:1-8]; becomes (or is paired with) the client-safe entry.
- New file expected: `packages/utils/src/server.ts` (server-only re-export barrel) — if the exports-subpath strategy is chosen.
- ESLint config for the web app (root or `apps/web`) gains the `no-restricted-imports` rule scoped to `apps/web/**`.
- No source-logic changes to any util module; this is a packaging/boundary story only.

### References
- [Source: packages/utils/package.json:6-16] — `main`/`module`/`types` -> `./src/index.ts`; `exports` map with `.` + five `./src/<module>` subpaths.
- [Source: packages/utils/src/index.ts:1-8] — the all-inclusive barrel (re-exports `crypto.js`).
- [Source: packages/utils/src/crypto.ts:1-2] — `import { … } from 'node:crypto'` + `import bcrypt from 'bcrypt'` (the server-only surface).
- [Source: packages/utils/src/errors.ts:1-11] — `AppError` (pure; shared by client + api barrel).
- [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:22-24] — the hand-written "deep import NOT the barrel" workaround comment + specifier.
- [Source: apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx:15-17] — same workaround.
- [Source: apps/web/src/features/forms/components/FormRenderer.tsx:14; apps/web/src/features/registration/lib/review-completeness.ts:10-12; apps/web/src/features/forms/utils/formSchema.ts:2; apps/web/src/features/forms/hooks/useNinCheck.ts:2] — the full set of web deep-import call sites AC3 must keep working.
- [Source: apps/api/src/controllers/export.controller.ts:11] — `import { AppError } from '@oslsr/utils'` (representative api bare-barrel consumer that AC2.2 must not break; ~96 api files import from the barrel).
- [Source: _bmad-output/implementation-artifacts/9-59-unified-registry-export.md:80] — the "Carved out (SM, 2026-06-16)" note this story originates from.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-06-16 | Story authored by Bob (SM) via create-story workflow. Carved out of 9-59 "ex-Task 6" into Epic 12 Track-B build-hygiene foundation. Grounded against real packages/utils/package.json exports, src/index.ts barrel, crypto.ts node-builtin imports, and the web deep-import workaround comments. AC4 mandates a real vite build (not just tsc) as the load-bearing acceptance. Status to ready-for-dev. |
