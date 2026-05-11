/**
 * Email-domain typo dictionary used by `EmailTypoDetection` (Story 9-12 AC#5).
 *
 * Local copy of `apps/api/src/lib/normalise/typo-dictionary.json` (Story
 * prep-input-sanitisation-layer). The backend is the canonical source for
 * server-side normalisation; this file mirrors it so the wizard can offer a
 * client-side correction suggestion BEFORE the form ever leaves the device.
 *
 * Keep in sync: any new entry on the backend dictionary should be added here
 * too. Frequency of change is low (entries come from real-world field-survey
 * observations); no build-time sync infrastructure needed yet — flag if drift
 * becomes a recurring problem.
 */
export const EMAIL_DOMAIN_TYPOS: Record<string, string> = {
  'gmail.vom': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmsil.com': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.vom': 'yahoo.com',
  'yahho.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotnail.com': 'hotmail.com',
  'hotmali.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloook.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlook.cm': 'outlook.com',
  'mail.com': 'gmail.com',
};

/**
 * Returns the canonical domain when the supplied email's domain matches a
 * known typo. Returns null when the domain is empty, malformed, or unknown.
 *
 * Local-side parsing is deliberately lenient — it never blocks submission,
 * only OFFERS a correction; the backend re-runs the canonical normalisation.
 */
export function suggestCorrectedEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex < 1 || atIndex === trimmed.length - 1) return null;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const corrected = EMAIL_DOMAIN_TYPOS[domain];
  if (!corrected) return null;
  return `${local}@${corrected}`;
}
