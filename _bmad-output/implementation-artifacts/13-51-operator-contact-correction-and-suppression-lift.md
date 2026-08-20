# Story 13.51: An operator must be able to correct a bounced contact address — traceably

Status: review

<!-- ⛔ DO NOT REGENERATE THIS FILE WITH *create-story. It would author from epics.md and destroy
the 2026-08-11 adjudication corrections (the SEQUENCING block and the AC1.2 third-bucket ruling),
which cost real prod measurement to earn. Edit in place. -->

<!-- PREPPED FOR DEV 2026-08-16 by Bob (SM) at `e8e1944`. AC1/AC2/AC3 EXPANDED, NEVER RENUMBERED OR
REPLACED; the ⛔ SEQUENCING blockquote and the ⛔ CORRECTION inside AC1.2 are reproduced untouched.
Six premises re-measured against the tree rather than inherited from the SCP — and ALL SIX moved.
Read these before sizing:

  1. ⛔ **`z.string().email()` ACCEPTS EVERY ONE OF THE FIVE MEASURED TYPOS.** Run here on
     `registration.schema.ts:25`'s exact rule (zod 3.25.76): `gmail.come`, `gmail.con`, `gmail.co`,
     `mail.com` all ACCEPT; only the wrapped `Name <addr>` form REJECTS. **Format validation is
     structurally incapable of delivering AC3's stated goal** — the typo dictionary is the
     load-bearing half, not the "consider" half. See the callout under AC3.
  2. ⛔ **NEITHER TYPO DICTIONARY CONTAINS `gmail.come`** — the founding case of this entire story.
     Measured both: server 24 entries (`typo-dictionary.json`), client 28
     (`email-typo-dictionary.ts:14-43`). So the public wizard — the surface AC3.1 says to COPY —
     **would not have caught Sakirat Asiru.** Copying it faithfully ships a fix that never fires.
  3. ✅ **AC3.2 IS MOSTLY ALREADY BUILT, on the public wizard only.** `EmailTypoDetection.tsx`
     (post-blur, "Did you mean…?", one-tap accept, never a silent rewrite — exactly what AC3.2
     specifies) is wired at `Step2ContactLga.tsx:208-213`. AC3.2 is therefore REUSE + 2 dictionary
     entries, not a build. Scope DOWN.
  4. ⚠️ **AC3.1 IS BIGGER THAN IT READS, though — there is no staff email field to validate.**
     Enumerator/clerk respondent capture is questionnaire-driven: `formSchema.ts` `checkRule()`
     supports only minLength/maxLength/min/max/regex/modulus11 with **no email case**, and
     `QuestionRenderer.tsx:29-44` has **no email question type**. AC3.1 is a change to the DYNAMIC
     FORM RENDERER, not a copied regex. Sizing correction, not a blocker.
  5. ⚠️ **The correction path covers 1 of the 3 contact sources.**
     `correct-respondent-contact-email.ts:96-100` rewrites `submissions` + `wizard_drafts` only,
     while `respondent-contact.service.ts:22-27` resolves email from THREE sources and its own
     docblock records **45 respondents reachable ONLY via `magic_link_tokens`** (`:15-16`). For
     those people the correction writes nothing and the resolver keeps returning the typo. AC2.7.
  6. ⚠️ **The audit vocabulary has already drifted.** `_ops-contact-remediation.ts` writes the raw
     literals `'email.suppression_lifted'` / `'user.email_corrected'` and `targetResource: 'users'`,
     **none of which exist** in `AUDIT_ACTIONS` (`audit.service.ts:63-190`) or `AUDIT_TARGETS`
     (`:207-209`, whose only member is `RESPONDENT`). `logAction`/`logActionTx` type `action` as a
     bare `string` (`:373-381`, `:415-426`), which is why it compiled. AC2.6.

SM NOTE ON SEQUENCING, on the record: this story is a **BLAST/JINGLE gate** (handoff §
"BLAST / JINGLE" table — *"a 9.3% bounce rate is domain reputation spent on a capture defect"*), and
its own AC3.3 is gated INTERNALLY by the severity work. Task 5 is written so AC3.3 cannot be ticked
without it. If the severity half slips, **AC3.3 slips with it** — that is the ruling in the
blockquote below, not a preference. -->

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

4. **The bucket rule is a PURE, EXPORTED, TESTED FUNCTION — not a judgement rendered in JSX.**
   `classifySuppressedAddress(email): 'capture_typo' | 'provider_artefact' | 'plausibly_dead'`,
   living in `apps/api/src/lib/` beside `canonical-email.ts`. A rule that exists only inside a
   component cannot be RED-verified and cannot be reused by 13-42's digest line.
   - `provider_artefact` = the address is not in bare form (angle brackets, whitespace, uppercase).
     **Tested FIRST**, because a wrapped address is also a "malformed-looking" string and a rule
     ordered the other way silently reclassifies AC1.2's third bucket back into the first.
   - `capture_typo` = bare, but the domain hits the typo dictionary (AC3.2's shared source).
   - `plausibly_dead` = bare, domain unknown to the dictionary. **The default is "theirs", not
     "ours"** — guessing "ours" invites an operator to retype an address that was never wrong.
   - **RED-verify:** assert `'wahab akeem olaide <aqeemakolade@gmail.com>'` → `provider_artefact`
     and `'yusuffasiat@gmail.co'` → `capture_typo`. Delete the ordering in AC1.4 and the first
     assertion reds. ⚠️ Assert on the returned bucket, never on "the function ran".

5. ⚠️ **JOIN THROUGH ALL THREE CONTACT SOURCES, NOT `submissions` ALONE.**
   `respondent-contact.service.ts` is the canonical resolver and its docblock (`:22-27`) fixes the
   priority — `submissions.raw_data->>'email'`, then `magic_link_tokens.email`, then `users.email` —
   because **not every respondent has a submissions row**. Its own measurement (`:15-16`): **45
   respondents are reachable ONLY via `magic_link_tokens`.** A suppression list joined on
   submissions alone omits exactly the people who are hardest to reach, which is the population this
   AC exists to surface. Confirmed against the §10.10 table: `aladechristianahtosin@gmail.co` and
   `ogunbonadamola@gmail.co` have `drafts`/`mlt` footprints and **no `users` row at all**.
   - **RED-verify:** seed a suppressed address that reaches its respondent only through
     `magic_link_tokens`; assert the row appears with its reference code. Narrow the query to
     `submissions` and it reds.

6. **No schema change for AC1.** `email_suppressions` already carries `email`, `reason`,
   `sourceMessageId`, `suppressedAt` (`db/schema/email-suppressions.ts:19-26`); everything else on
   this screen is a join. (AC3.4 is where a column becomes unavoidable — say so there, not here.)

7. ⚠️ **A suppressed address is NOT "this person is unreachable"** — SCP §10.10 item 4. Five of the
   eleven have a HEALTHY TWIN already in the register. The view must show the twin when one exists,
   or an operator will "correct" a person who is already reachable at another address.

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

5. **The extraction is named and one-directional: `services/contact-correction.service.ts`.** Both
   `scripts/correct-respondent-contact-email.ts` and the new route import it; **neither keeps a
   private copy of the refusal, the suppression delete, or the audit write.**
   - Surface: `correctRespondentContactEmail(tx, { respondentId, to, actorId, reason })` — takes the
     transaction, so the caller owns the boundary and `logActionTx` stays inside it.
   - ⚠️ **Do NOT prove this with a source census.**
     [[pattern-census-counts-sites-not-callers]] — 13-55 review H1 shipped a real promote with zero
     audit rows past a 9/9-green census, because a bypass calls the primitive and writes none of
     what you count. **RED-verify by BEHAVIOUR instead:** delete the clash refusal inside the
     service and assert the ROUTE test reds. If only the script's test reds, the extraction did not
     happen.
   - ⚠️ `apps/api/scripts/` is **outside tsconfig** — the script half is proven by RUNNING it
     (`--dry-run` against the test DB), never by `tsc`. Precedent for a script-adjacent test:
     `scripts/__tests__/blast-dedupe-inheritance.test.ts`.

6. ⛔ **FIX THE AUDIT VOCABULARY DRIFT WHILE YOU ARE HERE — it is already live.**
   `_ops-contact-remediation.ts:104/105` writes `action: 'email.suppression_lifted'`,
   `targetResource: 'users'` and `:168/169` writes `action: 'user.email_corrected'`. **None of the
   three strings exists in the constants**: `AUDIT_ACTIONS` (`audit.service.ts:63-190`) has
   `OPERATOR_RESPONDENT_EMAIL_CORRECTED` at `:157` and nothing else here; `AUDIT_TARGETS`
   (`:207-209`) has exactly one member, `RESPONDENT: 'respondent'`. It compiled because both
   `logAction` (`:373-381`) and `logActionTx` (`:415-426`) type `action` as a bare `string`.
   - Add `EMAIL_SUPPRESSION_LIFTED` + `USER_EMAIL_CORRECTED` to `AUDIT_ACTIONS` and a `USER` member
     to `AUDIT_TARGETS`, then **point the script at the constants**.
   - Follow [[feedback_audit_target_unification]]: SINGULAR canonical (`'user'`, not `'users'`) and
     **migrate the existing prod rows** rather than leaving two spellings that no query can union.
   - ⚠️ **Do not widen `action` to a union in this story.** That is a repo-wide retype with an
     unbounded blast radius; land the constants + the migration here and leave the type alone.

7. ⚠️ **THE CORRECTION REACHES 1 OF THE 3 CONTACT SOURCES TODAY — CLOSE IT OR STATE IT.**
   `correct-respondent-contact-email.ts:96-100` updates `submissions.raw_data->>'email'` and
   `wizard_drafts.email`. It never touches `magic_link_tokens.email` or `users.email`. For the 45
   people with no submissions row (AC1.5), a "correction" therefore writes **nothing to the source
   the resolver will actually read**, reports success, and leaves them exactly as unreachable —
   [[pattern-ship-a-fix-that-never-fires]] inside the fix for it.
   - The shared service must update **every source that holds the stale address**, and report which
     ones it touched.
   - **RED-verify:** correct a respondent whose only address lives in `magic_link_tokens`; assert
     `resolveRespondentContactEmail()` afterwards returns the NEW address. Against today's script
     logic that test reds.
   - ✅ **`campaign_sends` still stays untouched** — it is a send LEDGER (see *What already exists*).
     Rewriting it would be falsifying history, and the read-back must not treat it as a source.

8. **The refusal must NAME the owner, and the read-back must be asserted.** AC2.3 says "say whose
   it is": the script already resolves the clashing reference code
   (`correct-respondent-contact-email.ts:71-80`) — the UI surfaces that code, not a generic
   "address in use". And per [[pattern-a-record-about-the-work-is-not-the-work]], the service
   re-reads the row after the write and fails loudly on a mismatch, the way the script does at
   `_ops-contact-remediation.ts:175-180`.

### AC3 — Stop manufacturing the problem

> ### ✅ MEASURED 2026-08-16 (Bob/SM) — AC3.1 and AC3.2 are the wrong way round
> *Items 1–3 below are the original ACs and are unchanged. This block corrects their **premise**,
> which was never measured when they were written.*
>
> **1. Format validation catches NONE of the five capture defects.** Run here against the exact rule
> at `validation/registration.schema.ts:25` (`z.string().email().max(255)`, zod 3.25.76):
>
> | address | `z.string().email()` |
> |---|---|
> | `asirusakirat@gmail.come` — *the case this story exists for* | **ACCEPT** |
> | `osegunlajide@gmail.con` | **ACCEPT** |
> | `yusuffasiat@gmail.co` | **ACCEPT** |
> | `fatomidejumoke@mail.com` | **ACCEPT** |
> | `wahab akeem olaide <aqeemakolade@gmail.com>` | REJECT |
>
> The wizard client rule is the same shape — a hand-rolled `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` at
> `Step2ContactLga.tsx:74`, copied verbatim into `AddStaffModal.tsx:85`. **`.come` is a
> syntactically valid address.** So AC3.1 taken alone — *"validate the address the way the public
> wizard's Step 2 does"* — is a fix that cannot fire. **AC3.2 is the load-bearing half and must not
> be read as optional.**
>
> **2. But the dictionary does not hold the founding case either.** Measured both copies:
> **server 24 entries** (`lib/normalise/typo-dictionary.json`), **client 28**
> (`email-typo-dictionary.ts:14-43`). **`gmail.come` is absent from BOTH.** `gmail.co`, `gmail.con`
> and (client-only) `mail.com` are present. ⛔ **So the public wizard, exactly as it stands today,
> would not have caught Sakirat Asiru.** Copying it faithfully ships the defect.
>
> **3. The two dictionaries have ALREADY DRIFTED** — they are hand-mirrored by a comment
> (`email-typo-dictionary.ts:9-12`: *"Keep in sync… flag if drift becomes a recurring problem"*).
> Four entries exist client-side only: `gmaill.com`, `gmal.com`, `hotmali.com`, `mail.com`. **This
> is that flag.** One source of truth + a parity test, or the server will keep failing to warn about
> a typo the client already knows.
>
> **4. ✅ The AC3.2 mechanism is already BUILT — on the public wizard only.**
> `EmailTypoDetection.tsx` renders *"Did you mean…?"* with a one-tap accept and **never**
> auto-corrects (`suggestCorrectedEmail`, `email-typo-dictionary.ts:52-62`), wired post-blur at
> `Step2ContactLga.tsx:208-213`. That is precisely what AC3.2 specifies. **AC3.2 is REUSE plus two
> dictionary entries, not a build.**
>
> **5. ⚠️ AC3.1 is nonetheless BIGGER than it reads — there is no staff email field to validate.**
> Enumerator/clerk respondent capture is questionnaire-driven: `formSchema.ts` `checkRule()`
> supports only `minLength`/`maxLength`/`min`/`max`/`regex`/`modulus11` — **no email case** — and
> `QuestionRenderer.tsx:29-44` has **no email question type**, so an email question renders as a
> plain text box with no suggestion. `wizard-provided-field-names.ts:43` confirms `email` /
> `email_address` are the expected question names. **AC3.1 is a change to the dynamic form
> renderer.** Size it as that, not as a copied regex.
>
> **6. ⚠️ `mail.com` → `gmail.com` needs a human's eyes, and the story's own sources disagree about
> it.** `mail.com` is a REAL, live domain. AC1.2 lists `fatomidejumoke@mail.com` as "OUR data
> problem"; SCP §10.10 lists the same address among the five *"well-formed addresses that look like
> genuine bounces"*. The client dictionary sides with AC1.2 (`email-typo-dictionary.ts:42`). **Not
> resolved here — recorded.** It is the strongest argument in the story for AC3.2's confirm-prompt
> rule: whichever way the dictionary leans, the citizen decides and nothing is applied silently.

1. **Validate the address at capture** on the enumerator and clerk surfaces the way the public
   wizard's Step 2 does. `.come` is catchable at the point of entry, by the person who can still
   ask "is that right?" — which is infinitely cheaper than catching it after a bounce.
2. Consider a typo-suggestion on common domains (`gmail.come` → `gmail.com`, `mail.com` → `gmail.com`)
   — a confirm prompt, never a silent rewrite. **Never auto-correct a citizen's contact details
   without showing them.**
3. Normalise before suppressing, so the suppression key matches the address the register holds.

   **Implementation, per SCP §10.11's four points:**
   - Teach `toCanonicalEmail` (`lib/canonical-email.ts:12-14`) to unwrap an RFC 5322 `Name <addr>`
     form, so the fix cannot be bypassed by a future caller. Its docblock's *"these two MUST agree
     byte-for-byte"* invariant is the reason this belongs in the shared helper and nowhere else —
     ⚠️ **it is also the unsubscribe-token signing key** (`:2-6`), so changing it changes what a
     signed token recovers. Check the token round-trip in the same pass.
   - Route the webhook inlet through it. `email-events.service.ts:48` currently does its own
     `str(toRaw).trim().toLowerCase()` and `:100` stores that value; the unsubscribe inlet (`:112`)
     and the reader (`:122`) already call `toCanonicalEmail`. **One function owns the key.**
   - Backfill the one existing wrapped row via `_ops-contact-remediation.ts` (it is a registered
     person), and **migrate the `email_events` rows too** — `:29` stores the same raw recipient.
   - ⛔ **THIS ITEM IS GATED BY AC3.4. See the SEQUENCING blockquote at the top of this section.**
     It is Task 5, and Task 5 refuses to be ticked without Task 4.
   - **RED-verify** (verbatim from the blockquote): store `'A B <x@y.com>'` and assert
     `getSuppressedEmails(['x@y.com'])` returns it. Home for it:
     `services/__tests__/email-events.service.test.ts` — a real-DB file that already owns the
     `@ee.test` recipient keyspace (`:12-13`) and already asserts the bounce→suppression path
     (`:96-101`).

4. ⛔ **RECORD BOUNCE SEVERITY. This is the gate on AC3.3, and it is the harder half.**
   `email-events.service.ts:97` suppresses on **any** bounce with no severity check, and — verified
   in SCP §10.10 — **the only `delete(emailSuppressions)` calls in the entire tree are inside
   tests**, so nothing in production ever lifts one.
   - ⚠️ **A schema change IS required here, and AC1.6 is not a precedent for avoiding it.** Neither
     `emailSuppressions` (`:19-26`) nor `emailEvents` (`:15-42`) has a severity, bounce-type or
     payload column, and `webhook.controller.ts:51` hands `parseResendEvent` the payload and then
     **discards it** — `ParsedResendEvent` (`email-events.service.ts:21-27`) keeps five fields and
     the bounce sub-object is not one of them.
   - ➜ **Consequence, state it plainly: severity is UNRECOVERABLE for the existing 13 rows.** Going
     forward it comes from the live payload. For rows already on the table the only available proxy
     is the ordering SCP §10.11 used — `delivered` **then** `bounced` on one `message_id` — and that
     is a proxy, not the provider's classification. Do not backfill a `hard` that was never measured.
   - ⚠️ **Confirm the provider's field name from a REAL captured payload before coding it.** Nothing
     in this repo stores one, so it cannot be read off the tree — capture one (the Resend dashboard,
     or a webhook replay) and cite it. Guessing a field name here produces a severity that is always
     `undefined`, which fails OPEN into "suppress everything", the state we are trying to leave.
   - **`reason` needs no DDL** — `email-suppressions.ts:13-14` records that it is a plain `text`
     column with no DB CHECK, *"so widening this tuple needs no DDL migration"*. Adding a
     `severity` column does.
   - **RED-verify** (verbatim from the blockquote): assert a **soft** bounce does not produce a
     permanent suppression.
   - ⚠️ **Fail SAFE on an unknown severity: treat it as SOFT/retryable, not hard.** An unrecognised
     value must not permanently exclude a citizen. This is the one place in the story where the
     conservative default is *fewer* suppressions.

5. ⏱️ **The retry is TIME-BASED and AUTOMATIC. Do not build a manual lift button.**
   Governed by the 🔬 LIVE EVIDENCE section below — Juliet Odiba, measured twice on prod, **~14 h to
   resolve on both attempts**, and a lift on the provider's classification alone bought one more
   bounce seven days later. **A LIFT IS NOT A FIX.**
   - Pick a window with a **stated margin over 14 h** (the section proposes 72 h) and record it as a
     **measured assumption with a reopen trigger**, not a bare constant — the `+1` lesson from 12-7.
     Two observations of one Gmail mailbox is a shape, not a distribution; say so where the constant
     is defined.
   - Cap the retries, then **escalate to a different CHANNEL rather than a longer wait**. Juliet is
     `OSL-2026-51CNVZ`, has never been told her registration number, and holds a working phone.
     This is the same mechanism as 13-42 AC8's "name the suppressed people who have phone numbers".
   - ⚠️ **Do not hand-suppress on a retry failure** — the webhook does it. A manual row erases the
     hard/soft distinction AC3.4 just bought.
   - **RED-verify:** a soft suppression inside the window is still excluded; the same row past the
     window is retried exactly once. Remove the window check and the second assertion reds.

6. 🔒 **Guard the class, not the row — SCP §10.11 item 5.** *"A suppression row that is not a bare
   address is a row that cannot function."* The 8% non-bare rate (2 of 25 bounces) is a property of
   the **provider's** payloads and can change without notice, so the one-row backfill in AC3.3 is
   the smaller half of this fix.
   - Assert it structurally — a CHECK constraint on `email_suppressions.email`, or a lint over the
     table — so the next non-bare value **fails loudly instead of sitting inert for months**.
   - ⚠️ A constraint rejects the write at the webhook. Make sure that path **logs and 200s** rather
     than 500-ing back to Resend into a retry storm; `webhook.controller.ts:57-60` currently 500s on
     any throw from `recordEmailEvent`.
   - **RED-verify:** attempt to store a wrapped address directly; assert it is refused or flagged.
     Delete the guard and the test reds.

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

## ➕ ADDED 2026-08-11 (John/PM) — the send category vocabulary has no word for an operator reply

**Found by using it.** The two individual registration-number replies sent from `admin@oyoskills.com`
on 2026-08-11 (Jamiu §10.8, Juliet §11.4) were counted at the 9-63 chokepoint as **`category=other`**.
They are the first sends of their kind and the vocabulary has no bucket for them, so the ops digest
cannot tell an operator reply to a named citizen from an unclassified stray.

### 1. Add the bucket — the override already exists, the word does not

`NotificationMeter.recordEmailSend` already accepts an explicit `category` override
(`notification-meter.service.ts:183`), so the caller *could* have declared itself. It could not:
`NotificationCategory` (`notification-category.ts:15-32`) has no member for this.

- Add **`operator-reply`** to `NotificationCategory`.
- Add a rule to `classifyEmailSubject` ordered with the other specifics — the current subject is
  `You are registered — Oyo State Livelihood and Skills Registry (OSL-…)`.
- Have `_ops-send-registration-number-reply.ts` pass it **explicitly** rather than relying on a
  substring match. A script that knows its own bucket should say so; matching its own subject line is
  a coupling that breaks the first time someone edits the copy.

### 2. ⚠️ THE BIGGER HALF — `other` is silent, so a MISSING bucket looks like a DELIBERATE one

`classifyEmailSubject` is a substring cascade that **always returns something**: an unmatched subject
falls to `'other'` with no error, no warning and no log. So:

- **A brand-new send type is indistinguishable from a send legitimately bucketed `other`.** Nobody
  learns that the vocabulary has fallen behind the code — which is exactly what happened here, and it
  was noticed only because a human read one line of script output.
- This is [[pattern-monitor-measuring-something-else]] in the counter itself: it reports a category
  for every send, and one of the categories means *"I did not recognise this."*

**What to do:** make the fallback observable, not louder-for-its-own-sake. A WARN log naming the
unmatched subject, and/or an `other` line in the ops digest, so a *rising* `other` count is a signal
that a send type exists with no bucket. ⚠️ Do **not** make it throw — a classifier that can fail a
send would let a taxonomy gap block a citizen's email, which is far worse than a miscounted one.

### 3. Scope note

This is vocabulary + observability, **not** a change to what gets sent or to whom. It sits with 13-51
because 13-51 already owns the operator-contact surface these replies belong to, and because the
bounce-severity work in this story touches the same event/counting path.

## 🔬 LIVE EVIDENCE FOR THE RETRY WINDOW — Juliet Odiba, measured twice (added 2026-08-12, John/PM)

**This story has to decide how long a `Transient` suppression is held before retry. That question now
has data instead of a guess, from one person, measured on prod.**

| | event | gap |
|---|---|---|
| 1st | sent 2026-08-04 09:11 → **bounced** 2026-08-04 23:11 | **14 h** — Resend: `Transient / MailboxFull`, *"message expired: unable to deliver in 840 minutes"* |
| — | suppression **lifted** 2026-08-11 09:06 on the provider's own classification (§11.1) | 7 days later |
| 2nd | sent 2026-08-11 16:29 → **bounced** 2026-08-12 06:29 | **14 h**, auto-re-suppressed |

**Four things this settles, and one it does not:**

1. ⏱️ **A transient bounce takes ~14 hours to resolve, not seconds.** Any verification that waits 90
   seconds and reports "no event" is structurally unable to see it. `_diagnose-mailbox-delivery.ts`
   says *"NOT a pass and NOT a fail"* for exactly this reason — **keep that wording; it was right.**
2. 🔁 **The webhook, the re-suppression and the severity classification all worked.** This is not a
   broken pipeline. The only thing missing is the *decision* about what to do with a `Transient`.
3. ⛔ **A LIFT IS NOT A FIX.** Her mailbox was still full seven days on, so lifting the suppression
   bought one more bounce and one more mark against the sending domain. **The retry must be
   TIME-BASED and automatic, not an operator judgement** — a human lifting on the provider's
   classification alone (which is what I did, correctly, on the evidence available) still re-sends
   into a full mailbox. **Design the window; do not design a manual button.**
4. 📞 **After N failed retries the answer is a different CHANNEL, not a longer wait.** Juliet is
   `OSL-2026-51CNVZ`, active since 2026-08-04, **has never been told her registration number**, and
   holds a working phone (`+2348130926690`). Two email attempts, two bounces, 7 days apart. **She is
   the worked example of why the escalation path must exist** — and 13-42 AC8 already asks the digest
   to name suppressed people *with* phone numbers so they can be moved to SMS. This story and that
   line are the same mechanism seen from two ends.

**What it does NOT settle:** whether 14 h is typical or particular to Gmail's over-quota behaviour.
Two observations of one mailbox is a shape, not a distribution. **Pick a retry window with a stated
margin over 14 h (e.g. 72 h) and record it as a measured assumption with a reopen trigger, not as a
constant someone will later find unjustifiable** — the `+1` lesson from 12-7.

⚠️ **Do not hand-suppress on a retry failure.** The webhook does it, and 13-51's whole job is to let
the system tell a retry apart from a death. A manual row erases the distinction it is trying to make.

## Tasks / Subtasks

⚠️ **Sizing:** this is NOT the small "add an admin screen" story its title suggests. It spans a
Super-Admin surface (API + web), a service extraction shared with two existing scripts, a schema
change on `email_suppressions`, a change to the **dynamic form renderer**, and a correctness fix in
the send path that carries its own hard ordering constraint. **Read the ⛔ SEQUENCING blockquote
under `## Acceptance Criteria` and the ✅ MEASURED block under AC3 before estimating.**

⛔ **TASK ORDER IS A CONSTRAINT, NOT A SUGGESTION.** Task 4 before Task 5, always. If Task 4 cannot
land, **Task 5 does not land either** — the current broken state is strictly safer than half the fix.

- [x] **Task 1 — The shared correction service** (AC: #2.1, #2.5, #2.7, #2.8)
  - [x] Extract `services/contact-correction.service.ts` from the logic now living in
        `scripts/correct-respondent-contact-email.ts:94-121` and
        `scripts/_ops-contact-remediation.ts:100-115` / `:164-173`. **Both scripts import it; neither
        keeps a copy** (13-4 AC4.6's skip-logic divergence is the named precedent).
  - [x] Takes the `tx`, so `logActionTx` stays inside the caller's transaction — never the void
        `logAction`, which cannot be awaited from a script and loses the last row of every batch
        (13-49 R11, [[pattern-void-helper-loses-last-batch-row]]).
  - [x] ⚠️ Update **every** contact source holding the stale address, not just `submissions` +
        `wizard_drafts` (AC2.7). `respondent-contact.service.ts:22-27` fixes the three-source
        priority; `:15-16` measures **45 respondents reachable ONLY via `magic_link_tokens`**.
  - [x] ✅ `campaign_sends` stays untouched — send LEDGER, not a contact record.
  - [x] Read back after the write and fail loudly on mismatch, as `_ops-contact-remediation.ts:175-180`
        already does ([[pattern-a-record-about-the-work-is-not-the-work]]).
  - [x] **RED-verify (behaviour, NOT a census):** delete the clash refusal inside the service, assert
        the **route** test reds. If only the script's test reds, the extraction did not happen
        ([[pattern-census-counts-sites-not-callers]]).
  - [x] **RED-verify:** correct a respondent whose only address is in `magic_link_tokens`; assert
        `resolveRespondentContactEmail()` then returns the NEW address. Reds against today's logic.
  - [x] ⚠️ `apps/api/scripts/` is **outside tsconfig** — prove the script half by RUNNING it
        (`--dry-run` against the test DB). eslint is the only compile-time signal there.
- [x] **Task 2 — Audit vocabulary: close the drift, then use the constants** (AC: #2.2, #2.6)
  - [x] Add `EMAIL_SUPPRESSION_LIFTED` + `USER_EMAIL_CORRECTED` to `AUDIT_ACTIONS`
        (`audit.service.ts:63-190`; `OPERATOR_RESPONDENT_EMAIL_CORRECTED` is already there at `:157`)
        and a `USER` member to `AUDIT_TARGETS` (`:207-209` — today its only member is `RESPONDENT`).
  - [x] Re-point `_ops-contact-remediation.ts:104/105` and `:168/169` off the raw literals.
        **SINGULAR canonical** (`'user'`), and migrate the existing prod rows off `'users'`
        ([[feedback_audit_target_unification]] — extract + migrate on literal drift).
  - [x] ⚠️ Do **not** widen `logAction`/`logActionTx`'s `action: string` to a union here
        (`:373-381`, `:415-426`) — repo-wide retype, unbounded blast radius, different story.
  - [x] **RED-verify:** a correction made through the UI writes an audit row whose `actorId` is the
        session user (AC2.2 — *"the script passes `actorId: null`; the UI must not"*). **Assert the
        ROW, never `toHaveBeenCalled`** — asserting the mock proves the mock (13-54 precedent).
- [x] **Task 3 — The Super-Admin surface** (AC: #1)
  - [x] `classifySuppressedAddress()` in `apps/api/src/lib/`, beside `canonical-email.ts` — pure,
        exported, tested, **provider-artefact branch tested FIRST** (AC1.4).
  - [x] **RED-verify:** `'wahab akeem olaide <aqeemakolade@gmail.com>'` → `provider_artefact`,
        `'yusuffasiat@gmail.co'` → `capture_typo`. Reorder the branches and the first reds.
  - [x] API: follow the audit-log-viewer exemplar — router-level guard
        `router.use(authenticate, authorize(UserRole.SUPER_ADMIN))`
        (`routes/audit-log-viewer.routes.ts:51`), mounted under `routes/admin.routes.ts:24`. Note the
        exemplar goes **route → service with handlers inline**; there is no controller file, and
        `requireRole` does not exist in this repo — the middleware is `authorize`.
  - [x] Web: mirror `apps/web/src/features/audit-log/` (`api/` + `hooks/` + `components/` +
        `pages/`), routed under the existing super-admin parent
        (`App.tsx:749`, `<ProtectedRoute allowedRoles={['super_admin']}>`), lazy-imported like `:53`.
  - [x] Join through **all three** contact sources (AC1.5); show phone (AC1.3), ladder status
        (AC1.1) and the healthy twin when one exists (AC1.7).
  - [x] **RED-verify:** a suppressed address reachable only via `magic_link_tokens` still appears
        with its reference code; narrow the query to `submissions` and it reds.
  - [x] Web tests run from `apps/web` (`cd apps/web && pnpm vitest run`) — **never** `pnpm vitest run`
        from the repo root.
- [x] **Task 4 — ⛔ BOUNCE SEVERITY + THE RETRY WINDOW. MUST LAND BEFORE (OR WITH) TASK 5.** (AC: #3.4, #3.5)
  - [x] ⚠️ **Capture a REAL Resend bounce payload and cite it before coding the field name.** Nothing
        in this repo stores one: `webhook.controller.ts:51` passes the payload to `parseResendEvent`
        and discards it, and `ParsedResendEvent` (`email-events.service.ts:21-27`) keeps five fields,
        none of them the bounce sub-object. A guessed field name yields a permanently `undefined`
        severity that fails OPEN into "suppress everything".
  - [x] Schema: add severity to `email_suppressions` (and carry it on `email_events`). `reason`
        itself needs no DDL — `email-suppressions.ts:13-14` says the tuple widens without a
        migration — but **a new column does**. `db:push:force` in CI; back it up first
        ([[feedback_db_push_force]]).
  - [x] Only a **hard** bounce suppresses permanently. **Unknown severity ⇒ treat as SOFT** — the one
        place in this story where the safe default is fewer suppressions.
  - [x] Time-based automatic retry with a **stated margin over the measured 14 h** (72 h proposed).
        Record it as a **measured assumption with a reopen trigger**, in a comment at the constant —
        two observations of one Gmail mailbox is a shape, not a distribution (12-7's `+1` lesson).
  - [x] Cap retries, then escalate to **phone**, not to a longer wait. Same mechanism as 13-42 AC8.
  - [x] ⛔ Do **not** backfill a severity onto the existing 13 rows. It is unrecoverable; the
        `delivered`-then-`bounced` ordering is a proxy, not the provider's classification.
  - [x] **RED-verify:** a soft bounce does not produce a permanent suppression *(this is the
        blockquote's own wording)*. And: a soft suppression inside the window stays excluded, the
        same row past the window is retried once — remove the window check and the second reds.
- [x] **Task 5 — ⛔ THE UNWRAP. DO NOT START THIS BEFORE TASK 4 IS GREEN.** (AC: #3.3, #3.6)
  - [x] ⛔ **Gate check, in writing, before the first line:** is Task 4's severity work merged or in
        this same commit? If no — **STOP.** Landing this alone converts an inert row into a working
        permanent exclusion of a registered citizen (`aqeemakolade@gmail.com`) on one soft bounce.
        *"If only one can ship, ship NEITHER."*
  - [x] Teach `toCanonicalEmail` (`lib/canonical-email.ts:12-14`) to unwrap `Name <addr>`.
        ⚠️ It is **also the unsubscribe-token signing key** (`:2-6`, *"these two MUST agree
        byte-for-byte"*) — re-verify the token round-trip in the same pass.
  - [x] Route the webhook inlet through it: `email-events.service.ts:48` does its own
        `trim().toLowerCase()` and `:100` stores it, while `:112` and `:122` already canonicalise.
        **One function owns the key** ([[feedback_canonical_primitive_backlog_sweep]]).
  - [x] Backfill the one wrapped `email_suppressions` row via `_ops-contact-remediation.ts`, and the
        matching `email_events` rows (`email-events.ts:29` stores the same raw recipient).
  - [x] AC3.6 guard — CHECK constraint or table lint, so the next non-bare value fails loudly rather
        than sitting inert for months. The 8% is the **provider's** property and can change without
        notice, so the guard outranks the one-row backfill.
  - [x] ⚠️ Make the rejection path **log and 200**, not 500 — `webhook.controller.ts:57-60` currently
        500s on any throw from `recordEmailEvent`, which Resend answers with retries.
  - [x] **RED-verify:** store `'A B <x@y.com>'`, assert `getSuppressedEmails(['x@y.com'])` returns it
        *(the blockquote's own wording)*. Home: `services/__tests__/email-events.service.test.ts` —
        real-DB, owns the `@ee.test` keyspace (`:12-13`), already covers bounce→suppression (`:96-101`).
- [ ] **Task 6 — Stop manufacturing the typos at capture** (AC: #3.1, #3.2)
  - [ ] **ONE dictionary + a parity test.** Server 24 entries
        (`lib/normalise/typo-dictionary.json`), client 28 (`email-typo-dictionary.ts:14-43`), already
        drifted by four (`gmaill.com`, `gmal.com`, `hotmali.com`, `mail.com`). The client file's own
        comment says *"flag if drift becomes a recurring problem"* — this is that flag.
  - [x] ⛔ **Add `gmail.come`. It is in NEITHER dictionary** — the founding case of this story would
        not be caught by the surface AC3.1 says to copy.
  - [x] Reuse `EmailTypoDetection.tsx` + `suggestCorrectedEmail` (`email-typo-dictionary.ts:52-62`)
        on the staff surfaces — post-blur, one-tap accept, **never a silent rewrite**. It is already
        wired on the public wizard at `Step2ContactLga.tsx:208-213`. **Reuse, do not rebuild.**
  - [x] AC3.1 lands in the **dynamic form renderer**, not as a copied regex: `formSchema.ts`
        `checkRule()` has no email case and `QuestionRenderer.tsx:29-44` has no email question type.
        `wizard-provided-field-names.ts:43` names the carrier questions (`email`, `email_address`).
  - [ ] ⚠️ `mail.com` is a REAL domain and AC1.2 and SCP §10.10 disagree about
        `fatomidejumoke@mail.com` (see AC3's callout item 6). Whatever the dictionary says, the
        citizen confirms — **never auto-correct a citizen's contact details without showing them.**
  - [x] **RED-verify:** a staff capture of `…@gmail.come` surfaces a suggestion. ⚠️ **Do not write a
        format-validation test and call this covered** — `z.string().email()` ACCEPTS all four bare
        typos (measured; see AC3's callout item 1). A green format test here is
        [[pattern-test-that-passes-over-a-hole]] in its purest form.
- [x] **Task 7 — The send-category vocabulary** (AC: ➕ ADDED §1, §2)
  - [x] Add `operator-reply` to `NotificationCategory` (`notification-category.ts:15-32`) and a rule
        to `classifyEmailSubject` (`:40-58`), ordered with the other specifics.
  - [x] Have `_ops-send-registration-number-reply.ts:228` pass `category` **explicitly** — the
        override already exists (`notification-meter.service.ts:184`, resolved at `:186`); the word
        did not. A script matching its own subject line breaks when someone edits the copy.
  - [x] Make the `'other'` fallback (`notification-category.ts:57`) **observable** — a WARN naming the
        unmatched subject and/or an `other` line in the digest. ⚠️ **Never throw**: a classifier that
        can fail a send lets a taxonomy gap block a citizen's email.
  - [x] **RED-verify:** the reply subject
        (`_ops-send-registration-number-reply.ts:196`) classifies as `operator-reply`, not `other`.
        Today it falls through all 17 matchers to `'other'` — confirmed by reading the cascade.

### Review Follow-ups (AI) — 2026-08-20 BMAD adversarial code-review

⚠️ **All eleven were FIXED on the uncommitted tree in the same session.** Each is left here with
its evidence so the fix can be audited rather than taken on trust. Severity order: 2 High, 4
Medium, 5 Low. The four highest each carry a RED-verify that was performed — fix neutered, named
test watched fail, fix restored `diff -q` byte-identical.

- [x] **[AI-Review][HIGH] H1 — the AC1 surface never fetched, and told the operator nobody was silenced.**
      `hooks/useSuppressedContacts.ts:23` paired `initialData: []` with `staleTime: 30_000`.
      TanStack writes `initialData` into the cache stamped `dataUpdatedAt = now`, so the query was
      never stale on mount and `refetchOnMount` skipped the request; it also forces
      `status: 'success'`, so `isLoading` was false and the page rendered
      `SuppressedContactsTable.tsx:37` immediately — **"No suppressed addresses. Nobody is being
      silently dropped."** Measured: **queryFn called 0 times, data `[]`**. The whole screen this
      story exists to build was [[pattern-ship-a-fix-that-never-fires]]. Every test passed over the
      hole because the table takes `rows` as a prop and the hook had no test at all.
      **Fix:** `placeholderData: []` (the shape `useAuditLogs.ts:34` already uses — the only
      `initialData` in the repo was this one) + `data ?? []` at the consumption site.
      **RED-verify:** revert to `initialData` → all 3 tests in the new
      `__tests__/useSuppressedContacts.test.tsx` red. Restored → 13 passed.
- [x] **[AI-Review][HIGH] H2 — an async rejection hung the request and killed the API process.**
      `routes/suppressed-contacts.routes.ts:45` had no try/catch and `:110` ended with a bare
      `throw err`. Express 4.22 does not forward async rejections; there is no
      `express-async-errors` shim and **no `process.on('unhandledRejection')` anywhere in
      `apps/api`**. Measured against the real router: the request **never responded** (3 s deadline,
      status never set) and Node emitted **1 unhandled rejection**. Prod runs `node dist/index.js`
      with no `--unhandled-rejections` flag and no `NODE_OPTIONS` anywhere in the repo, so Node's
      default is `throw` — one failed query on an admin screen takes the whole API down. This was
      the only route file in the repo that neither took `next` (the audit-log-viewer exemplar it
      claims to follow) nor wrapped its body (admin.routes.ts).
      **Fix:** both handlers take `next` and route every unrecognised error through it.
      **RED-verify:** revert either handler → the matching case in the new
      `routes/__tests__/suppressed-contacts.routes.error-handling.test.ts` reds **by timing out at
      5 s**, which is the actual failure mode. Restored → 2 passed.
- [x] **[AI-Review][MED] M1 — "given up — use phone" fired for people who asked us to stop.**
      `suppressed-contacts.service.ts:136` computed `emailGivenUp = reason !== 'bounced' || …`, so
      every `unsubscribed` and `complained` row was true; the table rendered that as **"given up —
      use phone"** and the page header counted them into "N given up on by email but have a phone
      number". `getSuppressedEmails` had it right — its docblock says a complaint or unsubscribe
      "is a person's stated wish and is never retried" — but the UI reused the same boolean to mean
      the opposite: go and ring them. A predicate that is not the thing meant, on the one group it
      is least defensible to contact. No test covered a non-`bounced` row on this surface.
      **Fix:** one owner, three states — `classifyEmailState` in `lib/bounce-severity.ts` returning
      `holding | given_up | opted_out`; the stated-wish test runs FIRST (ordering is load-bearing,
      as in `classifySuppressedAddress`). Table renders "opted out — do not contact"; the header
      counts `given_up` only and adds a separate opted-out line.
      **RED-verify:** demote the `opted_out` branch below the severity test → the discriminating
      assertion (`unsubscribed` + `severity: 'hard'` + `bounceCount: 99`) reds. ⚠️ The *first*
      assertion alone does NOT red — same lesson as the dev's own neuter 6, so the discriminating
      case is the one that had to be written.
- [x] **[AI-Review][MED] M2 — AC3.6 guarded one inlet, which is not guarding a class.**
      `recordEmailEvent` checked `isBareEmail`; `suppressUnsubscribe` — the other writer in the same
      file — did not. AC3.6's own words are "guard the CLASS, not the row"; a check bolted to one
      call site is exactly [[pattern-census-counts-sites-not-callers]]. "The caller already
      canonicalised" is no defence: an **internal space** survives trim + lower-case untouched, so
      `toCanonicalEmail` is a no-op on it and the value still cannot be an address — the class
      normalisation cannot repair. Residual #6 stated only the psql/scripts gap and never mentioned
      this second in-repo writer.
      **Fix:** `assertBareSuppressionKey()` — one guarded path, called by both writers, logging
      `email_events.non_bare_suppression_key` before it throws.
      **RED-verify:** remove it from `suppressUnsubscribe` → the new M2 test reds.
- [x] **[AI-Review][MED] M3 — the File List omitted the navigation that makes AC1 reachable.**
      Cross-referenced against `git status`: `sidebarConfig.ts`, `sidebarConfig.test.ts`,
      `known-routes.ts` and `audit.service.test.ts` were all modified and none appeared under
      `## File List`. The story's own sidebar test says "a page routed in App.tsx with nothing
      linking to it is a fix that never fires" — and that file was missing from the record of the
      work. [[pattern-a-record-about-the-work-is-not-the-work]]. **Fix:** File List completed and
      re-cross-referenced; 0 discrepancies now.
- [x] **[AI-Review][MED] M4 — two divergent definitions of "given up", one of them dead.**
      `listEmailGivenUpOn` (`email-events.service.ts:249`) encoded the rule in SQL with **zero
      callers and zero tests** across api + web, while shipping in the File List as a deliverable —
      and the JS copy that *was* used carried M1's defect. **Fix:** deleted, with a comment at the
      site saying why; the rule now lives only in `classifyEmailState`. A digest consumer (13-42
      AC8) reads `listSuppressedContacts` and filters on `emailState`, so it cannot disagree with
      what the operator screen shows.
- [x] **[AI-Review][LOW] L1 — `isUnclassifiedSubject` was read only by its own test.**
      `notification-meter.service.ts` re-derived `category === 'other'` inline. **Fix:** the meter
      now calls the exported predicate, so it has a production consumer. The `!args.category` half
      is kept — a caller that DECLARED its bucket has not fallen through anything.
- [x] **[AI-Review][LOW] L2 — a key normalisation was audited as a suppression LIFT.**
      `_ops-contact-remediation.ts --normalise-keys` wrote `EMAIL_SUPPRESSION_LIFTED`. It lifts
      nothing — nobody is released, the key merely becomes matchable, which if anything suppresses
      *harder*. `action` **is** in the hash payload, so this would have been unfixable the moment it
      touched prod, and it would have made "when did we release someone" unanswerable. **Fix:** new
      `EMAIL_SUPPRESSION_KEYS_NORMALISED` — never yet written by anything, so it was still free to
      be spelled correctly.
- [x] **[AI-Review][LOW] L3 — the `AUDIT_ACTIONS` tally comment contradicted itself.**
      The 13-51 block was inserted between "→ 54" and "→ 56" while claiming "→ 62", so the ledger
      that tells the next person how to bump the count read 54 → 62 → 56 → … → 60. The assertion was
      right; the record about it was not. **Fix:** block moved into tally order; now reads
      54 → 56 → 60 → 62 → 63 (63 including L2's new action).
- [x] **[AI-Review][LOW] L4 — the correction modal had no dialog semantics or escape route.**
      It performs an irreversible, audited write to a citizen's **login identity** and had no
      Escape handler, no initial focus and no `role`/`aria-modal`. **Fix:** `role="dialog"` +
      `aria-modal` + `aria-labelledby`, Escape-to-close, autofocus on the address field, and
      backdrop-only click-away (a click bubbling out of the form must not discard a half-typed
      correction). Radix `AlertDialog` is built for confirm/cancel, not a two-field form, so the
      element stays and gains what the convention actually buys.
- [x] **[AI-Review][LOW] L5 — the email carrier names were hand-copied from the canonical set.**
      `QuestionRenderer.tsx:18` justified the copy as avoiding a registration-feature dependency —
      while the component it renders imports `EmailTypoDetection` from that very feature. The
      dependency was already there, so the copy bought nothing and could only drift. **Fix:**
      imports `WIZARD_PROVIDED_FIELD_NAMES.email`.

## Dev Notes

### Project Structure Notes

- **API.** Services `apps/api/src/services/`, routes `apps/api/src/routes/`, shared helpers
  `apps/api/src/lib/`. Tests are co-located in `__tests__/` next to source — there is **no**
  `integration/` directory; real-DB tests use the `*.integration.test.ts` suffix in the same folder
  and `beforeAll`/`afterAll`, not per-test hooks.
- **Super-Admin exemplar.** `routes/audit-log-viewer.routes.ts` (guard at `:51`, mounted at
  `routes/admin.routes.ts:24`) → `services/audit-log-viewer.service.ts`. Handlers are **inline in
  the route file**; there is no controller for it. Route-test shape:
  `routes/__tests__/audit-log-viewer.routes.test.ts:82`.
- **Web.** `apps/web/src/features/audit-log/` is the layout to mirror (`api/`, `hooks/`,
  `components/`, `pages/`, `__tests__/`). Super-admin parent route `App.tsx:746-753`.
- **Drizzle.** Schema files must not import from `@oslsr/types` (no `dist/`) — inline enum constants
  with a comment naming the canonical source.
- **Scripts.** `apps/api/scripts/` is outside tsconfig. RUN them; don't trust `tsc` (Pitfall #41).

### The six premises that moved (re-measured 2026-08-16 at `e8e1944`)

| premise as written | what the tree says |
|---|---|
| *"validate the way the wizard does"* catches `.come` | ⛔ `z.string().email()` **accepts** `.come`, `.con`, `.co`, `mail.com`; only the wrapped form rejects |
| the wizard would have caught Sakirat Asiru | ⛔ `gmail.come` is in **neither** typo dictionary |
| AC3.2 is a "consider" | ✅ already built + shipped on the public wizard (`EmailTypoDetection.tsx`) — reuse, not build |
| AC3.1 is a copied regex | ⚠️ staff capture has **no email field**; it is a dynamic-form-renderer change |
| the correction path is done | ⚠️ it writes 1 of 3 contact sources; 45 people are `magic_link_tokens`-only |
| the audit vocabulary is clean | ⚠️ 3 raw literals already live in `_ops-contact-remediation.ts` |

### Known limits to state, not to paper over

- **Severity cannot be reconstructed for the 13 existing rows.** The raw payload was never stored.
  Say so where the backfill would otherwise go.
- **The retry window is two observations of one Gmail mailbox.** A shape, not a distribution — it
  carries a reopen trigger or it becomes a constant nobody can justify later.
- **`fatomidejumoke@mail.com` is classified differently by AC1.2 and SCP §10.10.** Recorded, not
  resolved; AC3.2's confirm prompt is what makes the disagreement safe.
- **Bulk correction stays out of scope** — and AC1's three buckets are the reason. Only the
  `capture_typo` bucket is even a candidate, and each row still deserves a human look.

### References

- SCP `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-09-portfolio-triage.md`
  **§10.10** (5 of 11 suppressions are capture defects with a healthy twin), **§10.11** (the
  suppression that cannot suppress + the sequencing ruling), **§10.12 B** (`draft-invite-2026-08`
  bounced 9.3% vs ~2% elsewhere — why this story gates the blast).
- `apps/api/src/services/email-events.service.ts` — inlets `:48`/`:100` and `:112`; reader `:122`;
  suppress-on-any-bounce `:97`.
- `apps/api/src/lib/canonical-email.ts:12-14`; `apps/api/src/services/respondent-contact.service.ts`.
- `apps/api/scripts/correct-respondent-contact-email.ts` + `apps/api/scripts/_ops-contact-remediation.ts`
  — the CLI paths that ALREADY EXIST. **Extract, do not rebuild.**
- 13-42 AC8 (digest names suppressed people with phone numbers) — the same mechanism from the other end.
- Patterns: [[pattern-ship-a-fix-that-never-fires]], [[pattern-census-counts-sites-not-callers]],
  [[pattern-test-that-passes-over-a-hole]], [[pattern-monitor-measuring-something-else]],
  [[feedback_canonical_primitive_backlog_sweep]], [[feedback_audit_target_unification]].

## Dev Agent Record

### Context Reference

- Story file (this document), read complete before any code.
- SCP `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-09-portfolio-triage.md` §10.10, §10.11, **§11.1** (the captured Resend bounce objects), **§11.3** (the `mail.com` ruling), §11.5, §11.6.

### Implementation Plan (as executed)

Task order followed the story's hard constraint: **Task 4 (severity) before Task 5 (unwrap)**, and both are in this one uncommitted change, so the SEQUENCING blockquote's "ship severity first, or in the same commit" is satisfied by construction. The gate check demanded by Task 5 was performed in writing before the first line of unwrap code: severity was already written and green in this same tree.

1. **Task 2** first (audit constants) — Task 1's service needs them.
2. **Task 1** — `services/contact-correction.service.ts`, both scripts re-pointed.
3. **Task 4** — schema + severity + retry window.
4. **Task 5** — the unwrap, the inlet, the guard, the backfill.
5. **Task 3** — classifier, API route, web feature.
6. **Task 7** — send-category vocabulary.
7. **Task 6** — partial; see the omissions below.

### ⛔ TASK 4's BLOCKING GATE WAS DISCHARGED FROM EVIDENCE, NOT A GUESS

Task 4 forbids coding the provider field name without a REAL captured payload, and correctly says none is stored in this repo. **SCP §11.1 is that capture**: `GET https://api.resend.com/emails/{message_id}`, run against five live message ids on 2026-08-11, returning a `bounce` object with `type` (`Transient`/`Permanent`), `subType` (`MailboxFull`/`General`) and a diagnostic string, for five named addresses. Those five rows are asserted verbatim in `lib/__tests__/bounce-severity.test.ts`.

⚠️ **The residual uncertainty is stated, not papered over.** That capture is the **Email API GET** response; the **webhook body** shape is not evidenced anywhere in the repo or the planning artefacts. So `readBounceClassification` is deliberately tolerant about WHERE the object sits (`data.bounce`, `data`, envelope) while strict about the two cited field names — and **every bounce that yields no recognisable classification is WARN-logged** (`email_events.bounce_unclassified`). If the nesting is wrong, it shows up as a rising counter rather than a silent `undefined`. Combined with the mandated unknown⇒SOFT fail-safe, a wrong guess produces *fewer* suppressions, never more.

### 🔴 UNPLANNED BLOCKING FIX — THE CANONICAL RESOLVER HAS NEVER EXECUTED

`resolveRespondentContactEmail` — the function whose own docblock calls it *"THE canonical way to find a respondent's email address"*, introduced by `9d33b94` to end the 9-26 blind spot — **contained invalid SQL and threw `42601` on every call, for every respondent, since the day it was written.**

Postgres rejects a bare `ORDER BY … LIMIT` on a branch of a `UNION`; the branches were unparenthesised. Reproduced directly against Postgres before changing anything:

```
syntax error at or near "UNION"   code 42601   position 298
```

- **Why nobody saw it:** all three call sites are hand-run operator scripts (`nin-reconfirm.ts`, `_adoption-number-correction.ts`, and `sms-outreach-list.ts` for the sibling read). `apps/api/scripts/` is outside tsconfig — the repo's own Pitfall #41 rule, *"RUN scripts, don't trust tsc"* — and a SQL syntax error is invisible to `tsc` in any case. It is only ever found by executing the statement against a real database.
- **Why 13-51 found it:** AC2.7's RED-verify asserts on `resolveRespondentContactEmail()` rather than on the tables it reads. The moment the read-back went through the canonical resolver instead of re-querying `submissions`, the defect surfaced.
- **It had to be fixed here**: AC2.7 is unsatisfiable otherwise. Fix is parenthesising the three branches; the comment at the site records the whole history.
- ⚠️ **This is [[pattern-ship-a-fix-that-never-fires]] in a helper built to prevent that very class.** The 45-respondent measurement in its docblock is real; the function that was supposed to act on it never ran.

### RED-VERIFY LOG — every fix NEUTERED, watched go red, restored byte-identical

Not "a test exists". Each fix was reverted by hand, the test watched to fail, then restored and re-run green. Restores verified with `diff -q` against a pre-neuter copy.

| # | fix neutered | test that went RED | result |
|---|---|---|---|
| 1 | `toCanonicalEmail` unwrap removed | `RED-VERIFY (AC3.3): a wrapped "A B <x@y.com>" recipient is suppressed under the BARE key` | **2 failed / 27 passed** |
| 2 | `classifyBounceSeverity` → always `hard` | `RED-VERIFY (AC3.4): a SOFT bounce does not produce a permanent suppression` + the 3 retry-window tests | **5 failed / 24 passed** |
| 3 | clash refusal deleted **inside the service** | `RED-VERIFY (AC2.5/AC2.3/AC2.8)` in the **ROUTE** test *and* the service test | **2 failed / 14 passed** |
| 4 | `magic_link_tokens` write removed from the service | `RED-VERIFY: corrects a respondent reachable ONLY via magic_link_tokens` | **2 failed / 8 passed** |
| 5 | AC1 list query narrowed to `submissions` alone | `RED-VERIFY (AC1.5)` + `AC1.7 healthy twin` | **2 failed / 16 passed** |
| 6 | `classifySuppressedAddress` branch order swapped | `RED-VERIFY (ordering)` | **1 failed / 12 passed** |

**Neuter 3 is the one that matters for AC2.5**: deleting the refusal *inside the service* reds the **route** test, not merely the script's. That is the story's own stated proof that the extraction is real, and it is why the route test uses the REAL service against a REAL database rather than following the 9-11 exemplar's mocked-service shape — a mocked route test would have stayed green and proved the mock ([[pattern-census-counts-sites-not-callers]]).

⚠️ **Neuter 6 initially did NOT go red, and that finding improved the test.** The original ordering assertion used `'Some One <yusuffasiat@gmail.co>'`; for an angle-bracketed value the typo branch extracts `gmail.co>` — trailing bracket and all — which is in no dictionary, so *both* orderings answer `provider_artefact`. The test was passing over a hole ([[pattern-test-that-passes-over-a-hole]]). The discriminating case is an **uppercase** address (`Yusuffasiat@Gmail.CO`): not bare, but the typo branch lower-cases the domain before the lookup, so it *does* hit the dictionary. With that assertion added, neuter 6 reds correctly.

### Debug Log

- `isBareEmail` first trimmed before comparing, which defeated its own definition (`' x@y.com'` read as bare). Now compared **untrimmed**, plus a `[\s<>]` character test — an *internal* space survives trim+lowercase untouched, so canonicalisation is a no-op and the value still cannot be an address. That is the more dangerous class: a key normalisation cannot repair.
- Integration fixtures were first seeded with raw SQL and died on `23502`: several `id`/`created_at` defaults on these tables are drizzle `$defaultFn` values living in **JavaScript**, not the DDL. Re-seeded through the ORM.
- `UNSUBSCRIBE_SECRET`, not `UNSUBSCRIBE_TOKEN_SECRET`.
- Backticks inside a `sql` template literal terminate the string — two SQL comments had to lose theirs.
- ⚠️ **MY ERROR, recorded because the next person will make it too: provisioning a local test DB with `db:push:force` is WRONG — it must be `db:push:full:force`.** The plain push applies only the Drizzle schema and **drops the CHECK constraints and partial unique index that live in the `migrate-*-init.ts` runners**. The full-suite run that followed showed 8 failures; **7 were this**, not the code — `respondents_status_check`, `respondents_nin_unique_when_present`, `audit_logs_principal_exclusive_check` and both `api_consumers` CHECKs were simply absent from `app_test` while present in `app_db` (verified by diffing `pg_constraint` between the two databases before changing anything). `.github/workflows/ci-cd.yml:404-414` already carries an M5 code-review note saying exactly this; CI uses `db:push:full:force` and is unaffected. Re-provisioned with the correct command; all four files then passed 59/59.
- ⚠️ **And it left evidence of a real hazard**: with those constraints gone the constraint tests did not error — they inserted `status = 'totally_made_up_status'` and two `Invalid … Test` `api_consumers` rows and then failed on the *assertion*. A test asserting "the DB rejects this" is only as good as the DB it runs against, and the residue rows were still sitting in `app_test` afterwards. [[pattern-test-that-passes-over-a-hole]] seen from the environment side. The 8th failure was genuinely mine: `AUDIT_ACTIONS` count guard 60 → 62.

### Completion Notes

**Shipped, and what each one actually changes for a person:**

- **A soft bounce is no longer a life sentence.** `email_suppressions` gained `severity` + `bounce_count`; `email_events` gained `bounce_type`/`bounce_sub_type` (the provider's own words, unmapped). Only a `Permanent` bounce suppresses permanently. On the five measured prod bounces the old rule had a **40% false-positive rate**.
- **The suppression key can finally match the address it is meant to block.** `toCanonicalEmail` unwraps `Name <addr>`; the webhook inlet routes through it instead of hand-rolling `trim().toLowerCase()`. Unsubscribe-token round-trip re-verified: `verifyUnsubscribeToken` decrypts the plaintext as-is and never re-canonicalises, and a bare address is byte-identical before and after — so no live token's meaning moves.
- **The correction reaches every source, not one of three.** For the 45 respondents reachable only via `magic_link_tokens`, the 2026-08-06 script reported success having written nothing the resolver reads. The shared service now writes `submissions`, `magic_link_tokens`, `users` and `wizard_drafts`, reports which it touched, and **re-reads through the canonical resolver inside the transaction**, throwing on mismatch. `campaign_sends` stays untouched — it is a send ledger, and rewriting it would falsify history.
- **The dry run is no longer a second implementation.** `correct-respondent-contact-email.ts --dry-run` now runs the REAL service inside a transaction and rolls back, so the preview exercises the same refusal and the same read-back as `--apply`.
- **`gmail.come` is in both dictionaries.** The founding case of this entire story was in **neither**, so the surface AC3.1 says to copy would not have caught Sakirat Asiru.
- **An operator can finally see who we have gone quiet on**, with the three buckets kept distinct, the phone number, the mid-ladder flag, and the healthy twin.

**⛔ NOT DONE — Task 6's "ONE dictionary + a parity test". Stopped deliberately; it needs Awwal's ruling.**

Unifying the two dictionaries **forces a decision on `mail.com` that SCP §11.3 has already ruled on**, and §11.6 records a reopen trigger naming the exact file:

> *"A `mail.com`-style live-provider entry appears in `typo-dictionary.json` → §11.3 was overruled without being answered; re-read it before accepting."*

- Keep `mail.com` in the unified dictionary → trips that trigger verbatim. `mail.com` is a **real provider**: the bounce came from `postmaster.mail.com`, real MX, `550 mailbox unavailable`. Every other entry is a domain that serves no mail; adding a live one makes the dictionary lie — and 13-51 is the story that makes the dictionary *act*.
- Drop it → removes a suggestion the public wizard makes **today**, and contradicts AC3.2's own worked example and AC1.2's classification of `fatomidejumoke@mail.com`.

§11.3's decisive ground is not style: `fatomidejumoke@gmail.com` is **a guess no record holds**, and mailing a citizen's name, LGA and reference code to a guessed address is disclosure to an unidentified third party under NDPA, with a DPIA on file. So the disagreement is **recorded, not resolved** — exactly as the story's Dev Notes ask.

What this leaves in place, stated plainly: **server 25 entries, client 29** (`gmaill.com`, `gmal.com`, `hotmali.com`, `mail.com` remain client-only). The drift the story flagged is still there, minus the founding case. A parity test is deliberately NOT added, because a parity test carrying a permitted-divergence allowlist would assert the drift rather than close it.

`classifySuppressedAddress` is **not** blocked by this and does not pre-empt it: AC1.4 defines `capture_typo` as "the domain hits the typo dictionary", it reads the **server** dictionary, and `mail.com` is not in it — so `fatomidejumoke@mail.com` falls to `plausibly_dead`, which is AC1.4's own stated default ("the default is theirs, not ours") and agrees with §10.10 and §11.3. The binding is asserted in a test that names the disagreement.

**⚠️ OTHER OMISSIONS AND PARTIALS — stated, because an unstated omission is what costs a week:**

1. **AC2.6's prod-row migration is scoped to two ACTIONS, not to every row spelled `'users'`.** A census found **28 source sites** still writing `targetResource: 'users'` (mfa.controller ×12, staff.service ×7, auth.service ×4, this story's pair ×2, plus 3 singles). 13-51 re-points only its own two. Migrating the rest while 26 live sites keep writing the plural would not remove the second spelling — it would manufacture a **third state**. `scripts/_ops-migrate-audit-target-users-to-user.ts` therefore migrates only the rows whose action is one of this story's two constants. **The other 26 sites are a residual, not a silent fix.** ✅ Safety checked: `target_resource` is **not** in `computeHash`'s payload (`id|action|actorId|createdAt|details|previousHash`), so the migration cannot invalidate the audit chain. The two new `AUDIT_ACTIONS` values are deliberately **the strings already on prod**, because `action` *is* hashed.
2. **Neither backfill has been RUN.** `--normalise-keys` (the wrapped suppression/event rows) and the audit-target migration are both written, dry-run-by-default, predict-then-compare, with read-backs — but they are operator actions against prod and this story is uncommitted. They belong on the residual tracker. ⛔ `--normalise-keys` must not run until severity is **deployed**: normalising the key is what makes that row *function*, and a functioning un-severitied row is a permanent exclusion of a live citizen.
3. ⚠️ **DEPLOY EFFECT AN ADJUDICATOR MUST SEE: every existing bounce suppression becomes retry-eligible the moment this deploys.** The pre-13-51 rows carry `severity = NULL` (never measured) and `bounce_count = 1` (the column default), and they are all far older than the 72 h window — so `getSuppressedEmails` stops returning them and the **next blast will send to them, once each**. That is the fix firing, and it is the intended outcome: of the five measured well-formed bounces, **two were `Transient/MailboxFull` false positives** and one of them is Juliet Odiba, a registered citizen who has never been told her registration number. But it is a real change in who receives mail, it is not reversible by not-acting, and it should be a conscious call rather than a surprise. Complaints and unsubscribes are NOT affected — they are never retried at any age. If the sending-domain risk is judged too high for a single batch, the lever is `SOFT_BOUNCE_MAX_ATTEMPTS` / the window constant, both in `lib/bounce-severity.ts` with their evidence attached.
4. **Severity is NOT backfilled onto the existing rows, deliberately.** The raw payload was discarded at the inlet, so it is unrecoverable; the `delivered`-then-`bounced` ordering is a proxy, not the provider's classification. Those rows carry `severity = NULL`, which reads as SOFT — so they become retry-eligible, which is the fix firing. The UI says "severity never measured" rather than presenting a guess as a measurement.
5. **AC3.5's "escalate to a different CHANNEL" is surfaced, not automated.** After `SOFT_BOUNCE_MAX_ATTEMPTS` the row is permanently excluded from email and appears on the operator surface flagged `given up — use phone` **with the phone number**, and the page header counts them. There is no automatic SMS: 9-27 Parts B–F are blocked on Termii and explicitly out of scope. This is the same mechanism 13-42 AC8 asks for from the other end.
6. **AC3.6 is a code-level guard, not a DB `CHECK` constraint.** The story permitted either ("a CHECK constraint … or a lint over the table"). `recordEmailEvent` throws `NonBareSuppressionKeyError` before writing, and `webhook.controller.ts` answers it with **log + 200**, never 500 — a deterministic rejection answered with 500 turns one bad payload into a Resend retry storm that can never succeed. A DDL CHECK would additionally catch writes from psql/scripts; that is the stronger form and is **not** done here.
7. **The AC3.1 email question is detected BY NAME (`email`, `email_address`), not by a new question type.** Published form schemas have no `email` type and an email question authored today arrives as plain `text`; keying on the name means existing published forms pick the suggestion up with **no re-upload** — and a re-upload mints a NEW form row, which is its own hazard. No `email` case was added to `checkRule`, on purpose: `z.string().email()` **accepts** all four measured bare typos, so a format rule is a fix that cannot fire, and a green format test would be [[pattern-test-that-passes-over-a-hole]].
8. **`suppressUnsubscribe` still uses `onConflictDoNothing`** (unchanged). Only the bounce/complaint path became an upsert. An unsubscribe must never overwrite a stronger reason, and the new upsert explicitly refuses to downgrade `complained`/`unsubscribed` to `bounced`.
9. **Not run: the two backfill scripts against the test DB.** `apps/api/scripts/` is outside tsconfig, so per Pitfall #41 they are proven by RUNNING, not by `tsc`. The correction script's service path IS exercised (the integration suite drives the same service through the same transaction shape), but the two `_ops-*` scripts have not been executed end-to-end. Stated as a gap.
10. **Status left at `review`, not `done`** — §2a0 overrules the workflow's step 5; `done` is reserved for a real deploy SHA with every residual resolved. **Nothing committed**, per instruction.

### File List

**API — new**
- `apps/api/src/services/contact-correction.service.ts`
- `apps/api/src/services/suppressed-contacts.service.ts`
- `apps/api/src/routes/suppressed-contacts.routes.ts`
- `apps/api/src/lib/bounce-severity.ts`
- `apps/api/src/lib/classify-suppressed-address.ts`
- `apps/api/scripts/_ops-migrate-audit-target-users-to-user.ts`
- `apps/api/src/lib/__tests__/bounce-severity.test.ts`
- `apps/api/src/lib/__tests__/canonical-email.test.ts`
- `apps/api/src/lib/__tests__/classify-suppressed-address.test.ts`
- `apps/api/src/services/__tests__/contact-correction.service.integration.test.ts`
- `apps/api/src/services/__tests__/notification-category-operator-reply.test.ts`
- `apps/api/src/routes/__tests__/suppressed-contacts.routes.integration.test.ts`
- `apps/api/src/routes/__tests__/suppressed-contacts.routes.error-handling.test.ts` (code-review H2)

**API — modified**
- `apps/api/src/lib/canonical-email.ts` (unwrap + `isBareEmail`)
- `apps/api/src/services/email-events.service.ts` (severity, canonical inlet, window-aware reader, `listEmailGivenUpOn`, `NonBareSuppressionKeyError`)
- `apps/api/src/services/respondent-contact.service.ts` (**42601 SQL fix**, tx-aware variant sharing one copy of the priority SQL)
- `apps/api/src/services/audit.service.ts` (`EMAIL_SUPPRESSION_LIFTED`, `USER_EMAIL_CORRECTED`, `AUDIT_TARGETS.USER`; + `EMAIL_SUPPRESSION_KEYS_NORMALISED` — code-review L2)
- `apps/api/src/lib/bounce-severity.ts` (+ `classifyEmailState` — code-review M1/M4)
- `apps/api/src/services/suppressed-contacts.service.ts` (`emailState` replaces `emailGivenUp` — code-review M1)
- `apps/api/src/routes/suppressed-contacts.routes.ts` (`next`-based error handling — code-review H2)
- `apps/api/src/services/__tests__/audit.service.test.ts` (**⚠️ was MISSING from this list — code-review M3**; action count 60 → 63, tally comment reordered)
- `apps/api/src/services/notification-category.ts` (`operator-reply`, `isUnclassifiedSubject`)
- `apps/api/src/services/notification-meter.service.ts` (observable `other` fallback)
- `apps/api/src/controllers/webhook.controller.ts` (log + 200 on a refused key)
- `apps/api/src/db/schema/email-suppressions.ts` (`severity`, `bounce_count`)
- `apps/api/src/db/schema/email-events.ts` (`bounce_type`, `bounce_sub_type`)
- `apps/api/src/lib/normalise/email.ts` (`isKnownTypoDomain`, `correctionForTypoDomain`)
- `apps/api/src/lib/normalise/typo-dictionary.json` (`gmail.come`)
- `apps/api/src/routes/admin.routes.ts` (mount)
- `apps/api/src/services/__tests__/email-events.service.test.ts` (the 13-51 block)
- `apps/api/scripts/correct-respondent-contact-email.ts` (re-pointed at the service; rollback dry-run)
- `apps/api/scripts/_ops-contact-remediation.ts` (audit constants; `--normalise-keys`)
- `apps/api/scripts/_ops-send-registration-number-reply.ts` (explicit category)

**Web — new**
- `apps/web/src/features/suppressed-contacts/api/suppressed-contacts.api.ts`
- `apps/web/src/features/suppressed-contacts/hooks/useSuppressedContacts.ts`
- `apps/web/src/features/suppressed-contacts/components/SuppressedContactsTable.tsx`
- `apps/web/src/features/suppressed-contacts/components/CorrectContactDialog.tsx`
- `apps/web/src/features/suppressed-contacts/pages/SuppressedContactsPage.tsx`
- `apps/web/src/features/suppressed-contacts/__tests__/SuppressedContactsTable.test.tsx`
- `apps/web/src/features/suppressed-contacts/__tests__/useSuppressedContacts.test.tsx` (code-review H1)
- `apps/web/src/features/forms/components/EmailQuestionInput.tsx`

**Web — modified**
- `apps/web/src/App.tsx` (lazy import + super-admin route)
- `apps/web/src/features/forms/components/QuestionRenderer.tsx` (email carrier questions)
- `apps/web/src/features/registration/lib/email-typo-dictionary.ts` (`gmail.come`)
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` (**⚠️ was MISSING — code-review M3**; the nav entry without which the AC1 page has no entry point)
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` (**⚠️ was MISSING — code-review M3**; 17 → 18 items + a reachability assertion)
- `apps/web/src/__tests__/known-routes.ts` (**⚠️ was MISSING — code-review M3**)
- `apps/web/src/features/suppressed-contacts/hooks/useSuppressedContacts.ts` (`placeholderData` — code-review H1)
- `apps/web/src/features/suppressed-contacts/api/suppressed-contacts.api.ts` (`EmailContactState` — code-review M1)
- `apps/web/src/features/suppressed-contacts/pages/SuppressedContactsPage.tsx` (code-review H1/M1)
- `apps/web/src/features/suppressed-contacts/components/SuppressedContactsTable.tsx` (code-review M1)
- `apps/web/src/features/suppressed-contacts/components/CorrectContactDialog.tsx` (dialog semantics — code-review L4)

**Planning artefacts — modified**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (`ready-for-dev` → `in-progress` → `review`)
- this story file

## Residuals

⛔ **Every row is a MEASUREMENT with a named owner and a reopen trigger, per §2a0.** A residual
without all three is a hypothesis, and a hypothesis does not hold a story open or let one close.

| # | state | what it is | re-runnable evidence | owner | reopen trigger |
|---|---|---|---|---|---|
| **R1** | ⏳ **OPEN — BLOCKS `done`** | Neither backfill has been RUN. `_ops-contact-remediation.ts --normalise-keys` (the wrapped suppression + event rows) and `_ops-migrate-audit-target-users-to-user.ts` (4 audit rows) are written, dry-run-by-default, predict-then-compare, with read-backs — but both are operator actions against prod and nothing is committed. ⛔ `--normalise-keys` MUST NOT run until severity is **deployed**: normalising the key is what makes that row *function*, and a functioning un-severitied row is a permanent exclusion of a live citizen. | `tsx scripts/_ops-contact-remediation.ts --normalise-keys --dry-run` and `tsx scripts/_ops-migrate-audit-target-users-to-user.ts --dry-run` — both print a prediction and write nothing | Awwal (operator) | Runs on prod → compare printed prediction to the read-back. Any mismatch = reopen. |
| **R2** | ⏳ **OPEN — BLOCKS `done`, but NARROWED at adjudication 2026-08-20.** The `_ops-*` entry points are still unrun. **What is no longer unproven is the resolver underneath them:** `resolveRespondentContactEmail` had never succeeded once — bare `ORDER BY … LIMIT` on `UNION` branches threw `42601` on every call since `9d33b94`, invisible because all three callers are scripts outside tsconfig and a mocked `db.execute` never parses SQL. It is now **executed against a real Postgres** by `respondent-contact.service.integration.test.ts` (new, 4 tests), and **RED-verified**: removing one branch's parentheses reproduces `42601 syntax error at or near "UNION"` and reds 3 of them. Also confirmed on PROD read-only — the fixed query returns a real contact by `magic_link_token` rank 2. ⚠️ Fail-safe checked: `nin-reconfirm` resolves contact at :89 and clears the NIN at :117, so it **threw BEFORE clearing** — total failure, zero harm. | The two `_ops-*` scripts have never been executed end-to-end, not even against the test DB. `apps/api/scripts/` is outside tsconfig, so per Pitfall #41 they are proven by RUNNING, not by `tsc` — and eslint is the only compile-time signal they get. The correction script's *service* path IS exercised (the integration suite drives the same service through the same transaction shape); the two `_ops-*` entry points are not. | run each with `--dry-run` against `app_test` and read the output | dev | A first prod run that errors on a path a dry run would have caught. |
| **R3** | ✅ **RULED + MEASURED at adjudication 2026-08-20 — retry is the WRONG remedy for 9 of the 12.** Awwal asked the right question ("verify they are not already in the registry so we are not sending multiple emails") and the answer reframes the row. **All 12 suppressions are `bounced`; all 12 become retry-eligible.** But: **6 carry malformed domains** (`.co` ×5, `.con` ×1) — retrying them re-bounces forever and spends reputation; they need CORRECTION, which is this story's own AC1/AC2. **2 are test accounts** (`test-awwal@`, `test_awwal@`) — exclude, never blast. **1 is the wrapped row**, which unwraps to `aqeemakolade@gmail.com`: reachable via magic link and **0 suppressions under the bare key**, exactly as the SEQUENCING block measured. **That leaves 3 genuinely retryable**, including Juliet Odiba (the `Transient/MailboxFull` false positive). ⚠️ **And 3 of the 12 are ALREADY REGISTERED with a submission** (`fatomidejumoke`, `julietiyabodeodiba`, `osegunlajide`); most of the rest hold drafts or magic links. Sending any of them "come and register" copy is the 13-49 mistake — [[pattern-batch-job-races-live-users]]. **The deploy does not need holding; the BLAST does — segment before sending.** | **Every existing bounce suppression becomes retry-eligible the moment this deploys.** Pre-13-51 rows carry `severity = NULL` (never measured) and `bounce_count = 1` (column default) and are all far older than the 72 h window, so `getSuppressedEmails` stops returning them and the next blast sends to them, once each. That is the fix firing as designed — of the five measured well-formed bounces **two were `Transient/MailboxFull` false positives**, one of them Juliet Odiba, a registered citizen never told her registration number. But it is a real change in who receives mail, it is not reversible by not-acting, and complaints/unsubscribes are correctly unaffected. | `SELECT reason, severity, bounce_count, suppressed_at FROM email_suppressions` on prod, then apply the `getSuppressedEmails` predicate | Awwal | Judged too risky for one batch → the levers are `SOFT_BOUNCE_MAX_ATTEMPTS` and `SOFT_BOUNCE_RETRY_AFTER_HOURS`, both in `lib/bounce-severity.ts` with their evidence attached. |
| **R4** | ✅ **RULED by Awwal 2026-08-20: `mail.com` was a mistyped `gmail.com`** — and the ruling is now CORROBORATED IN THE DATA, not just recalled. `fatomidejumoke@mail.com`: **sent ×2, bounced ×2** (2026-08-04). `fatomidejumoke@gmail.com`: **sent ×1, DELIVERED ×1** (2026-08-12). The test send Awwal describes happened and landed. ⚠️ **One caveat kept on the record rather than dropped:** delivery proves *that mailbox is live*, not that it belongs to her — Gmail accepts for any existing account. Combined with the double bounce and the base rate it is a strong inference, and it is Awwal's call to make. **`mail.com` is NOT struck from the client dictionary** (it is a real, live domain and the story is explicit about not outruling it); the action is to CORRECT this one stored address via AC1/AC2, since her submission still carries the typo. Task 6's dictionary unification stays parked — this ruling settles the blocking question, not the unification. | Task 6's "ONE dictionary + a parity test" is deliberately NOT done. Unifying forces the `mail.com` decision SCP §11.3 already made, and §11.6 names `typo-dictionary.json` as the reopen trigger verbatim. Left in place: **server 25 entries, client 29** — `gmaill.com`, `gmal.com`, `hotmali.com`, `mail.com` remain client-only. A parity test carrying a permitted-divergence allowlist would assert the drift rather than close it. | counted from the two files: server `domain_typos` = 25, client `EMAIL_DOMAIN_TYPOS` = 29 (re-verified by review) | Awwal | Either ruling on `mail.com`, or a live-provider entry appearing in `typo-dictionary.json` (§11.6's own trigger). |
| **R5** | ✅ **ACCEPTED** | AC2.6's prod-row migration is scoped to the two ACTIONS this story owns, not to every row spelled `'users'`. **Measured 2026-08-19, re-verified by review 2026-08-20: 26 production sites still write the plural** (mfa.controller ×12, staff.service ×7, auth.service ×4, staff-artefacts ×1, mfa-grace ×1, `_deactivate-undeliverable-admins` ×1). Migrating the rest while 26 live sites keep writing `'users'` would manufacture a THIRD state, not remove the second. | `grep -rn "targetResource: 'users'" apps/api --include=*.ts` → 26 production sites (+2 prose references) | a future audit-vocabulary story | Any of the 26 sites being re-pointed → migrate its rows in the same change. |
| **R6** | ✅ **ACCEPTED** | Severity is NOT backfilled onto the pre-13-51 rows. The raw payload was discarded at the inlet, so it is unrecoverable; the `delivered`-then-`bounced` ordering is a proxy, not the provider's classification. Those rows carry `severity = NULL`, which reads as SOFT — deliberately the fail-safe direction. The UI says "severity never measured" rather than presenting a guess as a measurement. | `SELECT count(*) FROM email_suppressions WHERE severity IS NULL` on prod | — | A provider API that can return historic bounce objects in bulk (the Email API GET does, per SCP §11.1) → a real backfill becomes possible. |
| **R7** | ✅ **ACCEPTED** | AC3.6 is a code-level guard, not a DB `CHECK` constraint — the story permitted either. `assertBareSuppressionKey` now covers **both** in-repo writers (code-review M2 closed the one-inlet gap), and `webhook.controller.ts` answers it with log + 200, never 500. **A DDL CHECK would additionally catch writes from psql and from scripts that bypass the service; that stronger form is not done here.** | `RED-VERIFY (M2)` + `RED-VERIFY (AC3.6)` in `email-events.service.test.ts` | a future story | A non-bare row appearing on prod that no application log accounts for → the write came from outside the service and only DDL can stop it. |
| **R8** | ✅ **ACCEPTED** | AC3.5's "escalate to a different CHANNEL" is **surfaced, not automated**. After `SOFT_BOUNCE_MAX_ATTEMPTS` the row shows as `given_up` with the phone number and is counted in the page header. There is no automatic SMS: 9-27 Parts B–F are blocked on Termii and explicitly out of scope. | the `given_up` banner on `/dashboard/super-admin/suppressed-contacts` | 9-27 / 13-42 AC8 | Termii unblocks → the surfaced list becomes the input to a real channel switch. |
| **R9** | ✅ **ACCEPTED** | The webhook **body** shape for `bounce.{type,subType}` is still not evidenced. SCP §11.1 captured the **Email API GET** response, not a webhook payload — no captured `email.bounced` body exists in this repo or the planning artefacts. `readBounceClassification` is therefore tolerant about WHERE the object sits and strict about the two cited field names, and every unrecognised bounce is WARN-logged. A wrong guess yields *fewer* suppressions, never more. | a rising count of `email_events.bounce_unclassified` in the API log | dev | That counter rising above ~0 on prod → the nesting is wrong; capture a real webhook body and pin it. |
| **R10** | ✅ **ACCEPTED** | The 72 h retry window rests on **two observations of one Gmail mailbox** (Juliet Odiba, 14 h twice). A shape, not a distribution — the >5× margin is doing the work, not the sample. Recorded at the constant with its own three-part reopen trigger. | `lib/bounce-severity.ts` `SOFT_BOUNCE_RETRY_AFTER_HOURS` docblock + its guard test | dev | (1) a `Transient` bounce resolving in >72 h; (2) ten or more soft bounces giving a real distribution; (3) a 72 h retry bouncing for a reason a longer wait would have cleared. |
| **R11** | ✅ **ACCEPTED** | `resolveRespondentContactEmail`'s **45-respondents-reachable-only-via-`magic_link_tokens`** figure is inherited from the function's own docblock and was NOT re-measured here — which matters more than usual now that the function is known to have thrown `42601` on every call since `9d33b94`. The measurement was a separate query, not the function, so it is probably sound; "probably" is why this is a row. | re-run the three-source count against prod | dev | The figure being used to size any future work → re-measure first. |

## Closing verdict

**Deploy SHA: `d496abf` — DEPLOYED 2026-08-20.** CI run 32407120520, all 10 jobs green, health 200.
**Status stays `review`:** R1 and R2 are operator actions and remain open. §2a0 reserves `done` for a
real deploy SHA **with every residual resolved** — the SHA is now real, the residuals are not.

### ✅ Verified on prod after deploy, by BEHAVIOUR not by SHA

| check | result |
|---|---|
| **SEQUENCING gate — did severity actually ship?** | `email_suppressions.severity` (text, nullable) and `bounce_count` (integer, NOT NULL) both present. **All 12 rows carry `severity = NULL` = "never measured", which reads as SOFT** — the fail-safe direction, exactly as R6 records. |
| **➜ therefore `--normalise-keys` is now SAFE to run** | Normalising a key is what makes the wrapped row *function*; it can no longer create a permanent exclusion, because the severity logic that governs it exists on prod. **This was the story's own hold condition and it is now met.** |
| **The canonical resolver, on the DEPLOYED build** | `resolveRespondentContactEmail(...)` → `{"email":"sotundeayobami@gmail.com","source":"magic_link_token"}`. A function that had **never succeeded once since `9d33b94`** now runs in production. `listRespondentsWithoutEmail()` → 12 rows (the phone-only cohort). |

⚠️ **Still NOT done, and deliberately so.** R1 (both backfills unrun) and R2 (the `_ops-*` entry
points never executed end-to-end) are Awwal's. The order is fixed: **R2 dry-runs against `app_test`
first** — `apps/api/scripts/` is outside tsconfig, so running them IS the proof — **then R1 on prod.**

**Hold condition:** this story stays at `review` until **R1, R2 and R3** are discharged. R1 and R2
are operator actions that cannot run from an uncommitted tree; R3 is a deliberate call about who
receives mail on the next blast and belongs to Awwal, not to a reviewer. §2a0 reserves `done` for a
real deploy SHA with every residual resolved, and three are open.

**What the review found, and what it means.** Both halves of the SEQUENCING ruling shipped together
and they meet on one key-owning function — that is the load-bearing question and the answer is yes,
verified by neutering each half and watching the blockquote's own named tests red. The severity
work, the unwrap, the service extraction and the `42601` discovery are sound; the extraction is
proven by BEHAVIOUR, not by a census (delete the refusal inside the service and the **route** test
reds, which is the story's own stated proof).

The two High findings were both in the operator surface rather than the mechanism, and both were
the same shape as the story's own thesis: **the screen built to end
[[pattern-ship-a-fix-that-never-fires]] was itself a fix that never fired.** It fetched nothing and
announced "Nobody is being silently dropped", and any error inside it hung the request and killed
the process. Neither was visible to the suite, because every test in the feature handed the table
its rows as a prop — [[pattern-test-that-passes-over-a-hole]] at the feature level rather than the
assertion level. All eleven findings are fixed on the uncommitted tree, and the four highest each
carry a RED-verify that was performed rather than described.

**Gates, re-run by the reviewer after the fixes — not read off the story:**

| gate | result |
|---|---|
| API `tsc --noEmit` | clean |
| Web `tsc --noEmit` | clean |
| API eslint + all 3 drift guards | clean (registry-read, respondent-write, story-residual) |
| Web eslint | clean |
| **Full API suite** | **4020 passed / 0 failed / 286 files** (+2 skipped files, 8 skipped tests, 1 todo — all pre-existing) |
| **Full web suite** | **2951 passed / 0 failed / 270 files** (+2 todo, pre-existing) |
| Dev's 6 RED-verifies | all 6 reproduced by hand; restores `diff -q` byte-identical |
| Review's 4 fix RED-verifies | all 4 reproduced (H1, H2, M1, M2) |
| File List vs `git status` | 0 discrepancies (was 4 — M3) |

⚠️ **Not verified here, and stated rather than implied:** every prod claim in this story (the 11
suppressions, the wrapped row, the 5 captured bounces, the 45 magic-link-only respondents, the 4
audit rows) was read from the story and the SCP. This review ran against the tree and the test
database; it did not query production.

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-06 | Raised EMERGENT from the `asirusakirat@gmail.come` prod correction | Awwal |
| 2026-08-11 | ⛔ SEQUENCING blockquote added (severity before unwrap); AC1.2 corrected — a display-name string is a THIRD bucket | Adjudication agent |
| 2026-08-11 | ➕ Send-category vocabulary has no word for an operator reply | John (PM) |
| 2026-08-12 | 🔬 Live evidence for the retry window (Juliet Odiba, measured twice) | John (PM) |
| 2026-08-16 | Premises re-measured; AC1/AC2/AC3 expanded (never renumbered); Tasks/Subtasks + Dev Notes added; flipped to `ready-for-dev` | Bob (SM) |
| 2026-08-19 | **Implemented Tasks 1–5 and 7; Task 6 PARTIAL.** Severity + unwrap land together (SEQUENCING satisfied in one change). All six fixes NEUTER-verified red then restored. | Dev agent |
| 2026-08-19 | 🔴 **Found + fixed: `resolveRespondentContactEmail` has NEVER executed** — unparenthesised `ORDER BY … LIMIT` inside a `UNION` threw `42601` on every call since `9d33b94`. Invisible to tsc; all callers are scripts outside tsconfig. | Dev agent |
| 2026-08-19 | ⛔ **Task 6's dictionary unification HELD for a ruling** — it forces the `mail.com` decision SCP §11.3 already made, and §11.6 names `typo-dictionary.json` as the reopen trigger. `gmail.come` (the founding case, in NEITHER dictionary) added to both. | Dev agent |
| 2026-08-19 | Status → `review` (NOT `done` — §2a0). Nothing committed; left uncommitted for review then adjudication. | Dev agent |
| 2026-08-20 | 🔍 **BMAD adversarial code-review — 11 findings (2H/4M/5L), ALL 11 FIXED on the uncommitted tree.** H1: the AC1 page fetched NOTHING (`initialData` + `staleTime` skips the mount fetch — measured, queryFn 0 calls) and rendered "Nobody is being silently dropped". H2: async rejections hung the request AND crashed the process (Express 4, no shim, no `unhandledRejection` handler — measured). M1: "given up — use phone" fired for everyone who unsubscribed. M2: AC3.6 guarded one of two suppression writers. M4: a dead SQL duplicate of the given-up rule. Both halves of the SEQUENCING ruling confirmed shipped and meeting on one function; all 6 dev RED-verifies reproduced by hand. | Code-review agent |
| 2026-08-20 | ## Residuals ledger + ## Closing verdict added — R1/R2/R3 OPEN (both backfills unrun; the deploy makes every old bounce suppression retry-eligible), R4 held for Awwal's `mail.com` ruling, R5–R11 ACCEPTED with a measurement, an owner and a reopen trigger each. Status HELD at `review`; Deploy SHA ⏳ PENDING. | Code-review agent |
