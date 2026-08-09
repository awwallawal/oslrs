# Story 13.60: A failed selfie is swallowed, and the ID card ships without a photo

Status: backlog

<!-- EMERGENT 2026-08-09 from the enumerator invite dry run. The camera's ASPECT bug was fixed the
same day (22b00eb); this is the SECOND, independent route to the same empty photo and was left
deliberately unfixed so the hotfix stayed two files. -->

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

## Out of scope

- Photo quality/liveness thresholds — `livenessScore` exists and tuning it is separate.
- Public respondents. No photos on the marketplace, by design (13-38 locked decision).

## Notes

- Pairs with **13-59**: one tells the person their account is live, this tells them their photo is not.
- Rooted in the same finding as 13-57: **a caught exception that changes what the citizen or officer
  ends up with must never be silent.**
