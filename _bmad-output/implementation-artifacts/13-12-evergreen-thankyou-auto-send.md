# Story 13-12 — Evergreen Thank-You / Referral Auto-Send

Status: done

## Story
As the **registry**, I want **every new self-service registrant who completes end-to-end to automatically receive the thank-you + referral email**, so that **each new completer becomes a referral source without operator action — a continuous growth loop** (the 13-11 blast becomes a one-time backfill for the existing 61; this handles everyone from here on).

## Acceptance Criteria
1. **AC1 — Shared builder (no drift).** `buildThankYouEmail` + `buildThankYouReferralUrl` extracted to `apps/api/src/services/thankyou-email.ts`, used by BOTH the 13-11 blast and the auto-send. The blast re-exports them (its tests stay green, unchanged).
2. **AC2 — Send-once marker.** `metadata.thankyou_referral_sent_at` (JSONB, mirrors the 9-58 `confirmation_email_sent_at` pattern — NO migration). The auto-send fires only when ABSENT; stamped via JSONB merge after a confirmed dispatch.
3. **AC3 — The hook.** In `submission-processing.service.ts` `processSubmission`, after the respondent is complete end-to-end, fire the thank-you for **self-service (`source='public'`)** completers who are **email-reachable** and **not 13-9-suppressed**. FIRE-AND-FORGET — a comms failure NEVER fails ingestion (mirrors the 9-58 confirmation path).
4. **AC4 — Funnel separation.** The auto-send is tagged `thankyou-referral-auto` (distinct from the blast's `thankyou-referral-2026-07`) so `getCampaignFunnel` separates organic-onboarding referrals from the campaign blast.
5. **AC5 — Backfill unification (no double-send).** The 13-11 blast ALSO stamps `metadata.thankyou_referral_sent_at` on each successful send, so the auto-send skips anyone the blast reached.

## Tasks
- [x] **Task 1 (AC1)** — extract to `thankyou-email.ts`; refactor `_thankyou-referral-blast.ts` to import + re-export (`buildThankYouReferralUrl(campaignId)` now parameterised). 13-11 test unchanged + green (17/17).
- [x] **Task 2 (AC2)** — `thankyou_referral_sent_at` added to `RespondentMetadata` (no migration — metadata JSONB column exists).
- [x] **Task 3 (AC3/AC4)** — `sendThankYouReferralEmail` (private, fail-soft) + the `void`-fired hook call in `processSubmission`. Gates: `source='public'` + marker-absent + not-suppressed (13-9 `getSuppressedEmails`). Tagged `thankyou-referral-auto`. Reuses the `thankyou-referral` NotificationCategory.
- [x] **Task 4 (AC5)** — `_thankyou-referral-blast.ts` stamps the marker on each successful send (JSONB merge, fail-soft).
- [x] **Task 5** — tests: shared module (`thankyou-email.test.ts`, pure) + 5 hook cases in `submission-processing.service.test.ts` (auto-send tagged · source-gate · idempotency · suppression · fail-soft).

## Dev Notes
- **Why `source='public'` gate:** the referral ask ("thank you for completing your profile, share with peers") is only true/useful for people who registered THEMSELVES. Enumerator/clerk/imported rows didn't self-complete and get the 9-58 confirmation instead — so this also avoids double-emailing them.
- **Marker as metadata, not a column:** mirrors `confirmation_email_sent_at` (9-58) exactly — same JSONB-merge stamp-after-success, same erasure coverage, zero migration. The auto-send re-queries the respondent (`columns: {source, firstName, metadata}`) for the gate.
- **Fail-soft:** the hook is `void this.sendThankYouReferralEmail(...)` (fire-and-forget) + the method is fully try/caught — a registration MUST succeed even if the email doesn't (9-26 data-integrity lesson).
- **Email source:** `rawData['email']` (what the registrant provided at submit), consistent with the 9-58 confirmation. The respondent-level marker dedups regardless of email source, so no double-send with the blast.

## Dev Agent Record
- **AC1–AC5 DONE** (Amelia, dev-story 2026-06-29). Built on 13-11 (`61cf818`). Shared extraction kept the 13-11 test green; hook mirrors the proven 9-58 fire-and-forget + JSONB-marker pattern; auto/blast use distinct campaign ids; backfill unified via the shared marker. No new audit action (reuses `OPERATOR_THANKYOU_REFERRAL_SENT`) → the AUDIT_ACTIONS drift count stays 53.
- **Verification:** api tsc 0; eslint clean; shared-module + 5 hook tests green (65 in the two files); full api suite [pending in this pass].

### File List
**New:** `apps/api/src/services/thankyou-email.ts` · `apps/api/src/services/__tests__/thankyou-email.test.ts`
**Modified:** `apps/api/scripts/_thankyou-referral-blast.ts` (import shared + re-export + Task-4 marker) · `apps/api/src/db/schema/respondents.ts` (+`thankyou_referral_sent_at`) · `apps/api/src/services/submission-processing.service.ts` (hook + method) · `apps/api/src/services/__tests__/submission-processing.service.test.ts` (+5 hook cases + suppression mock)

### Review Follow-ups (AI) — code-review 2026-06-29
- [ ] [AI-Review][Low] L1 — marker is read-then-stamp (not atomic): concurrent same-respondent submissions could double-send. ACCEPTED BY DESIGN (send-then-mark favors delivery over strict-once; parity with 9-58; near-zero concurrency). No fix.
- [ ] [AI-Review][Low] L2 — recurring auto-send strengthens the case for List-Unsubscribe → routed to Story 13-13.
- [x] [AI-Review][Low] L3 — fire-and-forget may not complete on immediate worker exit (parity with 9-58) — accepted.

## Senior Developer Review (AI)

**Reviewer:** Amelia (BMAD code-review — adversarial) · **Date:** 2026-06-29 · **Outcome:** ✅ APPROVE

- **Scope:** git == File List (the 13-12 files only; phone + 13-11 committed separately — atomic).
- **Seven attack vectors probed, all held:** (1) fail-soft — whole body in `try`, `void`-fired, can't throw out or fail ingestion; (2) TOCTOU — real but accepted-by-design (send-then-mark favors delivery; parity 9-58); (3) source='public' gate correctly targets self-service + dodges the enumerator double-email; (4) shared extraction preserved the script's public API (13-11 test green, unchanged); (5) respondent-level marker dedups across the blast's and auto's different email sources; (6) both campaign tags are valid Resend tag charset → reach email_events.campaign_id; (7) the happy-path positive control makes the four gate-tests non-vacuous.
- **No defects found** — the implementation mirrors the proven 9-58 fire-and-forget + JSONB-marker pattern. 3 Lows, all documented/accepted (none a 13-12 fix); L2 reinforces Story 13-13.
- **Verification:** api tsc 0 · eslint clean · shared-module + 5 hook tests + full api suite green (2924) · no AUDIT_ACTIONS drift (reuses the 13-11 action).
- **Decision:** approved → done → batched commit (with phone `6db8e5d`) → push.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-29 | Story created + implemented (shared extraction + marker + hook + backfill unification + tests) | Amelia (dev) |
