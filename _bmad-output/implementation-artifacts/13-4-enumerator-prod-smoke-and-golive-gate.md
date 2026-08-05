# Story 13.4: Enumerator Prod Smoke & Go-Live Gate — Exercise the Field Path on Prod + Codify the 4-Point Pre-Flight Checklist

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-25 by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 🚦 PRE-SPEND gate item #2. REUSE not build — the enumerator path is fully wired. NET-NEW = exercise 5-10 real submissions on prod (today: ONE ever) + codify the 4-point go/no-go runbook. -->

## Story

As the **operator about to deploy enumerators across the 33 LGAs into a paid launch**,
I want **5–10 real enumerator submissions exercised end-to-end on prod (assignment → field capture → submission → ingestion → respondent row) AND the 4-point pre-flight go/no-go checklist codified as a runbook**,
so that **the enumerator path is proven on the actual prod box before field deployment (today only ONE submission has ever exercised it), and the spend decision runs off an explicit, verifiable gate — not optimism.**

## Context & Why This Gates Spend

prod faces a state-wide launch with **only one enumerator submission ever** exercised in production [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:25]. This story is **🚦 pre-spend gate item #2: "Enumerator path proven on prod — 5–10 real submissions"** [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:47]. It also **codifies the 4-point go/no-go checklist** that governs the spend decision.

### REUSE not build — the enumerator path is fully wired
This is a **proving + runbook** story, not a code-build story [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-4-enumerator-prod-smoke-and-golive-gate]:
- **Team assignments:** `team_assignments` maps supervisor → enumerator → LGA with soft-delete (`unassigned_at IS NULL` = active) and a partial-unique active index (one active supervisor per enumerator) [Source: apps/api/src/db/schema/team-assignments.ts:21-54].
- **Enumerator UI:** `EnumeratorHome` is live [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx].
- **Source tagging:** enumerator submissions are `source = enumerator`.
- **Ingestion pipeline:** the field submission flows `FormController.submitForm → queueSubmissionForIngestion → submission-processing.service` [Source: apps/api/src/controllers/form.controller.ts:121,177] — every respondent gets a submissions row (the unified ingestion pipeline; enumerator path is structurally sound).

**NET-NEW = (1)** exercise 5–10 real enumerator submissions end-to-end on prod, **(2)** codify the 4-point pre-flight go/no-go checklist as a runbook [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:72].

### The 4-point pre-flight gate (the thing this story codifies)
[Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:45-49]
1. Prod happy-path self-serve completion verified (one fresh real end-to-end submission).
2. Enumerator path proven on prod (this story: 5–10 real submissions) — today: one ever.
3. Attribution capture live + verified (Story 13-1).
4. Capacity load-test green + static fallback deployed (Story 13-3).

## Acceptance Criteria

### AC1 — 5–10 real enumerator submissions exercised end-to-end on prod (NET-NEW)
1. Between **5 and 10 real enumerator submissions** are completed end-to-end on prod: a real enumerator (assigned to a supervisor + LGA via `team_assignments`) [Source: apps/api/src/db/schema/team-assignments.ts:21-54], using the live `EnumeratorHome` [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx], captures + submits a form via the real path [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:47].
2. Each submission is verified to flow the full pipeline `FormController.submitForm → queueSubmissionForIngestion → submission-processing.service` [Source: apps/api/src/controllers/form.controller.ts:121,177] and land a **respondent row with `source = enumerator`** plus its **submissions row** (the unified-ingestion invariant: every respondent has a submissions row).
3. The submissions are verified on prod (the actual home box), not on staging/dev — the gate is about the prod path specifically (today: one ever) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:25].
4. Test/smoke submissions are **identifiable and reversible** — they are tagged/recorded so they can be excluded from launch metrics or cleaned up (do not pollute the real registry count with smoke data; if retained, they are flagged).

### AC1b — ⚠️ EXERCISE A SHARED-PHONE HOUSEHOLD (ADDED 2026-08-05, adjudication)

**Why this AC exists.** Story 13-49 shipped an identity guard on 2026-08-04 (R13/R17) after the
draft-adoption programme gave **7 citizens duplicate records**: `findOrCreateRespondent` deduped
only on the INCOMING submission's NIN, so a no-NIN registration matched nothing
(`submission-processing.service.ts:454`). The fix matches on **same phone + ≥2 shared name tokens
in any order** (surname-first is normal here, middle names come and go).

**The enumerator path shares that code.** `findOrCreateRespondent` takes a `RespondentSource`;
`ROLE_TO_SOURCE` maps the submitting role, but the dedupe is the SAME function for public,
enumerator and clerk. So the guard is already live in the field path.

**The threshold was tuned on the WRONG data distribution, and that is the risk this AC catches.**
It was validated read-only against the live registry — 14 duplicate-phone pairs, and **zero**
cases of two distinct people sharing a phone. But that registry is almost entirely SELF
registration: one person, one handset. **Field enumeration is not.** An enumerator walks a
household and registers four people on one phone. A mother `Fatima Bello` and daughter
`Fatima Aisha Bello` share a phone and two name tokens — and the guard would silently ATTACH the
daughter's submission to the mother's record. That is not a duplicate prevented; it is **two
citizens merged into one**, and it fails silently: no error, no duplicate, just a household that
ends up with fewer records than people.

**Requirements:**
1. At least **two of the 5–10 smoke submissions MUST be different people in the same household
   sharing one phone number**, with overlapping names (a shared surname at minimum).
2. Verify **two distinct respondent rows** result — not one. The failure mode is a MISSING row, so
   assert the count; a passing pipeline with one row looks identical to success.
3. If they merge, the guard must be **exempted or strengthened for enumerator-sourced
   submissions** before field deployment. Recommended: exempt when `submitterId` is present — an
   enumerator is physically with the person, and if they say this is a new individual they have
   better evidence than any string comparison. The guard exists to catch someone re-registering
   THEMSELVES; it should not overrule a human standing in the room. A stronger signal (DOB match,
   or ≥3 shared tokens) is the fallback if exemption is judged too broad.

**Do not treat this as hypothetical.** Every defect in the 13-49 programme passed its dry-run and
appeared only on live execution against real people. This is the same shape: correct in test,
wrong in a compound with a shared handset.

### AC1d — Email + SMS channels for the enumerator path (RETRACTED then CORRECTED, 2026-08-05)

⚠️ **THIS AC PREVIOUSLY CLAIMED A BLOCKER THAT DOES NOT EXIST.** It stated that neither published
form asks for an email. **That was wrong, and the error was mine:** the query read `q->>'key'`
while a question object's identifier is `q->>'name'` (`{id, name, type, label, required}`). Reading
a property that does not exist returned NULL for every form, and NULL was read as "no such
question". Left visible rather than deleted, because acting on it would have meant **re-publishing
and re-pinning a form for no reason — the exact operation that froze 232 public drafts in July
(Pitfall #46).** A wrong finding that triggers a risky change is worse than no finding.

**VERIFIED CORRECTLY (prod, 2026-08-05):**

| form | sections | questions | pinned to wizard | contact questions |
|---|---|---|---|---|
| OSLSR Labour & Skills Registry Survey (**Master**) | 8 | 47 | no | **`email` (optional)**, `phone_number` (required), `guardian_phone` (required) |
| OSLSR Public Core (self-serve) | 6 | 25 | **yes** | **`email` (optional)**, `phone_number` (required), `guardian_phone` (required) |

**Master is a strict superset**: all 25 Public Core questions appear in Master's 47
(`in_public_not_in_master = 0`). Awwal's description was accurate.

**So the requirement is ALREADY MET and needs no form change.** `email` is optional — exactly the
no-friction shape Awwal specified — and it is keyed `email`, which is precisely what
`submission-processing.service.ts:299` reads (`rawData['email'] ?? rawData['email_address']`,
source-agnostic). An enumerator who fills it triggers the 9-58 confirmation carrying the OSLRS
number, with no code and no form change. The one historic enumerator submission (2026-04-20) has no
email key simply because the field is optional and was left blank.

**Requirements:**
1. At least one smoke submission MUST fill `email` with an address the operator controls, and the
   OSLRS-number email MUST be confirmed as **received** — a green pipeline proves a row was
   written, not that anyone was told their number.
2. At least one MUST leave `email` blank, and must still succeed. Optional means optional; if a
   blank email breaks ingestion, field work stalls on a field nobody needs.
3. ⚠️ **SMS IS NOT AVAILABLE.** `phone_number` is captured and required, so the data is there —
   but Termii is **blocked on KYC** (`lib/fallback-lead.ts:7`) and the provider is a no-op that
   rejects. "We collect phones so we can SMS them" is true about the DATA and false about the
   CHANNEL until Story 9-27 Part B lands. **Email is the only working channel today**, which is
   why (1) matters: for a respondent with no email, nothing reaches them at all, and the operator
   phone list (`sms:outreach-list`, handoff §7g) is the manual fallback.

### AC1c — TEST-DATA PROTOCOL (ADDED 2026-08-05, adjudication)

These 5–10 submissions land on **prod**, on a register that is **live and moving** (305 respondents
and rising; 4 arrived during a single hour today). Five things will bite in ways that look like
enumerator bugs but are not.

**1. R13 WILL SILENTLY MERGE YOUR TEST PEOPLE.** The identity guard attaches a no-NIN submission to
an existing record when the **phone matches AND ≥2 name tokens overlap**. Test data is usually made
the exact wrong way — same handset, similar names — so you will create 5 people and find 3. **No
error, no duplicate, just fewer rows than you entered.** Give each test person a **distinct phone
and unrelated names**… except for the ONE pair required by AC1b, which must share a phone
deliberately and assert TWO rows result.

**2. REAL EMAILS SEND. Immediately.** Prod holds the real Resend key; the 9-63 dev-credential
isolation does not apply here. Any captured email fires the 9-58 confirmation carrying the OSLRS
number (`submission-processing.service.ts:299` reads `rawData['email'] ?? rawData['email_address']`
and does **not** branch on source). Use `+tag` addresses you control — that is also how you prove
the registration-number email actually arrives, which is one of the things this story exists to
verify. ⚠️ **If the enumerator form stores the address under any other key, the confirmation
silently never fires.** Check the key name before concluding email is broken.

**3. TAG THE ROWS BEFORE CREATING THEM.** AC1.4 already requires identifiable and reversible. A
reserved name prefix or NIN block makes teardown a `WHERE` clause instead of archaeology. Deciding
this afterwards is how smoke data ends up in a launch metric.

**4. TEARDOWN IS CHILD-FIRST, AND ONE STEP IS EASY TO MISS.**
`fraud_detections` (by **`submission_id`** — it has no `respondent_id`) → `marketplace_profiles` →
`magic_link_tokens` (**by EMAIL** — a wizard-issued token has `respondent_id = NULL`, so deleting by
respondent reports success and removes nothing; it leaked on three consecutive dry-runs before this
was caught) → `submissions` → `respondents`. **Read the `DELETE n` counts: a `DELETE 0` is a failed
teardown, not a clean one.** Full recipe: `docs/runbooks/pre-blast-dry-run.md` §5.

**5. RE-MEASURE, NEVER "RESTORE TO N".** The register moves under you. Capture the baseline
immediately before you start and again after teardown; expect organic arrivals in between rather
than treating them as leftovers. `prod-verify`'s 9-26 ceiling (56) and duplicate-pair checks will
move too.

**Form note.** The OSLRS **Master** form has more sections than the pinned public form, so step
count and `_pendingNin` behaviour differ from the public wizard (step count is form-driven —
Pitfall #46). Record which form each test submission used, or the results will not be comparable
to the public path.

### AC2 — The 4-point pre-flight go/no-go checklist codified as a runbook (NET-NEW)
1. A runbook codifies the **4-point pre-flight gate** verbatim [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:45-49]: (1) prod happy-path self-serve verified; (2) ≥5 enumerator prod submissions; (3) attribution live + verified (13-1); (4) load-test green + fallback deployed (13-3). Each item has an explicit **how-to-verify** step and a green/red box.
2. The runbook states the **decision rule**: ALL FOUR green → fire radio/paid social; ANY red → hold spend (radio is movable 24–48h, so the gate has teeth) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:43,49].
3. The runbook is cross-linked from / consistent with the existing `docs/runbooks/pre-launch-operator-runbook.md` (the ordered runway) — it does NOT fork a parallel launch process [Source: C:/Users/DELL/Desktop/oslrs/docs/runbooks/pre-launch-operator-runbook.md].

### AC3 — Gate item #2 verdict recorded
1. The "enumerator path proven on prod" verdict (≥5 verified submissions) is recorded as pre-flight gate item #2 — evidence-based (the submission IDs / respondent IDs verified), not a claim [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:47,98].

## Tasks / Subtasks

- [ ] **Task 1d — Prove both email branches (AC1d)** — one smoke submission WITH `email` (confirm
      the OSLRS-number email is RECEIVED, not merely sent) and one WITHOUT (must still succeed).
      No form change is needed; `email` already exists and is optional on both forms.
- [ ] **Task 1c — Test-data protocol (AC1c)** — distinct phones + unrelated names (except the
      AC1b pair); `+tag` emails you control; a reserved name/NIN prefix agreed BEFORE the first
      submission; baseline captured before and re-measured after teardown; child-first teardown
      with the `DELETE n` counts read.
- [ ] **Task 1b — Shared-phone household case (AC1b)** — register ≥2 different people in one
      household on ONE phone with overlapping names; assert **two** respondent rows, not one.
      If they merge, exempt or strengthen the R13 identity guard for enumerator-sourced
      submissions BEFORE field deployment.
- [ ] **Task 1 — Exercise 5–10 real enumerator submissions on prod (AC1)**
  - [ ] Confirm/establish a real enumerator assigned via `team_assignments` (supervisor → enumerator → LGA, active row) [Source: apps/api/src/db/schema/team-assignments.ts:21-54].
  - [ ] Capture + submit 5–10 forms through the live `EnumeratorHome` [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx] on PROD (AC1.3).
  - [ ] Verify each flows `submitForm → queueSubmissionForIngestion → submission-processing.service` [Source: apps/api/src/controllers/form.controller.ts:121,177] and lands a respondent row (`source = enumerator`) + submissions row (AC1.2).
  - [ ] Tag/record the smoke submissions so they're identifiable + reversible (excludable from launch metrics) (AC1.4).

- [ ] **Task 2 — Codify the 4-point go/no-go runbook (AC2)**
  - [ ] Write the runbook with the 4 gate items verbatim, each with a how-to-verify step + green/red box (AC2.1) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:45-49].
  - [ ] State the decision rule (all green → fire; any red → hold; radio movable 24–48h) (AC2.2).
  - [ ] Cross-link to `docs/runbooks/pre-launch-operator-runbook.md`; do not fork the launch process (AC2.3).

- [ ] **Task 3 — Record the gate verdict (AC3)**
  - [ ] Record the "enumerator path proven on prod" verdict (≥5 verified submissions, with the submission/respondent IDs) as gate item #2 (AC3.1) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:98].

## Dev Notes

### Architecture & engine map (cite these exact targets — REUSE, don't build)
- **Team assignments (REUSE):** `apps/api/src/db/schema/team-assignments.ts:21-54` — supervisor→enumerator→LGA, soft-delete (`unassigned_at IS NULL` active), partial-unique active index.
- **Enumerator UI (REUSE):** `apps/web/src/features/dashboard/pages/EnumeratorHome.tsx`.
- **Ingestion path (REUSE):** `apps/api/src/controllers/form.controller.ts:121,177` (`submitForm` → `queueSubmissionForIngestion`) → `submission-processing.service` → respondent row (`source = enumerator`) + submissions row (unified-ingestion invariant).
- **Launch runbook (cross-link, don't fork):** `docs/runbooks/pre-launch-operator-runbook.md`.

### REUSE-not-rebuild discipline (read before coding)
- The enumerator path is **fully wired** (assignment, UI, source tag, ingestion). This story PROVES it on prod + writes a checklist — it does NOT add code to the enumerator flow. If you're editing the submit path, stop: the gap is "only one prod submission ever," not a broken path [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:73].

### Operator-run, Tailscale
- The 5–10 prod submissions are an **operator (Awwal, Tailscale) action** [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:94]. This story delivers the procedure + the runbook + the verdict-recording; the operator runs the smoke on the prod box.

### Dependencies & sequencing
- **HARD deps (available):** the enumerator path (DONE); `team_assignments`; `EnumeratorHome`; the ingestion pipeline.
- **Gate composition:** this story is gate item #2 but the runbook it writes encompasses ALL FOUR items (which span 13-1 attribution + 13-3 capacity + the self-serve happy-path check). The runbook is the consolidation point.
- **Tier:** 🚦 pre-spend gate item #2 [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:55].

### Scope OUT (do not build)
- Any code change to the enumerator submit/ingestion path (it's proven, not rebuilt).
- New enumerator features / UI.
- Bulk enumerator onboarding tooling (the smoke uses real/existing assignments).
- The self-serve happy-path verification itself is gate item #1 (Story 13-1 Task 6 captures the attribution side of it) — this story's runbook REFERENCES item #1 but item #1's execution is the operator's fresh-submission check, not new code here.

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:25,45-49,55,72-73,94,98] — one-submission-ever risk, 4-point gate, gate item #2, REUSE-not-build, operator-run, success criterion
- [Source: apps/api/src/db/schema/team-assignments.ts:21-54] — supervisor→enumerator→LGA assignment (active/soft-delete/partial-unique)
- [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx] — live enumerator UI
- [Source: apps/api/src/controllers/form.controller.ts:121,177] — submitForm → queueSubmissionForIngestion (the field ingestion path)
- [Source: docs/runbooks/pre-launch-operator-runbook.md] — the ordered runway (cross-link target)
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#13-4-enumerator-prod-smoke-and-golive-gate] — scope note (REUSE; net-new = 5-10 prod submissions + 4-point checklist)

## Change Log

| Date | Change |
|------|--------|
| 2026-06-25 | Story authored by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 3 ACs (5–10 real enumerator submissions end-to-end on prod; codify the 4-point pre-flight go/no-go checklist as a runbook; record the gate item #2 verdict). REUSE the fully-wired enumerator path — net-new = the prod smoke + the runbook, NO code change to the field flow. Status → ready-for-dev. 🚦 PRE-SPEND gate item #2. |
