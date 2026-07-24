# Pre-Blast / Pre-Send Dry-Run Runbook

**The canonical procedure for safely verifying ANY prod send or registration path before firing at scale.** Referenced by 13-21 AC4, 13-24 AC4/AC5, and reusable for the 13-4 enumerator go-live smoke. If you are about to `--apply` a blast, run to a person's inbox at volume, or fire a new collection path — do this first.

> **The one rule:** never `--apply` (or open a channel at scale) before BOTH (a) a `--dry-run` whose numbers you have sanity-checked, AND (b) ONE live positive-control send/registration proven end-to-end. A truncated or misfiring send "looks done" — the positive control is what turns "should work" into "did work on one real case."

This is a **gate that cannot be half-done**: every box below is checked, or you do not fire.

---

## 0. Before anything — state check
- [ ] Confirm the correct target: prod DB `oslsr_db` on the VPS (`ssh root@100.93.100.28` → `docker exec oslsr-postgres psql -U oslsr_user -d oslsr_db`). Read-only first.
- [ ] Record the **baseline counts** you expect to restore to if this is a test: `SELECT count(*) FROM respondents;` + `SELECT count(*) FROM submissions;`. Write them down.
- [ ] Confirm capacity: for email at volume, **Resend Pro must be active** (free tier = 100/day silently truncates). For SMS, Termii sender-ID approved.

## 1. Script dry-run (the `--dry-run` pass)
Every blast script supports `--dry-run` (lists who WOULD be sent; sends nothing). Scripts: `_reengagement-email-blast.ts` (9-27A), `_thankyou-referral-blast.ts` (13-11), `_cohort-a-supplemental-survey-blast.ts` (9-28), `_backfill-registration-autosends.ts` (13-24 welcome). **All four print an `excluded: suppressed=N, contacted-within-Nd=N` line — that output IS the cohort size (13-24 AC5 iii); never quote a count from a doc.**
- [ ] Run `pnpm tsx apps/api/scripts/<script>.ts --dry-run` for the script you intend to fire.
- [ ] **Counts:** the would-send count is the SOURCE OF TRUTH — not any number in a story/CSV (those are stale snapshots that disagree). Sanity-check it against your mental model; a surprise (much bigger/smaller) means investigate before firing.
- [ ] **Suppression applied:** the dry-run log reports how many addresses were skipped via `getSuppressedEmails` (bounce/complaint/unsubscribe). Confirm the filter ran.
- [ ] **Contact-dedupe applied — ✅ ENFORCED IN CODE since 2026-07-23 (Story 13-24).** No manual
      cross-check needed: every cohort builder calls the shared `filterMarketingCohort()`, which drops
      anyone contacted within `MARKETING_CONTACT_GAP_DAYS` (5). **Verify it FIRED** by reading the
      dry-run's own exclusion line — each script prints
      `excluded: suppressed=N, contacted-within-5d=N`. If you expected overlap with a recent send and
      that number is 0, STOP and investigate (a 0 could mean the deploy predates 13-24, or the
      `campaign_sends` write is failing — check for `campaign_contact.record_failed` in the logs).
      A cohort that is EMPTY because everyone was recently contacted is a correct outcome, not a bug.
- [ ] **No silent cap:** confirm the run is not capped below the true cohort (`--max-recipients` is opt-in; default is uncapped — but verify the log's total matches the cohort).

## 2. Positive-control live send (Dry-run #2)
Prove the go-forward pipe on exactly ONE real case before the mass send. If it's broken, you find out on 1 person, not 116 half-sent.
- [ ] **For the welcome/auto-send pipe:** do ONE fresh public registration end-to-end (see the proven recipe in §5), using a mailbox YOU control. Confirm on the box: the respondent's `metadata` carries `confirmation_email_sent_at` + `thankyou_referral_sent_at`, and BOTH emails actually arrived in your inbox (render + links work).
- [ ] **For a blast script:** run `--apply` with `--max-recipients 1` targeting a controlled address, and confirm delivery + the correct campaign tag on the Resend dashboard.
- [ ] **LEDGER-LIVENESS — the dedupe's positive control (13-24 review M1). MANDATORY.** The `campaign_sends` write is deliberately FAIL-SOFT (a ledger error never blocks a send), which means a missing or unwritable table degrades the dedupe to a silent no-op — it would exclude nobody and the double-send this whole system prevents would ship looking "done" ([[pattern-ship-a-fix-that-never-fires]]). "No `campaign_contact.record_failed` in the logs" is NOT proof it wrote. Prove a row EXISTS after the positive-control marketing send above:
  ```sql
  SELECT count(*) AS n, max(sent_at) AS latest
  FROM campaign_sends
  WHERE email = lower(trim('<your control address>'))
    AND sent_at > now() - interval '15 minutes';
  ```
  `n` MUST be ≥ 1 with a fresh `latest`. If it is 0: STOP — the table is missing (confirm `db:push:force` created it on prod: `\d campaign_sends`) or the write is failing (grep logs for `campaign_contact.record_failed`). Do NOT run the mass send until a control row appears — an empty ledger means every blast cohort is UN-deduped.
- [ ] Watch the monitor signals during the control send: `registration_autosend.failure` / `registration_autosend.alert_paged` (Telegram) + the `NotificationMeter` counters + the Resend dashboard.

## 3. Fire (`--apply`)
- [ ] Re-run `--dry-run` immediately before (cohorts drift daily) — the number may have moved.
- [ ] `pnpm tsx apps/api/scripts/<script>.ts --apply --confirm-i-am-not-dry-running --rate-per-minute 10` (rate-limit protects sender reputation on a fresh domain).
- [ ] Watch `registration_autosend.failure`/`.alert_paged` + the Resend dashboard live. Stop if failures climb.
- [ ] Record the actual sent count + campaign_id for attribution (`ReportService.getCampaignFunnel(campaignId)`).

## 4. Sequencing (multi-send launches)
When more than one send is involved (welcome + blast), the order is **enforced by data, not memory** (13-24): welcome-all → `MARKETING_CONTACT_GAP_DAYS` gap → blast built MINUS the freshly-welcomed (the `campaign_sends` filter). Do NOT fire the blast inside the gap window. The stale manual sequence in `re-engagement-campaign-launch.md` is SUPERSEDED — follow 13-24.

> **Know which guarantee is carrying the load (2026-07-24 review nuance).** "Blast MINUS welcomed" is held by THREE mechanisms, and only one is time-limited:
> 1. **Permanent — the marker.** A welcomed completer is excluded from the thank-you blast by `metadata.thankyou_referral_sent_at` (cohort SQL), regardless of how much time passes. This covers the main welcome↔blast overlap.
> 2. **Structural — cohort disjointness.** Reengagement = drafts (no respondent row → the welcome never reaches them; Cat1 drops completed); Cohort A = no-submission (never gets the marketing thank-you, only a transactional confirmation). See the "DISJOINTNESS INVARIANT" comments in `_reengagement-email-blast.ts` / `_cohort-a-supplemental-survey-blast.ts`.
> 3. **Time-windowed — the `campaign_sends` ledger (backstop).** Excludes anyone contacted **within the last `MARKETING_CONTACT_GAP_DAYS`**. This is what catches a **blast re-run** and a **same address landing in two different marketing cohorts** — but ONLY if the two sends happen within the gap window of each other.
>
> **Operational consequence:** because the gap constant (5d) equals the sequencing wait, the ledger will NOT be excluding the welcomed cohort by the time you fire the blast after the gap — mechanisms (1)/(2) are what keep them out then, by design. Therefore: **fire ALL blasts in one session (back-to-back)** so each later cohort is built after the earlier send's ledger rows exist. Do NOT spread the blast scripts across sessions **more than `MARKETING_CONTACT_GAP_DAYS` apart** expecting the ledger alone to dedupe across them — past the window it won't, and mechanisms (1)/(2) only cover their specific overlaps. If cohort definitions ever change (breaking the disjointness invariant), this residual widens — re-review before firing.

## 5. Test-artifact cleanup (proven recipe — 13-34 dry-run, 2026-07-23)
If your positive control created a TEST registration, remove it and restore the baseline. Delete **child-first, in one transaction**; the FK children of a respondent are `submissions` (→ `fraud_detections`), `marketplace_profiles`, `magic_link_tokens`:
```sql
BEGIN;
DELETE FROM fraud_detections WHERE submission_id IN (SELECT id FROM submissions WHERE respondent_id = '<RID>');
DELETE FROM marketplace_profiles WHERE respondent_id = '<RID>';
DELETE FROM magic_link_tokens   WHERE respondent_id = '<RID>';
DELETE FROM submissions          WHERE respondent_id = '<RID>';
DELETE FROM respondents          WHERE id = '<RID>';
COMMIT;
```
- [ ] **Do NOT delete the user account** if the test authenticated to a real, pre-existing account (check `users.created_at` — if it predates today, it's real; leave it).
- [ ] **`audit_logs` is append-only** — a DB trigger (`audit_logs_immutable()`) rejects DELETE and will roll back the whole transaction. Do NOT include audit rows in the delete; the 1–2 audit rows referencing the test respondent are harmless historical records (`target_id` has no FK). Leave them.
- [ ] **Verify restore:** `respondents` + `submissions` counts back to the §0 baseline; the test NIN/email is gone; no orphaned `marketplace_profiles`; the real account intact.

## 6. Final gate — do not fire unless ALL are true
- [ ] `--dry-run` count sanity-checked against expectation (and it IS the number, not a stale doc).
- [ ] Suppression + contact-dedupe confirmed APPLIED (13-24, enforced in code) — the dry-run's `excluded:` line was read, not assumed.
- [ ] ONE positive-control send/registration proven end-to-end on a controlled inbox.
- [ ] Capacity confirmed (Resend Pro / Termii sender-ID).
- [ ] Monitoring in view (`registration_autosend.*`, Resend dashboard) for the live run.
- [ ] Test artifacts (if any) cleaned + baseline restored.

---

### Provenance
Codified 2026-07-23 from the proven 13-34 public-registration dry-run + teardown (real prod, counts restored 144/81) and the send-ownership triangulation (`docs/handoff-2026-07-23-send-ownership-triangulation.md`). **Updated 2026-07-23 (13-24 dev):** the §1 dedupe-verify step is no longer a manual cross-check — the `campaign_sends` ledger + shared `filterMarketingCohort()` landed, so the step is now "read the dry-run's `excluded:` line and confirm the guard fired." Satisfies 13-24 AC5(ii).
