# Handoff — Send-Ownership Triangulation → 13-24 (Bob/SM + John/PM)

**Date:** 2026-07-23
**From:** adjudication CLI (triangulation via 2 parallel Explore maps: stories/runbooks + send code, each finding cross-checked against the actual files).
**To:** **Bob (SM)** — sharpen/expand the owning story (13-24). **John (PM)** — validate + harmonize the docs. **Awwal** — develops in the working CLI. **Adjudication CLI** — verifies the result afterward (criteria at the end).
**Why now:** three stories touch one blast; before ANY real cohort is fired we need ONE authoritative owner of the actual send **sequence + cross-system dedupe**, because a real double-send window exists today.

---

## 1. Verified findings (evidence-backed — do not re-derive; extend if needed)

**Send architecture = ONE unbypassable chokepoint, MANY independent initiators.**
- Every email funnels through `EmailService.dispatch()` → `NotificationMeter.record()` (`apps/api/src/services/email.service.ts:99-124`, `notification-meter.service.ts:2-30`). Cannot be bypassed. ✅
- Initiators: 3 operator blast scripts — `_reengagement-email-blast.ts` (9-27 Part A), `_cohort-a-supplemental-survey-blast.ts` (9-28), `_thankyou-referral-blast.ts` (13-11) — plus 2 auto-sends (9-58 confirmation + 13-12 thank-you) via the shared `SubmissionProcessingService.sendRegistrationAutoEmails()` (13-21).

**What is SOLID and well-owned (leave alone):**
- **Suppression** (bounce/complaint/unsubscribe): `getSuppressedEmails()` (owned by 13-9 + 13-13). EVERY script + auto-send calls it before sending. Centralized, inherited, no conflict.
- **Metering / counted chokepoint** (9-63): unbypassable, records per-category + per-recipient frequency.
- **Campaign tagging/attribution** (13-9 + the 13-21 webhook-parse fix): done.

**THE GAP (the whole reason for this handoff): cross-system contact-dedupe is UNIMPLEMENTED.**
- Suppression only blocks bounces/complaints/unsubscribes — **NOT "we already contacted/welcomed this person."**
- Verified 3 ways:
  1. **The script:** `_thankyou-referral-blast.ts` cohort SQL = `respondents INNER JOIN submissions WHERE mlt.email IS NOT NULL` (lines 189-192); the only post-filter is `getSuppressedEmails` (line 239). It **WRITES** `metadata.thankyou_referral_sent_at` after sending (line 361) but **never READS it** to exclude already-welcomed respondents. The guard rail is written but not consulted.
  2. **The project's own tracker:** `docs/runbooks/backfill-operator-residuals.md:56` — `_thankyou-referral-blast.ts … ❓ unverified … "Overlaps 13-21 auto-send; check for double-send before firing."`
  3. Both independent Explore maps converged on it.
- **Designated owner = 13-24** (AC3: "welcome-all-116 first → ≥3–5 day gap → blast A/B/C MINUS the freshly-welcomed … dedupe is MANDATORY, not best-effort"). **Status: `ready-for-dev` — described, not built.**

**Concrete double-send scenarios possible TODAY** (all real, not hypothetical):
- Auto-send stamps the marker; the blast cohort (queried once, doesn't read the marker) includes that person → 2 emails.
- The same blast script re-run on the same day → identical cohort (suppression unchanged) → 2 emails.
- Welcome-backfill (13-24/13-21) then 13-11 blast with no cross-set exclusion → overlap double-send.

**Other true-but-secondary state:**
- **SMS (9-27 Part B) is NOT built** — only a Termii connectivity probe (`_termii-test.ts`); `NoopSmsProvider` in prod. Cross-channel email→SMS 12h-gap (9-27 AC#D) is spec-only, deferred to a future "Part D".
- **The master runbook is STALE** — `docs/runbooks/re-engagement-campaign-launch.md` (2026-06-15, pre-13-24) still describes the old 306-row A↔B dedupe, not the welcome-first + dedupe-vs-welcomed sequence.
- **No dedicated dry-run runbook exists** — "Dry-run #2" is referenced in 13-21 AC4 + 13-24 AC4 but never codified as a procedure.
- **Cohort counts disagree across artifacts** (A: 55 vs 63; B: 101 vs 267 vs 268) — they are stale snapshots; the runbook itself says "re-query at send time." The dry-run output IS the number.

---

## 2. Scope for BOB (SM) — make 13-24 the single authoritative owner and make it *implementable*

13-24 already owns the *decision*; it must now own the *implementation*. Recommend expanding its ACs to close the gap in code, not just prose:

- **AC — Inherited contact-dedupe (the durable fix, NOT a per-script patch).** A single queryable "was this address contacted by campaign X within window W" that EVERY blast (present + future SMS) consults, the same way suppression is inherited. Candidate sources already exist: the `NotificationMeter` per-recipient frequency record, or a small `campaign_sends`/marker read. **Explicitly reject the narrow "add `NOT EXISTS` to the 13-11 script only" fix** — that closes one hole and lets the next script re-open it (which is how this gap was born: 3 scripts each re-deriving a cohort).
- **AC — Auto-send-marker exclusion in the blast cohort.** As an immediate belt: the completer-blast cohort SQL must exclude `metadata->>'thankyou_referral_sent_at' IS NOT NULL` (and the confirmation marker where relevant). One-line, high-value, closes the auto-send↔blast overlap now.
- **AC — Self-enforcing sequence (gap as data, not discipline).** Welcome stamps `welcomed_at`; the blast cohort excludes `welcomed_at > now() - interval '<gap>'`. The ≥3–5 day gap enforces itself in the query — an operator can't fat-finger a filter that's in the SQL.
- **AC — Runbook update.** Replace the stale send order in `re-engagement-campaign-launch.md` with: welcome-all-116 → gap → blast(minus welcomed). Mark the old 306-row dedupe section superseded.
- **AC — Dry-run runbook.** Create `docs/runbooks/pre-blast-dry-run.md`: dry-run every script → verify counts + dedupe + suppression → ONE live positive-control send → then fire. The gate that can't be half-done.
- **AC — 13-21 scope reconciliation** (John owns the doc side; Bob should reference it): 13-24's all-116 supersedes 13-21 AC5's "recent-only."
- **AC — Regression test that RED-fails without the dedupe.** A test proving: a respondent with the auto-send marker is EXCLUDED from the blast cohort. (Adjudication will revert-check this — a dedupe with no failing test is a [[pattern-ship-a-fix-that-never-fires]] candidate.)

**Design principles to bake in (the "make it better"):** (1) make the safe path the only path — dedupe inherited, not per-script; (2) sequence as data, not runbook prose; (3) stop quoting stale cohort counts — the dry-run is the source of truth.

---

## 3. Scope for JOHN (PM) — validation + document harmonization

- **Confirm ownership:** is 13-24 the right home for the send-sequence + dedupe, or does it warrant carving a dedicated "campaign-send orchestration/dedupe" story? (Recommendation: keep it in 13-24 — it already holds the decision; splitting risks re-fragmenting.)
- **Harmonize the artifacts so they agree:**
  - `re-engagement-campaign-launch.md` — mark stale sections superseded; point to the new sequence + dry-run runbook.
  - `backfill-operator-residuals.md` — flip `_thankyou-referral-blast.ts` from "❓ unverified — check for double-send" to reference 13-24's dedupe once built; add the 13-24 welcome-backfill row.
  - Story files — 13-21 AC5 note the 13-24 supersession; stop asserting fixed cohort counts as authoritative (say "re-query at send time; dry-run output is the number").
  - `sprint-status.yaml` + `epics.md` — reflect 13-24's expanded scope; keep the index-only rule in epics.
- **Validate the sequencing decision** (welcome-first, gap length) and the dedupe being mandatory — this is a launch-safety call, not a nicety.

---

## 4. Open decisions (for Bob/John/Awwal to settle)

1. **Dedupe source of truth:** reuse `NotificationMeter` per-recipient frequency, or a dedicated `campaign_sends`/marker table? (Trade-off: reuse = less new schema; dedicated = clearer semantics + queryable per-campaign.)
2. **Gap length:** 3 or 5 days? Encode as a config/constant, not a magic number in SQL.
3. **SMS (9-27 Part B):** in-scope for launch or explicitly deferred until email response is measured? (Recommendation: defer; don't block email launch on it.)
4. **Framing option in 13-24 AC3:** true dedupe (blast MINUS welcomed) vs. "deliberate distinct follow-up" — pick one and make it explicit.

---

## 5. Adjudication criteria (what the adjudication CLI will verify afterward)

- [ ] Contact-dedupe is **implemented and inherited** (every blast consults it), not a single-script patch.
- [ ] A **test RED-fails without the dedupe** (revert the filter → an already-welcomed respondent reappears in the cohort → test fails). No silent guard.
- [ ] The **auto-send marker exclusion** is in the completer-blast cohort SQL.
- [ ] The **gap is enforced by a query filter**, not just runbook prose.
- [ ] `re-engagement-campaign-launch.md` is **no longer stale**; `pre-blast-dry-run.md` **exists**.
- [ ] 13-21↔13-24 scope reconciled in both files; residual tracker updated; sprint-status/epics parity.
- [ ] tsc + eslint + the relevant suites green; no double-send window remains under the three scenarios in §1.

---

### Provenance
Triangulation source: this session's two Explore maps + direct file verification of `_thankyou-referral-blast.ts` (cohort SQL + marker asymmetry) and `backfill-operator-residuals.md:56`. All §1 claims carry file:line evidence above.
