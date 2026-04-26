# Story 9.12: Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email

Status: ready-for-dev

<!--
Created 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5.

This story collapses the existing 4-hop public registration (register → verify email → login → fill form) into a single 5-step wizard. Magic-link is the primary auth channel; SMS OTP is built but feature-flagged off (budget-gated). Pending-NIN status path supports respondents without NIN at submission.

Sources:
  • PRD V8.3 FR5 (softened), FR21 (scoped), FR27 (wizard), FR28 (deferred-NIN)
  • Architecture Decisions 2.5 (magic-link primary), 2.6 (SMS OTP infra-only), Decision 1.5 (status enum)
  • Architecture ADR-015 rewrite (5-step wizard) + ADR-018 (multi-source / pending-NIN)
  • UX Journey 2 rewrite + Journey 8 (return-to-complete) + Form Patterns (NinHelpHint, Email-Typo Detection, Pending-NIN Toggle) + Visible Step Indicator pattern + Trust badges
  • Epics.md §Story 9.12

Field-Readiness Certificate item #3 — field-survey-blocking until done.
Depends on Story 11-1 (status enum on respondents table).
-->

## Story

As a **public respondent registering for the Oyo State Skills Registry on my mobile phone**,
I want **a single 5-step wizard with a clear step indicator, the option to defer NIN capture if I don't have my NIN card on me, and a way to come back later via an email link**,
so that **I can complete registration in one continuous flow without bouncing across multiple separate screens, and I'm not blocked by a missing NIN**.

## Acceptance Criteria

1. **AC#1 — Single 5-step wizard at `/register` (replaces 4-hop flow):** New WizardLayout-derived shell renders all 5 steps as a single page with persistent step indicator at the top and trust-badges row at the foot of every step. Browser back/forward navigates step boundaries (URL-routed: `/register?step=N`). Old `/register` route handler retired or redirected to the wizard. Steps:
   - **Step 1 — Basic Info:** full name, date of birth (native `<input type="date">` mobile fallback to year/month/day dropdowns), gender. Auto-focus on Full Name.
   - **Step 2 — Contact + LGA:** phone (Nigerian format mask `080 1234 5678`, JetBrains Mono, real-time format validation), email (with email-typo detection per AC#5), LGA (autocomplete from 33 Oyo LGAs).
   - **Step 3 — Consent (FR2 two-stage):** plain-language NDPA paragraph; Stage 1 marketplace-inclusion radio (cannot proceed without ack); Stage 2 enriched contact-share (only shown if Stage 1 = Yes; default No).
   - **Step 4 — Questionnaire:** renders the published `respondentSourceTypes='public'` form via the existing one-question-per-screen native renderer, mounted *inside* the wizard chrome. Skip-logic engine drives visibility.
   - **Step 5 — NIN + Optional Login Setup:** NIN input with `NinHelpHint` inline + `*346#` USSD reminder (per AC#3); pending-NIN toggle (per AC#4); optional email magic-link (primary CTA), set-a-password (secondary), skip-for-now (tertiary, sends one-time magic-link with TTL 72h).

2. **AC#2 — Visible step indicator (per Sally's Progress Pattern):** `WizardStepIndicator` component renders horizontal breadcrumb-style row above the wizard card on screens ≥480px (clickable completed circles for back-nav, current circle filled Primary-600, future circles disabled). Mobile <480px collapses to "Step N of M — <label>" text-only. Persistently visible (`position: sticky; top: 0`). Component is reused by Story 11-3 Admin Import wizard and the staff activation wizard polish in AC#7.

3. **AC#3 — `NinHelpHint` shared component (per Sally's Form Pattern):** New component at `apps/web/src/features/registration/components/NinHelpHint.tsx` (or shared location for cross-feature reuse). Three variants: `inline` (under input, used in this wizard Step 5), `tooltip` (icon-button beside label, used in Data Entry Clerk form per Story 9-12 follow-up), `banner` (full-width above field, used in pending-NIN return-to-complete view per AC#9). All three carry `*346#` USSD copy in JetBrains Mono background. Inline variant additionally surfaces "I don't have my NIN now" link that triggers the pending-NIN toggle in the parent wizard. Accessibility: parent NIN input has `aria-describedby` pointing to inline hint; tooltip is a `<button role="button">` keyboard-focusable; banner is `<aside role="note">`.

4. **AC#4 — Pending-NIN toggle + status path (per Sally's Form Pattern):** `<button role="switch">` labelled "I don't have my NIN with me right now" under the NIN input on Step 5. When ON: NIN field disabled (preserved value retained), `respondent.status = 'pending_nin_capture'` set on submit, consequence preview card appears (Info-50 background, Info-600 left border) with copy "Your registration will be saved as pending. We'll email you to complete it. We'll also remind you in 2 days, 7 days, and 14 days." Submit button label changes from "Submit Registration" to "Save as Pending" when toggle is ON. Toggle state survives back-navigation to previous steps.

5. **AC#5 — Email-typo detection (per Sally's Form Pattern):** On blur of the email input on Step 2, run published common-typo dictionary check (`mailcheck` library or curated subset including `gmail.vom`, `gmail.con`, `gmial.com`, `gmal.com`, `gmaill.com`, `mail.com`, `yahooo.com`, `hotmial.com`, `hotmali.com`). On match, render Info-700 text below field: "Did you mean `<corrected>`? [Use this]". "Use this" is a `<button>` that applies the correction; ignoring submits the original. Suggestion is in a live region (`role="status" aria-live="polite"`). Never auto-correct.

6. **AC#6 — Magic-link primary auth (per Architecture Decision 2.5):**
   - New service `apps/api/src/services/magic-link.service.ts` — generate 32-byte token (`crypto.randomBytes(32).toString('base64url')`), SHA-256 hash for storage in new `magic_link_tokens` table (`{ id, public_user_id|user_id, token_hash, purpose, expires_at, used_at, created_at }`)
   - Purpose enum: `wizard_resume` (TTL 72h) | `pending_nin_complete` (TTL 72h) | `login` (TTL 15min)
   - Single-use enforcement via atomic `used_at` set on first redemption
   - Rate limit: 3 requests per email per hour (shares the existing NFR4.4 password-reset budget pool — rate-limit middleware)
   - Email content: short, action-oriented; uses AWS SES via existing `EmailService`; subject "Continue your Oyo State Skills Registry registration"; primary CTA button + plaintext fallback link + 72-hour expiry note + recovery instructions
   - New endpoints:
     - `POST /api/v1/auth/public/magic-link` — request a magic link by email + purpose
     - `GET /auth/magic?token=<plaintext>&purpose=<purpose>` — controller hashes, validates, issues JWT (per existing public-login JWT shape), redirects per purpose

7. **AC#7 — SMS OTP infrastructure-only / feature-flagged off (per Architecture Decision 2.6):**
   - Build the full code path: route handler `POST /api/v1/auth/public/sms-otp/request` + `POST /verify`, `SmsProviderAdapter` interface with one implementation `NoopSmsProvider` that logs + rejects with `SMS_OTP_DISABLED`, audit wiring identical to magic-link path
   - Feature flag: `settings.auth.sms_otp_enabled` boolean (super-admin toggle, audit-logged on flip); default `false`; resolver returns `NoopSmsProvider` while flag is false
   - When flag flips ON (future Termii or Africa's Talking integration), the resolver switches to a real provider implementation and the path activates without redeploy
   - **No partner-API scope (Epic 10) or wizard step depends on SMS OTP** — verified via test: enabling the flag must not break any existing flow

8. **AC#8 — Trust badges row (SUPA-inspired but distinct):** Three `<aside>` badges at the foot of every wizard step card: "🔒 Secure Registration" (Success-100/600), "🛡️ Official Oyo State Platform" (Primary-50/600 with Oyo State logo SVG 38×38), "🆓 Free to Join" (Info-100/600). Stack vertically on screens <480px. Each badge has `aria-label` describing the assurance. Visual hierarchy intentionally lower than primary CTAs.

9. **AC#9 — Return-to-complete via magic link (per Sally's Journey 8):**
   - When a respondent clicks `wizard_resume` magic link, server hydrates from server-side draft (not just IndexedDB — works across devices), redirects to `/register?step=N` where N is the saved step
   - When a respondent clicks `pending_nin_complete` magic link, server redirects to dedicated narrow view `/register/complete-nin` (NOT the full wizard re-mount) — view contains only the NinHelpHint banner + NIN input + Save button + trust badges row
   - "I still don't have my NIN — remind me later" link in the complete-nin view triggers server endpoint that resets the reminder timer (next reminder pushed to T+7d from now); audit-logged with `action: 'pending_nin.deferred_again'`
   - On valid + new NIN entry from complete-nin view: `respondents.status` promotes `pending_nin_capture` → `active`; FR21 dedupe runs at this moment (since NIN is now present); success email confirms; respondent lands on "Registration complete" screen
   - On valid but duplicate NIN: original-registration-date message + "go back" / "contact support" affordances (per Journey 2 wizard handling)

10. **AC#10 — Reminder cadence for `pending_nin_capture` (FR28):**
    - Scheduled job runs daily; for each `pending_nin_capture` respondent:
      - Send reminder email at T+2d, T+7d, T+14d (each carries `pending_nin_complete` magic link)
      - At T+30d transition status to `nin_unavailable` and add to supervisor-review queue (audit-logged)
    - Reminder cadence reset by AC#9 "remind me later" affordance (next reminder T+7d from reset)
    - Cron entry or BullMQ scheduled job — pick BullMQ (already in stack per ADR-003); add to `apps/api/src/workers/reminder.worker.ts`
    - Email template at `apps/api/src/services/email/templates/pending-nin-reminder.html`

11. **AC#11 — Migration: existing `public_users` accounts continue to work:**
    - Existing accounts retain password + `/auth/public/login` continues to work unchanged
    - Existing `respondents` rows stay `status = 'active'` with their captured NIN (Story 11-1 migration default)
    - Login page above-the-fold banner: "**New here?** Try our new registration wizard — it takes about 5 minutes." with primary-link affordance to `/register`
    - Existing-user header: "Already registered? Sign in below"
    - Two affordances visually distinct so existing users do not accidentally start over
    - Google OAuth route retired — handler unmounted, returns 404 if invoked; Google Cloud Console client credentials revoked as part of this story (Awwal action item)
    - Hybrid Magic-Link/OTP email template removed from email-service codebase (replaced by new magic-link-only template)

12. **AC#12 — Bundled task: Staff Activation Wizard step-indicator polish:**
    - Existing staff activation flow (Story 1.2 — `/activate?token=...`) already uses a multi-step pattern but lacks the visible step indicator from AC#2
    - Retro-fit `WizardStepIndicator` component onto the existing staff activation flow (low-risk visual polish; no logic changes)
    - Apply trust badges row at the foot for visual consistency with public wizard

13. **AC#13 — Tests:**
    - Component tests: `NinHelpHint` (3 variants), `PendingNinToggle`, `EmailTypoDetection`, `WizardStepIndicator`, `TrustBadgesRow`
    - Integration tests: 5-step wizard happy path with NIN; happy path with pending-NIN; email typo correction flow; pending-NIN reminder cadence (mocked time)
    - Service tests: `MagicLinkService` (token generation, SHA-256 hashing, single-use enforcement, expiry, rate limit); `NoopSmsProvider` rejects with `SMS_OTP_DISABLED`
    - End-to-end tests: complete wizard with NIN; complete wizard pending-NIN, then complete via magic link from email; existing public_user login still works post-migration
    - Existing 4,191-test baseline maintained or grown

14. **AC#14 — Field Readiness Certificate item #3 satisfied:** When all above ACs pass + the wizard is live in production + at least one test respondent completes the wizard end-to-end (NIN-present or pending-NIN), flip FRC item #3 status in `epics.md` from `⏳ Backlog → ✅ Done <date>`.

## Dependencies

- **Story 11-1 (HARD)** — `respondents.status` enum (`pending_nin_capture` value) lives in 11-1's migration. 9-12 cannot ship before 11-1 lands.
- **Architecture ADR-015 (rewritten)** + Decision 2.5 (magic-link primary) + Decision 2.6 (SMS OTP infra-only) — design baseline
- **UX Journey 2 rewrite + Journey 8** — flow specifications
- **UX Form Patterns + Custom Components #12 (`NinHelpHint`) + Visible Step Indicator pattern** — component specs

## Field Readiness Certificate Impact

**FRC item #3** (Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email live) — this story IS that item. **Field-survey-blocking until done.**

## Tasks / Subtasks

### Task 1 — Backend: magic-link service + endpoints (AC#6, AC#9, AC#10)

1.1. Create `apps/api/src/db/schema/magic-link-tokens.ts` — Drizzle schema (no `@oslsr/types` import per project pattern).
1.2. Migration: `CREATE TABLE magic_link_tokens (...)` with index on `token_hash` + `expires_at`.
1.3. Create `apps/api/src/services/magic-link.service.ts` — `issueToken({ purpose, identifier })` + `redeemToken(plaintext)` + `revokeToken(id)`.
1.4. Create `POST /api/v1/auth/public/magic-link` route handler (validates email exists or is new public registration; rate-limited 3/hr/email per NFR4.4).
1.5. Create `GET /auth/magic` controller — hashes, validates, issues JWT (using existing `jwt.service.ts`), redirects per `purpose`.
1.6. Email template `pending-nin-reminder.html` + `magic-link.html` in `apps/api/src/services/email/templates/`.
1.7. BullMQ worker `apps/api/src/workers/reminder.worker.ts` — scheduled daily; queries `pending_nin_capture` respondents, fires reminders at T+2/7/14d, transitions to `nin_unavailable` at T+30d.
1.8. Tests: `magic-link.service.test.ts` + `auth-magic.routes.test.ts` + `reminder.worker.test.ts` (mocked time).

### Task 2 — Backend: SMS OTP infrastructure-only (AC#7)

2.1. Create `apps/api/src/services/auth/sms-provider.adapter.ts` — interface + `NoopSmsProvider` impl that logs + rejects.
2.2. Create `apps/api/src/services/auth/sms-otp.service.ts` — issue/verify endpoints; uses adapter resolver.
2.3. Add `settings.auth.sms_otp_enabled` boolean (Super Admin toggle); audit-logged on flip.
2.4. Routes `POST /api/v1/auth/public/sms-otp/request` + `/verify` — return `503 SMS_OTP_DISABLED` when flag is OFF.
2.5. Tests: confirm enabling the flag does not break any existing flow (regression suite).

### Task 3 — Backend: pending-NIN status path (AC#4, AC#9)

3.1. Wire wizard Step 5 submit → `SubmissionProcessingService.findOrCreateRespondent` with conditional NIN-presence branching (Story 11-1 AC#7 pre-requisite).
3.2. Endpoint `POST /api/v1/registration/complete-nin` — validates magic-link session, accepts NIN, runs FR21 dedupe, promotes `status` to `active` on success.
3.3. Endpoint `POST /api/v1/registration/defer-reminder` — resets reminder timer; audit-logged.
3.4. Tests: status promotion, FR21-at-promotion, defer-reminder timer reset.

### Task 4 — Frontend: WizardLayout + WizardStepIndicator (AC#1, AC#2)

4.1. New layout `apps/web/src/layouts/WizardLayout.tsx` — sticky step indicator + content slot + sticky trust badges footer.
4.2. New component `apps/web/src/features/registration/components/WizardStepIndicator.tsx` — desktop/tablet variant (clickable circles) + mobile collapse variant (text-only).
4.3. URL routing: `/register?step=N` with TanStack Router.
4.4. Auto-save server-side draft on every field change (debounced 2s) + IndexedDB local cache for offline-tolerance.
4.5. Tests: navigation between steps, draft hydration, mobile collapse breakpoint.

### Task 5 — Frontend: 5 wizard steps (AC#1)

5.1. `Step1BasicInfo.tsx` — full name + DOB + gender form.
5.2. `Step2ContactLga.tsx` — phone + email (with email-typo per AC#5) + LGA autocomplete.
5.3. `Step3Consent.tsx` — Stage 1 + Stage 2 consent radios with progressive disclosure.
5.4. `Step4Questionnaire.tsx` — mounts the existing native form renderer for the public-survey form within wizard chrome.
5.5. `Step5NinAndAuth.tsx` — NIN input + NinHelpHint inline + PendingNinToggle + magic-link/password/skip CTAs.

### Task 6 — Frontend: shared form pattern components (AC#3, AC#4, AC#5, AC#8)

6.1. `NinHelpHint.tsx` (3 variants: inline, tooltip, banner) — see Sally's Custom Component #12 spec.
6.2. `PendingNinToggle.tsx` — see Sally's Form Pattern.
6.3. `EmailTypoDetection.tsx` — published dictionary + correction suggestion + Use-this button.
6.4. `TrustBadgesRow.tsx` — three badges per Sally's Journey 2 visual contract.
6.5. Tests: each component in isolation + accessibility verifications.

### Task 7 — Frontend: return-to-complete view (AC#9)

7.1. New route `/register/complete-nin` (auth-gated by magic-link redemption).
7.2. New view `apps/web/src/features/registration/pages/CompleteNinPage.tsx` — NinHelpHint banner + NIN input + Save + "remind me later" link.
7.3. On submit success: redirect to "Registration complete" screen with civic framing copy.
7.4. On NIN duplicate: surface FR21 message with "go back" / "contact support" affordances.

### Task 8 — Frontend: migration cutover messaging (AC#11)

8.1. Update `/auth/public/login` page: above-the-fold "New here?" banner with primary CTA to `/register`.
8.2. Update existing-user header copy: "Already registered? Sign in below".
8.3. Visual distinction: new banner uses Info-50 background + Primary-600 link; existing-user header is default.

### Task 9 — Bundled: Staff Activation Wizard step-indicator polish (AC#12)

9.1. Audit existing staff activation flow — identify step boundaries.
9.2. Retro-fit `WizardStepIndicator` component (no logic changes).
9.3. Apply `TrustBadgesRow` at foot for visual consistency.

### Task 10 — Cleanup (AC#11)

10.1. Retire Google OAuth route handler (return 404).
10.2. Awwal: revoke Google Cloud Console client credentials.
10.3. Remove Hybrid Magic-Link/OTP email template (replaced by magic-link-only).
10.4. Remove related Google OAuth tests.

### Task 11 — Tests + sprint-status (AC#13, AC#14)

11.1. Add component tests + integration tests + service tests + E2E tests per AC#13.
11.2. Verify 4,191-test baseline maintained or grown.
11.3. Update `sprint-status.yaml`: `9-12-public-wizard-pending-nin-magic-link: in-progress` → `review` at PR → `done` at merge.
11.4. On merge + production deploy + first test respondent completion: flip FRC item #3 in `epics.md`.

## Technical Notes

### Magic-link token storage discipline

Per Architecture Decision 2.5: plaintext token is sent in email exactly once, never persisted. `magic_link_tokens.token_hash` stores SHA-256 hex of the plaintext. Lookup at redemption time: hash the submitted token, query by `token_hash` + `expires_at > now()` + `used_at IS NULL`. Atomic UPDATE on redemption to set `used_at` (race-safe via DB constraint). Deletion policy: delete tokens older than 90 days via scheduled cleanup (low priority).

### Pending-NIN reminder cadence — why BullMQ over cron

BullMQ already in stack (per ADR-003); adding a daily scheduled job is one config change in `apps/api/src/workers/index.ts`. cron would require external scheduling (systemd timer or DO scheduled task) — heavier setup for the same outcome. Use BullMQ's `repeatable jobs` API.

### Server-side draft vs IndexedDB

The wizard stores drafts in **both** IndexedDB (local, fast, offline-tolerant) **and** server-side (per-account row in a new `wizard_drafts` table). Reason: IndexedDB alone breaks the cross-device return-to-complete UX (respondent starts on phone, finishes on laptop). Server-side draft is the source of truth on magic-link redemption; IndexedDB is the source of truth during a single session. Last-write-wins reconciliation if both are updated.

### Why Google OAuth retirement is a deliberate scope

Per Architecture ADR-015 rewrite: Google OAuth was the original (2026-01-22) primary registration channel; it was retired during the SCP-2026-04-22 wizard rework because (a) Nigerian non-technical user adoption was low, (b) the "Continue with Google" affordance was misread as government-Google partnership claim (NDPA confound), (c) magic-link is simpler and works everywhere. Reviving Google OAuth requires a new SCP + ADR-015 amendment.

## Risks

1. **Story 11-1 must land first.** The `pending_nin_capture` enum value is in 11-1's migration. Mitigation: 11-1 is on the same Bob create-story batch; sequencing in dev workflow must respect dependency.
2. **Wizard renderer is a net-new frontend surface.** Implementation cost is real but bounded — ~10 React components, no architectural complexity. Budget estimate: 5-7 dev-days for full Task 4-8.
3. **Magic-link email deliverability.** AWS SES is reliable but spam-filter false positives are possible. Mitigation: include plaintext fallback link in every email; rate-limit shares password-reset budget pool to keep volume sane.
4. **SMS OTP feature flag could rot.** Building infrastructure that's never used risks bit-rot. Mitigation: include `NoopSmsProvider` regression test in baseline; document the toggle path in runbook so future operator knows how to activate.
5. **Existing public_user account migration confusion.** Some existing users may not realize the wizard is for new registrations only. Mitigation: cutover messaging (AC#11) makes the distinction visually explicit; FAQ entry in `/support/faq`.
6. **Reminder cadence timing edge cases.** Respondent who completes pending-NIN at T+1d should not receive T+2d reminder. Mitigation: reminder worker checks `respondent.status` before sending — only sends if still `pending_nin_capture`; tests cover this branch.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Backend (created):**
- `apps/api/src/db/schema/magic-link-tokens.ts`
- `apps/api/src/db/schema/wizard-drafts.ts`
- `apps/api/src/services/magic-link.service.ts`
- `apps/api/src/services/auth/sms-provider.adapter.ts`
- `apps/api/src/services/auth/sms-otp.service.ts`
- `apps/api/src/workers/reminder.worker.ts`
- `apps/api/src/services/email/templates/magic-link.html`
- `apps/api/src/services/email/templates/pending-nin-reminder.html`
- `apps/api/src/services/email/templates/registration-complete.html`
- `apps/api/src/services/email/templates/registration-pending.html`
- `apps/api/src/routes/registration.routes.ts` (new wizard endpoints)
- Tests: `*.test.ts` per service/route

**Backend (modified):**
- `apps/api/src/db/schema/index.ts` (re-exports)
- `apps/api/src/services/submission-processing.service.ts` (NIN-conditional branching — landed in Story 11-1; this story consumes)
- `apps/api/src/routes/auth.routes.ts` (retire Google OAuth route)
- `apps/api/src/lib/settings.ts` (add `auth.sms_otp_enabled`)
- Drizzle migration files

**Frontend (created):**
- `apps/web/src/layouts/WizardLayout.tsx`
- `apps/web/src/features/registration/components/WizardStepIndicator.tsx`
- `apps/web/src/features/registration/components/NinHelpHint.tsx`
- `apps/web/src/features/registration/components/PendingNinToggle.tsx`
- `apps/web/src/features/registration/components/EmailTypoDetection.tsx`
- `apps/web/src/features/registration/components/TrustBadgesRow.tsx`
- `apps/web/src/features/registration/pages/Step1BasicInfo.tsx`
- `apps/web/src/features/registration/pages/Step2ContactLga.tsx`
- `apps/web/src/features/registration/pages/Step3Consent.tsx`
- `apps/web/src/features/registration/pages/Step4Questionnaire.tsx`
- `apps/web/src/features/registration/pages/Step5NinAndAuth.tsx`
- `apps/web/src/features/registration/pages/CompleteNinPage.tsx`
- `apps/web/src/features/registration/pages/RegistrationCompletePage.tsx`
- `apps/web/src/features/registration/api/wizard.ts` (TanStack Query hooks)
- Tests: component tests + integration tests + E2E

**Frontend (modified):**
- `apps/web/src/features/auth/pages/PublicLoginPage.tsx` (cutover messaging)
- `apps/web/src/features/staff-activation/pages/*.tsx` (step-indicator polish)
- `apps/web/src/features/auth/pages/PublicRegisterPage.tsx` (retire / redirect)
- Routing config (TanStack Router)

**Other:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status flips)
- `_bmad-output/planning-artifacts/epics.md` (FRC item #3 status flip on completion)

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story created by Bob (SM) per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 14 ACs covering 5-step wizard + magic-link primary + SMS OTP infra-only + pending-NIN status path + NinHelpHint + email-typo detection + trust badges + return-to-complete + reminder cadence + migration cutover + bundled staff-wizard polish + tests + FRC flip. Depends on Story 11-1 schema. | A.5 sequencing: 9-12 follows 11-1 in dependency order. FRC item #3 — field-survey-blocking. |
