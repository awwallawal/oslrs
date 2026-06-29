# Story 13-11 — Cohort C Thank-You + Referral Blast

Status: done

## Story
As the **launch operator**, I want to **thank the registrants who completed their profile end-to-end and invite them to share the public registration link**, so that **retention is acknowledged and we grow organic reach without acquiring any third-party personal data**.

## Acceptance Criteria
1. **AC1 — Cohort C selection.** An operator-gated script targets respondents WHO COMPLETED end-to-end (have a `submissions` row) and are email-reachable via `magic_link_tokens.email`. Verified prod sizes: 76 completed, **61 email-reachable**, 15 phone-only.
2. **AC2 — Shareable, tagged referral link.** The CTA is the PUBLIC wizard entry `${PUBLIC_APP_URL}/register?utm_campaign=thankyou-referral-2026-07&utm_source=referral` — a generic shareable link, NOT a per-user magic-link. A referred person who completes attributes via 13-1 `parseUtm` → `raw_data.campaign_source`.
3. **AC3 — Campaign-tagged send (13-9 funnel).** The send is tagged `CAMPAIGN_ID='thankyou-referral-2026-07'` so `email_events.campaign_id` populates and `ReportService.getCampaignFunnel('thankyou-referral-2026-07')` measures sent→delivered→clicked→converted.
4. **AC4 — NDPA-safe copy.** A genuine thank-you + a one-line purpose statement + an **opt-out** line. Asks only to SHARE A LINK; never solicits a third party's personal data (no "give us your friend's number"). Asserted by test.
5. **AC5 — Operator discipline.** `--dry-run` mandatory first; live needs `--confirm-i-am-not-dry-running`; honors `email_suppressions` (13-9 `getSuppressedEmails`); per-send `audit_logs` via `OPERATOR_THANKYOU_REFERRAL_SENT`; rate-limit + Resend-Pro-confirm threshold.
6. **AC6 — Phone-only outreach.** Copy-paste SMS templates for the 15 phone-only completers (thank-you/referral) + the incomplete phone-only nudge (see Dev Notes).

## Tasks
- [x] **Task 1 (AC1/AC2/AC3/AC4/AC5)** — `apps/api/scripts/_thankyou-referral-blast.ts` mirroring 9-28 (parseArgs/maskEmail/firstNameFrom/escapeHtml/buildEmail/selectCohort/main + dry-run + 13-9 suppression filter + 13-9 send-tag). Cohort = `respondents INNER JOIN submissions INNER JOIN magic_link_tokens (DISTINCT ON r.id, latest token email)`. Static `buildReferralUrl()`.
- [x] **Task 2 (AC3)** — `thankyou-referral` added to `NotificationCategory` + the subject classifier (notification-category.ts).
- [x] **Task 3 (AC5)** — `OPERATOR_THANKYOU_REFERRAL_SENT` audit action (audit.service.ts).
- [x] **Task 4** — unit tests (17): parseArgs, maskEmail/firstNameFrom/escapeHtml, buildReferralUrl (tagged, not a magic-link), buildEmail (subject/personalize/escape/embeds-tagged-link/opt-out/NDPA-bright-line), KNOWN_FLAGS drift.
- [x] **Task 5** — verified the script EXECUTES via `--dry-run` on scratch `app_test` (selectCohort SQL valid, flow clean, referral link correct; cohort 0 on scratch as expected).
- [x] **Task 6 (AC6)** — SMS templates drafted (Dev Notes).

## Dev Notes
- **Cohort email source:** `respondents` has NO email column — email comes from `magic_link_tokens.email` (links `respondent_id`). `DISTINCT ON (r.id) ORDER BY mlt.created_at DESC` picks the latest token email. `INNER JOIN submissions` restricts to completers. Confirmed: the without-submission variant of this SQL returned exactly 52 = the Cohort A dry-run, validating the join.
- **Why a public link, not a magic-link:** referral = a *third party* registers, so the link must be shareable and generic. The utm tag rides through a fresh `/register` visit → 13-1.
- **NDPA stance:** contacting our own registrants for a registry-consistent purpose + asking them to share a PUBLIC link processes no third-party PII. The bright line (tested): never ask for a friend's contact details.
- **Meter category:** `thankyou-referral` (distinct from `reengagement-blast`) so the 9-63 meter buckets it separately; campaign attribution is via the 13-9 tag regardless.

### AC6 — Phone-only SMS templates (send manually from the OSLSR phone)
**(a) Thank-you + referral — for the 15 phone-only *completers*:**
> Thank you for completing your Oyo State Skills Registry profile! Help others benefit — share this link to register: https://oyoskills.com/register?utm_campaign=thankyou-referral-2026-07&utm_source=referral-sms — Reply STOP to opt out. — Oyo Skills

**(b) Completion nudge — for the 11 phone-only *incomplete* registrants** (not Cohort C, but the phone-only counterpart of the recovery blasts):
> Hi, this is the Oyo State Skills Registry. Your registration is almost done — complete it here: https://oyoskills.com/register — it takes a few minutes and your details are saved. Reply STOP to opt out.

(`utm_source=referral-sms` distinguishes the SMS channel within the same campaign; the funnel still rolls both up by `campaign_id`. Operator may shorten the URL.)

## Dev Agent Record
- **AC1–AC5 DONE** (Amelia, dev-story 2026-06-29). Script mirrors 9-28; referral link static + tagged; send tagged with `CAMPAIGN_ID`; suppression honored; audit-logged. 17 unit tests green; api tsc 0; eslint clean; `--dry-run` executes on `app_test` (referral URL verified, SQL valid).
- **AC6 DONE** — SMS templates above.
- **Verification:** scripts are excluded from `tsconfig` include (Pitfall #41) → relied on the unit tests + the live `--dry-run` to catch runtime/SQL errors, not tsc.

### File List
**New:** `apps/api/scripts/_thankyou-referral-blast.ts` · `apps/api/scripts/__tests__/_thankyou-referral-blast.test.ts`
**Modified:** `apps/api/src/services/notification-category.ts` (+`thankyou-referral` category + classifier) · `apps/api/src/services/audit.service.ts` (+`OPERATOR_THANKYOU_REFERRAL_SENT`) · `apps/api/src/services/__tests__/audit.service.test.ts` (drift-detector count 52→53)

**Pre-push catch:** the AUDIT_ACTIONS drift-detector test (`audit.service.test.ts`, expects an exact count) failed the full-suite pre-push gate because the new action made it 53. Updated the count + comment (the test self-documents this). Lesson: when touching shared `src/services`, run the full api suite before committing — targeted tests miss cross-file drift detectors (the pre-push gate caught it correctly).

### Review Follow-ups (AI) — code-review 2026-06-29
- [x] [AI-Review][Med] **M1 — opt-out was ineffective** ("reply to this email" → unmonitored `noreply@`). FIXED: redirects to the monitored `support@oyoskills.com` (text + html) + a test asserts it (and that it no longer instructs a reply).
- [ ] [AI-Review][Low] **L1 — no `List-Unsubscribe` header** — cross-cutting `EmailService` gap (affects 9-27/9-28 too); bulk-sender best practice. Route to a future EmailService hygiene story, not 13-11.
- [x] [AI-Review][Low] L2 — `--max-recipients` 100 cap is dry-run-visible (parity with 9-28) — accepted.
- [x] [AI-Review][Low] L3 — generic referral link can't attribute *which* referrer (by-design shareable link; per-referrer codes = future) — documented.

## Senior Developer Review (AI)

**Reviewer:** Amelia (BMAD code-review — adversarial) · **Date:** 2026-06-29 · **Outcome:** ✅ APPROVE

- **Scope verified:** git == File List (6 files). The shared-builder extraction is correctly absent (deferred to 13-12 — confirmed not contaminating this atomic commit).
- **Found + fixed the real defect (M1):** the opt-out told recipients to reply to a no-reply sender — an NDPA-misleading dead end. Now routes to the monitored `support@`.
- **Validated clean:** `DISTINCT ON (r.id) ORDER BY mlt.created_at DESC` yields one row per completer with the latest token email (no dup/missing — the without-submission twin matched the Cohort A=52 dry-run); the referral link is the PUBLIC `/register`, campaign-tagged (not a magic-link) → 13-1 attribution; the send-tag arg order (`category`, `campaignId`) reaches `email_events.campaign_id`; the NDPA bright-line (no third-party PII) is test-asserted; dry-run + suppression + audit parity with 9-28; the `thankyou-referral` classifier ordering can't mis-classify (and is moot — the script passes the category explicitly).
- **Findings:** 0 Critical · 0 High · 1 Medium (fixed) · 3 Low (1 routed out, 2 accepted).
- **Verification:** 17/17 unit tests · api tsc 0 · eslint clean · `--dry-run` executes on `app_test`.
- **Decision:** approved → atomic commit. Operator residual: $20 Resend Pro, then fire (one-off backfill for the existing 61). 13-12 will make it evergreen.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-29 | Story created + implemented (script + category + audit + tests + SMS templates) | Amelia (dev) |
