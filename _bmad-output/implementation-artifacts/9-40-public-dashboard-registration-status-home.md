# Story 9.40: Public-User Dashboard — registration-status home (replace the legacy mock)

Status: ready-for-dev

<!--
Authored 2026-06-06 by Bob (SM) via canonical *create-story --yolo, routed by
the Public-User Journey Harmonization SCP (sprint-change-proposal-2026-06-06).
Replaces the legacy Story 2.5-8 PublicUserHome (hardcoded "2 of 5 steps" +
"Start Survey", wizard-unaware) with a registration-status home that reflects
the user's real state and lets a completed user view/edit their registration.
-->

## Story

As a **logged-in public user who registered via the wizard**,
I want **my dashboard to show my real registration status and let me continue, view, or edit it**,
So that **I'm never told to "start the survey over", and I can pick up exactly where I left off or manage what I already submitted**.

## Acceptance Criteria

1. **AC#1 — Registration-status state machine drives the home.** `PublicUserHome` is rewritten to render off `GET /me/registration-status` (Story 9-38 read-model) with four states:
   - **No respondent, no draft** → "Let's get you registered" → start the wizard.
   - **Draft in progress** → "Continue — Step X of N" → authenticated wizard resume (AC#3).
   - **Registered, NIN pending** (`respondent.status = pending_nin_capture`) → "Add your NIN to finish" → resume at the NIN step.
   - **Fully registered** (`status = active`) → "✓ Registration complete" → read-only summary + Edit (AC#4) + marketplace status (AC#5).
   The **hardcoded "Profile Completion: 2 of 5 steps" card and the "Start Survey" CTA are removed** [Source: apps/web/src/features/dashboard/pages/PublicUserHome.tsx:104-135].

2. **AC#2 — Real data, not mocks.** All status/progress shown is derived from the read-model (respondent summary + wizard-draft step), never hardcoded. Loading + error states handled (skeleton; graceful fallback if the read-model is unavailable).

3. **AC#3 — Authenticated wizard resume.** A logged-in user with an in-progress draft resumes directly from the dashboard ("Continue registration") — no magic-link round-trip. Reuses the wizard's existing draft-hydration but keyed off the authenticated session/email rather than a `wizard_resume` token. The unauthenticated magic-link resume path (Story 9-12) remains for email-link returns.

4. **AC#4 — View + edit the submitted registration.** A fully-registered user sees a read-only summary of what they submitted (identity, LGA, NIN status, key survey answers) AND can edit it (re-enter the wizard in edit mode, or an inline edit surface — dev judgment). Edits write through the same validated path the wizard uses; audit-logged. (Per Awwal 2026-06-06: completed-user dashboard is editable.)

5. **AC#5 — Marketplace status surface.** The dashboard shows the user's marketplace opt-in / profile status (Epic 7 tie-in). Where Epic 7 functionality isn't live yet, show an honest "opted in / not opted in" state from `consentMarketplace` rather than the current hardcoded "Coming Soon" mock. (Per Awwal 2026-06-06: see marketplace status.)

6. **AC#6 — Retire the legacy survey-from-dashboard path.** The old "Start Survey" → `PublicSurveysPage` flow (parallel to the wizard, pre-wizard model) is retired or reconciled so there is ONE registration path (the wizard). No dead "start a second survey" entry remains. Document the disposition.

7. **AC#7 — Tests + zero regression.** `PublicUserHome` tests rewritten for the four states (mock the read-model). Resume, edit, and marketplace surfaces covered. Removal of the legacy survey path doesn't break routing (grep navigate-targets vs App.tsx per route-registration discipline). Full web + API suites green.

## Tasks / Subtasks

- [ ] **Task 1 — Consume the read-model (AC: #1, #2)**
  - [ ] 1.1 `useRegistrationStatus` hook over `GET /me/registration-status` (9-38).
  - [ ] 1.2 Rewrite `PublicUserHome` as the 4-state machine; delete hardcoded "2 of 5" + "Start Survey".
- [ ] **Task 2 — Authenticated resume (AC: #3)**
  - [ ] 2.1 "Continue registration" → wizard hydrated from session/email; keep magic-link resume intact.
- [ ] **Task 3 — View/edit + marketplace (AC: #4, #5)**
  - [ ] 3.1 Read-only summary + edit affordance (audit-logged write-through).
  - [ ] 3.2 Marketplace status from real consent/Epic-7 state.
- [ ] **Task 4 — Retire legacy survey path (AC: #6)**
  - [ ] 4.1 Remove/reconcile "Start Survey" → PublicSurveysPage; verify routes.
- [ ] **Task 5 — Tests + code review (AC: #7)**
  - [ ] 5.1 Rewrite PublicUserHome tests (4 states) + resume/edit/marketplace.
  - [ ] 5.2 Web + API tsc/lint/vitest green; `/bmad:bmm:workflows:code-review`.

## Dev Notes

- **The thing being replaced.** `PublicUserHome` is legacy Story 2.5-8: hardcoded `<p>2 of 5 steps complete</p>` + `w-[40%]` bar + "Start Survey" → `/dashboard/public/surveys`. It predates the wizard and is wizard-unaware. [Source: apps/web/src/features/dashboard/pages/PublicUserHome.tsx]
- **Data spine = Story 9-38.** The `respondents.user_id` link + `GET /me/registration-status` read-model come from 9-38; this story is the consumer. 9-40 cannot ship before 9-38.
- **Keep the wizard pure** — editing reuses the wizard/validated write path; do not fork a second survey surface (SCP guardrail; AC#6).
- HARD deps: Story 9-38 (link + read-model — keystone), Story 9-12/9-18 (wizard + draft hydration for resume), Story 6-1 (audit on edits), Epic 7 (marketplace — partial; honest fallback if not live). Sibling: Story 9-39 (entry-IA) — parallel once 9-38 lands.

### References
- SCP: [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-06-public-user-journey-harmonization.md]
- [Source: apps/web/src/features/dashboard/pages/PublicUserHome.tsx, PublicSurveysPage.tsx]
- [Source: apps/api/src/db/schema/respondents.ts:83-127]
- Story 9-38 read-model: [Source: _bmad-output/implementation-artifacts/9-38-wizard-public-user-account-provisioning.md]

## Dev Agent Record
### Agent Model Used
_(unset — Bob/SM authored; dev fills on pickup)_
### Completion Notes List
### File List

## Change Log
| Date | Change | Rationale |
|---|---|---|
| 2026-06-06 | Drafted by Bob (SM) via *create-story --yolo, routed by the Public-User Journey Harmonization SCP. 7 ACs / 5 Tasks. Replaces the legacy hardcoded PublicUserHome with a registration-status state machine (continue/view/edit/marketplace) consuming the 9-38 read-model; retires the legacy survey-from-dashboard path. | The dashboard "muddle" surfaced in the 9-16 UAT — logged-in users met a mock that told completed registrants to start over. |
