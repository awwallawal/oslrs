import { describe, it, expect } from 'vitest';
import {
  MARKETPLACE_EXPERIENCE_LEVELS,
  MARKETPLACE_BUSINESS_NAME_MAX_LEN,
  experienceStatFor,
  experienceLabelFor,
  normaliseMarketplaceExperienceLevel,
  normaliseBusinessName,
} from '../marketplace.js';

/**
 * Story 13-38 [AI-Review][Low] 2026-08-18 (re-review).
 *
 * These three functions are the single source of truth the extraction worker, the
 * 13-38 card backfill and the marketplace card all read — and until this file they
 * had NO direct test anywhere in the repo (a grep for their names across
 * `**\/*.test.*` returned zero hits). They were exercised only incidentally,
 * through consumers that mock the layer around them, so a change to a bucket edge
 * could pass every suite while silently re-labelling live cards.
 *
 * `packages/types` also had vitest as a devDependency and six test files but no
 * `test` script, so `pnpm test` never ran ANY of them. That script now exists.
 */

describe('normaliseMarketplaceExperienceLevel — Story 13-38 AC7', () => {
  it('accepts the five canonical questionnaire values verbatim', () => {
    for (const level of MARKETPLACE_EXPERIENCE_LEVELS) {
      expect(normaliseMarketplaceExperienceLevel(level)).toBe(level);
    }
  });

  it('accepts the questionnaire labels, including en-dash variants', () => {
    expect(normaliseMarketplaceExperienceLevel('Less than 1 year')).toBe('less_1');
    expect(normaliseMarketplaceExperienceLevel('1-3 years')).toBe('1_3');
    expect(normaliseMarketplaceExperienceLevel('1–3 years')).toBe('1_3');
    expect(normaliseMarketplaceExperienceLevel('4–6 years')).toBe('4_6');
    expect(normaliseMarketplaceExperienceLevel('7–10 years')).toBe('7_10');
    expect(normaliseMarketplaceExperienceLevel('Over 10 years')).toBe('over_10');
  });

  it('REJECTS the old canon rather than laundering a guess into a bucket', () => {
    // These were all accepted by the pre-13-38 worker. Re-bucketing them would
    // turn a guess into a canonical claim; the callers keep the stored value.
    for (const legacy of [
      'senior', 'expert', 'junior', 'mid', 'intermediate',
      'over 15', '1 to 3', '4 to 7', '8 to 15', '15+', '8-15', '4-7', 'entry',
    ]) {
      expect(normaliseMarketplaceExperienceLevel(legacy)).toBeNull();
    }
  });

  it('returns null for absent, blank and unmappable free text', () => {
    expect(normaliseMarketplaceExperienceLevel(null)).toBeNull();
    expect(normaliseMarketplaceExperienceLevel(undefined)).toBeNull();
    expect(normaliseMarketplaceExperienceLevel('')).toBeNull();
    expect(normaliseMarketplaceExperienceLevel('   ')).toBeNull();
    expect(normaliseMarketplaceExperienceLevel('quite a while')).toBeNull();
  });

  it('places a bare year count on the questionnaire bucket edges', () => {
    expect(normaliseMarketplaceExperienceLevel('0')).toBe('less_1');
    expect(normaliseMarketplaceExperienceLevel('1')).toBe('1_3');
    expect(normaliseMarketplaceExperienceLevel('3')).toBe('1_3');
    expect(normaliseMarketplaceExperienceLevel('4')).toBe('4_6');
    expect(normaliseMarketplaceExperienceLevel('6')).toBe('4_6');
    expect(normaliseMarketplaceExperienceLevel('7')).toBe('7_10');
    expect(normaliseMarketplaceExperienceLevel('10')).toBe('7_10');
    expect(normaliseMarketplaceExperienceLevel('11')).toBe('over_10');
    expect(normaliseMarketplaceExperienceLevel(5)).toBe('4_6');
  });

  it('rounds a between-buckets answer DOWN, never up (never over-claims)', () => {
    // The buckets are 1-3, 4-6, 7-10, so 3<y<4 and 6<y<7 fall in a gap. Rounding
    // up would print "4–6 yrs" on the card of someone with three and a half years.
    expect(normaliseMarketplaceExperienceLevel('3.5')).toBe('1_3');
    expect(normaliseMarketplaceExperienceLevel('3.9')).toBe('1_3');
    expect(normaliseMarketplaceExperienceLevel('6.5')).toBe('4_6');
    expect(normaliseMarketplaceExperienceLevel('6.99')).toBe('4_6');
    expect(normaliseMarketplaceExperienceLevel('0.5')).toBe('less_1');
  });
});

describe('experienceStatFor / experienceLabelFor — Story 13-38 AC7', () => {
  it('marks ONLY the top bucket as seasoned', () => {
    const seasoned = MARKETPLACE_EXPERIENCE_LEVELS.filter(
      (l) => experienceStatFor(l)?.seasoned === true,
    );
    expect(seasoned).toEqual(['over_10']);
  });

  it('never prints an exact year count for the top bucket', () => {
    const stat = experienceStatFor('over_10')!;
    // The questionnaire's ceiling is "Over 10 years" — any precise number here
    // would be invented data.
    expect(stat.value).toBe('Over 10');
    expect(stat.value).not.toMatch(/^\d+$/);
  });

  it('still renders legacy pre-13-38 stored values, so un-backfilled cards stay honest', () => {
    expect(experienceStatFor('4-7')?.value).toBe('4–7');
    expect(experienceStatFor('8-15')?.value).toBe('8–15');
    expect(experienceStatFor('15+')?.seasoned).toBe(true);
    expect(experienceStatFor('entry')?.value).toBe('Under 1');
  });

  it('returns null for absent or unrecognised values so the caller omits the block', () => {
    expect(experienceStatFor(null)).toBeNull();
    expect(experienceStatFor(undefined)).toBeNull();
    expect(experienceStatFor('')).toBeNull();
    expect(experienceStatFor('not_a_bucket')).toBeNull();
    expect(experienceLabelFor('not_a_bucket')).toBeNull();
  });

  it('derives the label from the SAME table as the stat — never a second vocabulary', () => {
    for (const level of [...MARKETPLACE_EXPERIENCE_LEVELS, '4-7', '15+']) {
      const stat = experienceStatFor(level);
      expect(experienceLabelFor(level)).toBe(stat ? `${stat.value} ${stat.unit}` : null);
    }
  });
});

describe('normaliseBusinessName — Story 13-38 AC8', () => {
  it('trims, and treats blank as absent', () => {
    expect(normaliseBusinessName('  Bola Motors  ')).toBe('Bola Motors');
    expect(normaliseBusinessName('   ')).toBeNull();
    expect(normaliseBusinessName('')).toBeNull();
  });

  it('caps at the storage limit (AC8.3)', () => {
    const long = 'A'.repeat(MARKETPLACE_BUSINESS_NAME_MAX_LEN + 40);
    expect(normaliseBusinessName(long)).toHaveLength(MARKETPLACE_BUSINESS_NAME_MAX_LEN);
  });

  it('returns null for every non-string input rather than coercing', () => {
    // AC8.2's guarantee is structural: there is ONE source key and no fallback,
    // so anything that is not a string answer yields no business name at all.
    for (const input of [null, undefined, 42, {}, [], true, { firstname: 'Adekemi' }]) {
      expect(normaliseBusinessName(input)).toBeNull();
    }
  });
});
