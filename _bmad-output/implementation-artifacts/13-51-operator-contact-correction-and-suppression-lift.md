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

### AC1 — Surface the people we have gone silent on
1. A Super-Admin view listing suppressed addresses joined to respondents: reference code, name,
   phone, registration status, and **whether they are mid-ladder** (a suppressed
   `pending_nin_capture` person is the urgent case — the system is actively pretending to contact
   them).
2. Flag **malformed-looking** addresses distinctly from plausibly-dead ones. `asirusakirat@gmail.come`,
   `fatomidejumoke@mail.com` and a display-name string used as an address are OUR data problem;
   a well-formed address at a real domain that bounces is the recipient's. They need opposite
   responses and the list should not blur them.
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
