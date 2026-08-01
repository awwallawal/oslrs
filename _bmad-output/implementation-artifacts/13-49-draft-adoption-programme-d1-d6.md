# Story 13-49: Draft-adoption programme (D1-D6) — turn 292 abandoned drafts into registry records

Status: ready-for-dev

<!-- EMERGENT 2026-08-01 from the 13-46 AC11 investigation. What began as "can old drafts safely resume?"
     uncovered that `wizard_drafts` holds 37 distinct answer keys across 214 drafts — names, NINs,
     occupations, skills, household and business data for people who never pressed submit. Awwal
     overruled the initial "invite them to resume" recommendation on the grounds that Story 9-28 had
     ALREADY set the precedent (63 respondents pushed straight into the registry), and that asking
     someone 70-80% complete to restart looks unprofessional. This story implements that ruling. -->

## Story

As **the Ministry, holding a registry of 145 people and a database of 292 abandoned registrations that
contain most of what those people already told us**,
I want **every draft adjudicated to a disposition and the qualifying ones adopted into the registry with
their OSLRS number issued and explained**,
so that **the register reflects the people who actually engaged — roughly doubling it from data already
held — instead of deleting that data when the drafts expire.**

## Context & Evidence (measured on prod, read-only, 2026-08-01)

### What is actually in the drafts

| Metric | Value |
|---|---|
| Drafts | **292** (all have email AND phone) |
| Carrying ≥1 answer | **214** |
| Distinct answer keys | **37** |
| Answering `consent_basic = yes` | **203** |
| Expire | ~~2026-08-31 → 09-29~~ → **2026-11-30 → 12-29** (AC1 done) |

### ⚠️ Identity lives in the QUESTIONNAIRE, not the head-step fields

These drafts were filled when identity was asked *inside* the form. Today's wizard collects it in
dedicated Basics/Contact steps. So:

| Field | `formData.<head step>` | `questionnaireResponses` |
|---|---|---|
| given name | **8 drafts** | `firstname` — **208** |
| surname | — | `surname` — **209** |
| NIN | 126 | `nin` — **185** |

**A backfill that reads `formData.givenName` will find it populated in 8 of 292 rows and silently produce
near-empty records.** Read the questionnaire keys, falling back to head-step fields.

### ⚠️ Resolve a draft to a person by ALL FOUR contact sources

Contact data is spread across four tables (handoff §3c). Matching by NIN alone resolves **28** drafts to an
existing respondent; matching by NIN → `magic_link_tokens.email` → `users.email` resolves **48**. The
20-row difference is **10 duplicate registry records that would have been created and 10 enrichable
records that would have been missed.** `magic_link_tokens` (283 rows / 138 distinct emails) is the most
complete contact source in the database and the one a NIN-only query cannot see.

### The precedent this rests on

Story **9-28** pushed **63** respondents straight into the registry with no `submissions` row — they are
145's second component (145 = 82 with submissions + 63 absorbed). Adopting draft data and *telling* the
person is therefore an established, Ministry-accepted disposition, not a novel one. **22 of those 63 have a
matching draft** whose answers can now backfill a record that was created bare.

### Why doing nothing is not neutral

~~The drafts **expire 2026-08-31**.~~ ✅ **Extended 2026-08-01 to 2026-11-30 (AC1 done, `UPDATE 292`).** Data that 203 people consented to give would otherwise have been deleted on that date.

## Acceptance Criteria

1. **AC1 — Expiry extended FIRST.** ✅ **DONE 2026-08-01 — `UPDATE 292`.** Earliest expiry
   **2026-08-31 → 2026-11-30**, latest 09-29 → 12-29, and **0 drafts expire within 45 days** (was 3).
   Executed ahead of the rest of the story deliberately: losing this dataset to a deadline while planning
   how to use it would have been the worst available outcome, and the change is one reversible `UPDATE`.
2. **AC2 — Disposition is operator-decided, not inferred.** The programme runs from the reviewed
   `docs/vps-snapshots/draft-triage-2026-08-01.xlsx` `DECISION` column. The script READS that column and
   refuses to act on any row whose decision is blank or unrecognised. A recommendation is not a decision.
3. **AC3 — D1 Adopt (142).** Complete + consented + not already registered → create respondent +
   submission from the questionnaire answers, mint the OSLRS reference code, spread ALL answer keys into
   `raw_data` (including the 22 Master-only orphans — they are data the shorter form no longer collects).
4. **AC4 — D2 Enrich (22).** Matches one of the 63 → **UPDATE the existing record, never create a second.**
   Backfill the answers onto it; do not re-issue a reference code. 17 of the 22 also supply a name.
5. **AC5 — D3 Adopt-pending (20).** Name + phone + LGA but no NIN → adopt with `status = nin_unavailable`
   (35 respondents already hold that status) and enrol in the **existing** 9-12 pending-NIN ladder.
6. **AC6 — D4 Invite (74).** 67 have **no name at all** — they cannot be registered and **no OSLRS number
   exists to send them**. They receive an INVITATION only (copy in Dev Notes), never a welcome.
7. **AC7 — Consent is actionable ONLY when `yes`, guarded in code, with an audited super-admin toggle**
   (revised 2026-08-01 by Awwal; supersedes "hard immutable exclude"). The script adopts and contacts on
   `consent = yes` and **refuses** on `no` even if the spreadsheet says otherwise — a sheet is editable, a
   guard is not. But the state itself is **changeable through one controlled path**: a per-respondent
   super-admin toggle (**13-44 AC-A2**) that REQUIRES a free-text reason and writes an `audit_logs` row with
   actor + before/after + reason. Never bulk. Consent genuinely changes — someone says yes by phone, or
   withdraws later — and for NDPA-regulated consent the recorded reason IS the evidence of their
   instruction. The citizen's own self-service toggle (`me.controller.ts:45-67`) remains the primary path.
8. **AC8 — D6 Ignore (26).** Already full respondents. No action, no message, no duplicate.
9. **AC9 — Message set per adopted person:** OSLRS number confirmation + welcome + thank-you/referral +
   magic link to **amend** their registration. All through `EmailService.dispatch` so the `campaign_sends`
   ledger and suppression list apply.
10. **AC10 — DRY-RUN GATE (blocking).** `--dry-run` prints per-cohort counts and the exact mutations for
    **one** named record without writing. Then `--apply --max 1` on a single real record, verified end to
    end — record created, reference code minted, all four messages delivered, magic link opens an
    **amendable** registration — BEFORE the batch. Everything in the 2026-07/08 sessions that broke did so
    on its first real execution; this is a write path against citizen records.
11. **AC11 — Reversible.** Every created/updated row carries `metadata.adopted_by = '13-49'` +
    `adopted_at`, so the entire programme can be identified and rolled back by that marker alone.
12. **AC12 — Observability.** Emit counts to the ops digest and the 13-44 admin view (see Dev Notes
    "Tracking"), so adoption is watchable without a DB query.

## Dev Notes

### The cohorts (post four-source correction)

| Cohort | Who | n | Action |
|---|---|---|---|
| **D1 Adopt** | complete + consented + new | **142** | create + OSLRS no. + 4 messages |
| **D2 Enrich** | matches one of the 63 | **22** | UPDATE existing; no new record |
| **D3 Adopt-pending** | name+phone+LGA, no NIN | **20** | create `nin_unavailable` + ladder |
| **D4 Invite** | 7 thin + 67 nameless | **74** | invitation only — no OSLRS number |
| **D5 Exclude** | `consent_basic = no` | **8** | hard-guarded; no contact |
| **D6 Ignore** | already full respondents | **26** | nothing |

**Registry impact: 145 → ~307**, with 22 bare records enriched.

### ❗ What the 82 non-adoptable actually means (D4 + D5)

**None of the 82 can EVER be auto-adopted, no matter how long we sequence.** 67 of them have **no name** —
there is no person to create a record for, only an email and a phone. A month of reminders buys
*conversions* (they come back and finish), not eventual auto-adoption. Plan the messaging accordingly: the
goal for D4 is a click, not a countdown.

### 📈 Email outreach WORKS — do not plan as if it doesn't

The 9-12 pending-NIN ladder is the only measured outreach we have, and it reads:
**113 created → 78 promoted → 35 residue = 69% conversion**, every dispatch to `primary_email`.
The 35 that remain are the residue *after three reminders* (2d/7d/14d), not evidence that email fails.
⚠️ **Those 35 have EXHAUSTED the ladder** — a fourth generic NIN reminder is not the lever. The OSLRS-number
+ welcome framing in AC9 is a genuinely different ask, which is why it may move people the reminder did not.

### Messages

**Adopted (D1/D2/D3)** — confirmation, not invitation. Lead with the number; the ask is verification, not work:
> Your Oyo State Skilled Labour Register number is **{{reference_code}}**.
> We had your registration details on file and have completed your entry.
> **[Review or update my details]** — check anything is wrong, or add what's missing.
> {{thank-you + referral link}}

**D4 Invite (74)** — neutral on fault, specific about effort, states what to have ready:
> **Subject: Your Oyo Skills registration is still open — 2 minutes to finish**
>
> You started registering on the Oyo State Skilled Labour Register and we have your contact details saved.
> The registration was never completed, so your record is not yet active.
>
> This may have been a network interruption or simply a busy moment — either way, your place is still held.
>
> **[Continue my registration]**
>
> It takes about two minutes. You'll need your NIN, your LGA, and your trade or occupation.
> Once complete you'll receive your OSLRS number and be listed for skills programmes and opportunities.
>
> If you'd prefer not to continue, no action is needed and your details will be removed when the
> registration expires.

**Phone-only (7 respondents registry-wide):** templates already exist — **13-11 AC6 Dev Notes**, sent
manually from the OSLRS phone, tagged `utm_source=referral-sms`. ⚠️ **Only 7 people in the whole registry
are email-less** (138 of 145 are reachable by email from some source), so **Termii sender-ID is NOT on this
programme's critical path** — MEMORY's "26 true phone-only" is stale.

### Tracking — what exists, and what this changes

| Story | Status | Covers |
|---|---|---|
| **13-9** | done | tagging, suppression, `campaign_sends`, funnel — the attribution substrate |
| **13-44** | ready-for-dev | super-admin campaign observability UI: per-campaign funnel, contact log, ledger-liveness banner |
| **13-42** | ready-for-dev | ops-digest data-integrity signals that fire on the real defect delta |

**A tracking story exists — 13-44 — and it is the right home. What changes is its SCOPE:** 13-44 was written
for *campaign* observability (blasts). This programme adds **registry-adoption** observability, which is a
different question: how many adopted / enriched / pending-NIN / invited-not-yet-returned, and is the
programme still converting. **Recommend extending 13-44 with an adoption panel rather than minting a new
story** — it already owns the admin surface, the contact log and the ledger banner. This story emits the
counts (AC12); 13-44 renders them; 13-42 alerts on the delta (e.g. adoption emits but `campaign_sends` does
not grow → the ledger is failing again).

### Impact on Epic 12 / Story 12-4 — its taxonomy is invalidated by this programme

**We do NOT have one large table holding all respondent data from every source.** What exists is
`registry_unified` — a **VIEW** (145 rows; `respondent_id, lga_id, source, status, nin, metadata,
consent_marketplace, consent_enriched, created_at, raw_data`) that is respondent-anchored over
`respondents ⟕ submissions` (Story 13-33). It is a unified **READ**, not a unified store, and it currently
sees only people who are already respondents.

**It does NOT see:** the **292 `wizard_drafts`** (this story's subject), the 11-2 import spine
(ITF-SUPA / ASNAT), or 13-2 association imports. So "unified registry" today means "one canonical way to
count registered people", not "every source in one place".

**What 13-49 changes for 12-4 — three things:**
1. **12-4's headline numbers are already stale.** Its story states `139 = 76 completed + 55 data_lost +
   7 no_submission + 1 pending_nin`; the registry is now **145 = 82 with submissions + 63 absorbed**.
   Re-derive before building — do not inherit the count (the recurring failure of these sessions).
2. **The `data_status` taxonomy needs a new bucket.** After adoption there will be respondents whose data
   came from a draft rather than a submission or an enumerator: `adopted_from_draft`. Without it, 142 people
   land in whichever bucket the query happens to put them, and the dashboard mislabels them exactly as
   12-4 exists to stop.
3. **Good news: no schema change.** 13-49 writes real `respondents` + `submissions` rows, so
   `registry_unified` picks the adopted people up **by construction** — the view needs no edit. 12-4 must
   only widen its status taxonomy and re-measure.

**Open design question for 12-4 (not this story's to answer):** should drafts be visible in the unified read
as *prospective* rows before adoption? It would make the 292 countable without adopting them — but it
changes "registry total" from "registered people" to something softer, which is precisely the mislabelling
12-4 was written to end. **Recommend NO**, and keep drafts in their own operator view (13-44's panel).

### Dependencies
- Reviewed `DECISION` column in `draft-triage-2026-08-01.xlsx` (regenerate with
  `pnpm --filter @oslsr/api draft:triage`).
- Resend Pro for the message volume (~258 sends).
- No schema change. No new deps.

## Residuals

| ID | Severity | State | Re-runnable evidence | Owner |
|---|---|---|---|---|
| **R1** — AC10's single-record live dry-run | **High** | **DISCHARGE-ON-DEPLOY** — blocks `done` | `--apply --max 1` on one named record; verify row + reference code + 4 messages delivered + magic link opens an amendable registration; then the batch | Awwal + adjudicator |
| ~~**R2**~~ ✅ **RESOLVED 2026-08-01 — by reading the code, deliberately NOT by a live test** | Medium | **CLOSED** | **ANSWER: identity does NOT prefill.** `useWizardDraft.ts:114` hydrates via `setFormData(migrateLegacyName(draft.formData ?? {}))`, and `migrateLegacyName` (`:59-70`) maps only legacy `fullName` → `givenName`/`familyName`. **Nothing reads `questionnaireResponses.firstname`** (grep across hooks + WizardPage: zero hits). So the **208 drafts** whose name lives in the questionnaire block resume with EMPTY Basics/Contact steps. ⚠️ **A live test was deliberately NOT run, and would have been misleading:** today's wizard writes `formData.givenName`, so any draft created now has the very field the old drafts lack — a self-made test would PASS while telling us nothing, and testing it honestly would mean opening a real citizen's registration for an answer the code gives free. **Consequence (decided):** D4 copy says *"finish in 2 minutes — you'll need your NIN, your LGA and your trade"*, NOT *"pick up where you left off"*. **Optional AC13 (not a blocker):** add a `questionnaireResponses.firstname/surname/nin/dob/lga_id → head-step` mapping inside `migrateLegacyName` — same function, same hydration hook, ~10 lines, and the legacy-`fullName` case is the precedent that it belongs there. Would make 208 drafts prefill identity and turn D4 from 'finish' into 'confirm and submit'. Affects D4 conversion only; D1/D2/D3 are server-side and never touch this path. | dev |
| **R3** — 8 × `consent_basic = no` | High | **CLOSED by AC7** | The guard is in code, not the spreadsheet. Test: set a D5 row to `PUSH_TO_REGISTRY` in the sheet → script must still refuse. | — |

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-08-01 | Story created. Emergent from 13-46 AC11. Implements Awwal's ruling (adopt + inform, over invite-to-resume) on the Story 9-28 precedent. Cohort counts are post-correction: the first triage matched drafts to people by NIN alone and resolved 28; all four contact sources resolve 48, moving 20 rows and preventing 10 duplicate registry records. | Claude (adjudication) |
