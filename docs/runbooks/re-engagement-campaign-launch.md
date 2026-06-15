# Re-engagement & Recovery Campaign — Launch Runbook

**Single entry point** for firing the Cohort A (data-loss recovery) + Cohort B (stalled-draft re-engagement) campaigns once the stories ship and the Resend/Termii accounts are live. This is the hub; the story files and scripts are the spokes. If you only read one doc before sending, read this one.

> ⚠️ **The numbers below are a 2026-06-15 snapshot. DO NOT treat the Desktop CSVs as the send list.** The blast scripts re-query the live DB at send time (cohorts drift daily as drafts arrive/complete/expire). The CSVs are **planning/audit artifacts only.** Regenerate counts at send time.

---

## 0. State banner (update on every touch)

| Gate | Status (2026-06-15) |
|------|---------------------|
| Stories: 9-58 (reference code), 9-27 A (email blast), 9-27 B (SMS), 9-28 (Cohort A) | 9-27A capability shipped; 9-28 capability shipped (review); 9-27B scope-authored (not built); 9-58 **in-progress** |
| 9-58 reference-code **backfill run on prod** | ⏳ pending (needs 9-58 done + deploy) |
| **Resend Pro** live | ⏳ pending (operator) |
| **Termii** account + **registered sender ID** | ⏳ pending (operator — long lead, see §3) |
| A↔B dedup fix in Cohort B blast | ⏳ pending (see §7) |
| Blast templates carry reference code + anti-phishing line | ⏳ pending (9-58 dep, see §7) |
| **Campaign fired** | ❌ not yet |

---

## 1. Audience (2026-06-15 snapshot)

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

## 2. Dependency chain (the order of operations)

```
stories done  →  9-58 reference-code backfill (prod)  →  Resend Pro live  →  fire EMAIL cohorts
                                                       →  Termii live + sender ID  →  fire SMS cohort
```

Do **not** fire before the reference-code backfill — every email/SMS should carry the recipient's application number (recognition + anti-phishing). See `docs/runbooks/reference-code-backfill.md`.

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
- [ ] **A↔B dedup applied** (see §7) so the 16 overlap aren't double-contacted.
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

Recommended order: **Cohort A email → Cohort B email → SMS** (so the A-vs-B dedup is naturally enforced if you exclude A's emails from B — but prefer the code fix in §7).

---

## 6. Post-send

- [ ] Reconcile sends against the master `source_id` column; record sent/bounced per `template`.
- [ ] Measure completion lift on the **9-19 dashboard** (Step-4 stall %, daily completions) per template — this is how you know the copy worked.
- [ ] SMS: confirm the **STOP / opt-out** webhook is recording `OPERATOR_SMS_OPT_OUT_RECEIVED` and honored on re-sends.
- [ ] Every send already audits per-recipient (existing blast discipline) — spot-check the audit log.

---

## 7. Known fixes to land BEFORE firing

1. **A↔B double-contact (the production fix).** The Cohort B blast (`_reengagement-email-blast.ts` `selectCohort`) excludes only *completed* registrants (Cat1) — **not `data_lost`** ones. So a `data_lost` person who re-started a draft is in BOTH cohorts and gets two conflicting emails (16 such people on 2026-06-15). **Fix:** add to `selectCohort`'s `conditions` a `NOT EXISTS` that drops any draft whose email matches a `data_lost` respondent's magic-link email — so the live B blast is deduped without a manual CSV step. (Capture as a one-line follow-up on Story 9-27.)
2. **Reference code + anti-phishing copy.** `buildEmail()` in BOTH email scripts (and the SMS copy) should take an **optional** `referenceCode` and render the application-number block only when present (non-breaking). Reworded copy + rationale in **9-58 Dev Notes §"Split recommendation + blast-template dependency."**

---

## 8. PII handling

The snapshot CSVs hold full contact PII (name, phone, NIN, email) for 100s of people. Treat per NDPA: **keep local, never email/upload, delete after the outreach completes.** This is precisely the at-rest exposure the 9-58 "status-to-channel" design avoids — don't undo it by scattering these files.

---

## Links
- Stories: `9-20-pre-viral-capacity-prep.md` (Resend Pro), `9-27-multi-channel-reengagement.md` + `9-27-part-b-sms-via-termii.md`, `9-28-cohort-a-step4-recovery-decision.md`, `9-58-public-registration-status-check-and-reference-code.md`.
- Scripts: `apps/api/scripts/_reengagement-email-blast.ts`, `_cohort-a-supplemental-survey-blast.ts`.
- Trackers: `docs/pending-operator-actions.md` (Resend/Termii), `_bmad-output/implementation-artifacts/sprint-status.yaml` (9-27/9-28 dependency flags).
- Companion runbooks: `docs/runbooks/reference-code-backfill.md`, `docs/runbooks/pre-viral-push-checklist.md`.

---
_Created 2026-06-15. Consolidates the cohort analysis + deduped 306-row send-plan from the 2026-06-15 session so the campaign can be fired cold (fresh context) without reassembling scattered notes. Keep the §0 state banner current._
