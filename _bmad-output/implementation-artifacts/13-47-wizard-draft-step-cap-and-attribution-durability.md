# Story 13-47: Wizard draft-step cap (prod defect) + attribution durability

Status: review

<!-- EMERGENT 2026-07-30, found while running Story 13-46 AC9's attribution liveness dry run against
     PRODUCTION. The dry run was supposed to be a five-minute confirmation that a shipped feature
     worked; it instead exposed a live seven-day production defect that had frozen 232 of 293 wizard
     drafts and made channel attribution structurally undeliverable. Root-caused, fixed, and
     RED-verified in the same session. This story is the record of work ALREADY DONE — it is not a
     plan. Written for adjudication: everything decided is here, with the evidence. -->

## Story

As **an operator about to spend money on a radio jingle and fire the launch blasts**,
I want **the public wizard to actually save drafts past step 5 and to record how each registrant heard about us**,
so that **blast recipients can resume where they left off instead of silently losing their answers, and paid channels can be judged on real attribution instead of an empty table.**

## Context & Evidence (measured against prod, 2026-07-30)

### The defect

The public wizard's step count is **form-driven**: `3 head steps (Basics/Contact/Consent) + one step
per form SECTION + 1 review` (`useWizardStepCount.ts:20-22`, mirroring `WizardPage.buildSteps`).
The server bounded it at a constant:

```ts
currentStep: z.number().int().min(1).max(5)   // registration.controller.ts:61 (pre-fix)
```

Correct for Story 9-12's **fixed five-step** wizard. Never re-derived when steps became
section-driven. On **2026-07-23** the 13-34 re-pin published a **six-section** public form:

```
pinned form 019f8ed3 → 25 questions / 6 sections → N = 3 + 6 + 1 = 10 steps
review step index 9 → serverStep 10 → 400 WIZARD_DRAFT_INVALID_INPUT
```

**Every draft autosave from step 6 upward was rejected for seven days.**

### Measured blast radius (prod, before the fix)

| Metric | Value |
|---|---|
| Drafts frozen at the cap (step 4-5) | **232 of 293** |
| `MAX(current_step)` across all drafts | **5** — in a ten-step wizard |
| Submissions carrying `campaign_source` | **0 of 84** |
| `ReportService.getCampaignBreakdown()` rows | **0** |
| Capped drafts that never completed a registration | **210** |
| Real users harmed | **≈0 — 291 of 293 drafts predate the re-pin** |

The last row is the only reason this is not an incident report. The defect went live 2026-07-23 and
almost no public traffic followed it; the one organic registration (2026-07-30 15:16Z) **completed
successfully**, because Story 13-23 had already moved `questionnaireFormId` into the submit payload.
Only draft-resume and attribution were dead. **The exposure ahead was the real risk:** those 291
pre-re-pin drafts belong to the blast audience, expire inside the campaign window, and would each
have hit the cap on resume against the new form.

### Why it stayed invisible for a week — four independent silencers

1. **The 400 was deliberately generic** (code review L4 — no Zod field structure to an
   unauthenticated caller) **and nothing logged the rejected field**, so it was indistinguishable
   from any other bad payload. This is the *second* incident with that signature; 13-23's
   `prefilledQuestionNames` was the first.
2. **The client swallowed it** into a `text-xs` footer reading *"We'll keep retrying"* — **false**:
   `scheduleSave` only re-fires on the next `formData` change, so a user who stops typing is never
   retried.
3. **The e2e resume tests stayed green.** `wizard-registration.spec.ts` exercises steps **0, 1, 2**,
   all inside the cap — including the harness that exists specifically to gate autosave-and-resume
   (`docs/runbooks/e2e-wizard-resume-harness.md`).
4. **Submissions still succeeded**, so every top-line metric looked healthy.

### The second, independent attribution fault

Even with the cap fixed, attribution was still fragile: `buildCampaignSource` read **only**
`draftFormData.extras` — the draft — while twelve lines above it, 13-23's comment says exactly why
that is wrong: *"The draft is a debounced best-effort copy the browser may never have flushed, so it
must not be the sole source."* The acquisition question is answered on the **Review** step with
Submit directly beneath it, and autosave is debounced **2s** — so anyone submitting promptly lost
their answer, with no trace. Fixing the cap alone would have left a silent, intermittent failure.

## Acceptance Criteria

1. **AC1 — The step cap no longer encodes a fixed wizard shape.** `saveDraftSchema.currentStep`
   accepts any plausible form-driven step count; the bound is a sanity check, documented as such,
   with an explicit "do not re-tighten to the step count of the day" note. ✅
2. **AC2 — Attribution does not depend on the draft.** The submit payload carries a **bounded,
   validated** `campaignSource`; the server applies **payload → draft** precedence (13-23's pattern),
   never draft-only. The draft remains a fallback for older clients. ✅
3. **AC3 — A draft autosave rejection is diagnosable.** The client response stays generic; the server
   logs the rejected field path (`registration.draft_rejected`) as a standing signal. ✅
4. **AC4 — A stalled autosave is visible to the user, and the copy is true.** The false "we'll keep
   retrying" is replaced with an accurate, prominent `role="alert"` warning. ✅
5. **AC5 — Regression tests that would have caught it, RED-verified.** Draft steps 6/10/25 accepted
   (deliberately NOT pinned to today's N=10); an absurd step still rejected; payload→draft precedence
   unit-tested; and a **wiring** test proving the controller passes the payload — the unit tests prove
   the logic, only the wiring test proves it fires. ✅
6. **AC6 — The class is guarded, not just the instance.** Pitfall **#46** records that a form re-pin
   changes the wizard step count and any server-side step bound is a claim about the form just
   replaced, with the post-re-pin check to run. ✅
7. **AC7 — Prod is safe in the meantime.** All 292 live drafts extended by one month
   (2026-08-31 → 2026-09-29) so the blast can be resolved without the audience expiring. ✅
8. **AC8 — DISCHARGE-ON-DEPLOY.** Re-run the 13-46 AC9 attribution liveness dry run against prod
   after CI is green and the deploy lands: one registration selecting a non-Radio channel arriving
   with `?ref=`, asserting **both** the stored `campaign_source` and `getCampaignBreakdown()`.
   ⏳ **OPEN — cannot be verified before deploy.**

## Tasks / Subtasks

- [x] **Task 1 — Root-cause the dry-run failure** (AC: #1)
  - [x] Eliminated three wrong hypotheses with evidence before landing on the cause: the 2s debounce
        race (refuted — a >1min wait still failed), a `.strict()` unknown-key rejection (refuted —
        client and server declare the same 19 keys), and "extras never persisted historically"
        (refuted — the draft population simply predates 13-1).
  - [x] Confirmed by `MAX(current_step) = 5` across 293 drafts in a ten-step wizard, plus the live
        form's section count read from `GET /forms/public-active`.
- [x] **Task 2 — Fix the cap** (AC: #1, #5)
  - [x] `.max(5)` → `.max(50)` with the full incident note in-place. RED-verified: the new test fails
        on `.max(5)`, passes on `.max(50)`, exactly one test flips.
- [x] **Task 3 — Make attribution draft-independent** (AC: #2, #5)
  - [x] Bounded `campaignSource` added to `submitWizardSchema` (channel ≤64; utm allow-list ≤120 each,
        both `.strict()`) — NOT a free-form blob, since spreading client `extras` into `raw_data`
        would let a crafted submit write arbitrary analytics keys.
  - [x] `buildCampaignSource(extras, payload)` — payload wins per field; empty UTM treated as no UTM
        so a hollow row cannot inflate the attributed count.
  - [x] Web: `toCampaignSourcePayload()` in `lib/attribution.ts` (its declared single-source-of-truth
        home), wired into the submit payload beside `questionnaireFormId`.
  - [x] RED-verified the WIRING test by unwiring the call site → exactly one test flips.
- [x] **Task 4 — Make the failure loud** (AC: #3, #4)
- [x] **Task 5 — Guard the class** (AC: #6) — Pitfall #46.
- [x] **Task 6 — Protect the audience** (AC: #7) — `UPDATE wizard_drafts SET expires_at = expires_at + interval '1 month'` → 292 rows; earliest expiry 2026-07-31 → **2026-08-31**; zero expiring within 7 days.
- [ ] **Task 7 — DISCHARGE-ON-DEPLOY** (AC: #8) — re-run the dry run once CI is green and deployed.

## Dev Notes

### ⚖️ Why the bound is a generous constant, not a derived value

Deriving the cap from the pinned form would couple the draft schema to a DB read on every autosave,
and would re-create the same failure the moment the two derivations disagreed. The honest shape is a
**sanity check on a client-supplied integer** — it exists to reject absurd input, not to encode the
wizard. `50` is ~5× any plausible form. The real guard against recurrence is Pitfall #46's
post-re-pin check plus the `registration.draft_rejected` signal, not a cleverer number.

### ⚖️ Why `campaignSource` is bounded rather than passing `extras` through

`extras` is deliberately `Record<string, unknown>` on the client. Spreading it into `raw_data` would
hand an unauthenticated caller arbitrary write access to the analytics substrate that 13-33's
canonical read aggregates. Only validated fields cross the boundary, mirroring `parseUtm`'s existing
allow-list and 120-char cap.

### KNOWN GAP (accepted)

The 2s autosave debounce still exists, so a **resumed** session's step position can lag reality by up
to one debounce window. That is cosmetic now — attribution no longer rides on it, and answers are
carried in the submit payload. A flush-on-submit would close it entirely; not done here because it
touches the hook's public surface and this story is a hotfix. Revisit if resume-position drift is
ever reported.

### 📌 THE 3-STAGE COMMIT PLAN (written down so adjudication can pick it up cold)

The working tree holds **three logically independent changes**. They must NOT ride together — stage 1
is a live production defect and must be independently revertable.

⚠️ **TWO FILES ARE SHARED ACROSS STAGES — do not try to split them.** `docs/infrastructure-cicd-playbook.md`
carries **Pitfall #45 (13-37)** *and* **#46 (13-47)**; `sprint-status.yaml` carries every story's
board row. Splitting either needs `git add -p` and is not worth the fragility. **Both ride in STAGE 3**,
which means the *documentation* of the stage-1 fix lands after the fix itself. That is deliberate and
correct: stage 1 must contain only what has to be revertable as a unit.

**STAGE 1 — `fix(13-47): raise the wizard draft-step cap + carry attribution in the submit payload`**
> ⚠️ **PUSH THIS ALONE, FIRST. Verify CI green + the deploy landed + the VPS SHA before staging 2.**
> This is a live production defect fix and must be independently revertable.
- `apps/api/src/controllers/registration.controller.ts` (cap + payload→draft precedence + `registration.draft_rejected` logging)
- `apps/api/src/validation/registration.schema.ts` (bounded `campaignSource`)
- `apps/api/src/routes/__tests__/registration.routes.test.ts` (steps 6/10/25, absurd-step, WIRING test)
- `apps/api/src/controllers/__tests__/campaign-source.test.ts` (precedence unit tests)
- `apps/web/src/features/registration/lib/attribution.ts` (`toCampaignSourcePayload`)
- `apps/web/src/features/registration/lib/__tests__/attribution.test.ts`
- `apps/web/src/features/registration/api/wizard.api.ts` (payload type)
- `apps/web/src/features/registration/pages/WizardPage.tsx` (payload + dep-array fix + honest autosave alert)
- `_bmad-output/implementation-artifacts/13-47-…md` (this file)

**STAGE 2 — `feat(13-37): registry-read drift CI guard`**
> Closes 13-37 only after CI proves the guard step **executed, ABOVE `Lint`** (Pitfall #45).
- `apps/api/src/lib/registry-read-drift.ts` *(new)*
- `apps/api/src/lib/__tests__/registry-read-drift.test.ts` *(new, 46 tests)*
- `apps/api/scripts/lint-registry-read-drift.ts` *(new)*
- `apps/api/package.json` (`lint:registry-read` + folded into `lint`)
- `.github/workflows/ci-cd.yml` (**guard step must stay ABOVE `Lint`**)
- `_bmad-output/implementation-artifacts/13-37-…md`

**STAGE 3 — `docs(epic-13): parity sweep, 13-41 re-scope, new stories 13-46/13-47/13-48, residual ledger`**
- `docs/infrastructure-cicd-playbook.md` (**Pitfalls #45 AND #46** — shared file, see note above)
- `docs/adjudication-agent-handoff.md` (§3 state, §5 backlog, §7 narrative entry 11, §8 D1/D9)
- `docs/roadmap-to-launch.md`
- `docs/runbooks/pre-blast-dry-run.md` (§0 — re-measure-don't-restore, wizard draft contract, attribution check)
- `_bmad-output/implementation-artifacts/13-34-…md` (disproven-claim correction)
- `_bmad-output/implementation-artifacts/13-41-…md` (PM re-scope)
- `_bmad-output/implementation-artifacts/13-46-…md` *(new)*
- `_bmad-output/implementation-artifacts/13-48-…md` *(new)*
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (**all** board rows — shared file)
- `_bmad-output/planning-artifacts/epics.md`

**Then, and only then:** CI green → deploy → VPS SHA → **re-run the AC9 dry run** (Task 7, free
identities `NIN 90000000014` / `lawalkolade+radio4@gmail.com`, a NON-Radio channel, entered with
`?ref=`) → flip 13-47 and 13-37 to `done` in the same commit as their deploy SHAs.

**Then, and only then:** CI green → deploy → VPS SHA → **re-run the AC9 dry run** (Task 7) → flip
13-47 and 13-37 to `done` in the same commit as their deploy SHAs.

### Dependencies
- None inbound. **13-46** consumes this: its AC9 dry run is Task 7 here, and its AC10 (denominator +
  de-bias) builds on attribution now actually working.
- No schema migration, no new deps.

### References
- [Source: `apps/api/src/controllers/registration.controller.ts:61-81` — the cap + its incident note]
- [Source: `…:649-652` — 13-23's "the draft must not be the sole source", the lesson not applied to attribution]
- [Source: `apps/web/.../hooks/useWizardDraft.ts:50,149` — `SAVE_DEBOUNCE_MS = 2000`, no flush]
- [Source: `apps/web/.../hooks/useWizardStepCount.ts:20-22` — `N = 3 + sections + 1`]
- [Source: `docs/infrastructure-cicd-playbook.md` — Pitfall #46]
- [Source: `13-46-…md` AC9/AC10 — the dry run that found this]
- [Source: `13-37-…md` → `## Retro Input (Epic 13)` R-1 — this is its fifth and worst instance]

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M context) — `claude-opus-5[1m]`, code-review/adjudication session, 2026-07-30.

### Debug Log References
- Prod dry run #1: registration completed, `campaign_source` absent. #2 with a >1min wait: still
  absent → debounce race refuted. #3 abandoned-at-review draft: `has_extras = f`, **`current_step = 4`**
  — the autosave had stopped, not merely dropped a field.
- `SELECT current_step, COUNT(*) FROM wizard_drafts GROUP BY 1` → `1:5, 2:32, 3:24, 4:111, 5:121`,
  `MAX = 5`. Initially misread as user drop-off; it is the schema ceiling.
- `GET /forms/public-active` → 25 questions, 6 distinct `sectionId`s → N = 10 → serverStep 10 > 5.
- Teardown by id (3 test identities incl. 2 `users`, 2 `marketplace_profiles`, 1 `magic_link_token`);
  prod restored to **145/82/1** with 0 orphans, organic registrant + super-admin intact.

### Completion Notes List
- **Found by a dry run, not by a test.** Every automated signal was green throughout. The only thing
  that caught it was exercising the real feature against real prod and checking the database.
- **Two RED-verifies**, each flipping exactly one test: the cap, and the payload wiring.
- **The wiring test is the important one.** Unit tests on `buildCampaignSource` prove the precedence
  logic; only the wiring test proves the controller passes the payload — the distinction this session
  kept finding ([[pattern-ship-a-fix-that-never-fires]]).

### File List
**Modified — API:** `src/controllers/registration.controller.ts` · `src/validation/registration.schema.ts` · `src/routes/__tests__/registration.routes.test.ts` · `src/controllers/__tests__/campaign-source.test.ts`
**Modified — Web:** `src/features/registration/lib/attribution.ts` · `src/features/registration/lib/__tests__/attribution.test.ts` · `src/features/registration/api/wizard.api.ts` · `src/features/registration/pages/WizardPage.tsx`
**Modified — Docs:** `docs/infrastructure-cicd-playbook.md` (Pitfall #46)
**New:** this file
**Prod data (no code):** `wizard_drafts.expires_at` +1 month, 292 rows

## Adjudication (Claude, 2026-07-31) — the first INDEPENDENT layer on this story

⚠️ **Why this section exists.** 13-47's `Agent Model Used` reads *"code-review/adjudication session"*
and its Change Log has a single author — i.e. **dev and review were the same pass**. Every other story
this month got three layers; this one, a live production defect on the public registration write path,
got one. That is the gap this section closes.

**Verified myself, not inherited:** api+web `tsc --noEmit` clean; `eslint src/features/registration`
clean; `registration.routes.test.ts` + `campaign-source.test.ts` → **66 passed**; attribution suite
**17 passed**.

**Re-ran the story's own RED-verify rather than trusting it.** Restoring `.max(5)` fails **exactly one**
test — *"ACCEPTS a draft at a step BEYOND 5 — the wizard step count is form-driven, not fixed"* —
1 failed / 55 passed. The claim reproduces precisely, including that only one test flips.

### AJ-1 [Med] — FIXED: attribution could block a submit, contradicting this story's own invariant

The story states attribution is *"best-effort + total: never throws, so attribution can never block a
submit (AC2.2/AC6)"*. That holds for `buildCampaignSource` server-side — but the NEW payload path
reintroduced blocking one layer earlier, at schema validation:

1. Draft `extras` is `z.record(z.unknown())` (`registration.controller.ts:111`) — deliberately
   unvalidated, because it is the forward-compat slot. The server stores whatever any client PUT there.
2. `toCampaignSourcePayload` **cast** `extras.utm as CapturedUtm` and read `acquisition.channel`
   without checking either — asserting a shape nothing enforces.
3. The submit field it feeds is `.strict()` and bounded, so a non-conforming draft rejects the **entire
   registration**.

**Measured against the real schema** (probe run, control included, then removed):

| campaignSource | Result |
|---|---|
| conforming (4 allow-listed keys) | **SUBMIT OK** |
| utm carries a 5th key | 400 `campaignSource.utm:unrecognized_keys` |
| utm value > 120 chars | 400 `campaignSource.utm.source:too_big` |
| channel > 64 chars | 400 `campaignSource.channel:too_big` |
| utm value not a string | 400 `campaignSource.utm.source:invalid_type` |

Latent today — the current client only ever writes conforming shapes — but `extras` is server-stored and
accepted from any client, **291 pre-re-pin drafts are about to be resumed by the blast audience**, and
the failure mode is *the registrant cannot submit at all*, behind the same generic 400 that hid this
story's original defect for seven days. Dropping a bad value costs one attribution row; forwarding it
costs the registration.

**FIX** (`lib/attribution.ts`): `boundedString` + `boundedUtm` sanitise at the boundary — only the four
allow-listed utm keys survive, each clamped to 120, channel clamped to 64, non-strings dropped, a
non-object utm treated as no UTM. Server stays `.strict()` (that strictness is deliberate and correct —
it is what stops a crafted submit writing arbitrary keys into the analytics substrate). Bounds are
commented as needing to move in step with the server schema.

**RED-verified:** reverting to the cast fails **exactly the 6 new tests**, while the 11 pre-existing
ones stay green — the blind-spot proof that the original suite could not see this.

**Not changed, flagged only:** the same `extras` looseness means a crafted draft can still 400 *its own*
submit via a direct API call. That is self-inflicted and carries no cross-user impact, so it is not worth
tightening the forward-compat slot for.

## Residuals

<!-- Added in adjudication 2026-07-31 (handoff §8 D1 / §2a0). 13-47 shipped without a ledger; its one
     open item lived as a bare `- [ ]` box, which is exactly the shape §2a0 exists to surface. -->

| ID | Severity | State | Re-runnable evidence | Owner |
|---|---|---|---|---|
| **R1** — AC8 / Task 7: re-run the 13-46 AC9 attribution liveness dry run against prod (one registration on a NON-Radio channel, arriving with `?ref=`) asserting BOTH the stored `raw_data->'campaign_source'` AND that `getCampaignBreakdown()` returns it | **High** — asserting only the write is how 13-9 shipped a funnel nobody read; and this story exists because attribution was believed live while being structurally undeliverable | **DISCHARGE-ON-DEPLOY** — blocks `done`, not the commit | Free identities `NIN 90000000014` / `lawalkolade+radio4@gmail.com`. After the deploy lands and the VPS SHA is confirmed: register via the public wizard with `?ref=`, choose a non-Radio channel, then `SELECT raw_data->'campaign_source' FROM submissions …` **and** call `getCampaignBreakdown()`. Tear down **by id** — ⚠️ never "restore to a baseline count" (R-5). | Awwal + the adjudication session that pushes stage 1 |
| **R2** — the 2s autosave debounce still means a RESUMED session's step position can lag by one debounce window | **Low** — cosmetic since attribution no longer rides on the draft and answers travel in the submit payload | **ACCEPTED** | **Measurement:** `SAVE_DEBOUNCE_MS = 2000` with no flush-on-submit (`useWizardDraft.ts:50,149`); the payload path now carries every answer that matters, so the only exposure is a resumed step index. **Reopen trigger:** any report of resume-position drift, or a story that reintroduces a draft-sole-sourced field. | Awwal |

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-07-30 | **Story created and implemented in one session.** Found while running 13-46 AC9's attribution liveness dry run against prod: a seven-day-live defect where `saveDraftSchema`'s `currentStep: .max(5)` — correct for the fixed five-step wizard of 9-12, never re-derived once steps became form-driven — rejected every draft autosave past step 5 after 13-34's 2026-07-23 re-pin published a six-section form (N=10). Measured: 232/293 drafts frozen, `MAX(current_step)=5`, `campaign_source` on 0/84 submissions. Four independent silencers kept it invisible (generic un-logged 400; a client message that falsely promised retries; e2e resume tests that only exercise steps 0-2; submissions succeeding anyway via 13-23's payload precedence). Fixed the cap, moved attribution into the submit payload with payload→draft precedence + a bounded schema, added server-side rejection logging and an honest visible client alert, minted Pitfall #46, and extended all 292 live drafts by a month. Two RED-verifies. AC8 (post-deploy dry run) is the single open residual. | Claude (code-review/adjudication) |
