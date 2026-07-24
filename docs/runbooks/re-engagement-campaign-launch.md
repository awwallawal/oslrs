# Re-engagement & Recovery Campaign — Launch Runbook

**Single entry point** for firing the Cohort A (data-loss recovery) + Cohort B (stalled-draft re-engagement) campaigns once the stories ship and the Resend/Termii accounts are live. This is the hub; the story files and scripts are the spokes. If you only read one doc before sending, read this one.

> ⚠️ **The numbers below are a 2026-06-15 snapshot. DO NOT treat the Desktop CSVs as the send list.** The blast scripts re-query the live DB at send time (cohorts drift daily as drafts arrive/complete/expire). The CSVs are **planning/audit artifacts only.** Regenerate counts at send time.
>
> ✅ **UPDATED 2026-07-23 — the 13-24 dedupe is BUILT; §2 now carries the correct ordered sequence.** The historical stale sections are marked inline. Background: a 2026-07-23 send-ownership triangulation found a VERIFIED double-send gap — the blast scripts check suppression (bounce/complaint/unsubscribe) but NOT "already contacted/welcomed" — `_thankyou-referral-blast.ts` writes `thankyou_referral_sent_at` but never reads it, so auto-welcomed completers get blasted again. **Story 13-24 closed it in CODE**: an email-keyed `campaign_sends` ledger written at the single send chokepoint (`EmailService.dispatch`, marketing categories) plus a shared `filterMarketingCohort()` that EVERY cohort builder inherits — so the gap is enforced by the query, not by operator discipline. **§2 below is the authoritative ordered sequence** (Pro → Dry-run #2 → welcome-all-116 → 5-day gap → blast). §1's counts are a stale 2026-06-15 snapshot kept for history — **the live `--dry-run` output is the only number you may quote.** Fire via `docs/runbooks/pre-blast-dry-run.md`. Detail: `docs/handoff-2026-07-23-send-ownership-triangulation.md`.

---

## 0. State banner (update on every touch)

| Gate | Status (2026-06-15) |
|------|---------------------|
| Stories: 9-58 (reference code), 9-27 A (email blast), 9-27 B (SMS), 9-28 (Cohort A) | 9-27A capability shipped; 9-28 capability shipped (review); 9-27B scope-authored (not built); 9-58 **in-progress** |
| 9-58 reference-code **backfill run on prod** | ⏳ pending (needs 9-58 done + deploy) |
| **Resend Pro** live | ⏳ pending (operator) |
| **Termii** account + **registered sender ID** | ⏳ pending (operator — long lead, see §3) |
| A↔B dedup fix in Cohort B blast | ✅ **SHIPPED 2026-07-23 (13-24)** — superseded by the inherited cross-system dedupe (§2) |
| Cross-system contact-dedupe (`campaign_sends` + shared filter) | ✅ **built 13-24** — needs deploy before firing |
| 13-24 welcome backfill (all emailable registrants) | ⏳ pending (operator — after Pro + Dry-run #2) |
| Blast templates carry reference code + anti-phishing line | ⏳ pending (9-58 dep, see §7) |
| **Campaign fired** | ❌ not yet |

---

## 1. Audience (2026-06-15 snapshot — HISTORICAL, do not quote)

> These counts are frozen and known to disagree with later snapshots. They are kept for narrative
> context only. **The live `--dry-run` output is the send list and the number** (13-24 AC5 iii).

Two distinct populations (different tables — do not conflate):

- **Cohort A = `respondents` flagged `metadata.questionnaire_data_lost`** — completed the wizard pre-2026-05-20 but lost their Step-4 answers to the hemorrhage (fixed by 9-26). **Recovery** = ask them to re-answer.
- **Cohort B = non-expired `wizard_drafts`** not already completed — started the public wizard, never finished. **Re-engagement** = nudge to finish.

| | Count | Notes |
|---|---:|---|
| Cohort A total | **55** | all `public` source; all have a phone |
| ↳ email-reachable | **46** | has a magic-link email |
| ↳ phone-only (SMS) | **9** | no email; all have phone + NIN |
| Cohort B total (non-expired, not-completed) | **268** | all email-reachable (email is the draft key); 0 expired; 21 excluded as already-completed |
| ↳ Step 4+ ("90% done") | **217** | the big stall |
| ↳ Step 1-3 ("just started") | **51** | smaller, lowest sunk cost |
| **Deduped master send-plan** | **306** | see §1.1 |

### 1.1 Deduped master (the authoritative send-plan)
Raw 55 + 268 = 323 → **306** after dedup (17 removed):
- **16** Cohort B drafts dropped — their email also belongs to a Cohort A `data_lost` person who re-started a draft. Routed to **Cohort A recovery** instead (prevents two conflicting emails).
- **1** internal Cohort A email duplicate.

Master breakdown by `template`:

| template | rows | channel |
|---|---:|---|
| `A_supplemental_email` | 45 | email (9-28) |
| `A_supplemental_sms` | 9 | SMS (9-27 B) |
| `B_reengage_90pct_email` | 203 | email (9-27 A) |
| `B_reengage_saved_email` | 49 | email (9-27 A) |
| **Total** | **306** | 297 email + 9 SMS |

_Snapshot CSVs (PII — keep local, delete after outreach): `cohort-master-send-plan.csv`, `cohort-a-email.csv`, `cohort-a-phone.csv`, `cohort-b-stalled-step4.csv`, `cohort-b-stalled-early.csv` (Desktop, 2026-06-15)._

---

## 2. Dependency chain — THE ORDERED SEQUENCE (authoritative, Story 13-24)

This replaces the 2026-06-15 "Cohort A email → Cohort B email → SMS" ordering in §5, which predates
the welcome send and had no cross-system dedupe.

```
1. Resend Pro LIVE                      (13-24 AC2 — the free 100/day cap would silently truncate
                                         the welcome to an arbitrary 100 and look "done")
2. Dry-run #2 — email positive control  (13-24 AC4 — ONE fresh registration on the box proves the
                                         go-forward auto-send pipe BEFORE the mass send)
3. WELCOME backfill — ALL emailable real registrants
       apps/api/scripts/_backfill-registration-autosends.ts
                                        (13-21 AC5 + 13-24 AC1 — send-to-all, NOT date-gated)
4. ── GAP: 5 days ──                    (MARKETING_CONTACT_GAP_DAYS; enforced by the cohort query,
                                         not by you remembering. You do not have to count the days —
                                         a blast fired too early simply excludes the welcomed.)
5. BLAST(s), deduped automatically
       _reengagement-email-blast.ts  /  _cohort-a-supplemental-survey-blast.ts  /  _thankyou-referral-blast.ts
6. SMS (9-27 Part B)                    — DEFERRED (not built; does not gate the email launch)
```

**How the dedupe works (so you can trust it rather than re-checking by hand).** Every successful
marketing send writes a `campaign_sends` row keyed by the recipient's email, at the one chokepoint
all sends pass through. Every blast cohort builder then calls the shared `filterMarketingCohort()`,
which drops (a) suppressed addresses (bounce/complaint/unsubscribe, 13-9/13-13) and (b) anyone
contacted within the gap window. Consequences worth knowing:

- Running a blast twice in the same week sends to **nobody** the second time. That is correct, not a bug.
- A completer already thanked by the 13-12 auto-send is out of the thank-you blast (both via the
  ledger and via the `metadata.thankyou_referral_sent_at` check now in that cohort's SQL).
- Cohort B (`wizard_drafts`, no respondent row) is covered too — the key is the address, not the respondent.
- The welcome backfill inherits the same filter in reverse: if a blast just reached someone, their
  welcome waits for the next run rather than stacking.

Do **not** fire before the 9-58 reference-code backfill — every email/SMS should carry the
recipient's application number (recognition + anti-phishing). See
`docs/runbooks/reference-code-backfill.md`.

**Counts honesty (13-24 AC5 iii).** Every script's `--dry-run` now prints its exclusions
(`excluded: suppressed=N, contacted-within-5d=N`). **That output is the cohort size.** The snapshot
counts in §1 and §5 disagree with each other (Cohort A 55 vs 63; Cohort B 101 vs 267 vs 268) because
they are frozen historical numbers — quote the dry-run, never a doc.

---

## 3. Operator account setup

### 3.1 Resend Pro (email — gates 9-27 A + 9-28)
- [ ] Upgrade Resend Free → **Pro** (resend.com → Settings → Billing; ~$20/mo, 50k/mo).
- [ ] Confirm `oyoskills.com` domain verified (DKIM/SPF green) — send a test from the Resend console.
- [ ] Confirm the VPS `.env` Resend key is the Pro account's key.
- [ ] Record "Resend Pro active since 2026-MM-DD" in MEMORY.md Production Deployment + flip 9-20 Part A.

### 3.2 Termii (SMS — gates the 9 phone-only + any future SMS)
- [ ] **⏳ LONG LEAD — start early:** register a **sender ID** with Termii. Nigerian SMS requires an *approved* alphanumeric sender ID; approval takes **days**. Begin this before you think you need it or the SMS cohort stalls on launch day.
- [ ] Termii account + API key → VPS `.env` (the `sms.service.ts` HttpSMSProvider is already Termii-shaped — zero code change for config).
- [ ] Confirm Termii balance/credits (≈₦2/SMS; the 9 phone-only ≈ ₦18, trivial; the broader 9-27 B cohort ≈ ₦556).
- [ ] **9-27 Part B is scope-authored but NOT built** — the SMS blast script + short-link infra + STOP opt-out webhook must be implemented before this path is usable.

---

## 4. Pre-flight checklist (the gate — all must be ✅ before firing)

- [ ] 9-58 done + deployed; **reference codes backfilled on prod** (dry-run reviewed first).
- [ ] Blast `buildEmail()` updated to render the reference code + the anti-phishing line ("we will never ask for your password or NIN by email") + the `oyoskills.com/check-registration` link (see §7 + 9-58 Dev Notes for the copy).
- [x] **Cross-system contact-dedupe** — ✅ SHIPPED in code (Story 13-24): `campaign_sends` ledger +
      the shared `filterMarketingCohort()` every cohort builder inherits. Nothing manual to apply.
      The old manual A↔B CSV dedup in §7.1 is SUPERSEDED.
- [ ] **Sequence gates (13-24):** Resend Pro live → Dry-run #2 passed → welcome backfill run → 5-day gap.
      Run the whole thing through `docs/runbooks/pre-blast-dry-run.md` — it is the gate that can't be half-done.
- [ ] Phone numbers `+234`-normalized for the SMS cohort (eyeball the 9 rows).
- [ ] Resend Pro live (§3.1) / Termii live + sender ID (§3.2) for the channel you're firing.
- [ ] `--dry-run` executed and the masked recipient list reviewed for EACH script.
- [ ] Rate limit chosen (`--rate-per-minute`, e.g. 10).
- [ ] PII files handled per §8.

---

## 5. Send procedure (per bucket, over Tailscale on the VPS)

Every script: run `--dry-run` first, review, THEN re-run with the live-confirm flag.

| Bucket | Script | Cohort selected live | Live flag |
|---|---|---|---|
| `B_reengage_*` (252 email) | `apps/api/scripts/_reengagement-email-blast.ts` | non-expired drafts, not-completed; 2 templates by `current_step` | `--confirm-i-am-not-dry-running` |
| `A_supplemental_email` (45) | `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts` | `data_lost` + magic-link email, no submission | `--confirm-i-am-not-dry-running` |
| `A_supplemental_sms` (9) | 9-27 Part B SMS script (**build first**) | `--cohort cohort-a-phone-only` | `--confirm-i-am-not-dry-running` + Termii confirm |

⚠️ **The bucket counts in this table are the frozen 2026-06-15 snapshot — do not quote them.** Run each
script's `--dry-run` and read the live number (plus its `excluded:` line) at send time.

~~Recommended order: Cohort A email → Cohort B email → SMS~~ — **SUPERSEDED by §2.** The order is now
welcome → 5-day gap → blasts, and the A-vs-B (and welcome-vs-blast, and blast-vs-rerun) dedupe is
enforced in the cohort query rather than by send ordering.

---

## 6. Post-send

- [ ] Reconcile sends against the master `source_id` column; record sent/bounced per `template`.
- [ ] Measure completion lift on the **9-19 dashboard** (Step-4 stall %, daily completions) per template — this is how you know the copy worked.
- [ ] SMS: confirm the **STOP / opt-out** webhook is recording `OPERATOR_SMS_OPT_OUT_RECEIVED` and honored on re-sends.
- [ ] Every send already audits per-recipient (existing blast discipline) — spot-check the audit log.

---

## 7. Known fixes to land BEFORE firing

1. ~~**A↔B double-contact (the production fix).**~~ ✅ **CLOSED 2026-07-23 by Story 13-24** — and closed more broadly than this item asked: the shared `filterMarketingCohort()` excludes anyone contacted within `MARKETING_CONTACT_GAP_DAYS` from EVERY cohort, so A↔B, welcome↔blast, auto-send↔blast and blast-re-run are all covered by one inherited filter instead of a per-script `NOT EXISTS`. Historical description follows. ~~ The Cohort B blast (`_reengagement-email-blast.ts` `selectCohort`) excludes only *completed* registrants (Cat1) — **not `data_lost`** ones. So a `data_lost` person who re-started a draft is in BOTH cohorts and gets two conflicting emails (16 such people on 2026-06-15). **Fix:** add to `selectCohort`'s `conditions` a `NOT EXISTS` that drops any draft whose email matches a `data_lost` respondent's magic-link email — so the live B blast is deduped without a manual CSV step.~~ (Original follow-up on Story 9-27; no longer needed.)
2. **Reference code + anti-phishing copy.** `buildEmail()` in BOTH email scripts (and the SMS copy) should take an **optional** `referenceCode` and render the application-number block only when present (non-breaking). Reworded copy + rationale in **9-58 Dev Notes §"Split recommendation + blast-template dependency."**

---

## 8. PII handling

The snapshot CSVs hold full contact PII (name, phone, NIN, email) for 100s of people. Treat per NDPA: **keep local, never email/upload, delete after the outreach completes.** This is precisely the at-rest exposure the 9-58 "status-to-channel" design avoids — don't undo it by scattering these files.

---

## Links
- Stories: `9-20-pre-viral-capacity-prep.md` (Resend Pro), `9-27-multi-channel-reengagement.md` + `9-27-part-b-sms-via-termii.md`, `9-28-cohort-a-step4-recovery-decision.md`, `9-58-public-registration-status-check-and-reference-code.md`.
- Scripts: `apps/api/scripts/_reengagement-email-blast.ts`, `_cohort-a-supplemental-survey-blast.ts`.
- Trackers: `docs/pending-operator-actions.md` (Resend/Termii), `_bmad-output/implementation-artifacts/sprint-status.yaml` (9-27/9-28 dependency flags).
- Companion runbooks: **`docs/runbooks/pre-blast-dry-run.md` (fire through this)**, `docs/runbooks/reference-code-backfill.md`, `docs/runbooks/pre-viral-push-checklist.md`.
- Dedupe internals: `apps/api/src/services/campaign-contact.service.ts` (`MARKETING_CONTACT_GAP_DAYS`, `filterMarketingCohort`), `apps/api/src/db/schema/campaign-sends.ts`; regression proof `apps/api/scripts/__tests__/blast-cohort-dedupe.integration.test.ts`.
- Story: `13-24-coordinated-welcome-send-and-blast-sequencing.md`; handoff `docs/handoff-2026-07-23-send-ownership-triangulation.md`.

---
_Created 2026-06-15. Consolidates the cohort analysis + deduped 306-row send-plan from the 2026-06-15 session so the campaign can be fired cold (fresh context) without reassembling scattered notes. Keep the §0 state banner current._

_Updated 2026-07-23 (Story 13-24 dev): §2 replaced with the authoritative ordered sequence + how the inherited dedupe works; §4/§5/§7.1 reconciled; counts-honesty rule added (quote the dry-run, not this doc)._
