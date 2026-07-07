# Story 13-21: Registration auto-emails silently not firing + no visibility (confirmation, thank-you, campaign tag)

Status: ready-for-dev

<!-- Authored 2026-07-07 by Bob (SM) via *create-story. EMERGENT from investigating whether the first real organic registration (Modupe/dupsy5@gmail.com) got its emails. Found: the 9-58 confirmation AND the 13-12 evergreen thank-you/referral auto-sends are NOT completing for ANY public registration (0/140 respondents carry either send-once marker), and the campaign_id tag isn't recorded in email_events. The fire-and-forget + fail-soft design (correct for not failing ingestion) swallowed the failures with ZERO operator visibility — a critical campaign mechanism (referral loop) + a UX feature (reference-code confirmation) have been dead-on-arrival and nobody knew. -->

## Story
As **the launch operator (and every registrant)**,
I want **the registration confirmation + thank-you/referral emails to actually reach registrants, the campaign tag to record, and a LOUD alert when auto-sends start failing**,
so that **the referral growth loop + the reference-code confirmation work — and a silent email failure can never again go unnoticed across every registration.**

## Context & Evidence (verified on prod 2026-07-07)
- **0 of 140** public respondents carry `metadata.confirmation_email_sent_at` (9-58) OR `metadata.thankyou_referral_sent_at` (13-12). Both markers are written ONLY after a confirmed send [submission-processing.service.ts:914, :967], so a universal absence = the sends aren't completing in the registration flow.
- **Both are CALLED** for public completions: confirmation at :284-295 (gated `_isNew && referenceCode && email` — Modupe qualifies), thank-you at :305 (gated `source='public'` inside the method). Fire-and-forget (`void`) + fail-soft try/catch → a failure logs `…email_failed`/`…email_error` and is swallowed (correct for ingestion safety; catastrophic for visibility).
- **The send PATH itself works** — a controlled diagnostic on the box (real Resend provider, `.env` loaded first) sent a real thank-you (`email.resend.sent`, messageId `51e5885a…`, delivered). So the email content, Resend integration, marketing List-Unsubscribe headers, and campaign arg all function. **The failure is in the registration-flow execution, not the email.** (Reproduce in-app to catch the swallowed error — the deployed app's `processSubmission` runs in the async ingestion queue; a provider-init-order / context issue is the leading suspect, since a naïve script gets the MOCK provider unless `.env` is loaded before the app modules import.)
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
- [ ] **Task 1 (AC1)** — reproduce in-app (logging/integration test on the real processSubmission + real-provider context); capture the swallowed error; document root cause.
- [ ] **Task 2 (AC2, AC3)** — fix the in-flow send + the campaign_id tag recording; per-send integration + tag round-trip tests.
- [ ] **Task 3 (AC4)** — auto-send failure metric + threshold alert (9-15 Telegram); keep fire-and-forget non-blocking.
- [ ] **Task 4 (AC5)** — idempotent backfill script (confirmation + thank-you for missed real registrants; suppression + marker honored; dry-run → apply on the box).
- [ ] **Task 5 (AC6)** — full suites + tsc/eslint.

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
### File List

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
