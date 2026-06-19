# Story 9.60: Authenticated registration edit + true session resume

Status: ready-for-dev

<!--
Authored 2026-06-19 by Bob (SM) via canonical *create-story --yolo. Scope set +
reconciled by John (PM): standalone enabler story (NOT folded into 9-32), Epic 9,
post-launch (Phase 3), sequenced BEFORE 9-32 (which consumes it for the NDPA
rectification right). Originates from the 9-40 Dev Agent Record "Extended work —
the heavier full edit / true session resume enhancement (designed, not built)".
This story turns that on-ramp into a developer-ready spec. NOT a launch gate.
-->

## Story

As a **logged-in public user who already registered (or has a draft) via the wizard**,
I want **to edit my submitted registration and continue an in-progress one directly from my dashboard, in my authenticated session — no email round-trip**,
So that **I can correct my own details (NDPA right to rectification) and finish registering in one sitting, instead of waiting on a magic-link email**.

## Acceptance Criteria

1. **AC#1 — Session-authed read.** `GET /api/v1/me/registration` returns the caller's in-progress draft OR completed respondent, mapped into wizard-shaped data via a new **respondent→wizard mapper**. The caller is resolved from the JWT (`authenticate`); no arbitrary identifier is ever accepted (mirrors the 9-38/9-40 `me` discipline).

2. **AC#2 — Session-authed upsert via the validated write path.** `PUT /api/v1/me/registration/wizard` (and/or `POST` for first authenticated write) persists the caller's respondent through the **same validated wizard write path**, keyed off `user_id` — NOT a fresh NIN-dedupe insert. Audited (hash-chain row; actor = subject). **NIN-dedupe interaction is explicitly handled:** an edit that re-submits the user's own NIN must NOT trip the global NIN-uniqueness guard against the user's own existing record (self-match is allowed; a *different* user's NIN is still rejected).

3. **AC#3 — Session-authed pending-NIN completion.** A logged-in `pending_nin_capture` user completes their NIN in-session (e.g. `POST /api/v1/me/registration/complete-nin`), replacing the magic-link **token** gate for authenticated callers. The unauthenticated magic-link redemption path (Story 9-12 `CompleteNinPage`) remains intact for email-link returns.

3. **AC#4 — Authenticated wizard mount (decision required + documented).** Either (a) a dashboard-scoped authenticated wizard mount (e.g. `/dashboard/public/registration`) hydrated from the session, OR (b) relax `/register`'s `PublicOnlyRoute` for `public_user` and make `WizardPage` state-aware (resume / NIN / edit). **Must NOT regress Story 9-39's wrong-door recovery**, which relies on `PublicOnlyRoute` redirecting authenticated visitors off `/register` → `/dashboard`. The chosen approach + its effect on 9-39 is documented in the Dev Agent Record.

4. **AC#5 — Edit mode is prefilled + minimal-diff.** A completed registration opens prefilled from the respondent; only changed fields are written; all edits pass the **same wizard validators** (no parallel validation surface). Keep the wizard pure — no second survey/edit form is forked (SCP guardrail).

5. **AC#6 — Audit on every authenticated edit.** Every write goes through the hash-chain audit (Story 6-1), actor = subject. Reconcile the 9-40 `RESPONDENT_SELF_UPDATED` consent edit so it flows through (or is consistent with) this path; document the disposition.

6. **AC#7 — Rewire the 9-40 dashboard + close its deviations.** `PublicUserHome` replaces the magic-link re-entry (draft + pending-NIN `EmailLinkButton`) and the "Manage your registration → /check-registration" link with the in-session resume/edit entry points. This **closes 9-40 review findings M1 (magic-link re-entry) and M2 (consent-only edit)**. Story 9-32 consumes the same mechanism for NDPA rectification.

7. **AC#8 — Anti-enumeration preserved.** No flow reveals registration state to an unauthenticated stranger; everything new here is behind `authenticate` and scoped to the caller's own record.

8. **AC#9 — Tests + zero regression.** Backend: mapper, `user_id`-keyed upsert **including the NIN-dedupe-self case**, session complete-nin, audit rows (real-DB integration test per the 9-38/9-40 `me.service.test` pattern — runs in CI). Frontend: authenticated mount, resume, edit prefill, state-awareness. **Route-registration discipline (Story 9-21):** if new routes are added, grep `navigate`/`Link`/`redirectTo` targets vs `App.tsx` and add them to `KNOWN_ROUTES`. Full web + API suites green; lint + tsc clean.

## Tasks / Subtasks

- [ ] **Task 1 — Respondent→wizard read model (AC: #1)**
  - [ ] 1.1 `GET /me/registration` (authenticate) → `MeService.getEditableRegistration` resolving by JWT.
  - [ ] 1.2 Respondent→wizard-shaped mapper (inverse of the submit mapping in `submission-processing.service.ts`).
- [ ] **Task 2 — Session-authed upsert via the validated write path (AC: #2, #5, #6)**
  - [ ] 2.1 `PUT /me/registration/wizard` → upsert keyed off `user_id` through the wizard's validated write path.
  - [ ] 2.2 NIN-dedupe self-match handling (allow own NIN; reject another user's). Add the explicit test.
  - [ ] 2.3 Hash-chain audit row (actor = subject); reconcile with 9-40 `RESPONDENT_SELF_UPDATED`.
- [ ] **Task 3 — Session-authed pending-NIN completion (AC: #3)**
  - [ ] 3.1 `POST /me/registration/complete-nin` (authenticate); keep the unauthenticated magic-link `CompleteNinPage` path intact.
- [ ] **Task 4 — Authenticated wizard mount + edit/resume mode (AC: #4, #5)**
  - [ ] 4.1 Decide mount (dashboard-scoped vs PublicOnlyRoute relax) — document + protect 9-39 wrong-door recovery.
  - [ ] 4.2 Make `WizardPage` state-aware (resume / NIN / edit), prefilled from the session read-model.
- [ ] **Task 5 — Rewire 9-40 dashboard; close M1/M2 (AC: #7); route discipline (AC: #9)**
  - [ ] 5.1 Replace `PublicUserHome` magic-link re-entry + manage-link with in-session entry points.
  - [ ] 5.2 If routes added, update Story 9-21 `KNOWN_ROUTES` + the route-resolution audit.
- [ ] **Task 6 — Tests + code review (AC: #9)**
  - [ ] 6.1 Backend real-DB integration (mapper, upsert+NIN-self, complete-nin, audit) + mocked route tests.
  - [ ] 6.2 Frontend tests (mount, resume, edit prefill); web + API tsc/lint/vitest green; `/bmad:bmm:workflows:code-review`.

## Dev Notes

- **Source of truth = the 9-40 Dev Agent Record "Extended work" section** — it specifies this design precisely (read-model mapper, session-authed upsert keyed off `user_id`, session complete-nin, the two mount options). Read it first. [Source: _bmad-output/implementation-artifacts/9-40-public-dashboard-registration-status-home.md#Dev-Agent-Record]
- **Why this story exists:** 9-40 shipped magic-link re-entry + consent-only edit deliberately, to avoid landing a session-authed wizard edit-mode + multi-endpoint write path **blind** (un-exercised). The correctness here — **upsert semantics, the NIN-dedupe ↔ `user_id` interaction, audit targets** — MUST be verified against a running app. That blind-risk is the whole reason it was deferred; respect it (real-DB tests + a manual run before review-pass).
- **Keep the wizard pure** (SCP guardrail): reuse the wizard's validated write path; do NOT fork a second survey/edit surface.
- **Do not regress Story 9-39:** its wrong-door recovery depends on `/register` `PublicOnlyRoute` redirecting authenticated users to `/dashboard`. If you relax that for `public_user`, re-verify 9-39's behavior + tests.
- **HARD deps:** Story 9-38 (`respondents.user_id` link + `me` read-model), 9-18/9-12 (wizard + draft hydration), 6-1 (audit). **Consumer to rewire:** 9-40 (`PublicUserHome`). **Downstream consumer:** 9-32 (NDPA self-service rectification — sequence 9-60 before 9-32).
- **Priority:** post-launch (roadmap Phase 3), before 9-32. **NOT a launch gate.**
- **project-context.md patterns (the bible):** `AppError` not raw `Error`; Pino `{domain}.{action}` events; Zod validation; RBAC `authorize()`/`authenticate`; backend tests in `__tests__/`; TanStack Query key factories; skeleton-not-spinner; shadcn/ui primitives; ESM `.js` import specifiers.

### Project Structure Notes

- Backend: extend `apps/api/src/services/me.service.ts` + `controllers/me.controller.ts` + `routes/me.routes.ts` (the established `me` surface). New respondent→wizard mapper alongside the submit mapper in `services/submission-processing.service.ts`.
- Frontend: `apps/web/src/features/registration/pages/WizardPage.tsx` (state-aware), `features/dashboard/pages/PublicUserHome.tsx` (rewire), `features/dashboard/api/me.api.ts` + hooks (extend).

### References

- [Source: _bmad-output/implementation-artifacts/9-40-public-dashboard-registration-status-home.md#Dev-Agent-Record] — "Extended work" design (primary).
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-public-user-journey-harmonization.md] — journey SCP.
- [Source: apps/api/src/services/me.service.ts, apps/api/src/routes/me.routes.ts, apps/api/src/controllers/me.controller.ts]
- [Source: apps/web/src/features/registration/pages/WizardPage.tsx; apps/api/src/services/submission-processing.service.ts]
- [Source: apps/web/src/features/dashboard/pages/PublicUserHome.tsx] — 9-40 consumer to rewire (closes M1/M2).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-06-19 | Authored by Bob (SM) via *create-story --yolo; scope set + reconciled by John (PM) as a standalone Epic 9 post-launch enabler (not folded into 9-32). 9 ACs / 6 Tasks. Turns the 9-40 "Extended work" design into a dev-ready spec; closes 9-40 M1/M2 when built; 9-32 consumes it. | Don't lose the deferred full-edit/session-resume enhancement; give the dev agent a precise, blind-risk-aware spec. |
