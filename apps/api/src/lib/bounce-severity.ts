/**
 * Story 13-51 (AC3.4 / AC3.5) — read the provider's bounce classification, and decide how long a
 * retryable failure is held.
 *
 * ⛔ THIS FILE IS THE GATE ON THE UNWRAP (AC3.3). Read the SEQUENCING blockquote on the story
 * before touching either. Two defects were cancelling each other out on production: nothing
 * recorded bounce severity and nothing ever lifted a suppression, while separately the
 * suppression key could never match the address it was meant to block. Fixing the second alone
 * converts an inert row into a working, permanent exclusion of a registered citizen on the
 * strength of one SOFT bounce. This half must land first, or with it.
 *
 * WHERE THE FIELD NAMES COME FROM — CITED, NOT GUESSED
 * ----------------------------------------------------
 * Nothing in this repo stored a bounce payload, so the shape below is taken from a REAL capture:
 * portfolio-triage SCP §11.1, `GET https://api.resend.com/emails/{message_id}`, run against five
 * live message ids on 2026-08-11. It returns a `bounce` object carrying:
 *
 *   | address                        | type        | subType     | diagnostic                     |
 *   |--------------------------------|-------------|-------------|--------------------------------|
 *   | julietiyabodeodiba@gmail.com   | Transient   | MailboxFull | 452-4.2.2 out of storage       |
 *   | ibitolayetunde@gmail.com       | Transient   | MailboxFull | 452-4.2.2 out of storage       |
 *   | fatomidejumoke@mail.com        | Permanent   | General     | 550 mailbox unavailable        |
 *   | jambestojeke@gmail.com         | Permanent   | General     | 550-5.1.1 account does not exist |
 *   | ola4ct@outlook.com             | Permanent   | General     | 550 5.5.0 mailbox unavailable  |
 *
 * ⚠️ THE REMAINING UNCERTAINTY, STATED RATHER THAN PAPERED OVER: that capture is the **Email API
 * GET** response. The webhook payload is a different surface, and no captured `email.bounced`
 * webhook body exists anywhere in this repo or the planning artefacts. The reader below is
 * therefore deliberately tolerant about WHERE the object sits (`data.bounce`, `data`, or the
 * envelope) while being strict about the two field names, which are the cited part — and every
 * bounce that yields no recognisable classification is LOGGED, so a wrong guess shows up as a
 * rising counter instead of a silent `undefined`. See `reopen trigger` at the bottom.
 */

/** The provider's own words, unmapped. Stored on `email_events` for forensics. */
export interface ProviderBounceClassification {
  type: string | null;
  subType: string | null;
}

export type BounceSeverity = 'hard' | 'soft';

/**
 * ⏱️ HOW LONG A RETRYABLE BOUNCE IS HELD BEFORE ONE MORE ATTEMPT.
 *
 * ⚠️ THIS IS A MEASURED ASSUMPTION, NOT A CONSTANT SOMEONE PICKED. Read the margin before
 * changing it.
 *
 * MEASUREMENT (Juliet Odiba, `OSL-2026-51CNVZ`, prod, twice):
 *   - sent 2026-08-04 09:11 → bounced 2026-08-04 23:11 — **14 h**, `Transient/MailboxFull`,
 *     "message expired: unable to deliver in 840 minutes"
 *   - suppression lifted 2026-08-11 on the provider's classification alone
 *   - sent 2026-08-11 16:29 → bounced 2026-08-12 06:29 — **14 h** again, auto-re-suppressed
 *
 * So a transient bounce takes ~14 h to RESOLVE, not seconds; any check that waits 90 seconds and
 * reports "no event" is structurally unable to see one. 72 h is a **>5x margin** over the only
 * two observations we have.
 *
 * ⚠️ WHAT THIS DOES NOT SETTLE: whether 14 h is typical, or particular to Gmail's over-quota
 * behaviour. **Two observations of one mailbox is a shape, not a distribution.** The margin is
 * doing the work here, not the sample.
 *
 * 🔁 REOPEN TRIGGER — revisit this number if any of these fire:
 *   1. a `Transient` bounce is observed resolving in more than 72 h (the margin was too small);
 *   2. ten or more soft bounces accumulate, giving an actual distribution to replace this shape;
 *   3. a retry sent at 72 h bounces for a reason that a longer wait would have cleared.
 * (The `+1` lesson from 12-7: a number without a stated basis becomes a number nobody can defend.)
 */
export const SOFT_BOUNCE_RETRY_AFTER_HOURS = 72;

/**
 * 📞 HOW MANY BOUNCES BEFORE EMAIL IS GIVEN UP ON — and the answer becomes a different CHANNEL.
 *
 * 2 observed bounces = one original + exactly one retry. Juliet is the worked example of why this
 * is not 3 or 5: her mailbox was still full seven days after the first bounce, so the second
 * attempt bought one more bounce and one more mark against a sending domain the whole blast
 * programme depends on. **A LIFT IS NOT A FIX.** After this cap the person is not "unreachable" —
 * they are unreachable BY EMAIL, and they surface on the operator list with their phone number
 * (AC1.3), which is the same mechanism 13-42 AC8 asks for from the other end.
 */
export const SOFT_BOUNCE_MAX_ATTEMPTS = 2;

/**
 * Pull the provider's bounce object out of a webhook payload.
 *
 * Tolerant about location (see the header note — the webhook body shape is the part that is not
 * evidenced), strict about the field names `type` / `subType`, which are.
 */
export function readBounceClassification(payload: unknown): ProviderBounceClassification {
  const p = asRecord(payload);
  const data = asRecord(p.data);
  // Most-specific first: the documented nesting, then the two fallbacks a different envelope
  // could plausibly use. An empty result is a real answer and is treated as unknown → soft.
  const candidates = [asRecord(data.bounce), asRecord(p.bounce), data];
  for (const c of candidates) {
    const type = pick(c, 'type', 'bounce_type', 'bounceType');
    const subType = pick(c, 'subType', 'sub_type', 'bounce_sub_type', 'bounceSubType');
    if (type || subType) return { type: type || null, subType: subType || null };
  }
  return { type: null, subType: null };
}

/**
 * Map the provider's classification to the only distinction the send path needs.
 *
 * ⚠️ FAIL SAFE = SOFT. An unrecognised, absent or misspelled `type` must NOT permanently exclude
 * a citizen. Getting this backwards is the failure mode the whole story exists to leave: 13 rows
 * on prod, every one of them a permanent exclusion nothing could ever undo, two of the five
 * measured ones demonstrably alive.
 */
export function classifyBounceSeverity(bounce: ProviderBounceClassification): BounceSeverity {
  return bounce.type?.trim().toLowerCase() === 'permanent' ? 'hard' : 'soft';
}

/**
 * Story 13-51 (code-review M1/M4) — WHERE A SUPPRESSED ADDRESS STANDS, IN ONE PLACE.
 *
 * ⛔ THERE WAS A SECOND, DIVERGENT COPY OF THIS RULE AND IT SAID THE WRONG THING.
 * `suppressed-contacts.service.ts` computed `emailGivenUp = reason !== 'bounced' || …`, which is
 * a correct reading of "not retry-eligible" and a WRONG reading of what the screen then claimed:
 * the table rendered it as **"given up — use phone"** and the page header counted those rows into
 * "N given up on by email but have a phone number". So every `unsubscribed` and `complained` row —
 * a person who explicitly asked us to stop — was presented to an operator as somebody to go and
 * ring. The predicate selected "will not be retried"; the sentence above it claimed "email is
 * exhausted, escalate the channel". Those are not the same set, and the difference is exactly the
 * people it is least defensible to contact.
 *
 * Meanwhile `email-events.service.ts` carried a THIRD encoding of the same idea in SQL
 * (`listEmailGivenUpOn`) that nothing ever called. Three spellings, one of them wrong, one of them
 * dead. This is now the only one.
 *
 * ⚠️ `opted_out` IS NOT `given_up`. A bounce means the mailbox failed us; an unsubscribe or a
 * complaint means the PERSON did. The first is a reason to try another channel. The second is a
 * reason to stop.
 */
export type EmailContactState =
  /** A soft bounce still inside its hold window — it will be retried automatically. */
  | 'holding'
  /** Email is exhausted for this address: a hard bounce, or a soft one that used its retry. */
  | 'given_up'
  /** The person asked us to stop. NEVER retried, and never a prompt to phone them. */
  | 'opted_out';

export interface SuppressionStateInput {
  reason: string;
  severity: string | null;
  bounceCount: number;
}

export function classifyEmailState(row: SuppressionStateInput): EmailContactState {
  // ORDER IS LOAD-BEARING, as in `classifySuppressedAddress`. The stated-wish test runs FIRST,
  // because an unsubscribed row also satisfies "not retry-eligible" and a rule ordered the other
  // way folds it straight back into the bucket that says "go and phone them".
  if (row.reason !== 'bounced') return 'opted_out';
  if ((row.severity ?? 'soft') === 'hard') return 'given_up';
  if (row.bounceCount >= SOFT_BOUNCE_MAX_ATTEMPTS) return 'given_up';
  return 'holding';
}

/** True when the classification carried nothing we recognise — the case worth logging. */
export function isUnclassifiedBounce(bounce: ProviderBounceClassification): boolean {
  const t = bounce.type?.trim().toLowerCase();
  return t !== 'permanent' && t !== 'transient';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function pick(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}
