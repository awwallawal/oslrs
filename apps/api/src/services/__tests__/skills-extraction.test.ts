import { describe, it, expect } from 'vitest';
import {
  SKILL_TAXONOMY,
  SKILL_SLUGS,
  SKILL_SECTOR_BY_SLUG,
  SKILL_SECTORS,
  OTHER_SKILL_SECTOR,
  skillSectorForSlug,
} from '@oslsr/types';
import { extractSelectMultipleValues } from '../../lib/skills-extraction.js';

/**
 * Story 13-22 RUNNING guard. The old parity test lived in `packages/types`,
 * which has NO `test` script → it never ran under `pnpm test`, which is exactly
 * how the sector-map drift (90/150 slugs → 'Other') shipped. These guards live
 * in apps/api so they run in CI, and pin BOTH the derived sector map and the
 * shared JSONB-array extractor so neither can silently drift again.
 */

describe('SKILL_SECTOR_BY_SLUG — derived from the canonical taxonomy (AC1)', () => {
  it('has exactly one sector for every canonical slug (150) and no extra keys', () => {
    expect(Object.keys(SKILL_SECTOR_BY_SLUG).sort()).toEqual([...SKILL_SLUGS].sort());
  });

  it('every canonical slug resolves to a non-Other sector (the 90-Other bug is gone)', () => {
    for (const { name, sector } of SKILL_TAXONOMY) {
      expect(skillSectorForSlug(name)).toBe(sector);
      expect(skillSectorForSlug(name)).not.toBe(OTHER_SKILL_SECTOR);
    }
  });

  it('the sector map has ZERO non-canonical keys (no phantom vocabulary)', () => {
    const canonical = new Set<string>(SKILL_SLUGS);
    for (const key of Object.keys(SKILL_SECTOR_BY_SLUG)) {
      expect(canonical.has(key)).toBe(true);
    }
  });

  it('SKILL_SECTORS is the 20 unique Appendix-C sectors', () => {
    expect(SKILL_SECTORS).toHaveLength(20);
    expect(new Set(SKILL_SECTORS).size).toBe(20);
    // Every mapped sector is one of the declared sector names.
    const sectorSet = new Set(SKILL_SECTORS);
    for (const sector of Object.values(SKILL_SECTOR_BY_SLUG)) {
      expect(sectorSet.has(sector)).toBe(true);
    }
  });

  it('custom_* and unknown values bucket under OTHER_SKILL_SECTOR (never dropped) (AC3)', () => {
    expect(skillSectorForSlug('custom_realtor')).toBe(OTHER_SKILL_SECTOR);
    expect(skillSectorForSlug('custom_lecturer')).toBe(OTHER_SKILL_SECTOR);
    expect(skillSectorForSlug('bricklaying')).toBe(OTHER_SKILL_SECTOR); // a retired phantom slug
    expect(skillSectorForSlug('')).toBe(OTHER_SKILL_SECTOR);
  });
});

describe('extractSelectMultipleValues — shared TS extractor (AC2)', () => {
  it('extracts the canonical JSONB-array shape into clean tokens', () => {
    expect(extractSelectMultipleValues(['painting', 'nursing', 'electrical', 'solar'])).toEqual([
      'painting',
      'nursing',
      'electrical',
      'solar',
    ]);
  });

  it('splits a legacy space-delimited scalar string', () => {
    expect(extractSelectMultipleValues('carpentry plumbing welding')).toEqual([
      'carpentry',
      'plumbing',
      'welding',
    ]);
  });

  it('preserves custom_* values (bucketed downstream, not dropped)', () => {
    expect(extractSelectMultipleValues(['tailoring', 'custom_realtor'])).toEqual([
      'tailoring',
      'custom_realtor',
    ]);
  });

  it('trims and drops empty tokens from both shapes', () => {
    expect(extractSelectMultipleValues([' welding ', '', '  '])).toEqual(['welding']);
    expect(extractSelectMultipleValues('welding   plumbing')).toEqual(['welding', 'plumbing']);
  });

  it('returns [] for null / undefined / number / object (no throw)', () => {
    expect(extractSelectMultipleValues(null)).toEqual([]);
    expect(extractSelectMultipleValues(undefined)).toEqual([]);
    expect(extractSelectMultipleValues(42)).toEqual([]);
    expect(extractSelectMultipleValues({ a: 1 })).toEqual([]);
  });
});
