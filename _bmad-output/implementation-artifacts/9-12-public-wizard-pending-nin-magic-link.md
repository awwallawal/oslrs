# Story 9.12: Public Wizard + Pending-NIN + NinHelpHint + Magic-Link Email

Status: in-progress

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

- [~] **Task 1 — Backend: magic-link service + endpoints + reminder worker** (AC: #6, #9, #10) — **PARTIAL 2026-05-10 (1.1-1.7 + 1.10 done; 1.8 done inline in service; 1.9 reminder worker + 1.11 cross-cutting tests deferred to next session)**
  - [x] 1.1 Created `apps/api/src/db/schema/magic-link-tokens.ts` — 9-field Drizzle schema with 3 indexes; inline `magicLinkPurposes` enum constant per drizzle-no-types-import rule.
  - [x] 1.2 Created `apps/api/src/db/schema/wizard-drafts.ts` — email-keyed server-side draft with `WizardDraftData` JSONB shape + 30-day-expiry cleanup index.
  - [x] 1.3 Migration `CREATE TABLE magic_link_tokens` + `CREATE TABLE wizard_drafts` with all expected indexes + CHECK constraints (purpose enum + step range).
  - [x] 1.4 Migration filename claimed: `apps/api/drizzle/0012_add_magic_links_and_wizard_drafts.sql` — next sequential after 0011 (system_settings).
  - [x] 1.5 Created `apps/api/src/services/magic-link.service.ts` — `issueToken` + `redeemToken` (atomic UPDATE...RETURNING for race-safe single-use) + `revokeToken` (idempotent) + `buildMagicLinkUrl` + `sendMagicLinkEmail` with per-purpose copy. Plaintext sent in email exactly once, never persisted. SHA-256 hash storage. Per-purpose TTL: 72h/72h/15min.
  - [x] 1.6 Created `apps/api/src/middleware/magic-link-rate-limit.ts` — clones `login-rate-limit.ts` pattern. **Per-email keying** (3/hour) with IP fallback. Wired into route `POST /api/v1/auth/public/magic-link`.
  - [x] 1.7 Created `apps/api/src/controllers/magic-link.controller.ts` with two methods: `requestMagicLink` (POST /public/magic-link — anti-enumeration always returns 200) + `redeemMagicLink` (GET /auth/magic — atomic redeem returns JSON; redirect deferred to frontend Task 4-7). **JWT issuance for full magic-link login flow deferred** to a future task — Task 1's scope captures the redemption mechanism; JWT cookie issuance lands when frontend drives it.
  - [x] 1.8 **Email template handling decision: inline strings**. Verified existing `EmailService` pattern (flat file, private static `getXxxHtml/getXxxText` methods). Magic-link templates rendered inline in `MagicLinkService.sendMagicLinkEmail()` calling `EmailService.sendGenericEmail({to, subject, html, text})`. No subdirectory refactor needed. Per-purpose copy (subject + intro + CTA + footer) varies by `wizard_resume` / `pending_nin_complete` / `login`.
  - [ ] 1.9 BullMQ reminder worker — **deferred to next session** with Task 3 (pending-NIN backend). Reminder cadence (T+2d/7d/14d/30d) couples to the pending-NIN status promotion logic, so worker + Task 3 land together for cohesive testing.
  - [x] 1.10 Added 4 audit actions to `AUDIT_ACTIONS` const at `audit.service.ts:78-82`: `MAGIC_LINK_ISSUED` + `MAGIC_LINK_REDEEMED` + `PENDING_NIN_DEFERRED` + `PENDING_NIN_TRANSITIONED`. Both magic-link controllers fire the corresponding actions; `PENDING_NIN_*` actions defined for Task 3 consumption.
  - [~] 1.11 Tests: `magic-link.service.test.ts` shipped (17 tests covering issue + redeem + revoke + URL build + per-purpose TTLs + atomic single-use + expiry + serialization). `auth-magic.routes.test.ts` deferred to next session (route-level supertest layer requires app fixture setup matching existing `auth.routes.test.ts` shape). `reminder.worker.test.ts` deferred with the worker itself (1.9).

- [ ] **Task 2 — Backend: SMS OTP infrastructure-only** (AC: #7)
  - [ ] 2.1 Create `apps/api/src/services/auth/sms-provider.adapter.ts` (NEW subdirectory under `services/`; mirrors `parsers/` precedent if needed) — interface + `NoopSmsProvider` impl that logs + rejects
  - [ ] 2.2 Create `apps/api/src/services/auth/sms-otp.service.ts` — issue/verify endpoints; uses adapter resolver
  - [ ] 2.3 **Feature flag mechanism** — read from `system_settings` table via `getSetting<boolean>('auth.sms_otp_enabled')` from `apps/api/src/lib/settings.ts` (created by `prep-settings-landing-and-feature-flags` — HARD dependency). Do NOT create an alternative settings mechanism in this story.
  - [ ] 2.4 Routes `POST /api/v1/auth/public/sms-otp/request` + `/verify` — return `503 SMS_OTP_DISABLED` when flag is OFF (default state); proceeds when flag is ON
  - [ ] 2.5 Audit-logging on flag flip is handled by `prep-settings-landing` `SETTINGS_FLIPPED` event — this story doesn't duplicate that
  - [ ] 2.6 Tests: confirm enabling the flag does not break any existing flow (regression suite); verify `503 SMS_OTP_DISABLED` shape when disabled

- [ ] **Task 3 — Backend: pending-NIN status path (universal — all sources)** (AC: #4, #9, #10) — **EXPANDED 2026-05-10 per Universal Pending-NIN Option 1; see Dev Notes**
  - [ ] 3.1 Wire wizard Step 5 submit → `SubmissionProcessingService.findOrCreateRespondent` (`apps/api/src/services/submission-processing.service.ts:310`) with conditional NIN-presence branching. **Remove the NIN-required throw at line 359**; route to `findOrCreateRespondent` with `nin: undefined` when missing (regardless of source).
  - [ ] 3.2 Endpoint `POST /api/v1/registration/complete-nin` — validates magic-link session, accepts NIN, runs FR21 dedupe, promotes `status` to `active` on success. Fires `PENDING_NIN_PROMOTED` audit event.
  - [ ] 3.3 Endpoint `POST /api/v1/registration/defer-reminder` — resets reminder timer; audit-logged with `PENDING_NIN_DEFERRED` action.
  - [ ] 3.4 Tests: status promotion, FR21-at-promotion, defer-reminder timer reset.
  - [ ] 3.5 **Race-resolution merge** (D1 in Universal Pending-NIN Dev Notes): in `findOrCreateRespondent`, when `nin` is provided, BEFORE insert run fuzzy-match SQL against pending rows (lower(first_name) + lower(last_name) + normalized phone_number). On match → atomic UPDATE pending row to `nin = $`, `status = 'active'`; fire `PENDING_NIN_PROMOTED`. On miss → standard insert. Edge cases: no phone → no merge; name typo → no merge (acceptable; supervisor reconciles via Story 9-11).
  - [ ] 3.6 **`resolveReminderDestination` pure function** (D2 in Dev Notes): `apps/api/src/workers/reminder.worker.ts` (NEW per Task 1.9) imports from a new `apps/api/src/services/pending-nin.service.ts` helper. 5-branch precedence per source (public → email; enumerator → email | sms-when-flag-on | supervisor; clerk → email | supervisor; imported_* → no reminder). Tested in isolation per source + missing-fields shape.
  - [ ] 3.7 **Anti-abuse data surface** (D6 in Dev Notes): aggregate query exposed via existing supervisor dashboard infrastructure. Query shape: per-enumerator, last 7 days, `total_submissions`, `pending_nin_submissions`, `pending_nin_unresolved_at_7d`, `defer_reason_provided_count`. Build the query + supervisor-dashboard widget. **UI soft-warning affordance deferred** to post-field-survey (D6 explicit defer).
  - [ ] 3.8 **Audit actions** (D4 in Dev Notes): append `PENDING_NIN_CREATED` + `PENDING_NIN_PROMOTED` to `AUDIT_ACTIONS` const at `audit.service.ts`. Bump `audit.service.test.ts:165` sentinel from `.toHaveLength(38)` to `.toHaveLength(40)` with heritage-comment line. **Critical**: this same sentinel pattern broke CI on commit `adb956b` → fixed in `d648b6d` — apply preemptively this time.
  - [ ] 3.9 Tests for the new behaviour: race-resolution merge happy path + name-typo-no-merge + no-phone-no-merge + concurrent-merge-attempts (race-safe via UPDATE...WHERE...usedAt IS NULL idiom equivalent on status); reminder-destination per-source assertions; aggregate-query shape verification.

- [ ] **Task 4 — Frontend: WizardLayout + WizardStepIndicator** (AC: #1, #2)
  - [ ] 4.1 New layout `apps/web/src/layouts/WizardLayout.tsx` — sticky step indicator + content slot + sticky trust badges footer
  - [ ] 4.2 New component `apps/web/src/features/registration/components/WizardStepIndicator.tsx` (NEW feature directory `apps/web/src/features/registration/`) — desktop/tablet variant (clickable circles) + mobile collapse variant (text-only)
  - [ ] 4.3 URL routing: `/register?step=N` with TanStack Router
  - [ ] 4.4 Auto-save server-side draft on every field change (debounced 2s) + IndexedDB local cache for offline-tolerance
  - [ ] 4.5 Tests: navigation between steps, draft hydration, mobile collapse breakpoint
  - [ ] 4.6 **Form-schema NIN introspection on Step 4 mount** (per Dev Notes "Step 5 NIN handling — state-aware dispatcher"): after the form schema lands from the discovery endpoint, iterate `formSchema.sections[].questions[]` and set `formData.formHasNinQuestion = sections.some(s => s.questions.some(q => NIN_QUESTION_NAMES.includes(q.name)))`. Reuse `NIN_QUESTION_NAMES` constant from `apps/web/src/features/forms/pages/FormFillerPage.tsx:21` — export it from a shared module if needed; do NOT redefine.

- [ ] **Task 5 — Frontend: 5 wizard steps** (AC: #1)
  - [ ] 5.1 `apps/web/src/features/registration/pages/Step1BasicInfo.tsx` — full name + DOB + gender form
  - [ ] 5.2 `apps/web/src/features/registration/pages/Step2ContactLga.tsx` — phone + email (with email-typo per AC#5) + LGA autocomplete
  - [ ] 5.3 `apps/web/src/features/registration/pages/Step3Consent.tsx` — Stage 1 + Stage 2 consent radios with progressive disclosure
  - [ ] 5.4 `apps/web/src/features/registration/pages/Step4Questionnaire.tsx` — mounts the existing native form renderer for the public-survey form within wizard chrome. **See Dev Notes "Step 4 Questionnaire Injection — design clarification (2026-05-10)" for the expanded 9-subtask checklist (5.4.0 design decision → 5.4.8 tests).** Source-type filter does NOT exist on the questionnaire schema today; Awwal picks discovery mechanism (Option A schema-extension / B system_settings / C convention). Default if unspecified = Option B.
  - [ ] 5.5 `apps/web/src/features/registration/pages/Step5NinAndAuth.tsx` — **state-aware dispatcher** rendering State A (NIN captured in Step 4 questionnaire) / State B (pending NIN via inline toggle) / State C (form had no NIN question — original spec). **See Dev Notes "Step 5 NIN handling — state-aware dispatcher (2026-05-10)" for the expanded 4-subtask checklist (5.5.0 dispatcher → 5.5.4 tests) + State A/B/C sub-views (`Step5NinCaptured.tsx` / `Step5PendingNin.tsx` / `Step5NinInput.tsx`).**

- [ ] **Task 6 — Frontend: shared form pattern components** (AC: #3, #4, #5, #8)
  - [ ] 6.1 `apps/web/src/features/registration/components/NinHelpHint.tsx` (3 variants: inline, tooltip, banner) — see Sally's Custom Component #12 spec. **Inline variant `onPendingNinClick` callback** (per Dev Notes "Step 5 NIN handling — state-aware dispatcher"): when fired during Step 4's NIN question, dispatches into wizard parent → sets `formData.pendingNinToggle = true` + `formData.questionnaireResponses.nin = null` + advances to next question via skip-logic engine. Triggers Step 5 State B downstream.
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

- [ ] **Task 13 — Frontend: enumerator + clerk pending-NIN toggle** (NEW 2026-05-10 per Universal Pending-NIN Option 1; AC: D5 in Dev Notes)
  - [ ] 13.1 `apps/web/src/features/forms/pages/FormFillerPage.tsx` — wire NinHelpHint inline variant on the NIN question. When user clicks "I don't have my NIN now" link: prompt for optional `_deferReasonNin` free-text input + Confirm button. On confirm: stamp `submission.rawData._pendingNin = true`, `submission.rawData._deferReasonNin = <value>`, advance via skip-logic engine. Reuses existing `NIN_QUESTION_NAMES` constant (line 21).
  - [ ] 13.2 `apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx` — same toggle pattern, clerk-specific UI placement (paper-form data-entry layout). Same `_pendingNin` + `_deferReasonNin` rawData shape.
  - [ ] 13.3 Submission contract: backend `submission-processing.service.ts:359` reads `_pendingNin` flag; if true → route to `findOrCreateRespondent` with `nin: undefined` (skip the NIN-required throw which is removed in Task 3.1). `_deferReasonNin` flows through to `PENDING_NIN_CREATED` audit event details.
  - [ ] 13.4 Tests: enumerator toggle component test + clerk toggle component test + integration test verifying `_pendingNin` payload reaches `findOrCreateRespondent` correctly across both surfaces.

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

### Step 4 Questionnaire Injection — design clarification (added 2026-05-10)

**Spec gap discovered during Task 1 dev session**: AC#1 Step 4 says the wizard "renders the published `respondentSourceTypes='public'` form via the existing one-question-per-screen native renderer." Verified 2026-05-10 against the actual codebase — **no source-type / target-audience filter currently exists** on the questionnaire schema:

- `apps/api/src/db/schema/questionnaires.ts` — `questionnaire_forms` table has `formId`, `version`, `status`, `formSchema` (JSONB), `isNative`, `nativePublishedAt`. **No `respondent_source_types` column.**
- `packages/types/src/native-form.ts:88` — `NativeFormSchema` has `id`, `title`, `version`, `status`, `sections`, `choiceLists`. **No `targetRoles` / `audience` field.**
- `apps/api/src/routes/form.routes.ts:24` — `GET /forms/published` returns `NativeFormService.listPublished()`. **No role/source filter applied.**
- `apps/api/src/routes/form.routes.ts:27` — `GET /forms/:id/render` returns flattened form for the renderer.

So Task 5.4's "mounts the existing native form renderer for the public-survey form" needs a **discovery mechanism** that doesn't yet exist. Three options — Awwal decides at impl time.

**Option A — Schema extension (canonical, biggest blast radius)**: add `respondent_source_types TEXT[]` column to `questionnaire_forms` via a new migration. Default `['enumerator']` (backward-compat: existing forms preserve behavior). Update Native Form Builder UI to expose an "Available to:" checkbox group. Wizard fetches via new endpoint `GET /forms/public-active` filtered by `'public' = ANY(respondent_source_types)`. Cleanest long-term + symmetric with `respondents.source` already enumerated. Cost: 1 migration + 1 service change + 1 builder-UI change + 1 endpoint.

**Option B — `system_settings` row (lightweight, recommended)**: add a `wizard.public_form_id` setting via `prep-settings-landing-and-feature-flags` infrastructure. Super Admin manually pins which form is the active public-facing one (selectable from `/forms/published` list). Wizard reads `getSetting<string>('wizard.public_form_id')` then `GET /forms/:id/render`. No schema change; uses existing settings table. Cost: 1 setting key + 1 settings-UI dropdown + 1 wizard read. Trade-off: Super Admin must remember to update the setting when publishing a new version (mitigated by a "set as public form" CTA on the publish action).

**Option C — Convention-based (simplest, most brittle)**: wizard hits `GET /forms/published`, picks the most-recently-published form (or one matching a special `formId` prefix like `public_*`). No infrastructure change. Cost: zero. Risk: silently wrong form if Super Admin publishes an enumerator form last.

**Recommendation: Option B.** Reasons: (1) consistent with the AC#7 SMS OTP toggle pattern (also lives in system_settings), (2) Super Admin already has the Settings landing UI from prep-settings-landing, (3) zero schema migration, (4) 1-day implementation vs Option A's 3-4 days, (5) the "binding decision lives in operator-controlled config not in code" pattern is correct for this kind of workflow gating.

**Task 5.4 expanded sub-checklist** (replaces the original single-line task spec):
- [ ] 5.4.0 **Discovery design decision** — Awwal picks A / B / C above. Default if unspecified: B.
- [ ] 5.4.1 (if Option B) Add `wizard.public_form_id` row to `system_settings` seed via the prep-settings-landing migration extension OR a new follow-up migration. Default value: `null` (wizard renders empty-state until Super Admin sets it).
- [ ] 5.4.2 (if Option B) Backend: new endpoint `GET /api/v1/forms/public-active` — reads the setting, returns the corresponding form's flattened render schema, OR returns `404 PUBLIC_FORM_NOT_CONFIGURED` if setting is null/missing.
- [ ] 5.4.3 **Decompose `<FormRenderer>`** from `apps/web/src/features/forms/pages/FormFillerPage.tsx`. Currently the page wraps `useFormSchema + currentIndex state + skipLogic + useDraftPersistence + QuestionRenderer + ProgressBar`. Extract into a reusable `<FormRenderer formSchema={...} initialResponses={...} onAnswer={...} onComplete={...}>` component. FormFillerPage becomes a thin route-mount wrapper around it.
- [ ] 5.4.4 Frontend: `Step4Questionnaire.tsx` mounts `<FormRenderer>` with the form schema fetched from `/forms/public-active`. Wires `onAnswer` to push into `wizard_drafts.formData.questionnaireResponses[questionId]`. Wires `onComplete` to advance the outer wizard to Step 5.
- [ ] 5.4.5 **Form-version locking**: extend `WizardDraftData` (already shipped in commit `adb956b`) to include `questionnaireFormId?: string` + `questionnaireFormVersionId?: string`. On first answer in Step 4, lock the draft to the active form's version. On magic-link return after a Super Admin republishes, hydrate against the LOCKED version (read from `questionnaire_forms` even if status has flipped from `published` to `deprecated`). New stale-draft cleanup if locked version is `archived`.
- [ ] 5.4.6 **Edge case — no public form configured**: empty-state on Step 4 ("Survey not yet available — your registration will save without questionnaire responses"); skip Step 4 in the navigation. Track via metric (count of Step-4-skipped registrations) so operations knows when to publish.
- [ ] 5.4.7 **UX — two progress indicators**: outer `WizardStepIndicator` ("Step 4 of 5: Questionnaire") stays sticky per AC#2. Inner `<ProgressBar>` from FormFillerPage shows ("Question 7 of 23 (Skills)"). Hierarchically labeled, not merged. Verified <480px collapse: outer collapses to text-only per AC#2; inner ProgressBar adapts to the same breakpoint.
- [ ] 5.4.8 Tests: unit test of `<FormRenderer>` (decomposed component) + integration test of wizard Step 4 hydration against a published form fixture + edge-case test for "no public form configured" empty state.

**What needs building vs reusing** (revised after 2026-05-10 codebase verification):

| Component | Status | Note |
|---|---|---|
| `questionnaire_forms` table (versioned forms with status lifecycle) | ✅ exists (Story 2.10) | NO source-type column today |
| Native form renderer (`QuestionRenderer`, skipLogic, draft persistence) | ✅ exists (Story 3.1) | Lives in `FormFillerPage.tsx`; needs decomposition |
| `<FormRenderer>` reusable component | ⏳ **decompose from FormFillerPage** (Task 5.4.3) | New; ~50-line refactor |
| `GET /api/v1/forms/published` (lists all published) | ✅ exists | No source-type filter |
| `GET /api/v1/forms/:id/render` (flattened renderer schema) | ✅ exists | Reused by wizard |
| **Discovery mechanism for "the public form"** | ⏳ NEW (Task 5.4.0-5.4.2) | Awwal picks A/B/C; default = Option B (system_settings row) |
| `wizard_drafts.formData.questionnaireResponses` shape | ✅ shipped (commit `adb956b`) | `WizardDraftData.questionnaireResponses` |
| `wizard_drafts.formData.questionnaireFormId` + `…FormVersionId` (version-lock) | ⏳ extension (Task 5.4.5) | TypeScript-only addition to `WizardDraftData` shape; no migration |
| `Step4Questionnaire.tsx` page | ⏳ Task 5.4.4 | Wraps `<FormRenderer>` + wizard chrome |
| Native Form Builder "available to: public" checkbox | ⏳ ONLY if Option A chosen | Bigger scope |

**TL;DR**: the wizard does NOT reinvent the questionnaire engine — it MOUNTS the existing one. The architectural elegance is real, but the **discovery mechanism** ("which form is THE public form?") needs a small new infrastructure piece (Task 5.4.1-5.4.2). Recommend Option B; defer A unless multi-form-per-channel comes up post-Transfer.

### Step 5 NIN handling — state-aware dispatcher (added 2026-05-10)

**Spec gap discovered during Task 1 dev session, second clarification round**: AC#1 Step 5 says "NIN input with `NinHelpHint` inline + pending-NIN toggle (per AC#4)" and AC#4 places the toggle "under the NIN input on Step 5." Both implicitly assume NIN is NOT in the questionnaire. **It is.** Verified 2026-05-10 against the codebase:

- `apps/web/src/features/forms/pages/FormFillerPage.tsx:21` — `const NIN_QUESTION_NAMES = ['nin', 'national_id']`. The renderer special-cases NIN.
- `apps/web/src/features/forms/pages/FormFillerPage.tsx:111` — `const isCurrentNin = currentQuestion ? NIN_QUESTION_NAMES.includes(currentQuestion.name) : false`. NIN-question mode triggers different UI (real-time duplicate check).
- `apps/web/src/features/forms/hooks/useNinCheck.ts` — debounced modulus-11 + duplicate-check via `/api/v1/forms/check-nin` while the user types.
- `apps/api/src/services/submission-processing.service.ts:359` — extracts NIN from `rawData['nin']`. Story 11-1 made the downstream `findOrCreateRespondent` accept `nin?: string` (optional → pending_nin_capture row).
- The active form (`oslsr_master_v3.xlsx` per Awwal 2026-05-10) HAS a NIN question; future forms may or may not.

**Without resolution**: Step 4 collects NIN inside the questionnaire AND Step 5 collects NIN again — duplicate input, conflicting state, confused UX.

**Resolution: Step 5 becomes a state-aware dispatcher, not a fixed UI.** It reads what happened upstream (Step 4 + form-schema introspection) and renders one of three states:

| State | Trigger condition | Step 5 UI | On submit |
|---|---|---|---|
| **A — NIN captured** | `formData.questionnaireResponses.nin` is present AND modulus-11 valid AND duplicate check passed | "✓ NIN captured: 1234***8901" confirmation card + auth choices (magic-link / password / skip). **No NIN input rendered.** | `respondent.status = 'active'`. FR21 dedup runs at submission-processing layer (already in place). |
| **B — Pending NIN** | User clicked the inline "I don't have my NIN now" link in Step 4 (set `formData.pendingNinToggle = true` + cleared `formData.questionnaireResponses.nin`) | The Info-50 consequence-preview card from AC#4 ("Saved as pending; we'll email reminders at T+2/7/14d…") + auth choices. **No NIN input rendered.** Submit-button label = "Save as Pending". | `respondent.status = 'pending_nin_capture'` + `pending_nin_complete` magic link sent. AC#10 reminder cadence kicks in. |
| **C — Form has no NIN question** | `formData.formHasNinQuestion = false` (form-schema introspection at Step 4 mount found no question matching `NIN_QUESTION_NAMES`) | **Falls back to original AC#1 Step 5 + AC#4 spec verbatim**: NIN input + NinHelpHint inline + `<button role="switch">` pending-NIN toggle + auth choices. Wizard becomes sole NIN owner. | If NIN entered → `status='active'`; if toggle ON → `status='pending_nin_capture'` + magic link. Same as A/B downstream behaviour. |

**Why state-aware**: per Awwal 2026-05-10 — "We can still change the questionnaire to another form and it would be rendered." The wizard must be ROBUST to form changes. State-aware Step 5 means publishing a NIN-less form makes the wizard automatically own NIN (State C) without code changes; publishing a NIN-carrying form lets the questionnaire own it (States A/B).

**How the wizard knows which state it's in** — Step 4 mount-time introspection:
1. After fetching the active form schema (per Step 4 Questionnaire Injection design clarification, Option B), iterate `formSchema.sections[].questions[]`.
2. Set `formData.formHasNinQuestion = formSchema.sections.some(s => s.questions.some(q => NIN_QUESTION_NAMES.includes(q.name)))`.
3. Persist into `wizard_drafts` via the existing 2s-debounced auto-save.

**How the inline pending-NIN toggle wires to State B** — extends AC#3's inline NinHelpHint variant:
1. AC#3 already specifies the inline variant has "I don't have my NIN now" link that "triggers the pending-NIN toggle in the parent wizard."
2. When user clicks the link AT the NIN question in Step 4:
   - Wizard sets `formData.pendingNinToggle = true`
   - Wizard sets `formData.questionnaireResponses.nin = null`
   - Skip-logic engine advances past the question (same way as a programmatic skip)
   - Existing `useNinCheck` hook resets via its `reset()` method
3. User continues through remaining Step 4 questions; reaches Step 5 in State B.

**Implication for AC#4** (toggle location is now dynamic, not fixed under Step 5's NIN input):
- States A/B → toggle does not appear in Step 5 (already triggered upstream OR unnecessary).
- State C → toggle appears in Step 5 per original AC#4 spec.
- The toggle BEHAVIOUR is unchanged; only its LOCATION is now state-dependent.
- This is technically a spec amendment to AC#4. **Not modifying AC#4 text directly** per dev-story workflow's permitted-edit rule (AC modification needs SM workflow). Dev Agent implements per this Dev Notes section; future SM session can canonicalise.

**Implication for `WizardDraftData` shape** (extends what was shipped in commit `adb956b`):

```ts
export interface WizardDraftData {
  // ... existing fields shipped in adb956b ...

  // Step 5 NIN handling — state-aware dispatcher (added 2026-05-10)
  formHasNinQuestion?: boolean;            // set at Step 4 mount via schema introspection
  questionnaireFormId?: string;            // for version-locking (Step 4 design clarification)
  questionnaireFormVersionId?: string;     // for version-locking
  // The existing `nin?: string` field is now POPULATED for State C only.
  // For States A/B, NIN comes from questionnaireResponses.nin or is null.
  // For State A: derive on submit via formData.questionnaireResponses.nin
  // For State B: stays null/undefined; status drives the pending flow
}
```

These are TypeScript-only additions to the type; no DB migration needed — `form_data` is JSONB.

**Task 5.5 Step5NinAndAuth.tsx amendment** (extends the existing one-line task spec):
- [ ] 5.5.0 **Dispatcher logic at component top**: read `formData.formHasNinQuestion`, `formData.questionnaireResponses.nin`, `formData.pendingNinToggle`. Compute current state ∈ {A, B, C}. Render the corresponding sub-component.
- [ ] 5.5.1 **State A sub-view** (`Step5NinCaptured.tsx`): "✓ NIN captured: 1234***8901" confirmation card (last 4 digits visible, rest masked per Story 5-3 PII display pattern) + auth choices (magic-link primary CTA / password / skip).
- [ ] 5.5.2 **State B sub-view** (`Step5PendingNin.tsx`): Info-50 consequence-preview card per AC#4 + auth choices. Submit-button label = "Save as Pending".
- [ ] 5.5.3 **State C sub-view** (`Step5NinInput.tsx`): the original AC#1 Step 5 + AC#4 spec — NIN input + NinHelpHint inline + pending-NIN toggle + auth choices. **Reuses State A/B sub-views** at submit time (after NIN entered → State A view; after toggle on → State B view).
- [ ] 5.5.4 **Tests**: dispatcher state-derivation tests (verify each state triggers correct sub-view) + per-sub-view component tests.

**Task 4 amendment** (Wizard layout):
- [ ] 4.6 **Form-schema introspection on Step 4 mount** — when the form schema lands from the discovery endpoint, iterate questions to compute `formHasNinQuestion`. Push into `formData` via auto-save. Reuse the `NIN_QUESTION_NAMES` constant from `apps/web/src/features/forms/pages/FormFillerPage.tsx:21` (export it from a shared module if needed; do NOT redefine).

**Task 6 amendment** (NinHelpHint inline):
- [ ] 6.1.x Wire the "I don't have my NIN now" link in the inline variant to dispatch into wizard parent: `onPendingNinClick={() => setWizardFormData({ pendingNinToggle: true, questionnaireResponses: { ...prev, nin: null } })}` then advance to next question.

### Universal pending-NIN — Option 1 design (added 2026-05-10)

**Scope expansion ratified by Awwal 2026-05-10**: pending-NIN extends from public-only to all submission sources (enumerator + clerk + public). Schema (Story 11-1) already supports it; the backend pipeline + frontend surfaces need extension. Story 9-12 grows from 5-7 dev-days to ~7-9 dev-days. Ships in current sprint window (< 2 weeks to field-survey) per Awwal's "do it once and for all, no technical debt" directive — instead of post-field-survey via a follow-up story.

**The reframe**: pending-NIN is no longer a public-wizard feature; it's a system-wide capability of the registry. Step 5 dispatcher (Dev Notes "Step 5 NIN handling") is one of three frontend surfaces; enumerator FormFillerPage and ClerkDataEntryPage are the other two.

**Six design decisions locked**:

#### D1 — Race-resolution merge

**Problem**: Enumerator A submits `Adebayo, +234801..., LGA Egbeda` as pending-NIN at 09:00. Enumerator B encounters the same person at a different location at 14:00, gets the NIN, submits. FR21 partial UNIQUE on `nin WHERE NOT NULL` doesn't catch this — we'd end up with two rows for the same person (one pending without NIN, one active with NIN).

**Fix**: in `findOrCreateRespondent`, when `nin` is provided, BEFORE insert run a fuzzy-match against existing pending rows:

```sql
SELECT id FROM respondents
WHERE status = 'pending_nin_capture'
  AND nin IS NULL
  AND lower(first_name) = lower($1)
  AND lower(last_name) = lower($2)
  AND phone_number = $3  -- assumes prep-input-sanitisation E.164-normalised value
LIMIT 1
```

If hit → atomic UPDATE the pending row (set `nin = $4`, `status = 'active'`, log `PENDING_NIN_PROMOTED` audit event referencing the merged respondent_id). If miss → standard insert path.

**Idempotency**: the partial UNIQUE on NIN (Story 11-1) catches subsequent duplicates downstream of the merge; race-safe under concurrent merge attempts (UPDATE ... WHERE nin IS NULL excludes already-promoted rows).

**Edge case — phone normalisation**: relies on prep-input-sanitisation-layer's E.164 normaliser (already shipped, FRC #4 done). Both rows must have phone normalised to the same canonical form. If either lacks phone → fall through to standard insert (no merge).

**Edge case — name typos**: strict equality on lowercased name. If respondent gave Enumerator A "Adebayo Adejumo" and Enumerator B "Adebayo Adejumo Bola" — no match; two rows created. Acceptable: better to leak a duplicate than to merge wrong people. Supervisor review queue can manually reconcile via Story 9-11 audit-log viewer.

**Implementation surface**: ~30 lines in `apps/api/src/services/submission-processing.service.ts`. New audit event `PENDING_NIN_PROMOTED` (D4 below).

#### D2 — Reminder destination precedence

**`AC#10`** worker fires at T+2/7/14d for every pending-NIN respondent. Where does the email go?

| `respondent.source` | Primary | Fallback 1 | Fallback 2 | If none |
|---|---|---|---|---|
| `public` | `respondent.email` (collected in wizard Step 2; always present) | — | — | (always present) |
| `enumerator` | `respondent.email` (if collected) | SMS to `respondent.phoneNumber` (only if AC#7 SMS-OTP flag ON) | Supervisor of `respondent.lgaId` (via `team_assignments` lookup) | Skip; enqueue `T+7d` supervisor task |
| `clerk` | `respondent.email` (rare; paper forms typically lack) | Supervisor of `respondent.lgaId` | — | Skip; enqueue `T+7d` supervisor task |
| `imported_itf_supa` / `imported_other` | (no reminder — historical imports) | — | — | — |

**Implementation**: pure function `resolveReminderDestination(respondent: Respondent): { type: 'email' | 'sms' | 'supervisor_task' | 'skip'; target: string | null }`. Tested in isolation; deterministic per source + collected-fields shape.

**SMS-OTP feature flag dependency**: SMS fallback for enumerator-source pending-NIN reminders depends on AC#7's `auth.sms_otp_enabled` flag (which today defaults `false`). When SMS flag is ON and enumerator-source pending has phone but no email, send via SMS. Until SMS flips ON, that branch falls through to supervisor.

**Implementation surface**: ~25 lines in `apps/api/src/workers/reminder.worker.ts` (Task 1.9 — already deferred to next session). Tests cover all 4 branches per source.

#### D3 — Pay-on-completion (productivity metric)

**Risk**: enumerators are paid per submission (Story 4-x productivity dashboards). Universal pending-NIN creates an abuse incentive — over-defer to inflate counts, never follow up.

**Fix**: pending submissions do NOT count toward enumerator productivity until status flips to `active`. Productivity dashboards (Story 4-x) query `respondents.status = 'active'` AND `submitter_id = <enumerator>`.

**Implementation**: zero new code at Story 4-x layer (the existing query already filters by status implicitly via the active-rows-only assumption — verify at impl time). What changes: pending-NIN respondents transition to active either via:
- Respondent clicks magic-link + completes via `/registration/complete-nin` endpoint (Task 3.2)
- Race-resolution merge (D1 above) — another submitter's NIN-bearing submission promotes the pending row

In both cases, `submitter_id` on the original pending row is preserved — the enumerator who first captured the person gets the productivity credit when it lands. **NOT the enumerator who completed the NIN** (that's secondary; primary credit goes to outreach, not data entry).

**Visibility**: add a "pending follow-up" column to enumerator productivity dashboard (separate from the productivity-credit number). Dev Note: this is a Story 4-x amendment; defer the dashboard column to a small follow-up task post-field-survey.

#### D4 — Audit actions: 38 → 40

Already added in commit `adb956b`: `MAGIC_LINK_ISSUED`, `MAGIC_LINK_REDEEMED`, `PENDING_NIN_DEFERRED`, `PENDING_NIN_TRANSITIONED`.

For Option 1 universal pending-NIN, add 2 more in Task 3:
- `PENDING_NIN_CREATED` — fired on every pending-NIN row creation regardless of source
- `PENDING_NIN_PROMOTED` — fired on race-resolution merge (D1) OR explicit complete-nin endpoint (Task 3.2)

**Implementation**: append to `AUDIT_ACTIONS` const at `audit.service.ts`. Bump the sentinel test in `audit.service.test.ts:165` from `.toHaveLength(38)` to `.toHaveLength(40)` with heritage comment line. **Same trip-wire that bit us in commit `d648b6d` — apply the lesson preemptively this time.**

#### D5 — Optional `_deferReasonNin` field

**Goal**: minimal friction at deferral time, retrospective analysis capability.

**Schema**: extend the submission `rawData` JSONB payload with optional `_deferReasonNin?: string` (max 500 chars). Lives on the original submission, audit-logged with `PENDING_NIN_CREATED`.

**UI surface**:
- **Public wizard** (Step 4 inline NIN-help-hint): no input — just the toggle. Auto-set reason = `'public_wizard_user_self_deferred'`. Reduces friction; the user already chose to defer, no need to ask why.
- **Enumerator FormFillerPage** + **ClerkDataEntryPage**: toggle reveals a free-text input "Reason for deferring (optional)". Examples: "respondent forgot NIN card", "NIN not yet issued", "respondent unsure of number". Submit allowed without filling.

**Why optional**: required reasons collect fake answers ("dunno"). Optional + audited gives signal without friction. Anti-abuse work (D6) uses the unfilled-rate as a flag.

#### D6 — Anti-abuse signal (build the data surface; defer UI)

**Goal**: prevent enumerator over-deferring without adding friction that hurts legitimate use.

**Data surface (build now in Task 3)**: aggregate query exposed via supervisor dashboard:
- Per enumerator, last 7 days: `total_submissions`, `pending_nin_submissions`, `pending_nin_unresolved_at_7d`, `defer_reason_provided_count`
- Sortable by `pending_unresolved_rate DESC`

**UI affordance (defer to post-field-survey)**: based on the data surface, add a "soft warning" UI later. For Story 9-12 scope, just expose the metric; UI evaluation post-field with real data.

**Cost-now**: ~30 lines (one query + one supervisor-dashboard widget); the data surface is genuinely useful even without the warning UI.

---

#### Implementation surface for Option 1 (vs public-only baseline)

| Component | Public-only (original) | Option 1 (universal) | Delta |
|---|---|---|---|
| `submission-processing.service.ts:359` NIN-required throw | unchanged (still required for enumerator/clerk) | **REMOVED**; route to `findOrCreateRespondent` with `nin: undefined` | +0.25 day |
| `findOrCreateRespondent` race-resolution merge (D1) | n/a | NEW: 30-line fuzzy-match-then-promote | +0.5 day |
| `resolveReminderDestination` (D2) | one branch (public) | 5-branch precedence + tests | +0.25 day |
| `reminder.worker.ts` (AC#10) | public-only | source-aware reminder + supervisor fallback | +0.5 day (was deferred to next session anyway) |
| Audit actions count + sentinel test | 38 (4 added) | **40** (`PENDING_NIN_CREATED` + `PENDING_NIN_PROMOTED`) | +0.1 day |
| Frontend: public wizard Step 5 dispatcher (per Step 5 Dev Notes) | in scope | unchanged | 0 |
| Frontend: enumerator `FormFillerPage.tsx` pending-NIN toggle | n/a | **NEW**: NinHelpHint inline on NIN question + skip-logic advance + `_deferReasonNin` input | +0.5 day |
| Frontend: clerk `ClerkDataEntryPage.tsx` pending-NIN toggle | n/a | **NEW**: same toggle pattern; clerk-specific `_deferReasonNin` input | +0.25 day |
| Anti-abuse data surface (D6) | n/a | NEW: aggregate query + supervisor widget | +0.5 day (UI later) |
| Race-condition + reminder-destination + merge tests | 0 | NEW: covers all 6 decisions | +0.5 day |
| **Total delta** | | | **≈ +2.0 dev-days** |

Pushes Story 9-12 from ~5-7 dev-days (public-only) to ~7-9 dev-days (universal). Field-survey window of <2 weeks accommodates this; AC#7 SMS-OTP infra-only feature flag pattern keeps SMS reminder destination dormant until manually flipped (no SMS cost incurred during field-survey).

---

#### Task amendments

- **Task 3 expanded** (backend pending-NIN status path) — add subtasks 3.5 (race-resolution merge in `findOrCreateRespondent`), 3.6 (`resolveReminderDestination` pure function + tests), 3.7 (anti-abuse data surface aggregate query), 3.8 (2 new audit actions + sentinel test bump).
- **Task 5.5 unchanged** (Step 5 dispatcher per the previous Dev Notes section — public-only flow already correct).
- **NEW Task 13** — Frontend: enumerator + clerk pending-NIN toggle wiring. 4 subtasks (FormFillerPage inline NIN toggle / ClerkDataEntryPage inline NIN toggle / `_deferReasonNin` input + audit / cross-cutting tests).

#### Backwards-compatibility implications

- Existing enumerator/clerk submissions with NIN: unchanged path. Same `findOrCreateRespondent` behaviour for the NIN-present case.
- Existing pending-NIN respondents from public wizard: unchanged. The race-resolution merge (D1) ALSO applies to them — if an enumerator later captures the same person with NIN, the public-wizard pending row is promoted (not duplicated).
- AC#11 migration (existing public_users keep working) — unaffected. This is purely additive on the submission side.
- FR21 NIN uniqueness — preserved via the existing partial UNIQUE on `nin WHERE NOT NULL`. The race-resolution merge keeps the partial UNIQUE intact (only one row will ever have a given NIN).

#### Field-readiness implication

FRC #3 is satisfied when public wizard ships (the original Story 9-12 scope). Universal pending-NIN does NOT block FRC #3 — it's a quality-of-life expansion that ships in the same window. Field-survey can launch on the public-only scope if Option 1 work overruns; the enumerator/clerk pending-NIN surfaces can land mid-field-survey via a follow-up commit if needed.

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
8. **Email service template handling unknown.** AC#6 + AC#10 + AC#9 all need email templates; current service is flat file with unknown template pattern. Mitigation: Task 1.8 explicitly defers to dev-time inspection; Dev Notes "Email service template handling" provides decision tree; refactor (if needed) is a separate prep task. **RESOLVED 2026-05-10**: existing pattern is inline strings via private static `getXxxHtml/getXxxText` methods; magic-link templates rendered inline in `MagicLinkService.sendMagicLinkEmail()` calling `EmailService.sendGenericEmail({to, subject, html, text})`. No subdirectory refactor needed.

9. **Step 4 questionnaire source-type filter does not exist in the schema.** Story v2 AC#1 references `respondentSourceTypes='public'` form but the actual `questionnaire_forms` table has NO source-type / role / target-audience column (verified 2026-05-10 against `apps/api/src/db/schema/questionnaires.ts` + `packages/types/src/native-form.ts:88` + `apps/api/src/routes/form.routes.ts:24-27`). The wizard needs a NEW discovery mechanism. **Mitigation**: Dev Notes "Step 4 Questionnaire Injection — design clarification (2026-05-10)" enumerates 3 options (A schema extension / B system_settings row / C convention-based), recommends Option B (consistent with prep-settings-landing pattern + 1-day implementation). Awwal final-call at Task 5.4.0; default = Option B if unspecified.

11. **Universal pending-NIN expands Story 9-12 scope by ~2 dev-days.** Awwal directive 2026-05-10 — extend pending-NIN from public-only to enumerator + clerk surfaces ("do it once and for all, no technical debt"). Full design + 6 locked decisions captured in Dev Notes "Universal pending-NIN — Option 1 design (2026-05-10)". Story grows from 5-7 to 7-9 dev-days; field-survey window of <2 weeks accommodates. **Mitigation**: FRC #3 (public wizard) is satisfied independent of universal-pending-NIN — the public-only scope alone closes FRC. If Option 1 work overruns, enumerator/clerk toggles can land mid-field-survey via follow-up commit without blocking field launch. Race-resolution merge logic + reminder-destination resolver + audit actions extension all build on existing infrastructure (Story 11-1 schema + prep-input-sanitisation E.164 phone normaliser + Story 6-1 audit chain). New Task 13 covers frontend surfaces; Task 3 expanded with 5 new subtasks.

10. **NIN appears in BOTH the questionnaire AND wizard Step 5.** The active form (`oslsr_master_v3.xlsx` per Awwal 2026-05-10) has a NIN question that the existing renderer special-cases (`apps/web/src/features/forms/pages/FormFillerPage.tsx:21,111` — `NIN_QUESTION_NAMES = ['nin', 'national_id']` + `useNinCheck` hook). The story's AC#1 Step 5 + AC#4 implicitly assumed NIN was NOT in the questionnaire — leading to potential duplicate input + conflicting state. **Mitigation**: Dev Notes "Step 5 NIN handling — state-aware dispatcher (2026-05-10)" reframes Step 5 as a 3-state dispatcher (A: NIN captured in questionnaire / B: pending NIN via inline toggle / C: form has no NIN question — fall back to original AC#1+AC#4 spec). Wizard becomes ROBUST to form changes — Super Admin republishing a NIN-less form auto-flips Step 5 to State C without code changes. AC#4 toggle location is now state-dependent (inline in Step 4 for States A/B, in Step 5 for State C); behaviour unchanged. Implementation lives in Task 5.5 (4-subtask expansion) + Task 4.6 (form-schema introspection) + Task 6.1.x (NinHelpHint inline `onPendingNinClick` wiring). NOT modifying AC#4 text directly per dev-story workflow's permitted-edit rule; future SM session can canonicalise.

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
- **`apps/api/src/routes/form.routes.ts`** — Task 5.4: add new `GET /forms/public-active` endpoint resolving the Super-Admin-pinned public-facing form (Option B) OR the source-type-filtered form (Option A). Mounts behind `FormController.getPublicActiveForm`.
- **`apps/api/src/controllers/form.controller.ts`** — Task 5.4: new `getPublicActiveForm` static method.
- **`apps/api/src/services/native-form.service.ts`** — Task 5.4: new `getPublicActiveForm()` reading the `wizard.public_form_id` setting (Option B) OR querying with source-type filter (Option A); returns flattened render schema or `404 PUBLIC_FORM_NOT_CONFIGURED`.
- **`apps/api/drizzle/<NNNN>_<name>.sql`** — ONLY if Awwal picks Option A: migration adds `respondent_source_types TEXT[]` to `questionnaire_forms`. Default `['enumerator']`. Multiple in-flight stories may collide on the migration slot; coordinate at impl time.

**Frontend (refactor — Task 5.4.3):**
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — DECOMPOSE: extract the inner state + skipLogic + renderer into a reusable `<FormRenderer>` component at `apps/web/src/features/forms/components/FormRenderer.tsx`. FormFillerPage becomes a thin route-mount wrapper around `<FormRenderer>`. The wizard's Step 4 mounts `<FormRenderer>` directly without the page chrome.

**Frontend (created):**
- `apps/web/src/features/forms/components/FormRenderer.tsx` — Task 5.4.3 decomposition target. Reusable component extracted from `FormFillerPage.tsx`. Props: `formSchema` + `initialResponses` + `onAnswer` + `onComplete` + `onPendingNinClick` (NEW callback per Step 5 dispatcher Dev Notes — fires when user clicks "I don't have my NIN now" link inline on the NIN question). No URL params; no router dependency. Wizard Step 4 mounts this directly.
- `apps/web/src/features/registration/pages/Step5NinCaptured.tsx` — State A sub-view (NIN captured via questionnaire). "✓ NIN captured: 1234***8901" confirmation + auth choices.
- `apps/web/src/features/registration/pages/Step5PendingNin.tsx` — State B sub-view (pending NIN via inline toggle). Info-50 consequence-preview + auth choices + "Save as Pending" submit button.
- `apps/web/src/features/registration/pages/Step5NinInput.tsx` — State C sub-view (form has no NIN question). Original AC#1 Step 5 + AC#4 spec verbatim.
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
- **`apps/web/src/features/forms/pages/FormFillerPage.tsx`** — Task 13.1: NinHelpHint inline variant on NIN question with "I don't have my NIN now" link → optional `_deferReasonNin` input + Confirm → `_pendingNin: true` in submission rawData. Reuses existing `NIN_QUESTION_NAMES` constant (line 21).
- **`apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx`** — Task 13.2: same toggle pattern, clerk-specific UI placement.

**Backend modified — Universal Pending-NIN (added 2026-05-10):**
- `apps/api/src/services/submission-processing.service.ts` — Task 3.1: REMOVE NIN-required throw at line 359; route to `findOrCreateRespondent` with `nin: undefined` when missing (regardless of source). Task 3.5: race-resolution merge — fuzzy-match-then-promote pending rows when NIN is provided later.
- `apps/api/src/services/pending-nin.service.ts` — **NEW** (Task 3.6): `resolveReminderDestination(respondent)` pure function with 5-branch precedence per source.
- `apps/api/src/workers/reminder.worker.ts` — Task 1.9 (deferred to next session) + Task 3.6: source-aware reminder dispatch using `resolveReminderDestination`.
- `apps/api/src/services/audit.service.ts` — Task 3.8: append `PENDING_NIN_CREATED` + `PENDING_NIN_PROMOTED` to `AUDIT_ACTIONS` const (40 total).
- `apps/api/src/services/__tests__/audit.service.test.ts` — Task 3.8: bump sentinel `.toHaveLength(38) → .toHaveLength(40)` with heritage-comment line. Same trip-wire that broke commit `adb956b` → preempt this time.
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` (or equivalent) — Task 3.9: race-resolution-merge tests + concurrent-merge-attempts + reminder-destination per-source tests.
- (NEW supervisor-dashboard widget surface) — Task 3.7: anti-abuse data surface (per-enumerator 7-day pending rate aggregate query). UI affordance for the soft warning deferred to post-field-survey.

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
| 2026-05-10 | **Universal pending-NIN — Option 1 scope expansion ratified (no code change in this commit).** Awwal directive: extend pending-NIN from public-only to all submission sources (enumerator + clerk). Rationale: "do it once and for all, no technical debt" — schema (Story 11-1) already supports it, marginal cost is ~2 dev-days vs the data-quality risk of carrying public-only forward + a follow-up story later. Six design decisions locked in new Dev Notes subsection "Universal pending-NIN — Option 1 design (2026-05-10)": **(D1)** race-resolution merge in `findOrCreateRespondent` (fuzzy-match name+phone of pending rows when NIN provided later → atomic UPDATE pending → active; `PENDING_NIN_PROMOTED` audit event); **(D2)** `resolveReminderDestination` pure function with 5-branch precedence per source (public→email; enumerator→email\|sms-flag-on\|supervisor; clerk→email\|supervisor; imported_*→no reminder); **(D3)** pay-on-completion productivity metric (pending submissions don't count toward enumerator KPI until status flips to active — abuse-resistant); **(D4)** audit actions 38→40 (`PENDING_NIN_CREATED` + `PENDING_NIN_PROMOTED`); **(D5)** optional `_deferReasonNin` field on rawData (auto-set for public, free-text for enumerator/clerk; never required); **(D6)** anti-abuse data surface (per-enumerator 7-day pending-rate aggregate query — supervisor-dashboard widget; UI soft warning deferred post-field-survey based on real data). Story scope: 5-7 → 7-9 dev-days. Risks #11 added. Task 3 expanded with 5 new subtasks (3.5 race-merge / 3.6 destination resolver / 3.7 anti-abuse query / 3.8 audit-actions+sentinel / 3.9 tests). NEW Task 13 covers enumerator FormFillerPage + clerk ClerkDataEntryPage pending-NIN toggle wiring (`_pendingNin` + `_deferReasonNin` rawData fields). FRC #3 (public wizard) remains satisfied by the public-only baseline — universal-pending-NIN is additive, not blocking. AC text NOT modified per dev-story workflow's permitted-edit rule; canonical SM amendment can land in a future Bob session. | Field-survey window of <2 weeks accommodates the +2 days. The race-resolution merge is the only genuinely new infrastructure piece — everything else builds on Story 11-1 schema + prep-input-sanitisation E.164 normaliser + Story 6-1 audit chain. Pay-on-completion productivity metric is the most important policy decision in this set (incentive design); without it, universal-pending-NIN creates an enumerator over-deferral abuse vector. |
| 2026-05-10 | **Step 5 NIN handling — state-aware dispatcher design clarification added to Dev Notes (no code change).** During the Step-4-injection clarification round, Awwal flagged a deeper conflict: the active form (`oslsr_master_v3.xlsx`) has a NIN question. The existing renderer special-cases NIN (`apps/web/src/features/forms/pages/FormFillerPage.tsx:21,111` — `NIN_QUESTION_NAMES = ['nin', 'national_id']` + `useNinCheck` hook for real-time modulus-11 + duplicate-check). Story's AC#1 Step 5 + AC#4 implicitly assumed NIN was NOT in the questionnaire → if implemented as written, user types NIN twice (Step 4 form + Step 5 input) with conflicting state. New Dev Notes subsection "Step 5 NIN handling — state-aware dispatcher (2026-05-10)" reframes Step 5 as a 3-state dispatcher: **State A** (NIN captured via questionnaire — Step 5 shows confirmation + auth choices, no NIN input), **State B** (pending NIN via inline toggle in Step 4 — Step 5 shows consequence-preview + auth choices + "Save as Pending" button), **State C** (form has no NIN question — falls back to original AC#1+AC#4 spec verbatim). Wizard introspects form schema at Step 4 mount via `formData.formHasNinQuestion` boolean — robust to form changes (Super Admin can publish a NIN-less form, wizard auto-flips to State C without code changes). Task 5.5 expanded to 4-subtask checklist with 3 sub-views (`Step5NinCaptured.tsx` / `Step5PendingNin.tsx` / `Step5NinInput.tsx`). Task 4 gains 4.6 (form-schema introspection); Task 6.1 amended for NinHelpHint inline `onPendingNinClick` wiring. New Risks entry #10. WizardDraftData TypeScript shape extended (`formHasNinQuestion`, `questionnaireFormId`, `questionnaireFormVersionId` — JSONB-backed, no migration). AC#4 toggle location is now state-dependent (inline in Step 4 for States A/B, in Step 5 for State C); behaviour unchanged. **AC text NOT modified** per dev-story workflow's permitted-edit rule; Dev Notes is the spec-amendment-of-record until next SM canonicalisation pass. | Second clarification surfaced by Awwal's question "the questionnaire already has a NIN Question, how do we use the pending nin approach in this regards." Same impostor-SM drift pattern at design-time as the Step-4 source-type-filter gap (both surfaced 2026-05-10). The state-aware Step 5 design is more robust than the originally-specced fixed UI — it handles the future case where a NIN-less form gets published without breaking. Catches before Task 5 implementation; saves ~1 day of rework + post-deploy UX-correction churn. |
| 2026-05-10 | **Step 4 questionnaire injection — design clarification added to Dev Notes (no code change).** During the magic-link Task 1 dev session, a clarifying question from Awwal exposed a real spec gap: AC#1 Step 4 says the wizard renders the published `respondentSourceTypes='public'` form, but the codebase has NO source-type / role / target-audience filter on the `questionnaire_forms` schema. Verified across `apps/api/src/db/schema/questionnaires.ts`, `packages/types/src/native-form.ts:88` (`NativeFormSchema` has no `targetRoles` field), `apps/api/src/routes/form.routes.ts:24-27` (`/forms/published` returns ALL published forms, no filter). New Dev Notes subsection "Step 4 Questionnaire Injection — design clarification (2026-05-10)" enumerates 3 discovery options: **A** schema extension (add `respondent_source_types TEXT[]` column + Native Form Builder UI checkbox), **B** `system_settings` row (`wizard.public_form_id` setting; reuses prep-settings-landing infrastructure), **C** convention-based (most-recently-published form). **Recommends Option B** — consistent with AC#7 SMS OTP toggle pattern, ~1-day implementation, no schema migration. Task 5.4 expanded to a 9-subtask checklist (5.4.0 Awwal design pick → 5.4.8 tests) covering: discovery endpoint (`GET /forms/public-active`), `<FormRenderer>` decomposition from existing `apps/web/src/features/forms/pages/FormFillerPage.tsx`, draft form-version locking via new `WizardDraftData.questionnaireFormId/VersionId` fields (TypeScript-only addition; no migration), edge case for "no public form configured" empty state, two-progress-indicator UX. New Risks entry #9. Email-service-template Risks entry #8 also flipped RESOLVED with the inline-string outcome from Task 1.8 dev-time inspection. | This is the impostor-SM drift pattern recurring at design time, not just file-path time — the original story v1 (and even the v2 retrofit) carried forward an architectural assumption (`respondentSourceTypes` filter on questionnaires) that doesn't match the codebase. Catching it BEFORE Task 5.4 implementation saves a day of rework. The Option B recommendation leverages prep-settings-landing infrastructure and stays consistent with the broader Awwal Path B decision (Settings infrastructure once, used by multiple stories). |
| 2026-05-10 | **Task 1 PARTIAL — backend magic-link foundation (1.1-1.7 + 1.10 done; 1.8 inline; 1.9 + 1.11 deferred to next session).** Status `ready-for-dev → in-progress`. Files shipped: 2 schemas (`magic-link-tokens.ts` + `wizard-drafts.ts`), migration `0012_add_magic_links_and_wizard_drafts.sql`, service `magic-link.service.ts` (issue/redeem/revoke/sendEmail with atomic single-use via UPDATE...RETURNING + 3 per-purpose TTLs), rate-limit middleware `magic-link-rate-limit.ts` (3/email/1hr per NFR4.4 budget), controller `magic-link.controller.ts` (POST /public/magic-link anti-enumeration + GET /magic redemption returns JSON), 4 new `AUDIT_ACTIONS` (`MAGIC_LINK_ISSUED` + `MAGIC_LINK_REDEEMED` + `PENDING_NIN_DEFERRED` + `PENDING_NIN_TRANSITIONED`). Auth.routes.ts wired with 2 new endpoints. Coverage map (`rate-limit-coverage.test.ts`) extended with both endpoints + threshold contract entry for `magicLinkRateLimit`. **Tests: 17 service tests pass** (issue + redeem + revoke + URL build + per-purpose TTLs + atomic single-use + expiry + JSON serialization + lowercase-email-storage). **Pre-commit checks**: lint clean, tsc clean, middleware+routes regression 133/133. **Deferred**: 1.9 reminder worker (couples with Task 3 pending-NIN promotion logic; cohesive landing in next session); 1.11 route-level supertest layer (requires app-fixture pattern matching existing `auth.routes.test.ts`); JWT cookie issuance for magic-link login (lands when frontend drives the redirect flow in Task 4-7). **Task 2 (SMS OTP infra) + Task 3 (pending-NIN) + Task 4-7 (frontend wizard) all queued for subsequent sessions per Risk #3 (5-7 dev-days realistic).** | First session of FRC #3 implementation. The magic-link primitive is the load-bearing piece for AC#6 + #9 + #10 — landing it as a clean, tested, atomic deliverable de-risks the rest of the story. JWT issuance was scoped out because there's no frontend yet to redirect to; carrying that complexity into a backend-only commit would be premature. Cohesive next-session boundary: Task 1.9 + Task 2 + Task 3 = remaining backend; then Tasks 4-9 = frontend wizard (largest surface, separate session per Risk #3). |
| 2026-04-30 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level "Dependencies", "Field Readiness Certificate Impact", "Technical Notes" (preserving all 5 subsections — Magic-link token storage discipline / Pending-NIN reminder cadence rationale / Server-side draft vs IndexedDB / Why Google OAuth retirement / SMS OTP feature flag relationship to prep-settings-landing / Email service template handling), "Risks" under Dev Notes; converted task-as-headings (`### Task N — Title` + `1.1.` numbered subitems) to canonical `[ ] Task N (AC: #X)` checkbox format with `[ ] N.M` subtasks; added `### Project Structure Notes` subsection covering new feature dir + wizard layout + existing auth pages inventory + staff activation wizard existing path + service-layer pattern + workers convention + drizzle barrel + settings dependency + audit logging + rate-limit clone pattern + JWT issuance reuse + frontend HTTP client + TanStack Query convention + CSP discipline + email service flat-file pattern + existing routes file; added `### References` subsection with 24 verified `[Source: file:line]` cites; moved top-level `## Change Log` under `## Dev Agent Record` as `### Change Log`; added `### Review Follow-ups (AI)` placeholder; added Task 12 (code review) per `feedback_review_before_commit.md`. **Five factual path corrections applied throughout:** (1) `apps/web/src/features/auth/pages/PublicRegisterPage.tsx` → `RegistrationPage.tsx` (verified actual filename); (2) `apps/web/src/features/auth/pages/PublicLoginPage.tsx` → `LoginPage.tsx` (verified actual filename); (3) `apps/web/src/features/staff-activation/` (fictional dir) → `apps/web/src/features/auth/components/activation-wizard/` (verified existing path; AC#12 retro-fits the existing wizard at this canonical location); (4) `apps/api/src/lib/settings.ts` referenced as if existing → relocated as HARD dependency on companion story `prep-settings-landing-and-feature-flags` which creates this lib (per Awwal Path B decision 2026-04-30 — Settings infrastructure is a separate prep task, not folded into 9-12); (5) `apps/api/src/services/email/templates/` referenced as existing dir → email service is currently flat file; Task 1.8 explicitly defers template-pattern decision to dev-time inspection (refactor only if needed; separate prep task if so). **AC#7 reframed to consume prep-settings-landing:** SMS OTP feature flag mechanism (system_settings DB table + `getSetting` accessor) lives in prep-settings-landing-and-feature-flags; super-admin toggle UI lives in Settings Landing Page; this story is the BACKEND consumer of the flag (route + provider adapter + service + audit on attempts), not the UI owner. **Four new audit actions documented** for `AUDIT_ACTIONS` const extension: `MAGIC_LINK_ISSUED`, `MAGIC_LINK_REDEEMED`, `PENDING_NIN_DEFERRED`, `PENDING_NIN_TRANSITIONED`. All 14 ACs preserved verbatim. Status `ready-for-dev` preserved. | Story v1 was authored by impostor-SM agent without canonical workflow load — same drift pattern as Stories 9-13 / prep-tsc / prep-build-off-vps / 11-1 / prep-input-sanitisation-layer / 10-5 / 9-11 / 11-2 / 11-4. This story is the LARGEST in the retrofit batch (14 ACs, 12 Tasks, 5 path corrections, 1 dependency-relocation per Awwal Path B). The new prep-settings-landing dependency was created during this same retrofit cascade as the cleanest resolution to Q2 (settings storage for `auth.sms_otp_enabled` feature flag) — avoiding the technical-debt path of a one-off settings hack scoped to 9-12. |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 12.)_
