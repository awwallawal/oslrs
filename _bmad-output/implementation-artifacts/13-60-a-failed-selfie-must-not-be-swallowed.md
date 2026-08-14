# Story 13.60: No selfie, no ID card — the enumerator walks in with nothing

Status: done

<!-- ✅ CODE-REVIEWED 2026-08-13. 2 HIGH / 4 MEDIUM / 3 LOW, all fixed in-pass — see
"Review Follow-ups (AI)" under Tasks/Subtasks.
✅ ADJUDICATED 2026-08-13 → ✅ DEPLOYED `6876b9f` + VERIFIED ON PROD 2026-08-14.
See `## Residuals` (R1–R5) + `## Closing verdict`.
📌 It was held at `review` through one RED CI run and one SKIPPED deploy before being
flipped — which is the point of the hold, not a formality.
⛔ THE "EVIDENCE ONLY EXISTS AFTER DEPLOY" CLAIM WAS WRONG AND IS WITHDRAWN. The
rename ordering was proven LOCALLY against `app_test` — pre-migration state rebuilt,
`liveness_score = 0.7777` seeded, the real pipeline run: runner at log line 2, RENAME
at line 9, `db:push` at line 14, and the value survived. This is NOT
[[pattern-verification-that-cannot-run-yet]]; it was a verification nobody had tried. -->


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

- [x] **Task 1 — Make the three outcomes distinguishable** (AC: #1)
  - [x] `services/auth.service.ts:171-193` is the swallow. ⚠️ **Preserve the existing re-throw** — an
        `AppError` with code `VALIDATION_ERROR` is re-thrown at `:188-190` and already fails loudly. A
        catch-all rewrite turns a currently-loud failure quiet.
  - [x] ⚠️ `:171` is `if (!backOffice && …)` — back-office activations never enter the block. They are
        **skipped**, not **failed**, and must not be counted as failures (both prod super_admins).
  - [x] Persist saved · skipped · attempted-and-failed distinctly. Today all three are NULL columns.
  - [x] Completion screen states the photo did not save and offers retry; activation still completes.
- [x] **Task 2 — A way back without an admin** (AC: #2)
  - [x] ⛔ **PREMISE CORRECTED — done, but NOT this way, and the correction is cheaper.**
        `me.service.ts` is the **respondent** registration-status read-model (over `respondents` /
        `wizard_drafts`); `RESPONDENT_SELF_UPDATED` is respondent-scoped. Magic links exist there
        because **citizens have no password**. Staff who completed activation have one. The "do not
        build a second path" answer therefore already existed and is *authenticated*:
        `POST /users/selfie` + the `/profile-completion` page, both live since Story 1-5 — merely
        unreachable unless you knew the URL. Building a staff magic-link flow would have **been**
        the second path, not the avoidance of one. Met with **no new endpoint and no token flow**.
  - [x] Dashboard prompt while the photo is missing.
- [x] **Task 3 — Operator visibility before the field day** (AC: #3)
  - [x] Staff list / ID-card view flags active field staff with no photo. `user.controller.ts:89`
        already refuses to generate a photoless card — surface that state *before* someone prints.
  - [x] Count `activation.selfie_failed` (currently WARN, read by nothing) in the digest; silent at zero.
  - [x] 🔗 Same operator screen as 13-59's "who has not downloaded" — build one surface, not two.
        **Surface built here: the Staff Management table's new `ID photo` column + the
        `?missingPhoto=true` filter.** 13-59 is gate 3 of 3 and not yet written, so this is the
        surface it must EXTEND rather than duplicate. ⚠️ **Note for 13-59:** add a column to
        `StaffTable.tsx` and a flag to `ListUsersParams`; do not add a second operator page.
- [x] **Task 4 — RED-verify the branch nobody watched** (AC: #4)
  - [x] Force `processLiveSelfie` to throw; assert activation completes **AND** the user is told **AND**
        the attempt records as *failed*, not *skipped*. ⚠️ Assert **distinguishability** — "activation
        succeeded" passes today, over the hole.
- [x] **Task 5 — The no-face dead-end and the CDN dependency** (AC: #5.4, #5.5)
  - [x] `LiveSelfieCapture.tsx:160` — `canCapture = !isModelLoading && (modelFailed || faceCount === 1)`
        is **unchanged by `27e1fdc`**. With the model healthy and `faceCount === 0` there is still no
        override. Give a recorded way through (Task 6), not a silent skip.
  - [x] `:30` still sets `modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/'` —
        the model is fetched from a third-party CDN at activation time. Self-host it or state the
        dependency explicitly; a launch path should not require `jsdelivr.net`.
        **CHOSE: state it** (the AC permits either). Self-hosting means vendoring ~10MB of model
        weights — `@vladmandic/human` ships models in a separate repo, not in the package — which is
        not a field-day-gate-sized change. What actually hurt the field officer was not the CDN but
        the SILENCE around it: `modelFailed` said only *"Face detection unavailable"* and left them
        guessing whether their photo would count. The banner now names the likely cause (poor
        connection), says capture still works, and tells them what to do; and the upload fallback
        (Task 6) means a slow connection is no longer a dead end. **Residual, deliberately left
        open:** the activation path still depends on `jsdelivr.net` being reachable for face
        detection. Reopen if field reports show model-load failures are common rather than rare.
- [x] **Task 6 — Passport upload as a recorded fallback** (AC: #6) — ✅ **RULED YES 2026-08-12**
  - [x] Live capture stays default; upload is the explicit fallback.
  - [x] ⚠️ **AN UPLOADED PHOTO HITS A BLUR FLOOR NOBODY HAS MENTIONED — decide this before building.**
        `photo-processing.service.ts:109-111` computes `sharpness = stats.channels[0].stdev` and
        **throws `AppError('VALIDATION_ERROR', 'Image is too blurry. Please retake.')` below 20** —
        *"threshold determined empirically"*. A phone photo **of a printed passport picture** is
        precisely the image that fails a blur threshold. **So the fallback built to rescue people who
        cannot complete a selfie can reject them for a different reason, with the same outcome:**
        no photo, no ID card. Route around the check for uploads, tune it separately, or accept it —
        but choose deliberately and say which, because silently inheriting it makes AC6 fail for the
        exact users it exists to serve.
  - [x] 🔗 **This is also the re-throw in Task 1.** That `VALIDATION_ERROR` is the one exception
        `auth.service.ts:188-190` re-throws — so the blur check is currently **the only path on which
        a failed photo tells the person anything at all.** Task 1 must not flatten it.
  - [x] ⛔ **NON-NEGOTIABLE: a discriminator.** Never write an uploaded file into a `live_selfie_*`
        column unlabelled — that recreates the exact defect this story names, self-inflicted.
  - [x] Operator sees which path produced each photo (same surface as Task 3).
  - [x] **Rename/re-comment `liveness_score` in the same pass** — ruled IN, deferring was declined.
        `services/photo-processing.service.ts:106-110` computes `sharpness = stats.channels[0].stdev`
        and `:133-134` comments *"In production, livenessScore comes from Rekognition"*. **Rekognition
        is not wired**; nothing gates on the value; `user.controller.ts:47` auto-sets
        `liveSelfieVerifiedAt` (*"Auto-verify for now"*). The column name asserts a property the value
        does not have.

### Review Follow-ups (AI) — adversarial code review 2026-08-13

⛔ **All nine were FIXED IN THE SAME PASS** (Awwal's ruling: record them *and* fix
them). Left ticked and in place rather than deleted, because the finding is the
useful artefact — three of these are repeats of named patterns in this repo and
the next story should be able to read what they looked like here.

- [x] **[AI-Review][HIGH] The `?missingPhoto=true` filter reached nothing.**
      Implemented server-side (`staff.service.ts:167`), parsed
      (`staff.controller.ts:52`), sent (`staff.api.ts:30`), typed
      (`staff/types.ts:74`) — and **set by no caller**.
      `StaffManagementPage.tsx:68` built `queryParams` from page/status/role/
      search only, and the page had no control for it. Task 3 claims the filter
      as delivered surface; on a 20-row page the `ID photo` column alone means
      reading every row of every page. [[pattern-ship-a-fix-that-never-fires]].
      **FIXED:** a `No ID photo` toggle in the filter row (`aria-pressed`,
      resets to page 1), wired into `queryParams`. Test asserts the QUERY PARAMS,
      not the button's appearance — RED-verified.
- [x] **[AI-Review][HIGH] The failure notice pointed at a screen that does not exist.**
      `ActivationPage.tsx:283` said *"add your photo from Profile › Photo"*.
      `ProfilePage.tsx:67` renders an avatar and has no upload affordance; the
      only working route is `/profile-completion`, reachable solely via the new
      banner. The one instruction the rescue screen gives was unfollowable —
      [[pattern-a-record-about-the-work-is-not-the-work]] pointed at a UI.
      **FIXED:** the copy now names the dashboard prompt, and the test asserts
      the old string is *absent* — RED-verified.
- [x] **[AI-Review][MED] Raw exception text was persisted and handed out.**
      `auth.service.ts` stored `err.message` in `photo_failure_reason`, which
      travels to the activation response, `GET /users/profile` and the operator's
      staff list. The errors on that branch are infrastructure ones — S3
      `AccessDenied` naming the bucket, DNS failures naming the storage host.
      **FIXED:** a single sanitised sentence (`PHOTO_FAILURE_REASON_SYSTEM`);
      diagnostics stay in the `activation.selfie_failed` warn beside the userId.
      The AC4 test now asserts the raw text does **not** appear on either surface.
- [x] **[AI-Review][MED] The banner kept accusing someone who had already fixed it.**
      `MissingPhotoBanner` reads `['users','profile']` with a 5-minute
      `staleTime`, and `ProfileCompletionPage` uploaded via raw `fetch` and never
      invalidated it — so the person returned to the dashboard and was told "your
      photo did not save" about the photo they had just saved, by the banner that
      sent them there. **FIXED:** invalidate `profileKeys.profile` on success
      only. New `ProfileCompletionPage.test.tsx` — RED-verified.
- [x] **[AI-Review][MED] `FIELD_ROLES` was hand-copied into the web banner.**
      `MissingPhotoBanner.tsx:46` held a string literal while
      `getFieldStaffPhotoHealth` counts from the canonical `FIELD_ROLES`
      (`packages/types/src/roles.ts:27`). The comment asserted the two scopes
      match; nothing enforced it, and a fourth field role would have been counted
      by the digest while their own dashboard stayed quiet.
      **FIXED:** imported. [[feedback_canonical_primitive_backlog_sweep]].
- [x] **[AI-Review][MED] Client-asserted provenance was displayed as fact.**
      `photo_source` is whatever the browser sent; the server cannot tell a
      webcam frame from a file. `StaffTable` printed a bare "Live photo".
      Stating an unverified claim in a column that looks authoritative is the
      shape of the defect AC6.4 fixes one column over.
      **FIXED:** labelled `(reported)` with an explanatory tooltip, and
      `PHOTO_SOURCE`'s docblock now says REPORTED, NOT VERIFIED, and that nothing
      may gate on it.
- [x] **[AI-Review][LOW] `SkeletonTable columns={6}`** against 7 `<th>` after the
      new column. **FIXED:** 7, with a note to keep them in step.
- [x] **[AI-Review][LOW] `StaffPhotoCell` was declared between two import
      statements** (`StaffTable.tsx:24-54`). **FIXED:** moved below the imports.
- [x] **[AI-Review][LOW] `photo_source` on FAILED rows contradicted its own
      docblocks** ("NULL when there is no photo" in `staff.service.ts` and
      `staff/types.ts`). The write is right — "they tried to upload and we lost
      it" is worth more than "no photo" — so **the three docblocks were corrected
      to reality**, not the behaviour.

**Verified independently during the review** (not read off the Dev Agent Record):
`tsc --noEmit` clean in both apps; targeted web suites green; the deploy step
runs under `set -eo pipefail`, so a failing pre-push runner aborts *before*
`db:push` (the data-loss guard actually holds); `img-src data:` is already
present in `app.ts` and all four nginx mirrors, so the new `downscaleImage`
data-URL decode does not repeat the `27e1fdc` prod-only CSP class. **NOT run:**
the API suite (needs the test DB) — `auth.activation.test.ts` and
`user.selfie.test.ts` changes are typecheck-verified only.

## Dev Agent Record

### Implementation Plan / decisions taken

**AC6 blur floor — DECIDED: tune it separately.** The story required one of
"route around / tune separately / accept", chosen deliberately and named.
`photo-processing.service.ts` now takes a `source` and applies
`UPLOAD_SHARPNESS_MIN = 8` for uploads against `LIVE_SHARPNESS_MIN = 20` for
live captures. Inheriting 20 would have failed the exact people the fallback
exists for (a phone photo of a printed passport picture is what a blur floor
rejects) with the same outcome as the bug — no photo, no ID card. Removing the
floor would print an unusable card. ⚠️ **8 is reasoned, not measured** — no
corpus of real uploads exists to tune against, and writing "determined
empirically" about an unmeasured number is how the column next door ended up
called `liveness_score`. Reopen trigger recorded in the constant's docblock.

**AC6.4 rename — the data-loss trap, and how it is closed.** `db-push.ts
--force` answers a rename prompt with "create column" (its own docblock, lines
5-8) and then auto-confirms the data-loss prompt, so pushing the renamed schema
would have created an empty `photo_sharpness_score` and **DROPPED** the
populated `liveness_score` — on prod that is live data (0.5913, 0.8589). Closed
by `scripts/migrate-photo-provenance-init.ts`, which does the
`ALTER TABLE ... RENAME COLUMN` itself and **runs BEFORE `db:push`**, leaving
push no diff to ask about. Wired into `ci-cd.yml` above the push step and into
`db-push-full.ts` via a new `PRE_PUSH_RUNNERS` list (it was auto-discovered into
the *after* group, which was the dangerous order). **Verified against `app_test`
with a planted canary: `0.8589` survived the rename and the subsequent push.**

**AC2 — the premise was wrong, and the correction makes it cheaper.** The story
said to reuse 9-12's magic-link self-update (`me.service.ts`,
`RESPONDENT_SELF_UPDATED`). That path is **respondent-only**: `me.service.ts` is
the public-user registration-status read-model over `respondents`/`wizard_drafts`,
and magic links exist there because citizens have **no password**. Staff who
finished activation have one. The existing authenticated staff path —
`POST /users/selfie` + `/profile-completion` — already was the "no second path"
answer; it was simply unreachable unless you knew the URL. AC2 is therefore met
by a dashboard prompt pointing at it, with **no new endpoint and no token flow**.
Building the magic link would have *been* the second path, not the avoidance of one.

### Defects found while implementing (all fixed in-pass)

1. **`ActivationResponse` described a `user` wrapper the API has never sent.**
   The controller responds `{ data: {...} }` and `authFetch` returns `data.data`.
   Never noticed because nothing read the activation result — `onSuccess`
   discarded it. Corrected, since the completion screen now depends on it.
2. **`LiveSelfieCapture`'s failure alert was invisible.** The alert added by
   `27e1fdc` specifically to make a silent failure visible used
   `text-error-700 bg-error-50 border-error-200` — **none of those three tokens
   exist** (the theme defines only `-100`/`-600`, `index.css @theme`). It
   rendered unstyled. Same class as the defect it was added to fix.
3. **The back-office invariant was incidental, not asserted.** The photo columns
   were first written inside the `if (!backOffice)` profile-fields block, so a
   test asserting "back-office stays NULL" stayed green under a mutation that
   set every activation to `skipped`. Found by RED-verifying the test and
   watching it *not* fail. The write moved outside the block so the invariant is
   carried by the variable the test actually checks.
4. **Multer field ordering.** `source` is appended to `FormData` **before** the
   file: multer's docs warn `req.body` may be unpopulated depending on transmit
   order, and a text field after a multi-megabyte file is the case that bites.
   The failure would have been silent and permissive — `source` undefined →
   falls back to `live_capture` → an upload recorded as a live capture, the one
   outcome AC6.2 forbids.

### RED-verify log (AC4.2 — every assertion proven to bite)

| Mutation applied | Result |
|---|---|
| Remove the three `updateData.photo*` writes | 3 tests RED (`failed`/`skipped`/`saved` all → null) |
| Remove the `VALIDATION_ERROR` re-throw | 1 test RED (loud 400 → silent 200) |
| Default `photoStatus` to `SKIPPED` | back-office test RED (`'skipped'` ≠ null) |
| `onCapture(prepared, 'live_capture')` in the upload path | AC6.2 client test RED |
| Remove the `photo.status === 'failed'` redirect guard | no-auto-redirect test RED |

Also RED-verified structurally: the migration runner was exercised against a
real DB with a planted value rather than assumed idempotent — run twice, and the
canary re-read after `db:push:full:force`.

### Deployment note (A9 — env/ordering coordination)

No new env vars. **But the deploy ORDER is load-bearing**: on any database that
predates this story, `scripts/migrate-photo-provenance-init.ts` MUST run before
`db:push`, or the push drops `liveness_score`. This is wired for CI and for
`db:push:full`; a developer running bare `pnpm db:push` on an old local DB must
run the runner first (stated in the script's docblock).

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

## File List

**New**
- `packages/types/src/staff-photo.ts` — `PHOTO_STATUS` / `PHOTO_SOURCE` / `PhotoOutcome` / `FieldStaffPhotoHealth`
- `apps/api/scripts/migrate-photo-provenance-init.ts` — ⛔ **pre-push** runner (rename + 3 columns + backfill)
- `apps/web/src/features/dashboard/components/MissingPhotoBanner.tsx`
- `apps/web/src/features/dashboard/components/__tests__/MissingPhotoBanner.test.tsx`
- `apps/web/src/features/auth/pages/__tests__/ActivationPage.photo-outcome.test.tsx`

**Modified — API**
- `apps/api/src/db/schema/users.ts` — `liveness_score`→`photo_sharpness_score`; +`photo_status`/`photo_source`/`photo_failure_reason`
- `apps/api/src/services/auth.service.ts` — outcome recorded; re-throw preserved; outcome returned
- `apps/api/src/services/photo-processing.service.ts` — `source` option, `UPLOAD_SHARPNESS_MIN`, score renamed
- `apps/api/src/services/staff.service.ts` — `missingPhoto` filter + per-row photo state
- `apps/api/src/services/user.service.ts` — profile exposes ID-card photo + status
- `apps/api/src/services/operations.service.ts` — `getFieldStaffPhotoHealth()`
- `apps/api/src/workers/ops-digest.worker.ts` — `formatFieldStaffPhotoLines()`, silent at zero
- `apps/api/src/controllers/auth.controller.ts`, `user.controller.ts`, `staff.controller.ts`
- `apps/api/scripts/db-push-full.ts` — `PRE_PUSH_RUNNERS`
- `.github/workflows/ci-cd.yml` — runner wired **above** `db:push`

**Modified — Web**
- `apps/web/src/features/staff/pages/StaffManagementPage.tsx` — **review H1**: the `No ID photo` filter control that reaches `missingPhoto`
- `apps/web/src/features/onboarding/components/LiveSelfieCapture.tsx` — upload fallback, `source` arg, CDN guidance, alert palette fix
- `apps/web/src/features/onboarding/pages/ProfileCompletionPage.tsx` — sends `source` (before the file)
- `apps/web/src/features/auth/pages/ActivationPage.tsx` — photo outcome on the completion screen; no auto-redirect on failure
- `apps/web/src/features/auth/api/auth.api.ts` — `ActivationResponse` corrected + `photo`
- `apps/web/src/features/auth/components/activation-wizard/steps/SelfieStep.tsx`, `useActivationWizard.ts`
- `apps/web/src/features/staff/components/StaffTable.tsx`, `types.ts`, `api/staff.api.ts`
- `apps/web/src/features/dashboard/api/profile.api.ts`
- `apps/web/src/layouts/DashboardLayout.tsx`
- `apps/web/src/__tests__/known-routes.ts` — registers `/profile-completion`

**Modified — shared / tests**
- `packages/types/src/index.ts`, `ops-thresholds.ts`, `validation/profile.ts`
- `apps/api/src/__tests__/auth.activation.test.ts`, `user.selfie.test.ts`
- `apps/api/src/services/__tests__/staff-list-excludes-citizens.integration.test.ts`
- `apps/api/src/controllers/__tests__/staff.controller.test.ts`
- `apps/api/src/workers/__tests__/ops-digest.worker.test.ts`
- `apps/web/src/features/onboarding/components/__tests__/LiveSelfieCapture.test.tsx`
- `apps/web/src/features/onboarding/pages/__tests__/ProfileCompletionPage.test.tsx` — review M2 + AC6.2 field ordering, **added beside** the existing F-004 in-memory-token lock (9-42), which stays
- `apps/web/src/features/staff/pages/__tests__/StaffManagementPage.test.tsx` — review H1 (params captured, not discarded)
- `apps/web/src/features/auth/pages/__tests__/ActivationPage.photo-outcome.test.tsx` — review H2

## Residuals

| ID | Item | State | Evidence / trigger | Owner |
|---|---|---|---|---|
| **R1** | The `liveness_score` → `photo_sharpness_score` rename must run **before** `db:push`, or `--force` answers the rename prompt as drop+create and the populated column is lost. | ✅ **CLOSED — proven locally, not deferred to prod.** | **Re-runnable:** rebuild `app_test` to the pre-migration state (rename back, drop the 3 columns), seed `liveness_score`, run `NODE_ENV=test DATABASE_URL=…app_test pnpm exec tsx scripts/db-push-full.ts --force`. Observed 2026-08-13: runner at log line **2**, `RENAMED … (values preserved)` at line **9**, `db:push` at line **14**; seeded `0.7777` survived; 43 rows kept their scores. Deploy path confirmed at `ci-cd.yml:1099` (runner) above `:1102` (`db:push`). | adjudication |
| **R2** | A **failed** ordering used to be the **silent** branch — `hasNew`-only printed *"nothing to rename"* and exited **0**, while the loud `hasOld && hasNew` branch covers a state `--force` cannot produce. | ✅ **CLOSED — fixed in this pass.** | `migrate-photo-provenance-init.ts` now throws when `photo_sharpness_score` is entirely NULL **while users hold an ID-card photo** (they completed a live capture, so a score must once have existed). **RED-verified both ways:** simulated drop+create → `RUNNER_EXIT=1` with the actionable message; healthy state → `RUNNER_EXIT=0`. | adjudication |
| **R5** | 🔴 **The runner crashed on every FRESH database** — `relation "users" does not exist`. Step 2's `ALTER TABLE users ADD COLUMN IF NOT EXISTS` guards the **column**, never the **table**, and this runner is deliberately ordered *before* `db:push`, so on a clean environment the table does not exist yet. | ✅ **CLOSED — found by CI, fixed 2026-08-13.** | **Caught by CI run `31737577114`**: `test-api` red, **`deploy` skipped**. Every local gate had passed — because `app_test` always had a `users` table, so **the fresh-database branch had never once been executed** ([[pattern-verification-that-cannot-run-yet]] inverted: it *could* run, nothing had run it). Fixed with a `tableExists('users')` guard that returns early. **RED-verified against CI's exact condition:** created an empty DB (0 tables), ran the runner → **exit 0**; then the full `db-push-full --force` pipeline → **exit 0**, with `db:push` creating all four columns from the schema. | adjudication |
| **R3** | Prod confirmation of R1 after deploy. | ✅ **DISCHARGED 2026-08-14 on prod `6876b9f`.** | Queried read-only after the deploy: **`liveness_score` no longer exists (0)**, all **4** `photo_*` columns present, **3 rows carry a sharpness score**, **3** users hold an ID card, **3** backfilled `photo_status='saved'`. ⭐ **`scored == carded` is the whole proof** — had `db:push` run first and answered the prompt as drop+create, `scored` would be **0** against 3 carded, and R2's guard would have failed the deploy. Stronger than the log line the story originally asked for: this is the outcome, not the intention. **Reopen:** any future deploy where `photo_sharpness_score` is empty while users hold ID-card photos. | adjudication |
| **R4** | `route-resolution.integration.test.tsx > resolves '/login'` fails intermittently under load (`expected 16 to be greater than 50`). | **ACCEPTED — NOT this story's.** | Measurement: `/login` is untouched by 13-60 and `/profile-completion` (the route this story adds) passes every run; isolated it passes 57/57, and it flaked identically on 2026-08-11 **before** this work. Mechanism: a raw content-length threshold firing before a lazy chunk resolves — fails at >5s, passes at ~3s. **Trigger:** it has now cost two sessions; next occurrence, replace the threshold with a `findBy*` on a specific element. | web/test-arch |

## Closing verdict

**CLOSED — `done`. Deployed SHA `6876b9f`, verified on production 2026-08-14.**

The hold worked as designed: this story sat at `review` through **one red CI run and one failed deploy**
before anything was allowed to claim completion. Had it been flipped to `done` when dev handed it over,
the board would have advertised a story CI had never once let through.

| Deploy gate | Evidence |
|---|---|
| CI | `CI/CD Pipeline` **31745170166** success · `E2E Tests` **31745170109** success |
| **`deploy` TAKEN, not skipped** | all **10** jobs green — the previous run (`31737577114`) is the counter-example: `test-api` red → **`deploy` skipped**, which is why reading the job list matters and the badge does not |
| Prod | VPS `git rev-parse --short HEAD` = **`6876b9f`**, health **200** |
| **Data (R3)** | `liveness_score` **gone**; 4 `photo_*` columns; **3 scored == 3 carded**; 3 backfilled `saved` |
| Fresh-DB path (R5) | CI `test-api` log: *"✓ Fresh database — `users` does not exist yet…"* then the job passed — the branch that crashed the previous run now executes and continues |

| Gate | Evidence (re-runnable, run by adjudication — not the dev's self-report) |
|---|---|
| `tsc` | API **0**, web **0** |
| `eslint src scripts` | **0** |
| Drift guards, run **direct** (uncached — Pitfall #47) | registry-read **372 files clean** · respondent-write **372 clean** · story-residual **317 clean** |
| API suites (5 touched files) | **111 passed** |
| Web suites (6 files, isolated) | **92 passed** — the single combined-run failure is R4, not this story |
| **RED-verify #1 (error leak)** | neutered `PHOTO_FAILURE_REASON_SYSTEM` → `AssertionError: expected 'S3 upload failed: connection refused' not to contain 'S3 upload failed'`; reverted → **35/35 green** |
| **RED-verify #2 (lost rename)** | new guard: simulated failure → **exit 1**; healthy → **exit 0** |
| File List vs `git status` | **matches** — ⚠️ but it uses comma-continued shorthand (`auth.controller.ts, user.controller.ts, staff.controller.ts`), so a script extracting full paths **silently misses 8 files**. Commit by explicit path. |

**Two flags from the PM cleared by inspection, not assurance:** `LiveSelfieCapture.test.tsx` has **0 deleted lines** (6→9 tests, the fetch regression guard intact at `:133` — extended, not replaced); the story file's only true deletion is the `Status:` line, all 21 others being `- [ ]`→`- [x]`, with the blur-floor note surviving at `:319`.

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-09 | Raised EMERGENT from the enumerator invite dry run | Awwal |
| 2026-08-10 | Title corrected (card does not ship at all); raised to field-day gate; AC5 + AC6 added | John (PM) |
| 2026-08-10 | `27e1fdc` ships the real capture fix (CSP `connect-src data:`) | — |
| 2026-08-12 | Correction #4 — AC5.1–5.3 closed, AC5.3's "CSP ruled out" struck as false; prod re-verified; flipped to `ready-for-dev` | Bob (SM) |
| 2026-08-12 | AC6 confirmed **build it**, incl. the `liveness_score` rename (deferral declined) | Awwal, flagged by John (PM) |
| 2026-08-12 | Tasks/Subtasks + Dev Notes added | Bob (SM) |
| 2026-08-13 | **Adversarial code review: 2 HIGH, 4 MED, 3 LOW — all fixed in-pass.** The two HIGHs were both "built but unreachable": the `missingPhoto` filter had no UI control, and the failure notice pointed at a `Profile › Photo` screen that does not exist. 3 mutations RED-verified. Raw S3/DNS error text no longer leaves the API. | Claude (code-review) |
| 2026-08-12 | **All 6 tasks implemented.** Outcome recorded + returned; upload fallback; operator surface + digest line; `liveness_score` renamed behind a pre-push runner. 5 mutations RED-verified. 4 defects found in-pass (see Dev Agent Record). AC2 premise corrected — met with no new endpoint. | Amelia (dev-story) |
