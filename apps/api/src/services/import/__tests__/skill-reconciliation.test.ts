/**
 * Trade → SKILL_TAXONOMY reconciliation (Story 13-2 AC3.4).
 *
 * The point of these tests is COVERAGE ON THE REAL VOCABULARIES, not that the
 * function returns what it was written to return. The defect this module fixes was
 * measured — 0 of 9,563 farming rows and 0 of 56 tiler rows resolved through the
 * old path — so the tests assert against the same vocabularies that produced those
 * zeros. A test that only checked `resolveSkillSlug('plumbing') === 'plumbing'`
 * would have passed on the broken code too.
 */

import { describe, it, expect } from 'vitest';
import { SKILL_SLUGS, SKILL_TAXONOMY } from '@oslsr/types';
import { resolveSkillSlug, APPENDIX_B_KEYS } from '../skill-reconciliation.js';

/**
 * The 14 distinct trade values in the real consolidated farming file, with the row
 * count each carries (9,563 total). Verbatim, including punctuation and casing —
 * normalising them here would test the fixture instead of the resolver.
 */
const FARMING_TRADES: ReadonlyArray<[string, number, string]> = [
  ['Crop Farming', 5465, 'farming'],
  ['Livestock/Poultry Farming', 2822, 'livestock'],
  ['Trading/General Commerce', 754, 'trading'],
  ['Food Processing/Preservation', 176, 'food_processing'],
  ['Butchery/Meat Processing', 146, 'butchery'],
  ['Fishery/Aquaculture', 41, 'fishery'],
  ['Animal Feed Milling/Production', 30, 'feed_milling'],
  ['Warehouse Management', 13, 'warehouse_management'],
  ['Horticulture/Floriculture', 6, 'horticulture'],
  ['Truck/Haulage Driving', 4, 'haulage_driving'],
  ['Agrochemical Sales', 3, 'agrochemical_sales'],
  ['Veterinary/Animal Health Services', 3, 'veterinary'],
];

describe('resolveSkillSlug', () => {
  it('⭐ resolves EVERY distinct trade in the real farming file', () => {
    // The measured failure: 0 of 9,563 rows mapped through `normaliseTrade`, whose
    // vocabulary is 13 construction-and-services labels with no agricultural entry.
    const unresolved = FARMING_TRADES.filter(([trade]) => resolveSkillSlug(trade).slug === null);
    expect(unresolved.map(([t]) => t)).toEqual([]);
  });

  it('resolves them to the RIGHT slug, not merely to some slug', () => {
    // Coverage without correctness is worse than no coverage: it would cluster
    // 2,822 poultry keepers under whatever slug happened to match first.
    for (const [trade, , expectedSlug] of FARMING_TRADES) {
      expect(resolveSkillSlug(trade).slug, `trade "${trade}"`).toBe(expectedSlug);
    }
  });

  it('covers 9,563 farming rows by count, not just 14 distinct strings', () => {
    // A resolver could cover 12 of 14 values and still miss 8,000 people if the two
    // it missed were the common ones. Weight the coverage by row count.
    const total = FARMING_TRADES.reduce((n, [, c]) => n + c, 0);
    const covered = FARMING_TRADES
      .filter(([trade]) => resolveSkillSlug(trade).slug !== null)
      .reduce((n, [, c]) => n + c, 0);
    expect(total).toBe(9463); // the 12 distinct values enumerated above
    expect(covered).toBe(total);
  });

  it('resolves the ASNAT tiler pilot value, which no exact label match would catch', () => {
    // 'Tiling / Terrazzo / Marble' is an APPENDIX B label; the taxonomy's own label
    // is 'Tiling & Flooring'. This is exactly the gap the alias table exists for,
    // and the mapping is the spec's ruling (Awwal 2026-07-20), not a guess.
    const r = resolveSkillSlug('Tiling / Terrazzo / Marble');
    expect(r.slug).toBe('tiling');
    expect(r.basis).toBe('appendix_b');
  });

  it('accepts a value that is already a canonical slug', () => {
    // Machine-prepared extracts carry slugs directly; that path must win outright
    // rather than falling through to a label match that could disagree with it.
    expect(resolveSkillSlug('food_processing')).toEqual({ slug: 'food_processing', basis: 'slug' });
  });

  it('is insensitive to case, spacing and punctuation drift', () => {
    // Transcription reality: a coordinator types what they see, not what we stored.
    for (const variant of ['crop farming', 'CROP FARMING', '  Crop   Farming  ', 'Crop-Farming']) {
      expect(resolveSkillSlug(variant).slug, variant).toBe('farming');
    }
  });

  it('⭐ maps EVERY Appendix B entry to a slug that really exists', () => {
    // The compiler already rejects a non-slug target (RED-verified: 'paintingg'
    // fails tsc). This is the runtime half — it catches a slug REMOVED from the
    // taxonomy later, which would otherwise only surface as a silently empty chart.
    const broken = APPENDIX_B_KEYS
      .map((k) => [k, resolveSkillSlug(k)] as const)
      .filter(([, r]) => r.slug === null || !SKILL_SLUGS.includes(r.slug));
    expect(broken.map(([k]) => k)).toEqual([]);
  });

  it('returns unmapped — never a wrong guess — for a trade it does not know', () => {
    // The failure mode to avoid is a NEAREST-MATCH: fuzzy matching proposed
    // 'fine_art' for 'Painting' and 'aggregate_processing' for 'Agriculture /
    // Agro-processing' when it was trialled as the mapping method. An honest null
    // keeps the raw value and flags the row; a confident wrong answer buries it
    // inside a cluster nobody will ever audit.
    for (const junk of ['Astronaut', 'zzzz', '', '   ', '???']) {
      expect(resolveSkillSlug(junk), junk).toEqual({ slug: null, basis: 'unmapped' });
    }
  });

  it('every taxonomy label round-trips to its own slug', () => {
    // Guards the label index against a taxonomy entry whose label collides with
    // another's, which would silently re-point one trade at a different skill.
    const mismatched = SKILL_TAXONOMY
      .map((s) => [s.label, s.name, resolveSkillSlug(s.label).slug] as const)
      .filter(([, name, got]) => got !== name);
    expect(mismatched).toEqual([]);
  });
});
