# Story 13.4: Enumerator Prod Smoke & Go-Live Gate — Exercise the Field Path on Prod + Codify the 4-Point Pre-Flight Checklist

Status: in-progress

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
`magic_link_tokens` (**by EMAIL *OR* `respondent_id`** — see the correction below) → `submissions` →
**`respondents`** → **`users`**. **Read the `DELETE n` counts: a `DELETE 0` is a failed teardown, not
a clean one.** Full recipe: `docs/runbooks/pre-blast-dry-run.md` §5.

⚠️ **TWO CORRECTIONS FROM RUNNING THIS FOR REAL (R21 verification, 2026-08-05):**

- **`users` was missing from the chain entirely.** The wizard mints **one user row per email**, so a
  two-pass test left 2 orphan accounts after respondents and submissions were gone. Delete users
  LAST — `respondents.user_id` references them, so the FK blocks it until the respondent is gone.
- **The "`respondent_id` is always NULL on a wizard token" claim above is not universally true.**
  Both tokens in this run carried a real `respondent_id`. Delete on **`email ILIKE … OR
  respondent_id = …`** rather than trusting either key alone; the original note was written from one
  observation and generalised too far.

🚫 **`audit_logs` IS EXEMPT — NEVER DELETE FROM IT.** It is hash-chained and append-only: removing
rows forks the chain (see [[audit-chain-invalid-is-ordering-not-tampering]]) to erase the legitimate
record that a test happened. Test rows in the audit trail are correct and should stay. The R21 run
left 7; they remain.

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

- [x] **Task 2 — Codify the 4-point go/no-go runbook (AC2)**
  - [x] Write the runbook with the 4 gate items verbatim, each with a how-to-verify step + green/red box (AC2.1) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:45-49].
  - [x] State the decision rule (all green → fire; any red → hold; radio movable 24–48h) (AC2.2).
  - [x] Cross-link to `docs/runbooks/pre-launch-operator-runbook.md`; do not fork the launch process (AC2.3).

- [ ] **Task 3 — Record the gate verdict (AC3)**
  - [ ] Record the "enumerator path proven on prod" verdict (≥5 verified submissions, with the submission/respondent IDs) as gate item #2 (AC3.1) [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-25-launch-campaign.md:98].

### Review Follow-ups (AI)

BMAD adversarial code-review, 2026-08-06 (pre-commit, on the uncommitted tree). 10 findings, all
fixed in the same pass at Awwal's direction. Listed critical → low; each carries the evidence that
it is closed.

- [x] **[AI-Review][High] H1 — the household procedure never exercised the guard it exists to prove.**
      The R13 branch is gated on `!data.nin` (`submission-processing.service.ts:566`), but §C said only
      "register two people on one phone" while §B.3 pushed the operator toward the `7000000001x` NIN
      sentinel. With NINs the exemption never executes, `§A query 4` returns 2 regardless, and gate
      item 2 flips GREEN having tested nothing — [[pattern-test-that-passes-over-a-hole]] at the
      procedure level, in the story that cites that pattern. §C step 3 (the log check, the only
      positive proof the branch ran) was also marked *"Optionally"*.
      **Fixed:** §C gains a 🛑 *LEAVE THE NIN BLANK ON BOTH* block explaining why, step 3 is now
      MANDATORY with "no log line → item 2 is RED", §B.3 carries a pointer that the NIN sentinel
      does not apply to the §C pair, and §F records the blank-NIN confirmation as its own checkbox.
      [docs/runbooks/enumerator-prod-smoke-and-golive-gate.md §B.3, §C, §F]

- [x] **[AI-Review][High] H2 — the AC1b fix relocated the merge hazard one hop downstream.**
      Allowing a household its own row per person makes "N respondents share this phone" the expected
      shape of field data. `registration-status.service.ts` resolved a phone lookup with
      `ORDER BY created_at DESC LIMIT 1` and `handleRequest` then minted a `wizard_resume` magic link
      **bound to that respondentId** — so a mother checking status on the family handset would have
      been handed a session that resumes, and completes the NIN on, her daughter's record. The exact
      two-citizens-merged failure AC1b prevents, moved downstream. Not mentioned in the story, the
      runbook or any residual.
      **Fixed:** `resolveRespondent` now selects `LIMIT 2`, excludes `rolled_back`, groups the email
      branch by respondent (so one person's three submissions are one match), and returns `null` when
      more than one living respondent matches — the caller's neutral public response is unchanged.
      Emits `registration_status.identifier_ambiguous` (class + count only, no PII, per AC8). +4 tests.
      [apps/api/src/services/registration-status.service.ts:129-210]

- [x] **[AI-Review][High] H3 — the AC1b assertion query was wrong in both directions.**
      `§A query 4` matched `phone_number = '<HOUSEHOLD_PHONE>'`, but phones are stored canonicalised
      by `normaliseNigerianPhone`, so pasting `08012345678` against a stored `+2348012345678` returns
      0 and reads **RED on a working fix**. And with no `rolled_back` filter and no time window, a
      phone reused from an earlier dry-run returns 2 and reads **GREEN having proved nothing**.
      **Fixed:** matches on the last 10 digits after stripping non-digits, excludes `rolled_back`,
      bounded by `<SMOKE_START_TS>`. [runbook §A query 4]

- [x] **[AI-Review][Med] M1 — the counterfactual log was untested.** The test literally named
      *"…so the counterfactual is measurable"* asserted only that `mockDbExecute` ran and the SQL
      contained `INTERSECT`; there was no logger spy in the file, so deleting the entire `logger.info`
      block left all 4 tests green. That event string is the runbook's §A query 5 evidence command and
      the sole denominator for residuals R6/R7.
      **Fixed:** the `pino` mock's `info` is now a captured spy; +2 tests assert the event fires with
      `wouldHaveMergedInto`/`source`/`submitterId`, and that it does *not* fire when there was nothing
      to merge into. **RED-verified:** renaming the event string fails the new test (1 failed), then
      passes again on restore. [submission-processing.service.test.ts:1332-1390]

- [x] **[AI-Review][Med] M2 — `clerk` was added beyond the AC on a rationale that does not hold.**
      AC1b.3 scopes the remedy to *enumerator-sourced* submissions; the docblock justified the set with
      "a human standing in the room", which is false of a `data_entry_clerk` keying paper in an office.
      **Fixed — membership kept, rationale corrected.** What decides it is the *shape of the data*, not
      a witness: a clerk keys a stack of paper collected from a compound, carrying the same shared
      handset and surnames. The accepted cost (double-keyed paper now mints a duplicate R13 used to
      absorb) is stated explicitly and is recoverable via 9-11. [submission-processing.service.ts:72-102]

- [x] **[AI-Review][Med] M3 — the exemption-evidence command showed nothing.** `pm2 logs oslsr-api |
      grep …` tails from now; the event has already fired by the time the operator looks. Every other
      runbook here uses `--lines N --nostream`. **Fixed:** `--lines 2000 --nostream`, with a note on why.

- [x] **[AI-Review][Med] M4 — nothing detected the duplicates the exemption now creates.** R6 accepted
      "nobody reads the meter", but the exemption is unconditional for staff sources: every field
      near-match silently mints a second row, traced only by an INFO line with no digest or counter.
      That is 13-49's cost class at 33-LGA scale, and "revisit at 13-42" arrives after the data.
      **Fixed:** new `§A query 6` groups shared-handset enumerator/clerk rows with their members and
      statuses — expected for households, suspect when names match — run at teardown and weekly once
      field work starts. Residual R6 re-scoped from "no surface" to "manual watch, query exists".

- [x] **[AI-Review][Low] L1 — AC2.1 asks for a green/red box per gate item**; the table gave one ⬜ per
      row, leaving "unchecked" ambiguous between *not run* and *red*. **Fixed:** every row is now
      `⬜ GREEN ⬜ RED`, with an explicit note that neither-ticked means NOT RUN and holds spend anyway.

- [x] **[AI-Review][Low] L2 — §F's evidence table had 5 rows** while AC1/§D allow 5–10, so an operator
      doing 8 had nowhere to record 6–8. **Fixed:** 10 rows, plus a `NIN?` column (H1 needs it visible).

- [x] **[AI-Review][Low] L3 — `Deploy SHA: PENDING` makes R2 unrunnable today.** R2 reads "if it
      returns 1 the fix did not reach prod" — guaranteed until this ships. **Fixed:** the runbook opens
      with a deploy PRECONDITION (check the running SHA against the story's Deploy SHA before §C), and
      §F records the prod SHA at smoke time.

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

## Dev Agent Record

### Session 2026-08-06 (Amelia, dev-story) — dev half complete, execution half is operator-gated

**The shape of this story:** its Dev Notes state outright that *"the 5–10 prod submissions are an
operator (Awwal, Tailscale) action. This story delivers the procedure + the runbook + the
verdict-recording."* So Tasks 1 / 1b / 1c / 1d cannot be closed by a dev agent — they close when the
operator runs the smoke. Task 2 is fully dev-owned and is done. What follows is what actually
shipped, and what is genuinely still open.

#### 1. AC1b's conditional turned out to be unconditional — the guard DID merge, and it is now fixed

AC1b said *"if they merge, exempt or strengthen the R13 guard."* That did not need the prod smoke to
answer. `submission-processing.service.ts:552` ran the identity guard on **every** no-NIN submission
with no branch on `source` or `submitterId`, so a household on one shared phone with two overlapping
name tokens merged deterministically.

**RED-verify (AC1b.3, per [[pattern-test-that-passes-over-a-hole]]):** wrote the household test
FIRST against unmodified code and it failed exactly as predicted —
`AssertionError: expected false to be true` on `result._isNew`, i.e. `Fatima Aisha Bello` was
attached to `Fatima Bello`'s record. Two citizens merged into one, silently, no error, no duplicate.
Then implemented the exemption; 77/77 green.

**The fix, and the one subtlety that matters:** the exemption keys on **`source`**, NOT on
`submitterId` presence as AC1b.3 suggested. `determineSubmitterRole` maps an authenticated
`public_user` to source `public` *while still carrying a submitterId* — so "exempt when submitterId
is present" would have exempted the public self-registration path, which is precisely the path R13
exists to guard and which produced the 7 duplicates on 2026-08-04. `STAFF_CAPTURED_SOURCES` is
`{enumerator, clerk}` only, and a regression test pins that `public` still attaches.

**The lookup still RUNS on staff-captured rows; only the attach is skipped.** Deliberate: R21's
lesson was that a guard which never executes is indistinguishable from one that finds nothing — the
only evidence either way was a counter reading zero. The exemption therefore emits
`submission_processing.identity_match_exempted_staff_capture` with `wouldHaveMergedInto`, which is
the denominator needed to judge AC1b.3's fallback (DOB match / ≥3 tokens) if the exemption is ever
thought too broad.

#### 2. Runbook (Task 2 / AC2) — `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md`

4-point gate verbatim with a how-to-verify + green/red box each (AC2.1), the decision rule with the
24–48h radio lever (AC2.2), and cross-linked **both ways** with `pre-launch-operator-runbook.md`
without forking it (AC2.3) — the header table gains a spend-gate row explaining why it is a
cross-cut rather than another ordered step, and Step 9 (field + social) points at it. It also
carries AC1c's protocol (§B), AC1b's procedure (§C), AC1d's email branches (§E), and AC3's evidence
table (§F).

#### 3. Two AC1c claims corrected against the code rather than copied forward

AC1c's teardown chain was written from a single wizard run and generalised. Verified:

- **`users` does not belong in the enumerator teardown chain at all.** The user row is minted by
  `auth.service.ts` passwordless provisioning (the 9-38 wizard path); `submission-processing.service.ts`
  never inserts into `users`. The runbook now states the chain is **path-dependent** and flags the
  FK ordering (`respondents.user_id`) only where it applies.
- **`magic_link_tokens` on `respondent_id` OR `email`** — kept, as AC1c's own correction says. Note
  `apps/api/scripts/_enumerator-path-smoke-test.ts` deletes on `respondent_id` alone; that is
  *correct for that script* (synthetic enumerator rows, no email-keyed tokens) and left alone rather
  than "fixed" into noise.

#### 4. REUSE check on the existing script

`_enumerator-path-smoke-test.ts` already exists (23KB) and does synthetic submissions + verification
+ idempotent teardown. It was **not** rewritten or duplicated. It cannot close gate item 2 because
it POSTs straight at the API with a signed JWT and so bypasses the browser, while AC1.1 requires
capture through the live `EnumeratorHome`. The runbook §D says exactly this: *rehearse with the
script, certify with the UI.*

### Session 2026-08-06 (BMAD adversarial code-review) — 10 findings, all fixed

Run pre-commit on the uncommitted tree, per [[feedback_review_before_commit]]. **Story File List
matched `git status` exactly — 0 discrepancies — and no task marked `[x]` was found undone**, which
is rare enough to say out loud. Task 2 verified genuinely complete. The findings were about what the
fix *implies*, not about false claims. Full list with evidence: **Tasks/Subtasks → Review Follow-ups
(AI)**. The two worth reading in the story body:

**H2 — the fix moved the hazard rather than removing it.** AC1b's whole point is that a household
enumerated on one handset must yield one row per person. The direct consequence is that a phone
number stops identifying a person — and `registration-status.service.ts` was still resolving a phone
lookup with `ORDER BY created_at DESC LIMIT 1`, then minting a `wizard_resume` magic link bound to
whichever row won. A mother checking her status on the family phone would have received a link into
her daughter's record, with NIN-completion attached. Nothing merged in the database; the merge simply
happened in the citizen's session instead.

`resolveRespondent` now refuses an identifier that matches more than one living respondent, and says
nothing more than it says on a miss (the public response was already constant, so no enumeration
signal changes). Refusing is strictly better than confidently answering about the wrong person, and
the reference code — unique, printed by 9-58, read out at capture — still resolves. **That last part
is a field-procedure dependency, not just code:** enumerators must read the reference code back to
every person they register, or a shared-handset household has no working way in. Runbook §C carries
it and §F verifies it during the smoke. New residual **R8**.

**M1 — the counterfactual measurement was itself a test that passed over a hole.** The test named
*"…so the counterfactual is measurable"* asserted the identity QUERY ran and nothing about whether
the answer was recorded: no logger spy existed in the file, so deleting the entire `logger.info`
block left all four AC1b tests green. Given that the event string is what the runbook greps prod for
and what both R6 and R7 are to be judged on, it is a contract, not debug noise. Now spied and pinned,
and RED-verified the same way the original fix was: renaming the event fails the test, restoring it
passes.

The rest: H1/H3 made the operator procedure actually exercise the guard (a NIN-bearing household pair
skips the branch entirely and still returns 2 — GREEN having tested nothing), M2 corrected the
`clerk` rationale without changing the membership, M3/M4/L1–L3 tightened the runbook's evidence
commands and boxes.

### Validation run

| Check | Result |
|---|---|
| `pnpm --filter @oslsr/api exec tsc --noEmit` | clean |
| `pnpm --filter @oslsr/api lint` (eslint + registry-read guard + story-residual guard) | clean — 364 files scanned no drift; 306 stories, no done-with-open-residuals |
| Full API regression (`NODE_ENV=test`, `app_test`) — **post-review** | **259 files / 3564 passed, 0 failed**, 7 skipped, 1 todo |
| Full API regression — dev half, pre-review | 259 files / 3558 passed, 0 failed |
| New tests | 4 (13-4 AC1b) + 6 (review M1 ×2, H2 ×4) = **10**, all RED-verified against the unfixed code |

Web package untouched — no `apps/web` changes in this story, so the web suite was not run.

### Residuals

Per the §2a0 debt gate. **Every open row here is operator execution on prod; none is dev work.**

| ID | Sev | State | What | Evidence to close |
|---|---|---|---|---|
| R1 | High | **OPEN — operator** | AC1.1–1.3: 5–10 real submissions through `EnumeratorHome` on prod (today: one ever) | Runbook §F table populated with respondent/submission IDs; `§A query 2` shows `source='enumerator'`, `processed=true` for each |
| R2 | High | **OPEN — operator** | AC1b execution: the shared-phone household pair | `§A query 4` returns **2**. Code fix already shipped + RED-verified, so this CONFIRMS rather than discovers. If it returns 1, the fix did not reach prod → hold gate item 2 |
| R3 | Med | **OPEN — operator** | AC1d: both email branches, with the OSLRS-number email confirmed **received** | Runbook §F "confirmation email received at" filled |
| R4 | Med | **OPEN — operator** | AC1.4 / AC1c: rows tagged before creation, teardown run child-first with `DELETE n` counts read, baseline re-measured | §F teardown checkbox + before/after baselines |
| R5 | High | **OPEN — operator** | AC3: gate item #2 verdict recorded with evidence | §F verdict flipped GREEN with the ID list |
| R6 | Low | **ACCEPTED — manual watch** | The exemption's cost side has no automated alarm: `identity_match_exempted_staff_capture` still has no digest line | Re-scoped by review M4 from "no surface at all" to "manual watch with a query that exists": `§A query 6` lists shared-handset enumerator/clerk groups. Run at teardown and weekly once field work starts. Automate at 13-42 if field volume makes the rate interesting |
| R7 | Low | **ACCEPTED** | AC1b.3's fallback (DOB match / ≥3 shared tokens) not implemented | Exemption was AC1b.3's stated first choice; the fallback is only warranted if R6's counter shows the exemption is too broad. Cannot be judged before field data exists |
| R8 | Med | **OPEN — operator (field procedure)** | Review H2: a shared-handset household can no longer be resolved by phone — the status check now refuses an ambiguous identifier rather than answering about the wrong person. **Enumerators must read the OSLRS reference code back to every registrant, and it must go on the slip**, or those citizens have no working way to check status or resume | Runbook §C's field-consequence note actioned in the enumerator briefing; §F's two status-check boxes ticked during the smoke (shared phone → neutral + no email; reference code → email arrives) |
| R9 | Low | **OPEN — dev, post-launch** | Review H2 changed public status-check resolution for ALL sources, not just enumerator rows. The ~14 pre-existing duplicate-phone pairs in the live registry will now get the neutral response instead of the newest match — correct, but it is a silent behaviour change for people already registered | Watch `registration_status.identifier_ambiguous` after deploy. If the rate is material, the fix is a disambiguation prompt ("we found more than one — enter your reference code"), not a return to guessing. Candidate for its own story |

### Closing verdict

**NOT CLOSED — `in-progress`.** Task 2 is complete, the AC1b code defect is fixed and verified, and
the code-review's 10 findings are all fixed pre-commit. Tasks 1 / 1b / 1c / 1d and AC3 still require
the operator to run the smoke on prod. Per §2a0, `Status:` must not read `done` (or `review`, since
the ACs are not satisfiable by review of code alone) while R1–R5, R8 and R9 are OPEN.

**Deploy SHA:** ⏳ PENDING — not yet committed or pushed. **This is a hard precondition for the
smoke, not bookkeeping:** §C run against a box that predates this deploy returns 1 and proves the
old bug. The runbook opens with a SHA check for exactly that reason.

## File List

**Modified**
- `apps/api/src/services/submission-processing.service.ts` — `STAFF_CAPTURED_SOURCES` constant + the AC1b exemption branch in `findOrCreateRespondent` (lookup still runs; attach skipped; counterfactual logged). *Review M2: the `clerk` rationale rewritten — it is the data shape, not a witness in the room*
- `apps/api/src/services/registration-status.service.ts` — **review H2**: `resolveRespondent` refuses an identifier matching >1 living respondent (phone + email branches `LIMIT 2`, `rolled_back` excluded, email branch grouped by respondent) and emits `registration_status.identifier_ambiguous`. Stops a shared-handset household member being handed a magic link into a relative's record
- `apps/api/src/services/__tests__/registration-status.service.test.ts` — **review H2**: +4 tests (shared phone refused, shared email refused, ambiguity event carries count but never the identifier per AC8, unique phone still dispatches) + a captured `pino` mock
- `apps/api/src/services/respondent-identity.ts` — docblock only: the "⚠️ NOT FOR THE ENUMERATOR PATH AS-IS" warning it carried pointed at this story; replaced with the resolved state + why the exemption lives in the caller
- `apps/api/src/services/__tests__/submission-processing.service.test.ts` — +4 tests (`13-4 AC1b` describe): enumerator + clerk household cases, the measurable-counterfactual pin, and the public-path regression pin. *Review M1: `pino.info` is now a captured spy and +2 tests assert the counterfactual event actually fires (and only when there was something to merge into) — RED-verified by renaming the event*
- `docs/runbooks/pre-launch-operator-runbook.md` — spend-gate row in the header table + the two-gates note; Step 9 cross-link (AC2.3)
- `_bmad-output/implementation-artifacts/13-4-enumerator-prod-smoke-and-golive-gate.md` — this file (Task 2 checkboxes, Dev Agent Record, Residuals, File List, Change Log)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `13-4` ready-for-dev → in-progress

**Added**
- `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` — the 4-point go/no-go gate runbook (AC2), incl. the AC1c test-data protocol, AC1b household procedure, AC1d email branches, and the AC3 verdict record. *Review H1/H3/M3/M4/L1–L3: the §C household pair must be captured with NIN blank (a NIN-bearing pair skips the guard and still returns 2), the §A query 4 assertion matches on the last 10 digits and is bounded, the exemption-log check is mandatory and uses `--nostream`, a new query 6 watches shared-handset groups, GREEN/RED boxes on all four items, §F extended to 10 rows + the deploy precondition*

**Deleted** — none.

## Change Log

| Date | Change |
|------|--------|
| 2026-08-06 | **BMAD adversarial code-review — 10 findings (3 High, 4 Med, 3 Low), ALL FIXED pre-commit.** File List matched git exactly and no `[x]` task was found undone; the findings were about what the AC1b fix *implies*. **H2 (High): the fix moved the merge hazard downstream rather than removing it.** Giving a household one row per person means a phone stops identifying a person — and `registration-status.service.ts` still resolved a phone lookup `ORDER BY created_at DESC LIMIT 1` and minted a `wizard_resume` magic link bound to the winner, so a mother checking status on the family handset would have got a link into her daughter's record with NIN-completion attached. `resolveRespondent` now refuses an identifier matching >1 living respondent (neutral public response unchanged) and logs `registration_status.identifier_ambiguous` with class+count only. Field dependency → **R8**: enumerators must read the reference code back, since it is now the only identifier a shared-handset household can use. **H1/H3 (High): the operator procedure could not have exercised the guard.** The R13 branch is gated on `!data.nin`, but §C never said to leave the NIN blank and §B.3 pushed toward a NIN sentinel — a NIN-bearing pair skips the branch and `§A query 4` returns 2 anyway, flipping gate item 2 GREEN having tested nothing. And query 4 itself matched a raw typed phone against canonicalised storage (RED on a working fix) with no `rolled_back` filter or time window (GREEN on a reused phone). Both fixed; the exemption-log check is now MANDATORY, not "optionally". **M1 (Med): the counterfactual test passed over a hole** — it asserted the identity query ran, never that the answer was logged; with no logger spy in the file, deleting the whole `logger.info` block left all 4 AC1b tests green, while that event string is what the runbook greps and what R6/R7 are judged on. Now spied, pinned, and RED-verified by renaming the event. **M2:** `clerk` kept in the exemption but its "a human in the room" rationale corrected — it is the data shape (paper from a compound carries the same shared handset) and the double-keying cost is stated. **M4:** new `§A query 6` gives the exemption's cost side a manual watch; R6 re-scoped. **L1–L3:** GREEN/RED boxes on all four gate items, §F extended to 10 rows + `NIN?` column, deploy-SHA precondition added. +6 tests (10 total for this story). tsc 0, eslint 0, full API regression **3564 passed / 0 failed**. Status stays `in-progress` — R1–R5, R8, R9 open. |
| 2026-08-06 | **Dev half executed (Amelia, dev-story). Task 2 DONE; Tasks 1/1b/1c/1d remain operator-gated.** (1) **AC1b defect fixed — and it was NOT hypothetical:** a RED test proved the R13 identity guard merged a shared-phone household member into an existing record on the enumerator path. `submission-processing.service.ts` now exempts `STAFF_CAPTURED_SOURCES` (`enumerator`/`clerk`) from the attach while still running the lookup, emitting `identity_match_exempted_staff_capture` so the counterfactual stays measurable. Exemption keys on **source, not `submitterId`** — an authenticated `public_user` carries a submitterId and must still merge (that is the 2026-08-04 7-duplicate path). +4 tests. (2) **AC2 runbook shipped:** `docs/runbooks/enumerator-prod-smoke-and-golive-gate.md` — 4-point gate verbatim w/ how-to-verify + green/red boxes, the 24–48h decision rule, AC1c protocol, AC1b/AC1d procedures, AC3 evidence table; cross-linked both ways with `pre-launch-operator-runbook.md` (header spend-gate row + Step 9), not forked. (3) **Two AC1c claims corrected against the code:** `users` is minted only by the wizard's `auth.service.ts` provisioning, NOT the enumerator path, so the teardown chain is path-dependent. (4) REUSE honoured — `_enumerator-path-smoke-test.ts` not duplicated; documented as rehearsal-not-certification since it bypasses the browser. tsc 0, eslint 0, full API regression 3558 passed / 0 failed. Status stays `in-progress`: R1–R5 are operator residuals. |
| 2026-06-25 | Story authored by Bob (SM) via canonical *create-story, per SCP-2026-06-25-launch-campaign (Epic 13). 3 ACs (5–10 real enumerator submissions end-to-end on prod; codify the 4-point pre-flight go/no-go checklist as a runbook; record the gate item #2 verdict). REUSE the fully-wired enumerator path — net-new = the prod smoke + the runbook, NO code change to the field flow. Status → ready-for-dev. 🚦 PRE-SPEND gate item #2. |

### AC4 — AN ENUMERATOR MUST BE ABLE TO ABANDON WORK (ADDED 2026-08-06, found BY the smoke)

The smoke stopped on submission #1. The form was submitted missing `employment_status`, the server
returned a 422 that can never succeed on resend, and the item **could not be cleared from the UI at
all** — "Retry Failed" was pressed repeatedly and each press made it worse.

**Root cause:** `sync-manager.ts` classed exactly ONE error as permanent —
`item.error?.includes('NIN_DUPLICATE')`. Everything else was assumed retryable, and `retryFailed()`
resets `retryCount` to 0, so **the operator's own Retry button re-armed a submission that could never
succeed.** `MAX_RETRIES = 3` would have parked it quietly; the manual retry is what kept it alive.
The only escape was `indexedDB` in a browser console. **A field enumerator does not have one.**

✅ **AC4.1 + AC4.2 HOTFIXED 2026-08-06** (Awwal's instruction, before the smoke resumes):
- `isPermanentFailure()` classifies on **HTTP status, not message string** — a message is prose that
  changes when someone edits it; the status is the contract. 4xx is permanent EXCEPT 408/429
  ("try again" by definition) and 401/403 (a token refresh legitimately changes the outcome).
  Network/offline/5xx stay retryable — that is the condition this queue exists for.
- `permanentFailure` + `failureStatus` persist on the queue row; `retryFailed()` and `syncAll()`
  both skip permanent rows, and the row is parked at `MAX_RETRIES` so any counter-only check stops
  too.
- **A `Discard N rejected` action** on the Sync Status page, because classification alone just parks
  the item in the banner forever, which is not better. Hard delete: the server never accepted the
  row, so there is no counterpart to reconcile. **RED-verified** — reverting the classifier to the
  pre-fix behaviour fails the 422 test.

#### ⬜ AC4.3 — STILL TO BUILD: discard an IN-PROGRESS form (Awwal's original request)

> *"a button the Enumerator can click at any time to discard a form they are filling, in which case
> the respondent declined to continue … and the half-filled form will be causing issues as it would
> be partly saved and prevents a new full registration."*

This is the field reality the queue fix does not cover: an interview that **ends mid-way** — the
respondent declines, it is the wrong person, a name was mis-keyed.

1. A **Discard** control on `FormFillerPage` (and `ClerkDataEntryPage`), available at ANY step, not
   only the last.
2. It must clear **the local draft AND its provisional reference code** (`_referenceCode`,
   `FormFillerPage.tsx:128`). Leaving the code behind is how the next respondent inherits someone
   else's number.
3. Confirm before discarding, and say plainly that the answers are gone — this is destructive and
   irreversible by design, which is the point.
4. ⚠️ **Discard must NOT create a submission.** No queue row, no server call, nothing to sync. An
   abandoned interview is not a registration.
5. Record that it happened — a count of discards per enumerator is a supervision signal (a high
   rate may mean a script problem, not a refusal problem). Local counter is enough; no PII.

#### 🔴 AC4.3b — RESTORE TO DRAFT, NOT JUST DISCARD (found 2026-08-06, and it corrects AC4.2)

**On submit the draft is DELETED** (`useDraftPersistence.ts:224`), on the stated grounds that *"queue
item has all data needed for sync"*. True — **while the queue item exists.**

Which means the Discard action shipped in AC4.2 deletes **the only remaining copy of the interview**.
Confirmed empirically: after the failed submission's queue row was removed, the drafts store returned
`NO DRAFTS`. Every answer that enumerator collected is gone, and the respondent must be interviewed
again from scratch.

That is the wrong primary action, and I built it. For the failure that actually occurred — one
required field missing — the right response is obvious once stated: **reopen it, fill the field,
resubmit.** Nobody should re-interview a citizen because a form was one answer short.

1. **`Restore to draft`** is the PRIMARY action on a permanently-failed row: rehydrate
   `payload → drafts`, reusing the same id and its `_referenceCode`, and drop the queue row. The
   enumerator lands back in the form at the first unanswered required question.
2. **`Discard`** stays, demoted to secondary, with the confirmation stating plainly that the answers
   are destroyed and the respondent must be re-registered.
3. ⚠️ **Restore must re-run the completeness check locally first** and say what is missing, so the
   enumerator is not returned to a form that will fail identically. The 422's `missing[]` is already
   in the error message — parse it and jump straight there.
4. Reconsider deleting the draft at submit at all. Keeping it until the queue row reaches `synced`
   costs a little device storage and removes this entire failure class. The current ordering comment
   shows the author was already thinking about crash-safety — this is the same concern, one step
   later in the lifecycle.

#### 🔴 AC4.6 — ✅ THE ACTUAL ROOT CAUSE: THE ENUMERATOR FORM NEVER COMPUTED `age` (FIXED 2026-08-06)

**This is what stopped the smoke, and it is a go-live blocker, not a smoke annoyance.**

```
FormRenderer.tsx        (public wizard):  withCalculatedFields × 3
FormFillerPage.tsx      (ENUMERATOR):     withCalculatedFields × 0
ClerkDataEntryPage.tsx  (CLERK):          withCalculatedFields × 0
```

A gate like `age >= 15` reads a field **nobody answers** — `age` is derived from `dob` by the form's
`calculations`. Story 9-54 taught `FormRenderer` to evaluate those first, but the enumerator and
clerk pages carry their **own copy of the navigation logic** and never got it. They passed RAW
answers, so `age` was absent, `Number(undefined)` is `NaN`, and **both** `age >= 15` and `age < 15`
returned false.

**Consequence, on every enumerator and clerk submission:**
- **Labour Force Participation was silently skipped** — the entire purpose of a labour registry.
- **The under-15 guardian-consent section was silently skipped** — a child-protection control (9-55).
- The server, which computes `age` correctly, then rejected the submission **422** — which until the
  same day's AC4.2 hotfix was an unclearable poison pill.

**THE DIAGNOSTIC THAT MATTERED, recorded because I missed it for four hypotheses:** `age >= 15` and
`age < 15` are **mutually exclusive — one must always be true.** Both sections vanishing could only
ever mean the operand did not exist. I chased the form schema, the date format, the service worker
and a stale bundle first; each died in one measurement. **The symptom named the cause from the
start.**

✅ **FIXED — and deliberately not by patching the two pages.** The derivation moved INTO
`skipLogic.ts`: `getVisibleQuestions` / `getNextVisibleIndex` / `getPrevVisibleIndex` now take
`{ calculations }` and evaluate them themselves. Leaving it to callers is precisely what let two of
three surfaces drift for months; the function that needs the value now computes it, so a fourth
surface cannot reintroduce this. All 8 enumerator/clerk call sites updated.

**RED-verified.** Reverting the derivation yields `opened: +0` — the prod defect, reproduced. The
regression test asserts the invariant rather than the symptom: *a valid DOB must open **exactly one**
of the two gates, never zero.* A test documenting the pre-fix behaviour is kept alongside it so the
cost of omitting `calculations` stays legible.

⚠️ **REOPEN TRIGGER:** any submission rejected for a missing answer in an age-gated section.

#### ✅ AC4.4 — FIXED 2026-08-07 (was: THE ENUMERATOR IS SHOWN A NUMBER THE REGISTER NEVER STORES)

**FIX:** the completion screen no longer renders an unconfirmed reference code at all. Until the
queue row reports `synced` with a server code, it shows *"Not issued yet — this entry has not
finished uploading. **Do not give a reference number to the respondent yet.**"*

**The fact that settled the design:** `form.controller.ts:172` mints server-side and OVERWRITES
`_referenceCode` on EVERY submission, unconditionally. The provisional code is therefore not
"usually right" or "right when sync succeeds" — **it is guaranteed never to be the stored code.** A
caveat in small amber type under a large mono number cannot fix that, because the number IS the
answer to "what is my registration number?" and the operator has already read it aloud.

Also fixed alongside: reconciliation polled 6 × 500ms and then **gave up after 3 seconds**, leaving
the screen permanently unconfirmed on any slower-than-3s field connection with no further attempt.
Now backs off over ~2 minutes, and stops early on a `permanentFailure` row (AC4.2) rather than
polling for a code that can never arrive.

**RED-verified:** restoring the old render (show the code regardless of confirmation) fails the new
test. The test also asserts that **no `OSL-2026-XXXXXX` string appears anywhere on the completion
screen** while unconfirmed, so a future re-render of the provisional value elsewhere is caught too.

⚠️ **Deliberate trade, stated plainly:** an enumerator working offline now gets NO number to read
out until the entry syncs. That is a real reduction in offline capability, and it is the right one —
the alternative is a number that cannot be true. `/check-registration` retrieves it by phone or
email afterwards, and that path is named in the on-screen copy.

#### ✅ AC4.4b — WHERE THE ENUMERATOR GETS THE NUMBER INSTEAD (added 2026-08-07, Awwal's catch)

AC4.4 removed a wrong number. **On its own that is incomplete work** — it left the enumerator with
nothing to give the respondent. Awwal caught it immediately: *"how do they get it across?"*

**Measured, because the answer differs by cohort:**
| | | |
|---|---|---|
| **259 (82%)** | have an email | **automatic** — the 9-58 confirmation carries the number, no enumerator action. The smoke proved this end-to-end: `+smoke3`/`+smoke5` both show `sent` AND `delivered`. |
| **56 (18%)** | have no email | the enumerator **must relay it**, so they need somewhere to read it from |

**FIX:** the Sync Status page now shows, per entry:
- **the respondent's name** (from the payload) — so a row is identifiable BEFORE it syncs, when no
  code exists yet. "Which of today's twelve is still stuck?" is unanswerable against a list of
  identical form names and timestamps.
- **the issued reference code** once the row reaches `synced`, marked *"give this to the
  respondent"*, and `select-all` for copying into an SMS.
- **"No number yet — not uploaded"** otherwise, in amber.

⚠️ **The code is shown ONLY on a synced row — the same rule as the completion screen.** Printing the
provisional value here would reintroduce the exact defect AC4.4 just removed, one screen over.

**Remaining gap, and it is the 18%:** an enumerator must remember to come back to this page. Nothing
prompts them. Worth considering a "N entries synced since you last looked — 3 need a number passed
on" nudge, and SMS once Termii is resolved (9-27 Part B) so the 56 get theirs the way the 259 do.

Original analysis (still valid, now a subset):

**No longer a theory. It happened in the smoke, on submission #1.**

```
shown to the enumerator :  OSL-2026-DVJ0QW      (minted client-side, read from the draft)
stored in the register  :  OSL-2026-RGDANN
DVJ0QW in respondents   :  0 rows — it exists NOWHERE
```

The submission even carries `_referenceCode = OSL-2026-RGDANN`, so the provisional code was
**discarded and overwritten** rather than honoured. `reconcileReferenceCode` exists to repaint the
UI after sync, but the operator had already read the pre-sync value — which is precisely the moment
an enumerator says the number out loud to the person in front of them.

**In the field this is a registration number given to a citizen that will never match anything.**
They discover it at the counter, weeks later, with no way to prove what they were told.

⚠️ **This changes the severity of the original AC4.4 note.** It was written as "when sync
permanently fails, nobody tells the enumerator the number is void". The smoke shows worse: **the
code diverges even on a SUCCESSFUL sync.** Sync failure is not required.

Original analysis (still valid, now a subset):



`FormFillerPage.tsx:128` mints the code **in the browser** so the enumerator can read it back on the
spot — correct offline-first design, and it is honoured when the submission syncs. **But when sync
fails permanently, nobody tells the enumerator the number they gave out is void.**

In this smoke that number was `OSL-2026-N8D4YX`. It exists nowhere on the server. In the field,
Fatima would be holding a registration number for a registration that does not exist, and would
discover it only when she tried to use it.

1. A permanently-failed queue row must surface its provisional code and state that **it was never
   issued**.
2. The discard confirmation must name the code, so the enumerator knows to tell the respondent.
3. Consider withholding the code from the completion screen until the row reaches `synced` when the
   device is **online** — offline capture still needs it immediately, but an online failure is
   knowable within seconds and there is no reason to promise first and check later.

#### ⬜ AC4.5 — The client accepted a submission the server always rejects

`employment_status` is required in Section 4, the client let the form through, and the server 422'd
it. The required-gate and `validateSubmissionCompleteness` disagree.

**❌ MY FIRST HYPOTHESIS WAS WRONG, AND MEASURING IT TOOK ONE QUERY.** I proposed that the Master
form lacked the `age` calculation, so the client hid Section 4 while the server demanded its
answers. **Both forms carry an identical calculation** —
`int((today() - ${dob}) div 365.25)` — and the public wizard runs the same expression daily without
issue. Recorded rather than quietly deleted, because the *shape* of the guess was reasonable and the
next person will have it too.

**What is actually established:**
- The client evaluates skip-logic against `withCalculatedFields(formData, calculations, new Date())`
  (`FormRenderer.tsx:239`), so `age` IS computed client-side.
- Advancing is gated per-question by `trigger(currentQuestion.name)`, so a required *visible*
  question cannot be skipped with Next.
- Therefore Section 4 was almost certainly **never visible** — which points at `age` failing to
  evaluate at the moment visibility was decided, most plausibly a `dob` value/format that
  `withCalculatedFields` cannot parse on this surface.

**The evidence needed is on the device, not the server** — the failed queue row holds the entire
payload. Before discarding a permanently-failed row, dump `payload` and check: is `dob` present,
what format is it in, and is `employment_status` absent entirely (section never rendered) versus
present-but-empty (rendered and skipped)? Those two answers point at completely different bugs.

⚠️ **This is why AC4.4's "discard" must not be the FIRST thing an operator reaches for** — the
payload is the only diagnostic evidence a field failure ever produces, and discarding destroys it.
Worth considering whether discard should log the payload shape (field names only, no values) before
deleting.

### Residuals raised by the smoke itself (2026-08-07)

| ID | Finding | Sev | State |
|---|---|---|---|
| **R3** | **R21 only covers the NO-NIN case, and the gap is the COMMON citizen journey.** A real pair on prod, both `source=public`: `OSL-2026-56C9PG` (BASHIRU / YUSUFF TITILOPE, **no NIN**, 15:22) and `OSL-2026-W1PS38` (YUSUFF / BASHIRU, **NIN 44873253629**, 17:38 — *after* R21 deployed). Same phone, 2 shared name tokens. R21 did not attach because **the incoming submission had a NIN**, and the guard runs only when `ninValue === null`. The NIN-side dedupe cannot help either: it matches on NIN equality, and the first record has none. **So a person who registers without their NIN and returns with it gets two records — which is exactly what the pending-NIN cohort is being ASKED to do.** 23 people are pending today; the 9-12 ladder link updates in place, but anyone who instead re-registers from the front page duplicates. Not hypothetical: it already happened to a citizen. → handed to **13-53**. **Operational:** `56C9PG`/`W1PS38` need merging now (`merge:duplicates`, older-wins keeps 56C9PG). | **High** | **OPEN — handed to 13-53** |
| **R4** | ✅ **Smoke confirmed AC1b by EVIDENCE, not inference.** `identity_match_exempted_staff_capture` logged `would have merged into: OSL-2026-RGDANN, source: enumerator` — the guard ran, found the household member, and declined. Three rows survived one handset. Recorded because the row count ALONE would have looked identical had the guard never executed, which is the R21 trap. An accidental mistyped phone on #3 supplied a free negative control: same handset, only ONE shared name token, correctly not even considered. | — | ✅ **CLOSED — AC1b passed** |

## Adjudication verdict — 2026-08-06

**CODE ACCEPTED. STORY CORRECTLY STAYS `in-progress`** — its central deliverable, a prod smoke of
5–10 real enumerator submissions, has not run. Tasks 1 / 1b / 1c / 1d / 3 are unchecked and must
stay that way until it does. The code-review findings (H1–H3, M1–M4, L1) are all addressed, and M2 —
where the `clerk` rationale was wrong but the membership right — is the kind of self-correction that
makes the rest of the file trustworthy.

**Independently verified (not taken on report):**
| check | result |
|---|---|
| `tsc -p apps/api` | clean |
| `eslint src` | clean |
| the two changed suites | **95 passed** |
| AC1b exemption **RED-verified** — neutered `STAFF_CAPTURED_SOURCES.has(source)` | **3 tests fail** ✅ |
| H2 ambiguity refusal **RED-verified** — neutered `rows.length > 1` | **2 tests fail** ✅ |
| `ROLE_TO_SOURCE` really yields `enumerator`/`clerk` | confirmed — the exemption CAN fire |

The counterfactual log (`identity_match_exempted_staff_capture`) is the right instinct: it keeps the
lookup running so "how often would this have merged?" stays answerable. That is R21's lesson applied
before it was needed rather than after.

### Two residuals found in adjudication — neither blocks the smoke

| ID | Finding | Sev | State |
|---|---|---|---|
| **R1** | **The `?? 'enumerator'` fallback now grants merge-exemption to every UNMAPPED role.** `determineSubmitterRole` ends `ROLE_TO_SOURCE[role.name] ?? 'enumerator'`. Prod holds four roles absent from that map — `super_admin` (**2 users**), `government_official`, `supervisor`, `verification_assessor` — so each is now silently exempt from the R13 merge *and* written to `respondents.source` as `'enumerator'`, which is a data lie independent of the merge. The default is pre-existing; **this story gave it a new consequence.** Direction is defensible (everyone hitting the fallback is staff), which is why it is not a blocker — but it is silent, and `source` is read by analytics. Fix: map every role explicitly and make the fallback `'public'` (the conservative direction — merge rather than exempt) or throw. | Med | ✅ **CLOSED 2026-08-06 — fixed before the smoke.** All seven prod roles now map explicitly; the only non-staff role is `public_user`, every other role is `clerk` (accurate label + staff-captured for the exemption). An UNMAPPED role no longer resolves silently: it logs `submission_processing.unmapped_role` at **ERROR** and returns `clerk` — safe on both axes, since a duplicate is recoverable and a wrong-person merge is not. Pinned by an `it.each` over all seven roles. ⛔ **An existing test was asserting the DEFECT** (`should return "enumerator" for unmapped roles`) and had been green throughout — rewritten, with the history kept in its docblock. |
| **R2** | **The SQL `LIMIT 2` that feeds the H2 guard is covered by NO test.** The suite mocks `db.execute`, so the mock returns whatever rows the test supplies and the `LIMIT` in the query string is invisible to it. If that value regressed to `LIMIT 1` — which is exactly what it was before this story — `rows.length > 1` could never be true, **the ambiguity guard would silently never fire on prod, and all 95 tests would stay green.** Found by accident: my first RED-verify attempt neutered the SQL and nothing failed, which looked like a test-over-a-hole and was actually proof the SQL layer is untested. The JS guard is well covered; the query that feeds it is not. Fix: an integration test against the real DB with two respondents on one phone, or assert the `LIMIT` in the issued SQL the way `respondent-identity.test.ts` asserts `INTERSECT`. | Med | ✅ **CLOSED 2026-08-06 — fixed before the smoke.** Two tests now pin the SQL shape the mock cannot evaluate: the phone and email lookups must issue `LIMIT 2` (the guard needs a second row to detect ambiguity at all) and must filter `rolled_back`; the reference-code lookup stays `LIMIT 1` because it is genuinely unique. **RED-verified by regressing all three to `LIMIT 1` — the pre-story value — which now fails.** Same move as `respondent-identity.test.ts` asserting `INTERSECT`. |

### The smoke is now unblocked (it was not, yesterday)

Creating the enumerator account sends a staff invitation through the **email worker queue**, and
until 2026-08-05 that queue was about to auto-pause: `EMAIL_TIER` was unset, `EmailBudgetService`
enforced the free tier's 100/day against a Pro account, and the invitation would have failed
silently. `EMAIL_TIER=pro` is set and verified at runtime (`email.service.initialized tier=pro`).
**Run the smoke; the invitation will arrive.**

⚠️ **Carry into the smoke:** AC1c's teardown recipe was corrected on 2026-08-06 — `users` was missing
from the chain entirely (the wizard mints one per email; delete LAST, the `respondents` FK blocks it)
and `audit_logs` is EXEMPT because it is hash-chained.
