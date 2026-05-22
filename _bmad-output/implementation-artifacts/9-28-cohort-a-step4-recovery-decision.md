# Story 9.28: Cohort A (Step-4-dropped) supplemental questionnaire — decision + optional recovery

Status: review (Path B Phase A + Phase B code shipped 2026-05-22 — see Dev Agent Record)

<!--
Authored 2026-05-20 by Bob (SM) via canonical *create-story --yolo template.

Surfaced 2026-05-20 alongside Story 9-27 (multi-channel re-engagement for
in-progress wizard_drafts). 9-27 explicitly EXCLUDES the cohort of already-
completed wizard respondents whose Step 4 questionnaire answers were dropped
by the pre-9-26 buggy handler ("Cohort A"). 9-27 § "Why NOT communicate with
the 60 completed respondents" establishes the working baseline of "do not
contact" on audit-exposure grounds.

This story (9-28) makes that decision EXPLICIT + auditable + revisitable:

  - Documents the three available paths with trade-offs
  - Forces a single operator decision point BEFORE any implementation work
  - If Path A (status quo) chosen → story closes with documentation only
  - If Path B (Cohort A targeted recovery) chosen → implementation ACs activate
  - If Path C (universal supplemental survey) chosen → broader implementation ACs

This is INTENTIONALLY a decision-gated story rather than a pre-committed
implementation story. The trade-off between "preserve audit hygiene by
accepting silent Step 4 loss" vs "recover ~60 respondents' supplementary
survey value via transparent supplemental invitation" is a judgment call
that depends on volume, timing, and counsel review — not engineering choice.
-->

## Story

As the **Super Admin operating the OSLRS launch in active-adoption phase**,
I want **a single explicit decision-gated framework for handling the Cohort A respondents (~60+ wizard registrants whose Step 4 questionnaire answers were silently dropped by the pre-9-26 buggy handler)**,
So that **we choose ONE path — accept silent loss / target Cohort A only / broaden survey to all registrants — based on an operator-deliberated trade-off review rather than implicit default, and so that whichever path is chosen produces an auditable, NDPA-defensible record of the choice with documentation of why the rejected paths were rejected**.

## Background — what happened to Cohort A

Between 2026-05-14 (production launch) and 2026-05-20 morning (Story 9-26 Parts A/C/I deploy), the public wizard `submitWizard` handler at `apps/api/src/controllers/registration.controller.ts` silently dropped four fields from every successful wizard submission:

- `questionnaireResponses` (Step 4 survey answers)
- `gender` (Step 1 identity)
- `authChoice` (Step 5 auth preference)
- `email` was persisted to `magic_link_tokens` but NOT to `respondents`

The respondents row was created with correct identity columns (full name, DOB, NIN, phone, LGA). Magic-link login worked. Registry membership was valid. The four dropped fields were absent from `submissions.raw_data` because the handler never created a `submissions` row at all.

As of 2026-05-20 morning, Cohort A = the **60+ wizard respondents who completed registration during the 6-day buggy window**. Their identity + eligibility are intact in `respondents`. What's missing is their Step 4 supplementary survey data (workforce-planning input).

Story 9-26 Part A (commit `e95b8ec`, 2026-05-20 morning) stopped the bleed — every wizard submission since now creates a `submissions` row with full `raw_data`. Cohort A's loss is bounded.

## Three available paths

### Path A — Status quo (accept silent loss)

Cohort A is not contacted. Their Step 4 data remains unrecovered. The dropped fields were supplementary, not core PII or eligibility — registry membership is unaffected. NDPA does not require disclosure of internal data-processing issues that didn't affect data subjects' primary rights.

**Pros**:
- Zero audit exposure (no admission of internal issue)
- Zero operator cost
- Honest with the underlying ethics: the bug didn't harm data subjects, it cost the registry ~30KB × 60 ≈ 1.8MB of survey value
- Consistent with Story 9-27 § "Why NOT communicate with the 60 completed respondents"
- Documented internally in Story 9-12 § L7 + Story 9-26 for operator accountability

**Cons**:
- Permanent loss of supplementary survey value from Cohort A
- If volume continues climbing, the "60+" grows — at higher cohort sizes the trade-off shifts
- A future data subject SAR (subject access request) under NDPA may surface the gap; defense requires "supplementary not primary" framing to hold

### Path B — Cohort A targeted supplemental questionnaire invitation

Send a one-shot email to Cohort A respondents inviting them to complete a "supplemental questionnaire" via a new magic-link purpose `supplemental_survey`. Framing: "Our questionnaire has been expanded — your additional input helps Oyo State workforce planning."

**Pros**:
- Recoverable survey value (assume ~15-25% response rate × 60 = ~10-15 added Step 4 records)
- Transparent without admission (the wizard ACTUALLY had Step 4 data drop, but the invitation framing doesn't admit it — it frames as "expanded survey")
- NDPA-aligned (proactive engagement, opt-out respected)

**Cons**:
- Mild audit exposure — a recipient who notices "I thought I already answered these" creates a thread that traces back to the issue
- The framing is partly fictional — the survey isn't actually expanded
- Requires Resend Pro tier (Story 9-20 Part A)
- Requires legal counsel review before live run (NDPA-defensibility audit)

### Path C — Universal supplemental questionnaire to ALL registrants

Send the supplemental-survey email to ALL registered respondents (across all sources: public, enumerator, clerk, imported), NOT just Cohort A. Frame as a genuinely expanded survey.

**Pros**:
- Largest recovery population (current count + future registrants)
- No Cohort A targeting = zero audit exposure
- Truly transparent (the survey IS expanded as long as we add at least one new question)
- Best long-term framing for workforce-planning data collection cadence

**Cons**:
- Highest send-cost (~current 60 Cohort A + ~all enumerator-source + ~all imported)
- Requires actually adding new questions (otherwise framing is fictional)
- Operationally heavier (template approval, dry-run, audit-log)
- Requires Resend Pro tier (Story 9-20 Part A)

## Acceptance Criteria

### Part A — Operator decision (BLOCKING — no implementation until this is resolved)

1. **AC#A1 — Operator review session**: Awwal (project Builder) reviews this story's three paths + Story 9-27 § "Why NOT communicate" + Story 9-12 § L7 + Story 9-26 + current Cohort A count.

   **Cohort A size query (verified 2026-05-22 against prod)**:
   ```sql
   SELECT COUNT(*) FROM respondents r
     LEFT JOIN submissions s ON s.respondent_id = r.id
   WHERE s.id IS NULL;
   -- As of 2026-05-22 = 63. This is FROZEN (no growth since 9-26 deploy
   -- on 2026-05-20 09:00 UTC — verified zero post-deploy bleed).
   ```

   **Channel-reachability split (verified 2026-05-22)**:
   ```sql
   -- 52 of 63 have a magic-link-token row (= email-reachable).
   -- 63 of 63 have a phone_number (= SMS-reachable once 9-27 Part B ships).
   SELECT COUNT(*) AS email_reachable FROM respondents r
     LEFT JOIN submissions s ON s.respondent_id = r.id
     LEFT JOIN LATERAL (SELECT email FROM magic_link_tokens
                        WHERE respondent_id = r.id ORDER BY created_at DESC LIMIT 1) mlt ON true
   WHERE s.id IS NULL AND mlt.email IS NOT NULL;
   ```

   Earlier draft of this AC cited `metadata->>'source' = 'public'` — that was
   wrong: the real schema has `respondents.source` as a column, not a JSONB
   key. Caught in 2026-05-22 code review.

2. **AC#A2 — Optional counsel review**: if Awwal elects to consult Iris-persona AI or external NDPA counsel before deciding, capture the consultation summary inline in Dev Notes below.

3. **AC#A3 — Path decision recorded**: the chosen path (A / B / C) is recorded in this story file's Dev Agent Record with timestamp + rationale.

4. **AC#A4 — Rejected-path rationale recorded**: for each rejected path, a one-paragraph rationale is recorded in Dev Notes explaining why it was not chosen. Both for the audit trail AND for future revisitability if conditions change.

5. **AC#A5 — Status transition**: this story flips `ready-for-dev → in-progress` on path selection. If Path A chosen, the story moves to `review` (no implementation needed beyond documentation). If Path B or C chosen, ACs Part B or Part C below activate respectively.

### Part B — Cohort A targeted recovery (activates ONLY if Path B chosen in AC#A3)

6. **AC#B1 — New magic-link purpose**: extend `MagicLinkPurpose` enum at `apps/api/src/db/schema/magic-link-tokens.ts` with `supplemental_survey`. TTL: 14 days (longer than wizard_resume's 72h because supplemental surveys are lower-urgency).

7. **AC#B2 — Cohort A select query**: `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts` selects respondents matching `metadata->>'source' = 'public' AND NOT EXISTS (SELECT 1 FROM submissions WHERE respondent_id = r.id)`. Joins `magic_link_tokens` for the most recent `wizard_resume` send to retrieve the originating email.

8. **AC#B3 — Email template** (counsel-reviewed pre-live):
   ```
   Subject: A few extra questions for Oyo State Skills Registry (3 minutes)

   Hi [First Name],

   Thank you for registering with the Oyo State Skills Registry.

   We've added a short supplemental questionnaire to help Oyo State plan
   better training programs and connect residents to job opportunities
   that match their skills. Your additional input takes about 3 minutes:

     [Add my supplemental answers →]

   Participation is voluntary. If you're not interested, no action is
   needed.

   Your data continues to be protected under the Nigeria Data Protection
   Act (NDPA).

   The Oyo State Skills Registry team
   support@oyoskills.com
   ```
   - First-name personalization from `respondents.full_name`
   - Magic-link redemption lands on `/register/supplemental?token=<plaintext>`
   - **NO apology, NO admission, NO reference to incident or data loss**

9. **AC#B4 — Supplemental-survey landing page**: new route `apps/web/src/features/registration/pages/SupplementalSurveyPage.tsx` renders only the questionnaire step (re-using FormRenderer + auto-fill Pattern C from Story 9-17). On submit, writes to `submissions.raw_data` against the existing `respondents.id` with `source='supplemental'`.

10. **AC#B5 — Per-send audit log**: new `AUDIT_ACTIONS.OPERATOR_SUPPLEMENTAL_SURVEY_SENT` (audit count 41 → 42). Details capture `{respondent_id, recipient_email_masked, sent_at, channel: 'email'}`.

11. **AC#B6 — Dry-run + rate-limit discipline**: same flags as Story 9-27 Part A (`--dry-run`, `--confirm-i-am-not-dry-running`, `--rate-per-minute`, `--max-recipients`, `--since`).

12. **AC#B7 — Counsel sign-off recorded**: before live run, AC#A2 counsel review (if applicable) is referenced in the audit-log details JSONB as `counsel_review_ref`.

### Part C — Universal supplemental survey (activates ONLY if Path C chosen in AC#A3)

13. **AC#C1 — Genuinely expand the questionnaire**: at least ONE new question added to the canonical published questionnaire before any sends. Documented in Q.M. (questionnaire manager) UI with version-bump.

14. **AC#C2 — Universal select query**: same script as AC#B2 but removes the `source = 'public'` filter — all `respondents` get the invitation, scoped by `--since` for batched rollout.

15. **AC#C3 — Email template**: similar to AC#B3 but framed for universal audience (NOT specific to wizard respondents). Counsel review still required.

16. **AC#C4-C7 — Same audit / landing-page / dry-run / counsel discipline as Part B**, applied to the broader cohort.

### Part D — Memory + handover docs (always activates regardless of path)

17. **AC#D1 — Decision memory entry**: `feedback_cohort_a_disposition_decision.md` capturing the chosen path, rejected-path rationale, and date/conditions under which revisitation would be appropriate.

18. **AC#D2 — Memory index update**: under MEMORY.md "Pending Follow-Up" — `- [Cohort A disposition](feedback_cohort_a_disposition_decision.md) — operator decision on Cohort A Step-4-dropped respondents recorded YYYY-MM-DD; chosen path: <A/B/C>.`

19. **AC#D3 — Story 9-12 § L7 cross-reference**: append a one-line pointer in `_bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md` § L7 noting that Cohort A disposition is tracked in 9-28.

20. **AC#D4 — Story 9-26 cross-reference**: same in 9-26 close-out.

## Tasks / Subtasks

- [x] **Task 1 — Part A: Operator decision review** (AC: #A1-A5). Path B chosen 2026-05-22.
- [x] **Task 2 — Path B implementation** (AC: #B1-B7). Phase A + Phase B shipped 2026-05-22 — see Dev Agent Record.
- [ ] Task 3 — Path C implementation (AC: #C1-C7). N/A (Path C rejected).
- [x] **Task 4 — Part D: Memory + cross-references** (AC: #D1-D4). `feedback_cohort_a_disposition_decision.md` + MEMORY.md index entry + 9-12 §L7 + 9-26 cross-ref all landed 2026-05-22.

## Dev Notes

### Why this is a decision-gated story (load-bearing — DO NOT relocate)

The trade-off between Paths A/B/C is NOT an engineering decision. It's a product-policy + audit-defense judgment call. Pre-committing to any path in this story file would either:
- Lock in an implementation before the operator has thought through the consequences (waste of dev work if the decision flips)
- Treat the audit-exposure trade-off as if it were already settled (creates a precedent that future similar issues should auto-default to "do nothing" or "always notify")

The right pattern: separate the DECISION from the IMPLEMENTATION. This story holds the decision-gate. Implementation ACs (Part B / Part C) activate conditionally.

### Why not just contact under Story 9-27?

Story 9-27 is for **in-progress wizard_drafts** — users who haven't completed the funnel. The framing there ("complete your abandoned session") is genuinely product-marketing. Audit-safe.

Cohort A is **already-completed** registrants. The same framing doesn't fit ("complete your registration" — they did). A different framing is needed ("supplemental survey"), which carries different audit considerations. Splitting the stories preserves audit-defense clarity.

### Counsel-review checkpoint (for Path B or C)

If the operator chooses Path B or C, the email template MUST pass an NDPA-defensibility review BEFORE live send. The review question to surface to counsel: "Does sending a 'supplemental survey' email to respondents whose original Step 4 answers were silently dropped due to an internal bug, WITHOUT disclosing the bug, constitute deceptive processing under NDPA Article 6 or 7?" Document the answer + counsel ref in AC#B7.

### Cohort A size estimation

As of 2026-05-20 morning, Cohort A ≈ 60-65 respondents (per session summary). Verify via the AC#A1 query before any path selection.

### Why not target SMS or WhatsApp for Cohort A?

Email is the only channel for which we have clean recipient data (the `magic_link_tokens.email` row for each Cohort A respondent). Phone numbers exist in `respondents.phone_number` but are E.164 and require Story 9-27 Part B SMS infrastructure (not yet shipped). For Path B, email-only is the minimum-viable channel; SMS/WhatsApp can be added in a 9-28-follow-up if response rate warrants.

### Reachability (verified 2026-05-22 against prod)

| Channel | Count | Source |
|---|---|---|
| Email-reachable (`magic_link_tokens.email`) | 52 | JOIN to `magic_link_tokens` |
| Phone-only (no magic-link token) | 11 | residual |
| **Total reachable** | **63 (100%)** | |

The 11 phone-only respondents can't be reached under Path B email alone; they
need Story 9-27 Part B (SMS) or manual operator outreach to be brought into
the recovery. Path B is therefore a 52/63 = ~83% maximum recovery ceiling
in its current scope; the remaining 11 are deferred.

## Review Follow-ups (AI)

Adversarial code-review on uncommitted tree, 2026-05-22 (Claude Opus 4.7). 1 finding closed; story body refreshed to match production reality.

- [x] [AI-Review][HIGH] AC#A1 SQL incorrect — used `metadata->>'source' = 'public'` but real schema has `respondents.source` as column. Production query returned 0 rows. Fix: rewrote AC#A1 with verified-against-prod SQL + added a separate channel-reachability split query [9-28 file:81–104].

### Risks

1. **Path B framing is partly fictional** — risk of audit thread if a recipient compares notes with other respondents and notices the timing. Mitigation: counsel review (AC#B7); honest "expanded survey" if genuinely new questions are added even for Path B (i.e., merge Paths B+C in practice).

2. **Path A is permanent** — once Cohort A drafts expire or respondents lose contact, the decision is irreversible. Mitigation: document the conditions under which Path B or C could still be retroactively activated (AC#D1).

3. **Operator may defer the decision indefinitely** — if Path A is the implicit default, the decision-gate becomes vapor. Mitigation: this story stays open in `ready-for-dev` until AC#A1-A5 resolve; sprint-status entry surfaces it on every sprint review.

4. **Counsel review may not be free or quick** — if external NDPA counsel is required, this story may stall for days/weeks. Mitigation: AC#A2 makes counsel review OPTIONAL — Awwal may choose to make the decision independently with Iris-persona-AI consult, documented inline.

### Effort estimate

- **If Path A chosen**: ~30 min (documentation only)
- **If Path B chosen**: ~4-6 hours (magic-link purpose + landing page + script + tests)
- **If Path C chosen**: ~6-10 hours (above + questionnaire expansion + broader cohort handling)

### Priority

🟡 **Decision-gated — operator action required**. Not field-survey-blocking. Defers to operator judgment on timing.

## File List

(Populated by operator + dev agent during AC#A3 + Task 2/3 implementation. Expected if Path B chosen:)
- `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts` (new, one-shot)
- `apps/api/src/db/schema/magic-link-tokens.ts` (modified — new purpose)
- `apps/api/src/services/audit.service.ts` (modified — OPERATOR_SUPPLEMENTAL_SURVEY_SENT action)
- `apps/api/src/services/__tests__/audit.service.test.ts` (modified — bump count)
- `apps/web/src/features/registration/pages/SupplementalSurveyPage.tsx` (new)
- `apps/web/src/App.tsx` (modified — new route)
- `feedback_cohort_a_disposition_decision.md` (new — memory)
- `MEMORY.md` (modified — index entry)

## Dev Agent Record

### 2026-05-22 — Path decision recorded (AC#A3 satisfied)

> **Decision date**: 2026-05-22
> **Decided by**: Awwal (Builder)
> **Chosen path**: **B — Cohort A targeted supplemental questionnaire invitation**
> **Email wording**: Option 2 ("Complete your skills profile") — recommended by adversarial-review agent; honest framing (the Step 4 questionnaire genuinely IS incomplete in the system for these respondents); no apology; value-prop forward (sector-match incentive).
>
> **Rationale**: Cohort A is frozen at 63 (hemorrhage confirmed stopped post-9-26 deploy on 2026-05-20 morning). 100% of 63 reachable (52 email + 11 phone). Recovery yield estimated at ~10-15 completed Step 4 records (15-25% response × 52 reachable email subset; Path B email-only ceiling is 52/63 ≈ 83% of cohort). Audit risk acceptable under Option 2 framing — recipient's incomplete Step 4 state is a true fact about our system; no disclosure of underlying cause needed.
>
> **Rejected-path rationale**:
>   - **Path A rejected** because Cohort A is 100% reachable + frozen + Option 2 framing meets the audit-safety bar. Doing nothing wastes recoverable signal for zero gain beyond what Path B's audit-safe wording already provides.
>   - **Path C rejected** because the universal "expanded questionnaire" approach (a) requires actually adding new questions to the canonical questionnaire (operational overhead), (b) over-contacts already-complete respondents (the 50 with submissions rows since 9-26 deploy don't need this), and (c) provides no audit-defense advantage over Path B + Option 2 given the latter's truthful framing.
>
> **Counsel consult**: None (AC#A2). Builder assessed Option 2 framing as NDPA-defensible without external counsel review — the "complete your skills profile" framing is factually accurate for Cohort A respondents (their Step 4 data IS missing from the system), so no fictional/deceptive content is introduced.
> **Cohort A size at decision time**: 63 (verified 2026-05-22 via Tailscale SSH — see `_bmad-output/scratch/oslrs-cohorts-2026-05-20/SUMMARY.md`).
> **Status post-decision**: in-progress (Path B implementation began this session).

### Path B implementation plan (12 files / 3 phases)

**Phase A — Backend (~2 hours)**: `magic-link-tokens.ts` enum extension, `magic-link.service.ts` TTL + copy, `audit.service.ts` new action `OPERATOR_SUPPLEMENTAL_SURVEY_SENT` (count 41→42), `audit.service.test.ts` count bump, `_cohort-a-supplemental-survey-blast.ts` script + tests.

**Phase B — Frontend + submit endpoint (~3-4 hours)**: new `submitSupplementalSurvey` controller handler + route, `MagicLinkLandingPage` purpose-dispatch update, new `SupplementalSurveyPage`, `App.tsx` route, tests.

**Phase C — Close-out (~1 hour)**: BMAD code review + auto-fix + commit + push + CI verify.

### 2026-05-22 — Phase A + Phase B shipped (same session)

**Implemented by**: Claude Opus 4.7 (this session).
**Phase A files (6)**: `magic-link-tokens.ts` (enum extended), `magic-link.service.ts` (TTL 14d + Option 2 copy), `audit.service.ts` (`OPERATOR_SUPPLEMENTAL_SURVEY_SENT`), `audit.service.test.ts` (count 41→42), `_cohort-a-supplemental-survey-blast.ts` (script with `DISTINCT ON` query, KNOWN_FLAGS typo defense, --help, Resend Pro fail-fast, hostname + invocation in audit forensic), `_cohort-a-supplemental-survey-blast.test.ts` (30 tests).
**Phase B files (6)**: `registration.controller.ts` (new `submitSupplementalSurvey` handler — atomic consume+write transaction, idempotency check, `SUPPLEMENTAL_SURVEY_FORM_ID` sentinel constant), `registration.routes.ts` (new POST `/supplemental`), `magic-link.api.ts` (frontend type extended), `supplemental-survey.api.ts` (new), `SupplementalSurveyPage.tsx` (new — TanStack Query + FormRenderer + Option 2 framing), `App.tsx` (new route), `MagicLinkLandingPage.tsx` (purpose dispatch updated), `SupplementalSurveyPage.test.tsx` (5 tests).
**Tests**: 30 backend script + 5 frontend page + 38 existing audit + 12 existing MagicLinkLandingPage = 85 tests pass; tsc clean on api + web; zero regressions.
**ACs met**: A1-A5 (decision recorded), B1-B6 (Path B activated + implemented), D1 partial (memory entry pending Phase C close-out commit).
**Operator-gated next steps**:
1. CI deploy lands the commit (~6-7 min)
2. Live dry-run on prod via Tailscale: `tsx scripts/_cohort-a-supplemental-survey-blast.ts --dry-run` (expect 52 reachable Cohort A recipients of the 63 frozen)
3. Resend Pro tier check (cohort is 52 — under the 80-cap threshold, so `--confirm-resend-pro-active` not strictly required, but recommended for headroom)
4. Live blast: `tsx scripts/... --confirm-i-am-not-dry-running --rate-per-minute 10`

## Review Follow-ups (AI)

Two adversarial review passes on the uncommitted tree, both 2026-05-22 (Claude Opus 4.7).

### Pass 1 — inline self-review during build

- [x] [AI-Review][MEDIUM] Magic string `'supplemental-survey'` for `submissions.questionnaireFormId`. **FIXED**: extracted into `SUPPLEMENTAL_SURVEY_FORM_ID` constant near the schema [registration.controller.ts:95-99].

### Pass 2 — formal BMAD `/bmad:bmm:workflows:code-review` workflow

11 findings (2 HIGH + 5 MEDIUM + 4 LOW). All auto-fixed in-session.

#### HIGH

- [x] [AI-Review][HIGH] **H1** — Part D ACs (D1-D4) unfinished — memory file + index entry + cross-references in 9-12 and 9-26 not done. **FIXED**: created `feedback_cohort_a_disposition_decision.md` (full disposition rationale + revisitation conditions), added MEMORY.md index entry, added §L7 lesson to Story 9-12, added "Cohort A disposition cross-reference" section to Story 9-26.
- [x] [AI-Review][HIGH] **H2** — `SupplementalSurveyPage.tsx` form-fetch ERROR fell through to "no form configured" empty state (confusing wrong message). **FIXED**: distinct `supplemental-fetch-error` branch with retry-prompt copy; `formQuery.isError` checked before the legitimate `!form` empty state [SupplementalSurveyPage.tsx:99-110].

#### MEDIUM

- [x] [AI-Review][MEDIUM] **M3** — 409 idempotency response didn't include the existing submissionUid. **FIXED**: replaced `throw AppError` with explicit `res.status(409).json({status, error, data: {existingSubmissionUid}})` so the frontend can show "you're already done — confirmation: X" instead of a bare error toast [registration.controller.ts:739-747].
- [x] [AI-Review][MEDIUM] **M4** — Stale-closure risk in `submitMutation.mutationFn`. **FIXED**: mutationFn now accepts `(payload)` argument; `onComplete` calls `submitMutation.mutate(all)` directly; the `responses` component-state is removed [SupplementalSurveyPage.tsx:36-44, 154-162].
- [x] [AI-Review][MEDIUM] **M5** — No backend integration tests for `submitSupplementalSurvey`. **FIXED**: 5 new tests in `registration.routes.test.ts` covering 400 invalid input / 400 token-no-respondent / 404 respondent-not-found / 409 already-submitted (with existingSubmissionUid assertion) / 201 happy path (with audit-log assertion). Added `mockSubmissionsFindFirst` to test scaffolding. `mockConsumeTokenTx` verified NOT called on the 409 path. Total `registration.routes.test.ts` count: 25 → 30 tests.
- [x] [AI-Review][MEDIUM] **M6** — No `aria-live` on success / error transitions (accessibility). **FIXED**: success card body wrapped in `role="status" aria-live="polite"`; error card carries `role="alert" aria-live="polite"` [SupplementalSurveyPage.tsx:55-69, 170-176].
- [x] [AI-Review][MEDIUM] **M7** — `MagicLinkLandingPage` switch default fall-through silently routed unknown future purposes to `/register/complete-nin`. **FIXED**: explicit case for `pending_nin_complete`; default uses TS `never`-exhaustiveness check that fails compile-time if a new `MagicLinkPurpose` variant is added without a handler [MagicLinkLandingPage.tsx:208-225].

#### LOW

- [x] [AI-Review][LOW] **L8** — `respondent.consentMarketplace` / `consent_enriched` could be null in raw_data for legacy respondents. **FIXED**: `?? false` defensive defaults applied [registration.controller.ts:769-770].
- [x] [AI-Review][LOW] **L9** — `source: 'public'` for supplemental submissions indistinguishable from canonical wizard submissions in source-bucket analytics. **FIXED**: added `campaign: 'cohort_a_supplemental_survey'` field to `raw_data` so analytics can split [registration.controller.ts:773-776].
- [x] [AI-Review][LOW] **L10** — Reference UUID (36 chars) shown to user is ugly. **FIXED**: truncated to first-8-chars on display; full UUID retained on `title` attribute for support-ticket cross-reference [SupplementalSurveyPage.tsx:57-63].
- [x] [AI-Review][LOW] **L11** — No explicit double-click guard on submit. **FIXED**: page-level guard via `submitMutation.isPending || submitMutation.isSuccess` short-circuit in `onComplete` [SupplementalSurveyPage.tsx:158-162].

### Pass 3 — proactive scope-tightening (Awwal directive 2026-05-22)

- [x] [AI-Review][LOW→FIXED-NOW] Idempotency check was scoped to "ANY submission for this respondent" — over-broad. **Awwal asked: "Can we assume that the idempotency check will be triggered so that we are already prepared regardless?"** Reasoning: asymmetric downside (broad check → enumerator/clerk submission permanently blocks supplemental recovery for that respondent; no recovery path). Cost of fix tiny (~10 min, 1 `and()` clause + 1 test case). **FIXED**: scope-tightened to `AND questionnaireFormId = SUPPLEMENTAL_SURVEY_FORM_ID` so unrelated submission rows don't block. New test pins the contract: respondent with a non-supplemental submission still successfully completes the supplemental [registration.controller.ts:739-770 + registration.routes.test.ts:715-744].

No outstanding deferred items remaining.

### Out-of-scope finding — Story 9-29 candidate

- 🚨 **`respondents.first_name` / `last_name` are swapped relative to Western convention** — Yoruba/Nigerian users entering full names as "Akinola Oluwaseun" (surname-first) cause `registration.controller.ts:486-495` to store the surname in `first_name`. All 113 production respondents are affected. Personalization in this story's email + page uses `respondents.first_name` — produces a polite/formal Yoruba surname greeting which Awwal explicitly accepted in 2026-05-22 dry-run review. Follow-up Story 9-29: split the wizard "Full Name" input into "Given name" + "Family name" fields and backfill respondents.

### Final test posture

- 129 API tests (38 audit + 31 routes + 30 reengagement + 30 supplemental script)
- 17 web tests (12 MagicLinkLandingPage + 5 SupplementalSurveyPage)
- **Total: 146 tests, all pass**
- TSC clean on api + web
- Zero regressions
- Zero deferred items remaining
