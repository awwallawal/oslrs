# Story 13.60: No selfie, no ID card — the enumerator walks in with nothing

Status: ready-for-dev

<!-- PREPPED FOR DEV 2026-08-12 by Bob (SM) on Awwal's launch-date ruling: FULL SPEC, all 6 ACs, no
carve. Premises re-verified against prod 1f06179 + git history before the flip. HEADLINE: AC5.1-5.3
are CLOSED — the capture blocker was a `connect-src data:` CSP omission, fixed in 27e1fdc on
2026-08-10, and a real enumerator captured a selfie and got a card on 08-10/08-11. AC5.3's "CSP is
not the blocker — do not re-chase" was FALSE and is struck. Remaining scope: AC1-AC4, AC5.4, AC5.5,
AC6. FIELD-DAY GATE 1 of 3 — start here. -->

<!-- ⛔ DO NOT REGENERATE THIS FILE WITH *create-story. It would author from epics.md and destroy
four rounds of corrections that cost real measurement to earn. Edit in place. -->


<!-- EMERGENT 2026-08-09 from the enumerator invite dry run. The camera's ASPECT bug was fixed the
same day (22b00eb); this was the SECOND, independent route to the same empty photo.

⚠️ TITLE CORRECTED + SCOPE WIDENED 2026-08-10 after Awwal's Test A on prod (SCP §9).
⛔ THE OLD TITLE — "…and the ID card ships without a photo" — WAS FALSE. The card does not ship
without a photo; it does not ship AT ALL. `user.controller.ts:89` refuses when
`liveSelfieIdCardUrl` is null, and the Super Admin page reports "User has not uploaded a selfie. ID
Card cannot be generated." Correcting this before a dev reads it, per 13-57's lesson: a story raised
on a false claim costs a dev a day. The consequence is worse than the old title implied — an
enumerator who skips or fails the selfie has NOTHING to show at a household door — which is why this
is now a FIELD-DAY GATE, not a dignity item. -->

## ⚠️ Test A (prod, 2026-08-10) — ✅ **RESOLVED 2026-08-12. Read the AC5 correction block.**

~~Two of two recent field-path attempts produced **no selfie and no card**; the April 2026 enumerator
account has **both**, with a stored score of 0.8589. **Suspected regression, not an unbuilt feature.**~~

**It WAS a regression, it was diagnosed, and it is fixed** — `27e1fdc` (2026-08-10), a `connect-src`
CSP omission, *not* the aspect-ratio hypothesis and *not* a CDN timeout. Re-queried on prod
2026-08-12: an enumerator activated **2026-08-10** now holds both selfie URLs and a card
(verified 08-11). **The capture path is no longer a field-day blocker.** What remains open in this
story is the silent-swallow (AC1–AC4), the no-face dead-end (AC5.4), the jsdelivr dependency (AC5.5)
and the upload fallback (AC6). Original evidence and ruled-out hypotheses: **SCP §9.1**.

## Story

As **an enumerator whose ID card is how a household knows I am genuine**,
I want **to be told when my photo does not save**,
so that **I do not walk into the field holding a card with an empty photo box, having watched myself
take the picture.**

## Context — two independent routes to the same empty photo

`auth.service.activateAccount`:

```ts
try   { selfieData = await photoService.processLiveSelfie(imageBuffer); }
catch { logger.warn({ event: 'activation.selfie_failed' }); selfieData = null; }
```

Activation then completes normally. The user is told **nothing**. `live_selfie_original_url`,
`live_selfie_id_card_url` and `liveness_score` stay NULL, and the ID-card renderer has no photo.

**Measured on prod 2026-08-09** for the dry-run account (`lawalkolade+enum1@gmail.com`):
`has_selfie: f`, `has_idcard_photo: f`, `liveness_score: null` — and the logs show **neither**
`activation.selfie_processed` **nor** `activation.selfie_failed`, i.e. nothing was ever submitted.

So there are two distinct paths to a photoless card, and **only the first is fixed**:
1. ~~The preview showed a portrait crop while the capture saved the full landscape frame, so the
   operator could not frame their face and gave up.~~ **Fixed 2026-08-09 (22b00eb).**
2. **The upload/processing throws and is swallowed.** Still open. This story.

⚠️ **The swallow is not obviously wrong, which is why it survived.** Failing the whole activation
because a photo did not process would be worse — the account is otherwise complete. The defect is
that "succeeded", "user skipped" and "failed silently" all produce the same outcome and the same
empty columns.

## Acceptance Criteria

### AC1 — Tell the person, do not fail the activation

1. When `processLiveSelfie` throws, activation still completes — **but the completion screen says the
   photo did not save and offers to retry.**
2. ⚠️ **Do NOT make the selfie blocking.** It is optional by design (`SkipForward` exists in
   `SelfieStep`), and a field officer locked out by a flaky upload is a worse failure than a
   photoless card.
3. The three outcomes must be **distinguishable in the data**: photo saved · deliberately skipped ·
   attempted and failed. Today all three read as NULL columns.
4. ✅ **VERIFIED 2026-08-12 — the swallow is real and unchanged** (`auth.service.ts:171-193`), but it
   is **not total, and the exception matters.** An `AppError` with code `VALIDATION_ERROR` **is
   re-thrown** (`:188-190`), so *that* class of failure already fails the activation loudly. Every
   other throw sets `selfieData = null` and completes silently. Do not write the fix as "catch-all →
   tell the user"; preserve the re-throw, or you convert a currently-loud failure into a quiet one.
   Note also `if (!backOffice && …)` at `:171` — back-office activations skip the block entirely and
   must not be reported as "attempted and failed" (this is why both prod super_admins have no card).

### AC2 — A way back that does not need an admin

1. A staff member with no photo can add one later without being re-invited. **Story 9-12's
   magic-link self-update already exists** (`me.service.ts`, `RESPONDENT_SELF_UPDATED`, token gate) —
   reuse it rather than building a second path.
2. Surfaced where they will see it: a prompt on their dashboard while the photo is missing.

### AC3 — The operator can see it before the field day

1. Staff list / ID-card view shows which active field staff have **no photo on file** — before
   somebody prints twelve cards and discovers it.
2. `activation.selfie_failed` is WARN today and nothing reads it. Count it in the digest (13-42's
   discipline: fires on the real shape, silent when zero).

### AC4 — RED-verify the branch that was never watched

1. Force `processLiveSelfie` to throw; assert activation still completes AND the user is told AND the
   attempt is recorded as *failed* rather than as *skipped*.
2. ⚠️ **A test asserting "activation succeeded" would pass today, over the hole** — that is exactly
   [[pattern-test-that-passes-over-a-hole]]. The assertion must be on the *distinguishability*, not
   on the happy outcome.

### AC5 — ⭐ THE CAPTURE PATH BLOCKS (added 2026-08-10, Test A). Fix this FIRST — the others are downstream.

> ## ⛔ CORRECTION 2026-08-12 (Bob/SM, story-prep verification) — **AC5.1–AC5.3 ARE CLOSED. THE CAUSE WAS CSP, AND IT IS ALREADY FIXED.**
>
> **This is the FOURTH correction on this story and the SECOND on this AC. Read it before you touch
> the capture path — the ruling-out below was itself wrong, and it points a dev away from the answer.**
>
> Shipped in **`27e1fdc` (2026-08-10)** — *"one CSP omission blocked every enumerator from getting an
> ID card"* — landed AFTER this AC was written, on the same day, and diagnosed from a prod console
> trace rather than inferred:
>
> - The blocker was **`connect-src` missing `data:`**, not anything about `cdn.jsdelivr.net`.
>   `@vladmandic/human`'s `warmup()` `fetch()`es a built-in base64 sample JPEG; a `fetch()` of a
>   `data:` URL is governed by **`connect-src`, not `img-src`**. It threw, the catch set
>   `modelFailed`, and every device showed *"Face detection unavailable"*.
> - Second, independent break: `confirm()` did `await fetch(capturedImage)` on its own screenshot
>   data URL with **no try/catch**, so **"Use Photo" was inert**. No enumerator could submit a selfie,
>   so none could get a card. Both defects were required for the silence.
> - Fix: `connect-src` gains `data:` (app.ts + all four nginx mirror occurrences), `warmup: 'none'`,
>   and `confirm()` decodes in-process (`atob` → `Uint8Array` → `File`) inside a catch that RENDERS
>   the failure. Two tests added that assert the artefact; RED-verified.
>
> **⛔ AC5.3 WAS FALSE.** *"CSP is not the blocker (`app.ts:196` allows `cdn.jsdelivr.net`)"* checked
> the **wrong directive**. Allowing the model CDN says nothing about `connect-src data:`. Reading
> "already ruled out, do not re-chase" would have steered a dev away from the actual cause. Same class
> as this story's first correction and 13-57's three: **a conclusion asserted without the query that
> settles it.**
>
> **⛔ AC5.2's hypothesis is DISPROVEN, not unmeasured.** `aspectRatio: 3/4` and ideal `960×1280` are
> **still in the code today** (`:196-199`) and capture now works on prod. The portrait constraint was
> never the cause. Do not spend the field day on it.
>
> **✅ PROD EVIDENCE the path is live** (queried 2026-08-12, prod `1f06179`):
>
> | enumerator | created | `live_selfie_original_url` | `live_selfie_id_card_url` | `liveness_score` | verified |
> |---|---|---|---|---|---|
> | (active) | **2026-08-10** | ✅ | ✅ | 0.5913 | **2026-08-11** |
> | (April baseline) | 2026-04-20 | ✅ | ✅ | 0.8589 | — |
> | (deactivated) | 2026-08-09 | ✗ | ✗ | — | — |
>
> A **real capture succeeded end-to-end on 2026-08-10 and produced a card on 08-11** — after the fix,
> after Test A. "Two of two field-path attempts fail" is **no longer true**. Staff totals: enumerators
> 2 of 3 with a card (the third is deactivated); super_admins 0 of 2 — expected, they activate
> back-office (`backOffice` skips the selfie block entirely, `auth.service.ts:171`).
>
> **WHAT SURVIVES IN AC5 — build these two, they are untouched by `27e1fdc`:** items **4** and **5**
> below. Everything above them is done.

1. ~~`LiveSelfieCapture.tsx:109` — `canCapture = !isModelLoading && (modelFailed || faceCount === 1)`.
   With the model loaded and `faceCount === 0` the button is **disabled** and the red *"No face
   detected"* badge shows. Awwal hit exactly this and **had to skip the step to finish activation.**~~
   **CLOSED** — the true cause was `modelFailed` being set by a CSP-blocked `warmup()`, plus an inert
   "Use Photo". Both fixed in `27e1fdc`. The `canCapture` expression itself is unchanged and now lives
   at **`:160`**, which is why item 4 still stands.
2. ~~⛔ **MEASURE BEFORE FIXING.** The leading hypothesis is that `22b00eb`'s **portrait** constraint
   (`aspectRatio: 3/4`, ideal `960×1280`, `:144-149`) is a **phone** shape and Test A ran on **desktop
   Firefox**, where laptop webcams are natively landscape.~~ **DISPROVEN** — the constraint is still
   present at `:196-199` and capture works. The instruction itself was right and is what settled it.
3. ~~**Already ruled out, do not re-chase:** CSP is not the blocker (`app.ts:196` allows
   `cdn.jsdelivr.net`), and `modelFailed` was false, so the model loaded.~~ **FALSE — CSP *WAS* the
   blocker**, on `connect-src data:`. See the correction block.
4. ⚠️ **Whatever the cause, the UX must not dead-end.** A face-detection check that cannot be
   satisfied and cannot be overridden is worse than no check: it converted a required step into a
   skipped one, which then triggered AC1's silent swallow. **Give the operator a way through that is
   recorded** — see AC6.
5. 📌 **The model is fetched from a third-party CDN at activation time** (`:29`, 15s timeout). A field
   officer on poor connectivity falls silently into `modelFailed`, where capture is allowed with no
   guidance at all. Self-host it or state the dependency; a launch path should not require
   `jsdelivr.net`.

### AC6 — Passport-photo upload as a recorded fallback (Awwal's question, 2026-08-10)

> ### ✅ CONFIRMED 2026-08-12 — AC6 IS IN SCOPE AND RULED YES. Do not treat it as pending.
>
> ~~PM recommendation: YES — pending Awwal's confirmation.~~ **Confirmation given.** Provenance,
> stated in full so the next reader does not have to reconstruct it:
>
> On 2026-08-12 Bob (SM) put the launch-date scoping choice to Awwal. The option he selected was
> **"Full spec, all 19 ACs"**, whose text named this AC explicitly — *"13-60's AC6 passport fallback"*
> — as one of the items that choice keeps. **He read it named and ruled it in.** The alternative
> option on the table was a field-day carve that would have deferred exactly this.
>
> ✅ **AND THEN ASKED DIRECTLY, because the two readings differ.** "Do not cut AC6 from scope" and
> "yes, build passport upload" are not automatically the same sentence, and this AC carries a product
> decision about the anti-fraud posture rather than a pure implementation choice. Put to Awwal in
> those words on **2026-08-12**; he answered **"Yes — build it."** **No inference is load-bearing
> here: the ruling is direct, and it includes AC6.4's `liveness_score` rename in the same pass** (the
> alternative offered was to defer the rename, and it was declined).
>
> 🔗 **AC5.4 depends on this.** One of the two surviving AC5 items requires *"a way through that is
> recorded — see AC6"*. If AC6 were genuinely still pending, AC5.4 would have no remedy to point at
> and the no-face dead-end would stay open. They ship together or neither does.
>
> 📌 **Flagged by John (PM) on 2026-08-12** — a `ready-for-dev` story must not contain an AC that
> reads as awaiting a ruling. The prep pass had verified premises and stopped short of propagating the
> scoping ruling into this line. **A ruling that lives only in a conversation is not a ruling the dev
> can read** — same class as this repo's [[pattern-a-record-about-the-work-is-not-the-work]].

The usual objection is that live capture
is the anti-fraud control. **On this system that objection is already false:**

- `photo-processing.service.ts:133-135` — `livenessScore = Math.min(sharpness / 100, 0.99)`, with a
  comment saying it *"comes from Rekognition"* in production. **Rekognition is not wired. The column
  named `liveness_score` holds an image-SHARPNESS ratio.**
- ~~**Nothing gates on it** — no threshold check exists in the API.~~ ⛔ **IMPRECISE — corrected
  2026-08-12 (John/PM) on verification.** Nothing gates on the **stored `liveness_score`** — that part
  holds. But the SAME measurement gates at capture: `photo-processing.service.ts:109-111` rejects any
  image with `sharpness < 20`. **A quality floor exists; a liveness check does not.** The argument for
  AC6 is unchanged — sharpness is not liveness, and live capture still buys no anti-fraud property —
  but "no threshold check exists" was wrong, and the threshold it missed is the one the upload path
  will collide with (Task 6).
- `user.controller.ts:47` — `liveSelfieVerifiedAt: new Date(), // Auto-verify for now`.
- The only real check is client-side "is there one face in frame", which **a printed photograph
  satisfies**.

➜ Live capture currently buys **no anti-fraud property whatsoever**, so permitting an upload forfeits
nothing that exists. It removes friction that is protecting nothing, on the step that has blocked two
of two field-path attempts.

1. Live capture stays the **default and preferred** path. Upload is an explicit fallback.
2. ⛔ **NON-NEGOTIABLE CONDITION — record WHICH path produced the photo, and never write an uploaded
   file into a `live_selfie_*` column without a discriminator.** Storing an upload under that name
   recreates the exact defect above — a name asserting a property the value does not have — and it
   would be self-inflicted, because we would know at write time.
3. The operator can see which staff used which path (same surface as AC3).
4. ⚠️ **Rename or re-comment `liveness_score` in the same pass.** Leaving a sharpness ratio in a
   column called `liveness_score` is [[pattern-monitor-measuring-something-else]], and it is the
   sixth instance found in two days. If a real liveness check is ever wired, it must not have to
   fight a name that is already taken by something else.

## Out of scope

- Photo quality thresholds and a **real** liveness check (Rekognition or equivalent). AC6.4 fixes the
  *name*; wiring an actual liveness provider is a separate, larger decision with cost implications.
- Public respondents. No photos on the marketplace, by design (13-38 locked decision).

## Notes

- Pairs with **13-59**: one tells the person their account is live, this tells them their photo is not.
- Rooted in the same finding as 13-57: **a caught exception that changes what the citizen or officer
  ends up with must never be silent.**

## Tasks / Subtasks

⛔ **Read the AC5 correction block first.** AC5.1–5.3 are CLOSED (`27e1fdc`). Do not re-chase the
capture blocker; the remaining scope is smaller than this file's length suggests.

- [ ] **Task 1 — Make the three outcomes distinguishable** (AC: #1)
  - [ ] `services/auth.service.ts:171-193` is the swallow. ⚠️ **Preserve the existing re-throw** — an
        `AppError` with code `VALIDATION_ERROR` is re-thrown at `:188-190` and already fails loudly. A
        catch-all rewrite turns a currently-loud failure quiet.
  - [ ] ⚠️ `:171` is `if (!backOffice && …)` — back-office activations never enter the block. They are
        **skipped**, not **failed**, and must not be counted as failures (both prod super_admins).
  - [ ] Persist saved · skipped · attempted-and-failed distinctly. Today all three are NULL columns.
  - [ ] Completion screen states the photo did not save and offers retry; activation still completes.
- [ ] **Task 2 — A way back without an admin** (AC: #2)
  - [ ] Reuse 9-12's magic-link self-update (`services/me.service.ts`, audit action
        `RESPONDENT_SELF_UPDATED` = `respondent.self_updated`, `services/audit.service.ts:179`).
        **Do not build a second self-service path** (13-55's five-copies lesson).
  - [ ] Dashboard prompt while the photo is missing.
- [ ] **Task 3 — Operator visibility before the field day** (AC: #3)
  - [ ] Staff list / ID-card view flags active field staff with no photo. `user.controller.ts:89`
        already refuses to generate a photoless card — surface that state *before* someone prints.
  - [ ] Count `activation.selfie_failed` (currently WARN, read by nothing) in the digest; silent at zero.
  - [ ] 🔗 Same operator screen as 13-59's "who has not downloaded" — build one surface, not two.
- [ ] **Task 4 — RED-verify the branch nobody watched** (AC: #4)
  - [ ] Force `processLiveSelfie` to throw; assert activation completes **AND** the user is told **AND**
        the attempt records as *failed*, not *skipped*. ⚠️ Assert **distinguishability** — "activation
        succeeded" passes today, over the hole.
- [ ] **Task 5 — The no-face dead-end and the CDN dependency** (AC: #5.4, #5.5)
  - [ ] `LiveSelfieCapture.tsx:160` — `canCapture = !isModelLoading && (modelFailed || faceCount === 1)`
        is **unchanged by `27e1fdc`**. With the model healthy and `faceCount === 0` there is still no
        override. Give a recorded way through (Task 6), not a silent skip.
  - [ ] `:30` still sets `modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/'` —
        the model is fetched from a third-party CDN at activation time. Self-host it or state the
        dependency explicitly; a launch path should not require `jsdelivr.net`.
- [ ] **Task 6 — Passport upload as a recorded fallback** (AC: #6) — ✅ **RULED YES 2026-08-12**
  - [ ] Live capture stays default; upload is the explicit fallback.
  - [ ] ⚠️ **AN UPLOADED PHOTO HITS A BLUR FLOOR NOBODY HAS MENTIONED — decide this before building.**
        `photo-processing.service.ts:109-111` computes `sharpness = stats.channels[0].stdev` and
        **throws `AppError('VALIDATION_ERROR', 'Image is too blurry. Please retake.')` below 20** —
        *"threshold determined empirically"*. A phone photo **of a printed passport picture** is
        precisely the image that fails a blur threshold. **So the fallback built to rescue people who
        cannot complete a selfie can reject them for a different reason, with the same outcome:**
        no photo, no ID card. Route around the check for uploads, tune it separately, or accept it —
        but choose deliberately and say which, because silently inheriting it makes AC6 fail for the
        exact users it exists to serve.
  - [ ] 🔗 **This is also the re-throw in Task 1.** That `VALIDATION_ERROR` is the one exception
        `auth.service.ts:188-190` re-throws — so the blur check is currently **the only path on which
        a failed photo tells the person anything at all.** Task 1 must not flatten it.
  - [ ] ⛔ **NON-NEGOTIABLE: a discriminator.** Never write an uploaded file into a `live_selfie_*`
        column unlabelled — that recreates the exact defect this story names, self-inflicted.
  - [ ] Operator sees which path produced each photo (same surface as Task 3).
  - [ ] **Rename/re-comment `liveness_score` in the same pass** — ruled IN, deferring was declined.
        `services/photo-processing.service.ts:106-110` computes `sharpness = stats.channels[0].stdev`
        and `:133-134` comments *"In production, livenessScore comes from Rekognition"*. **Rekognition
        is not wired**; nothing gates on the value; `user.controller.ts:47` auto-sets
        `liveSelfieVerifiedAt` (*"Auto-verify for now"*). The column name asserts a property the value
        does not have.

## Dev Notes

### Project Structure Notes

- Capture component: `apps/web/src/features/onboarding/components/LiveSelfieCapture.tsx`.
- API: `services/auth.service.ts` (activation), `services/photo-processing.service.ts` (processing),
  `controllers/user.controller.ts` (ID card, `:89` photoless refusal), `routes/user.routes.ts:24`
  (`GET /id-card`, authenticated — reuse, do not add a download path).
- ⚠️ **CSP is `reportOnly` outside production** (`app.ts`). The class of defect fixed in `27e1fdc`
  **cannot reproduce in dev, test, CI or E2E** — every green suite here runs with the production
  security posture disabled. Any CSP-adjacent change needs the nginx mirror kept byte-identical
  (csp-parity) and a prod check.

### References

- `27e1fdc` (2026-08-10) — the CSP `connect-src data:` fix; read its message before touching capture.
- SCP §9.1 / §9.2 — Test A evidence and the two numbers that were meant to settle the (now disproven)
  aspect-ratio hypothesis.
- Prod verification 2026-08-12 (`1f06179`) — table in the AC5 correction block.

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-09 | Raised EMERGENT from the enumerator invite dry run | Awwal |
| 2026-08-10 | Title corrected (card does not ship at all); raised to field-day gate; AC5 + AC6 added | John (PM) |
| 2026-08-10 | `27e1fdc` ships the real capture fix (CSP `connect-src data:`) | — |
| 2026-08-12 | Correction #4 — AC5.1–5.3 closed, AC5.3's "CSP ruled out" struck as false; prod re-verified; flipped to `ready-for-dev` | Bob (SM) |
| 2026-08-12 | AC6 confirmed **build it**, incl. the `liveness_score` rename (deferral declined) | Awwal, flagged by John (PM) |
| 2026-08-12 | Tasks/Subtasks + Dev Notes added | Bob (SM) |
