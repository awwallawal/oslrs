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
3. **AC3 — Anti-whiplash sequencing (the keystone).** A documented send order that guarantees no person gets BOTH the welcome and the 13-11 blast within a minimum window: (a) welcome-backfill to all 116 first (the first re-engagement touch); (b) a ≥3–5 day gap; (c) the 13-11 blast audience is built as cohorts A/B/C **MINUS** the freshly-welcomed emails (explicit dedupe/suppression across the two systems), or framed as a deliberate distinct follow-up. The dedupe step is mandatory, not best-effort.
4. **AC4 — Dry-run #2 (email positive control) before the mass send.** A fresh public registration on `pubcore-1` sets `confirmation_email_sent_at` + `thankyou_referral_sent_at` and delivers both emails (mirror of the 13-19/20 Dry-run #1 negative control), proving the go-forward pipe works BEFORE the 116-send. Verified on the box.
5. **AC5 — Documentation straightened.** `docs/runbooks/re-engagement-campaign-launch.md` (the campaign hub) carries the full ordered sequence: Pro → Dry-run #2 → welcome-backfill(all 116) → gap → deduped blast; plus the AC5-scope correction note and the 13-21 auto-send monitor signals (`registration_autosend.failure/.alert_paged`) as monitored during the send.

## Tasks / Subtasks
- [ ] **Task 1 (AC1, AC5)** — reconcile 13-21 AC5 scope (all-116, not date-gated) in both story files; no code change to the backfill (send-to-all is already its behaviour).
- [ ] **Task 2 (AC3, AC5)** — write the ordered send sequence + the mandatory cross-system audience dedupe (welcomed emails excluded from the 13-11 blast list) into the campaign runbook.
- [ ] **Task 3 (AC4)** — operator: Dry-run #2 on the box (fresh reg → both markers + delivery), verified via Tailscale.
- [ ] **Task 4 (AC2)** — operator: confirm Resend Pro live, then `_backfill-registration-autosends.ts --dry-run` → review the 116 list → `--apply --confirm-i-am-not-dry-running --rate-per-minute 10`.

## Dev Notes
- **Mostly ops + docs, minimal/no code.** The backfill script (13-21 AC5) already sends to all eligible with idempotency + suppression + rate-limit; this story is the DECISION + SEQUENCING + runbook, not new send logic. The one code-ish item is ensuring the 13-11 blast audience build **excludes the welcomed emails** (a query/list filter, wherever the blast list is assembled).
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

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-10 | Story drafted via *create-story — coordinated welcome send to ALL real registrants (116) + anti-whiplash blast sequencing + Resend-Pro gating + Dry-run #2 + doc straightening. Supersedes 13-21 AC5's recent-only framing (operator decision: promotional email isn't time-bound). EMERGENT from the 13-21 backfill dry-run. | Bob (SM) |
