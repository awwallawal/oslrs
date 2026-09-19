# Brief — Story 13-71: GPS is served, offered, and not taken. Capture it on open, and require it.

**Authored 2026-09-18 (adversarial-review session, out of 13-69's prod measurement). For SM → `*create-story`.**
**Requested by Awwal, 2026-09-18:** *"scope option 2, auto-capture on form open and 3 make the gps_location required so that we are double sure … we need to be able to monitor things so that we can map the Enumerators to their bases."*

⚠️ **This brief states its own evidence and its own corrections.** Every number below was measured read-only against prod on 2026-09-18 (`5c4cc93`). Numbers are perishable — **re-measure before building** [[pattern-falsifiable-number-is-a-live-artefact]].

---

## 1. The finding, with numbers

`gps_location` is served by the live enumerator form and is almost never answered.

| Measured 2026-09-18 | Value |
|---|---|
| Enumerator submissions in the trial window (≥ 2026-09-05) | **36** |
| …carrying coordinates | **4** |
| Distinct enumerators submitting in that window | **10** |
| …who captured a location even once | **3** |
| All-time enumerator submissions / with GPS | **37 / 5 (13.5%)** |
| Most active enumerator (Adedeji Adetola) | **1 of 23** |

**The chain is NOT the problem, and this is the load-bearing measurement:**

| Enumerator rows | 37 |
|---|---|
| `raw_data` carries the `gps_location` key | **5** |
| `raw_data` carries `_gpsLatitude` | **5** |
| `submissions.gps_latitude` column set | **5** |

**5 / 5 / 5.** Every capture that happens reaches the column. Nothing is dropped between `GeopointInput` and the database. **The gap is entirely at the tap.**

## 2. How it is skipped — no bypass, just the Next button

Traced through the code, not inferred:

1. `FormFillerPage` (routes `survey/:formId` for enumerators, `surveys/:formId` for public users) renders **one question per screen** via `QuestionRenderer`.
2. `gps_location` is the ONLY question in the master form's `General` section, so it is its own screen — the first one.
3. `GeopointInput` does nothing until the enumerator presses **Capture location**. It is not automatic.
4. Client validation rejects an empty answer **only when `question.required` is true** (`features/forms/utils/formSchema.ts:72`). On the live form `gps_location` is `required: false`.
5. The server's completeness gate (`form-submission-validation.service.ts`) enforces **required** questions only. It already carries `excludeGeopoint` for the PUBLIC paths; the enumerator path enforces normally — but an optional question is nothing to enforce.

⇒ **Pressing "Next" on an untouched capture button is a complete, valid submission.** Nine of ten enumerators did exactly that. The two captures on `lawalkolade+demo1` are what the flow looks like when someone knows to press the button.

⚠️ **Also true and separately relevant:** when permission is denied, `GeopointInput` shows an inline message — *"Location access denied. GPS data will not be recorded."* — and submission proceeds. So "did not tap" and "tapped and was refused" are **indistinguishable in the data today**. That matters for §5's monitoring: without a reason code, a required field will convert one invisible failure into another.

## 3. Scope — three parts, and the third is the one that was actually asked for

### Part A — Auto-capture on form open (Awwal's option 2)

- On `FormFillerPage` in `mode="fill"`, once the schema resolves, if the form serves a geopoint question, request the position **once**, best-effort, non-blocking, and write it into form state under the geopoint question's name.
- **Re-capture silently at submit** if permission is already granted. A form open at the door and submitted 20 minutes later inside records where the interview STARTED; for base-mapping, the submit-time fix is the truer one. Keep both if cheap (`gps_location` = submit-time, plus an opened-at point in `raw_data`) — the pair also makes "filled in one place, submitted in another" visible.
- ⚠️ **The question NAME is hardcoded downstream.** `useDraftPersistence.ts:186-195` reads `formData.gps_location` literally; a form whose geopoint is named anything else is silently dropped. Auto-capture must read the name FROM THE SCHEMA, and this story should either fix the hardcode or assert the two agree at runtime. [[pattern-request-test-from-the-schema-not-the-caller]]
- ⚠️ Auto-capture triggers the browser's permission prompt at form open. That is a UX change for every enumerator on their first form after deploy, and it is the moment the whole feature lives or dies — see §4.3.

### Part B — Require it (Awwal's option 3), with an escape hatch

**Two implementations, and they are not equivalent:**

| | (a) Edit the XLSForm `required` column | (b) ⭐ Enforce in code, by channel |
|---|---|---|
| Mechanism | `required: true` in `test-fixtures/oslsr_master_v3.xlsx` → re-upload | Client: treat a geopoint as required on the enumerator path. Server: add `requireGeopoint` beside the existing `excludeGeopoint` in `form-submission-validation.service.ts` |
| Cost | ⛔ **Re-upload MINTS A NEW `questionnaire_forms` ROW.** There is no enumerator pin — enumerators reach a form by id in the route — so someone must re-point every enumerator, and in-flight drafts stay on the old id. 13-69 AC9 documents exactly this asymmetry. | No new form row, no re-pointing, no draft breakage |
| Blast radius | Hits **everyone** who renders that form: enumerators, **clerks** (`ClerkDataEntryPage` uses the same `QuestionRenderer`), and logged-in public users on `surveys/:formId` | Exempts clerks by construction |
| Reversibility | Another re-upload | A flag |

✅ **RULED BY AWWAL, 2026-09-18: (b) — CODE-ENFORCED. The XLSForm is NOT edited and no new `questionnaire_forms` row is minted.** AC8 of the seed below is therefore binding, not conditional.

✅ **RULED the same day: BRIEF THE ENUMERATORS FIRST, in the briefing they already get in their accounts.** Done ahead of the build — `docs/runbooks/enumerator-field-briefing.md` gained **§3 "Location — press Capture location at every interview"** (the briefing PDF is rendered from that Markdown at request time by `field-briefing.service.ts`, so there is no second artefact to go stale), plus a checklist line and a supervisor watch-item. ⚠️ **§3 carries a "Coming soon" note describing the auto-capture + required behaviour as FUTURE.** When this story deploys, that note must become the present tense — it is a one-line edit to the Markdown, no redeploy of any PDF, and it is this story's last task.

⭐ **Why (b) was the recommendation:** ⛔ **Clerks must be exempt, and not as a nicety — a clerk transcribing paper forms records the OFFICE, and office coordinates filed as field captures would actively poison the base-mapping this story exists to enable.** Five of seven prod roles map to `clerk` (13-69 R6).

**The escape hatch is not optional.** A hard block with no way past it means an enumerator whose phone denies permission, or who is inside a concrete building, cannot submit AT ALL — and will fall back to paper, which is strictly worse than a GPS-less digital row. Required must be satisfiable EITHER by coordinates OR by an explicit, logged `gps_unavailable_reason` (denied / no signal / device unsupported / other). The reason turns today's invisible skip into a counted event, and an enumerator who always chooses "no signal" becomes visible — which is itself the monitoring signal.

### Part C — The monitoring Awwal actually asked for: map enumerators to bases

1. **Persist accuracy.** `GeopointInput` already captures `accuracy` and **throws it away — there is no `gps_accuracy` column.** Add it. Without accuracy, a 2 km network fix and a 5 m satellite fix look identical, and base-mapping cannot tell a base from a neighbourhood. It also unblocks the "GPS accuracy > 50 m" secondary signal the fraud engine documents as blocked on exactly this column (`gps-clustering.heuristic.ts`).
2. **A per-enumerator GPS coverage surface:** submissions, captured, %, unavailable-reasons, median accuracy, distinct clusters — per enumerator, per day. This is the thing that answers "is this working?" on deploy day and "where does this enumerator work?" a month later. Fold it into the ops activity monitoring runbook (`2f0a5e5`) rather than inventing a new surface.
3. **Base assignment is a SEPARATE read model, and should not be smuggled in here.** The DBSCAN in `gps-clustering.heuristic.ts` exists to detect fraud (a cluster is suspicious), whereas base-mapping wants the opposite reading of the same clustering (a cluster is a workplace). Same maths, opposite semantics — do not reuse the heuristic's output as a base map. Phase 2, once coverage is real.

## 4. Risks and the things that will go wrong

1. ✅ **Staff location tracking — DISCLOSED FIRST, by ruling.** Awwal ruled on 2026-09-18 that enumerators are briefed before enforcement, and §3 of the field briefing now says so in plain words (what is captured, when, why, and what to do when it fails). The residual is the FORMAL half — whether the terms enumerators accept at activation need the same sentence. ⭐ Recommend Awwal or the ministry rule on that wording separately; a runbook is guidance, not consent. Original note: **this is staff location tracking, and it needs to be said out loud.** Auto-capture without a tap changes the enumerator's relationship to the feature: today they choose, after this they are located. It belongs in the enumerator briefing and terms, not only in a release note — and that is an NDPR/employment matter, not a code review one. ⭐ Recommend Awwal rules on the wording before this ships.
2. **Permission denied is sticky.** A browser "Block" on the first prompt persists per origin, and the re-prompt path is buried in site settings. If the rollout prompts badly once, the phone is poisoned for that enumerator and needs a manual fix. Brief BEFORE deploying, so the first prompt is expected.
3. **Two live submissions cannot satisfy a required geopoint at all:** one was filed against the PUBLIC core form (no geopoint question) and one against a form row that no longer exists (13-69 R8). The rule must key on *"this form serves a geopoint question"*, or those paths become unsubmittable.
4. **High-accuracy GPS on every form open costs battery and up to 10s of wait.** `enableHighAccuracy: true, timeout: 10000, maximumAge: 60000` — the cache makes repeat opens cheap; the first open of the day is the slow one. Do not block the first question on it.
5. **Do not backfill or infer.** A missing coordinate stays missing. Inventing one — from the LGA answer, from the respondent's address, from the last submission — would produce exactly the "looks like data" failure 13-69 spent itself ending.

## 5. Acceptance-criteria seed (for the SM to sharpen)

1. On form open in `mode="fill"`, when the schema serves a geopoint question, a position is requested once, without blocking the first question, and stored under **the schema's** geopoint name.
2. A submit-time re-capture refreshes it when permission is already granted; the stored coordinate is the later one, and the earlier one is retained in `raw_data`.
3. On the ENUMERATOR path, a submission with neither coordinates nor a `gps_unavailable_reason` is rejected — **client AND server** (mirror `excludeGeopoint`'s shape, opposite sign).
4. The CLERK path is exempt, asserted by a test that fails if the exemption is removed.
5. `gps_accuracy` is persisted end-to-end (component → payload → column) and read back in a test from the COLUMN.
6. `gps_unavailable_reason` is persisted and countable per enumerator.
7. A per-enumerator coverage query/surface exists, with the deploy-day prediction written down before it runs.
8. No XLSForm is edited and no new `questionnaire_forms` row is minted. ✅ **RULED (Awwal, 2026-09-18) — code-enforced, so this AC is binding.**
10. The briefing `§3` "Coming soon" note is rewritten into the present tense as the LAST task before close, and the PDF is re-downloaded and read back to confirm it rendered [[pattern-a-record-about-the-work-is-not-the-work]].
9. **Deploy-day verification, with a prediction:** GPS-carrying enumerator submissions go from **4 of 36 (11%)** to **>90% within one week**, or the story has not worked. Anything between is a UX problem to investigate, not a success to declare.

## 6. Out of scope

- Base-assignment clustering / a bases read model (Phase 2, §3.3).
- Any fraud threshold or the GPS heuristic's scoring (R-A8).
- The public wizard — `oslsr_public_core_v1` serves no geopoint question and 13-34 removed it deliberately. ⛔ Do not re-add it.
- Back-scoring or repairing the 32 GPS-less enumerator rows already taken. They are GPS-less for good; 13-69's R1 scores them on the other detectors.

## 7. References

- [Source: prod, read-only, 2026-09-18 — the per-enumerator table in §1 and the 5/5/5 chain measurement]
- [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx — one-question stepper, `QuestionRenderer`, routes `survey/:formId` + `surveys/:formId`]
- [Source: apps/web/src/features/forms/components/GeopointInput.tsx — tap-driven capture; `accuracy` captured and discarded; permission-denied text]
- [Source: apps/web/src/features/forms/utils/formSchema.ts:72 — `required` is the only thing that blocks an empty answer]
- [Source: apps/web/src/features/forms/hooks/useDraftPersistence.ts:186-199 — the hardcoded `gps_location` name + `completionTimeSeconds`]
- [Source: apps/api/src/services/form-submission-validation.service.ts:27-77 — `excludeGeopoint`, the shape Part B mirrors]
- [Source: apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx:23,639 — clerks render the same component, hence the exemption]
- [Source: apps/api/src/db/schema/submissions.ts:62-63 — `gps_latitude`/`gps_longitude` exist, no accuracy column]
- [Source: _bmad-output/implementation-artifacts/13-69-fraud-engine-is-dark.md — AC9's pin asymmetry, R6 (clerk channel), R8 (deleted form), and the residual this brief discharges]
