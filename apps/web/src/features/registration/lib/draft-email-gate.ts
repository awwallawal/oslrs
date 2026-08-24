import { suggestCorrectedEmail } from './email-typo-dictionary';

/**
 * Story 13-50 AC4 — A HALF-TYPED EMAIL MUST NOT BECOME A PERSON.
 *
 * `wizard_drafts` is keyed on `email` and the wizard autosaves on a 2s debounce. Pause for two
 * seconds mid-address and the partial gets its own row — and because the key IS the email, that
 * row is not bad data in a field, it is **a person who never existed**.
 *
 * Measured on 2026-08-06, from four bounces inside 100 seconds (four people do not independently
 * mistype `.com`):
 *
 *     yusuffasiat@gmail.co          dayoariremako88@gmail.co
 *     ogunbonadamola@gmail.co       aladechristianahtosin@gmail.co
 *
 * All four were invited in D4 — mail sent to addresses that cannot receive it — and all four
 * belong to people who were ALREADY in the register. The D4 denominator is 71 real invitees, not
 * 75.
 *
 * ⚠️ WHY STEP 2's VALIDATION IS NOT ENOUGH ON ITS OWN. The story's preferred fix was "only key a
 * draft once the address passes the same validation Step 2 already applies at Continue". That
 * validation is {@link WIZARD_EMAIL_PATTERN}, and it **accepts every one of the four phantoms** —
 * `a@gmail.co` is a perfectly well-formed address. Shipping the pattern check alone would have
 * been a fix that never fires against the case that produced the story.
 *
 * So the gate is the pattern PLUS the typo dictionary the wizard already consults: if we are
 * about to show this person "Did you mean …@gmail.com?", we already believe the address is wrong,
 * and writing a row keyed on an address we believe is wrong is exactly how a phantom is made.
 *
 * ⚠️ AND WHY THAT IS SCOPED TO THE UNCOMMITTED CASE. `mail.com` is in the typo dictionary (it maps
 * to `gmail.com`) and is ALSO a real provider. Blocking it outright would silently deny a genuine
 * `mail.com` registrant any draft at all — trading a phantom-person bug for a lost-real-person
 * bug. Once the registrant has advanced past Step 2 they have seen the suggestion and declined
 * it; that is a committed address and we honour it.
 */

/**
 * The email shape Step 2 enforces at Continue.
 *
 * ⚠️ EXPORTED AND IMPORTED, NOT COPIED. `Step2ContactLga` reads this same constant, so "the
 * validation Step 2 applies" and "the validation the draft gate applies" cannot drift into two
 * different rules — which is the whole reason the story asked for the *same* validation.
 */
export const WIZARD_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A TLD that is one character long does not exist — the shortest real ones are two
 * (`.co`, `.ng`, `.uk`). So `a@gmail.c` is not a rare address, it is a person **mid-keystroke**.
 *
 * ⚠️ THIS IS THE PART THE TYPO DICTIONARY CANNOT DO. The dictionary is a fixed list of observed
 * typos; typing produces arbitrary prefixes, and `gmail.c` is simply not on the list (`gmail.co`,
 * `gmail.cm` and `gmail.com`'s other neighbours are). A dictionary catches the typos we have
 * already seen; this catches the ones we have not — which is the whole population of "still
 * typing".
 *
 * Deliberately applied ONLY to draft persistence, not to Step 2's own validation: refusing to
 * autosave is invisible to the registrant, whereas refusing to submit is a new way to block a
 * real person over a rule nobody has reviewed for the field.
 */
const MIN_TLD_LENGTH = 2;

export interface DraftEmailGateContext {
  /**
   * True once the registrant has advanced PAST Step 2, i.e. committed the address through
   * `handleContinue` having seen any typo suggestion. Before that the address is still being
   * typed and a known-typo domain is treated as unfinished rather than chosen.
   */
  emailCommitted: boolean;
}

/**
 * Should a server-side draft row be written under this address?
 *
 * Returning false does NOT block registration — it only withholds the autosaved draft until the
 * address looks finished. The user's in-memory form state is untouched.
 */
export function isDraftPersistableEmail(
  email: string | undefined,
  { emailCommitted }: DraftEmailGateContext,
): boolean {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return false;
  if (!WIZARD_EMAIL_PATTERN.test(trimmed)) return false;

  // Structural: a one-character TLD is somebody mid-keystroke, not an address.
  const domain = trimmed.slice(trimmed.lastIndexOf('@') + 1);
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (tld.length < MIN_TLD_LENGTH) return false;

  // A domain the wizard would offer to correct is not a finished address — until the registrant
  // says otherwise by moving on.
  if (!emailCommitted && suggestCorrectedEmail(trimmed) !== null) return false;
  return true;
}
