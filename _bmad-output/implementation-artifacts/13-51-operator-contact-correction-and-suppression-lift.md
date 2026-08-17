# Story 13.51: An operator must be able to correct a bounced contact address — traceably

Status: ready-for-dev

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

- [ ] **Task 1 — The shared correction service** (AC: #2.1, #2.5, #2.7, #2.8)
  - [ ] Extract `services/contact-correction.service.ts` from the logic now living in
        `scripts/correct-respondent-contact-email.ts:94-121` and
        `scripts/_ops-contact-remediation.ts:100-115` / `:164-173`. **Both scripts import it; neither
        keeps a copy** (13-4 AC4.6's skip-logic divergence is the named precedent).
  - [ ] Takes the `tx`, so `logActionTx` stays inside the caller's transaction — never the void
        `logAction`, which cannot be awaited from a script and loses the last row of every batch
        (13-49 R11, [[pattern-void-helper-loses-last-batch-row]]).
  - [ ] ⚠️ Update **every** contact source holding the stale address, not just `submissions` +
        `wizard_drafts` (AC2.7). `respondent-contact.service.ts:22-27` fixes the three-source
        priority; `:15-16` measures **45 respondents reachable ONLY via `magic_link_tokens`**.
  - [ ] ✅ `campaign_sends` stays untouched — send LEDGER, not a contact record.
  - [ ] Read back after the write and fail loudly on mismatch, as `_ops-contact-remediation.ts:175-180`
        already does ([[pattern-a-record-about-the-work-is-not-the-work]]).
  - [ ] **RED-verify (behaviour, NOT a census):** delete the clash refusal inside the service, assert
        the **route** test reds. If only the script's test reds, the extraction did not happen
        ([[pattern-census-counts-sites-not-callers]]).
  - [ ] **RED-verify:** correct a respondent whose only address is in `magic_link_tokens`; assert
        `resolveRespondentContactEmail()` then returns the NEW address. Reds against today's logic.
  - [ ] ⚠️ `apps/api/scripts/` is **outside tsconfig** — prove the script half by RUNNING it
        (`--dry-run` against the test DB). eslint is the only compile-time signal there.
- [ ] **Task 2 — Audit vocabulary: close the drift, then use the constants** (AC: #2.2, #2.6)
  - [ ] Add `EMAIL_SUPPRESSION_LIFTED` + `USER_EMAIL_CORRECTED` to `AUDIT_ACTIONS`
        (`audit.service.ts:63-190`; `OPERATOR_RESPONDENT_EMAIL_CORRECTED` is already there at `:157`)
        and a `USER` member to `AUDIT_TARGETS` (`:207-209` — today its only member is `RESPONDENT`).
  - [ ] Re-point `_ops-contact-remediation.ts:104/105` and `:168/169` off the raw literals.
        **SINGULAR canonical** (`'user'`), and migrate the existing prod rows off `'users'`
        ([[feedback_audit_target_unification]] — extract + migrate on literal drift).
  - [ ] ⚠️ Do **not** widen `logAction`/`logActionTx`'s `action: string` to a union here
        (`:373-381`, `:415-426`) — repo-wide retype, unbounded blast radius, different story.
  - [ ] **RED-verify:** a correction made through the UI writes an audit row whose `actorId` is the
        session user (AC2.2 — *"the script passes `actorId: null`; the UI must not"*). **Assert the
        ROW, never `toHaveBeenCalled`** — asserting the mock proves the mock (13-54 precedent).
- [ ] **Task 3 — The Super-Admin surface** (AC: #1)
  - [ ] `classifySuppressedAddress()` in `apps/api/src/lib/`, beside `canonical-email.ts` — pure,
        exported, tested, **provider-artefact branch tested FIRST** (AC1.4).
  - [ ] **RED-verify:** `'wahab akeem olaide <aqeemakolade@gmail.com>'` → `provider_artefact`,
        `'yusuffasiat@gmail.co'` → `capture_typo`. Reorder the branches and the first reds.
  - [ ] API: follow the audit-log-viewer exemplar — router-level guard
        `router.use(authenticate, authorize(UserRole.SUPER_ADMIN))`
        (`routes/audit-log-viewer.routes.ts:51`), mounted under `routes/admin.routes.ts:24`. Note the
        exemplar goes **route → service with handlers inline**; there is no controller file, and
        `requireRole` does not exist in this repo — the middleware is `authorize`.
  - [ ] Web: mirror `apps/web/src/features/audit-log/` (`api/` + `hooks/` + `components/` +
        `pages/`), routed under the existing super-admin parent
        (`App.tsx:749`, `<ProtectedRoute allowedRoles={['super_admin']}>`), lazy-imported like `:53`.
  - [ ] Join through **all three** contact sources (AC1.5); show phone (AC1.3), ladder status
        (AC1.1) and the healthy twin when one exists (AC1.7).
  - [ ] **RED-verify:** a suppressed address reachable only via `magic_link_tokens` still appears
        with its reference code; narrow the query to `submissions` and it reds.
  - [ ] Web tests run from `apps/web` (`cd apps/web && pnpm vitest run`) — **never** `pnpm vitest run`
        from the repo root.
- [ ] **Task 4 — ⛔ BOUNCE SEVERITY + THE RETRY WINDOW. MUST LAND BEFORE (OR WITH) TASK 5.** (AC: #3.4, #3.5)
  - [ ] ⚠️ **Capture a REAL Resend bounce payload and cite it before coding the field name.** Nothing
        in this repo stores one: `webhook.controller.ts:51` passes the payload to `parseResendEvent`
        and discards it, and `ParsedResendEvent` (`email-events.service.ts:21-27`) keeps five fields,
        none of them the bounce sub-object. A guessed field name yields a permanently `undefined`
        severity that fails OPEN into "suppress everything".
  - [ ] Schema: add severity to `email_suppressions` (and carry it on `email_events`). `reason`
        itself needs no DDL — `email-suppressions.ts:13-14` says the tuple widens without a
        migration — but **a new column does**. `db:push:force` in CI; back it up first
        ([[feedback_db_push_force]]).
  - [ ] Only a **hard** bounce suppresses permanently. **Unknown severity ⇒ treat as SOFT** — the one
        place in this story where the safe default is fewer suppressions.
  - [ ] Time-based automatic retry with a **stated margin over the measured 14 h** (72 h proposed).
        Record it as a **measured assumption with a reopen trigger**, in a comment at the constant —
        two observations of one Gmail mailbox is a shape, not a distribution (12-7's `+1` lesson).
  - [ ] Cap retries, then escalate to **phone**, not to a longer wait. Same mechanism as 13-42 AC8.
  - [ ] ⛔ Do **not** backfill a severity onto the existing 13 rows. It is unrecoverable; the
        `delivered`-then-`bounced` ordering is a proxy, not the provider's classification.
  - [ ] **RED-verify:** a soft bounce does not produce a permanent suppression *(this is the
        blockquote's own wording)*. And: a soft suppression inside the window stays excluded, the
        same row past the window is retried once — remove the window check and the second reds.
- [ ] **Task 5 — ⛔ THE UNWRAP. DO NOT START THIS BEFORE TASK 4 IS GREEN.** (AC: #3.3, #3.6)
  - [ ] ⛔ **Gate check, in writing, before the first line:** is Task 4's severity work merged or in
        this same commit? If no — **STOP.** Landing this alone converts an inert row into a working
        permanent exclusion of a registered citizen (`aqeemakolade@gmail.com`) on one soft bounce.
        *"If only one can ship, ship NEITHER."*
  - [ ] Teach `toCanonicalEmail` (`lib/canonical-email.ts:12-14`) to unwrap `Name <addr>`.
        ⚠️ It is **also the unsubscribe-token signing key** (`:2-6`, *"these two MUST agree
        byte-for-byte"*) — re-verify the token round-trip in the same pass.
  - [ ] Route the webhook inlet through it: `email-events.service.ts:48` does its own
        `trim().toLowerCase()` and `:100` stores it, while `:112` and `:122` already canonicalise.
        **One function owns the key** ([[feedback_canonical_primitive_backlog_sweep]]).
  - [ ] Backfill the one wrapped `email_suppressions` row via `_ops-contact-remediation.ts`, and the
        matching `email_events` rows (`email-events.ts:29` stores the same raw recipient).
  - [ ] AC3.6 guard — CHECK constraint or table lint, so the next non-bare value fails loudly rather
        than sitting inert for months. The 8% is the **provider's** property and can change without
        notice, so the guard outranks the one-row backfill.
  - [ ] ⚠️ Make the rejection path **log and 200**, not 500 — `webhook.controller.ts:57-60` currently
        500s on any throw from `recordEmailEvent`, which Resend answers with retries.
  - [ ] **RED-verify:** store `'A B <x@y.com>'`, assert `getSuppressedEmails(['x@y.com'])` returns it
        *(the blockquote's own wording)*. Home: `services/__tests__/email-events.service.test.ts` —
        real-DB, owns the `@ee.test` keyspace (`:12-13`), already covers bounce→suppression (`:96-101`).
- [ ] **Task 6 — Stop manufacturing the typos at capture** (AC: #3.1, #3.2)
  - [ ] **ONE dictionary + a parity test.** Server 24 entries
        (`lib/normalise/typo-dictionary.json`), client 28 (`email-typo-dictionary.ts:14-43`), already
        drifted by four (`gmaill.com`, `gmal.com`, `hotmali.com`, `mail.com`). The client file's own
        comment says *"flag if drift becomes a recurring problem"* — this is that flag.
  - [ ] ⛔ **Add `gmail.come`. It is in NEITHER dictionary** — the founding case of this story would
        not be caught by the surface AC3.1 says to copy.
  - [ ] Reuse `EmailTypoDetection.tsx` + `suggestCorrectedEmail` (`email-typo-dictionary.ts:52-62`)
        on the staff surfaces — post-blur, one-tap accept, **never a silent rewrite**. It is already
        wired on the public wizard at `Step2ContactLga.tsx:208-213`. **Reuse, do not rebuild.**
  - [ ] AC3.1 lands in the **dynamic form renderer**, not as a copied regex: `formSchema.ts`
        `checkRule()` has no email case and `QuestionRenderer.tsx:29-44` has no email question type.
        `wizard-provided-field-names.ts:43` names the carrier questions (`email`, `email_address`).
  - [ ] ⚠️ `mail.com` is a REAL domain and AC1.2 and SCP §10.10 disagree about
        `fatomidejumoke@mail.com` (see AC3's callout item 6). Whatever the dictionary says, the
        citizen confirms — **never auto-correct a citizen's contact details without showing them.**
  - [ ] **RED-verify:** a staff capture of `…@gmail.come` surfaces a suggestion. ⚠️ **Do not write a
        format-validation test and call this covered** — `z.string().email()` ACCEPTS all four bare
        typos (measured; see AC3's callout item 1). A green format test here is
        [[pattern-test-that-passes-over-a-hole]] in its purest form.
- [ ] **Task 7 — The send-category vocabulary** (AC: ➕ ADDED §1, §2)
  - [ ] Add `operator-reply` to `NotificationCategory` (`notification-category.ts:15-32`) and a rule
        to `classifyEmailSubject` (`:40-58`), ordered with the other specifics.
  - [ ] Have `_ops-send-registration-number-reply.ts:228` pass `category` **explicitly** — the
        override already exists (`notification-meter.service.ts:184`, resolved at `:186`); the word
        did not. A script matching its own subject line breaks when someone edits the copy.
  - [ ] Make the `'other'` fallback (`notification-category.ts:57`) **observable** — a WARN naming the
        unmatched subject and/or an `other` line in the digest. ⚠️ **Never throw**: a classifier that
        can fail a send lets a taxonomy gap block a citizen's email.
  - [ ] **RED-verify:** the reply subject
        (`_ops-send-registration-number-reply.ts:196`) classifies as `operator-reply`, not `other`.
        Today it falls through all 17 matchers to `'other'` — confirmed by reading the cascade.

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

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-06 | Raised EMERGENT from the `asirusakirat@gmail.come` prod correction | Awwal |
| 2026-08-11 | ⛔ SEQUENCING blockquote added (severity before unwrap); AC1.2 corrected — a display-name string is a THIRD bucket | Adjudication agent |
| 2026-08-11 | ➕ Send-category vocabulary has no word for an operator reply | John (PM) |
| 2026-08-12 | 🔬 Live evidence for the retry window (Juliet Odiba, measured twice) | John (PM) |
| 2026-08-16 | Premises re-measured; AC1/AC2/AC3 expanded (never renumbered); Tasks/Subtasks + Dev Notes added; flipped to `ready-for-dev` | Bob (SM) |
