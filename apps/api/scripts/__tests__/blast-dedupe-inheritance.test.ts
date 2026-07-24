import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Story 13-24 (AC3b) — the ANTI-FRAGMENTATION guard.
 *
 * The double-send gap was not caused by anyone forgetting dedupe *once*; it was caused by three
 * blast scripts each re-deriving their own cohort, so a rule added to one never reached the others.
 * The fix is only durable if the next script inherits it too — so this test asserts the SHAPE, not
 * just the behaviour: every marketing cohort builder must reach its send list through the shared
 * `filterMarketingCohort`, and none may hand-roll a bare `getSuppressedEmails` cohort filter (which
 * would silently give you suppression WITHOUT the contact gap — the exact half-fix this story
 * replaces).
 *
 * If you are adding a new blast and this test fails: don't add your script to an allowlist here —
 * call `filterMarketingCohort` and you get suppression + dedupe together, for free.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '..');

/** Every operator script that builds a MARKETING send cohort. */
const MARKETING_COHORT_SCRIPTS = [
  '_reengagement-email-blast.ts',
  '_cohort-a-supplemental-survey-blast.ts',
  '_thankyou-referral-blast.ts',
  '_backfill-registration-autosends.ts',
];

/**
 * Scripts allowed to call `getSuppressedEmails` directly because they are NOT building a send
 * cohort: the 13-9 webhook end-to-end verifier asserts on the suppression read itself.
 */
const DIRECT_SUPPRESSION_ALLOWLIST = new Set(['_verify-13-9-webhook-e2e.ts']);

/**
 * Story 13-24 (review M3) — the MARKETING category literals a send passes to `EmailService`. Any
 * script that references one is, by construction, firing a marketing send and therefore MUST route
 * its cohort through `filterMarketingCohort` (below). This closes the guard's original blind spot:
 * the `getSuppressedEmails` check only caught the OLD half-fix pattern, so a brand-new blast that
 * forgot dedupe ENTIRELY (called neither helper) slipped through. Keying on the category literal
 * catches "sends marketing mail but never deduped" directly.
 */
const MARKETING_CATEGORY_LITERALS = ['reengagement-blast', 'supplemental-survey', 'thankyou-referral'];

/**
 * Scripts that reference a marketing category literal but do NOT build a send cohort — so they are
 * exempt from the "must inherit filterMarketingCohort" rule. `_diagnose-email-usage.ts` is the
 * read-only classifier diagnostic (it enumerates every category to bucket historical sends).
 */
const NON_COHORT_MARKETING_ALLOWLIST = new Set(['_diagnose-email-usage.ts']);

function read(file: string): string {
  return fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
}

/** Comments explaining the OLD pattern are fine; only real code counts as an offence. */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('13-24 AC3b — the contact dedupe is INHERITED, not re-implemented per script', () => {
  it.each(MARKETING_COHORT_SCRIPTS)('%s routes its cohort through filterMarketingCohort', (file) => {
    expect(code(file)).toContain('filterMarketingCohort');
  });

  it('no operator script hand-rolls a bare getSuppressedEmails cohort filter', () => {
    const offenders = fs
      .readdirSync(SCRIPTS_DIR)
      .filter((f) => f.endsWith('.ts') && !DIRECT_SUPPRESSION_ALLOWLIST.has(f))
      .filter((f) => code(f).includes('getSuppressedEmails'));

    expect(offenders).toEqual([]);
  });

  it('every script that fires a MARKETING send inherits filterMarketingCohort (M3 — no forgotten dedupe)', () => {
    // Discovery-based (not a hardcoded list): find every script that passes a marketing category
    // literal to a send, then assert it routes through the shared filter. A NEW blast that forgot
    // dedupe entirely — the exact fragmentation this story cures — fails HERE.
    const sendsMarketing = (c: string) =>
      MARKETING_CATEGORY_LITERALS.some((cat) => c.includes(`'${cat}'`) || c.includes(`"${cat}"`));

    const offenders = fs
      .readdirSync(SCRIPTS_DIR)
      .filter((f) => f.endsWith('.ts') && !NON_COHORT_MARKETING_ALLOWLIST.has(f))
      .filter((f) => {
        const c = code(f);
        return sendsMarketing(c) && !c.includes('filterMarketingCohort');
      });

    expect(offenders).toEqual([]);
  });

  it('the gap lives in code as a named constant, not as a magic number in each script', () => {
    const service = fs.readFileSync(
      path.resolve(SCRIPTS_DIR, '../src/services/campaign-contact.service.ts'),
      'utf8',
    );
    expect(service).toMatch(/export const MARKETING_CONTACT_GAP_DAYS = 5;/);
  });
});
