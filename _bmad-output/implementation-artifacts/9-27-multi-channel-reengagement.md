# Story 9.27: Multi-channel re-engagement campaign for abandoned wizard drafts

Status: in-progress (Part A code shipped 2026-05-22; Parts B/C/D/E/F backlog)

<!--
Authored 2026-05-20 by Bob (SM) via canonical *create-story --yolo template.

Surfaced 2026-05-20 morning when operator confirmed 60 wizard
respondents on prod AND 101 in-progress wizard_drafts still holding
preserved questionnaireResponses data (up from 70 yesterday).

Story 9-26 Part J introduced the concept of an operator-gated email
recovery campaign using the existing magic-link wizard_resume infra
from Story 9-12 MR-8. This story (9-27) EXPANDS that concept to be:

  - Multi-channel: email + SMS + WhatsApp (101 drafts likely span all
    three preferred channels among Nigerian users)
  - Properly product-framed (NOT an apology campaign — re-engagement)
  - Operator-gated, auditable, opt-out-respecting (NDPA-aligned)
  - Documented in a standalone story (not a fold-into-9-26 part) so
    the audit-trail-defense framing is durable

Audit-safe framing principle: the 101 in-progress drafts have NOT
lost any data — their answers are preserved in wizard_drafts.form_data.
We're nudging users to complete an abandoned product session, a
standard product-marketing pattern. NO admission of any incident.
NO apology. NO reference to Story 9-26 / 9-12 § L7 internal data
loss matter (those affected only the 60 already-completed respondents
and are documented internally).

The 60 completed respondents who lost Step 4 data are NOT
communicated to. Doing so creates audit exposure for zero operational
benefit. Internal documentation (Story 9-12 § L7 + Story 9-26)
preserves operator accountability.
-->

## Story

As the **Super Admin operating the OSLRS launch in active-adoption phase**,
I want **a multi-channel (email + SMS + WhatsApp) operator-gated re-engagement campaign tool that contacts the 101 (and growing) users who started but didn't complete their wizard registration, inviting them to resume via magic-link**,
So that **we recover registrations from abandoned funnel sessions where the user's data is already preserved in `wizard_drafts.form_data`, increasing the registry's coverage without re-asking those users to start from scratch, while maintaining clean audit-trail-defense product-marketing framing AND respecting their NDPA opt-out rights**.

## Acceptance Criteria

### Part A — Email channel (extends Story 9-26 Part J)

1. **AC#A1 — One-shot script**: `apps/api/scripts/_reengagement-email-blast.ts`. Operator runs via Tailscale SSH after Story 9-26 Parts A/I deploy lands. Selects all `wizard_drafts` where:
   - `form_data ? 'questionnaireResponses'` (has Step 4 data)
   - `form_data->'questionnaireResponses' != '{}'::jsonb` (non-empty)
   - `form_data->>'email'` IS NOT NULL (we have a way to reach them)
   - `expires_at > NOW()` (draft still live)
   For each, issue a magic-link via `MagicLinkService.issueToken({ email, purpose: 'wizard_resume' })` and send the recovery email via the existing `EmailService.sendGenericEmail()` API.

2. **AC#A2 — Rate limiting**: max 10 emails/minute to respect Resend Pro tier budget + avoid triggering Resend's spam-pattern detection. Configurable via `--rate-per-minute` flag (default: 10).

3. **AC#A3 — Email template** (verbatim — audit-safe framing, NO apology):
   ```
   Subject: Complete your Oyo State Skills Registry registration (2 minutes)

   Hi [First Name],

   You started registering for the Oyo State Skills Registry recently —
   your progress is saved. Click below to finish in under 2 minutes:

     [Resume my registration →]

   Once registered, you'll be in the database that helps Oyo State plan
   better training programs and connect residents to job opportunities.

   Registration is free + your data is protected under the Nigeria Data
   Protection Act (NDPA).

   If you're no longer interested, no action is needed — your draft will
   expire automatically.

   The Oyo State Skills Registry team
   support@oyoskills.com
   ```
   - First-name personalization from `form_data->>'fullName'` (split on first space)
   - Magic-link URL produced by `MagicLinkService.buildMagicLinkUrl(plaintext, 'wizard_resume')` → `https://oyoskills.com/auth/magic?token=<plaintext>&purpose=wizard_resume` (72h TTL per `MagicLinkService.TTL_MS_BY_PURPOSE.wizard_resume`; `login` TTL is the 15-min one)
   - NO apology, NO admission, NO reference to any incident or data loss

4. **AC#A4 — Per-send audit log entry**: new `AUDIT_ACTIONS.OPERATOR_REENGAGEMENT_EMAIL_SENT`. Details JSONB captures `{email, draft_id, sent_at, channel: 'email', provider_message_id}` (key `email` per existing audit-log convention — see `magic-link.controller.ts:91`). `ipAddress` field = `os.hostname()` (operator host); `userAgent` = invocation string (`tsx scripts/_reengagement-email-blast.ts (rate=N)`). `actorId` = null (operator-script context).

5. **AC#A5 — Dry-run flag**: `--dry-run` prints the recipient list (emails redacted to first 4 chars + asterisks) + cohort count without sending. Mandatory for first invocation per launch-week incident-recovery discipline.

6. **AC#A6 — Cohort filtering flags**:
   - `--since YYYY-MM-DD` — only drafts created since the date
   - `--lga <lgaId>` — geographic-scoped campaigns
   - `--max-recipients N` — safety cap (default: 200)

7. **AC#A7 — Post-run summary**: prints `<count> sent, <count> failed, <provider message IDs cohort summary>` so operator can verify via Resend dashboard cross-reference.

### Part B — SMS channel

8. **AC#B1 — Reuse Story 9-12 SMS adapter**: the SMS OTP infrastructure shipped in Story 9-12 (apps/api/src/services/sms-otp.service.ts + sms-provider.adapter.ts) provides an SMS adapter. Extend it to send NON-OTP transactional messages (like this re-engagement nudge) OR thin-wrap the existing adapter with a `SmsService.sendGeneric()` method.

9. **AC#B2 — One-shot script**: `apps/api/scripts/_reengagement-sms-blast.ts`. Same filter+cohort logic as email blast, but selects `form_data->>'phone'` instead of email. Issues the magic-link, embeds shortened URL via project URL-shortener (TBD per AC#B5).

10. **AC#B3 — SMS template** (160-char limit — fits one SMS segment):
    ```
    Oyo Skills Registry: Your registration is incomplete. Your answers
    are saved. Tap to finish in 2 mins: ovr.ng/r/<short> Reply STOP to opt out.
    ```
    155 chars including the STOP opt-out line. Single-segment delivery (₦1-3/recipient on most NG providers).

11. **AC#B4 — STOP opt-out tracking**: new `respondents.metadata.sms_opted_out: true` field. SMS adapter watches inbound STOP replies (if provider exposes inbound webhook) OR operator periodically reviews provider's opt-out list + manually flags. Future campaigns must skip flagged respondents.

12. **AC#B5 — URL shortener**: needed because full magic-link URL (`https://oyoskills.com/register/resume?token=<32-char-token>`) exceeds 160-char SMS budget. Options:
    - Operator runs Bitly / TinyURL shortener manually per batch (low-tech, fine for current volume)
    - Project-hosted `apps/api/src/services/short-link.service.ts` — new table `short_links(short_code, target_url, created_at, expires_at, click_count)`. Magic-link URLs become `https://oyoskills.com/r/<code>`. Adds attribution tracking as a side benefit.
    Strategy choice deferred to dev agent; recommend project-hosted for attribution + NDPA-compliance (no third-party URL data sharing).

13. **AC#B6 — Per-send audit log entry**: new `OPERATOR_REENGAGEMENT_SMS_SENT` action with details `{recipient_phone_masked, draft_id, sent_at, channel: 'sms', provider_message_id}`.

### Part C — WhatsApp channel

14. **AC#C1 — WhatsApp Business provider integration**: new dependency. Recommended NG providers: Termii (NG-focused, cheaper) OR Twilio WhatsApp Business API (global, higher cost). Operator picks based on cost/compliance comfort. Story flags decision point; doesn't pre-commit.

15. **AC#C2 — Template messaging**: WhatsApp Business requires pre-approved templates for outbound non-conversation messages. Submit the following template for approval:
    ```
    Template name: oslrs_wizard_resume
    Category: TRANSACTIONAL
    Language: en
    Header (text): Complete your Oyo Skills registration
    Body: Hi {{1}}, you started registering with the Oyo State Skills Registry recently — your answers are saved. Tap to complete in 2 minutes: {{2}}
    Footer: Reply STOP to opt out.
    Buttons: [URL: Resume registration] → {{2}}
    ```

16. **AC#C3 — One-shot script**: `apps/api/scripts/_reengagement-whatsapp-blast.ts`. Same filter+cohort+rate-limit pattern. Sends template messages via the new provider integration.

17. **AC#C4 — STOP opt-out tracking**: new `respondents.metadata.whatsapp_opted_out: true` field. Provider webhook captures inbound STOP messages.

18. **AC#C5 — Per-send audit log entry**: new `OPERATOR_REENGAGEMENT_WHATSAPP_SENT` action with details `{recipient_phone_masked, draft_id, sent_at, channel: 'whatsapp', provider_message_id, template_id}`.

### Part D — Cross-channel coordination

19. **AC#D1 — Don't spam the same person across all 3 channels in 24h**: the email blast runs first, then SMS only to drafts that DID NOT engage with email within 12 hours (no click on magic-link), then WhatsApp only to drafts that did not engage with email + SMS. Sequencing built into the scripts via shared `last_reengagement_at` field on `wizard_drafts.metadata`.

20. **AC#D2 — Opt-out unification**: respondents who opt-out of ANY channel are skipped from ALL future channels.

21. **AC#D3 — Engagement attribution**: when a recipient resumes their wizard via magic-link, the `wizard_drafts.metadata.reengagement_channel` field records which channel they came from (for campaign-effectiveness analytics).

### Part E — Tests + dry-run discipline

22. **AC#E1 — Unit tests**: filter logic (`should include drafts X / exclude Y`), rate-limiting bucket math, template personalization, opt-out skip. ~12 tests.

23. **AC#E2 — Mandatory dry-run before live**: every script MUST be invoked with `--dry-run` first. Live run requires `--confirm-i-am-not-dry-running` flag (deliberately ugly to force operator-thoughtfulness). Documented in script header.

24. **AC#E3 — Resend Pro tier prerequisite**: scripts fail-fast with clear error if Resend free-tier daily count would be exceeded. Operator MUST upgrade to Pro tier (Story 9-20 Part A) before running Part A live.

### Part F — Memory + handover docs

25. **AC#F1 — New memory entry**: `feedback_reengagement_campaign_discipline.md`:
    - Audit-safe framing principle (re-engagement ≠ apology)
    - Cross-channel rate-limiting + sequencing
    - Opt-out unification
    - When NOT to communicate (the 60 completed respondents case)

26. **AC#F2 — Operator runbook**: `docs/runbooks/wizard-reengagement-campaign.md` with step-by-step instructions for running each channel + cross-channel coordination + dry-run discipline.

27. **AC#F3 — MEMORY.md index entry**: under "Pending Follow-Up" — `- [Wizard re-engagement campaign](feedback_reengagement_campaign_discipline.md) — audit-safe framing for contacting abandoned funnel sessions. 3 channels (email/SMS/WhatsApp), sequenced, opt-out-respecting.`

## Tasks / Subtasks

- [x] **Task 1 — Part A: Email blast script** (AC: #A1-A7) — code shipped 2026-05-22 (see File List + Dev Agent Record)
- [ ] **Task 2 — Part B: SMS blast script + URL shortener** (AC: #B1-B6)
- [ ] **Task 3 — Part C: WhatsApp provider integration + template approval + script** (AC: #C1-C5)
- [ ] **Task 4 — Part D: Cross-channel coordination + opt-out unification** (AC: #D1-D3)
- [ ] **Task 5 — Part E: Tests + dry-run guardrails** (AC: #E1-E3)
- [ ] **Task 6 — Part F: Memory + runbook docs** (AC: #F1-F3)
- [ ] **Task 7 — Pre-merge BMAD code review on uncommitted tree** (per `feedback_review_before_commit.md`)
- [ ] **Task 8 (operator) — Resend Pro upgrade** (HARD prerequisite for Task 1 live run)
- [ ] **Task 9 (operator) — Run Task 1 dry-run + live email blast** (post-deploy)
- [ ] **Task 10 (operator) — Evaluate response rate; decide on Task 2 SMS escalation**
- [ ] **Task 11 (operator) — Evaluate again; decide on Task 3 WhatsApp escalation**

## Dev Notes

### Audit-safe framing principle (load-bearing — DO NOT relocate)

The 101 in-progress drafts are NOT victims of any incident. Their data is fully preserved in `wizard_drafts.form_data`. They started a registration and didn't finish — normal product-funnel behavior. The re-engagement campaign is **standard product-marketing**: convert abandoned sessions to completed registrations.

Messaging MUST NOT:
- Apologize ("Sorry for the inconvenience")
- Reference any incident or data loss
- Admit to any internal bug or process gap
- Suggest the recipient's data was at risk

Messaging MUST:
- Be friendly + low-pressure
- Reference only their abandoned session, not any backend matter
- Honor NDPA + opt-out rights
- Be transparent about purpose (Oyo State workforce planning)

This framing is what makes the campaign audit-trail-defensible if any external observer asks "why did you suddenly contact 101 people?" Answer: "We ran a product-marketing re-engagement campaign documented in Story 9-27, contacting users who started but didn't complete the registration funnel. Standard product behavior."

### Why NOT communicate with the 60 completed respondents

The 60 wizard respondents whose Step 4 questionnaire answers were dropped by the pre-9-26 buggy handler are NOT to be contacted under this campaign. They:
- Successfully registered (have respondents row, magic-link received, registry membership confirmed)
- Do not know about the internal data-handling matter
- Telling them creates audit exposure (admission of an internal issue)
- Gain nothing from being told (Step 4 data was supplementary, not core PII required for registry membership)

NDPA does not require disclosure of internal data-processing issues that did not affect a data subject's primary rights (their registration is valid; their identity is captured). The lost Step 4 data was supplementary survey-research data, not identification or eligibility data.

The 60 respondents' data-loss is documented INTERNALLY in Story 9-12 § L7 + Story 9-26. That documentation is for operator accountability + dev-team learning. It is not customer-facing.

### Channel-cost economics

- **Email**: ~$0 marginal (Resend Pro covers 50k/month for $20 flat)
- **SMS**: ~₦1-3 per single-segment NG SMS (TermSMSing / Bulk SMS Nigeria pricing). 101 SMS = ₦101-303 total.
- **WhatsApp Business**: ~₦5-15 per templated message (Twilio NG / Termii). 101 WhatsApp = ₦500-1500 total.

Total worst-case campaign cost across all 3 channels: < ₦2000 (~$1.5).

### Sequencing rationale

Email first because:
- Lowest cost
- Already-built infrastructure (Story 9-12 MR-8 wizard_resume magic-link)
- Highest-trust channel for transactional/recovery messaging
- Resend's deliverability is reliable

SMS second because:
- Highest response rate for time-sensitive messages in NG market
- Catches users who don't check email frequently
- Lower cost than WhatsApp

WhatsApp third because:
- Highest engagement once delivered (most read in NG)
- But: requires Business API setup + template approval (~24-48 hours)
- Highest cost per message
- Best for "final-call" prompts to users who ignored email + SMS

### Dependencies (HARD)

- **Story 9-26** — the data-persistence fix MUST be deployed first. If a recovered user resumes their wizard + submits BEFORE 9-26 deploys, their Step 4 answers are dropped again (defeating the whole purpose). 9-26 Parts A/C/I deployed at e95b8ec (2026-05-20 morning). 9-27 Part A safe to run from this moment forward.
- **Story 9-12 MR-8 wizard_resume infrastructure** — provides the magic-link redemption + wizard-state-hydration. No changes needed.
- **Story 9-20 Part A Resend Pro** — HARD prereq for live email blast. Free tier 100/day would consume 100 emails on a single 101-recipient run + zero remaining headroom for transactional emails (login magic-links, etc.).
- **Story 9-22 (operator-db-audit-discipline)** — if shipped, scripts use the `operatorUpdate` helper for the audit-log writes. If not yet shipped, scripts use ad-hoc `AuditService.logAction()` calls.

### Risks

1. **Email deliverability spike triggers Resend / Gmail spam-filtering** — 101 emails from `noreply@oyoskills.com` in a short window may pattern-match as bulk-marketing. Mitigation: rate-limit (10/min default), use proper unsubscribe-equivalent ("no action needed — draft will expire"), warm-up gradually if doing larger campaigns later.

2. **SMS opt-out enforcement is partial** — without an inbound-webhook from the SMS provider, STOP replies don't auto-flag. Mitigation: AC#B4 documents the manual review cadence; operator periodically pulls provider's opt-out list.

3. **WhatsApp template rejection** — Meta may reject our template wording. Mitigation: AC#C2 provides a baseline; submit it; if rejected, iterate based on Meta's feedback. Template approval is one-time.

4. **Cross-channel sequencing race** — if email blast + SMS blast launch within minutes, the `wizard_drafts.metadata.last_reengagement_at` field may not yet record the email send when SMS script reads it. Mitigation: AC#D1's 12-hour window between channels provides plenty of buffer; operator manually sequences via day-spacing.

5. **Recipients who already registered via a fresh wizard start get duplicate-NIN errors** — some of the 101 in-progress drafts may have abandoned because they re-started fresh. Their old drafts shouldn't be contacted. Mitigation: pre-filter drafts whose `form_data->>'email'` already appears in `respondents.metadata` (no easy email-on-respondents column, but we can join on `magic_link_tokens.email`).

6. **Low response rate** — possible the 101 abandoned for reasons other than time/distraction (bad UX, lost interest, fraud-prevention triggered). Email campaign may get 5-15% response, which is fine but not transformative. Re-engagement campaigns rarely exceed 20% in any industry. Operator should temper expectations.

### Effort estimate

- Part A (email blast): ~1 hour (mostly reusing 9-12 infra)
- Part B (SMS blast + URL shortener): ~3-4 hours
- Part C (WhatsApp Business integration): ~4-6 hours + template approval wait (24-48h)
- Part D (cross-channel coordination): ~1-2 hours
- Part E (tests): ~2 hours
- Part F (docs + memory): ~30 min

**Total**: ~12-16 hours. Splittable across 2-3 sessions. Critical-path: Part A only (~1.5 hours including tests + dry-run) gets the email channel live.

### Priority

🟢 **OPERATIONAL — non-blocking** but high-leverage. 101 abandoned drafts × ~15% expected response × full-data preservation = ~15 additional fully-completed registrations. Worth the ~1.5-hour Part A cost. Parts B/C optional based on Part A response rate.

## File List

### Part A — shipped 2026-05-22 (this session)

- `apps/api/scripts/_reengagement-email-blast.ts` (new)
- `apps/api/scripts/__tests__/_reengagement-email-blast.test.ts` (new — AC#E1, 30+ unit tests on pure functions)
- `apps/api/src/services/audit.service.ts` (modified — added `OPERATOR_REENGAGEMENT_EMAIL_SENT`)
- `apps/api/src/services/__tests__/audit.service.test.ts` (modified — count 40 → 41)

### Parts B-F — backlog (expected when picked up)

- `apps/api/scripts/_reengagement-sms-blast.ts` (new, one-shot)
- `apps/api/scripts/_reengagement-whatsapp-blast.ts` (new, one-shot)
- `apps/api/src/services/sms.service.ts` (modified — sendGeneric() method)
- `apps/api/src/services/whatsapp.service.ts` (new — Termii / Twilio adapter)
- `apps/api/src/services/short-link.service.ts` (new — project-hosted URL shortener)
- `apps/api/src/db/schema/short-links.ts` (new)
- `apps/api/src/services/audit.service.ts` (further modified — new OPERATOR_REENGAGEMENT_SMS_SENT / WHATSAPP_SENT actions)
- `docs/runbooks/wizard-reengagement-campaign.md` (new)
- `MEMORY.md` + `feedback_reengagement_campaign_discipline.md` (new)

## Review Follow-ups (AI)

Adversarial code-review on uncommitted tree, 2026-05-22 (Claude Opus 4.7). All HIGH + MEDIUM auto-fixed in same session. 14 findings closed.

### HIGH

- [x] [AI-Review][HIGH] AC#E1 unfulfilled — zero unit tests on the script. Fix: created `apps/api/scripts/__tests__/_reengagement-email-blast.test.ts` with 30+ tests across `parseArgs`, `maskEmail`, `firstNameFrom`, `escapeHtml`, `buildEmail`, `KNOWN_FLAGS`.
- [x] [AI-Review][HIGH] `parseArgs` accepted unknown flags silently → typo-induced live-run risk. Fix: added `KNOWN_FLAGS` Set + throw on unknown flag in `parseArgs` [_reengagement-email-blast.ts:50–58, 92–95].

### MEDIUM

- [x] [AI-Review][MEDIUM] AC#A3 had factually-wrong URL (`/register/resume`) + TTL (15-min) — real impl uses `/auth/magic?token=…&purpose=wizard_resume` + 72h TTL. Fix: AC#A3 rewritten to cite `MagicLinkService.buildMagicLinkUrl` as canonical [9-27 file:80].
- [x] [AI-Review][MEDIUM] `cohort.indexOf(row)` inside send loop = O(N²) idiom. Fix: switched to indexed `for` loop [_reengagement-email-blast.ts:295, 351].
- [x] [AI-Review][MEDIUM] Audit log details missing forensic IP/userAgent. Fix: passing `os.hostname()` as `ipAddress` + `tsx scripts/... (rate=N)` as `userAgent` [_reengagement-email-blast.ts:308–311, 331–334].
- [x] [AI-Review][MEDIUM] Story 9-27 unmaintained vs shipped reality (status `ready-for-dev`, Tasks/File-List stale). Fix: status flipped to `in-progress`; Task 1 marked [x]; File List split into "Part A shipped" / "Parts B-F backlog" sections.
- [x] [AI-Review][MEDIUM] Stray `apps/api/_bmad-output/` dir from earlier tsc CWD. Fix: CSVs moved to canonical `_bmad-output/scratch/oslrs-cohorts-2026-05-20/`; stray dir deleted.
- [x] [AI-Review][MEDIUM] No `--help` flag — operator-discoverability gap. Fix: added `--help` handler + HELP_TEXT exposing all flags + rate-limit semantics caveat [_reengagement-email-blast.ts:62–76, 224–227].

### LOW

- [x] [AI-Review][LOW] Duplicate `audit.service.js` imports on two lines. Fix: combined `import { AuditService, AUDIT_ACTIONS } from ...` [_reengagement-email-blast.ts:35].
- [x] [AI-Review][LOW] `--since` UTC-boundary surprise (`new Date('YYYY-MM-DD')` parses midnight UTC = 01:00 WAT). Fix: inline comment documenting the offset [_reengagement-email-blast.ts:124–127].
- [x] [AI-Review][LOW] HTML email lacked first-name escape. Fix: added `escapeHtml()` helper + escape `firstName` in HTML body [_reengagement-email-blast.ts:165–173, 199].
- [x] [AI-Review][LOW] Audit details key `recipient_email` inconsistent with existing `email` convention. Fix: renamed key to `email` in both implementation and AC#A4 [_reengagement-email-blast.ts:316; 9-27 file:84].
- [x] [AI-Review][LOW] Rate-limit semantics is "max-N/min" not "exactly-N/min". Fix: HELP_TEXT note + inline comment on the delay line [_reengagement-email-blast.ts:73–75, 357].

## Dev Agent Record

### 2026-05-22 — Part A code complete

**Implemented by**: Claude Opus 4.7 (this session).
**Files added**: `_reengagement-email-blast.ts` + `_reengagement-email-blast.test.ts` (30+ tests).
**Files modified**: `audit.service.ts` (new action, count 40→41), `audit.service.test.ts` (count expectation).
**ACs met**: A1, A2, A3, A4, A5, A6, A7, E1, E2, E3 (Part A only).
**Pre-merge code review**: completed same session (this `Review Follow-ups (AI)` section). All HIGH + MEDIUM auto-fixed.
**Operator-gated next steps**:
1. Resend Pro tier upgrade (Story 9-20 Part A) — HARD prereq for live blast.
2. Dry-run on prod via Tailscale (`tsx scripts/_reengagement-email-blast.ts --dry-run`).
3. Review masked cohort + invoke live with `--confirm-i-am-not-dry-running --confirm-resend-pro-active`.

**Parts B/C/D/E/F**: still backlog. Decide based on Part A response rate.
