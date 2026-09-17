# Brief — Story 13-69: The Fraud Engine Is Dark

**Author:** Adjudication Agent · **Date:** 2026-09-17 · **For:** Bob (SM) to author Story 13-69 via canonical `*create-story`
**Origin:** Investigation 2026-09-17 into whether a trial enumerator was gaming the system. He was not. The investigation found the detector is not running.
**Tier:** ⚠️ **Pre-enumeration blocker.** Must land before the field cohort scales beyond the trial.

---

## The job-to-be-done (the why)

**The fraud engine has scored nothing since 2026-09-05, and four of its five detectors have never fired.**

| day | submissions | scored |
|---|---|---|
| 09-17 | 7 | **0** |
| 09-16 | 18 | **0** |
| 09-15 | 19 | 2 |
| 09-14 | 1 | 1 |
| **09-05** | **8,278** | **8,278** ← the 13-67 backfill |

Across all **8,282** detections ever written:

| component | times it has ever fired |
|---|---|
| `gps_score` | **0** |
| `timing_score` | **0** |
| `speed_score` | **1** |
| `straightline_score` | 0 |
| `duplicate_score` | 68 |

## Root cause — a chain of three defensible decisions

**No single decision is wrong. The composition disabled the control.**

1. **Story 13-34 AC2 suppressed geopoint on the public path.** A `navigator.geolocation` prompt mid-registration is conversion tax, and `registration.controller` hardcodes `gpsLatitude/Longitude = null`. Deliberate, documented, correct.
2. **Neither published form carries a geopoint question at all.** `oslsr_master_v3` (the ENUMERATOR form): **0**. `oslsr_public_core_v1`: **0**. So nobody is ever asked for coordinates — not even enumerators, for whom the public-path rationale does not apply.
3. **Fraud detection is GPS-gated** — `submission-processing.service.ts:1331`:
   ```ts
   // 5. Fraud detection — GPS-gated (no GPS ⇒ skipped; see AC4 note above).
   if (args.gps) {
     await queueFraudDetection({ ... });
   }
   ```
   No GPS ⇒ no job ⇒ no score, for **any** component.

⭐ **The correspondence is exact, which is what makes this a diagnosis rather than a theory:** exactly **3** submissions in the system carry GPS, and exactly **3** were scored. Every GPS submission scored; every other one did not.

## ⛔ The real defect: the gate is far broader than its own rationale

**Four of the five detectors do not need GPS.** Duplicate, straightline, timing and speed score behaviour and content, not location. One over-broad `if` disabled four working detectors in order to protect one.

**And we have proof the disabled detectors work.** The single `speed_score` ever recorded flagged a questionnaire completed in **41 seconds** against a 246-second theoretical minimum — `{"tier": "superspeceder", "ratio": 0.17}`. That detector functions. It simply never runs.

⚠️ **That flag is also the whole reason this was found:** an operator noticed suspicious timestamps, the investigation cleared the enumerator, and the detector that should have answered the question in one query had not run on 22 of his 23 submissions.

## In scope

**FR1 — Ungate fraud detection. Enqueue ALWAYS; let the GPS component score 0 when coordinates are absent.**
This is the priority and it is close to one line. It turns on duplicate, straightline, timing and speed immediately, for every submission, on both channels.

⚠️ **The worker must tolerate a null GPS without throwing.** `fraud-detection.queue.ts`'s job payload currently types `gpsLatitude`/`gpsLongitude` as required — check `FraudDetectionJobData` and the worker's own handling before assuming a null flows through. A gate removed onto a path that throws is worse than the gate: it moves a silent skip into a noisy retry loop.

**FR2 — `gps_details` must record WHY it scored zero.** Distinguish *"scored and found nothing"* from *"could not score"*. Today a reader cannot tell them apart, which is exactly how this went unnoticed for twelve days. A `"reason": "no_gps_captured"` marker is enough.

**FR3 — Add a geopoint question to `oslsr_master_v3` ONLY** (the enumerator form). Turns on the fifth detector.
⛔ **Do NOT add it to `oslsr_public_core_v1`.** That would re-impose the conversion tax 13-34 deliberately removed, on the exact audience the jingle is driving. The public path keeps `excludeGeopoint: true`.
⚠️ **Re-uploading a form mints a NEW form row and `wizard.public_form_id` must be re-pinned** — verify which pin the ENUMERATOR path reads before publishing, and confirm the enumerator renderer does not inherit `suppressGeopoint` (it defaults to `false`, and nothing outside the public wizard sets it — but confirm rather than assume).

**FR4 — A coverage assertion, because "it is running" must be checkable.**
A test that a submission WITHOUT GPS still produces a `fraud_detections` row. RED-verify it by restoring the gate.

## Acceptance-criteria seeds

1. A submission with no GPS produces a `fraud_detections` row (RED when the gate is restored).
2. Duplicate, straightline, timing and speed all score on a GPS-less submission.
3. `gps_score` is 0 **and** `gps_details` records `no_gps_captured` — not silently 0.
4. The worker does not throw on null coordinates; the job completes.
5. The enumerator form renders a geopoint question; the public form does not.
6. Existing 13-2 R-A2 behaviour is unchanged — the marketplace gate and thresholds are untouched.

## Out of scope — do NOT widen

- **Thresholds and calibration** → that is R-A8's 1,482 held rows. This story turns the detectors ON; R-A8 tunes them. Do not tune blind.
- Back-scoring the unscored submissions since 09-05. ⚠️ **Record it as a residual with a number**: ~50 live submissions are unscored. Decide explicitly whether to back-score; do not let it be forgotten.
- The public path's geopoint suppression. Settled by 13-34.

## Dependencies & sequencing

- **Depends on:** nothing.
- **Blocks:** scaling the field cohort. Today we would deploy hundreds of enumerators with no timing, speed, duplicate or straightline detection running at all.
- **Pairs with R-A8:** this story makes the detectors fire; R-A8 supplies the data to calibrate what they fire *at*. Sequence 13-69 first — thresholds tuned against a detector that never ran would be tuned against nothing.

## The lesson worth carrying into the story record

⭐ **A detector that has never fired is indistinguishable from a clean population — until you check whether it CAN fire.** `fraud_detections` showed 8,282 rows and a maximum score of 25: a table that looks like a working control. The tell was not the score; it was `count(*) FILTER (WHERE gps_score > 0) = 0` across every row ever written.

→ `[[pattern-a-clean-result-must-prove-it-measured]]`, and `[[pattern-ship-a-fix-that-never-fires]]` applied to a detector rather than a fix.
