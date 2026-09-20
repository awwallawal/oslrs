# Story 13.71: The location is offered and not taken — capture it on open, and require it

Status: ready-for-dev

<!--
Authored 2026-09-18 by Bob (SM) via the canonical *create-story workflow
(_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml), yolo.

SOURCE OF SCOPE: _bmad-output/planning-artifacts/brief-2026-09-18-story-13-71-enumerator-gps-is-optional-in-practice.md
(adversarial-review session, out of 13-69's prod measurement).

⚠️ TIER: field blocker. Land BEFORE the enumerator cohort scales past the trial —
a GPS-less submission CANNOT be back-filled later. Unlike a missing fraud score,
which 13-69 proved is recoverable by re-running the engine, a location that was
never captured is gone for good, and the hole grows with every day and every
enumerator added.

⛔ TWO BINDING RULINGS (Awwal, 2026-09-18), both already applied to the brief:
  (1) The requirement is CODE-ENFORCED. Do NOT edit an XLSForm; do NOT re-upload;
      do NOT mint a new `questionnaire_forms` row.
  (2) Enumerators are BRIEFED FIRST. `docs/runbooks/enumerator-field-briefing.md`
      §3 is already written and in the tree; its "Coming soon" note is flipped to
      the present tense as this story's LAST task (Task 8).
-->

## Story

As **the operator who has to answer "where is this enumerator actually working?"**,
I want **the app to take the location itself when a survey opens, and to refuse a field submission that has neither coordinates nor a recorded reason why not**,
so that **coverage stops depending on whether someone remembers to press a button — measured at 4 of 36 submissions, from 3 of 10 enumerators — and every visit either carries a position or says, in the data, why it could not.**

## Acceptance Criteria

1. **AC1 — A survey opened in `mode="fill"` requests a position once, without blocking.** When the resolved schema serves a geopoint question, `FormFillerPage` requests the position as soon as the schema is available and writes the result into form state under **the schema's own geopoint question name**, not a hardcoded one. The first question renders immediately whether or not the position has arrived; nothing waits on the browser.

2. **AC2 — The value is refreshed at submit when it is free to do so.** If permission is already granted at submit time, a second position is taken and becomes the stored `gps_location`; the open-time position is retained in `raw_data` under a distinct key. RED-VERIFY the pair is distinguishable: a test asserts both are present and that the stored coordinate is the submit-time one. *(Why: a form opened at the door and submitted 20 minutes later records where the interview STARTED. For base-mapping, the submit-time fix is the truer one, and holding both makes "filled in one place, submitted in another" visible rather than invisible.)*

3. **AC3 — On the ENUMERATOR path, a submission with neither coordinates nor a reason is REFUSED, client and server.** The client blocks the submit; the server rejects with the existing `INCOMPLETE_SUBMISSION` shape. The server half mirrors `excludeGeopoint` with its opposite (`requireGeopoint`) in `form-submission-validation.service.ts` — same module, same vocabulary, opposite sign. ⛔ It must key on **"this form serves a geopoint question"**: two live submissions reference forms that serve none (one on Public Core, one on a deleted form row), and the rule must not make those unsubmittable.

4. **AC4 — The escape hatch exists, is explicit, and is DERIVED rather than chosen.** A submission may satisfy AC3 with `gps_unavailable_reason` instead of coordinates. ⭐ **The reason is taken from the browser's own `GeolocationPositionError.code`** — `permission_denied`, `position_unavailable`, `timeout`, `unsupported` — plus `other` for a manual override. ⛔ Do NOT ship a free-choice dropdown as the primary path: a list whose first item excuses the requirement becomes the fast way out of it, and the browser already knows the true cause. The enumerator confirms ("I could not capture a location"), they do not diagnose.

5. **AC5 — `gps_accuracy` is persisted end-to-end and read back FROM THE COLUMN.** `GeopointInput` already captures `accuracy` and throws it away. New nullable `gps_accuracy` column on `submissions`, threaded the whole chain, asserted in a real-DB test off the stored row. *(Without it a 2 km network fix and a 5 m satellite fix are indistinguishable, and base-mapping cannot tell a base from a neighbourhood. It also unblocks the "accuracy > 50 m" secondary signal `gps-clustering.heuristic.ts` documents as blocked on precisely this column.)*

6. **AC6 — `gps_unavailable_reason` is persisted as a COLUMN, not only in `raw_data`, and is countable per enumerator.** A reason buried in JSON cannot be grouped in the weekly ops read without a jsonb scan; the whole point is to count it.

7. **AC7 — The CLERK path is exempt, and a test fails if the exemption is removed.** `ClerkDataEntryPage` renders the same `QuestionRenderer`, and five of seven prod roles map to `clerk` (`determineSubmitterRole`). ⛔ A clerk transcribing paper forms records the OFFICE — office coordinates filed as field captures would actively poison the base map this story exists to enable.

8. **AC8 — No XLSForm is edited and no new `questionnaire_forms` row is minted.** Binding ruling. `git status` on `test-fixtures/` and `docs/launch-campaign/` is empty at close, and the live pin `wizard.public_form_id` is unchanged.

9. **AC9 — The OFFLINE path carries the new fields.** An enumerator submitting without signal queues through `offline-db` → `sync-manager` → `submitSurvey`. Every new field is threaded through that path too, asserted by a test. *(This is the chain's known silent-drop point: `sync-manager.ts:253-266` re-builds the payload field by field, so anything not named there is lost without an error.)*

10. **AC10 — A per-enumerator coverage surface exists, with its deploy-day prediction written down BEFORE it runs.** Submissions, captured, %, unavailable-reasons by code, median accuracy — per enumerator, per day — added to `docs/runbooks/ops-activity-monitoring.md`. **The prediction: GPS-carrying enumerator submissions go from 4 of 36 (11%) to >90% within one week of deploy.** Anything between is a UX failure to investigate, not a success to declare [[pattern-predict-then-compare]].

11. **AC11 — The briefing's "Coming soon" note becomes the present tense, as the LAST task.** `docs/runbooks/enumerator-field-briefing.md` §3 already describes this behaviour as future. The PDF renders from that Markdown at request time (`field-briefing.service.ts`), so the edit reaches the field with the deploy and there is no second artefact to go stale. ⛔ Flipping it before the code ships would brief people on behaviour they do not have.

12. **AC12 — ⛔ RULED IN FROM 13-73 (was its AC7): `duplicate_response` stops treating every geopoint as identical.** ⭐ TWO-PART ATTRIBUTION (§2al): EVIDENCE and RECOMMENDATION by adjudication, 2026-09-20; **RULING by Awwal, 2026-09-20 — "fix it once with 13-71"**. `calculateFieldMatchRatio` compares answers with `String(a[key] ?? '')` (`duplicate-response.heuristic.ts:21,24-40`), so any object answer renders `"[object Object]"` and **two DIFFERENT locations compare EQUAL**. ⛔ **THIS STORY IS WHAT MAKES THAT UNIVERSAL** — today only 4 of 35 enumerator submissions carry coordinates, so few pairs both have a geopoint and the bias is small; the moment AC3 takes effect, *every* enumerator pair gains one free matching field and `maxMatchRatio` is biased upward on the exact channel R-A8 is about to calibrate. **So the defect is created by this story and must be closed by it**, which is the whole reason the ruling moved it here rather than leaving it to 13-73. ⛔ Do NOT fix by dropping the key: two interviews at genuinely identical coordinates is real duplicate evidence, and `String()` destroys that too. Compare geopoints by **rounded lat/long** (13-69 R9). ⚠️ RED-VERIFY BOTH DIRECTIONS — two different locations must NOT match, **and** two identical ones must STILL match; a fix that only satisfies the first licenses the opposite defect. ⛔ **AC8's fence still holds: no threshold value changes** (`fraud-thresholds.seed.ts` diff empty) — this changes what "equal" means, never what fires.

## Tasks / Subtasks

- [ ] **Task 1 — Read the chain before changing it; it is hardcoded in one place** (AC: #1, #5, #6, #9)
  - [ ] 1.1 Confirm the client→column chain end to end and record what you find: `GeopointInput` writes `{latitude, longitude, accuracy}` under the question name → `useDraftPersistence.ts:186-195` reads **the literal `formData.gps_location`** → `enrichedPayload.gpsLatitude/gpsLongitude` → `form.controller.ts:158-159` `rawData._gpsLatitude/_gpsLongitude` → `webhook-ingestion.worker.ts:109-113` → the `submissions` columns. ⚠️ **The question NAME is hardcoded at `useDraftPersistence.ts:186`.** Auto-capture must read the name from the schema; either fix that hardcode or assert the two agree at runtime, and say which you did [Source: apps/web/src/features/forms/hooks/useDraftPersistence.ts:186-199].
  - [ ] 1.2 Confirm the OFFLINE branch re-builds the payload field-by-field at `sync-manager.ts:253-266` and that an unnamed field is dropped silently there. This is the AC9 risk in one line [Source: apps/web/src/services/sync-manager.ts:253-266].
  - [ ] 1.3 Confirm `submitFormSchema` (`form.controller.ts:22-31`) is the only server-side gate on the payload shape — a field absent from that zod object never reaches `rawData`.

- [ ] **Task 2 — Persist accuracy and the reason** (AC: #5, #6)
  - [ ] 2.1 Add nullable `gps_accuracy` (double precision) and `gps_unavailable_reason` (text) to `submissions` [Source: apps/api/src/db/schema/submissions.ts:62-63, beside the existing gps columns]. ⚠️ Deploy applies schema with `db:push`; keep `app_test` current locally (`db:push:full:force`).
  - [ ] 2.2 Extend `submitFormSchema` with `gpsAccuracy` (number, optional) and `gpsUnavailableReason` (enum of the AC4 vocabulary, optional).
  - [ ] 2.3 Thread both into `rawData` as `_gpsAccuracy` / `_gpsUnavailableReason` in `submitForm`, mirroring the existing `_gpsLatitude` lines exactly [Source: apps/api/src/controllers/form.controller.ts:156-159].
  - [ ] 2.4 Write both to their columns in the ingestion worker, mirroring the existing coordinate extraction and its `isNaN` guard [Source: apps/api/src/workers/webhook-ingestion.worker.ts:109-123].
  - [ ] 2.5 Real-DB test: a submission carrying accuracy and one carrying a reason each read back FROM THE COLUMN, not from the payload.

- [ ] **Task 3 — Auto-capture on open, refresh at submit** (AC: #1, #2)
  - [ ] 3.1 In `FormFillerPage` (`mode="fill"` only), once the schema resolves, find the geopoint question **by type** and request the position once. Non-blocking: the first question renders regardless. Store under the schema's question name.
  - [ ] 3.2 Keep `GeopointInput`'s manual button working and in sync — an auto-captured value must display exactly as a tapped one, and re-capture must still be possible.
  - [ ] 3.3 At submit, if `navigator.permissions` reports `granted`, take a second position; store it as the answer and retain the open-time one in `raw_data` under a distinct key.
  - [ ] 3.4 Thread `accuracy` into the payload in `useDraftPersistence` beside the existing `gpsLatitude`/`gpsLongitude` lines, and through `sync-manager`'s payload rebuild (AC9).

- [ ] **Task 4 — Require it on the enumerator path, client side** (AC: #3, #4, #7)
  - [ ] 4.1 Treat a geopoint question as required when the submitter is an enumerator AND the form serves one. ⛔ Derive "is enumerator" from the authenticated role (`useAuth`), never from the route.
  - [ ] 4.2 The blocked submit offers ONE action: "I could not capture a location", which records the derived `gps_unavailable_reason` from the last `GeolocationPositionError.code` (or `other` when there was no attempt) and then allows the submit.
  - [ ] 4.3 CLERK and PUBLIC paths unchanged — assert it (AC7).

- [ ] **Task 5 — Require it on the enumerator path, server side** (AC: #3, #7)
  - [ ] 5.1 Add `requireGeopoint` to `CompletenessOptions` beside `excludeGeopoint`, same module, opposite sign [Source: apps/api/src/services/form-submission-validation.service.ts:27-77].
  - [ ] 5.2 It must be satisfied by EITHER coordinates OR a reason, and must be a no-op when the form serves no geopoint question (AC3's two live cases).
  - [ ] 5.3 Set it ONLY on the enumerator branch of `submitForm` — key on `getSubmissionSource(user?.role) === 'enumerator'`, which is the same function the source column already uses [Source: apps/api/src/controllers/form.controller.ts:37-42,177].
  - [ ] 5.4 Tests: enumerator without either → 422 `INCOMPLETE_SUBMISSION`; enumerator with a reason → accepted; clerk without either → accepted; a form with no geopoint question → accepted.

- [ ] **Task 6 — The coverage surface** (AC: #10)
  - [ ] 6.1 Add the per-enumerator query to `docs/runbooks/ops-activity-monitoring.md`: submissions, with_gps, %, reasons by code, median accuracy — per enumerator, per day.
  - [ ] 6.2 Record the prediction (11% → >90% in one week) in the runbook BEFORE deploy, with the date it was made.

- [ ] **Task 6b — The duplicate comparison, RULED IN from 13-73** (AC: #12)
  - [ ] 6b.1 Compare geopoint answers by ROUNDED coordinates instead of `String()` identity [Source: apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts:21,24-40]. Pick the rounding precision deliberately and write down what it means on the ground — ~4 decimal places is ≈11 m at this latitude, which is the scale that distinguishes two households from one. State the figure; do not leave it implicit.
  - [ ] 6b.2 ⛔ RED-VERIFY BOTH DIRECTIONS on the heuristic's own suite (`__tests__/duplicate-response.heuristic.test.ts` already exists — extend it, do not start a new file): two DIFFERENT geopoints must no longer match, **and** two IDENTICAL ones must still match. Mutate each way and record the observed red.
  - [ ] 6b.3 ⚠️ Any answer that is an OBJECT hits the same `String()` path, not just geopoints — enumerate what else the live forms can store as an object before assuming geopoint is the only case, and say what you found. If there are others, fix the comparison generally or scope it explicitly and record why.
  - [ ] 6b.4 Quantify the change on real data: how many of the existing `fraud_detections` rows would move if rescored? ⭐ Read-only prod is open to you. If the answer is "none today", say so — that is the evidence this is prophylactic before 13-71 deploys and live the moment it does.
  - [ ] 6b.5 ⛔ `git diff` on `fraud-thresholds.seed.ts` must be EMPTY at close (13-73 AC8's fence, inherited with the AC).

- [ ] **Task 7 — Gates, run yourself, quoted whole** (AC: all)
  - [ ] 7.1 `pnpm tsc --noEmit` per package; api lint + the 3 drift guards; **web lint + tsc — this story DOES change web files**, unlike 13-69.
  - [ ] 7.2 FULL api suite from `apps/api` and the web suite from `apps/web`, against `app_test`. Quote the SUITE total, never a subset [[feedback-quote-the-suite-total-never-a-subset]].
  - [ ] 7.3 Explain every test-count delta [[pattern-unexplained-test-delta-is-unrecorded-work]].

- [ ] **Task 8 — LAST: flip the briefing to the present tense** (AC: #11)
  - [ ] 8.1 Rewrite §3's "Coming soon" block in `docs/runbooks/enumerator-field-briefing.md` as current behaviour; bump the version line.
  - [ ] 8.2 Re-run the briefing tests and read the rendered PDF back — the record of the work is not the work [[pattern-a-record-about-the-work-is-not-the-work]].

## Dev Notes

### What was measured, and when (2026-09-18, read-only against prod `5c4cc93`)

| | |
|---|---|
| Enumerator submissions in the trial window (≥ 2026-09-05) | **36** |
| …carrying coordinates | **4**, from **3 of 10** enumerators |
| All-time enumerator submissions with GPS | **5 of 37 (13.5%)** |
| Most active enumerator | **1 of 23** |
| `raw_data` has `gps_location` / has `_gpsLatitude` / column set | **5 / 5 / 5** |

⭐ **The last row is the important one: the chain is SOUND.** Every capture that happens reaches the column — nothing is dropped between the component and the database. This story is therefore about the TAP, not about plumbing, and any plumbing change (accuracy, reason, offline) must be tested as carefully as the chain that already works. Re-measure before building; these numbers are perishable (A12).

### Why it is skipped today — traced, not assumed

`FormFillerPage` renders **one question per screen**. `gps_location` is the only question in the master form's `General` section, so it is its own screen, the first one. `GeopointInput` does nothing until the button is pressed, and client validation rejects an empty answer **only when `question.required` is true** (`formSchema.ts:72`) — on the live form it is `false`. The server's completeness gate enforces required questions only. **So "Next" on an untouched capture button is a complete, valid submission.** Nine of ten enumerators did exactly that.

⚠️ **And a refusal is invisible today.** When permission is denied, `GeopointInput` shows *"Location access denied. GPS data will not be recorded"* and the form submits. "Did not tap" and "tapped and was refused" are the same absent value — which is why AC4's reason is not decoration, it is the difference between a field problem and a phone problem.

### Risks

- **R-a — Permission denial is STICKY.** A browser "Block" persists per origin and the re-prompt path is buried in site settings. If the rollout prompts badly once, that phone needs a manual fix. ⛔ Brief before deploying (Task 8 ships with the code, and the briefing is already written).
- **R-b — Battery and latency.** `enableHighAccuracy: true, timeout: 10000, maximumAge: 60000`. The cache makes repeat opens cheap; the first open of the day is the slow one. Never block the first question on it (AC1).
- **R-c — Two live submissions cannot satisfy a geopoint requirement at all** (one on Public Core, one on a form row that no longer exists). AC3's "only when the form serves a geopoint question" is what keeps them submittable.
- **R-d — The offline rebuild drops what it does not name** (`sync-manager.ts:253-266`). This is where AC5/AC6 will silently fail if AC9 is treated as an afterthought.
- **R-e — Staff location tracking.** Today an enumerator chooses to be located; after this they are located. The briefing says so in plain words, and that was Awwal's ruling. ⚠️ The FORMAL half — whether the terms accepted at activation need the same sentence — is **still open and belongs to Awwal/the ministry**, not to this story.

### Out of scope — do NOT widen

- **Base-assignment clustering / a bases read model** → Phase 2. ⚠️ The DBSCAN in `gps-clustering.heuristic.ts` reads a cluster as SUSPICIOUS; base-mapping reads the same cluster as A WORKPLACE. Same maths, opposite semantics — do not reuse the heuristic's output as a base map.
- **Fraud thresholds / what a GPS score fires at** → R-A8.
- **The public wizard** — `oslsr_public_core_v1` serves no geopoint question and 13-34 removed it deliberately. ⛔ Do not re-add it.
- **Back-filling the 32 GPS-less enumerator rows already taken** — they are GPS-less for good. 13-69's R1 scores them on the other detectors.
- **Editing any XLSForm** (AC8, binding).

### Project Structure Notes

No new directories. Files this story is expected to touch:

- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — auto-capture on schema resolve; submit-time refresh; the enumerator requirement gate.
- `apps/web/src/features/forms/components/GeopointInput.tsx` — display an auto-captured value; surface the derived failure reason.
- `apps/web/src/features/forms/hooks/useDraftPersistence.ts` — `accuracy` + reason into the payload; the hardcoded `gps_location` name (Task 1.1).
- `apps/web/src/services/sync-manager.ts` — the offline payload rebuild (AC9).
- `apps/api/src/controllers/form.controller.ts` — `submitFormSchema`; `rawData._gpsAccuracy` / `_gpsUnavailableReason`; the `requireGeopoint` branch.
- `apps/api/src/services/form-submission-validation.service.ts` — `requireGeopoint`.
- `apps/api/src/workers/webhook-ingestion.worker.ts` — the two new columns.
- `apps/api/src/db/schema/submissions.ts` — `gps_accuracy`, `gps_unavailable_reason`.
- `docs/runbooks/ops-activity-monitoring.md` — the coverage query + the prediction.
- `docs/runbooks/enumerator-field-briefing.md` — Task 8, LAST.

⛔ **NOT touched:** any XLSForm, `registration.controller.ts` (the public wizard), `ClerkDataEntryPage.tsx` behaviour, and everything under `fraud-heuristics/`.

### References

- [Source: _bmad-output/planning-artifacts/brief-2026-09-18-story-13-71-enumerator-gps-is-optional-in-practice.md] — scope, both rulings, the measured table.
- [Source: _bmad-output/implementation-artifacts/13-69-fraud-engine-is-dark.md] — the prod measurement this story comes from; R6 (clerk channel), R8 (deleted form rows), and AC9's pin asymmetry.
- [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx:560] — the one-question-per-screen `QuestionRenderer` mount; routes at `App.tsx:1121` (`survey/:formId`) and `:1435` (`surveys/:formId`).
- [Source: apps/web/src/features/forms/components/GeopointInput.tsx] — tap-driven capture; `accuracy` captured and discarded; the four `GeolocationPositionError` branches AC4 derives from.
- [Source: apps/web/src/features/forms/utils/formSchema.ts:72] — `required` is the only thing that blocks an empty answer.
- [Source: apps/web/src/features/forms/hooks/useDraftPersistence.ts:186-199] — the hardcoded `gps_location`; `completionTimeSeconds`.
- [Source: apps/web/src/services/sync-manager.ts:253-266] — the offline payload rebuild.
- [Source: apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx:23,639] — clerks render the same component (AC7).
- [Source: apps/api/src/controllers/form.controller.ts:22-31,37-42,156-159,177] — the zod gate, `getSubmissionSource`, the `_gps*` threading, the queued source.
- [Source: apps/api/src/services/form-submission-validation.service.ts:27-77] — `excludeGeopoint`, the shape Task 5 mirrors.
- [Source: apps/api/src/workers/webhook-ingestion.worker.ts:109-123] — coordinate extraction + `isNaN` guards.
- [Source: apps/api/src/db/schema/submissions.ts:62-63] — the existing gps columns; no accuracy column.
- [Source: apps/api/src/services/fraud-heuristics/gps-clustering.heuristic.ts] — the "accuracy > 50 m" signal documented as blocked on the missing column.
- [Source: docs/runbooks/enumerator-field-briefing.md §3] — already written; Task 8 flips its tense.
- [Source: docs/runbooks/enumerator-prod-smoke-and-golive-gate.md §0.1a] — the locked-out cohort this story's briefing reaches.

### How to run the things this story asks for

- **Tests from the package, never the repo root** — `cd apps/api && pnpm vitest run src/...` and `cd apps/web && pnpm vitest run src/...`. Root skips `mockReset` [[pitfall-vitest-from-repo-root-skips-mockreset]].
- **Real-DB tests need the test database explicitly**: `NODE_ENV=test DATABASE_URL=<…app_test>`, `beforeAll`/`afterAll`, a run-unique tag [[local-test-db-parity]].
- **After the schema change**, keep `app_test` current: `DATABASE_URL=…/app_test pnpm --filter @oslsr/api db:push:full:force`.
- **`pnpm`, never `npx`.** ESM throughout.
- **Browser geolocation needs a secure context** — it works on `localhost` and on HTTPS; it does NOT work over plain HTTP to a LAN IP, which is the usual "it works on my machine, not on the test phone".

### Project context

`_bmad-output/project-context.md` applies unchanged — note **A12** (a live number carries its date and query), **A13** (a task blocked on a measurement records the attempt), and **A14** (a detector says which kind of zero it is; AC4's reason is the same principle applied to a capture).

## Dev Agent Record

### Agent Model Used

_(dev-story fills this in)_

### Debug Log References

### Completion Notes List

### File List

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-09-18 | Story authored via canonical `*create-story` (yolo) from the 2026-09-18 brief, with both of Awwal's rulings carried in as binding (code-enforced requirement; brief the enumerators first). | The GPS gap is the one field-readiness defect whose data loss is PERMANENT — a missing fraud score can be back-scored, a location never captured cannot. |

### Review Follow-ups (AI)

_(placeholder — populated by the adversarial code-review agent)_
