# Story 13.51: An operator must be able to correct a bounced contact address — traceably

Status: backlog

## Story

As the **operator**,
I want **a supported way to fix a mistyped contact address and lift the bounce suppression it caused**,
so that **a citizen is not silently dropped from the register's follow-up because of one wrong character —
and so that the correction leaves a record.**

## Context — this is not hypothetical, it happened on 2026-08-06

`asirusakirat@gmail.come` bounced, was auto-suppressed, and its owner became permanently
unreachable by email. She is **`OSL-2026-DQNPTQ`, Sakirat Asiru, `pending_nin_capture`, with a
working phone number**. The pending-NIN ladder kept sending reminders into a void and would, in
about a week, have retired her to `nin_unavailable` **exactly as though she had declined to
provide her NIN.** She had not. A `.com` was typed `.come`.

**The fix was one character. Performing it safely was not.** There is no admin UI for it, so it was
done as raw SQL against prod — and the most defensible change of the day became the least
traceable one. That asymmetry is the story.

Two further facts sharpen it:
- **A bounce costs a contact channel permanently and silently.** `email_suppressions` is written by
  the webhook handler; nothing surfaces "we have gone quiet on this person" to any operator.
  13-42 AC8 adds a digest line; this story adds the ability to *act* on it.
- **Suppression keys on the raw address.** Correcting the record does not lift the suppression, and
  suppressing a malformed string does not block the real one — it both over- and under-blocks.

## What already exists (do not rebuild)

✅ **`apps/api/scripts/correct-respondent-contact-email.ts`** — written 2026-08-06. Dry-run by
default, transactional, idempotent, and **audited via `logActionTx`** (never the void `logAction`,
which cannot be awaited from a script and loses the last row of every batch — 13-49 R11). It:
- rewrites `submissions.raw_data->>'email'` and the matching `wizard_drafts.email`;
- deletes the suppression on the OLD address, and any stale one on the new;
- **refuses** if the target address already belongs to a different live respondent;
- **leaves `campaign_sends` untouched** — that ledger records what was actually sent where, and the
  bounced message really did go to the typo. Correcting a contact record is right; rewriting send
  history would be falsifying it;
- writes `operator.respondent_email_corrected` with `retrospective: true` when the data was already
  changed by hand, which is how the 2026-08-06 manual edit was brought back onto the ledger.

So the CLI path is done. **What is missing is everything around it.**

## Acceptance Criteria

> # ⛔ SEQUENCING — READ BEFORE WRITING ANY CODE
> *Added 2026-08-11 by the adjudication agent. Evidence + full working: SCP §10.11 (with §10.10).*
>
> **AC3.3 (normalise before suppressing) MUST NOT SHIP WITHOUT A HARD/SOFT BOUNCE DISTINCTION.
> Landing it alone makes things measurably worse.**
>
> Two defects are currently cancelling each other out on production:
>
> | defect | effect on `aqeemakolade@gmail.com` — **a registered person** |
> |---|---|
> | This system records **no** hard/soft bounce severity (`suppressionReasons = ['bounced','complained','unsubscribed']`, `email-events.service.ts:97` suppresses on **any** bounce) and **nothing in production code ever removes a suppression** — the only `delete(emailSuppressions)` calls in the repo are in tests | a **soft** bounce excludes them from every future blast, permanently and silently |
> | The webhook inlet stores the provider's raw recipient (`email-events.service.ts:48` → `:100`) while the reader `getSuppressedEmails` looks up `toCanonicalEmail(...)`, which is only `trim().toLowerCase()` and does **not** unwrap `Name <addr>` | the stored key `'wahab akeem olaide <aqeemakolade@gmail.com>'` **can never match** the lookup `'aqeemakolade@gmail.com'` — so they are **not** actually excluded |
>
> **They are reachable today ONLY because the second bug is masking the first.** Verified on prod
> 2026-08-11: `SELECT count(*) FROM email_suppressions WHERE email='aqeemakolade@gmail.com'` → **0**,
> while the wrapped row sits beside it. And their bounce is **soft** — it is one of only two messages
> in the entire `email_events` table that went `delivered` **then** `bounced`.
>
> **➜ Ship severity first, or in the same commit. Unwrap second. If only one can ship, ship NEITHER —
> the current broken state is strictly safer than half the fix.** Fixing the unwrap alone converts an
> inert row into a working permanent exclusion of a registered citizen on the strength of one soft
> bounce: the inverse of [[pattern-ship-a-fix-that-never-fires]] — a fix that fires, correctly, and
> should not have.
>
> **RED-verify both halves:** store `'A B <x@y.com>'` and assert `getSuppressedEmails(['x@y.com'])`
> returns it (fails without the unwrap); and assert a soft bounce does **not** produce a permanent
> suppression (fails without the severity work).

### AC1 — Surface the people we have gone silent on
1. A Super-Admin view listing suppressed addresses joined to respondents: reference code, name,
   phone, registration status, and **whether they are mid-ladder** (a suppressed
   `pending_nin_capture` person is the urgent case — the system is actively pretending to contact
   them).
2. Flag **malformed-looking** addresses distinctly from plausibly-dead ones. `asirusakirat@gmail.come`
   and `fatomidejumoke@mail.com` are OUR data problem; a well-formed address at a real domain that
   bounces is the recipient's. They need opposite responses and the list should not blur them.
   ⛔ **CORRECTION 2026-08-11 — a display-name string is a THIRD category, not "our data problem".**
   This AC originally grouped `'wahab akeem olaide <aqeemakolade@gmail.com>'` with the typos. It does
   not belong there: **nobody typed it and it never passed through a capture form.** Proven — across
   `users` ∪ `wizard_drafts` ∪ `magic_link_tokens` ∪ `campaign_sends`, **zero** values contain an
   angle bracket, a space or an uppercase character, and `campaign_sends` holds the clean address.
   It arrives in **the provider's bounce payload**: the same `message_id` carries
   `aqeemakolade@gmail.com` on `sent` and `delivered`, and the wrapped form on `bounced`
   (2 of 25 bounces, 8%; 0 of 1,949 sent/delivered). **So the list needs three buckets — our typo,
   their dead mailbox, and a provider-format artefact that is neither** — and the third is fixed at
   the inlet (AC3.3), never by asking an operator to retype it. SCP §10.11.
3. Show the phone number, because for anyone unreachable by email that is the actual next step.

### AC2 — Correct + lift, from the UI, audited
1. An operator can edit the address and lift the suppression in one action, wrapping the same
   service logic the script uses. **Do not duplicate the logic** — extract it to a service both
   call, or this diverges the way skip-logic did (13-4 AC4.6).
2. Every correction writes `operator.respondent_email_corrected` with the actor's id. The script
   passes `actorId: null` because a CLI has no user; **the UI must not.**
3. ⚠️ **Never silently reassign an address that belongs to someone else.** The script refuses; the
   UI must refuse too, and say whose it is.
4. A corrected respondent re-enters the ladder automatically — no separate "re-enrol" step. Verified
   for `OSL-2026-DQNPTQ` on 2026-08-06.

### AC3 — Stop manufacturing the problem
1. **Validate the address at capture** on the enumerator and clerk surfaces the way the public
   wizard's Step 2 does. `.come` is catchable at the point of entry, by the person who can still
   ask "is that right?" — which is infinitely cheaper than catching it after a bounce.
2. Consider a typo-suggestion on common domains (`gmail.come` → `gmail.com`, `mail.com` → `gmail.com`)
   — a confirm prompt, never a silent rewrite. **Never auto-correct a citizen's contact details
   without showing them.**
3. Normalise before suppressing, so the suppression key matches the address the register holds.

## Out of scope

- Bulk correction. Six suppressions matter today and each deserves a human look; a bulk tool would
  invite exactly the unreviewed sweep this story exists to prevent.
- SMS fallback — that is 9-27 Parts B–F, blocked on Termii.

## Notes

- The audit-action key `OPERATOR_RESPONDENT_EMAIL_CORRECTED` is deliberately distinct from
  `RESPONDENT_SELF_UPDATED`: **the respondent did not ask for this and cannot be reached to confirm
  it.** That is precisely why it must be traceable.
- Sibling of [[pattern-monitor-measuring-something-else]]: a suppression list is a monitor that
  changes system behaviour and reports to nobody.
