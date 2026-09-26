# Story 13.71: The location is offered and not taken — capture it on open, and require it

Status: review

<!--
⛔ STATUS REVERTED `review` → `in-progress` BY ADJUDICATION, 2026-09-23, after `/code-review ultra`
returned FIFTEEN defects that three prior passes — dev, same-model adversarial review, and
adjudication itself — had all missed. **Adjudication's earlier verdict of "the work is sound" was
wrong.** All fifteen were then re-verified against the tree by adjudication; see
"⛔ ULTRA REVIEW FINDINGS" below for the per-row evidence.

⛔ DO NOT DEPLOY THIS AS IT STANDS. Field-blocking, in rough order:
  • U1  public respondents are silently geolocated (no role gate on the auto-capture effect)
  • U4  the pending-NIN exit swallows a failed queue write and shows "Survey saved!"
  • U5  the PRIMARY submit exit has no try/catch at all
  • U6  a failed retry path produces DUPLICATE citizen registrations
  • U7  three server-owned keys bypass zod — forged coordinates and a neutralised speed heuristic
  • U2  a stale client bundle is a PERMANENT 422, parked and never retried
-->


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

- [x] **Task 1 — Read the chain before changing it; it is hardcoded in one place** (AC: #1, #5, #6, #9)
  - [x] 1.1 Confirm the client→column chain end to end and record what you find: `GeopointInput` writes `{latitude, longitude, accuracy}` under the question name → `useDraftPersistence.ts:186-195` reads **the literal `formData.gps_location`** → `enrichedPayload.gpsLatitude/gpsLongitude` → `form.controller.ts:158-159` `rawData._gpsLatitude/_gpsLongitude` → `webhook-ingestion.worker.ts:109-113` → the `submissions` columns. ⚠️ **The question NAME is hardcoded at `useDraftPersistence.ts:186`.** Auto-capture must read the name from the schema; either fix that hardcode or assert the two agree at runtime, and say which you did [Source: apps/web/src/features/forms/hooks/useDraftPersistence.ts:186-199].
  - [x] 1.2 Confirm the OFFLINE branch re-builds the payload field-by-field at `sync-manager.ts:253-266` and that an unnamed field is dropped silently there. This is the AC9 risk in one line [Source: apps/web/src/services/sync-manager.ts:253-266].
  - [x] 1.3 Confirm `submitFormSchema` (`form.controller.ts:22-31`) is the only server-side gate on the payload shape — a field absent from that zod object never reaches `rawData`.

- [x] **Task 2 — Persist accuracy and the reason** (AC: #5, #6)
  - [x] 2.1 Add nullable `gps_accuracy` (double precision) and `gps_unavailable_reason` (text) to `submissions` [Source: apps/api/src/db/schema/submissions.ts:62-63, beside the existing gps columns]. ⚠️ Deploy applies schema with `db:push`; keep `app_test` current locally (`db:push:full:force`).
  - [x] 2.2 Extend `submitFormSchema` with `gpsAccuracy` (number, optional) and `gpsUnavailableReason` (enum of the AC4 vocabulary, optional).
  - [x] 2.3 Thread both into `rawData` as `_gpsAccuracy` / `_gpsUnavailableReason` in `submitForm`, mirroring the existing `_gpsLatitude` lines exactly [Source: apps/api/src/controllers/form.controller.ts:156-159].
  - [x] 2.4 Write both to their columns in the ingestion worker, mirroring the existing coordinate extraction and its `isNaN` guard [Source: apps/api/src/workers/webhook-ingestion.worker.ts:109-123].
  - [x] 2.5 Real-DB test: a submission carrying accuracy and one carrying a reason each read back FROM THE COLUMN, not from the payload.

- [x] **Task 3 — Auto-capture on open, refresh at submit** (AC: #1, #2)
  - [x] 3.1 In `FormFillerPage` (`mode="fill"` only), once the schema resolves, find the geopoint question **by type** and request the position once. Non-blocking: the first question renders regardless. Store under the schema's question name.
  - [x] 3.2 Keep `GeopointInput`'s manual button working and in sync — an auto-captured value must display exactly as a tapped one, and re-capture must still be possible.
  - [x] 3.3 At submit, if `navigator.permissions` reports `granted`, take a second position; store it as the answer and retain the open-time one in `raw_data` under a distinct key.
  - [x] 3.4 Thread `accuracy` into the payload in `useDraftPersistence` beside the existing `gpsLatitude`/`gpsLongitude` lines, and through `sync-manager`'s payload rebuild (AC9).

- [x] **Task 4 — Require it on the enumerator path, client side** (AC: #3, #4, #7)
  - [x] 4.1 Treat a geopoint question as required when the submitter is an enumerator AND the form serves one. ⛔ Derive "is enumerator" from the authenticated role (`useAuth`), never from the route.
  - [x] 4.2 The blocked submit offers ONE action: "I could not capture a location", which records the derived `gps_unavailable_reason` from the last `GeolocationPositionError.code` (or `other` when there was no attempt) and then allows the submit.
  - [x] 4.3 CLERK and PUBLIC paths unchanged — assert it (AC7).

- [x] **Task 5 — Require it on the enumerator path, server side** (AC: #3, #7)
  - [x] 5.1 Add `requireGeopoint` to `CompletenessOptions` beside `excludeGeopoint`, same module, opposite sign [Source: apps/api/src/services/form-submission-validation.service.ts:27-77].
  - [x] 5.2 It must be satisfied by EITHER coordinates OR a reason, and must be a no-op when the form serves no geopoint question (AC3's two live cases).
  - [x] 5.3 Set it ONLY on the enumerator branch of `submitForm` — key on `getSubmissionSource(user?.role) === 'enumerator'`, which is the same function the source column already uses [Source: apps/api/src/controllers/form.controller.ts:37-42,177].
  - [x] 5.4 Tests: enumerator without either → 422 `INCOMPLETE_SUBMISSION`; enumerator with a reason → accepted; clerk without either → accepted; a form with no geopoint question → accepted.

- [x] **Task 6 — The coverage surface** (AC: #10)
  - [x] 6.1 Add the per-enumerator query to `docs/runbooks/ops-activity-monitoring.md`: submissions, with_gps, %, reasons by code, median accuracy — per enumerator, per day.
  - [x] 6.2 Record the prediction (11% → >90% in one week) in the runbook BEFORE deploy, with the date it was made.

- [x] **Task 6b — The duplicate comparison, RULED IN from 13-73** (AC: #12)
  - [x] 6b.1 Compare geopoint answers by ROUNDED coordinates instead of `String()` identity [Source: apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts:21,24-40]. Pick the rounding precision deliberately and write down what it means on the ground — ~4 decimal places is ≈11 m at this latitude, which is the scale that distinguishes two households from one. State the figure; do not leave it implicit.
  - [x] 6b.2 ⛔ RED-VERIFY BOTH DIRECTIONS on the heuristic's own suite (`__tests__/duplicate-response.heuristic.test.ts` already exists — extend it, do not start a new file): two DIFFERENT geopoints must no longer match, **and** two IDENTICAL ones must still match. Mutate each way and record the observed red.
  - [x] 6b.3 ⚠️ Any answer that is an OBJECT hits the same `String()` path, not just geopoints — enumerate what else the live forms can store as an object before assuming geopoint is the only case, and say what you found. If there are others, fix the comparison generally or scope it explicitly and record why.
  - [x] 6b.4 Quantify the change on real data: how many of the existing `fraud_detections` rows would move if rescored? ⭐ Read-only prod is open to you. If the answer is "none today", say so — that is the evidence this is prophylactic before 13-71 deploys and live the moment it does.
  - [x] 6b.5 ⛔ `git diff` on `fraud-thresholds.seed.ts` must be EMPTY at close (13-73 AC8's fence, inherited with the AC).

- [x] **Task 7 — Gates, run yourself, quoted whole** (AC: all)
  - [x] 7.1 `pnpm tsc --noEmit` per package; api lint + the 3 drift guards; **web lint + tsc — this story DOES change web files**, unlike 13-69.
  - [x] 7.2 FULL api suite from `apps/api` and the web suite from `apps/web`, against `app_test`. Quote the SUITE total, never a subset [[feedback-quote-the-suite-total-never-a-subset]].
  - [x] 7.3 Explain every test-count delta [[pattern-unexplained-test-delta-is-unrecorded-work]].

- [x] **Task 8 — LAST: flip the briefing to the present tense** (AC: #11)
  - [x] 8.1 Rewrite §3's "Coming soon" block in `docs/runbooks/enumerator-field-briefing.md` as current behaviour; bump the version line.
  - [x] 8.2 Re-run the briefing tests and read the rendered PDF back — the record of the work is not the work [[pattern-a-record-about-the-work-is-not-the-work]].

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

Claude Opus 5 (1M context) — BMAD `dev-story` workflow, 2026-09-20.

### Debug Log References

**Baselines MEASURED on the working tree before any edit (2026-09-20), not inherited:**

| | Files | Tests | Result |
|---|---|---|---|
| API baseline | 330 | 4,657 | 4,649 passed / 8 skipped / 0 failed, exit 0 |
| Web baseline | 281 | 3,107 | 3,105 passed / 2 todo / 0 failed, exit 0 |

The API baseline reproduces 13-70's closing figure exactly, so the two are comparable.

**Mutation proofs — every new marker, both directions, OBSERVED output not intention.**
Each mutated file was restored and verified **md5-identical** afterwards.

| # | Mutation | Observed |
|---|---|---|
| M1 | Delete the two column writes from `webhook-ingestion.worker.ts` | **3 red** — `expected null to be 12.5`, `expected null to be 'permission_denied'`, `expected [{reason: null, n: 3}]`. Restored → 5/5 green. |
| M2 | `permissionAllowsSilentRefresh` returns `false` when the Permissions API is absent (i.e. the exact defect the pre-flight predicted) | **3 red**, all `expected false to be true`, all three in the iOS-Safari block. Restored → 22/22 green. |
| M3 | Remove `gpsAccuracy` / `gpsUnavailableReason` from `sync-manager`'s field-by-field rebuild | **2 red** (AC9). Restored → 32/32 green. |
| M4 | `requireGeopoint = true` (AC7 exemption removed) | **3 red** — the clerk, public and supervisor cases. |
| M5 | Remove AC3's "form serves a geopoint question" fence | **8 red** — my fence test **plus 7 pre-existing cases**, which is the lockout the fence prevents, measured. |
| M6 | Revert `canonicaliseAnswer` to `String(a[key] ?? '')` | **6 red**, mechanism in the message: `expected 1 to be +0` (two different locations compared EQUAL) and **`expected 0.75 to be 0.5`** — the free geopoint match inflating a partial ratio, which is AC12's argument shown as a number. |
| M7 | The WRONG fix — geopoints never compare equal to anything (drop-the-key) | **4 red**, including *"two IDENTICAL locations STILL compare equal"*. This is the half that a drop-the-key fix would have silently destroyed. |

**A defect in my own work that the tests caught, recorded rather than quietly fixed.** The first run
of `FormFillerPage.geopoint.test.tsx` failed 6 tests on a missing `geopoint-display-*` element. The
auto-capture was writing to `allAnswersRef` + `formData` but **not to react-hook-form**, whose
`Controller` supplies `field.value` to `QuestionRenderer`. The position reached the payload and
never reached the screen — so an enumerator would have seen an untouched "Capture GPS Location"
button over a survey that already held a position, and would have tapped it. That is the exact
behaviour this story exists to remove. Fixed with `setValue(...)` in both the open-time and
submit-time paths.

Two smaller ones, both mine: a `vi.fn().mockResolvedValue()` inside a `vi.mock` factory is wiped by
this package's `mockReset: true` before every test (the worker then died on `result.respondentId`) —
replaced with a plain function; and a fixture prefix `${TAG}-r%` silently also matched the
`${TAG}-reason` row from the test above it, making a `GROUP BY` count read 3 instead of 2.

### Completion Notes List

**Task 1.1 — the hardcode is FIXED, not asserted around.** `useDraftPersistence.ts:186` read the
literal `formData.gps_location` under a comment that said "e.g. gps_location". It now takes the
geopoint question's name **from the schema** (`FormFillerPage` passes `geopointQuestionName`, read by
TYPE off the resolved form) and falls back to shape detection for callers with no schema to hand
(`ClerkDataEntryPage`) and for drafts resumed from before this story. The literal is gone from the
code. ⭐ The new page fixture deliberately names its question **`site_location`**: had it been called
`gps_location`, every assertion in the file would pass whether or not the hardcode was ever removed.

**AC2 / Task 3.3 — the measured iOS Safari risk is closed, and proven closed.**
`navigator.permissions.query({name:'geolocation'})` is unsupported on iOS Safari (30 audit events
across 4 real trial enumerators, 30 days to 2026-09-20). `permissionAllowsSilentRefresh()` therefore
returns **true** when the API is absent or its `query` rejects — iOS attempts the refresh with a
short 5 s deadline rather than silently skipping it — and **false** only on a real `prompt`/`denied`,
because an OS dialog on top of a completed survey is the one thing this must never produce. Both
shapes are tested (`geo-capture.test.ts`), and M2 proves the iOS branch is load-bearing.

**AC2 — a stale-closure bug avoided by design.** The submit-time refresh mutates the answers
microseconds before `completeDraft()` is called, and `completeDraft` closed over the render's
`formData`. It now takes the answers as an argument, so the refreshed coordinate cannot be lost to a
`useCallback` that has not been rebuilt yet. Both submit exits are gated — the ordinary one and the
pending-NIN one, because a gate on one of two exits is not a gate.

**AC3's fence is the load-bearing half, and M5 measured it.** Removing "this form serves a geopoint
question" reds **7 pre-existing tests** as well as mine — that is the two live submissions on
geopoint-less forms becoming unsubmittable, demonstrated rather than argued.

**AC4 — the reason is DERIVED, and the UI enforces that.** One button, no `<select>`, asserted:
`block.querySelectorAll('button')` is 1 and `querySelector('select')` is null. The value comes from
`GeolocationPositionError.code`; `unsupported` is set directly because the absence of the API
produces no error object. An invented reason is a 400 at the zod enum, not free text in a column
whose entire purpose is to be counted.

**Task 6b.3 — geopoint was NOT the only object, measured against the shipped forms (2026-09-20).**
`oslsr_master_v3` (47 questions) serves 1 geopoint **and 2 `select_multiple`**
(`skills_possessed`, `training_interest`); `oslsr_public_core_v1` (25 questions) serves **no
geopoint but 1 `select_multiple`**. Arrays hit the same `String()` path with a live false match of
their own: `String([])` is `''`, exactly what an unanswered question renders as, so an **empty
multi-select matched every respondent who skipped the question** — including on the PUBLIC channel,
which has no geopoint at all. Fixed generally. ⚠️ **Array ORDER is deliberately NOT sorted** (see R1):
`SelectMultipleInput` appends in tap order, and sorting would *increase* match ratios on the very
channel R-A8 is about to calibrate, trading one bias for its opposite. Non-empty arrays compare
exactly as before; only the `[]`-vs-unanswered collision is closed, and that biases **down**.
0 choice values on either form contain a comma, so the `['a,b']` collision is hardening, not a live fix.

**Task 6b.1 — the precision is stated, not implicit.** 4 dp. At ~7.4°N, 0.0001° of latitude ≈ 11.1 m
and of longitude ≈ 11.0 m, so the grid cell is ~11 m square — the scale that separates two
households from one. 6 dp (~0.1 m) would make two captures of the *same* doorway differ, because a
phone fix never repeats exactly; 3 dp (~110 m) would merge a street. Accuracy is excluded from the
comparison: it qualifies a position, it is not part of one.

**Task 6b.4 — QUANTIFIED ON PROD, read-only, 2026-09-20 (prod HEAD `8b96fd0`, measured not quoted).**

| Measure | Value |
|---|---|
| `fraud_detections` rows, all time | 8,284 |
| …with `duplicate_score > 0` | 68 |
| …with `maxMatchRatio >= 0.7` (the partial threshold) | **0** |
| …that actually ran `calculateFieldMatchRatio` (`comparedSubmissions > 0`) | **3** — ratios 0.3, 0.2, 0.2 |
| Detections where BOTH sides carry a geopoint | **0** |
| Detections where BOTH sides carry an empty array | **0** |
| Submissions carrying a geopoint answer / an empty-array answer | 79 / 4 |

⭐ **ANSWER: ZERO existing rows would move if rescored.** The change is **prophylactic today and live
the moment 13-71 deploys** — exactly what AC12 predicted. ⚠️ **I checked an assumption and it was
wrong, so it is recorded:** I first read the 68 as legacy heuristic rows. They are not. All 68 were
computed on 2026-09-13 by a *different producer* — batch import identity-duplication
(`{"flags":["duplicate_identity_in_batch"],"batchSize":8222,…}`) — and carry no `maxMatchRatio`
because `calculateFieldMatchRatio` never ran on them. Only 3 detections in the system have ever run
it, and all 3 sit far below the partial threshold.

**Task 8 ordering.** The briefing was flipped only after every line of code was written, which is
what Awwal's ruling protects (brief nobody on behaviour they do not have). The full gates were then
run last so they cover the briefing change too. ⚠️ **I removed the three ⛔/⚠️ glyphs I had added to
the briefing**: the rendered PDF is what reaches the field, and they came out as `&Ô` mojibake in it.
The document's one pre-existing ⚠️ is left alone and recorded as R2.

**AC8 / AC12 fences — verified, not assumed.** `git status` on `test-fixtures/` and
`docs/launch-campaign/` is empty; `git diff` on `fraud-thresholds.seed.ts` is empty; and on prod the
live pin `wizard.public_form_id` is still `01a0347c-2a10-79c4-83ff-d53537128d32`, last updated
2026-08-24, with only 2 `questionnaire_forms` rows and the newest created 2026-08-24 — no row minted.

**GATES — run by me, quoted as SUITE TOTALS.**

| Gate | Result |
|---|---|
| `tsc --noEmit` — types, api, web | **0 errors** |
| `eslint` — api `src scripts`, web `src e2e` | **0 problems** |
| Drift guards, run **DIRECT** (never through turbo) | registry-read **411** · respondent-write **411** · story-residuals **328** — all clean |
| **API suite** (`apps/api`, `NODE_ENV=test`, app_test) | **331 files / 4,693 tests — 4,685 passed / 8 skipped / 0 failed, exit 0** |
| **Web suite** (`apps/web`) | **283 files / 3,163 tests — 3,161 passed / 2 todo / 0 failed, exit 0** |

`app_test` was refreshed with `db:push:full:force` after the schema change (not `db:push:force`,
which drops raw-SQL constraints), and both new columns were confirmed present by `\d submissions`.

**TEST-COUNT DELTA — every test accounted for, file by file.**

API **+1 file / +36 tests** (330/4,657 → 331/4,693):

| File | Before | After | Δ |
|---|---|---|---|
| `workers/__tests__/webhook-ingestion.gps-columns.integration.test.ts` *(new)* | — | 5 | **+5** |
| `controllers/__tests__/form.controller.test.ts` | 38 | 47 | **+9** |
| `services/fraud-heuristics/__tests__/duplicate-response.heuristic.test.ts` | 12 | 34 | **+22** |
| | | | **+36 ✓** |

Web **+2 files / +56 tests** (281/3,107 → 283/3,163):

| File | Before | After | Δ |
|---|---|---|---|
| `features/forms/lib/__tests__/geo-capture.test.ts` *(new)* | — | 22 | **+22** |
| `features/forms/pages/__tests__/FormFillerPage.geopoint.test.tsx` *(new)* | — | 23 | **+23** |
| `features/forms/hooks/__tests__/useDraftPersistence.test.ts` | 15 | 23 | **+8** |
| `services/__tests__/sync-manager.test.ts` | 29 | 32 | **+3** |
| `features/forms/pages/__tests__/FormFillerPage.test.tsx` | 23 | 23 | 0 (untouched) |
| | | | **+56 ✓** |

⚠️ The API arithmetic came out one short on first count because I had recalled the duplicate-response
baseline as 13; the recorded baseline run says **12**. Re-derived from the two saved run logs rather
than from memory, it reconciles exactly. [[pattern-unexplained-test-delta-is-unrecorded-work]]

**Left deliberately untouched:** the limiters (13-70, deployed), `fraud-thresholds.seed.ts` (R-A8),
13-72's scripts, and the rest of 13-73. No XLSForm edited, no form row minted, no threshold changed.

### File List

⭐ **Reconciled against `git status --short`, which now reports 19 modified + 4 new = 23 files** (the
3 untracked entries collapse a new DIRECTORY, `features/forms/lib/`, that holds two files). The
first draft of this list said "New (3)" and omitted this story file itself — 13-69's adjudication
found the same class of under-declaration, where committing the declared list alone publishes a
record that does not match the tree.

**New — 4:**
- `apps/web/src/features/forms/lib/geo-capture.ts`
- `apps/web/src/features/forms/lib/__tests__/geo-capture.test.ts`
- `apps/web/src/features/forms/pages/__tests__/FormFillerPage.geopoint.test.tsx`
- `apps/api/src/workers/__tests__/webhook-ingestion.gps-columns.integration.test.ts`

**Modified — API, 7:**
- `apps/api/src/db/schema/submissions.ts` — `gps_accuracy`, `gps_unavailable_reason`
- `apps/api/src/controllers/form.controller.ts` — zod fields, `_gps*` threading, the `requireGeopoint` branch
- `apps/api/src/services/form-submission-validation.service.ts` — `requireGeopoint` + `assertGeopointCaptured`
- `apps/api/src/workers/webhook-ingestion.worker.ts` — the two column writes
- `apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts` — `canonicaliseAnswer` (AC12)
- `apps/api/src/controllers/__tests__/form.controller.test.ts`
- `apps/api/src/services/fraud-heuristics/__tests__/duplicate-response.heuristic.test.ts`

**Modified — Web, 6:**
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — auto-capture, submit refresh, the gate
- `apps/web/src/features/forms/hooks/useDraftPersistence.ts` — Task 1.1 hardcode, accuracy, reason, override
- `apps/web/src/features/forms/api/submission.api.ts` — payload type
- `apps/web/src/services/sync-manager.ts` — AC9 offline rebuild
- `apps/web/src/features/forms/hooks/__tests__/useDraftPersistence.test.ts`
- `apps/web/src/services/__tests__/sync-manager.test.ts`

⚠️ **Modified — Web, +1 BY THE ADVERSARIAL REVIEW (7 total):**
- `apps/web/src/lib/offline-db.ts` — `Draft.restoredAt` (review R7). ⚠️ **This file was NOT in the
  dev's list and is the one structural addition the review made.** It is an optional, NON-INDEXED
  field, so it needs no Dexie version bump — the same way `permanentFailure` and `referenceCode`
  were added to the queue table. Named explicitly because an undeclared schema file is exactly the
  under-declaration this list's own preamble was written about.

**Modified — shared and docs, 5:**
- `packages/types/src/native-form.ts` — `gpsUnavailableReasons`, `geolocationErrorCodeToReason`
- `docs/runbooks/ops-activity-monitoring.md` — §2a coverage surface + the dated prediction
- `docs/runbooks/enumerator-field-briefing.md` — §3 present tense, version 2026-09-20 (Task 8)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status + close-out entry
- `_bmad-output/implementation-artifacts/13-71-enumerator-gps-auto-capture-and-required.md` — this file

⛔ **NOT touched:** any XLSForm, `test-fixtures/`, `docs/launch-campaign/`,
`fraud-thresholds.seed.ts`, `registration.controller.ts`, `ClerkDataEntryPage.tsx`. Two throwaway
scripts were written to answer Task 6b.3 (enumerate non-scalar answer shapes on the shipped forms)
and Task 8.2 (render the briefing PDF and read it back); both were **deleted** after use and neither
appears in the tree.

### Residuals

⚠️ **This ledger's existence DISABLES the prose fallback for this file** (`HAS_LEDGER`,
`story-residual-guard.ts:97`). Verified at authoring: this story's prose carries no
`PRE-DEPLOY|UNDISCHARGED|OUTSTANDING RESIDUAL|DISCHARGE-ON-*` marker outside this table, so nothing
is hidden by adding it. Any future residual in this story **must be a row here** — prose will no
longer be seen [[docs/adjudication-agent-handoff.md#2ab.1]].

⛔ **Column 3 is the STATE cell** and ids are `R<digits>`, because that is what the guard reads.
⭐ **This was MUTATION-VERIFIED rather than assumed**: the first version of this ledger used a
3-column `| ID | State | Description |` layout, and flipping the story to `Status: done` left the
guard **silently green** — an invisible ledger, which §2ab.1 records as strictly WORSE than no
ledger because `HAS_LEDGER` kills the prose fallback. Re-laid out to the canonical five columns and
re-simulated: `done` now reds on all five rows. ⚠️ **RE-VERIFIED BY THE ADVERSARIAL REVIEW after it
added R6–R8: `done` reds on all EIGHT rows, and the guard names each one** — re-run rather than
assumed to still hold, because the row count changed and a guard proven against five rows has not
been proven against eight. Reopen triggers live in the **evidence** column,
never the state cell (`isOpenState` returns false for any state containing `REOPEN TRIGGER`).
⚠️ No literal `|` appears in any cell — the guard splits rows naively and a stray pipe shifts every
column after it.

⛔ **ID SERIES COLLISION, FOUND WHILE ADDING A ROW AND RECORDED RATHER THAN STEPPED AROUND.** This
story carries TWO independent `R<n>` series — the residual LEDGER below (R1–R9) and the adversarial
review's FOLLOW-UP items (R6–R13) — and they **already overlap on R6, R7, R8 and R9**, where the two
meanings are unrelated: `R8` is a spoofable `submittedAt` in one series and a stale-reason guard in
the other. The new row below is therefore **R14**, past the end of both, rather than the `R10` that
came naturally and would have been the fifth collision. ⚠️ Anyone reading a bare `R<n>` in this file
must check WHICH table it came from. Renumbering either series now would invalidate references in
three commit messages and the sprint-status entry, so the collision is documented rather than
"fixed" — and the next id after R14 should keep clear of both.

| ID | Severity | State | Re-runnable evidence | Owner |
|---|---|---|---|---|
| **R1** — `select_multiple` array ORDER is still significant in the duplicate comparison. `SelectMultipleInput` appends in TAP order, so two enumerators choosing the same two skills in a different order do not match | **Low** — a MISSED match, never an invented one, so it biases the detector conservatively. Not a regression: non-empty arrays compare exactly as they did before this story | ⚠️ **OPEN — deliberately not fixed here.** Sorting would make these match, which is defensible on the merits and wrong on the timing: it would INCREASE match ratios on the exact channel R-A8 is about to calibrate, trading AC12's bias for its mirror image. AC12's mandate is to remove a bias, not to swap its sign | Pinned by a test that asserts the CURRENT behaviour (`duplicate-response.heuristic.test.ts`, "array ORDER is still significant"), so any future change is a decision that reds a test rather than a silent drift. Re-check by deleting that test's expectation and observing the red. **REOPEN TRIGGER:** R-A8 calibration reaching `duplicate_partial_threshold`, where the effect can be measured on real ratios instead of guessed | R-A8 (calibration) |
| **R2** — the briefing renders mojibake in the generated PDF. ⚠️ **AMENDED BY THE ADVERSARIAL REVIEW 2026-09-21: there were TWO glyphs, not one.** `⚠️` at line 14 (the one this row originally named) AND `→` at line 124, in §7's "oyoskills.com → check registration" | **Low** — cosmetic, but the PDF is what is printed and handed to enumerators, and the second glyph sat in the answer to a question respondents actually ask | ⚠️ **OPEN — THE FIX IS IN THE TREE; THE RULING IS NOT.** Both glyph sources are removed and the PDF was re-rendered and read back clean. This row stays OPEN because a review may propose a closure and may never sign one (handoff §2al) — the state cell is the guard's input, not a summary of the work | ⚖️ **PROPOSED for closure — awaiting Awwal's ruling. Two-part attribution: evidence by the adversarial review 2026-09-21; ruling outstanding.** Re-runnable: render via `renderBriefingPdf()`, extract the text, confirm `DO NOT READ OUT A NUMBER` and `oyoskills.com - check registration` both read clean and no unrenderable character remains. ⛔ **DO NOT write the word C-L-O-S-E-D into column 3 when ruling** — `isOpenState` (`story-residual-guard.ts:246`) treats any state containing it as closed, so the obvious phrasing for a proposal would have silently disarmed the guard on an unruled row. Strike the id (`~~R2~~`) or rewrite the state without that word | Awwal |
⛔ **POST-DEPLOY READ ATTEMPTED 2026-09-24 11:02 UTC — AND IT CANNOT BE RUN. R3, R4 AND R5 STAY OPEN
FOR A REASON THAT IS NOT ABOUT THIS STORY.**

Deployed `7b13ec3` 2026-09-23 17:45 UTC; the requirement went live at the fence, `2026-09-24T00:00:00Z`.
Measured read-only on prod:

| window | submissions |
|---|---|
| since the deploy (~17 h) | **0** |
| since the fence (the enforced window) | **0** |

**The trial has not tapered, it has STOPPED.** Enumerator submissions per day: 19 (09-16) → 7 → 1 → 4 →
1 → **0 → 0 → 0**. Last enumerator submission **2026-09-21 14:23 WAT**; last public one 09-22 11:46.

✅ **AND IT IS NOT US — checked before concluding anything, because 13-70's limiter deploy landed
2026-09-20 and R1's reopen trigger is exactly this shape:** zero `login_ip_flood_limit_exceeded` and zero
`rate_limit_exceeded` in the last 3,000 log lines; **0 accounts locked, 0 with failed attempts**; 8 of the
11 who have ever logged in did so within 7 days, most recently 09-21 14:10 WAT — they logged in,
submitted, and then stopped. Logins work. Nobody is shut out.

⭐ **SO THE BINDING CONSTRAINT ON THIS STORY IS NO LONGER ENGINEERING.** 13-71 is deployed and cannot be
proven, because proving it needs field traffic and there is none. F2's target (≥90% over **N ≥ 20** from
**≥ 5 distinct enumerators**) is not "not yet met" — it is unmeasurable at zero submissions per day, and
waiting does not fix it. The same zero blocks R-A8's field evidence.

⚠️ **This also weakens the urgency argument for 13-73's AC5** (the form-identity snapshot is not
retroactive, so "every day without it loses interpretability" assumed rows were arriving — none are).

**RE-RUN THE READ WITH THESE, once traffic resumes** — the discharge is mechanical, not a judgement:
```sql
-- R5 must read unexplained = 0; R3 compares pct against the 11.4% (4 of 35) baseline
SELECT source, count(*) AS rows,
       count(*) FILTER (WHERE gps_latitude IS NOT NULL)          AS with_gps,
       count(*) FILTER (WHERE gps_unavailable_reason IS NOT NULL) AS with_reason,
       count(*) FILTER (WHERE gps_latitude IS NULL
                          AND gps_unavailable_reason IS NULL)     AS unexplained,
       count(DISTINCT enumerator_id)                              AS distinct_enumerators
FROM submissions
WHERE submitted_at >= '2026-09-24T00:00:00Z' AND source <> 'backfill'
GROUP BY 1 ORDER BY 1;
```
⛔ Exclude operator accounts from any coverage figure (`email NOT LIKE 'lawalkolade%'`), or F2 reads 13.5%
again instead of 11.4%. And watch two log events on the first real traffic:
`submission.geopoint_requirement_waived_pre_effective` (the offline queue draining — should stop within a
day or two) and `submission.geopoint_requirement_waived_legacy_client` (a phone still on the old bundle;
if that keeps firing, someone has not updated).

| **R3** — AC10's deploy-day prediction cannot be compared until this deploys | **Medium** — it is the story's own success criterion, and an uncompared prediction is just a sentence | ⛔ **OPEN — DISCHARGE-ON-DEPLOY.** Recorded 2026-09-20 BEFORE the run, against a baseline of **11.4% (4 of 35 genuine field submissions)**: GPS-carrying enumerator submissions reach **>90% within one week**. Anything in between is a UX failure to INVESTIGATE, not a success to declare | Run §2a of `docs/runbooks/ops-activity-monitoring.md`. ⛔ The `email NOT LIKE 'lawalkolade%'` exclusion is MANDATORY — nine of 28 enumerator accounts are the operator's own harness logins, and omitting it is exactly how F2 once read 13.5% instead of 11.4%. Minimum sample before quoting either verdict: **N ≥ 20 from ≥ 5 distinct enumerators**, because one row moves the figure ~3 points at present volumes. If the shortfall sits in `denied`, the rollout prompted badly and those phones need the R-a manual fix; if it sits in `unexplained`, see R5 | Awwal / ops |
| **R4** — AC12's "zero detections would move" is a PRE-deploy measurement and this story is what invalidates it | **Medium** — R-A8 calibrates against the duplicate channel, and this changes what "equal" means on it | ⛔ **OPEN — DISCHARGE-ON-DEPLOY.** Measured read-only on prod 2026-09-20: **0 of 8,284** detections move, because only **3** have ever run `calculateFieldMatchRatio` (ratios 0.3 / 0.2 / 0.2, all below the 0.7 partial threshold) and **0** carry a geopoint on both sides. The moment AC3 takes effect every enumerator pair carries one, so this number is true today and false shortly after deploy | Re-run the §6b.4 queries in the Debug Log once field traffic has accumulated, and **before R-A8 calibrates** — otherwise R-A8 tunes against a ratio distribution that no longer exists. ⚠️ Note when re-reading: the 68 rows with a non-zero `duplicate_score` are NOT from this heuristic; they were written 2026-09-13 by batch-import identity duplication and carry no `maxMatchRatio` | R-A8 (calibration) |
| **R5** — the new `unexplained` column must read 0 on post-deploy rows | **Medium** — it is the only signal that would distinguish "the requirement is being bypassed" from "coverage is merely low" | ⛔ **OPEN — DISCHARGE-ON-DEPLOY.** §2a counts enumerator submissions carrying NO position AND NO reason. After this story that state should be unreachable through any supported path, so a non-zero count on a post-deploy row is a DEFECT REPORT, not a coverage statistic (A14 — a zero must say which kind of zero it is) | Run §2a and read the last column, filtering to `submitted_at` after the deploy timestamp. Rows from BEFORE the deploy are all unexplained and are not back-fillable — that is the permanent loss this story exists to stop, not a bug to chase | Awwal / ops |
| **R6** — iOS Safari can still raise an OS permission dialog on top of a completed survey. With no Permissions API there is nothing to ask, so a permission left in the `prompt` state is only discovered by attempting the refresh | **Low** — costs at most one dialog, bounded by the 5 s `SUBMIT_REFRESH_OPTIONS` deadline, and only for someone who DISMISSED the open-time prompt rather than answering it | ⚠️ **OPEN — ACCEPTED, and the alternative is worse.** Returning false on an absent API is the measured defect the pre-flight predicted: AC2 would silently never fire for the 4 trial enumerators on iOS Safari, with a jsdom mock keeping the test green. The trade buys AC2 for those four at the price of a possible second prompt. Opened by adversarial review 2026-09-21 as R11 | Reproduce on a real iOS Safari device: dismiss the open-time prompt without choosing, complete the survey, observe the dialog at submit. **REOPEN TRIGGER:** any field report of a permission dialog at submit, or iOS Safari shipping `navigator.permissions` for geolocation — at which point the existing prompt/denied branch handles it with no code change | Awwal / field |
| **R7** — `GEOPOINT_REQUIREMENT_EFFECTIVE_FROM` is set to `2026-09-21T00:00:00Z` and the deploy has not happened yet | **Medium** — a fence dated EARLIER than the code ships refuses exactly the queued rows it was written to protect, which is the failure it exists to prevent | ⛔ **OPEN — STILL A PRE-DEPLOY CHECK, AND IT HAS ALREADY FIRED ONCE. ⚠️ THE SLIP HAPPENED: fence moved `2026-09-21T00:00:00Z` → `2026-09-24T00:00:00Z` at adjudication, RULED by Awwal 2026-09-23** (two-part attribution §2al: exposure measured and the move proposed by adjudication; ruling by Awwal). Adjudication opened on the 21st and resumed on the 23rd, by which point the fence sat **~2.5 days in the past** and would have refused every old-client row submitted in that window. ⭐ **The exposure was measured, not assumed:** the offline path IS used — 2 enumerator rows with >5 min sync lag, one over an hour, **max observed lag 22h 35m** — so a row created on the 22nd can still arrive on the 23rd. Live exposure on the day happened to be nil (1 enumerator submission, and it carried GPS), which is luck, not design. **The asymmetry that set the value: too LATE costs nothing (new-client rows carry coordinates anyway), too EARLY refuses field work no operator can recover from a device that is by definition offline — so round FORWARD, never back.** ⛔ **THIS ROW STAYS OPEN: it must be re-confirmed in the future at the moment of the push**, because the same slip can happen again — see **R9** for the structural fix. Opened by adversarial review 2026-09-21 with the R7 fix | One line in `form-submission-validation.service.ts`: confirm the constant is at or before the deploy timestamp and after the last pre-deploy field capture. Verify AFTER deploy by syncing a pre-dated queued row and observing a 201 rather than a 422. ⚠️ **The fence rests on `submittedAt` being CAPTURE time, not sync time — verified at both ends by the review** (`useDraftPersistence` stamps it when the draft completes on the device; `sync-manager` replays `payload.submittedAt` verbatim). ONE narrow gap follows from that read and is recorded rather than engineered around: `sync-manager` falls back to `?? now` for a queue row carrying NO `submittedAt` at all, which would be treated as current and refused. No such row should exist — `completeDraft` has set the field since Story 4.3 — but it is the one shape the fence cannot rescue ⭐ **2026-09-23, dev-story: U2's fix materially LOWERS this row's risk and the ruling should know it.** The new `geopointRequirementAware` flag waives the gate for any payload from a client that predates the feature — which is exactly what every row queued before the deploy is. So a fence that has rotted into the past no longer refuses those rows; the flag catches them on a property that cannot go stale (which code produced it) rather than one that rots daily (when it was captured). ⚠️ This does NOT retire R7: a row from a CURRENT client queued offline before the deploy carries the flag and is still judged on its date, which is the case the fence exists for. It narrows the blast radius from "every offline row" to "offline rows from already-updated devices". | Awwal / deploy |
| **R8** — the R7 fence keys on client-supplied `submittedAt`, so a modified client could backdate a submission to dodge the geopoint requirement | **Low** — that field already drives `submissions.submitted_at`, the off-hours heuristic and the speed-run heuristic, so backdating is a detectable fraud on signals that ALREADY exist; and the fence is a fixed past date that closes on its own as the queue drains | ⚠️ **OPEN — ACCEPTED WITH A NAMED ALTERNATIVE.** Fencing on row-insert time instead cannot distinguish a genuine week-old offline row from a backdated one either, and would refuse the real ones. Recorded so the trade is visible now rather than discovered against someone else later | Count enumerator submissions whose `submitted_at` predates the fence but which ARRIVED after it, and compare against the queue drain observed in week one. A number still growing after the queue is empty is the signal | R-A8 (calibration) |
| **R9** — ⛔ **A DATE IN SOURCE IS A PROXY FOR "WHEN THIS CODE STARTED RUNNING", AND IT ROTS SILENTLY.** `GEOPOINT_REQUIREMENT_EFFECTIVE_FROM` must be in the future when the code ships; nothing enforces that, and nothing announces it when it stops being true. **It already rotted once inside this story's own adjudication** — written on the 21st, read on the 23rd, 2.5 days stale, and the only reason it was caught is that a human-paced gap happened to fall across it. A faster session would have shipped it | **Medium** — the failure is silent and one-directional: a stale fence REFUSES genuine offline field work, on a device that is by definition not reachable to retry it, and the enumerator sees only a rejected survey. ⛔ The blast radius scales with the very thing this story is for: every enumerator added widens the offline population the fence protects | **OPEN — DATED 2026-10-15** — same date as 13-70's R4/R5/R6/R8 so one conversation closes them together. ⚠️ Until it lands, **R7 is the manual compensation and must be re-run at the moment of every push** | **THE FIX, and it is small:** assert at module load that `GEOPOINT_REQUIREMENT_EFFECTIVE_FROM` is still in the future, and fail loudly — a startup error, or a `logger.error` the ops digest already watches — rather than degrading in silence. ⛔ **Do NOT "fix" it by deriving the fence from process start time**, which is the tempting one-liner: a routine `pm2 restart` weeks later would slide the fence forward and re-exempt every row submitted before the restart, turning a stale fence into a permanently disabled requirement. That is strictly worse and it fails in the same silent direction. ⭐ **The property to pin is not the date, it is that a wrong date CANNOT be quiet** [[pattern-a-clean-result-must-prove-it-measured]]. **Measured on the day:** `grep -rn "EFFECTIVE_FROM" apps/api/src` returns the constant, its one use site, and one test that now DERIVES from it rather than re-typing it (adjudication fixed that too — the test had hardcoded the old value and would have silently inverted its own meaning when the fence moved). **Reopen trigger, independent of the date:** any deploy in which the fence is found already in the past, or any `submission.geopoint_requirement_waived_pre_effective` still firing more than a week after ship | Awwal (adjudication) — rule with 13-70 R4/R5/R6/R8 |

| **R14** — U2's client capability flag (`geopointRequirementAware`) is client-supplied, so a forged or modified client can omit it and be waived | **Low** — identical in kind and size to R8, whose `submittedAt` is spoofable the same way. Neither is a new exposure: a hostile client can already send a fabricated `gpsUnavailableReason`, which this gate accepts by design | ⚠️ **OPEN — a STATED trade, not an oversight.** The gate is a correctness control against a well-behaved client, never a security control against a hostile one. Taking it as the latter would require signing the envelope, which is a different story | The alternative, if a stricter posture is wanted: pin the waiver to a bounded window after the deploy date instead of leaving it open-ended, at the cost of refusing genuinely stale devices once it closes. **REOPEN TRIGGER:** `submission.geopoint_requirement_waived_legacy_client` still firing more than two weeks after deploy — by then every reachable device has updated, and what remains is either a forgery or a device nobody is supporting | Awwal |
| **R15** — ⛔ **AC1 FAILED ON THE FIRST REAL DEVICE, AND TWO CORRECT FIXES CAUSED IT.** Reported from prod 2026-09-26: *"I had to click the gps after allowing."* The open-time watchdog (**U3**) was budgeted `timeout + grace` = 10 s + 5 s, and that clock starts when the SURVEY OPENS — including the time the "Allow location?" dialog sits waiting, because `PositionOptions.timeout` does not run during the prompt, which is the very thing U3 established. A first-ever open where the enumerator takes longer than 15 s to read and tap Allow settled as `{ ok: false, reason: 'timeout' }`; **U9**'s once-guard then latched on that settlement, and auto-capture never tried again for that survey | **HIGH** — it defeats the story's headline AC on every enumerator's FIRST survey, which is the one case the whole cohort hits on restart day, and `enumerator-field-briefing.md` §3 promises the opposite in print: *"the app captures the location by itself… you do not have to press anything."* ⭐ Neither U3 nor U9 is wrong alone; the defect exists only in their intersection, which is why three passes and two reviews missed it | ✅ **FIXED 2026-09-26 — two changes, both RED-verified.** (1) The watchdog is now PER CALL SITE: `OPEN_CAPTURE_WATCHDOG_MS` = 120 s for the open capture, the tight `timeout + grace` retained for the submit refresh. ⛔ U3's harm was a HANGING AWAIT, and only the submit path awaits — the open capture is `void capturePosition(…).then(…)`, so a generous bound there costs nothing and is still bounded so `autoCaptureInFlightRef` cannot latch for the life of the page. (2) `isRetryableCaptureFailure()` now decides the latch: `timeout` and `position_unavailable` mean *not yet*, `permission_denied` and `unsupported` mean *settled*. ⚠️ **STILL OPEN AS DISCHARGE-ON-DEPLOY — the fix is unproven on a real device, which is exactly the gap that produced this row** | **RED-VERIFIED, and the mutation reproduced the field symptom verbatim:** neutering the per-call-site budget reds the new test with `expected { ok: false, reason: 'timeout' } to deeply equal { ok: true, position: {…} }` — a capture reporting a timeout for a position that was actually granted. Restored md5-identical (`f28cd5e64a93edeb3ddd607800a55caf`). **+4 tests** in `geo-capture.test.ts` (25 → 29): the 15-second prompt, the still-bounded budget, the submit refresh keeping its tight deadline, and all five retryable/settled outcomes. ⚠️ The latch predicate was EXTRACTED to `geo-capture.ts` rather than left inline — a two-line conditional buried in an effect is a decision nothing can test, and no page test can re-trigger that effect to observe it. **DISCHARGE:** the next real capture from `lawalkolade+test@gmail.com` on `oslsr_master_v3` — Allow the prompt, take as long as you like over it, and the coordinates must appear WITHOUT a tap | Awwal (the retest discharges it) |

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-09-18 | Story authored via canonical `*create-story` (yolo) from the 2026-09-18 brief, with both of Awwal's rulings carried in as binding (code-enforced requirement; brief the enumerators first). | The GPS gap is the one field-readiness defect whose data loss is PERMANENT — a missing fraud score can be back-scored, a location never captured cannot. |
| 2026-09-20 | `dev-story` implemented all 8 tasks + Task 6b. Auto-capture on open, submit-time refresh, code-enforced requirement on the enumerator path (client + server), `gps_accuracy` / `gps_unavailable_reason` as columns, the offline path threaded, the coverage surface with its dated prediction, AC12's duplicate-comparison fix, and the briefing flipped last. Status → `review`, UNCOMMITTED. | Seven mutation proofs, both directions where the AC demanded it. The tests caught a real defect of my own — the auto-captured position reached the payload but never the screen, so an enumerator would still have tapped the button this story exists to remove. |
| 2026-09-21 | Adversarial code review (Claude Opus 5 1M — ⚠️ the SAME model that developed this story, caveat UNDISCHARGED and compensated by verifying every claim through execution). Eight findings, all fixed and each RED-VERIFIED by mutation: **R6** the zod enum never constrained `gps_unavailable_reason` (proven by ingesting an invented value against a real row and reading the column back) — server-owned `_gps*` keys now stripped from `responses` AND the vocabulary validated at the storage boundary; **R7** the requirement applied retroactively, so every queued offline submission would have been permanently rejected on deploy day and the documented "Reopen — nothing is lost" recovery would have stamped the operator's CURRENT location onto an old interview — fixed with an effective-date fence plus `restoredAt`, so a reopened draft never auto-captures; **R8** the "a position wins over a stale reason" guard was on the envelope while the column is fed from `responses`; **R9** the escape hatch cleared itself before an unguarded `await`; **R10** the briefing PDF had TWO mojibake glyphs, not the one R2 records; **R11/R12** two code comments asserting more than the code does; **R13** AC9's round trip pinned at both ends but never crossed. Three new residuals (R6–R8), one proposed closure (R2), no status change. | The two HIGH findings are the same defect class the story exists to police — a guard placed where the data does not have to pass [[pattern-ship-a-fix-that-never-fires]], and a certifying test that passes over the hole it was written to close. R7 is the one that would have been discovered in the field: it converts a permanent-data-loss story into a permanent-data-loss event on its own deploy day, and its "recovery" manufactures false coordinates that AC10's coverage read cannot distinguish from real ones. |
| 2026-09-23 | `dev-story` review-continuation: all **15** ultra-review findings fixed and mutation-proved. Status `in-progress` → `review`, UNCOMMITTED. | A different-model pass found fifteen defects that three same-model layers had missed. Three of my own new tests then passed over the hole they were written for, and one of those exposed a defect in my own U9 fix — the mutations, not the green suite, are what caught all four. |

### ⛔ ULTRA REVIEW FINDINGS — 15 defects, ALL VERIFIED BY ADJUDICATION 2026-09-23

⚠️ **THIS SUPERSEDES THE VERDICT IN §0 ABOVE. That verdict — "the work is sound, no defect found in the
code" — WAS WRONG. It is left standing rather than edited, so the record shows what happened;** commit
`0fc693e` carries it and is corrected in a follow-up rather than rewritten. A story whose history is
tidied away teaches nobody.

**How it was found.** `/code-review ultra` — a multi-agent cloud review on DIFFERENT models — was run at
Awwal's instruction to discharge the model caveat, which had been undischarged for two stories running.
Three layers had already passed this changeset: the dev, a same-model adversarial review, and
adjudication. The different-model pass returned **fifteen** findings in one go.

⭐ **The lesson for adjudication, stated specifically.** Adjudication verified the GATES exhaustively —
both suites, three drift guards, File List reconciliation, the attribution sweep, two RED-verifies — and
gave the LOGIC far less. Every one of these fifteen is readable in the diff. **Green gates proved the
story was internally consistent, and that was allowed to stand in for whether the code is correct.**

**Verification standard below:** adjudication re-read the cited code for every row. `CONFIRMED` means the
mechanism was observed in this tree. Two rows read `CONFIRMED (mechanism)` where the code is confirmed but
the consequence rests on cited platform behaviour rather than an observed run — flagged, not smoothed over.

| # | file:line | finding | verdict |
|---|---|---|---|
| **U1** | `FormFillerPage.tsx:259` | ⛔ The AC1 auto-capture effect has **no role gate**, and `mode="fill"` is also mounted on a PUBLIC route — public respondents are silently geolocated | ✅ **CONFIRMED.** `App.tsx:1435` renders `<FormFillerPage mode="fill" />` under *"Story 3.5: Public User Form Filler"*. The guard is `isPreview / !draftLoaded / !geopointQuestion`; `isEnumerator` is used only by `geopointRequirementUnmet`. Coordinates land with `source='public'` — the channel 13-34 deliberately stripped the geopoint from. **Privacy exposure, and it poisons AC10's coverage read** |
| **U2** | `form-submission-validation.service.ts:70` | The R7 fence keys on `submittedAt`, so it protects the offline QUEUE but not a stale CLIENT — every new interview from an un-updated bundle is a permanent 422 | ✅ **CONFIRMED (mechanism).** `sw.ts:110-111` calls `skipWaiting()` only on an explicit message, so a stale bundle persists; `sync-manager.ts:38` makes 422 PERMANENT (`s >= 400 && s < 500` minus 408/429/401/403). Both halves observed. ⚠️ Additionally assumes a stale bundle exists in the field — plausible, not observed |
| **U3** | `geo-capture.ts:74` | `capturePosition` has no timer of its own and can never settle; the submit path awaits it, so the interview becomes unreachable with no error and no escape hatch | ✅ **CONFIRMED (mechanism).** No `setTimeout` anywhere in the file — the only `timeout` values are `PositionOptions` properties (10000/5000). ⚠️ The consequence rests on the W3C rule that `PositionOptions.timeout` excludes time awaiting the permission prompt: cited, not run here. **Cheap fix — `settle` is already idempotent, so race an own timer** |
| **U4** | `FormFillerPage.tsx:561` | ⛔ The pending-NIN exit **swallows a `completeDraft` rejection and then runs `setCompleted(true)` OUTSIDE the try** — it affirmatively reports success for a submission never queued | ✅ **CONFIRMED verbatim.** `try { await draft.completeDraft(answers); … } catch { /* swallow */ } setCompleted(true);` — and `useDraftPersistence` exposes no error state, so the comment's claim that errors "surface through the draft hook" is false. **The interview is gone and the screen says "Survey saved!"** |
| **U5** | `FormFillerPage.tsx:488` | ⛔ The PRIMARY submit exit has **no try/catch at all**; R9's fix was applied only to the escape hatch | ✅ **CONFIRMED.** A rejection throws out of the onClick handler: `setCompleted(true)` never runs, no completion screen, no error, nothing logged — on the path carrying essentially all the traffic. ⭐ Three exits now disagree three different ways (bare throw / swallow-and-claim-success / correct), which is the argument for one `finishSubmission` helper |
| **U6** | `useDraftPersistence.ts:322` | ⛔ R9's retry affordance assumes `completeDraft` is idempotent. It is not — `submissionQueue.add` is the FIRST write and the following `drafts.update` is unguarded | ✅ **CONFIRMED.** Order observed: `await db.submissionQueue.add(queueItem)` → `await db.drafts.update(...)` **unwrapped** → `try { drafts.delete } catch {}`. A rejection on the update leaves the queue row committed while the UI says *"the survey has not been submitted yet"*; every retry then dies on a duplicate key. **The enumerator re-enters the interview and a real citizen is registered twice** |
| **U7** | `form.controller.ts:215` | ⛔ The R6 strip covers only **2 of 5** server-owned keys — `_gpsLatitude`, `_gpsLongitude` and `_completionTimeSeconds` inside `responses` still reach `rawData` unvalidated | ✅ **CONFIRMED.** Only `_gpsAccuracy` and `_gpsUnavailableReason` are deleted; the other three are merely OVERWRITTEN `if (envelope != null)`. `responses` is `z.record(z.unknown())`, so omitting the envelope field and putting the key in the answers bypasses zod entirely: **forged coordinates into the base map, and a `_completionTimeSeconds` that neutralises the speed heuristic.** The R6 comment is true for two keys and false one line below |
| **U8** | `FormFillerPage.tsx:897` | ~5 s of blocking await now precedes the queue write with no spinner, no disabled state and no re-entrancy guard — a second tap double-queues | ✅ **CONFIRMED.** Still `disabled={!!displayError / ninCheck.isChecking}`; nothing for submit-in-flight. ⭐ Worst case is two drafts and two queue rows from one interview — which **AC12, in this same diff, then scores as duplicate fraud against an enumerator who did nothing wrong** |
| **U9** | `FormFillerPage.tsx:261` | `autoCaptureStartedRef` is set BEFORE the capture resolves and never reset, while cleanup sets `cancelled = true` | ✅ **CONFIRMED.** `React.StrictMode` IS enabled (`main.tsx:7`), so in dev every effect is mount→cleanup→mount: run 1 starts and is cancelled, run 2 returns at the ref guard. **Auto-capture never works in development at all**, and the new tests cannot see it because RTL does not render under StrictMode. In production a background refetch inside the 10 s window cancels it permanently |
| **U10** | `FormFillerPage.tsx:918` | `gpsBlocked` is never cleared by `handleBack`, so the amber panel — and its one-tap, unvalidated, full-survey submit — follows the enumerator to every question | ✅ **CONFIRMED.** Set at 484/549/612, cleared only at 617 and 850; `handleBack` does not touch it. The panel's own text says *"Go back to the location question"*, which leaves it rendered on every screen. A mis-tap submits the whole interview |
| **U11** | `form-submission-validation.service.ts:266` | `assertGeopointCaptured` accepts a position living only in the geopoint ANSWER, but nothing on the write path reads that answer | ✅ **CONFIRMED.** `webhook-ingestion.worker.ts:115-116` derives the columns exclusively from `rawData._gpsLatitude/_gpsLongitude`, which the controller sets only from the ENVELOPE. **The gate reports coverage the column cannot show** — the row lands with NULL coordinates AND NULL reason, straight into the new `unexplained` bucket |
| **U12** | `form.controller.test.ts:581` | The only test of "the geopoint ANSWER satisfies the gate" is waived by the R7 fence before it reaches the branch it names | ✅ **CONFIRMED.** It spreads `...validBody`, whose `submittedAt` is `2026-02-13` (line 272) — pre-effective, so the waiver returns before `isAnsweredGeopoint` is consulted. The file defines `postEffectiveBody` for exactly this, and a comment at :514 explains why `validBody` cannot be used. ⛔ **Delete the branch and the suite stays green** [[pattern-test-that-passes-over-a-hole]]. ⚠️ Adjudication edited this very file today and did not notice |
| **U13** | `FormFillerPage.tsx:290` | The open-time capture is cancelled only on unmount, and its `.then` mutates the same live object every exit hands to `completeDraft` | ✅ **CONFIRMED, both halves.** The `.then` writes the position and deletes the reason but **never calls `setGpsBlocked(false)`** — the amber panel still demands a location for a survey that now has one. And every return path of `refreshPositionForSubmit` returns `allAnswersRef.current` **itself, not a copy**, so a late callback can mutate the object mid-queue — coordinates plus a reason not to have them |
| **U14** | `FormFillerPage.tsx:281` | The restored-draft branch stamps `_gpsUnavailableReason: 'other'` with no role check | ✅ **CONFIRMED.** Same guard as U1, no `isEnumerator`. A clerk (or public user) reopening a rejected submission writes `'other'` into **the one column AC6 exists to GROUP BY** — desk work counted in the bucket that cannot be explained away by a browser error code |
| **U15** | `FormFillerPage.tsx:587` | The escape hatch files a reason derived only from the OPEN-time capture; a manual capture's failure never reaches the page | ✅ **CONFIRMED.** `GeopointInput.tsx:41-56` switches on `err.code` and only calls local `setGeoError`; there is no `onError` prop and `onChange` fires only on success. **A phone-permission problem is filed as a signal problem** — precisely the distinction AC4's derived vocabulary exists to preserve |

**Runners-up the review recorded below its cap** — NOT individually verified by adjudication, carried so
they are not lost: the new S3 `afterAll` builds its own client with bare `process.env` and no
`forcePathStyle` while the uploader falls back differently, so its deletes may silently fail; no
server-side mutual exclusion between coordinates and a reason; the client lifts `_gpsUnavailableReason`
with only a `typeof` check then casts, where a bad value is a permanent 400; the legacy flat-coordinate
fallback lost its per-coordinate resolution; an unrecognised reason is dropped at the worker with no log
line; `GEOPOINT_REQUIREMENT_EFFECTIVE_FROM` belongs in `system_settings` (the `wizard.public_form_id`
precedent) rather than a source literal — which would also retire **R9**; `canonicaliseAnswer` is re-run
per pair over a 100-row candidate set (~5,000 redundant calls per scored submission, multiplied by
13-72's replay); and auto-capture's `setFormData` defeats the "no draft until the user enters data"
guard, so every form OPEN now writes a draft.

⭐ **Signals the review confirmed CLEAN, so nobody re-checks them:** both packages typecheck; the 111 new
web tests pass; coordinates of exactly 0 survive the chain; `roundCoordinate` handles `-0`;
`canonicaliseAnswer`'s scalar path is byte-identical to the old `String(v ?? '')`; the Drizzle schema
correctly does not import `@oslsr/types`; `restoredAt` needs no Dexie bump; `sync-manager` forwards all
ten payload fields; the other two `validateSubmissionCompleteness` callers pass `excludeGeopoint: true`,
so no existing path newly 422s; the new columns are additive-nullable.

### ✅ ULTRA REVIEW FIXES — all 15, dev-story 2026-09-23

**Dev: Claude Opus 5 (1M context), BMAD `dev-story` review-continuation.** Every row below is FIXED
in the working tree and RED-VERIFIED by mutation. ⛔ **No residual is closed here and no ruling is
signed** (§2al) — two of these fixes embody a design choice that is Awwal's, and they are marked.

| # | fix | mutation proof |
|---|---|---|
| **U1** | Auto-capture is gated on `isEnumerator`. The public route (`App.tsx:1435`) mounted the same `mode="fill"` page, so members of the public were silently geolocated and filed with `source='public'` | remove the gate → **2 red** (public + clerk) |
| **U2** | New envelope flag `geopointRequirementAware`; the gate waives when it is absent. ⚠️ **DECISION — see D5** | `if (false)` → **2 red** |
| **U3** | `capturePosition` races its own watchdog. `PositionOptions.timeout` does not run while the permission prompt is open, so neither callback ever fired and the awaiting submit hung forever | remove watchdog → **2 red**, one hanging the full 10 s |
| **U4** | Pending-NIN exit no longer swallows-then-claims-success | folded into U5's helper |
| **U5** | One `finishSubmission` helper for all three exits; the primary one had no `try/catch` at all | remove the catch → **3 red** |
| **U6** | `submissionQueue.put` (idempotent) and best-effort cleanup, so R9's retry affordance is honest | `put`→`add` → **3 red** |
| **U7** | `SERVER_OWNED_RAW_DATA_KEYS` — all **6** server-owned keys stripped from `responses`, not 2 of 5 | revert to 2 keys → **3 red**, exactly the 3 that were missing |
| **U8** | Re-entrancy guard in `finishSubmission` + the button disables and reads "Saving…" | remove the ref guard → **1 red** |
| **U9** | Two refs (`done` / `inFlight`), and the in-flight ref is released **in cleanup** | remove the cleanup release → **1 red** |
| **U10** | `handleBack` clears `gpsBlocked` | remove → **1 red** |
| **U11** | The worker falls back to the geopoint ANSWER, so a position that satisfied the gate reaches the column | neuter the fallback → **1 red** |
| **U12** | The answer-branch test uses `postEffectiveBody`; it was waived by R7's fence before reaching the branch it names | delete the branch → **2 red** (was **0**) |
| **U13** | Every submit path is handed a **snapshot**; a late capture also retires the amber panel | return the live object → **1 red** |
| **U14** | Same role gate — a non-enumerator never stamps `other` into AC6's column | covered by U1 |
| **U15** | `onCaptureError` carries the browser's verdict out of `GeopointInput` | remove → **1 red** |

⭐ **FOUR OF MY OWN TESTS WERE PASSING OVER THE HOLE, AND THE MUTATIONS SAID SO.** Recorded because
the pattern is the story's own recurring defect and the first draft reproduced it four times.
⚠️ **This line said THREE until the story was read back against the session** — the fourth (the
`useDraftPersistence` mock, below) was found while DESIGNING its mutation rather than by running
one, so it never produced a red and was fixed without being counted. A defect caught before it can
fail is still a defect, and leaving it out understated the tally in the one section whose whole
subject is tests that prove less than they appear to:

1. **U8** — the test awaited the in-flight state before tapping again, so React had already
   disabled the button and `fireEvent.click` was a no-op. Deleting the `submitInFlightRef` guard
   entirely left it GREEN: it pinned the visual affordance, not the authoritative guard. Retargeted
   to fire the repeat taps in the SAME TICK, which is also what an impatient thumb does.
2. **U13** — the test drove the ESCAPE-HATCH exit, which spreads its own copy at the call site, so
   neutering `snapshotAnswers` changed nothing. Retargeted at the PRIMARY exit, the one that
   actually consumes that function's return.
3. **U9** — and this one found a **defect in my own fix**. Releasing the in-flight ref only in the
   `.then` was not enough: an effect re-run *while a capture is in flight* hit the guard and
   returned, the cleanup cancelled attempt 1, and attempt 1 resolved into a `cancelled` early
   return — nothing in flight, nothing done, and no further attempt ever. The capture was still
   lost, exactly as U9 describes. The release moved into the **cleanup**, which runs before the
   next effect and therefore lets it retry.

4. **The `useDraftPersistence` queue mock** — and this one never went red, because I caught it
   while writing the U6 mutation rather than by running it. When `completeDraft` moved from
   `submissionQueue.add` to `.put`, I pointed BOTH at the same mock function so the existing
   assertions would keep passing. That made the `add`-vs-`put` choice — the entire substance of
   U6 — invisible to every test in the file: swapping the call back would have changed nothing.
   They are separate mocks now, and a test asserts `put` was used and `add` was not.

⭐ **SUB-FINDINGS OF MY OWN, beyond what the fifteen rows state.** Each was fixed in the tree and is
recorded here because it is not derivable from the finding it sits under:

- **U5's failure had nowhere to render at all.** The review's row says the primary exit has no
  `try/catch`. The other half is that `gps-submit-error` was nested INSIDE the `gpsBlocked` panel,
  so even once the rejection was caught there was no element to show it on that path — the escape
  hatch was the only exit that could report a failure. Now a standalone `submit-error-block`.
- **U11 had to carry accuracy with the coordinates.** Recovering a position from the geopoint
  ANSWER while still reading accuracy only from the envelope would have produced rows that gain
  coordinates and lose the accuracy qualifying them — a 2 km network fix indistinguishable from a
  5 m satellite one, which is the precise thing AC5 exists to prevent.
- **U11's shape scan must skip `_gpsOpenCapture`.** The open-time capture (AC2) is an object with
  two finite coordinates and would otherwise be picked up as the submitted position, filing where
  the interview STARTED for any row whose answer went missing. Pinned by its own test.
- **U7's strip includes `_referenceCode` even though it was already overwritten downstream.**
  Equivalent in effect today, deliberate as a boundary: "something further down happens to
  overwrite it" is exactly the reasoning that left three of the five keys open in the first place.
- **A test-authoring trap worth writing down (U9).** Forcing the capture effect to re-run by
  spreading the form (`{...geoForm}`) does NOT work: `geopointQuestion` is a `useMemo` over
  `form.questions.find(...)`, so the same question object comes back, the dependency is unchanged
  and the effect never re-runs. The test failed for the wrong reason until the question object
  itself was replaced.
- **A stale `useCallback` dependency after the refactor.** Collapsing the exits into
  `finishSubmission` left `draft` in `handleContinue`'s dependency array where nothing used it;
  eslint caught it, not me.

⚠️ **AND A CORRECTION TO U9 ITSELF, recorded rather than smoothed over.** Its headline — "auto-capture
never works in development at all" — did **not** reproduce. The effect is gated on `draftLoaded`,
which is false during StrictMode's mount → cleanup → mount pair, so both of those runs return before
touching the guard and the run that does the work is a later update, which StrictMode does not
double-invoke. A StrictMode test is included and passes **with and without** the fix; it is a
regression guard, not the proof. U9's *other* half — a background refetch inside the capture window
— is real, is what the mutation pins, and is what the cleanup release fixes. The fix is kept
regardless: the ordering that protects this today is incidental, not designed.

### ⚖️ D5 — A DECISION I DO NOT HAVE THE STANDING TO SETTLE (U2)

U2 has no fix that is purely mechanical, so the option taken is recorded as reversible.

**The problem:** R7's date fence protects rows sitting in an offline QUEUE. It does nothing for a
device still RUNNING the old bundle — `sw.ts` calls `skipWaiting()` only on an explicit message — and
every interview that device starts today carries a current `submittedAt`, so it is enforced against
code that cannot auto-capture and renders no escape hatch. `isPermanentFailure` then classifies the
422 as permanent and parks the row forever. **A whole day of fieldwork per un-updated device.**

| Option | Verdict |
|---|---|
| **(a) A client capability flag — TAKEN.** The client sends `geopointRequirementAware: true`; the gate waives when it is absent | One place, testable, no deploy-order dependency, and it is the same shape as the two fences already ratified: a requirement the submitter cannot satisfy is a lockout, not a requirement |
| (b) Make the 422 retryable | **Does not work, and this is why the fix is server-side.** The queued payload can never satisfy the gate, so retrying it forever just fails more politely |
| (c) Force a service-worker update before submitting | Cannot be relied on by the code that needs it — a device that is offline is exactly the one that will not have updated |
| (d) Accept the rejections | This is the finding |

⚠️ **The cost is R14**, and it is the same trade as R8 stated the same way: a forged client can omit
the flag exactly as it can backdate `submittedAt`. This gate has never been a control against a
hostile client — one can simply send a fabricated `gpsUnavailableReason`. **If Awwal prefers a
stricter posture**, the alternative is to pin the waiver to a short window after the deploy date, at
the price of refusing genuinely stale devices after it closes.

⚠️ **U1's role gate is also a judgement, and a smaller one.** AC7 exempts the clerk from the
*requirement*; its stated reasoning ("office coordinates filed as field captures would poison the
base map") is about who is holding the phone, so I applied it to *capture* as well. Capturing for a
clerk and then not requiring it was the worst of both — the poisoned coordinate without the
coverage. Reversible in one line if Awwal reads AC7 more narrowly.

### GATES — RE-RUN AFTER THE ULTRA FIXES, 2026-09-23

| Gate | Result |
|---|---|
| `tsc --noEmit` — types, api, web | **0 errors** |
| `eslint` — api `src scripts`, web `src e2e` | **0 errors.** ⚠️ 1 pre-existing WARNING in `auth.activation.test.ts` (unused eslint-disable), introduced by commit `ab31894`; not touched by this story and not mine to close |
| Drift guards, run **DIRECT** | registry-read **413** · respondent-write **413** · story-residuals **329** — all clean |
| **API suite** | **331 files / 4,714 tests — 4,706 passed / 8 skipped / 0 failed, exit 0** |
| **Web suite** | **283 files / 3,192 tests — 3,190 passed / 2 todo / 0 failed, exit 0** |

⚠️ **Free RAM at suite time was 2.9 GB, marginally under the 3 GB floor** the flakiness note asks
for, with zero stray node processes available to reclaim. Both suites were run serialised with no
other work in flight and both passed first time; recorded rather than quietly ignored, because the
floor exists precisely so a green run under it is not taken on trust.

**TEST-COUNT DELTA — every test accounted for.** Against adjudication's figures (API 4,700 / web 3,174):

API **+14**, no new files:

| File | Now | Δ | what was added |
|---|---|---|---|
| `controllers/__tests__/form.controller.test.ts` | 62 | **+11** | U7 forged-key `it.each` ×6, U7 envelope-still-works, U11 queued-answer, U2 ×3 |
| `workers/__tests__/webhook-ingestion.gps-columns.integration.test.ts` | 11 | **+3** | U11 answer-only, envelope-wins, open-capture-is-metadata |

Web **+18**, no new files:

| File | Now | Δ | what was added |
|---|---|---|---|
| `features/forms/pages/__tests__/FormFillerPage.geopoint.test.tsx` | 42 | **+13** | U1/U14 ×4, U9 ×2, U10 ×1, U4/U5 ×2, U8 ×2, U13 ×1, U15 ×1 |
| `features/forms/lib/__tests__/geo-capture.test.ts` | 25 | **+3** | U3 ×3 |
| `features/forms/hooks/__tests__/useDraftPersistence.test.ts` | 27 | **+2** | U6 ×2 |

**File List — this pass touched 17 files and created NONE.** Reconciled against
`git status --short`: 15 code/test files plus this story file and `sprint-status.yaml`. (The first
draft of this line said "9 files" and then listed 15 — corrected against the tree rather than left,
because an under-declared File List is the exact defect 13-69's adjudication caught.)

| API (5) | Web (10) | Records (2) |
|---|---|---|
| `controllers/form.controller.ts` | `pages/FormFillerPage.tsx` | this story file |
| `services/form-submission-validation.service.ts` | `lib/geo-capture.ts` | `sprint-status.yaml` |
| `workers/webhook-ingestion.worker.ts` | `hooks/useDraftPersistence.ts` | |
| `controllers/__tests__/form.controller.test.ts` | `services/sync-manager.ts` | |
| `workers/__tests__/webhook-ingestion.gps-columns.integration.test.ts` | `api/submission.api.ts` | |
| | `components/QuestionRenderer.tsx` | |
| | `components/GeopointInput.tsx` | |
| | `lib/__tests__/geo-capture.test.ts` | |
| | `hooks/__tests__/useDraftPersistence.test.ts` | |
| | `pages/__tests__/FormFillerPage.geopoint.test.tsx` | |

⛔ No XLSForm, no `test-fixtures/`, no `docs/launch-campaign/`, no `fraud-thresholds.seed.ts`,
no new files, no Dexie version bump.

### Review Follow-ups (AI)

**Adversarial code review, 2026-09-20/21. Reviewer: Claude Opus 5 (1M context).**

⚠️ **THE DIFFERENT-MODEL CAVEAT IS UNDISCHARGED AND SAYING SO IS THE POINT.** The brief asked for a
model other than the one that developed the story; the Dev Agent Record names Claude Opus 5 (1M
context) and so does this review. The stated compensation was applied instead: **no claim below was
accepted by reading it.** Both suites, all three drift guards, tsc and eslint were re-run by the
reviewer; all five of the dev's mutation proofs were reproduced independently; the briefing PDF was
re-rendered and read back; and the two headline findings were proven by EXECUTING them against a
real PostgreSQL row rather than by tracing code.

**What the dev claimed and what the reviewer measured — every figure reproduced exactly:**
API 331 files / 4,693 tests · web 283 files / 3,163 tests · guards 411 / 411 / 328 · tsc 0 · eslint 0
· File List 18 modified + 4 new = 22, exact · AC8 + AC12 fences empty · Task 8 mtime latest of all
touched files · M2/M3/M4/M5/M6 → 4 / 2 / 3 / 8 / 6 red, every mutated file restored md5-identical.

⛔ **NO RESIDUAL IS CLOSED BY THIS REVIEW AND NO STATUS IS CHANGED** (handoff §2al — a review may
PROPOSE a closure, it may never sign one). R2 is **PROPOSED-CLOSED awaiting ruling**; the story
remains `Status: review` for adjudication. TWO-PART ATTRIBUTION on every row below: **evidence by
the adversarial review 2026-09-20/21; ruling by Awwal, outstanding.**

⭐ **All eight findings are FIXED in the working tree at Awwal's direction ("create action items and
fix them all"), each RED-VERIFIED by mutation.** The boxes are ticked because the work is done, not
because it has been ruled on.

- [x] **[AI-Review][HIGH] R6 — the zod enum never constrained `gps_unavailable_reason`, and three
  artefacts said it did** [`apps/api/src/controllers/form.controller.ts:188`,
  `apps/api/src/workers/webhook-ingestion.worker.ts:120`].
  `submitFormSchema.responses` is `z.record(z.unknown())`, so `rawData = { ...responses }` carried a
  client-supplied `_gpsUnavailableReason` verbatim and the worker wrote it to the column — bypassing
  `z.enum` entirely. ⭐ **PROVEN, NOT ARGUED:** ingesting `_gpsUnavailableReason:
  'i-invented-this-value'` against the real test database read the column back as exactly that
  string. `_gpsAccuracy` bypassed `z.number().nonnegative()` by the same route. This is the defect
  class the story itself polices — a guard placed at a boundary the data does not have to cross
  [[pattern-ship-a-fix-that-never-fires]] — and AC6's entire promise is that this column answers a
  `GROUP BY`. **FIX:** the two server-owned keys are stripped from `responses` before `rawData` is
  built (exactly as `_referenceCode` has always been defensively overwritten), AND the worker
  validates against `gpsUnavailableReasons` at the STORAGE boundary, because the controller is only
  one of that boundary's producers — 13-72's re-enqueue builds `rawData` itself and never passes
  through that zod schema. Accuracy now requires `Number.isFinite && >= 0`. The three false comments
  are corrected in place. 5 new tests; mutation → 2 red (controller strip), 1 red (vocabulary),
  1 red (accuracy).

- [x] **[AI-Review][HIGH] R7 — deploy day would reject every queued enumerator submission, and the
  documented recovery would stamp the WRONG LOCATION on it**
  [`apps/api/src/services/form-submission-validation.service.ts:236`,
  `apps/web/src/services/sync-manager.ts:39`, `apps/web/src/services/sync-manager.ts:148`].
  `requireGeopoint` applied regardless of WHEN the interview was conducted. A row captured offline
  before the deploy has no coordinates (~89% of enumerator submissions today) and no reason (the
  field did not exist), so its first sync returns 422 — and `isPermanentFailure` classifies any 4xx
  but 408/429/401/403 as PERMANENT, parking it at `MAX_RETRIES`, never retried. ⭐ **And the
  recovery was the sharp end, not the mitigation:** `restoreToDraft` is offered as "Reopen — nothing
  is lost", the restored draft carries no geopoint, so AC1's auto-capture fires and writes WHERE THE
  OPERATOR IS STANDING NOW as the interview's location — the office, at the end of the round.
  Indistinguishable from a genuine field capture in AC10's coverage read, and the exact base-map
  poisoning AC7's clerk exemption exists to prevent, arriving through the back door. **FIX, in two
  halves:** (a) `GEOPOINT_REQUIREMENT_EFFECTIVE_FROM` — the gate is a no-op for a submission whose
  own `submittedAt` predates it, on the same reasoning as AC3's form-fence (a requirement nobody can
  satisfy is a lockout, not a requirement); (b) `restoreToDraft` stamps `restoredAt`, threaded to
  the page through `resumeData.restored`, and a restored draft **never auto-captures** — it stamps
  the honest `other` instead, because a false coordinate is worse than an absent one, the absent one
  being at least visible as absent. 6 new tests; mutation → 1 red (fence), 2 red (page), 1 red
  (restoredAt). ⚠️ `submittedAt` is client-supplied: a STATED trade, recorded as residual R8.

- [x] **[AI-Review][MEDIUM] R8 — "a position wins over a stale reason" was guarded on the envelope
  while the column is fed from the answers**
  [`apps/web/src/features/forms/hooks/useDraftPersistence.ts:268`].
  Suppressing `enrichedPayload.gpsUnavailableReason` left `_gpsUnavailableReason` inside
  `responses`, which becomes `raw_data`, which feeds the column — so a row could hold a real
  position AND a reason not to have one, the precise state the suppression exists to prevent. ⭐ The
  certifying test (*"a position WINS over a stale reason"*) asserted only the envelope, and **its own
  fixture would still have produced the incoherent row** [[pattern-test-that-passes-over-a-hole]].
  Not reachable through the shipped UI (only the escape hatch writes the key, and it submits
  immediately), so this was latent rather than live — recorded as such rather than inflated.
  **FIX:** the superseded reason is stripped from the answers too, keeping the queued payload and
  the saved draft coherent ON THE DEVICE — which matters because an offline row can sit there for
  days and be read back by `restoreToDraft` long before any server sees it. Mutation → 1 red.

- [x] **[AI-Review][MEDIUM] R9 — the escape hatch cleared itself before an unguarded `await`**
  [`apps/web/src/features/forms/pages/FormFillerPage.tsx:560`].
  `setGpsBlocked(false)` ran before an unwrapped `await draft.completeDraft(...)`, with
  `setCompleted(true)` after it — while the sibling pending-NIN exit wrapped the identical call in
  try/catch. On an IndexedDB rejection (quota, private browsing) the amber panel had already gone,
  no completion screen rendered, and nothing reported a failure: the enumerator was left on the last
  question with the only submit path they had just used, and the interview would be re-entered from
  scratch. This is the path a FIELD PHONE takes — least storage, most aggressive eviction. **FIX:**
  the panel is cleared only after the write succeeds, the await is guarded, and a failure is shown
  (`gps-submit-error`) instead of a completion screen for a submission that was never queued.
  Mutation → 1 red.

- [x] **[AI-Review][MEDIUM] R10 — the briefing PDF has TWO mojibake glyphs; R2 records one**
  [`docs/runbooks/enumerator-field-briefing.md:14,124`].
  Found by rendering the PDF and reading the text back rather than trusting the note
  [[pattern-a-record-about-the-work-is-not-the-work]]: the warning glyph at line 14 renders as
  mojibake (the one R2 names) **and the arrow at line 124 — §7's "oyoskills.com → check
  registration" — renders as mojibake too**, in the document that is printed and handed to
  enumerators. Both pre-date this story. R2 as written ("the briefing's **one** pre-existing ⚠️ glyph
  … one-line fix") would have been discharged with the arrow still broken — the same
  instance-not-class shape as 13-70's R8, logged three days earlier. **FIX:** both glyph sources
  removed; PDF re-rendered and re-read — 3 pages, both sites clean, all five new §3 phrases present,
  "Coming soon" absent, no remaining unrenderable characters. ⚖️ **R2 is therefore
  PROPOSED-CLOSED — awaiting ruling** (evidence by the review; ruling by Awwal). It is left OPEN in
  the ledger above because this review may not sign it.

- [x] **[AI-Review][LOW] R11 — `permissionAllowsSilentRefresh`'s comment claimed an absolute the
  code cannot keep** [`apps/web/src/features/forms/lib/geo-capture.ts`].
  Returning `true` when the Permissions API is absent is CORRECT and M2 proves the branch is
  load-bearing for the 4 measured iOS Safari enumerators. But the comment said an OS dialog over a
  "Complete Survey" tap "is the one thing this must never do", and on iOS Safari a permission still
  in the `prompt` state (the open-time dialog dismissed rather than answered) **will** raise exactly
  that. **FIX:** comment corrected to state what is actually guaranteed and where it cannot be, with
  the trade named. Behaviour deliberately unchanged. Recorded as residual R6.

- [x] **[AI-Review][LOW] R12 — the heuristic's comment overstated array compatibility**
  [`apps/api/src/services/fraud-heuristics/duplicate-response.heuristic.ts`].
  "Non-empty arrays therefore compare exactly as they did before this change" is untrue in two cases
  the suite itself asserts: a single element containing a comma no longer matches the two-element
  array, and a one-element array no longer matches the equivalent scalar. The Completion Notes get
  this right and call it hardening on measured evidence (0 choice values on either shipped form
  contain a comma); the CODE comment — the one that will be read in a year — did not. **FIX:**
  comment corrected to name both tightenings and why neither is a live behaviour change today.

- [x] **[AI-Review][LOW] R13 — AC9's round trip was pinned at both ends but never crossed**
  [`apps/web/src/services/__tests__/sync-manager.test.ts`].
  The AC9 cases hand-write the queued payload instead of consuming one the producer emits. Both ends
  happen to name the same keys, so a rename would red one side — the hole is closed, but by two
  independent tests agreeing rather than by design. ⭐ Raised because **this repo already carries the
  scar at this exact boundary**: `sync-manager.ts:152-159` records a `restoreToDraft` bug whose
  "unit test missed it because its fixture was written from my assumption about the shape rather
  than from the producer; it confirmed the bug instead of catching it." **FIX:** a round-trip test
  that states the producer's envelope once as data and asserts the consumer honours every key of it
  by ENUMERATION, so a field added to `SubmitSurveyPayload` and forgotten in the rebuild fails in
  the one place that can see both halves
  [[pattern-request-test-from-the-schema-not-the-caller]].

**⚠️ A defect the review introduced into its own fix, caught by the suite and recorded rather than
quietly corrected.** The R7 date fence made **five pre-existing 13-71 controller cases pass
vacuously**: `validBody.submittedAt` is `2026-02-13`, which predates the effective date, so every
acceptance case in that block would have run against a WAIVED gate and proved nothing. The suite
caught it within a minute — one test flipped to accepting what it asserts is refused. All 13-71
cases now use an explicit `postEffectiveBody`, and a boundary-instant case pins where the fence
actually sits. This is [[pattern-test-that-passes-over-a-hole]] arriving from the unusual direction:
the hole opened underneath tests that were already correct.

### Gates — RE-RUN BY THE REVIEWER AFTER THE FIXES

⭐ These are the reviewer's own runs, not the dev's figures re-quoted. The dev's table above is
their pre-review state and is left untouched so the two are comparable.

| Gate | Result |
|---|---|
| `tsc --noEmit` — types, api, web | **0 errors** |
| `eslint` — api `src scripts`, web `src e2e` | **0 problems** — not merely 0 errors. The discard-destructuring in the two strip fixes would have left 3 `no-unused-vars` warnings, and this story's standard is 0 problems, so both were rewritten as explicit `delete`s |
| Drift guards, run **DIRECT** (never through turbo) | registry-read **411** · respondent-write **411** · story-residuals **328** — all clean |
| **API suite** (`apps/api`, `NODE_ENV=test`, app_test) | **331 files / 4,700 tests — 4,692 passed / 8 skipped / 0 failed, exit 0** |
| **Web suite** (`apps/web`) | **283 files / 3,174 tests — 3,172 passed / 2 todo / 0 failed, exit 0** |
| Residual guard vs `Status: done` | reds **all 8** rows and names each; story file restored afterwards |
| Briefing PDF | re-rendered and **read back**: 3 pages, both mojibake sites clean, all five new §3 phrases present, "Coming soon" absent |
| Line endings across all 23 changed paths | no mixed CRLF/LF in any file [[pitfall-crlf-invisible-to-git-bash-grep]] |

**TEST-COUNT DELTA FROM THE DEV'S CLOSING FIGURES — every test accounted for, file by file.**

API **+7** (331 / 4,693 → 331 / 4,700). No new files:

| File | Before | After | Δ |
|---|---|---|---|
| `controllers/__tests__/form.controller.test.ts` | 47 | 51 | **+4** — R6 reason, R6 accuracy, R7 pre-effective, R7 boundary instant |
| `workers/__tests__/webhook-ingestion.gps-columns.integration.test.ts` | 5 | 8 | **+3** — R6 unrecognised → NULL, R6 whole vocabulary accepted, R6 negative accuracy |
| | | | **+7 ✓** |

Web **+11** (283 / 3,163 → 283 / 3,174). No new files:

| File | Before | After | Δ |
|---|---|---|---|
| `features/forms/pages/__tests__/FormFillerPage.geopoint.test.tsx` | 23 | 29 | **+6** — R7 ×3, R7 manual recapture on a restored draft, R9 ×2 |
| `services/__tests__/sync-manager.test.ts` | 32 | 35 | **+3** — R7 `restoredAt`, R13 round trip ×2 |
| `features/forms/hooks/__tests__/useDraftPersistence.test.ts` | 23 | 25 | **+2** — R8 ×2 |
| | | | **+11 ✓** |

⚠️ **One PRE-EXISTING web test was AMENDED rather than added**, and it is named here because an
unexplained amendment is the same problem as an unexplained delta:
`useDraftPersistence.test.ts`'s "resumes from existing draft" deep-equals `resumeData`, which gained
`restored: false` with R7's fix. It is left as a deep equal ON PURPOSE — a new field on that shape
should have to be acknowledged there rather than silently absorbed.

⚠️ **`sed -i` normalised this story file from CRLF to LF** during the residual-guard mutation.
Content round-tripped correctly (`git diff` shows no whole-file churn) and LF is what git's index
already stores for it, so the effect is benign — recorded because it is
[[pitfall-crlf-invisible-to-git-bash-grep]] biting from the writing side rather than the reading
side, and because a reviewer who notices it in the diff deserves to find it already explained.

---

## ⚖️ FOR THE ADJUDICATION AGENT — read this section first

Written by the adversarial code review, 2026-09-21, for a reader who has this file and not the
review transcript. Everything below is either **a decision that is Awwal's to make and not the
review's**, or **something the review deliberately did not do**. Nothing here is a status claim.

### 0. ⚖️ ADJUDICATION VERDICT AND RATIFICATIONS — 2026-09-23

**VERDICT: the work is sound. No defect found in the code.** Gates run by adjudication, not read off the
report: tsc api+web **0/0** · eslint touched, both packages **0/0** · three drift guards DIRECT
**411/411/328** · **API 331 files / 4,700 tests / 4,691 passed / 9 skipped / 0 failed** · **web 283 files /
3,174 tests / 3,172 passed / 2 todo / 0 failed** — ⭐ both totals reproduce the review's figures exactly.
File List reconciles to all 23 paths and its "NOT touched" fences were verified. Two RED-verifies of
adjudication's own, both restored md5-identical: neutering the fence boundary (`<`→`<=`) reds the boundary
test; neutering AC3's core reds the two positive-refusal assertions while the negative cases correctly stay
green.

**D1–D4 RATIFIED (Awwal, 2026-09-23.** Two-part attribution per handoff §2al: evidence and options by the
adversarial review, recommendations by adjudication, ruling by Awwal.)

| | ratified | the reasoning that decided it |
|---|---|---|
| **D1** | the fence is a DATE | Already settled by the fence ruling below; **R9** carries the structural fix so the date cannot rot silently again |
| **D2** | a restored draft stamps `other` rather than capturing | The rejected third option — prompting the operator — asks an enumerator to attest to a location the system cannot verify. An honest `other` plus the manual button is better than a dialog that manufactures a false position. ⚠️ Accepted cost: a genuine re-interview records `other`; the manual button recovers it |
| **D3** | an unrecognised reason drops to NULL at the worker | Failing the job after HTTP 200 would lose a whole submission over a metadata field. ⭐ **ADJUDICATION'S CORRECTION TO THE REVIEW'S OWN COST STATEMENT:** it said such a row is "indistinguishable from a legacy row in R5's `unexplained` count". It is not — **the value survives in `raw_data`**, so R5's query separates them with one extra clause. Recorded rather than accepted blind |
| **D4** | `Draft.restoredAt`, non-indexed, no Dexie bump | ⭐ Precedent **verified, not merely claimed**: Dexie's `stores()` declarations list only INDEXED keys, and `restoredAt`/`permanentFailure`/`referenceCode` appear in none of them |

⚠️ **THE MODEL CAVEAT IS BEING DISCHARGED PROPERLY** (Awwal, 2026-09-23): `/code-review ultra` was launched
against this branch — a multi-agent cloud review on different models — specifically because the review's
OWN fixes, including R6 and R7, are the two largest changes in the tree and had received zero independent
passes. Two stories running with that caveat open was one too many.

### 1. FOUR DECISIONS THE REVIEW MADE THAT IT HAD NO STANDING TO SETTLE

⛔ The review was told to fix its own findings, and it did. But three of those fixes embody a
**design choice with live alternatives**, and §2al's lesson is that the defect is the SIGNATURE, not
the decision. These are presented as implemented-and-reversible, not as settled.

**D1 — R7's fence is a DATE. It could have been three other things.** `assertGeopointCaptured` is
now a no-op for a submission whose own `submittedAt` predates
`GEOPOINT_REQUIREMENT_EFFECTIVE_FROM` (`2026-09-21T00:00:00Z`).

| Option | Why not taken |
|---|---|
| **(a) The date fence — TAKEN** | One place, testable, needs no client change, and fixes the offline queue, in-flight retries and any replay path at once |
| (b) Drain the queue before deploying | Cannot be enforced from the code, and an enumerator who is off-grid that week is not reachable by a runbook instruction |
| (c) Client stamps `other` on legacy rows at sync | The client cannot tell a legacy row from a current one either, and it would put the fix on the device that is by definition not syncing |
| (d) Accept the rejections and rely on "Reopen" | This is what the review found. The recovery manufactures a FALSE location, which is worse than the rejection |

⚠️ **The cost of (a) is R8** — `submittedAt` is client-supplied. If Awwal prefers a stricter posture,
the fence can be narrowed to a one-week window rather than an open-ended past, at the price of
refusing genuinely older offline rows. **Not the review's call.**

**D2 — a restored draft now stamps `other` rather than capturing.** `restoreToDraft` marks
`restoredAt`; the page suppresses auto-capture and records the honest `other`. The alternative — let
it capture — is what produced the finding. A third option exists and was NOT taken: prompt the
operator ("are you at the interview location?"). Rejected as a dialog nobody reads, but it is a real
option and it is the one that would recover a genuine re-interview automatically instead of relying
on the manual button.

**D3 — an unrecognised reason is DROPPED TO NULL at the worker, not rejected.** A value outside
`gpsUnavailableReasons` lands as `NULL` in the column while remaining visible in `raw_data`. The
alternative is to fail the job. Dropping was chosen because this runs AFTER the HTTP 200 — failing
there loses the whole submission over a metadata field. ⚠️ **Consequence to rule on:** such a row
becomes indistinguishable from a legacy row in R5's `unexplained` count. The review judged that
acceptable because no supported client can produce one; if Awwal disagrees, the alternative is a
distinct sentinel value, which costs a vocabulary change.

**D4 — `Draft.restoredAt` was added to the offline schema.** Optional and NON-INDEXED, so no Dexie
version bump is required (the same precedent as `permanentFailure` and `referenceCode` on the queue
table, both added this way). This is the review's one structural addition and the one thing in these
fixes that touches persisted client state.

### 2. WHAT THE REVIEW DELIBERATELY DID NOT DO

- ⛔ **Did not change `Status`.** It is `review`. The BMAD `code-review` workflow's step 5 would have
  auto-flipped it to `done` or `in-progress` and synced `sprint-status.yaml`; that step was **not
  run**, because it conflicts with this story's own instruction (adjudication owns the commit) and
  with §2al. A reviewer flipping a status is a reviewer signing a ruling.
- ⛔ **Did not touch `sprint-status.yaml`** beyond the dev's existing entry. Its close-out line still
  reads "ready for adversarial code review then adjudication", which is now stale by one step and is
  **adjudication's to update**, not the review's.
- ⛔ **Did not commit anything.** 19 modified + 4 new = 23 files sit uncommitted.
- ⛔ **Did not close a single residual.** R2 is PROPOSED only (see its row).
- ⛔ **Did not re-measure the prod numbers in R3/R4/R5.** Those are the dev's, dated 2026-09-20, and
  they are DISCHARGE-ON-DEPLOY. The review verified the ARITHMETIC and the exclusion clause, not the
  underlying prod state.

### 3. THE MODEL CAVEAT, AND HOW TO ACTUALLY DISCHARGE IT

⚠️ **This review was performed by the same model that wrote the code** — Claude Opus 5 (1M context)
on both sides. The brief asked for a different model; that caveat is **UNDISCHARGED for the second
story running** (13-70 shipped with it undischarged too).

The compensation applied was execution over reading, and it was not cosmetic: the two HIGH findings
were proven by running them against a real PostgreSQL row, and every fix was RED-verified by
mutation. But **nobody except the author has reviewed R6 and R7's fixes**, and those are the two
largest changes in the tree.

⭐ **`/code-review ultra` on the current branch runs a multi-agent cloud review on different models
and would discharge this for the first time.** It is user-triggered and billed; the review cannot
launch it. If it is run, the thing to point it at is the review's OWN fixes, not the dev's work —
the dev's work has now had two passes, the review's fixes have had none.

### 4. DEPLOY NOTE — AMENDED BY THE REVIEW

The dev's deploy note (two new nullable columns, no env vars, no migration) **still holds and is
unchanged by these fixes.** Three additions:

1. ⛔ **`GEOPOINT_REQUIREMENT_EFFECTIVE_FROM` must be confirmed against the actual deploy date
   BEFORE shipping** (residual R7). It is currently `2026-09-21T00:00:00Z`. A fence dated earlier
   than the code ships refuses exactly the rows it protects.
2. **No Dexie version bump** despite the new `Draft.restoredAt` — it is non-indexed (D4).
3. **A new log event is worth watching on deploy day:**
   `submission.geopoint_requirement_waived_pre_effective` fires once per pre-dated submission the
   fence lets through. It is the queue draining. If it is still firing a week later, that is R8's
   signal, not the queue.

### 5. A FINDING ABOUT THIS LEDGER, FOUND WHILE WRITING IT

⛔ **The review nearly disarmed the residual guard with its own proposed closure.** The natural
phrasing for R2's state was `PROPOSED-CLOSED — awaiting ruling`. `isOpenState`
(`story-residual-guard.ts:246`) returns **false** for any state containing `CLOSED`, so that wording
would have made the guard read an UNRULED row as closed — and `Status: done` would then have passed
over it silently.

⭐ Caught by reading the guard's source before writing the row, not by running it afterwards. This is
the same defect as 13-70's R8 (closure vocabulary in a cell that decides whether a check fires),
arriving four days later in a different cell of the same table, and it is worth noting that the
FIRST instinct of a careful writer produced it. The proposal therefore lives in the **evidence**
column, and R2's state cell says only `OPEN`. **Anyone ruling on R2 must not write that word into
column 3** — strike the id as `~~R2~~` instead, which is this repo's resolved convention and what
`residualRows` actually skips on.

⚠️ Verified after writing: flipping this story to `Status: done` still reds **all 8 rows**, R2
included.
