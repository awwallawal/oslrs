# Story 9.12: Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email

Status: ready-for-dev

<!--
Created 2026-04-25 by impostor-SM agent per SCP-2026-04-22 §A.5.

This story collapses the existing 4-hop public registration (register → verify email → login → fill form) into a single 5-step wizard. Magic-link is the primary auth channel; SMS OTP is built but feature-flagged off (budget-gated). Pending-NIN status path supports respondents without NIN at submission.

Sources:
  • PRD V8.3 FR5 (softened), FR21 (scoped), FR27 (wizard), FR28 (deferred-NIN)
  • Architecture Decisions 2.5 (magic-link primary), 2.6 (SMS OTP infra-only), Decision 1.5 (status enum)
  • Architecture ADR-015 rewrite (5-step wizard) + ADR-018 (multi-source / pending-NIN)
  • UX Journey 2 rewrite + Journey 8 (return-to-complete) + Form Patterns (NinHelpHint, Email-Typo Detection, Pending-NIN Toggle) + Visible Step Indicator pattern + Trust badges
  • Epics.md §Story 9.12

Field-Readiness Certificate item #3 — field-survey-blocking until done.
Depends on Story 11-1 (status enum on respondents table) AND `prep-settings-landing-and-feature-flags` (SMS OTP toggle UI host + system_settings table for the feature flag).

Validation pass 2026-04-30 (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`): rebuilt to canonical template; 5 factual path corrections applied (PublicRegisterPage → RegistrationPage; PublicLoginPage → LoginPage; staff-activation feature dir → auth/components/activation-wizard existing; email service flat file vs templates subdirectory clarified; lib/settings.ts dependency relocated to prep-settings-landing); AC#7 SMS OTP toggle UI dependency reframed to consume `prep-settings-landing-and-feature-flags` (per Awwal Path B decision 2026-04-30 — Settings landing is HARD dependency for AC#7 SMS OTP toggle UI; backend feature flag mechanism lives in `apps/api/src/lib/settings.ts` from that prep story).
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

2. **AC#2 — Visible step indicator (per Sally's Progress Pattern):** `WizardStepIndicator` component renders horizontal breadcrumb-style row above the wizard card on screens ≥480px (clickable completed circles for back-nav, current circle filled Primary-600, future circles disabled). Mobile <480px collapses to "Step N of M — <label>" text-only. Persistently visible (`position: sticky; top: 0`). Component is reused by Story 11-3 Admin Import wizard and the staff activation wizard polish in AC#12.

3. **AC#3 — `NinHelpHint` shared component (per Sally's Form Pattern):** New component at `apps/web/src/features/registration/components/NinHelpHint.tsx` (or shared location for cross-feature reuse). Three variants: `inline` (under input, used in this wizard Step 5), `tooltip` (icon-button beside label, used in Data Entry Clerk form per Story 9-12 follow-up), `banner` (full-width above field, used in pending-NIN return-to-complete view per AC#9). All three carry `*346#` USSD copy in JetBrains Mono background. Inline variant additionally surfaces "I don't have my NIN now" link that triggers the pending-NIN toggle in the parent wizard. Accessibility: parent NIN input has `aria-describedby` pointing to inline hint; tooltip is a `<button role="button">` keyboard-focusable; banner is `<aside role="note">`.

4. **AC#4 — Pending-NIN toggle + status path (per Sally's Form Pattern):** `<button role="switch">` labelled "I don't have my NIN with me right now" under the NIN input on Step 5. When ON: NIN field disabled (preserved value retained), `respondent.status = 'pending_nin_capture'` set on submit, consequence preview card appears (Info-50 background, Info-600 left border) with copy "Your registration will be saved as pending. We'll email you to complete it. We'll also remind you in 2 days, 7 days, and 14 days." Submit button label changes from "Submit Registration" to "Save as Pending" when toggle is ON. Toggle state survives back-navigation to previous steps.

5. **AC#5 — Email-typo detection (per Sally's Form Pattern):** On blur of the email input on Step 2, run published common-typo dictionary check (`mailcheck` library or curated subset including `gmail.vom`, `gmail.con`, `gmial.com`, `gmal.com`, `gmaill.com`, `mail.com`, `yahooo.com`, `hotmial.com`, `hotmali.com`). On match, render Info-700 text below field: "Did you mean `<corrected>`? [Use this]". "Use this" is a `<button>` that applies the correction; ignoring submits the original. Suggestion is in a live region (`role="status" aria-live="polite"`). Never auto-correct.

6. **AC#6 — Magic-link primary auth (per Architecture Decision 2.5):**
   - New service `apps/api/src/services/magic-link.service.ts` — generate 32-byte token (`crypto.randomBytes(32).toString('base64url')`), SHA-256 hash for storage in new `magic_link_tokens` table (`{ id, public_user_id|user_id, token_hash, purpose, expires_at, used_at, created_at }`)
   - Purpose enum: `wizard_resume` (TTL 72h) | `pending_nin_complete` (TTL 72h) | `login` (TTL 15min)
   - Single-use enforcement via atomic `used_at` set on first redemption
   - Rate limit: 3 requests per email per hour (shares the existing NFR4.4 password-reset budget pool — clone rate-limit middleware pattern from `apps/api/src/middleware/login-rate-limit.ts:25-110` with `prefix: 'rl:magic-link:'`)
   - Email content: short, action-oriented; uses existing `EmailService` at `apps/api/src/services/email.service.ts` (flat file — verify how templates are currently handled before adding new ones); subject "Continue your Oyo State Skills Registry registration"; primary CTA button + plaintext fallback link + 72-hour expiry note + recovery instructions
   - New endpoints:
     - `POST /api/v1/auth/public/magic-link` — request a magic link by email + purpose
     - `GET /auth/magic?token=<plaintext>&purpose=<purpose>` — controller hashes, validates, issues JWT (per existing public-login JWT shape), redirects per purpose

7. **AC#7 — SMS OTP infrastructure-only / feature-flagged off (per Architecture Decision 2.6):**
   - Build the full code path: route handler `POST /api/v1/auth/public/sms-otp/request` + `POST /verify`, `SmsProviderAdapter` interface with one implementation `NoopSmsProvider` that logs + rejects with `SMS_OTP_DISABLED`, audit wiring identical to magic-link path
   - **Feature flag** `auth.sms_otp_enabled` lives in `system_settings` table (created by `prep-settings-landing-and-feature-flags`). Backend reads via `getSetting<boolean>('auth.sms_otp_enabled')` from `apps/api/src/lib/settings.ts` (also created by that prep story; **HARD dependency** — this story cannot ship before prep-settings-landing lands). Default value: `false` (seeded by prep-settings-landing migration).
   - **Super-admin toggle UI** lives in the Settings Landing Page at `/dashboard/super-admin/settings` (created by `prep-settings-landing`); the `SmsOtpToggle` component (per prep-settings-landing AC#5 v1 contents) provides the UI. This story does NOT add a separate UI surface for the toggle.
   - When flag flips ON via Settings landing UI (future Termii or Africa's Talking integration), the resolver in `sms-otp.service.ts` switches to a real provider implementation and the path activates without redeploy
   - Audit-logged on flip via `prep-settings-landing` `SETTINGS_FLIPPED` action — this story doesn't add separate audit instrumentation for the flag flip
   - **No partner-API scope (Epic 10) or wizard step depends on SMS OTP** — verified via test: enabling the flag must not break any existing flow

8. **AC#8 — Trust badges row (SUPA-inspired but distinct):** Three `<aside>` badges at the foot of every wizard step card: "🔒 Secure Registration" (Success-100/600), "🛡️ Official Oyo State Platform" (Primary-50/600 with Oyo State logo SVG 38×38), "🆓 Free to Join" (Info-100/600). Stack vertically on screens <480px. Each badge has `aria-label` describing the assurance. Visual hierarchy intentionally lower than primary CTAs.

9. **AC#9 — Return-to-complete via magic link (per Sally's Journey 8):**
   - When a respondent clicks `wizard_resume` magic link, server hydrates from server-side draft (not just IndexedDB — works across devices), redirects to `/register?step=N` where N is the saved step
   - When a respondent clicks `pending_nin_complete` magic link, server redirects to dedicated narrow view `/register/complete-nin` (NOT the full wizard re-mount) — view contains only the NinHelpHint banner + NIN input + Save button + trust badges row
   - "I still don't have my NIN — remind me later" link in the complete-nin view triggers server endpoint that resets the reminder timer (next reminder pushed to T+7d from now); audit-logged with `action: 'pending_nin.deferred_again'` (add to `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`)
   - On valid + new NIN entry from complete-nin view: `respondents.status` promotes `pending_nin_capture` → `active`; FR21 dedupe runs at this moment (since NIN is now present); success email confirms; respondent lands on "Registration complete" screen
   - On valid but duplicate NIN: original-registration-date message + "go back" / "contact support" affordances (per Journey 2 wizard handling)

10. **AC#10 — Reminder cadence for `pending_nin_capture` (FR28):**
    - Scheduled job runs daily; for each `pending_nin_capture` respondent:
      - Send reminder email at T+2d, T+7d, T+14d (each carries `pending_nin_complete` magic link)
      - At T+30d transition status to `nin_unavailable` and add to supervisor-review queue (audit-logged via `AuditService.logAction({ action: 'pending_nin.transitioned_to_nin_unavailable' })` — add to `AUDIT_ACTIONS` const)
    - Reminder cadence reset by AC#9 "remind me later" affordance (next reminder T+7d from reset)
    - BullMQ scheduled job (already in stack per ADR-003 — verify by inspecting existing workers list at `apps/api/src/workers/`); add to `apps/api/src/workers/reminder.worker.ts` (NEW file)
    - Email rendering: depends on AC#6 decision about `EmailService` template handling (flat file vs subdirectory)

11. **AC#11 — Migration: existing `public_users` accounts continue to work:**
    - Existing accounts retain password + `/auth/public/login` continues to work unchanged (login page at `apps/web/src/features/auth/pages/LoginPage.tsx` — actual file name)
    - Existing `respondents` rows stay `status = 'active'` with their captured NIN (Story 11-1 migration default)
    - Login page (`apps/web/src/features/auth/pages/LoginPage.tsx` — NOT `PublicLoginPage.tsx` which doesn't exist) above-the-fold banner: "**New here?** Try our new registration wizard — it takes about 5 minutes." with primary-link affordance to `/register`
    - Existing-user header: "Already registered? Sign in below"
    - Two affordances visually distinct so existing users do not accidentally start over
    - Google OAuth route retired — handler unmounted, returns 404 if invoked; Google Cloud Console client credentials revoked as part of this story (Awwal action item)
    - Hybrid Magic-Link/OTP email template removed from email-service codebase (replaced by new magic-link-only template)

12. **AC#12 — Bundled task: Staff Activation Wizard step-indicator polish:**
    - Existing staff activation flow (Story 1.2 — `/activate?token=...`) ALREADY uses a multi-step wizard pattern at `apps/web/src/features/auth/components/activation-wizard/ActivationWizard.tsx` + `apps/web/src/features/auth/components/activation-wizard/steps/*.tsx` (verified to exist 2026-04-30; story v1's reference to fictional `apps/web/src/features/staff-activation/` was incorrect — staff activation lives under `auth/components/activation-wizard/`)
    - Retro-fit `WizardStepIndicator` component (built per AC#2) onto the existing staff activation flow — visual polish only, no logic changes
    - Apply trust badges row at the foot for visual consistency with public wizard

13. **AC#13 — Tests:**
    - Component tests: `NinHelpHint` (3 variants), `PendingNinToggle`, `EmailTypoDetection`, `WizardStepIndicator`, `TrustBadgesRow`
    - Integration tests: 5-step wizard happy path with NIN; happy path with pending-NIN; email typo correction flow; pending-NIN reminder cadence (mocked time)
    - Service tests: `MagicLinkService` (token generation, SHA-256 hashing, single-use enforcement, expiry, rate limit); `NoopSmsProvider` rejects with `SMS_OTP_DISABLED`
    - End-to-end tests: complete wizard with NIN; complete wizard pending-NIN, then complete via magic link from email; existing public_user login still works post-migration
    - Existing 4,191-test baseline maintained or grown

14. **AC#14 — Field Readiness Certificate item #3 satisfied:** When all above ACs pass + the wizard is live in production + at least one test respondent completes the wizard end-to-end (NIN-present or pending-NIN), flip FRC item #3 status in `epics.md` from `⏳ Backlog → ✅ Done <date>`.

## Tasks / Subtasks

- [ ] **Task 1 — Backend: magic-link service + endpoints + reminder worker** (AC: #6, #9, #10)
  - [ ] 1.1 Create `apps/api/src/db/schema/magic-link-tokens.ts` — Drizzle schema (no `@oslsr/types` import per project pattern)
  - [ ] 1.2 Create `apps/api/src/db/schema/wizard-drafts.ts` — server-side draft storage (per Dev Notes "Server-side draft vs IndexedDB")
  - [ ] 1.3 Migration: `CREATE TABLE magic_link_tokens (...)` + `CREATE TABLE wizard_drafts (...)` with index on `token_hash` + `expires_at`
  - [ ] 1.4 Migration file location: `apps/api/drizzle/<NNNN>_<descriptive_name>.sql` — sequential 4-digit prefix; confirm next number at impl time via `ls apps/api/drizzle/`. Multiple in-flight stories may collide; coordinate at impl time. **Path `apps/api/src/db/migrations/` does NOT exist.**
  - [ ] 1.5 Create `apps/api/src/services/magic-link.service.ts` — `issueToken({ purpose, identifier })` + `redeemToken(plaintext)` + `revokeToken(id)`
  - [ ] 1.6 Create `POST /api/v1/auth/public/magic-link` route handler (validates email exists or is new public registration; rate-limited 3/hr/email per NFR4.4 — clone `apps/api/src/middleware/login-rate-limit.ts:25-110` pattern with `prefix: 'rl:magic-link:'`)
  - [ ] 1.7 Create `GET /auth/magic` controller — hashes, validates, issues JWT (using existing JWT issuance from `apps/api/src/services/auth.service.ts:227` `loginStaff` pattern), redirects per `purpose`
  - [ ] 1.8 Email templates: **DECISION REQUIRED at impl time** — `apps/api/src/services/email.service.ts` currently exists as a flat file (verified 2026-04-30; see `apps/api/src/services/email.service.ts` + `email-budget.service.ts`). Templates are likely inline in the service OR rendered via a template lib. Inspect the existing service to determine pattern; new templates (`magic-link.html`, `pending-nin-reminder.html`, `registration-complete.html`, `registration-pending.html`) follow that pattern. If existing pattern is flat-string-templates, add new template strings to the service. If existing pattern uses subdirectory `apps/api/src/services/email/templates/<name>.html`, create that subdirectory and the new templates.
  - [ ] 1.9 BullMQ worker `apps/api/src/workers/reminder.worker.ts` — scheduled daily; queries `pending_nin_capture` respondents, fires reminders at T+2/7/14d, transitions to `nin_unavailable` at T+30d
  - [ ] 1.10 Add new audit actions to `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`: `MAGIC_LINK_ISSUED: 'magic_link.issued'`, `MAGIC_LINK_REDEEMED: 'magic_link.redeemed'`, `PENDING_NIN_DEFERRED: 'pending_nin.deferred_again'`, `PENDING_NIN_TRANSITIONED: 'pending_nin.transitioned_to_nin_unavailable'`
  - [ ] 1.11 Tests: `magic-link.service.test.ts` + `auth-magic.routes.test.ts` + `reminder.worker.test.ts` (mocked time)

- [ ] **Task 2 — Backend: SMS OTP infrastructure-only** (AC: #7)
  - [ ] 2.1 Create `apps/api/src/services/auth/sms-provider.adapter.ts` (NEW subdirectory under `services/`; mirrors `parsers/` precedent if needed) — interface + `NoopSmsProvider` impl that logs + rejects
  - [ ] 2.2 Create `apps/api/src/services/auth/sms-otp.service.ts` — issue/verify endpoints; uses adapter resolver
  - [ ] 2.3 **Feature flag mechanism** — read from `system_settings` table via `getSetting<boolean>('auth.sms_otp_enabled')` from `apps/api/src/lib/settings.ts` (created by `prep-settings-landing-and-feature-flags` — HARD dependency). Do NOT create an alternative settings mechanism in this story.
  - [ ] 2.4 Routes `POST /api/v1/auth/public/sms-otp/request` + `/verify` — return `503 SMS_OTP_DISABLED` when flag is OFF (default state); proceeds when flag is ON
  - [ ] 2.5 Audit-logging on flag flip is handled by `prep-settings-landing` `SETTINGS_FLIPPED` event — this story doesn't duplicate that
  - [ ] 2.6 Tests: confirm enabling the flag does not break any existing flow (regression suite); verify `503 SMS_OTP_DISABLED` shape when disabled

- [ ] **Task 3 — Backend: pending-NIN status path** (AC: #4, #9, #10)
  - [ ] 3.1 Wire wizard Step 5 submit → `SubmissionProcessingService.findOrCreateRespondent` (`apps/api/src/services/submission-processing.service.ts:310`) with conditional NIN-presence branching (Story 11-1 AC#7 prerequisite — should already be in place by the time this story implements)
  - [ ] 3.2 Endpoint `POST /api/v1/registration/complete-nin` — validates magic-link session, accepts NIN, runs FR21 dedupe, promotes `status` to `active` on success
  - [ ] 3.3 Endpoint `POST /api/v1/registration/defer-reminder` — resets reminder timer; audit-logged with `PENDING_NIN_DEFERRED` action
  - [ ] 3.4 Tests: status promotion, FR21-at-promotion, defer-reminder timer reset

- [ ] **Task 4 — Frontend: WizardLayout + WizardStepIndicator** (AC: #1, #2)
  - [ ] 4.1 New layout `apps/web/src/layouts/WizardLayout.tsx` — sticky step indicator + content slot + sticky trust badges footer
  - [ ] 4.2 New component `apps/web/src/features/registration/components/WizardStepIndicator.tsx` (NEW feature directory `apps/web/src/features/registration/`) — desktop/tablet variant (clickable circles) + mobile collapse variant (text-only)
  - [ ] 4.3 URL routing: `/register?step=N` with TanStack Router
  - [ ] 4.4 Auto-save server-side draft on every field change (debounced 2s) + IndexedDB local cache for offline-tolerance
  - [ ] 4.5 Tests: navigation between steps, draft hydration, mobile collapse breakpoint

- [ ] **Task 5 — Frontend: 5 wizard steps** (AC: #1)
  - [ ] 5.1 `apps/web/src/features/registration/pages/Step1BasicInfo.tsx` — full name + DOB + gender form
  - [ ] 5.2 `apps/web/src/features/registration/pages/Step2ContactLga.tsx` — phone + email (with email-typo per AC#5) + LGA autocomplete
  - [ ] 5.3 `apps/web/src/features/registration/pages/Step3Consent.tsx` — Stage 1 + Stage 2 consent radios with progressive disclosure
  - [ ] 5.4 `apps/web/src/features/registration/pages/Step4Questionnaire.tsx` — mounts the existing native form renderer for the public-survey form within wizard chrome
  - [ ] 5.5 `apps/web/src/features/registration/pages/Step5NinAndAuth.tsx` — NIN input + NinHelpHint inline + PendingNinToggle + magic-link/password/skip CTAs

- [ ] **Task 6 — Frontend: shared form pattern components** (AC: #3, #4, #5, #8)
  - [ ] 6.1 `apps/web/src/features/registration/components/NinHelpHint.tsx` (3 variants: inline, tooltip, banner) — see Sally's Custom Component #12 spec
  - [ ] 6.2 `apps/web/src/features/registration/components/PendingNinToggle.tsx` — see Sally's Form Pattern
  - [ ] 6.3 `apps/web/src/features/registration/components/EmailTypoDetection.tsx` — published dictionary + correction suggestion + Use-this button. Uses `mailcheck` dictionary from `prep-input-sanitisation-layer` (`apps/api/src/lib/normalise/typo-dictionary.json` — verify how the frontend consumes it; client-side dictionary may need separate JSON copy or shared package export)
  - [ ] 6.4 `apps/web/src/features/registration/components/TrustBadgesRow.tsx` — three badges per Sally's Journey 2 visual contract
  - [ ] 6.5 Tests: each component in isolation + accessibility verifications

- [ ] **Task 7 — Frontend: return-to-complete view** (AC: #9)
  - [ ] 7.1 New route `/register/complete-nin` (auth-gated by magic-link redemption)
  - [ ] 7.2 New view `apps/web/src/features/registration/pages/CompleteNinPage.tsx` — NinHelpHint banner + NIN input + Save + "remind me later" link
  - [ ] 7.3 On submit success: redirect to "Registration complete" screen with civic framing copy
  - [ ] 7.4 On NIN duplicate: surface FR21 message with "go back" / "contact support" affordances

- [ ] **Task 8 — Frontend: migration cutover messaging** (AC: #11)
  - [ ] 8.1 Update existing `apps/web/src/features/auth/pages/LoginPage.tsx` (NOT `PublicLoginPage.tsx` — that file does not exist; verified 2026-04-30): above-the-fold "New here?" banner with primary CTA to `/register`
  - [ ] 8.2 Update existing-user header copy: "Already registered? Sign in below"
  - [ ] 8.3 Visual distinction: new banner uses Info-50 background + Primary-600 link; existing-user header is default
  - [ ] 8.4 Update existing `apps/web/src/features/auth/pages/RegistrationPage.tsx` (NOT `PublicRegisterPage.tsx` — that file does not exist; verified 2026-04-30): retire OR redirect to new wizard at `/register`

- [ ] **Task 9 — Bundled: Staff Activation Wizard step-indicator polish** (AC: #12)
  - [ ] 9.1 Audit existing staff activation flow at `apps/web/src/features/auth/components/activation-wizard/ActivationWizard.tsx` + `apps/web/src/features/auth/components/activation-wizard/steps/*.tsx` (verified to exist 2026-04-30 — already a multi-step wizard pattern; story v1's `apps/web/src/features/staff-activation/` reference was fictional)
  - [ ] 9.2 Retro-fit `WizardStepIndicator` component built per AC#2 (no logic changes, visual polish only)
  - [ ] 9.3 Apply `TrustBadgesRow` at foot for visual consistency
  - [ ] 9.4 Update existing tests at `apps/web/src/features/auth/components/activation-wizard/__tests__/` (verify directory exists at impl time)

- [ ] **Task 10 — Cleanup** (AC: #11)
  - [ ] 10.1 Retire Google OAuth route handler at `apps/api/src/routes/auth.routes.ts:36-40` (return 404)
  - [ ] 10.2 Awwal: revoke Google Cloud Console client credentials
  - [ ] 10.3 Remove Hybrid Magic-Link/OTP email template (replaced by magic-link-only)
  - [ ] 10.4 Remove related Google OAuth tests

- [ ] **Task 11 — Tests + sprint-status** (AC: #13, #14)
  - [ ] 11.1 Add component tests + integration tests + service tests + E2E tests per AC#13
  - [ ] 11.2 Verify 4,191-test baseline maintained or grown
  - [ ] 11.3 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `9-12-public-wizard-pending-nin-magic-link: in-progress` → `review` at PR → `done` at merge
  - [ ] 11.4 On merge + production deploy + first test respondent completion: flip FRC item #3 in `_bmad-output/planning-artifacts/epics.md` from `⏳ Backlog` → `✅ Done <date>`

- [ ] **Task 12 — Code review** (cross-cutting AC: all)
  - [ ] 12.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree (per the existing "code review before commit" project pattern in MEMORY.md `feedback_review_before_commit.md`)
  - [ ] 12.2 Auto-fix all High/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI)
  - [ ] 12.3 Only after code review passes, commit and mark status `review`

## Dev Notes

### Dependencies

- **Story 11-1 (HARD)** — `respondents.status` enum (`pending_nin_capture` value) lives in 11-1's migration. 9-12 cannot ship before 11-1 lands.
- **`prep-settings-landing-and-feature-flags` (HARD per AC#7)** — `system_settings` table + `apps/api/src/lib/settings.ts` typed accessor + Settings Landing UI + `SmsOtpToggle` component all live in that prep story. AC#7 SMS OTP toggle UI consumes this. Cannot ship before prep-settings-landing lands.
- **`prep-input-sanitisation-layer` (SOFT per AC#5)** — Email-typo detection in AC#5 reuses the typo dictionary from `apps/api/src/lib/normalise/typo-dictionary.json`. Story can ship without it (use a built-in subset) but reuse is cleaner.
- **Architecture ADR-015 (rewritten)** + Decision 2.5 (magic-link primary) + Decision 2.6 (SMS OTP infra-only) — design baseline
- **UX Journey 2 rewrite + Journey 8** — flow specifications
- **UX Form Patterns + Custom Components #12 (`NinHelpHint`) + Visible Step Indicator pattern** — component specs

### Field Readiness Certificate Impact

**FRC item #3** (Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email live) — this story IS that item. **Field-survey-blocking until done.**

### Magic-link token storage discipline

Per Architecture Decision 2.5: plaintext token is sent in email exactly once, never persisted. `magic_link_tokens.token_hash` stores SHA-256 hex of the plaintext. Lookup at redemption time: hash the submitted token, query by `token_hash` + `expires_at > now()` + `used_at IS NULL`. Atomic UPDATE on redemption to set `used_at` (race-safe via DB constraint). Deletion policy: delete tokens older than 90 days via scheduled cleanup (low priority).

### Pending-NIN reminder cadence — why BullMQ over cron

BullMQ already in stack (per ADR-003) — verified by inspecting `apps/api/src/workers/` directory which contains 9 worker files (`fraud-detection.worker.ts`, `marketplace-extraction.worker.ts`, `import.worker.ts`, `productivity-snapshot.worker.ts`, `dispute-autoclose.worker.ts`, `backup.worker.ts`, `webhook-ingestion.worker.ts`, `email.worker.ts`, plus `index.ts`). Adding a daily scheduled job is one config change in `apps/api/src/workers/index.ts`. cron would require external scheduling (systemd timer or DO scheduled task) — heavier setup for the same outcome. Use BullMQ's `repeatable jobs` API.

### Server-side draft vs IndexedDB

The wizard stores drafts in **both** IndexedDB (local, fast, offline-tolerant) **and** server-side (per-account row in a new `wizard_drafts` table). Reason: IndexedDB alone breaks the cross-device return-to-complete UX (respondent starts on phone, finishes on laptop). Server-side draft is the source of truth on magic-link redemption; IndexedDB is the source of truth during a single session. Last-write-wins reconciliation if both are updated.

### Why Google OAuth retirement is a deliberate scope

Per Architecture ADR-015 rewrite: Google OAuth was the original (2026-01-22) primary registration channel; it was retired during the SCP-2026-04-22 wizard rework because (a) Nigerian non-technical user adoption was low, (b) the "Continue with Google" affordance was misread as government-Google partnership claim (NDPA confound), (c) magic-link is simpler and works everywhere. Reviving Google OAuth requires a new SCP + ADR-015 amendment.

### SMS OTP feature flag — relationship to prep-settings-landing

This story builds the SMS OTP code path (route + provider adapter + service); the feature flag mechanism (DB row in `system_settings`) + super-admin toggle UI both live in `prep-settings-landing-and-feature-flags`. Reading the flag at runtime is `await getSetting<boolean>('auth.sms_otp_enabled')` from `apps/api/src/lib/settings.ts`. Writing the flag (toggle) happens in the Settings Landing UI; this story is an OBSERVER of the flag, not an OWNER.

This split is deliberate per Awwal Path B decision 2026-04-30 — putting the toggle UI in this story would scope-creep into general-purpose Settings infrastructure; building Settings infrastructure once is cheaper than per-feature.

### Email service template handling — verify at impl time

`apps/api/src/services/email.service.ts` exists as a flat file (verified 2026-04-30). Story v1 referenced `apps/api/src/services/email/templates/` subdirectory which does NOT yet exist. Two options at impl time:
- (a) Inspect existing `email.service.ts` template handling pattern. If it uses inline string templates, add new templates to the service file directly. If it uses an external template lib (e.g. handlebars + file-based templates), create the subdirectory and add new template files.
- (b) Refactor email service to use a templates subdirectory if the existing pattern is hard to extend (e.g. inline strings becoming unwieldy with 4+ new templates added).

**Decision deferred to dev-time** — inspect existing pattern, follow it. If refactor is needed, propose a separate prep task (don't expand 9-12 scope).

### Path corrections from story v1

Story v1 (drafted 2026-04-25 by impostor-SM agent) had several fictional file paths corrected throughout this 2026-04-30 retrofit:

| v1 (fictional) | v2 (actual) |
|---|---|
| `apps/web/src/features/auth/pages/PublicRegisterPage.tsx` | `apps/web/src/features/auth/pages/RegistrationPage.tsx` |
| `apps/web/src/features/auth/pages/PublicLoginPage.tsx` | `apps/web/src/features/auth/pages/LoginPage.tsx` |
| `apps/web/src/features/staff-activation/pages/*.tsx` | `apps/web/src/features/auth/components/activation-wizard/...` |
| `apps/api/src/lib/settings.ts` (referenced as if existing) | Provided by `prep-settings-landing-and-feature-flags` (HARD dependency) |
| `apps/api/src/services/email/templates/` (referenced as existing dir) | Email service is flat file `apps/api/src/services/email.service.ts`; templates subdirectory may need creation per Task 1.8 decision |

The pattern (impostor-SM heuristic file-path generator) is consistent across all retrofits in Wave 0/1/2.

### Risks

1. **Story 11-1 must land first.** The `pending_nin_capture` enum value is in 11-1's migration. Mitigation: 11-1 is on the same Bob create-story batch; sequencing in dev workflow must respect dependency.
2. **`prep-settings-landing` must land first** for AC#7 SMS OTP toggle UI. Mitigation: prep-settings-landing is Wave 1 (drafted 2026-04-30); this story is Wave 2; natural sequencing.
3. **Wizard renderer is a net-new frontend surface.** Implementation cost is real but bounded — ~10 React components, no architectural complexity. Budget estimate: 5-7 dev-days for full Task 4-8.
4. **Magic-link email deliverability.** AWS SES is reliable but spam-filter false positives are possible. Mitigation: include plaintext fallback link in every email; rate-limit shares password-reset budget pool to keep volume sane.
5. **SMS OTP feature flag could rot.** Building infrastructure that's never used risks bit-rot. Mitigation: include `NoopSmsProvider` regression test in baseline; document the toggle path in runbook so future operator knows how to activate.
6. **Existing public_user account migration confusion.** Some existing users may not realize the wizard is for new registrations only. Mitigation: cutover messaging (AC#11) makes the distinction visually explicit; FAQ entry in `/support/faq`.
7. **Reminder cadence timing edge cases.** Respondent who completes pending-NIN at T+1d should not receive T+2d reminder. Mitigation: reminder worker checks `respondent.status` before sending — only sends if still `pending_nin_capture`; tests cover this branch.
8. **Email service template handling unknown.** AC#6 + AC#10 + AC#9 all need email templates; current service is flat file with unknown template pattern. Mitigation: Task 1.8 explicitly defers to dev-time inspection; Dev Notes "Email service template handling" provides decision tree; refactor (if needed) is a separate prep task.

### Project Structure Notes

- **NEW feature directory** `apps/web/src/features/registration/` with `pages/`, `components/`, `api/` subdirs. Mirrors the existing-feature-dir pattern (`auth/`, `dashboard/`, `marketplace/`, `staff/`, etc.). Substantial-enough surface (5 wizard steps + 4 shared components + 2 supplementary pages) to warrant its own dir.
- **Wizard layout** at `apps/web/src/layouts/WizardLayout.tsx` — verify `apps/web/src/layouts/` directory exists; if not, create. Existing layouts pattern reference: `apps/web/src/layouts/__tests__/DashboardLayout.test.tsx` exists (verified 2026-04-30) → DashboardLayout exists somewhere; assume layouts dir exists.
- **Existing auth pages** at `apps/web/src/features/auth/pages/` (verified 2026-04-30 — 8 pages: `RegistrationPage`, `VerifyEmailPage`, `StaffLoginPage`, `ResendVerificationPage`, `ResetPasswordPage`, `LoginPage`, `ForgotPasswordPage`, `ActivationPage`). This story modifies `LoginPage.tsx` (cutover banner per AC#11) + retires/redirects `RegistrationPage.tsx` (replaced by new wizard at `/register`).
- **Existing staff activation wizard** at `apps/web/src/features/auth/components/activation-wizard/ActivationWizard.tsx` + `apps/web/src/features/auth/components/activation-wizard/steps/BankDetailsStep.tsx` (verified 2026-04-30). Story v1's reference to `apps/web/src/features/staff-activation/` was fictional. AC#12 retro-fits the new `WizardStepIndicator` component onto this existing wizard.
- **Backend service-layer pattern** — new files: `apps/api/src/services/magic-link.service.ts`, `apps/api/src/services/auth/sms-otp.service.ts`, `apps/api/src/services/auth/sms-provider.adapter.ts`. The `auth/` subdirectory under `services/` is a NEW pattern for this codebase (verify if any existing services use subdirs at impl time). If no existing precedent, fold them into flat `apps/api/src/services/sms-otp.service.ts` + `sms-provider.adapter.ts` to match flat-service-file convention.
- **Workers directory** at `apps/api/src/workers/<name>.worker.ts` — 9 existing files verified 2026-04-30. New `reminder.worker.ts` (Task 1.9) follows convention.
- **Drizzle schema barrel** at `apps/api/src/db/schema/index.ts:1-17` — extend with `magic-link-tokens.ts` + `wizard-drafts.ts` exports.
- **Drizzle constraint:** schema files MUST NOT import from `@oslsr/types` (drizzle-kit runs compiled JS; `@oslsr/types` has no `dist/`). Per MEMORY.md key pattern.
- **Drizzle migrations** at `apps/api/drizzle/<NNNN>_<name>.sql` — sequential 4-digit prefix. Multiple in-flight stories may collide; coordinate at impl time.
- **Settings access** via `getSetting<T>(key)` from `apps/api/src/lib/settings.ts` (created by `prep-settings-landing` HARD dependency). Do NOT create alternative settings mechanism.
- **Audit logging** via `AuditService.logAction()` (`apps/api/src/services/audit.service.ts:226`). New audit actions added to `AUDIT_ACTIONS` const at `audit.service.ts:35-64` per Task 1.10. Magic-link issuance, magic-link redemption, pending-NIN deferral, pending-NIN transition, SMS OTP attempt — each with its own action key.
- **Rate-limit middleware pattern** clone from `apps/api/src/middleware/login-rate-limit.ts:25-110` (express-rate-limit + RedisStore + `prefix:` namespacing + `isTestMode()` skip). New per-endpoint prefixes: `rl:magic-link:` (3/hr/email per NFR4.4).
- **JWT issuance** uses existing pattern from `apps/api/src/services/auth.service.ts:227` `loginStaff` method — magic-link redemption issues a JWT in the same shape.
- **Frontend HTTP client** is `apps/web/src/lib/api-client.ts:31` — fetch-based, throws `ApiError`. NO axios.
- **TanStack Query convention** — feature-level api file at `apps/web/src/features/registration/api/wizard.api.ts`; hooks named `useWizardDraft`, `useStep1Submit`, `useMagicLink`, etc.
- **CSP discipline:** Story 9-7 enforces strict CSP via nginx mirror. New email templates must avoid inline scripts; new frontend components must avoid `eval` / `new Function()` / inline `<script>`.
- **Email service** is `apps/api/src/services/email.service.ts` flat file (verified 2026-04-30; coexists with `email-budget.service.ts`). Template handling pattern unknown; inspect before adding new templates per Task 1.8.
- **Existing routes file for auth** at `apps/api/src/routes/auth.routes.ts` (verified 2026-04-30). New routes (`/auth/public/magic-link`, `/auth/magic`, `/auth/public/sms-otp/request`, `/auth/public/sms-otp/verify`) added to this existing file.
- **NEW directories created by this story:**
  - `apps/web/src/features/registration/` (with `pages/`, `components/`, `api/` subdirs)
  - Possibly `apps/api/src/services/auth/` (if subdirectory pattern is acceptable; otherwise flat under `services/`)
  - Possibly `apps/api/src/services/email/templates/` (per Task 1.8 decision)

### References

- Architecture ADR-015 rewritten (Public User Registration & Auth Strategy — magic-link primary): [Source: _bmad-output/planning-artifacts/architecture.md:2713]
- Architecture ADR-018 (multi-source registry / pending-NIN status model): [Source: _bmad-output/planning-artifacts/architecture.md:3137]
- Architecture Decision 2.5 (magic-link primary): [Source: _bmad-output/planning-artifacts/architecture.md Decision 2.5]
- Architecture Decision 2.6 (SMS OTP infra-only): [Source: _bmad-output/planning-artifacts/architecture.md Decision 2.6]
- Architecture Decision 1.5 (status enum on respondents — `pending_nin_capture` value): [Source: _bmad-output/planning-artifacts/architecture.md Decision 1.5]
- Epics — Story 9.12 entry: [Source: _bmad-output/planning-artifacts/epics.md Epic 9 §9.12]
- Story 11-1 (HARD dependency — status enum): [Source: _bmad-output/implementation-artifacts/11-1-multi-source-registry-schema-foundation.md AC#2]
- prep-settings-landing-and-feature-flags (HARD dependency — system_settings + lib/settings.ts + SmsOtpToggle UI): [Source: _bmad-output/implementation-artifacts/prep-settings-landing-and-feature-flags.md AC#1, AC#2, AC#5]
- prep-input-sanitisation-layer (SOFT — typo dictionary reuse): [Source: _bmad-output/implementation-artifacts/prep-input-sanitisation-layer.md Task 1.7]
- Existing `RegistrationPage.tsx` (modified per AC#11 / Task 8.4): [Source: apps/web/src/features/auth/pages/RegistrationPage.tsx]
- Existing `LoginPage.tsx` (modified per AC#11 / Task 8.1): [Source: apps/web/src/features/auth/pages/LoginPage.tsx]
- Existing staff activation wizard (Task 9.1 retro-fit target): [Source: apps/web/src/features/auth/components/activation-wizard/ActivationWizard.tsx]
- Existing email service (Task 1.8 inspection target): [Source: apps/api/src/services/email.service.ts]
- Existing email-budget service (peer file context): [Source: apps/api/src/services/email-budget.service.ts]
- Existing workers directory (BullMQ confirmed in stack via 9 worker files): [Source: apps/api/src/workers/]
- Existing auth routes file (extended per Task 1.6, 1.7, 2.4): [Source: apps/api/src/routes/auth.routes.ts]
- AuthService loginStaff JWT issuance pattern (clone for magic-link redemption): [Source: apps/api/src/services/auth.service.ts:227]
- SubmissionProcessingService findOrCreateRespondent (modified per Task 3.1): [Source: apps/api/src/services/submission-processing.service.ts:310]
- Audit service `logAction` API: [Source: apps/api/src/services/audit.service.ts:226]
- Audit service `AUDIT_ACTIONS` const (extended with 4 new actions): [Source: apps/api/src/services/audit.service.ts:35-64]
- Rate-limit middleware canonical pattern (clone for magic-link 3/hr): [Source: apps/api/src/middleware/login-rate-limit.ts:25-110]
- Drizzle migration directory + naming convention: [Source: apps/api/drizzle/0007_audit_logs_immutable.sql]
- Schema barrel: [Source: apps/api/src/db/schema/index.ts:1-17]
- Web HTTP client (fetch-based): [Source: apps/web/src/lib/api-client.ts:31]
- MEMORY.md key pattern: drizzle schema cannot import `@oslsr/types`: [Source: MEMORY.md "Key Patterns"]
- MEMORY.md key pattern: code review before commit: [Source: MEMORY.md "Process Patterns" + `feedback_review_before_commit.md`]

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation. Implementer must include:)_

- Sequential migration number claimed (one of `0008` through `0014` depending on commit ordering)
- Email service template handling pattern (inline strings vs subdirectory; Task 1.8 decision outcome)
- `apps/api/src/services/auth/` subdirectory decision (created OR flat `services/sms-otp.service.ts` chosen)
- prep-settings-landing dependency status verified (system_settings table exists, `getSetting` accessor works) before starting Task 2.3
- Story 11-1 dependency status verified (`pending_nin_capture` enum value live in DB) before starting Task 3.1
- Wizard renderer dev-day actual vs estimate (5-7 dev-days estimate per Risk #3)
- E2E test coverage for cross-device wizard resume (start on phone, finish on laptop)
- Code review findings + fixes (cross-reference Review Follow-ups (AI) below)

### File List

**Backend (created):**
- `apps/api/src/db/schema/magic-link-tokens.ts`
- `apps/api/src/db/schema/wizard-drafts.ts`
- `apps/api/src/services/magic-link.service.ts`
- `apps/api/src/services/auth/sms-provider.adapter.ts` (or flat `sms-provider.adapter.ts` if `auth/` subdir not preferred)
- `apps/api/src/services/auth/sms-otp.service.ts` (or flat `sms-otp.service.ts`)
- `apps/api/src/workers/reminder.worker.ts`
- Email templates per Task 1.8 decision (location varies based on existing pattern)
- `apps/api/drizzle/<NNNN>_*.sql` — migration with magic_link_tokens + wizard_drafts tables
- Tests: `*.test.ts` per service/route/worker

**Backend (modified):**
- `apps/api/src/db/schema/index.ts` — re-export new schemas
- `apps/api/src/services/audit.service.ts` — extend `AUDIT_ACTIONS` const with 4 new actions
- `apps/api/src/services/submission-processing.service.ts` — wire wizard Step 5 submit (NIN-conditional branching landed in Story 11-1; this story consumes)
- `apps/api/src/routes/auth.routes.ts` — add new endpoints (magic-link, sms-otp, complete-nin, defer-reminder); retire Google OAuth handler
- `apps/api/src/services/email.service.ts` — add new templates (or refactor to subdirectory per Task 1.8)
- `apps/api/src/workers/index.ts` — register `reminder.worker.ts` BullMQ job
- `apps/api/src/middleware/magic-link-rate-limit.ts` (clone of login-rate-limit.ts pattern; or extend existing rate-limit middleware)

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
- `apps/web/src/features/registration/api/wizard.api.ts` (TanStack Query hooks)
- Tests: component tests + integration tests + E2E

**Frontend (modified):**
- `apps/web/src/features/auth/pages/LoginPage.tsx` — cutover messaging (NOT `PublicLoginPage.tsx` — that file does not exist)
- `apps/web/src/features/auth/pages/RegistrationPage.tsx` — retire/redirect (NOT `PublicRegisterPage.tsx`)
- `apps/web/src/features/auth/components/activation-wizard/ActivationWizard.tsx` — apply `WizardStepIndicator` (Task 9 polish)
- `apps/web/src/features/auth/components/activation-wizard/steps/*.tsx` — apply `TrustBadgesRow` (Task 9 polish)
- TanStack Router config — register new routes `/register?step=N`, `/register/complete-nin`, `/register/complete`, `/auth/magic`

**Other:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status flips
- `_bmad-output/planning-artifacts/epics.md` — FRC item #3 status flip on completion (Task 11.4)
- MEMORY.md (optional) — note new wizard pattern + magic-link convention if useful for future stories

**Out of scope (explicitly NOT modified):**
- SMS OTP toggle UI surface — lives in `prep-settings-landing` Settings Landing Page; this story is the BACKEND consumer of the flag, not the UI owner
- General settings infrastructure (`apps/api/src/lib/settings.ts`, `system_settings` table) — provided by `prep-settings-landing` HARD dependency
- Existing FraudThresholds page consolidation under Settings — out of scope per `prep-settings-landing` v1 Out-of-Scope clause
- URL convention cleanup (`/settings/` vs `/security/` vs no-segment) — future "prep-url-convention-cleanup" story

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-25 | Story drafted by impostor-SM agent per SCP-2026-04-22 §A.5. Status `ready-for-dev`. 14 ACs covering 5-step wizard + magic-link primary + SMS OTP infra-only + pending-NIN status path + NinHelpHint + email-typo detection + trust badges + return-to-complete + reminder cadence + migration cutover + bundled staff-wizard polish + tests + FRC flip. Depends on Story 11-1 schema. | A.5 sequencing: 9-12 follows 11-1 in dependency order. FRC item #3 — field-survey-blocking. |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 5 subsections — Magic-link token storage discipline / Pending-NIN reminder cadence rationale / Server-side draft vs IndexedDB / Why Google OAuth retirement / SMS OTP feature flag relationship to prep-settings-landing / Email service template handling), "Risks" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering new feature dir + wizard layout + existing auth pages inventory + staff activation wizard existing path + service-layer pattern + workers convention + drizzle barrel + settings dependency + audit logging + rate-limit clone pattern + JWT issuance reuse + frontend HTTP client + TanStack Query convention + CSP discipline + email service flat-file pattern + existing routes file; added `### References` subsection with 24 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log`; added `### Review Follow-ups (AI)` placeholder; added Task 12 (code review) per `feedback_review_before_commit.md`. **Five factual path corrections applied throughout:** (1) `apps/web/src/features/auth/pages/PublicRegisterPage.tsx` → `RegistrationPage.tsx` (verified actual filename); (2) `apps/web/src/features/auth/pages/PublicLoginPage.tsx` → `LoginPage.tsx` (verified actual filename); (3) `apps/web/src/features/staff-activation/` (fictional dir) → `apps/web/src/features/auth/components/activation-wizard/` (verified existing path; AC#12 retro-fits the existing wizard at this canonical location); (4) `apps/api/src/lib/settings.ts` referenced as if existing → relocated as HARD dependency on companion story `prep-settings-landing-and-feature-flags` which creates this lib (per Awwal Path B decision 2026-04-30 — Settings infrastructure is a separate prep task, not folded into 9-12); (5) `apps/api/src/services/email/templates/` referenced as existing dir → email service is currently flat file; Task 1.8 explicitly defers template-pattern decision to dev-time inspection (refactor only if needed; separate prep task if so). **AC#7 reframed to consume prep-settings-landing:** SMS OTP feature flag mechanism (system_settings DB table + `getSetting` accessor) lives in prep-settings-landing-and-feature-flags; super-admin toggle UI lives in Settings Landing Page; this story is the BACKEND consumer of the flag (route + provider adapter + service + audit on attempts), not the UI owner. **Four new audit actions documented** for `AUDIT_ACTIONS` const extension: `MAGIC_LINK_ISSUED`, `MAGIC_LINK_REDEEMED`, `PENDING_NIN_DEFERRED`, `PENDING_NIN_TRANSITIONED`. All 14 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer / 10-5 / 9-11 / 11-2 / 11-4. This story is the LARGEST in the retrofit batch (14 ACs, 12 Tasks, 5 path corrections, 1 dependency-relocation per Awwal Path B). The new prep-settings-landing dependency was created during this same retrofit cascade as the cleanest resolution to Q2 (settings storage for `auth.sms_otp_enabled` feature flag) — avoiding the technical-debt path of a one-off settings hack scoped to 9-12. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 12.)_
