# Story 13-48: Test-environment fidelity — the e2e wizard must have the shape production has

Status: ready-for-dev

<!-- EMERGENT 2026-07-30 from the Story 13-47 root-cause. 13-47 fixed a seven-day live defect
     (`saveDraftSchema.currentStep: .max(5)` vs a form-driven 10-step wizard). While asking "why did
     no test catch this", the answer turned out NOT to be a missing assertion: the e2e environment
     serves NO pinned public form, so the wizard under test degenerates to a 4-step head-only model
     while production runs 10 steps. The cap was UNREACHABLE by construction in the only environment
     that exercises the real wizard. This story closes the fixture gap, not the assertion gap.
     POST-LAUNCH test-infra hardening; NOT launch-gating. -->

## Story

As **a developer relying on CI to tell me the public wizard still works**,
I want **the test and e2e environments to serve a representative multi-section public form, and to assert that a draft persists at the wizard's FINAL step**,
so that **defects which only appear past the head steps stop being invisible to every automated signal we own.**

## Context & Evidence (verified 2026-07-30)

### The fixture gap, stated by the suite itself

`apps/web/e2e/wizard-registration.spec.ts:140`:

> *"The clamp + back/forward flows need only the app rendering (**the form fetch 404s → survey skipped
> → 4-step head model**)."*

So in e2e there is **no pinned public form**. `buildSteps` therefore yields only the head steps:

| Environment | Pinned form | Wizard shape |
|---|---|---|
| **Production** | `019f8ed3` — 25 questions / **6 sections** | `3 head + 6 sections + 1 review` = **10 steps** |
| **e2e / CI** | none (404) | `3 head + 0 + 1 review` = **4 steps** |

**Consequence:** no e2e test can reach step 5, let alone step 10. Story 13-47's `.max(5)` cap was
**unreachable by construction** in the one environment that drives the real wizard, and stayed green
for the entire seven-day outage. Every wizard behaviour past the head steps — section navigation,
13-35's all-prefilled section skip, the review step's attribution control, autosave at depth — is
**untested end to end**.

### The second gap: the draft-persistence e2e is disabled

`apps/web/e2e/golden-path.spec.ts:301` — **`test.fixme('GP-6: Draft saved to IndexedDB and resume works offline')`**.
The one test named for draft persistence does not run.

### Why an assertion alone cannot fix this

The pinned form is **production DATA, not code** — a re-pin is an upload, not a commit. No test in
this repository can observe it. That is a structural limit and it must be stated rather than papered
over: **CI can only guard the code side.** The data side needs a prod-facing signal (see AC5).

### Why "submit succeeded" is not a substitute

Throughout the outage, registrations **completed normally** — Story 13-23 had already moved
`questionnaireFormId` into the submit payload, so submission never depended on the broken draft. A
golden-path test that registers successfully would have passed every day of the incident. **The
assertion must be on the DRAFT ROW at the final step, not on submit.**

## Acceptance Criteria

1. **AC1 — A representative multi-section public form exists in the test/e2e environment.** The seed
   provisions and pins a native public form with **≥3 sections** (enough that `N > 5`, i.e. past the
   bound that broke), shaped like the real Public Core: identity/demographic/livelihood groupings,
   at least one question per section. It must be a *fixture*, versioned in the repo, not a copy of
   prod data (no PII, no NIN-bearing rows).
2. **AC2 — Seeding respects the established orchestrator rules.** Per 13-36 Task 6b: converge where
   the blast radius is dev/test-only and seed-owned; stay **create-only** where a run could touch
   real reference data. The form fixture is test-owned, so it may converge — but `main()`'s prod path
   must be unable to install it. State which rule applies and why, in the seed itself.
3. **AC3 — Integration test: the draft contract holds at the wizard's FINAL step.** A test derives
   `N = 3 + DISTINCT sectionId + 1` **from the pinned form** (never a hardcoded literal — hardcoding
   the step count of the day is the mistake 13-47 exists to fix) and asserts `PUT /registration/draft`
   at `currentStep = N` returns **200**. RED-verify by restoring `.max(5)`.
4. **AC4 — E2E: walk to the review step and assert the DRAFT PERSISTED there.** With AC1's form, the
   wizard e2e reaches the review step and asserts the server-side draft row records that step and its
   answers. Explicitly **not** an assertion that submit succeeded — submit worked throughout the
   incident. Un-`fixme` GP-6 or supersede it, stating which.
5. **AC5 — The DATA side gets a prod-facing signal, since CI cannot see a re-pin.** Route
   `registration.draft_rejected` (added by 13-47) into **13-42**'s ops digest as a delta signal: any
   occurrence is a client/schema contract drift, most likely a re-pin that moved the step count.
   Shape it to fire on the real defect, not on volume — 13-42's stated design rule.
6. **AC6 — The fidelity gap is closed as a CLASS, not an instance.** Document, next to the seed, the
   invariant: *the e2e environment must serve a form whose shape is representative of production; a
   head-only wizard silently exempts every section-dependent behaviour from testing.* Cross-reference
   Pitfall #46.
7. **AC7 — Green + no regression.** Existing e2e specs that rely on the current 404-therefore-4-step
   behaviour are updated deliberately, not accidentally: audit `wizard-registration.spec.ts`'s
   URL-clamp tests (they assert `?step=` bounds against the 4-step model and WILL shift). Full api +
   web suites, e2e, tsc, eslint clean.

## Tasks / Subtasks

- [ ] **Task 1 — The form fixture** (AC: #1, #2)
  - [ ] Author a versioned multi-section public-core fixture (≥3 sections, no PII).
  - [ ] Wire into the seed orchestrator with the converge/create-only ruling stated inline.
- [ ] **Task 2 — Integration test of the draft contract** (AC: #3)
  - [ ] Derive `N` from the pinned form; assert 200 at `currentStep = N`; RED-verify against `.max(5)`.
- [ ] **Task 3 — E2E to the review step** (AC: #4)
  - [ ] Walk the full wizard; assert the DRAFT ROW at the final step; resolve GP-6.
- [ ] **Task 4 — Prod-side signal** (AC: #5) — hand `registration.draft_rejected` to 13-42.
- [ ] **Task 5 — Document the invariant** (AC: #6)
- [ ] **Task 6 — Sweep + validate** (AC: #7) — expect the URL-clamp specs to need deliberate updates.

## Dev Notes

### ⚖️ Why this is a fixture story, not a test story

The instinct on reading "no test caught it" is to add an assertion. That would not have worked: there
was no step 6 to assert on, because the environment never built one. **A test can only be as faithful
as the world it runs in.** The generalisable form — worth carrying into the retro — is: *when a test
environment differs in SHAPE from production, it does not merely miss bugs, it makes a class of them
unreachable.* The 4-step-vs-10-step divergence made every section-dependent behaviour untestable
while every dashboard stayed green.

### KNOWN LIMIT (accepted, and must not be oversold)

AC1–AC4 guard the **code** side: re-tightening the bound, changing `buildSteps`, adding head steps.
They **cannot** catch the incident that actually happened — an operator pinning a prod form with more
sections than the bound allows — because the pinned form is prod data. AC5 (the digest signal) plus
Pitfall #46's post-re-pin check are the only mechanisms with line of sight to that. Do not let a
green CI badge be read as "the wizard contract holds in production."

### Sequencing
- **After 13-47 deploys.** 13-47 raised the bound; this story proves it stays raised.
- **Feeds 13-42** (AC5). Independent of 13-46, though both touch the pre-blast posture.
- No prod dependency, no schema change.

### References
- [Source: `apps/web/e2e/wizard-registration.spec.ts:140` — "the form fetch 404s → survey skipped → 4-step head model"]
- [Source: `apps/web/e2e/golden-path.spec.ts:301` — GP-6 draft persistence, `test.fixme`]
- [Source: `apps/web/.../hooks/useWizardStepCount.ts:20-22` — `N = 3 + sections + 1`]
- [Source: `13-47-…md` — the defect this makes visible; `docs/infrastructure-cicd-playbook.md` Pitfall #46]
- [Source: `13-36-…md` Task 6b — the seed converge-vs-create-only ruling AC2 must honour]
- [Source: `13-42-…md` — the ops-digest home for AC5]

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-07-30 | Story drafted, EMERGENT from the 13-47 root-cause. The e2e environment serves **no pinned public form** (`wizard-registration.spec.ts:140`), so the wizard under test is a **4-step head-only model** while production runs **10 steps** — the `.max(5)` cap was unreachable by construction and every automated signal stayed green through a seven-day outage. GP-6, the one draft-persistence e2e, is `test.fixme`. Scoped as a FIXTURE story (a representative multi-section form in the seed) rather than an assertion story, plus a draft-contract integration test deriving N from the pinned form, an e2e that asserts the DRAFT ROW at the final step (not that submit succeeded — submit worked throughout), and a prod-facing `registration.draft_rejected` signal via 13-42, because CI structurally cannot see a prod re-pin. 7 ACs / 6 Tasks. POST-LAUNCH, not launch-gating. Sequences after 13-47 deploys. | Claude (code-review/adjudication) |
