# Story 13-24: Coordinated registration-welcome send (all real registrants) + blast sequencing — no double-contact

Status: ready-for-dev

<!-- Authored 2026-07-10 by Bob (SM) via *create-story. EMERGENT from the 13-21 AC5 backfill dry-run (prod 2026-07-10): the pool of public respondents missing the confirmation + thank-you/referral is 141 (116 with resolvable emails), NOT the handful the AC5 wording implied ("Modupe + post-13-12 completers"). ~135 registered in a May soft-launch. Operator (Awwal) decision: a thank-you/referral is promotional, NOT time-bound, so gating out the 135 is a disservice to the programme — send the welcome to ALL real registrants. This story owns (a) the send-to-all decision + its guardrails, (b) the sequencing against the 13-11 re-engagement blast so overlapping people never get whiplash, (c) the Resend-Pro gating, and (d) straightening the docs (13-21 AC5 scope + the campaign runbook). It supersedes 13-21 AC5's narrow "recent-only" framing. -->

## Story
As **the launch operator**,
I want **the registration welcome (confirmation + thank-you/referral) to reach EVERY real registrant, sequenced so nobody also gets the re-engagement blast in the same window**,
so that **the programme acknowledges all registrants + activates the referral loop, without double-contacting people and burning goodwill/sender-reputation right at launch.**

## Context & Evidence (prod-verified 2026-07-10)
- **The backfill pool is the whole historical public cohort, not a handful.** `_backfill-registration-autosends.ts --dry-run`: **141** public respondents missing ≥1 auto-send marker; **116** have a resolvable email (0 test, 0 suppressed). Date split: **135 in May 2026** (soft-launch), 3 June, 3 July.
- **The 3 genuinely-recent organic registrants** (post-13-12, which shipped ~2026-07-01): **Kolade Apata** (bonarock01@yahoo.ca, 07-02), **Modupe Adesina** (dupsy5@gmail.com, 07-06), **Yusuf Moshood** (atandayusuf170@gmail.com, 07-07). (June's Islamiat Ige has NO email → unreachable.)
- **Operator decision (Awwal, 2026-07-10):** do NOT date-gate. The thank-you/referral is promotional and not time-bound; withholding it from the 135 May registrants is a disservice. Send the welcome to **all 116**.
- **Volume vs. capacity:** 116 × 2 = **232 emails**. Resend free tier is 100/day → the all-116 send REQUIRES **Resend Pro** (the same $20 gate the blast waits on). So this is a coordinated launch send, not a today-run. Pro is being purchased.
- **Whiplash risk:** the 116 overlap the 13-11 blast cohorts (A/B/C). The welcome backfill and the 13-11 blast are SEPARATE systems — nothing currently dedupes their audiences, so an uncoordinated pair of sends would hit the same inbox twice near launch.

## Acceptance Criteria
1. **AC1 — Send-to-all decision recorded + AC5 scope corrected.** The 13-21 AC5 "Modupe + post-13-12 completers" framing is superseded: the welcome goes to ALL 116 emailable real registrants (idempotent, suppression-honored, test-rows excluded — the existing `_backfill-registration-autosends.ts` already does this; NO date filter is added). Record the reconciliation in 13-21 + this story.
2. **AC2 — Resend-Pro gating explicit.** The all-116 run is blocked until Resend Pro is active (else the 100/day free cap truncates it). The runbook states this; the operator confirms Pro before `--apply`.
3. **AC3 — Cross-system contact-dedupe: IMPLEMENTED and INHERITED (the keystone). ⚠️ RE-SCOPED 2026-07-23 from the send-ownership triangulation** (`docs/handoff-2026-07-23-send-ownership-triangulation.md`). The dedupe is **CODE, not a manual per-run list filter** — the original 2026-07-10 framing ("a query/list filter, wherever the blast list is assembled") is INSUFFICIENT: the send is fragmented across 3 independent blast scripts (`_reengagement-email-blast.ts` / `_cohort-a-supplemental-survey-blast.ts` / `_thankyou-referral-blast.ts`), each re-deriving its own cohort SQL, so a per-script filter is re-forgotten by the next script — which is exactly how this gap arose. Requirements:
   - **(a) A durable, queryable contact record keyed by EMAIL** — a dedicated `campaign_sends` marker written on EVERY marketing send (the welcome backfill + all 3 blasts). Keyed by email (NOT respondent metadata): Cohort B is `wizard_drafts` with NO respondent row, so a `respondents.metadata` marker cannot dedupe it — the key must be the email. (Chosen over reusing the Redis meter's per-recipient frequency: clearer per-campaign semantics, transactional, queryable.)
   - **(b) A SHARED cohort filter every blast INHERITS** — exactly as all three already inherit `getSuppressedEmails()`. Every blast cohort excludes any address contacted within the gap window (AC6). Adding a new blast in future gets the dedupe for free; it is NOT re-implemented per script.
   - **(c) Closes BOTH races the triangulation found**, not just welcome↔blast: also the **auto-send↔blast race** — `_thankyou-referral-blast.ts` today WRITES `metadata.thankyou_referral_sent_at` (:361) but never READS it, so an auto-welcomed completer is still in the blast cohort. The shared filter (via the email-keyed `campaign_sends`) must exclude them.
   The dedupe is **MANDATORY, not best-effort**, and "framed as a deliberate distinct follow-up" is NO LONGER an accepted escape hatch (per the ruling: true dedupe, blast MINUS welcomed).
4. **AC4 — Dry-run #2 (email positive control) before the mass send.** A fresh public registration on `pubcore-1` sets `confirmation_email_sent_at` + `thankyou_referral_sent_at` and delivers both emails (mirror of the 13-19/20 Dry-run #1 negative control), proving the go-forward pipe works BEFORE the 116-send. Verified on the box.
5. **AC5 — Documentation straightened + a dedicated dry-run runbook created.** (i) Update `docs/runbooks/re-engagement-campaign-launch.md`: mark the STALE 2026-06-15 send-order + the old 306-row A↔B dedupe section **SUPERSEDED**, and carry the full ordered sequence: Pro → Dry-run #2 → welcome-backfill(all 116) → GAP → deduped blast; plus the 13-21-scope correction note and the auto-send monitor signals (`registration_autosend.failure/.alert_paged`) watched during the send. (ii) **CREATE `docs/runbooks/pre-blast-dry-run.md`** — the canonical Dry-run procedure that 13-21 AC4 + this AC4 both reference but which does not exist: dry-run every script → verify counts + dedupe + suppression → ONE live positive-control send → then fire; a gate that cannot be half-done. (iii) **Counts honesty:** every doc quotes the LIVE dry-run output as the source of truth for cohort sizes — NOT the stale snapshots (which disagree: Cohort A 55 vs 63, Cohort B 101 vs 267 vs 268). Stop asserting fixed numbers ("don't assert a count you don't own").
6. **AC6 — Gap-as-data + a RED-failing regression test (no double-send survives).** The gap is enforced by the AC3 shared filter as a **named constant** (e.g. `MARKETING_CONTACT_GAP_DAYS = 5`), not operator discipline — an operator cannot skip a filter that lives in the cohort SQL. A **regression test proves the exclusion FIRES**: seed an address with a recent `campaign_sends` contact → assert it is ABSENT from every blast cohort; revert the filter → it re-appears (the test RED-fails). All three double-send scenarios in the triangulation brief §1 (auto-send↔blast, blast re-run, welcome↔blast overlap) must be closed. A dedupe with no failing test is a [[pattern-ship-a-fix-that-never-fires]] candidate and fails adjudication.

## Tasks / Subtasks
- [ ] **Task 1 (AC1)** — reconcile 13-21 AC5 scope (all-116, not date-gated) in both story files; no code change to the backfill (send-to-all is already its behaviour).
- [ ] **Task 2 (AC3, AC6) — CODE (the re-scope):** add a `campaign_sends` marker (schema + migration, keyed by email + campaign + sent_at) recorded on EVERY marketing send (welcome backfill + all 3 blasts, at/around the existing `getSuppressedEmails` point so it's inherited the same way); a shared `excludeRecentlyContacted(emails, gapDays)` filter applied to ALL 3 blast cohort builders (not per-script bespoke); the `thankyou_referral_sent_at`-marker exclusion on the completer blast; `MARKETING_CONTACT_GAP_DAYS` constant. + the RED-failing regression test (seeded contact → excluded; revert → re-appears).
- [ ] **Task 3 (AC5) — docs:** update `re-engagement-campaign-launch.md` (mark stale sections superseded; new ordered sequence) + CREATE `docs/runbooks/pre-blast-dry-run.md` + counts-honesty pass (live dry-run = source of truth). Flip `backfill-operator-residuals.md:56` note once the dedupe lands.
- [ ] **Task 4 (AC4)** — operator: Dry-run #2 on the box (fresh reg → both markers + delivery), verified via Tailscale.
- [ ] **Task 5 (AC2)** — operator: confirm Resend Pro live, then `_backfill-registration-autosends.ts --dry-run` → review the 116 list → `--apply --confirm-i-am-not-dry-running --rate-per-minute 10`.

## Dev Notes
- **⚠️ 2026-07-23 RE-SCOPE — this is NOW a code story, not "ops + docs only."** The original framing ("minimal/no code; the dedupe is a query/list filter wherever the blast list is assembled") was shown INSUFFICIENT by the send-ownership triangulation: the send is 3 independent blast scripts + 2 auto-sends, and a per-run manual filter re-fragments (the very cause of the gap). The backfill's send-to-all behaviour is unchanged; what's NEW is the **inherited cross-system contact-dedupe** (AC3/AC6) — a `campaign_sends` marker + a shared filter every blast consults, closing the auto-send↔blast race the original story didn't even mention.
- **Why email-keyed, not respondent-metadata:** the auto-send guard (`respondents.metadata.thankyou_referral_sent_at`) can't dedupe **Cohort B** — those are `wizard_drafts` with NO respondent row. The dedupe key must be the EMAIL, in a shared `campaign_sends` record, so all cohorts (drafts + respondents) are covered by one filter.
- **SMS (9-27 Part B) is explicitly DEFERRED** (decision 2026-07-23) — do NOT block email launch on it. But design the shared filter so a future SMS blast inherits the dedupe for free (same as suppression), rather than re-deriving it.
- **The backfill script (13-21 AC5) already sends to all eligible** with idempotency + suppression + rate-limit — that part is untouched; this story adds the dedupe layer + sequencing + docs around it.
- **Why send-to-all is right:** promotional/thank-you email is not time-bound; the 135 May registrants got zero acknowledgement and the referral ask has value whenever it lands. The only real risks are capacity (→ Pro) and double-contact (→ AC3 dedupe) — both handled by sequencing, not by excluding people.
- **Reputation:** 232 emails on a fresh sender domain — the 10/min rate-limit + verified domain + these being opt-in registrants keeps it safe; monitor the 13-21 `registration_autosend.failure` signal + the Resend dashboard during the run.
- **Not a hard registration blocker**, but it IS the launch's re-engagement mechanism — do it as part of the coordinated launch send, gated on Pro.

### References
- [Source: apps/api/scripts/_backfill-registration-autosends.ts — the AC5 send-to-all backfill (idempotent + suppression + rate-limit)]
- [Source: 13-21 (auto-send fix + monitor); 13-11 (re-engagement blast); 13-12 (evergreen thank-you); 13-9 (suppression)]
- [Source: docs/runbooks/re-engagement-campaign-launch.md — the campaign execution hub to update]
- [Source: prod 2026-07-10 — 141 pool / 116 emailable / 135 May; recent 3 = Kolade/Modupe/Yusuf]

## Dev Agent Record
### File List

## PM Validation (John, 2026-07-10)

**Validated — approved. Launch-relevant (the re-engagement mechanism), ops-led, gated on Resend Pro.**

1. **The send-to-all call is right, and AC3 is what makes it safe.** Awwal's framing is correct — a thank-you/referral isn't time-bound, so excluding 135 real registrants is lost programme value. The ONLY things that made me hesitate on the original backfill were capacity and double-contact; both are solved by *sequencing*, not exclusion. So: send to all 116, but AC3's cross-system dedupe (welcomed emails OUT of the blast list) + the ≥3–5 day gap is non-negotiable — that's the difference between "coordinated launch" and "spammed our whole list twice."
2. **Resend Pro gating (AC2) is a hard precondition** — a truncated 100/day send would silently deliver to an arbitrary 100 and look "done." Confirm Pro, then the full run.
3. **Dry-run #2 (AC4) before the mass send, not after.** Prove the go-forward auto-send pipe on one fresh registration first; if it's broken we find out on 1 person, not discover 116 half-sent.
4. **Scope correction (AC1) matters for honesty** — 13-21 AC5 said "recent completers"; reality + this decision is "all real registrants." Straighten both story files + the runbook so the next operator isn't confused.
5. **Sequence vs the other launch items:** this rides AFTER Public Core is finalized (done) and Pro is live; it's independent of 13-22/13-23 (which are the data/attribution track). Fine to run in parallel with those being dev'd.

**No AC changes.** Dev-ready (ops-led).

## PM Validation (John, 2026-07-23 — re-scope review)

**Re-scope APPROVED. The 2026-07-10 "ops-led, no-code" classification is withdrawn — this is now a code story and must go through dev + adversarial review + the RED-test before any operator send.**

1. **The re-scope is justified by evidence, not preference.** The double-send gap was verified three ways (the script's own cohort SQL, the residual tracker's `❓ check for double-send` flag, both Explore maps). The original AC3 "manual list filter" would have left the **auto-send↔blast race entirely unaddressed** — the original story didn't even name it. Correcting this before firing is exactly the point of the triangulation.
2. **Email-keyed `campaign_sends` is the correct primitive, and I want it written at the CHOKEPOINT, not per-script.** Bob's Cohort-B argument is decisive (drafts have no respondent row, so metadata can't dedupe them). BUT the marker must be recorded where suppression/metering already are (the shared send path), NOT bolted onto each of the 3 scripts — otherwise it inherits the same fragmentation it's meant to cure. Adjudication should check the WRITE is centralized, not just the read.
3. **The RED-failing test (AC6) is non-negotiable and is the real gate.** "13-24 says dedupe is mandatory" and "dedupe fires on real data" are different artifacts; only the revert-to-red test proves the second. This is the story most about not-annoying real people at launch — a silent guard here is the worst place for [[pattern-ship-a-fix-that-never-fires]].
4. **SMS deferral (Part B) endorsed** — do not block email launch on unbuilt SMS; the inherited-filter design means the future SMS blast gets dedupe for free, so deferring costs nothing.
5. **Counts-honesty (AC5 iii) is a real fix, not polish** — a truncated or stale-cohort send "looks done." Live dry-run output as the single source of truth is the honest bar.
6. **Sequencing note:** this now sits AFTER dev+review (the code) and Pro-live, and still rides after Public Core (done). It is no longer parallelizable-as-pure-ops — the code lands first, then the operator steps (Tasks 4–5).

**AC changes: AC3 re-scoped, AC5 expanded, AC6 added.** Dev-ready (code + ops).

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-10 | Story drafted via *create-story — coordinated welcome send to ALL real registrants (116) + anti-whiplash blast sequencing + Resend-Pro gating + Dry-run #2 + doc straightening. Supersedes 13-21 AC5's recent-only framing (operator decision: promotional email isn't time-bound). EMERGENT from the 13-21 backfill dry-run. | Bob (SM) |
| 2026-07-23 | **RE-SCOPE from the send-ownership triangulation** (`docs/handoff-2026-07-23-send-ownership-triangulation.md`). AC3 changed from a documented manual list-filter to an IMPLEMENTED, INHERITED cross-system contact-dedupe (email-keyed `campaign_sends` marker + a shared filter every blast consults like `getSuppressedEmails`), now explicitly closing the auto-send↔blast race the original missed. AC5 expanded (create the missing `pre-blast-dry-run.md` + counts-honesty). AC6 added (gap-as-data named constant + RED-failing regression test; the 3 double-send scenarios must be closed). Dev Notes corrected ("no-code" → code story; email-keyed because Cohort-B drafts have no respondent row). SMS/9-27-Part-B deferred; 5-day gap constant; true dedupe (blast MINUS welcomed, no "distinct follow-up" escape hatch) — decisions resolved to recommendation (Awwal, "do everything here"). John PM re-validated (approved; want the marker WRITE centralized at the chokepoint + the RED-test as the gate). Authored + validated in the adjudication CLI per Awwal's instruction; DEV + adjudication still to follow. | Bob (SM) + John (PM) |
