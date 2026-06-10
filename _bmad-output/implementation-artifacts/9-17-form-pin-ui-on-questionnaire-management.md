# Story 9.17: Form Pin UI on Questionnaire Management

Status: done

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

- [x] **Task 1 — Write failing tests for `QuestionnaireList` pin/unpin behaviour (AC: #A1, #A2, #A4, #A8)** _(red half)_
  - [x] 1.1 Inspected `QuestionnaireList.tsx` — row-renderer maps `data?.data`, slot-renders action buttons in a `justify-end` flex; status badge in its own `<td>`; existing AlertDialog usage for delete + status-change. Rows keyed by `form.id`; titles unique enough to scope tests via `.closest('tr')`.
  - [x] 1.2 `QuestionnaireList.test.tsx` already existed — extended it (kept the 2 existing tests; added settings-API + `sonner` mocks + `userEvent`).
  - [x] 1.3 Wrote the 10 tests enumerated in AC#A8 (bullets 1-10).
  - [x] 1.4 Confirmed RED: 9 of the new tests failed ("element not found"); the 2 existing + the badge-absence test stayed green.

- [x] **Task 2 — Implement the badge + Pin button + AlertDialog on each published form row (AC: #A1, #A2, #A4)** _(green half — Task 1 tests pass)_
  - [x] 2.1 Imported `useGetSetting` + `useUpdateSetting` from `settings/api/settings.api`. `useGetSetting` did NOT exist — added it (one-query hook, key `['settings', key]`, mirrors `useSettings`/`useUpdateSetting`).
  - [x] 2.2 Read `wizard.public_form_id` via `useGetSetting`; mirror server value into local `pinnedFormId` state via `useEffect` (SmsOtpToggle optimistic pattern).
  - [x] 2.3 Rendered the `🌐 Active for public wizard` badge (Success-600/50, `data-testid="qm-pinned-badge"`, aria-label) in the Status cell + `qm-pin-button` / `qm-unpin-button` in the actions cell (published rows only).
  - [x] 2.4 Wired click handlers to a new pin/unpin `AlertDialog` (reused existing alert-dialog imports). Confirm invokes `updatePin.mutate({ key, value }, { onSuccess, onError })`; toasts via `sonner`.
  - [x] 2.5 `onSuccess`: invalidates `['questionnaires']` + `['settings','wizard.public_form_id']`; toast "Pinned/Un-pinned `<title>`".
  - [x] 2.6 `onError`: rolls back optimistic state; toast "Couldn't pin the form. Please try again." (no backend code surfaced).
  - [x] 2.7 All 12 tests in the file PASS.

- [x] **Task 3 — Settings landing read-only mirror card (AC: #A5, #A8)** _(red-green)_
  - [x] 3.1 Added the 5 new tests to `settings/__tests__/SettingsLandingPage.test.tsx` (the existing test lives there, not under `pages/__tests__/`); confirmed RED.
  - [x] 3.2 Built new `PublicWizardFormCard` component — reads pinned id from the existing `useSettings()` list (`findSetting`), resolves title+version via the existing `useQuestionnaire(id)` hook (option (a), zero new endpoint). Relative "pinned X ago" via `Intl.RelativeTimeFormat` with raw-date fallback.
  - [x] 3.3 Rendered the read-only card with dynamic body + `<Link>` to `/dashboard/super-admin/questionnaires`, placed between the SMS OTP card and Fraud Thresholds card.
  - [x] 3.4 All 14 tests in the file PASS.

- [x] **Task 4 — Retire the `pnpm pin-public-form` dev script (AC: #A7)**
  - [x] 4.1 `git rm apps/api/scripts/dev-pin-public-form.ts`.
  - [x] 4.2 Removed the `"pin-public-form"` entry from `apps/api/package.json`.
  - [x] 4.3 `git grep`'d all references. Trivial mentions updated (9-20, 9-24). 9-12 left as accurate authoring history. **9-22 (AC#5/Task-4) + 9-23 (AC#5) build ON the script — annotated `[SUPERSEDED 2026-06-10]` with re-scope guidance per `feedback_planning_artifact_parity_sweep` (annotate, not unilaterally rewrite another story's intent). Operator decision confirmed this disposition.**
  - [x] 4.4 No `pin-public-form` reference in repo `MEMORY.md` or the auto-memory dir — nothing to update.
  - [x] 4.5 `apps/api` tsc --noEmit + lint both clean — no orphan references.

- [x] **Task 5 — Full zero-regression sweep (AC: #A9)**
  - [x] 5.1 `apps/web` tsc --noEmit — clean.
  - [x] 5.2 `apps/web` lint — clean.
  - [x] 5.3 `apps/web` full vitest — **231 files / 2,513 passed | 2 todo** (incl. +10 QuestionnaireList + +5 SettingsLandingPage = +15 new). Zero deletions, zero regressions.
  - [x] 5.4 `apps/api` tsc + lint clean; full vitest = **2,400 passed / 1 failed (pre-existing, unrelated)**. The 1 failure is `registration.routes.test.ts:474` — a fully-mocked test whose hardcoded `expiresAt: 2026-06-10T09:00:00Z` lapsed *today*; the draft endpoint correctly returns `{draft:null}`. **Proven pre-existing**: reproduces identically on clean HEAD with my changes stashed. Out of 9-17 scope (registration-draft surface, 9-12/9-18). Flagged to operator.
  - [x] 5.5 UAT smoke (reasoned walkthrough — backed by the 15 integration tests): Pin → confirm dialog (current+new titles) → optimistic badge move + "Pinned …" toast → `['questionnaires']`+setting invalidated → Settings mirror reflects new form. Un-pin → warning dialog → badge clears + "Un-pinned …" toast → setting value `null` (wizard Step 4 reverts to empty-state on next ≤5-min cache refresh). Error path rolls back the badge + shows the generic error toast.

- [x] **Task 6 — Code review (per `feedback_review_before_commit.md`)** — formal adversarial Layer-2 review run 2026-06-10 in a fresh session; findings + fixes recorded in Review Follow-ups (AI).
  - [x] 6.1 Ran `/bmad:bmm:workflows:code-review` on the uncommitted working tree (fresh Opus 4.8 session, separate from the implementing session). 0 High/Critical; 2 Med + 5 Low. M1/L1/L4/L5 auto-fixed; M2/L2/L3 accepted-with-rationale. Affected test files re-run green (12 + 16).
  - [ ] 6.2 Only after code review passes, commit. (NOT auto-committed — project rule: review runs on the uncommitted tree first.) **Operator note (M2): stage `apps/api/src/routes/__tests__/registration.routes.test.ts` as its own commit, separate from the 9-17 commit.**

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

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — dev-story workflow, 2026-06-10.

### Debug Log References

- RED (Task 1): `pnpm --filter @oslsr/web vitest run …/QuestionnaireList.test.tsx` → 9 failed / 3 passed (badge-absence test trivially green pre-impl).
- GREEN (Task 2): same file → 12 passed.
- RED (Task 3): `…/SettingsLandingPage.test.tsx` → 5 failed / 9 passed.
- GREEN (Task 3): same file → 14 passed.
- Sweep (Task 5): web tsc/lint clean; web vitest 2,513 passed | 2 todo; api tsc/lint clean; api vitest 2,400 passed / **1 pre-existing failure** (`registration.routes.test.ts:474`, date-bomb `expiresAt: 2026-06-10T09:00:00Z` lapsed today — reproduces on clean HEAD via `git stash`, unrelated to this story).

### Completion Notes List

- **Reused, not net-new (AC#A3):** pin/unpin is a pure frontend wrapper over the existing `PATCH /admin/settings/wizard.public_form_id` route (audit-logs `SETTINGS_FLIPPED`). No new backend endpoint, service method, migration, audit-action, env var, or dependency.
- **`useGetSetting` added** to `settings/api/settings.api.ts` (Risk #1 anticipated this) — single-key GET hook, query key `['settings', key]` (a prefix of `SETTINGS_QUERY_KEY`, so `useUpdateSetting`'s list-invalidation also refreshes it).
- **Optimistic pin/unpin** mirrors the `SmsOtpToggle` pattern (local state seeded from server value + `useEffect` sync + rollback on error). Error toast is anti-enumeration (generic copy, no backend code).
- **Settings mirror card is a dedicated read-only component** (`PublicWizardFormCard`) — pinned id from the existing `useSettings()` list, title/version via the existing `useQuestionnaire(id)` hook (AC#A5 option (a), zero new endpoint). No Pin/Unpin/Edit affordances on the card (test 15 enforces).
- **AC#A7 cross-story conflict (operator-decided):** deleting `dev-pin-public-form.ts` orphans minor ACs in ready-for-dev stories 9-22 (AC#5/Task-4 — script-refactor *demonstration*) and 9-23 (AC#5 — `--list` cosmetic). Per operator direction + `feedback_planning_artifact_parity_sweep`, those ACs were **annotated `[SUPERSEDED 2026-06-10]`** with re-scope guidance (their cores — the `operatorUpdate()` helper and `native_published_at` convergence — are unaffected). Re-scope itself stays an SM activity.
- **Pre-existing API test failure (separate concern, now fixed at operator request):** `registration.routes.test.ts:474` hardcoded `expiresAt: 2026-06-10T09:00:00Z`, which lapsed today. Replaced with a relative `Date.now() + 30d` so it never expires again. NOT a 9-17 file — included in the same uncommitted tree for convenience; reviewers should treat it as an independent one-line test-hygiene fix.
- Self-review of the integrated diff: no findings. Formal `/bmad:bmm:workflows:code-review` (Layer 2) recommended in a fresh session before commit.

### File List

**Added**
- `apps/web/src/features/settings/components/PublicWizardFormCard.tsx`

**Modified**
- `apps/web/src/features/questionnaires/components/QuestionnaireList.tsx` (badge + Pin/Unpin buttons + AlertDialog + optimistic state)
- `apps/web/src/features/questionnaires/components/__tests__/QuestionnaireList.test.tsx` (+10 tests + settings/sonner mocks)
- `apps/web/src/features/settings/api/settings.api.ts` (new `useGetSetting` hook + `SingleSettingResponse` type)
- `apps/web/src/features/settings/pages/SettingsLandingPage.tsx` (renders the mirror card)
- `apps/web/src/features/settings/__tests__/SettingsLandingPage.test.tsx` (+5 tests at impl + 2 more at code-review = +7; `within` import)
- `apps/api/package.json` (removed the `pin-public-form` script entry)
- `apps/api/src/routes/__tests__/registration.routes.test.ts` — **independent fix, NOT a 9-17 surface.** Date-bomb `expiresAt` (hardcoded `2026-06-10T09:00:00Z`, lapsed today) replaced with a relative `Date.now() + 30d`. Carried in this working tree at operator request; see Review Follow-up M2 for the commit-split disposition.

**Deleted**
- `apps/api/scripts/dev-pin-public-form.ts` (AC#A7)

**Planning-artifact parity (annotations only — other stories' files)**
- `_bmad-output/implementation-artifacts/9-22-operator-db-audit-discipline.md` (AC#5/Task-4/File-List superseded-notes)
- `_bmad-output/implementation-artifacts/9-23-questionnaire-publish-path-convergence.md` (AC#5 superseded-note)
- `_bmad-output/implementation-artifacts/9-20-pre-viral-capacity-prep.md` (removed dead script ref in Task 1.2)
- `_bmad-output/implementation-artifacts/9-24-local-db-drift-prevention.md` (removed script from AC#B1 example list)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status flip)

### Review Follow-ups (AI)

Adversarial code-review run 2026-06-10 (Opus 4.8, fresh session) via `/bmad:bmm:workflows:code-review`. All 9 ACs verified IMPLEMENTED; the two affected test files re-run green (QuestionnaireList 12, SettingsLandingPage 16 after this review's additions). No HIGH/CRITICAL. 2 Medium + 5 Low found; dispositions below.

**Fixed in this review (code changed):**
- [x] [AI-Review][Med] **M1 — File List omitted `registration.routes.test.ts`.** Added it to the File List "Modified" section with an explicit independent-fix annotation. [9-17 File List]
- [x] [AI-Review][Low] **L1 — Untested `PublicWizardFormCard` branches.** Added 2 tests covering the unresolved-id fallback (`Currently pinned: <uuid>`) and the loading hint. [apps/web/src/features/settings/__tests__/SettingsLandingPage.test.tsx — `falls back to the raw pinned id…` + `shows a loading hint…`]
- [x] [AI-Review][Low] **L4 — Stale "3 cards" docstrings.** Updated the SettingsLandingPage header comment (now 4 cards) and renamed the `renders all 3 v1 cards` test to `renders the v1 control + link cards`. [apps/web/src/features/settings/pages/SettingsLandingPage.tsx:6-12; test file]
- [x] [AI-Review][Low] **L5 — Badge bypassed the design tokens AC#A1 named.** `index.css` defines `--color-success-600` / `--color-success-100`; badge changed `bg-green-600 text-green-50` → `bg-success-600 text-success-100` (note: `success-50` does not exist; `success-100` is the light variant). [apps/web/src/features/questionnaires/components/QuestionnaireList.tsx:230]

**Accepted with rationale (no code change — documented as the disposition):**
- [ ] [AI-Review][Med] **M2 — Out-of-scope `registration.routes.test.ts` bundled in this tree.** The fix is correct and necessary (the date bomb already fired), so it is NOT reverted. **Operator decision at commit time:** stage `registration.routes.test.ts` as its OWN commit (recommended — keeps the 9-17 commit pure) rather than folding it into the 9-17 commit. Documented in the File List so the diff is not silently undocumented.
- [ ] [AI-Review][Low] **L2 — Dual fetch mechanism for `wizard.public_form_id`.** QM uses `useGetSetting` (single GET, snake_case `SingleSettingResponse`); Settings mirror uses `useSettings()` list (camelCase `SettingRow`). Accepted by design — each page fetches what it needs (QM only needs the one key; Settings already renders the full list). The snake/camel divergence is a pre-existing backend response-shape inconsistency, not introduced here → routed to a backend settings-route response-shape consistency follow-up rather than reworked in this UI story.
- [ ] [AI-Review][Low] **L3 — Redundant `['settings', WIZARD_PIN_KEY]` invalidation.** `useUpdateSetting` already invalidates the `['settings']` prefix. Kept intentionally: it decouples QM's refresh from the hook's internal invalidation choice (and QuestionnaireList test 6 asserts it directly). Documented as deliberate belt-and-suspenders. [QuestionnaireList.tsx:143]

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-06-10 | **Adversarial code-review (Layer 2, Opus 4.8, fresh session).** 0 High/Critical; all 9 ACs verified implemented; 2 Med + 5 Low found. Fixed in-tree: M1 (File List omitted `registration.routes.test.ts` → added), L1 (2 untested `PublicWizardFormCard` branches → tests added; SettingsLandingPage 14→16), L4 (stale "3 cards" docstrings → corrected), L5 (badge used `green-*` instead of the AC-named design tokens → `bg-success-600 text-success-100`). Accepted-with-rationale: M2 (out-of-scope registration-test fix kept but flagged for its own commit), L2 (dual fetch is per-page-appropriate; snake/camel divergence routed to a backend follow-up), L3 (redundant invalidation kept as deliberate decoupling). web tsc + lint clean; affected files 12 + 16 green. Task 6.1 done. Status review → done. | Independent Layer-2 review is the project gate (`feedback_review_before_commit.md`); story was high quality (no AC gaps), fixes were doc/coverage/token polish. |
| 2026-06-10 | **Implemented (dev-story, Opus 4.8).** Part A shipped: pin/unpin badge + buttons + confirmation dialogs on the Q.M. page (optimistic, audit-logged via the reused settings PATCH route); read-only `PublicWizardFormCard` mirror on Settings; `useGetSetting` hook added; `dev-pin-public-form.ts` + its package.json entry retired (AC#A7). +15 web tests, all green; web suite 2,513 green; api suite clean except 1 pre-existing unrelated date-bomb failure. 9-22/9-23 script-dependent ACs annotated `[SUPERSEDED 2026-06-10]` for SM re-scope. Status → review. Formal Layer-2 code-review pending in a fresh session. | Executes the story as authored. Cross-story AC#A7 conflict resolved per operator direction (delete + parity-annotate, not unilaterally rewrite other stories). |
| 2026-06-03 | RE-SCOPED via *create-story --yolo (re-scope mode) per Awwal directive at parent-Claude scope-review session 2026-06-03. Part B (wizard questionnaire field dedup using Pattern C — auto-fill + banner; WIZARD_PROVIDED_FIELD_NAMES alias map; FormRenderer.hideQuestionNames prop; Step 4 introspection; collision-detector test) MOVED in its entirety to Story 9-18 Part B. File renamed via `git mv` from `9-17-wizard-form-pin-ui-and-field-dedup.md` to `9-17-form-pin-ui-on-questionnaire-management.md`. H1 changed accordingly. AC count went from 15 (Parts A+B) to 9 (Part A only, with the previous AC#B7 test-coverage clauses re-folded into AC#A8 + AC#A9). Tasks went from 10 to 6. Effort revised ~3-4 dev-days → ~1-1.5 dev-days. | Original dual-story scope (9-17 Part B sets up Pattern C with NIN EXCLUDED; 9-18 Part B extends with NIN + inverts collision-detector test) was structural noise — 9-17 would have shipped infrastructure that 9-18 partially unmade days later. The 2026-05-12 FORWARD-COMPAT addendum documented but did not fix the structural conflict. Single-ownership of the wizard redesign surface (9-18) eliminates the inversion. |
| 2026-05-12 | Story drafted by Bob (SM) via `*create-story --yolo` per Awwal directive at UAT session close 2026-05-12. Bundled two Story-9-12 follow-ups: (Part A) form-pin UI on the Questionnaire Management page replacing the "go to Settings to pin" workflow gap; (Part B) wizard questionnaire field dedup using Pattern C (auto-fill + banner). 15 ACs across both parts; 10 tasks with file-path-specific red-green-refactor subtasks. NO new backend code, NO migrations, NO new audit-action keys, NO new dependencies. AC#A7 explicitly retires the `pnpm pin-public-form` dev script that commit `427a80d` shipped as the bridge between 9-12 production launch and this story landing. Effort: ~3-4 dev-days. | UI-placement decision (Q.M. primary, Settings mirror) is load-bearing UX from the 2026-05-12 UAT session. Part B's NIN-stays-separate stance later proved structurally noisy (see 2026-06-03 entry); the form-pin UI work itself remains valid as originally specified. |
