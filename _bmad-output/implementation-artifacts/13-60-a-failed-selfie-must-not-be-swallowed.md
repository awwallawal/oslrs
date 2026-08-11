# Story 13.60: No selfie, no ID card — the enumerator walks in with nothing

Status: backlog

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

## ⚠️ Test A (prod, 2026-08-10) — read this before the Context

Two of two recent field-path attempts produced **no selfie and no card**; the April 2026 enumerator
account has **both**, with a stored score of 0.8589. **Suspected regression, not an unbuilt feature.**
Full evidence, the ruled-out hypotheses and the query in **SCP §9.1**.

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

1. `LiveSelfieCapture.tsx:109` — `canCapture = !isModelLoading && (modelFailed || faceCount === 1)`.
   With the model loaded and `faceCount === 0` the button is **disabled** and the red *"No face
   detected"* badge shows. Awwal hit exactly this and **had to skip the step to finish activation.**
2. ⛔ **MEASURE BEFORE FIXING.** The leading hypothesis is that `22b00eb`'s **portrait** constraint
   (`aspectRatio: 3/4`, ideal `960×1280`, `:144-149`) is a **phone** shape and Test A ran on **desktop
   Firefox**, where laptop webcams are natively landscape. **That is a hypothesis, not a
   measurement** — SCP §9.2 names the two numbers that settle it (`video.videoWidth/videoHeight`, and
   the same page on a phone). Do not fix on the hypothesis; this story has already been corrected once
   for exactly that mistake.
3. **Already ruled out, do not re-chase:** CSP is not the blocker (`app.ts:196` allows
   `cdn.jsdelivr.net`), and `modelFailed` was false, so the model loaded.
4. ⚠️ **Whatever the cause, the UX must not dead-end.** A face-detection check that cannot be
   satisfied and cannot be overridden is worse than no check: it converted a required step into a
   skipped one, which then triggered AC1's silent swallow. **Give the operator a way through that is
   recorded** — see AC6.
5. 📌 **The model is fetched from a third-party CDN at activation time** (`:29`, 15s timeout). A field
   officer on poor connectivity falls silently into `modelFailed`, where capture is allowed with no
   guidance at all. Self-host it or state the dependency; a launch path should not require
   `jsdelivr.net`.

### AC6 — Passport-photo upload as a recorded fallback (Awwal's question, 2026-08-10)

**PM recommendation: YES — pending Awwal's confirmation.** The usual objection is that live capture
is the anti-fraud control. **On this system that objection is already false:**

- `photo-processing.service.ts:133-135` — `livenessScore = Math.min(sharpness / 100, 0.99)`, with a
  comment saying it *"comes from Rekognition"* in production. **Rekognition is not wired. The column
  named `liveness_score` holds an image-SHARPNESS ratio.**
- **Nothing gates on it** — no threshold check exists in the API.
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
