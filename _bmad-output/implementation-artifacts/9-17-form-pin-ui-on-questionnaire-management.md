# Story 9.17: Form Pin UI on Questionnaire Management

Status: ready-for-dev

<!--
RE-SCOPED 2026-06-03 by Bob (SM) via *create-story --yolo (re-scope mode) per
parent-Claude scope-review session 2026-06-03 (Option B harmonization with 9-18).

WHAT CHANGED:
- This story was originally "Wizard Form-Pin UI on Questionnaire Management +
  Questionnaire Field Dedup" — Part A (form pin UI) + Part B (Pattern C wizard
  field dedup).
- Part B (wizard questionnaire field dedup using Pattern C — auto-fill + banner;
  WIZARD_PROVIDED_FIELD_NAMES alias map; FormRenderer.hideQuestionNames prop;
  Step 4 introspection; collision-detector test) has been MOVED to Story 9-18
  Part B in its entirety.
- This story is now scoped down to JUST Part A: form pin UI on the
  Questionnaire Management page + read-only mirror card on Settings + retire
  the dev-pin-public-form bridge script.

WHY THE RE-SCOPE:
- The original Part B set up the WIZARD_PROVIDED_FIELD_NAMES alias map with
  NIN EXPLICITLY EXCLUDED, plus a collision-detector test asserting NIN was NOT
  in the map. Story 9-18 Part B was then going to INVERT both — adding NIN to
  the map AND inverting the collision-detector test polarity. A 2026-05-12
  FORWARD-COMPAT addendum documented the planned inversion, but the inversion
  itself was structural noise — 9-17 would have shipped infrastructure that
  9-18 partially unmade days later.
- The cleaner pattern: 9-18 owns the WHOLE wizard redesign surface (NIN-first +
  Pattern C dedup with NIN-included from the start + section-as-step + Step 5
  Review-and-Save + auth-choice retirement + surname-split). 9-17 stays
  focused on its independent Q.M. page concern.

EFFORT REVISION: ~3-4 dev-days → ~1-1.5 dev-days (Part A only).

REFERENCE: see Story 9-18 (`9-18-wizard-nin-first-and-summary-save.md`)
§"Part B — Pattern C wizard field dedup (Pattern C: auto-fill + banner)" for the
full dedup work that was moved.

ORIGINAL AUTHORSHIP HISTORY (preserved for trace):
Authored 2026-05-12 by Bob (SM) via canonical *create-story --yolo workflow as
a Story-9-12 follow-up from the 2026-05-12 UAT session.

The UI placement decision below is LOAD-BEARING UX from that UAT session:
Awwal flagged that sending Super Admin from Questionnaire Management to
Settings to pin a published form breaks the natural workflow. The pin
control belongs on the Questionnaire Management page, immediately next to
publish. Settings landing page gets a read-only mirror card so the pinned
form is also discoverable there. This story file preserves that decision
verbatim — do NOT relocate the primary pin control to Settings.

Numbering: 9-14 is RESERVED (SSH firewall re-narrow follow-up from
Story 9-9 Operate-phase), 9-15 (prod-gate-telegram-alerts) was authored
2026-05-11 and shipped to `done`, 9-16 (magic-link-login) was authored
2026-05-11.
-->

## Story

As the **Super Admin** managing questionnaires for the Oyo State Skills Registry,
I want **to pin a published form as the active public-wizard form directly from the Questionnaire Management page, immediately after publishing it**,
So that **the workflow stays in one place — and so that public respondents only ever see one curated survey at a time even when multiple published forms coexist in the system**.

## Acceptance Criteria

1. **AC#A1 — Pin status badge on each published form row.** `QuestionnaireManagementPage` (`apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx`) — via its child `QuestionnaireList` at `apps/web/src/features/questionnaires/components/QuestionnaireList.tsx` (which is the actual row-renderer; verified 2026-05-12 via grep) — shows for each `status === 'published'` form a badge indicating its public-wizard pin state: `🌐 Active for public wizard` (Success-600 background, Success-50 foreground, `data-testid="qm-pinned-badge"`) on the pinned form, no badge on the others. Badge carries `aria-label="Currently active as the public-registration form"`. Draft / archived rows are unaffected. The badge sits next to the existing status badge ("draft" / "published" / "archived") for visual proximity.

2. **AC#A2 — Pin action button on each published form row.** Below or next to each published form's existing "Edit / Preview" affordances in `QuestionnaireList`, render one of two buttons depending on the form's pin state:
   - **Unpinned**: `Pin for Public Wizard` (primary outline button, `data-testid="qm-pin-button"`). Clicking opens an `AlertDialog` (the project already uses shadcn/ui AlertDialog elsewhere in this page per [Source: apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx:7-16]) with title "Pin for public wizard?" and body "Replace **<current pinned form title or 'none'>** with **<this form title>**? Existing in-flight registrations will continue against the previous form for up to 5 minutes due to client-side caching, then the new form takes effect." Two actions: Cancel + Confirm (primary).
   - **Pinned**: `📌 Pinned · Unpin` (success outline + small unpin link, `data-testid="qm-unpin-button"`). Clicking opens an `AlertDialog` with title "Un-pin this form?" and body "Public users won't see any survey questions until you pin a form. Continue?" Two actions: Cancel + Un-pin (danger).

3. **AC#A3 — Backend endpoint REUSED, not net-new.** The pin / unpin mutation calls `PATCH /api/v1/admin/settings/wizard.public_form_id` with `{ value: '<form-uuid>' | null }`. That endpoint already exists from `prep-settings-landing-and-feature-flags` [Source: apps/api/src/routes/settings.routes.ts] and writes via `SettingsService.setSetting('wizard.public_form_id', value, actorId, description)` which audit-logs `SETTINGS_FLIPPED` per Story 6-1 hash chain. Existing super-admin authz + per-bucket rate limit + Zod validation all apply transparently. **NO NEW BACKEND ENDPOINT, NO NEW SERVICE METHOD, NO MIGRATION.** This story is purely a frontend wrapper around the existing settings PATCH route.

4. **AC#A4 — Optimistic update + rollback (TanStack Query mutation).** Clone the optimistic-then-rollback pattern from `SmsOtpToggle` at [Source: apps/web/src/features/settings/components/SmsOtpToggle.tsx:28-50]. On Confirm click in either dialog:
   - Optimistically update the badge state in the local React state tree.
   - Invoke `useUpdateSetting()` mutation (imported from `apps/web/src/features/settings/api/settings.api.ts:49` — verified exists 2026-05-12) with `{ key: 'wizard.public_form_id', value: '<uuid>' | null }`.
   - On `onSuccess`: invalidate the published-forms query (or whatever the QM list uses — dev agent verifies the query-key at impl time; current `useQuestionnaires` hook is in `apps/web/src/features/questionnaires/hooks/useQuestionnaires.ts`) AND invalidate the new `wizard.public_form_id` setting query so the read-only Settings mirror (AC#A5) refreshes too. Toast: `"Pinned <form title>"` or `"Un-pinned <form title>"`.
   - On `onError`: rollback the optimistic badge state, toast: `"Couldn't pin the form. Please try again."` (anti-enumeration discipline — the backend error code isn't surfaced).

5. **AC#A5 — Settings landing read-only mirror card.** `SettingsLandingPage` at [Source: apps/web/src/features/settings/pages/SettingsLandingPage.tsx] gains a new card titled `Public Wizard Form` between the existing SMS OTP Toggle card and the Fraud Thresholds link card (dev agent picks the exact slot — visual order matches Sally's UX Spec section ordering if any; otherwise alphabetical or "most-recently-added-last"). Card body: either `"Currently pinned: <form title> (v<version>) — pinned <X days ago>"` (when set; date computed via the existing `intl.RelativeTimeFormat` helper if present, otherwise raw ISO short-date) or `"None — no form is active for the public wizard"`. Card footer: `<Link to="/dashboard/super-admin/questionnaires">Manage in Questionnaires →</Link>`. Card is READ-ONLY — no Pin / Unpin / Edit affordances on this card itself. `data-testid="settings-public-wizard-form-card"`.

6. **AC#A6 — No sidebar nav change.** Questionnaire Management is already in the Super Admin sidebar from Story 2-1; Settings is already in the sidebar from `prep-settings-landing`. Discoverability of the new pin control comes from the new badge on Q.M. (AC#A1) + the new Settings mirror card (AC#A5). No `apps/web/src/features/dashboard/components/sidebar` changes.

7. **AC#A7 — Retire the `pnpm pin-public-form` dev bridge script.** Once this story's ACs are implemented + green in tests, delete:
   - `apps/api/scripts/dev-pin-public-form.ts` (the script itself)
   - The `"pin-public-form": "tsx scripts/dev-pin-public-form.ts"` entry from `apps/api/package.json` (added in commit `427a80d` 2026-05-12)
   - Any docs / comments / memory entries referencing the script — replace with "use the Pin for Public Wizard button on the Questionnaire Management page (Super Admin → Questionnaires)".

   The script was a 2026-05-12 bridge for UAT until this story landed; its TODO comment at the top says so verbatim. Do NOT keep it as "an alternative dev path" — that's exactly the kind of tech debt the project's "no technical debt" discipline rejects.

8. **AC#A8 — Tests.**
   - **`QuestionnaireList.test.tsx`** — extend (or create if not existing) with:
     1. Renders the `🌐 Active for public wizard` badge on the row matching `pinnedFormId`.
     2. Badge is absent on all other published rows.
     3. Pin button is present on unpinned published rows; absent on draft / archived rows.
     4. Clicking Pin opens the AlertDialog with the correct dynamic body (current title + new title).
     5. Confirming Pin invokes the `useUpdateSetting` mutation with the right payload.
     6. Confirming Pin invalidates the published-forms + setting queries on success.
     7. On mutation error, badge rolls back to the previous state + toast appears.
     8. Pin button on the currently-pinned form shows as `📌 Pinned · Unpin`.
     9. Clicking Unpin opens the AlertDialog with the unpin-warning body.
     10. Confirming Unpin sets the mutation payload's `value` to `null`.
   - **`SettingsLandingPage.test.tsx`** — extend with:
     11. New `Public Wizard Form` card renders.
     12. Card shows the pinned form title + version when a form is pinned.
     13. Card shows "None" when no form is pinned.
     14. Card's "Manage in Questionnaires" link points to `/dashboard/super-admin/questionnaires`.
     15. Card does NOT expose a Pin / Unpin button itself (read-only enforcement).

9. **AC#A9 — Zero regression discipline (cross-story).** All existing flows MUST stay green unchanged:
   - Story 9-12 wizard flows (Step 1-5 happy paths, magic-link landing, complete-nin, defer-reminder).
   - `/login` cutover banner + staff-login (from Story 9-12 Task 8).
   - Password reset flow.
   - MFA challenge flow from Story 9-13.
   - WizardPage URL ↔ state regression tests from commit `427a80d`.
   - Existing `SmsOtpToggle` (Story prep-settings-landing).

   Test counts move ONLY by the additive new tests above. No test deletions, no behaviour drift on the existing flows. Verified via pre/post `pnpm test` snapshot in the Dev Agent Record.

## Tasks / Subtasks

- [ ] **Task 1 — Write failing tests for `QuestionnaireList` pin/unpin behaviour (AC: #A1, #A2, #A4, #A8)** _(red half)_
  - [ ] 1.1 Inspect `apps/web/src/features/questionnaires/components/QuestionnaireList.tsx` to identify the existing row-renderer structure + how it consumes the questionnaires-list query + how it slot-renders the action buttons. Note the existing testids on each row for selector reuse.
  - [ ] 1.2 If `apps/web/src/features/questionnaires/components/__tests__/QuestionnaireList.test.tsx` doesn't exist, create it following the `SmsOtpToggle.test.tsx` pattern (TanStack Query test wrapper + mocked `useUpdateSetting` hook + `userEvent` for AlertDialog interactions).
  - [ ] 1.3 Write the 10 tests enumerated in AC#A8 ("`QuestionnaireList.test.tsx`" bullets 1-10). Each one should FAIL because the badge + pin button + dialogs don't exist yet.
  - [ ] 1.4 Run `pnpm --filter @oslsr/web vitest run src/features/questionnaires/components/__tests__/QuestionnaireList.test.tsx` — confirm the new tests FAIL with "element not found" errors. Existing tests in the file (if any) stay GREEN.

- [ ] **Task 2 — Implement the badge + Pin button + AlertDialog on each published form row (AC: #A1, #A2, #A4)** _(green half — Task 1 tests pass)_
  - [ ] 2.1 In `QuestionnaireList.tsx`, import `useUpdateSetting` from `apps/web/src/features/settings/api/settings.api.ts` and `useGetSetting` (or whatever the existing GET-setting hook is — verify at impl time; if absent, add it by mirroring `useUpdateSetting`'s shape).
  - [ ] 2.2 Read `wizard.public_form_id` via `useGetSetting('wizard.public_form_id')`. Expose `pinnedFormId: string | null` and `isPinnedLoading: boolean` to the row-renderer.
  - [ ] 2.3 For each published-form row, render the new badge + pin/unpin button. Reuse the existing shadcn/ui `Badge` component if present; otherwise inline-style per the existing status-badge pattern. The pin button uses `data-testid="qm-pin-button"` on unpinned rows and `data-testid="qm-unpin-button"` on the pinned row. Badge has `data-testid="qm-pinned-badge"`.
  - [ ] 2.4 Wire the click handlers to open AlertDialogs (reuse the existing `AlertDialog` imports from `apps/web/src/components/ui/alert-dialog`). Confirm-action invokes `useUpdateSetting.mutate({ key: 'wizard.public_form_id', value: '<uuid>' | null }, { onSuccess, onError })`. Toast via `sonner` (project's existing toast library; see SmsOtpToggle for exact import).
  - [ ] 2.5 `onSuccess`: invalidate the `wizard.public_form_id` setting query (so AC#A5 mirror refreshes) AND the questionnaires-list query (so the badge moves). Toast "Pinned `<title>`" or "Un-pinned `<title>`".
  - [ ] 2.6 `onError`: rollback the optimistic state. Toast "Couldn't pin the form. Please try again." (no backend error code surfaced).
  - [ ] 2.7 Run the tests from Task 1 — all 10 should now PASS.

- [ ] **Task 3 — Settings landing read-only mirror card (AC: #A5, #A8)** _(red-green)_
  - [ ] 3.1 In `apps/web/src/features/settings/pages/__tests__/SettingsLandingPage.test.tsx`, add the 5 new tests from AC#A8 (cards 11-15). Confirm RED.
  - [ ] 3.2 In `SettingsLandingPage.tsx`, add the new "Public Wizard Form" card. Use `useGetSetting('wizard.public_form_id')` for the pinned ID. For the form title + version, either (a) call a new `useQuestionnaireById(formId)` helper (mirror the existing `useQuestionnaires` hook shape — single-form variant) OR (b) leverage `GET /api/v1/forms/public-active` and surface its `title` + `version` directly (zero new endpoint).
  - [ ] 3.3 Render the read-only card per AC#A5 with the dynamic body + the `<Link>` to `/dashboard/super-admin/questionnaires`. Place the card between the existing SMS OTP card and the Fraud Thresholds link card (or wherever Sally's UX Spec calls for; default to alphabetical or chronological-added).
  - [ ] 3.4 Run tests — all 5 should PASS.

- [ ] **Task 4 — Retire the `pnpm pin-public-form` dev script (AC: #A7)**
  - [ ] 4.1 Delete `apps/api/scripts/dev-pin-public-form.ts`.
  - [ ] 4.2 Remove the `"pin-public-form": "tsx scripts/dev-pin-public-form.ts"` entry from `apps/api/package.json` (the entry added in commit `427a80d` 2026-05-12).
  - [ ] 4.3 Grep the repo for `pin-public-form` references in docs / memory / story files. Replace with "use the Pin for Public Wizard button on the Questionnaire Management page".
  - [ ] 4.4 Update MEMORY.md if the script is mentioned there (current state notes likely reference it).
  - [ ] 4.5 Run `pnpm --filter @oslsr/api lint` + `pnpm --filter @oslsr/api tsc --noEmit` — no orphan references remain.

- [ ] **Task 5 — Full zero-regression sweep (AC: #A9)**
  - [ ] 5.1 `cd apps/web && pnpm tsc --noEmit` — clean.
  - [ ] 5.2 `cd apps/web && pnpm lint` — clean.
  - [ ] 5.3 `cd apps/web && pnpm vitest run` — all green. Net test delta: +10 to `QuestionnaireList.test.tsx` + +5 to `SettingsLandingPage.test.tsx` = approximately **+15 net new tests**, zero deletions, zero regressions.
  - [ ] 5.4 `cd apps/api && pnpm tsc --noEmit && pnpm lint && pnpm vitest run` — clean. Backend test counts unchanged (this story doesn't touch any backend code; reuses the existing settings PATCH endpoint).
  - [ ] 5.5 Manual UAT smoke (dev agent walks through):
    - Pin a form via Q.M. → confirm dialog → see badge move + toast → Settings mirror shows the new pinned form.
    - Un-pin → confirm dialog → see badge disappear + toast → Step 4 reverts to "Survey not yet available" empty-state on next wizard refresh.

- [ ] **Task 6 — Code review (per `feedback_review_before_commit.md`)**
  - [ ] 6.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree once Tasks 1-5 are green. Auto-fix all HIGH/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI) per project convention.
  - [ ] 6.2 Only after code review passes, commit and mark status `review`.

## Dev Notes

### UI placement decision is load-bearing (DO NOT relocate)

The original Story 9-12 Task 5.4 design placed the form-pin control on the Settings landing page. Awwal flagged this as a workflow break during the 2026-05-12 UAT session: after publishing a questionnaire, the natural next thought is *"how do I make this the active one?"*, and Settings is the wrong place to look.

**The pin control belongs on the Questionnaire Management page**, immediately next to the publish action, with a visual badge identifying the currently-pinned form. Settings landing page gets a read-only mirror card so the pinned form is also discoverable from there — but the primary mutation surface is Q.M.

This is the design decision the story file is preserving. Do NOT relocate the primary pin control to Settings; it would re-introduce the workflow break.

### Why this story is now Part A only

Originally bundled with Part B (wizard questionnaire field dedup using Pattern C). The 2026-06-03 re-scope moved Part B entirely into Story 9-18 to eliminate the deliberately-inverted test assertion that the original dual-story scope created (9-17 was going to ship the `WIZARD_PROVIDED_FIELD_NAMES` map with NIN EXCLUDED + a collision-detector test asserting NIN was NOT in the map; 9-18 was going to extend the map with NIN and invert the collision-detector test polarity). Single-ownership of the wizard redesign in 9-18 eliminates the inversion.

Operationally, Part A (form-pin UI) and Part B (wizard dedup) shared no production code paths — only the wizard's `wizard.public_form_id` setting key. The split is clean.

### Dependencies

- **`prep-settings-landing-and-feature-flags`** (HARD) — provides `SettingsService.setSetting`, `PATCH /admin/settings/:key` endpoint, `SettingsLandingPage`, the `SmsOtpToggle` optimistic-mutation reference at [Source: apps/web/src/features/settings/components/SmsOtpToggle.tsx:28-50], `useUpdateSetting` hook at [Source: apps/web/src/features/settings/api/settings.api.ts:49], and the `SETTINGS_FLIPPED` audit action [Source: apps/api/src/services/audit.service.ts:78].
- **Story 2-1** — provides `QuestionnaireManagementPage` + `QuestionnaireList` + `useQuestionnaires` hook. This story extends both without restructuring.
- **Story 6-1** — provides the hash-chain audit log surface used by the `SETTINGS_FLIPPED` writes.

### Risks

1. **`useGetSetting` may not exist as a hook yet.** `prep-settings-landing` exposed `useUpdateSetting` per [Source: apps/web/src/features/settings/api/settings.api.ts:49] but the GET-side may be inline-fetched in the page. Mitigation at impl time: if the hook doesn't exist, add it as a one-line extension to `settings.api.ts` mirroring `useUpdateSetting`'s shape. Used by both Q.M. (AC#A2) and Settings mirror (AC#A5).

2. **5-minute React Query staleTime on `Step4Questionnaire.tsx:51`.** When Super Admin pins a different form, in-flight wizard sessions won't see the change until their local cache expires (~5 min). This is intentional — avoids surprising users mid-wizard with a different form schema — but the AC#A2 confirmation dialog copy ("Existing in-flight registrations will continue against the previous form for up to 5 minutes due to client-side caching") makes the expectation explicit.

3. **Q.M. page state-fetch pattern.** The existing `QuestionnaireManagementPage` uses `useCreateNativeForm` for the create flow; the LIST fetch likely uses `useQuestionnaires` or similar. Dev agent verifies the exact query-key + invalidation pattern at impl time before wiring the `onSuccess` invalidation.

4. **Sequencing with Story 9-16 / 9-18.** Zero file-level overlap with either. 9-16 touches auth (`/login` + `MagicLinkLandingPage` + `AuthService.loginByMagicLinkToken`); 9-18 touches wizard frontend (`Step4Questionnaire`, `<FormRenderer>`, the new `WIZARD_PROVIDED_FIELD_NAMES` map). This story touches Q.M. page + Settings page — independent surface. Can ship in any order vs 9-16/9-18.

### Project Structure Notes

- **Files extended** (this story):
  - `apps/web/src/features/questionnaires/components/QuestionnaireList.tsx` — badge + pin button (AC#A1, #A2, #A4)
  - `apps/web/src/features/questionnaires/components/__tests__/QuestionnaireList.test.tsx` — new tests (AC#A8)
  - `apps/web/src/features/settings/pages/SettingsLandingPage.tsx` — read-only mirror card (AC#A5)
  - `apps/web/src/features/settings/pages/__tests__/SettingsLandingPage.test.tsx` — new tests (AC#A8)
  - `apps/web/src/features/settings/api/settings.api.ts` — possibly add `useGetSetting` hook if it doesn't exist
- **Files deleted** (AC#A7):
  - `apps/api/scripts/dev-pin-public-form.ts`
- **package.json entry removed** (AC#A7):
  - `apps/api/package.json` `pin-public-form` script
- **NO new backend code, NO new DB migration, NO new audit-action keys, NO new env vars, NO new dependencies.**
- **NO FRC impact** — this story is Operate-phase polish; field-survey can launch without it landing.

### References

- prep-settings-landing-and-feature-flags (settings infra dependency): [Source: _bmad-output/implementation-artifacts/prep-settings-landing-and-feature-flags.md]
- Settings PATCH endpoint (reused — NO new endpoint): [Source: apps/api/src/routes/settings.routes.ts] + [Source: apps/api/src/services/settings.service.ts]
- `useUpdateSetting` hook (reused): [Source: apps/web/src/features/settings/api/settings.api.ts:49]
- `SmsOtpToggle` (optimistic-mutation reference): [Source: apps/web/src/features/settings/components/SmsOtpToggle.tsx:28-50]
- `SettingsLandingPage` (read-only mirror lands here): [Source: apps/web/src/features/settings/pages/SettingsLandingPage.tsx]
- `QuestionnaireManagementPage` + `QuestionnaireList` (primary surface): [Source: apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx] + [Source: apps/web/src/features/questionnaires/components/QuestionnaireList.tsx]
- Existing `wizard.public_form_id` seed (no changes): [Source: apps/api/scripts/migrate-system-settings-init.ts:89-115]
- `AUDIT_ACTIONS.SETTINGS_FLIPPED` (used via existing service): [Source: apps/api/src/services/audit.service.ts:78]
- Dev script to retire (AC#A7): [Source: apps/api/scripts/dev-pin-public-form.ts] + [Source: apps/api/package.json `pin-public-form` entry]
- Story 9-18 (sibling — absorbed the Pattern C wizard field dedup that was originally Part B of this story): [Source: _bmad-output/implementation-artifacts/9-18-wizard-nin-first-and-summary-save.md] § "Part B"

## Dev Agent Record

### Agent Model Used

_(Dev agent will fill in on pickup)_

### Debug Log References

_(Dev agent will fill in on pickup)_

### Completion Notes List

_(Dev agent will fill in on pickup)_

### File List

_(Dev agent will fill in on pickup)_

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 6.)_

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-06-03 | RE-SCOPED via *create-story --yolo (re-scope mode) per Awwal directive at parent-Claude scope-review session 2026-06-03. Part B (wizard questionnaire field dedup using Pattern C — auto-fill + banner; WIZARD_PROVIDED_FIELD_NAMES alias map; FormRenderer.hideQuestionNames prop; Step 4 introspection; collision-detector test) MOVED in its entirety to Story 9-18 Part B. File renamed via `git mv` from `9-17-wizard-form-pin-ui-and-field-dedup.md` to `9-17-form-pin-ui-on-questionnaire-management.md`. H1 changed accordingly. AC count went from 15 (Parts A+B) to 9 (Part A only, with the previous AC#B7 test-coverage clauses re-folded into AC#A8 + AC#A9). Tasks went from 10 to 6. Effort revised ~3-4 dev-days → ~1-1.5 dev-days. | Original dual-story scope (9-17 Part B sets up Pattern C with NIN EXCLUDED; 9-18 Part B extends with NIN + inverts collision-detector test) was structural noise — 9-17 would have shipped infrastructure that 9-18 partially unmade days later. The 2026-05-12 FORWARD-COMPAT addendum documented but did not fix the structural conflict. Single-ownership of the wizard redesign surface (9-18) eliminates the inversion. |
| 2026-05-12 | Story drafted by Bob (SM) via `*create-story --yolo` per Awwal directive at UAT session close 2026-05-12. Bundled two Story-9-12 follow-ups: (Part A) form-pin UI on the Questionnaire Management page replacing the "go to Settings to pin" workflow gap; (Part B) wizard questionnaire field dedup using Pattern C (auto-fill + banner). 15 ACs across both parts; 10 tasks with file-path-specific red-green-refactor subtasks. NO new backend code, NO migrations, NO new audit-action keys, NO new dependencies. AC#A7 explicitly retires the `pnpm pin-public-form` dev script that commit `427a80d` shipped as the bridge between 9-12 production launch and this story landing. Effort: ~3-4 dev-days. | UI-placement decision (Q.M. primary, Settings mirror) is load-bearing UX from the 2026-05-12 UAT session. Part B's NIN-stays-separate stance later proved structurally noisy (see 2026-06-03 entry); the form-pin UI work itself remains valid as originally specified. |
