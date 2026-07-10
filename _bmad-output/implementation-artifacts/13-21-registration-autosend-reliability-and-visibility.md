# Story 13-21: Registration auto-emails silently not firing + no visibility (confirmation, thank-you, campaign tag)

Status: done

<!-- Authored 2026-07-07 by Bob (SM) via *create-story. EMERGENT from investigating whether the first real organic registration (Modupe/dupsy5@gmail.com) got its emails. Found: the 9-58 confirmation AND the 13-12 evergreen thank-you/referral auto-sends are NOT completing for ANY public registration (0/140 respondents carry either send-once marker), and the campaign_id tag isn't recorded in email_events. The fire-and-forget + fail-soft design (correct for not failing ingestion) swallowed the failures with ZERO operator visibility — a critical campaign mechanism (referral loop) + a UX feature (reference-code confirmation) have been dead-on-arrival and nobody knew. -->

## Story
As **the launch operator (and every registrant)**,
I want **the registration confirmation + thank-you/referral emails to actually reach registrants, the campaign tag to record, and a LOUD alert when auto-sends start failing**,
so that **the referral growth loop + the reference-code confirmation work — and a silent email failure can never again go unnoticed across every registration.**

## Context & Evidence (verified on prod 2026-07-07)
- **0 of 140** public respondents carry `metadata.confirmation_email_sent_at` (9-58) OR `metadata.thankyou_referral_sent_at` (13-12). Both markers are written ONLY after a confirmed send [submission-processing.service.ts:914, :967], so a universal absence = the sends aren't completing in the registration flow.
- **Both are CALLED** for public completions: confirmation at :284-295 (gated `_isNew && referenceCode && email` — Modupe qualifies), thank-you at :305 (gated `source='public'` inside the method). Fire-and-forget (`void`) + fail-soft try/catch → a failure logs `…email_failed`/`…email_error` and is swallowed (correct for ingestion safety; catastrophic for visibility).
- **The send PATH itself works** — a controlled diagnostic on the box (real Resend provider, `.env` loaded first) sent a real thank-you (`email.resend.sent`, messageId `51e5885a…`). **INBOX DELIVERY USER-CONFIRMED 2026-07-07** (the `[DIAG3]` test arrived in awwallawal@gmail.com — Awwal confirmed), so this is proven end-to-end, not merely Resend-accepted. So the email content, Resend integration, sender-domain/deliverability, marketing List-Unsubscribe headers, and campaign arg all function. **The failure is in the registration-flow execution, not the email — do NOT chase deliverability.** (Reproduce in-app to catch the swallowed error — the deployed app's `processSubmission` runs in the async ingestion queue; a provider-init-order / context issue is the leading suspect, since a naïve script gets the MOCK provider unless `.env` is loaded before the app modules import.)
- **Second bug — campaign tag not recorded:** the same diagnostic send carried `campaign_id='thankyou-referral-auto'` but recorded in `email_events` as **untagged** (`campaign_id` blank). So 13-9 campaign attribution is broken for auto-sends: `getCampaignFunnel`/tag analytics can't see them.
- **The real cost:** the app has been sending transactional email fine (magic-links, backups deliver), but the **referral email (the campaign's viral loop) and the confirmation have reached ~nobody** — and the fail-soft made it invisible until a manual check of one registrant.

## Acceptance Criteria
1. **AC1 — Root-cause the in-flow failure.** Reproduce in the deployed app context (temporary structured logging around the :288 confirmation + :305 thank-you calls, or an integration test that exercises the real `processSubmission` path) and identify why the sends don't complete for public registrations despite the send path working in isolation. Document the exact cause.
2. **AC2 — Confirmation + thank-you actually fire.** A fresh public registration results in `confirmation_email_sent_at` AND `thankyou_referral_sent_at` set, and two real emails delivered (verified in `email_events`). The gates stay correct (source='public', send-once, suppression honored).
3. **AC3 — Campaign tag records.** A tagged send (`campaign_id`) is recorded in `email_events.campaign_id` (fix the Resend-tag → webhook → column mapping). A test sends a tagged email and asserts the tag round-trips. (Restores 13-9 attribution for auto-sends + blasts.)
4. **AC4 — VISIBILITY (the keystone).** Auto-send failures are no longer silent: emit a counted metric/log at ERROR level AND alert (via the 9-15 Telegram path) when auto-sends fail beyond a small threshold (e.g. N consecutive or a daily rate). Fire-and-forget must stay non-blocking for ingestion, but a systemic failure MUST page. (This is what would have caught 140 silent failures on day one.)
4. **AC5 — Backfill the affected.** Retroactively send the confirmation + thank-you to the real registrations that missed them (Modupe + any post-13-12 public completers), honoring suppression + the send-once markers (idempotent, like the reference-code + lgaid backfills). Do NOT re-send to test rows.
5. **AC6 — Tests + suites green.** Integration test for the real `processSubmission` auto-send path; tag round-trip test; alert-threshold test. Full api + web suites green.

## Tasks / Subtasks
- [x] **Task 1 (AC1)** — reproduce in-app (logging/integration test on the real processSubmission + real-provider context); capture the swallowed error; document root cause.
- [x] **Task 2 (AC2, AC3)** — fix the in-flow send + the campaign_id tag recording; per-send integration + tag round-trip tests.
- [x] **Task 3 (AC4)** — auto-send failure metric + threshold alert (9-15 Telegram); keep fire-and-forget non-blocking.
- [x] **Task 4 (AC5)** — idempotent backfill script (confirmation + thank-you for missed real registrants; suppression + marker honored; dry-run → apply on the box).
- [x] **Task 5 (AC6)** — full suites + tsc/eslint.

### Review Follow-ups (AI) — adversarial code-review 2026-07-10 (different LLM)
Findings from the code-review workflow. Severity Critical→Low. Items marked ✅ FIXED were auto-applied in the same review pass; items marked ✔ ACCEPT are deliberate decisions recorded here (no code change).
- [x] **[AI-Review][MED] M1 — post-send marker-stamp failure miscounted as a send failure + duplicate-send risk.** ✅ FIXED. The `metadata` idempotency-stamp `db.execute` in BOTH `sendReferenceConfirmationEmail` and `sendThankYouReferralEmail` sat inside the same try as the successful send, so a stamp failure routed to `recordAutoSendFailure` (false AC4 page) and left the marker unset (duplicate on next backfill/re-process). Wrapped the stamp in its own try→`logger.warn` (`*.marker_stamp_failed`); the outer catch now only counts genuine pre/at-send failures. [submission-processing.service.ts:~939, ~1004]
- [x] **[AI-Review][MED] M2 — AC4 page is entirely Redis-dependent (no Redis ⇒ page can never fire, only the ERROR log).** ✅ FIXED (doc + comment). Made the limitation explicit at the Redis-null return and added it to the operator residuals below so it's a known, runbook-tracked degradation rather than a silent one. [email-autosend-monitor.ts:~94]
- [ ] **[AI-Review][MED] M3 — AC6 "integration test for the real processSubmission path" delivered only by proxy (unit + route-call assertion, DB mocked).** ✔ ACCEPT. Coverage is strong (the missing CALL is now pinned) but is not a real-DB integration test. Accepted as a reasonable proxy; a true integration test is a post-launch fast-follow if the auto-send path regresses.
- [x] **[AI-Review][LOW] L4 — daily counter/cooldown keyed on UTC day (WAT is UTC+1 ⇒ rolls over 01:00 local).** ✅ FIXED (clarifying comment; behaviour intentional). [email-autosend-monitor.ts:~37]
- [x] **[AI-Review][LOW] L5 — `maskEmail` left short local-parts unmasked (`ab@x.com`→`ab@x.com`).** ✅ FIXED — always emits ≥3 asterisks. [_backfill-registration-autosends.ts:~183]
- [ ] **[AI-Review][LOW] L6 — `me.service` completeness-gate hardening is scope creep beyond the literal ask.** ✔ ACCEPT (kept). Byte-consistent with the controller and closes the same silent-`reason:'unknown'` blind spot on the authenticated-edit path; the dev flagged it for an explicit decision — accepted.
- [ ] **[AI-Review][LOW] L7 — public registrants now receive two "welcome" emails (9-58 confirmation + 13-12 thank-you) seconds apart.** ✔ ACCEPT. PM-approved in this story; flagged so the content redundancy (reference-code email for a code shown on-screen) is a conscious product choice.

## Dev Notes
- **The design isn't wrong, the blind spot is.** Fire-and-forget + fail-soft correctly protects ingestion (9-26 lesson). The gap is OBSERVABILITY — a swallowed failure with no counter/alert. AC4 is the durable fix; the send fix (AC1/2) restores the feature.
- **Provider-init-order suspicion:** a script gets the MOCK provider unless `.env` loads before app modules import (observed on the box). Check the deployed app's boot order can't leave `EmailService` initialized on mock while the DB/env are fine — and if so, that alone would explain silent no-op "success" on some path. Verify the running app's provider at boot (`email.service.initialized`) is `resend`, and that the ingestion-worker context shares it.
- **Tag bug (AC3) is independent but adjacent:** Resend tag → `email_events.campaign_id`. The diagnostic proved the tag is SENT but recorded blank — the break is in the webhook parse or the send-side tag attach; 13-9's `getCampaignFunnel` depends on it.
- **Launch relevance:** the referral loop is a core campaign mechanism; shipping the blast while it's dead wastes the referral multiplier. PM to set priority (below).

### References
- [Source: apps/api/src/services/submission-processing.service.ts:284-307 (both auto-send calls), :914/:967 (markers), :934-995 (thank-you method + swallowed catches)]
- [Source: apps/api/src/services/email.service.ts:99-124 (dispatch — provider send + meter, no block), :670 (sendGenericEmail)] · [list-unsubscribe.ts (fail-soft, not the cause)]
- [Source: prod 2026-07-07 — 0/140 markers; diagnostic thank-you `51e5885a` delivered but recorded untagged; app uses real Resend for transactional]
- [Source: 13-9 email_events/campaign attribution; 13-12 evergreen auto-send; 9-58 confirmation; 9-15 Telegram alerts]

## Dev Agent Record

### AC1 — ROOT CAUSE (verified 2026-07-10; DIVERGES from the story's provider-init-order suspicion)

**The sends never ran for the public channel because the public wizard bypasses the only code that calls them — NOT a provider/init/async-context bug.**

- The public wizard (`registration.controller.ts::submitWizard`) writes its `submissions` row with `processed: true` / `processedAt: now` **inside its own transaction and never enqueues submission-processing** (explicit comment there: *"bypass the submission-processing queue"*, registration.controller.ts:639–644).
- BOTH auto-send calls live **only** inside `SubmissionProcessingService.processSubmission` (`:288` confirmation, `:305` thank-you), which runs solely for the enumerator/clerk/webhook **queue** path.
- ∴ for the entire public channel, `processSubmission` never executes → neither email fires → **0/140 markers**. 13-12's evergreen thank-you (gated `source='public'`) has been **dead-on-arrival since it shipped**, because public submissions never reach the only method that calls it. This exactly fits the story's evidence ("send path works in isolation; failure is in the registration-flow execution").
- **Bug 2 (AC3) — campaign tag recorded blank.** Confirmed against Resend's webhook reference: webhook events echo tags as an **object map** `data.tags: { campaign_id: "…" }`, but `parseResendEvent` only handled `Array.isArray(data.tags)` (the *send*-API shape) → the branch never matched → `campaignId` stayed `null` → every tagged send (auto-sends + blasts) recorded untagged.

### Completion Notes
- **AC1** — Root cause documented above (architectural bypass, not init-order). The AC1 "reproduce in-app" is realised as the deterministic `registration.routes.test.ts` assertion that `submitWizard` now invokes the shared auto-send entrypoint (the exact call that was missing), plus the `submission-processing.service.test.ts` coverage of the shared method.
- **AC2** — Extracted the single public entrypoint `SubmissionProcessingService.sendRegistrationAutoEmails({ respondentId, email, referenceCode, status, isNew })`. Both `processSubmission` (queue path) AND `submitWizard` (public wizard, after commit) call it — one code path, no drift. Fire-and-forget (`void`) + fail-soft. Confirmation self-gates on `isNew + referenceCode`; thank-you self-gates on `source='public'` + send-once marker + 13-9 suppression. Public registrants now get BOTH (per John's PM validation + the AC2 wording).
- **AC3** — `parseResendEvent` now reads the object-map tag shape (`data.tags.campaign_id`), keeping the array shape as a defensive fallback. Round-trip test added with the real webhook shape.
- **AC4 (keystone)** — New `email-autosend-monitor.ts`: every auto-send failure now logs at **ERROR** (was a swallowed `warn`), increments a Redis **daily** failure counter (fail-open), and pages the operator on Telegram (9-15 channel) **once/day** (SET-NX cooldown) when the day's failures cross a threshold (default 5, env `AUTOSEND_FAILURE_ALERT_THRESHOLD`). Both send methods route their failure paths through it, so both the queue and wizard paths are covered. Never throws → ingestion/registration stays non-blocking.
- **AC5** — `scripts/_backfill-registration-autosends.ts`: idempotent (routes through the same shared entrypoint whose send-once markers gate re-sends), honours suppression, excludes test/synthetic rows, dry-run→apply discipline (`--confirm-i-am-not-dry-running`), rate-limited. Resolves email from the provisioned account (`users.email`) or the most-recent magic-link token. **OPERATOR RESIDUAL: run `--dry-run` then `--apply` on the box (Modupe + any post-13-12 public completers).**
- **AC6** — Gates all green (self-verified, run independently):
  - Full API suite: **2841 passed / 7 skipped (212 files), 0 failures** (single-threaded).
  - New/changed targeted files: email-autosend-monitor (5), submission-processing (+4 shared-entrypoint), registration.routes (+wizard auto-send assertion), email-events (+2 object-map tag), webhook/worker/resend-provider all green.
  - `tsc --noEmit` clean (api); `eslint src scripts` clean; backfill script smoke-tested (help + dry-run on app_test → 0 rows, SQL valid).
- **OPERATOR RESIDUALS**: (1) run the AC5 backfill on the box; (2) optionally set `AUTOSEND_FAILURE_ALERT_THRESHOLD` (defaults to 5) + confirm `TELEGRAM_*` are set so the AC4 page can fire; (3) add `registration_autosend.failure` / `registration_autosend.alert_paged` to the ops runbook as monitored signals.

### Post-implementation hardening (2026-07-10, Awwal-directed — completeness-gate observability)
During testing the wizard completeness-gate catch logged `reason: 'unknown'`. Diagnosed as a **test-only artifact** (not a prod bug): the routes-test default mock rejected `getPublicActiveForm` with a plain `Error`, whereas prod throws a real `AppError('PUBLIC_FORM_NOT_CONFIGURED')`. Applied the same "no silent failure" lesson as the rest of this story:
- **(a)** The routes-test default now rejects with the real `AppError('PUBLIC_FORM_NOT_CONFIGURED', …, 404)`, so the test exercises the true warn-level path (logs read truthfully).
- **(b)** The catch in BOTH `registration.controller.submitWizard` AND `me.service` (the sibling authenticated-edit gate) now splits: an **expected** `AppError` (e.g. `PUBLIC_FORM_NOT_CONFIGURED`) stays a `warn`; a genuine **non-AppError** validator crash is promoted to `logger.error` (`wizard.completeness_error` / `me.registration_edit.completeness_error`) so it's visible/alertable instead of hiding as `reason:'unknown'`. Behaviour is unchanged (still swallowed + proceeds) — only observability changes.
- New test: `submitWizard` with a non-AppError validator crash still returns 201 (proceeds), pinning the ERROR-branch behaviour. Gates re-run: registration.routes (46) + me.service (10) green, tsc + eslint clean.

> **Scope note (dev initiative, flagged for review):** the literal request named only the public-wizard gate (`registration.controller`). The `me.service` authenticated-edit gate was extended **proactively** because it carries the byte-identical catch pattern (and already cross-references the controller in its comment) — leaving it unhardened would have re-introduced the same silent `reason:'unknown'` blind spot on the in-session-edit path. Called out here so a reviewer can accept or revert this one extra file deliberately rather than discover it in the diff.

### File List
**Source (production):**
- `apps/api/src/services/email-autosend-monitor.ts` (NEW — AC4 failure counter + Telegram alert)
- `apps/api/src/services/submission-processing.service.ts` (AC2 shared entrypoint + AC4 failure routing)
- `apps/api/src/controllers/registration.controller.ts` (AC2 — wizard fires the shared entrypoint post-commit)
- `apps/api/src/services/email-events.service.ts` (AC3 — object-map tag parse)
- `apps/api/src/services/me.service.ts` (post-impl hardening — completeness-gate ERROR on non-AppError crash)

**Scripts:**
- `apps/api/scripts/_backfill-registration-autosends.ts` (NEW — AC5 idempotent backfill)

**Tests:**
- `apps/api/src/services/__tests__/email-autosend-monitor.test.ts` (NEW — AC4)
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` (AC2/AC4 — shared entrypoint + monitor mock)
- `apps/api/src/services/__tests__/email-events.service.test.ts` (AC3 — object-map round-trip)
- `apps/api/src/routes/__tests__/registration.routes.test.ts` (AC2 — wizard auto-send assertion + importActual mock)

## PM Validation (John, 2026-07-07)

**Validated — approved. HIGH priority, strongly recommended before the blast (but not a hard registration-blocker).**

1. **Priority nuance:** registrations themselves work (the wizard completes, the reference code shows on-screen). So the blast *could* fire without this. BUT the **thank-you/referral IS the campaign's viral growth loop** — firing paid spend into a dead referral loop throws away the multiplier the whole email lifecycle (13-11/13-12/13-13) was built for. So: **fix the sends (AC1/AC2) + backfill (AC5) before the blast if at all possible.** If schedule forces the blast first, it's survivable (registrations aren't blocked) and this fixes in parallel — but that's the worse ROI.

2. **AC4 (visibility) is the keystone and is non-negotiable regardless of the blast schedule.** A critical mechanism failed silently for **every** registration and only surfaced because we hand-checked one registrant. That blind spot — not the send bug — is the real lesson. Ship the alert even if the send fix takes a beat. Add it to the ops runbook as a monitored signal.

3. **AC3 (tag recording) rides along** — it's independent but same subsystem, and 13-9's campaign funnel (how you'll measure the blast) is blind without it. Fix it in the same story so blast attribution works from send #1.

4. **AC5 backfill:** yes to Modupe + any real post-13-12 completers; idempotent + suppression-honored; NEVER to test rows. This also *completes* Modupe's welcome (nice recovery for your first real registrant).

5. **Scope check:** this is genuinely one story (all one subsystem — the notification/email path around `processSubmission`). Don't split; the shared diagnosis (AC1) feeds AC2/AC3/AC4.

**AC numbering has a duplicate `4.` (visibility vs backfill) — cosmetic; the AC labels AC1–AC6 are the source of truth.** No content changes. Dev-ready and urgent.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-07 | Story drafted via *create-story — confirmation + thank-you auto-sends silently not firing (0/140 markers) despite a working send path; campaign tag not recording; fire-and-forget swallowed it with zero visibility. Fix + campaign-tag fix + failure ALERTING (keystone) + idempotent backfill. EMERGENT from the Modupe investigation. | Bob (SM) |
| 2026-07-10 | Post-impl hardening (Awwal-directed): completeness-gate catch now promotes a genuine non-AppError validator crash to `logger.error` (`wizard.completeness_error` / `me.registration_edit.completeness_error`) instead of hiding it as `reason:'unknown'` in a warn — applied to both `registration.controller` and the `me.service` sibling; routes-test default mock switched to the real `PUBLIC_FORM_NOT_CONFIGURED` AppError so logs read truthfully; +1 test (crash still proceeds/no-500). tsc + eslint + affected suites green. | Amelia (Dev) |
| 2026-07-10 | Adversarial code-review (different LLM). File List == git reality (7 mod + 3 new, no drift/phantom). AC1–AC5 verified functionally sound (AC1 root cause independently confirmed: the wizard `processed:true` bypass at registration.controller.ts:708 is real). 7 findings (0 Crit/High): **M1** post-send marker-stamp failure was miscounted as a send failure + duplicate-send risk → FIXED (stamp wrapped in its own try→warn, both send methods); **M2** AC4 page is Redis-dependent → FIXED (explicit code comment + operator-residual note); **L4** UTC day boundary → FIXED (comment); **L5** `maskEmail` short-local leak → FIXED (≥3 asterisks). **M3** (AC6 integration-test literalism), **L6** (`me.service` scope), **L7** (double welcome email) → ACCEPTED as documented decisions. Gates re-run after fixes: 4 affected suites 129 pass, tsc(api) clean, eslint(changed files) clean. Status → done. Operator residuals unchanged (run AC5 backfill on the box; set threshold/TELEGRAM env; add signals to runbook incl. the M2 no-Redis-no-page limitation). NOT committed (operator commits selectively). | Code-Review (AI) |
| 2026-07-10 | dev-story COMPLETE (Amelia). **AC1 root cause corrected**: NOT provider-init-order — the public wizard writes its submission `processed:true` and BYPASSES `processSubmission`, where both auto-sends live → the whole public channel got neither (13-12 thank-you dead-on-arrival since ship). AC2: shared `sendRegistrationAutoEmails` entrypoint, called by both the queue path and `submitWizard` (post-commit, fire-and-forget). AC3: `parseResendEvent` reads the Resend webhook OBJECT-MAP tag shape (`data.tags.campaign_id`; was array-only) → campaign attribution restored. AC4 (keystone): new `email-autosend-monitor.ts` — ERROR log + Redis daily counter + once/day Telegram page over a threshold; both send methods route failures through it. AC5: idempotent `_backfill-registration-autosends.ts` (dry-run→apply, suppression + send-once honored, excludes test rows). Gates: full API 2841 pass/7 skip + full WEB 2744 pass/2 todo + tsc(api) + eslint(src,scripts) all clean; backfill smoke-tested. Status → review. OPERATOR RESIDUAL: run the backfill on the box. NEXT: adversarial code-review (different LLM). | Amelia (Dev) |
