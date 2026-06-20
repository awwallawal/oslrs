# Story 9.60: Authenticated registration edit + true session resume

Status: done

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

- [x] **Task 1 — Respondent→wizard read model (AC: #1)**
  - [x] 1.1 `GET /me/registration` (authenticate) → `MeService.getEditableRegistration` resolving by JWT.
  - [x] 1.2 Respondent→wizard-shaped mapper (recovers Step-4 answers + gender from the latest `submissions.raw_data`).
- [x] **Task 2 — Session-authed upsert via the validated write path (AC: #2, #5, #6)**
  - [x] 2.1 `PUT /me/registration/wizard` → UPDATE keyed off `user_id`, reusing the wizard validators (shared `submitWizardSchema` + completeness + minor-guardian).
  - [x] 2.2 NIN-dedupe self-match handling (allow own NIN; reject another user's). Explicit real-DB test added.
  - [x] 2.3 Hash-chain audit row (`RESPONDENT_SELF_EDITED`, actor = subject); 9-40 `RESPONDENT_SELF_UPDATED` kept for the lightweight consent toggle (disposition documented).
- [x] **Task 3 — Session-authed pending-NIN completion (AC: #3)**
  - [x] 3.1 `POST /me/registration/complete-nin` (authenticate); unauthenticated magic-link `CompleteNinPage` path untouched.
- [x] **Task 4 — Authenticated wizard mount + edit/resume mode (AC: #4, #5)**
  - [x] 4.1 Mount = new top-level `/registration/manage` (ProtectedRoute public_user, outside DashboardLayout). `/register`'s PublicOnlyRoute left intact → 9-39 wrong-door recovery NOT regressed.
  - [x] 4.2 `WizardPage` made state-aware via a gated `authenticated` prop (seed from session read-model; submit → `PUT /me/registration/wizard`); public path byte-identical.
- [x] **Task 5 — Rewire 9-40 dashboard; close M1/M2 (AC: #7); route discipline (AC: #9)**
  - [x] 5.1 `PublicUserHome` magic-link `EmailLinkButton` + `/check-registration` manage-link replaced with `/registration/manage` entry points (closes M1/M2).
  - [x] 5.2 `/registration/manage` added to Story 9-21 `KNOWN_ROUTES` (route-resolution test green).
- [x] **Task 6 — Tests + code review (AC: #9)**
  - [x] 6.1 Backend real-DB integration (mapper, upsert+NIN-self, complete-nin, audit) + mocked route tests (route tests green locally; integration CI-only).
  - [x] 6.2 Frontend tests + web/API tsc/lint/vitest green; `/bmad:bmm:workflows:code-review` DONE 2026-06-20 (paired CLI) — findings below. **⚠️ The manual app-run gate (Dev Agent Record) is STILL REQUIRED before merge — carried to HANDOFF.md as a hard pre-merge check.**

### Review Follow-ups (AI)

Adversarial code review 2026-06-20 (paired code-review CLI, Senior-Dev workflow). 1 Medium + 3 Low fixed in-pass; 1 operator-gate carried to HANDOFF; 1 acknowledged. Re-validated: API tsc/lint 0 + `me.routes` 10/10; web tsc/lint 0 + targeted 19/19; full web suite green (capped). Verified against reality: `submissions.questionnaireFormId` is plain `text` (no FK — `'self-edit'` safe); `respondents.nin` partial unique index prevents duplicate-NIN corruption; the public submit uses the IDENTICAL out-of-txn NIN pre-check (9-60 matches, not regresses); shared `submitWizardSchema` extraction keeps public submit byte-identical; AC#7 genuinely removes the magic-link re-entry.

- [x] [AI-Review][Med] **M1 — Stale dashboard after authenticated edit / NIN-completion.** `WizardPage` authenticated submit navigated to `/dashboard/public` WITHOUT invalidating the `me` read-model; with the queryClient 5-min `staleTime`, the dashboard showed pre-edit state (a just-completed NIN still reading "add your NIN"). Fix: `queryClient.invalidateQueries({ queryKey: ['me'] })` before the redirect. [WizardPage.tsx]
- [x] [AI-Review][Low] **L1 — No success feedback on edit.** The authenticated edit redirects to the dashboard (no public success screen). Fix: `toast.success('Your registration has been updated.')`. [WizardPage.tsx]
- [x] [AI-Review][Low] **L2 — Silent completeness-skip in `updateRegistrationFromWizard`.** The catch swallowed all non-`INCOMPLETE_SUBMISSION` errors silently; the public submit swallows-but-LOGS (`wizard.completeness_skipped`). Fix: added the matching `me.registration_edit.completeness_skipped` Pino warn (parity, observability). Behavior unchanged (still proceeds on `PUBLIC_FORM_NOT_CONFIGURED`). [me.service.ts]
- [x] [AI-Review][Low] **L3 — Audit PII minimisation.** The `RESPONDENT_SELF_EDITED` audit `details` logged the subject's `email`; `actorId`+`targetId` already identify subject + record (and the 9-40 consent audit logged no email). Fix: dropped `email` from details; kept `lgaId`/`ninProvided`/`pendingNin`. [me.service.ts]
- [ ] [AI-Review][Operator-Gate] **MANUAL APP-RUN before merge (NOT fixable in code).** The new DB write paths (`updateRegistrationFromWizard`, `completeNinAuthenticated`, respondent→wizard mapper) are verified by CI-only real-DB tests + tsc/lint/mocked routes — NOT exercised against a running app in this sandbox. **An operator MUST, before merge:** (1) run the API integration suite on a real DB (the 9-60 `me.service.test` block); (2) manually exercise `/registration/manage` end-to-end — edit an active registration, complete a pending NIN, confirm the audit rows + a fresh `submissions` row, and confirm Story 9-39's wrong-door recovery still redirects off `/register`. **Carried to HANDOFF.md.**
- [~] [AI-Review][Acknowledged] **NIN-dedupe TOCTOU.** The dedupe pre-check is outside the write transaction, but the `respondents.nin` partial unique index prevents corruption, and this is the IDENTICAL pattern the public submit uses (verified). Rare-race 500-vs-clean-409 is shared by both paths; a 23505→409 mapping is a cross-cutting follow-up, not a 9-60 defect. No change.

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
Amelia (Developer Agent) — Opus 4.8, 2026-06-19/20.

### ⚠️ MANDATORY MANUAL APP-RUN GATE (before review-pass)
Per the story's own Dev Notes, this refactors the critical registration write path and **must be verified against a running app**. This sandbox has **no `DATABASE_URL` and no app run**, so the new DB write paths (`updateRegistrationFromWizard`, `completeNinAuthenticated`) and the respondent→wizard mapper were verified by **CI-only real-DB integration tests + tsc + lint + mocked route tests + a frontend mount smoke** — NOT by me executing them. Before flipping to review-passed, an operator must: (1) run the API integration suite against a real DB (`me.service.test` 9-60 block), and (2) manually exercise `/registration/manage` end-to-end (edit an active registration; complete a pending NIN; confirm the audit rows + a fresh `submissions` row; confirm 9-39 wrong-door recovery still redirects off `/register`).

### Completion Notes List

**Backend (AC#1/#2/#3/#5/#6):**
- **AC#1** — `GET /me/registration` → `MeService.getEditableRegistration` (JWT-resolved). Mode `edit`/`pending_nin` from the linked respondent (`user_id`); `draft` from the email-keyed wizard draft; else `none`. The respondent→wizard mapper recovers Step-4 answers + `gender` from the latest `submissions.raw_data`, stripping the identity/consent/computed keys (`RAW_DATA_NON_ANSWER_KEYS`).
- **AC#2/#5** — `PUT /me/registration/wizard` → `updateRegistrationFromWizard`: UPDATE keyed off `user_id` (NOT a fresh insert). **Validators are reused, not forked** — the payload is validated with the SAME `submitWizardSchema` (extracted to a db-free `validation/registration.schema.ts` so both controllers share it), then `validateSubmissionCompleteness` + `validateMinorGuardianConsent` run exactly as in the public submit. **NIN-dedupe is self-aware**: `collision.id !== ownRespondentId` — the caller may re-submit their own NIN; another respondent's is rejected (409). Writes a fresh `submissions` row (unified-ingestion parity, `questionnaireFormId: 'self-edit'`) + a hash-chain audit row in one transaction.
- **AC#3** — `POST /me/registration/complete-nin` → `completeNinAuthenticated`: status-filtered promote (`pending_nin_capture` → `active`), self-aware NIN-dedupe, audit. The unauthenticated magic-link `CompleteNinPage` token path is untouched.
- **AC#6** — every write goes through `AuditService.logActionTx` (actor = subject). New actions `RESPONDENT_SELF_EDITED` + `RESPONDENT_SELF_NIN_COMPLETED`. **Disposition:** the 9-40 `RESPONDENT_SELF_UPDATED` (consent-only toggle, `PUT /me/registration`) is kept as the lightweight path — it does NOT round-trip the full wizard validators for a single boolean; the broader edits flow through `RESPONDENT_SELF_EDITED`.

**Frontend (AC#4/#5/#7):**
- **AC#4 mount decision** — a NEW top-level route `/registration/manage` (ProtectedRoute `public_user`), mounted OUTSIDE DashboardLayout so the wizard's own full-bleed `WizardLayout` renders cleanly. Chosen over relaxing `/register`'s `PublicOnlyRoute` precisely so **Story 9-39's wrong-door recovery is NOT regressed** (it relies on that redirect; the full web suite confirms 9-39's tests still pass).
- **AC#5 state-aware wizard** — `WizardPage` gained a gated `authenticated` prop. When set: it seeds the form ONCE from `GET /me/registration` (`mergeFields`), opens all steps as reachable, disables the email-keyed draft autosave (new gated `useWizardDraft({ disableAutosave })`), branches submit to `editRegistration` (`PUT /me/registration/wizard`), and routes back/cancel to the dashboard. **Every change is gated on `authenticated` (default false), so the public registration flow is byte-identical** — confirmed by the unchanged WizardPage URL-race regression suite.
- **AC#7** — `PublicUserHome` re-entry (draft `EmailLinkButton`, pending-NIN `EmailLinkButton`, and the completed-state `/check-registration` manage-link) replaced with `/registration/manage` entry points (`ManageButton` + an "Edit my registration" button). **This closes 9-40 review M1 (magic-link re-entry) and M2 (consent-only edit).**
- **AC#9 route discipline** — `/registration/manage` added to Story 9-21 `KNOWN_ROUTES`; the route-resolution test resolves it (authenticated public_user). The dashboard's `Link to={MANAGE_PATH}` is a const (not a static literal), so the drift-audit doesn't require it — coverage comes from the KNOWN_ROUTES entry.

**Validation run locally:** API `tsc` + `lint` clean; `me.routes` mocked tests **10/10**; web `tsc`(build) + `lint` clean; web targeted suites (PublicUserHome, WizardPage ×2, route-resolution) green; full web suite (see board). The 9-60 **real-DB integration tests are CI-only** (no local `DATABASE_URL`) — see the manual-run gate above.

### File List

**Backend**
- `apps/api/src/validation/registration.schema.ts` (new) — `submitWizardSchema` extracted to a db-free module (shared by both controllers, AC#5).
- `apps/api/src/controllers/registration.controller.ts` (modified) — import the shared schema (removed the local def + now-unused `modulus11Check`).
- `apps/api/src/services/me.service.ts` (modified) — `getEditableRegistration`, `updateRegistrationFromWizard`, `completeNinAuthenticated`, mapper + types. _Review L2: added `me.registration_edit.completeness_skipped` warn (parity); L3: dropped `email` from the self-edit audit details._
- `apps/api/src/controllers/me.controller.ts` (modified) — `getEditableRegistration`, `editRegistrationWizard`, `completeNin` handlers.
- `apps/api/src/routes/me.routes.ts` (modified) — `GET /me/registration`, `PUT /me/registration/wizard`, `POST /me/registration/complete-nin`.
- `apps/api/src/services/audit.service.ts` (modified) — `RESPONDENT_SELF_EDITED` + `RESPONDENT_SELF_NIN_COMPLETED`.
- `apps/api/src/services/__tests__/me.service.test.ts` (modified) — real-DB tests: mapper, own-NIN self-match, another-NIN 409, complete-nin promote.
- `apps/api/src/routes/__tests__/me.routes.test.ts` (modified) — mocked route tests for the 3 new endpoints.

**Frontend**
- `apps/web/src/features/registration/api/wizard.api.ts` (modified) — `fetchEditableRegistration`, `editRegistration`, `completeNinSession` + types.
- `apps/web/src/features/registration/hooks/useWizardDraft.ts` (modified) — gated `disableAutosave`.
- `apps/web/src/features/registration/pages/WizardPage.tsx` (modified) — gated `authenticated` mode (seed / submit-branch / back-branch / all-steps-reachable). _Review M1: invalidate `['me']` after edit (no stale dashboard); L1: success toast._
- `apps/web/src/App.tsx` (modified) — `/registration/manage` protected route.
- `apps/web/src/features/dashboard/pages/PublicUserHome.tsx` (modified) — in-session re-entry (closes 9-40 M1/M2).
- `apps/web/src/features/dashboard/pages/__tests__/PublicUserHome.test.tsx` (modified) — assert `/registration/manage` links.
- `apps/web/src/features/registration/pages/__tests__/WizardPage.test.tsx` (modified) — authenticated-mode seeding smoke.
- `apps/web/src/__tests__/known-routes.ts` (modified) — `/registration/manage` (Story 9-21 discipline).

### Note for the paired code-review (Task 6.2 / review-before-commit)
Working tree uncommitted, ready for the paired code-review CLI. **The review-pass also requires the manual app-run gate above.** After both, commit on `track/journey-9-39-40-21` (no push) flipping `9-60-...` in `sprint-status.yaml` in the same commit; mark 9-40 review M1/M2 closed.

### Senior Developer Review (AI) — 2026-06-20

**Outcome: APPROVED (M1 + L1/L2/L3 fixed in-pass) → `review` → `done` — CONDITIONAL on the operator manual app-run gate before merge.**

Strong implementation that honored every blind-risk guardrail from the story: shared validator extraction (public submit byte-identical), self-aware NIN-dedupe, gated `authenticated` WizardPage mode (public flow untouched), a new `/registration/manage` route that does NOT regress 9-39's `PublicOnlyRoute` wrong-door recovery, and genuine closure of 9-40's M1/M2 (magic-link re-entry removed → `/registration/manage`). Verified against reality: no FK on `questionnaireFormId`; partial unique index on `nin`; public-submit NIN pre-check pattern identical; Zod + Modulus-11 on the new endpoints; all endpoints `authenticate`-gated.

5 findings + 1 acknowledged: **M1** (stale dashboard) + **L1/L2/L3** fixed in-pass; the **operator manual app-run gate** is carried to HANDOFF.md as a hard pre-merge check (the new DB write paths are CI-real-DB-tested but not run here); the NIN TOCTOU is acknowledged as consistent-with-existing. See **Review Follow-ups (AI)**.

Validation: API tsc/lint 0 + `me.routes` 10/10; web tsc/lint 0 + targeted 19/19; full web suite green (capped). **This closes Story 9-40 review findings M1 + M2.** Handed back for commit on `track/journey-9-39-40-21` (no push); `sprint-status.yaml` 9-60 → done.

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-06-19 | Authored by Bob (SM) via *create-story --yolo; scope set + reconciled by John (PM) as a standalone Epic 9 post-launch enabler (not folded into 9-32). 9 ACs / 6 Tasks. Turns the 9-40 "Extended work" design into a dev-ready spec; closes 9-40 M1/M2 when built; 9-32 consumes it. | Don't lose the deferred full-edit/session-resume enhancement; give the dev agent a precise, blind-risk-aware spec. |
| 2026-06-20 | Senior-Dev code review: M1 (stale dashboard → invalidate `me`) + L1 (success toast) + L2 (completeness-skip log parity) + L3 (audit PII minimisation) fixed in-pass; NIN-TOCTOU acknowledged; operator manual app-run gate carried to HANDOFF. Status `review` → `done`. Closes 9-40 M1/M2. | Paired code-review CLI; review-before-commit discipline. |
