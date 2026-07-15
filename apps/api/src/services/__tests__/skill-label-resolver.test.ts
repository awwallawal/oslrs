// Story 13-28 — label-resolver unit tests. Lives in apps/api (NOT packages/types)
// because packages/types has no `test` script, so a test there never runs under
// `pnpm test`/CI (the exact "test that never runs" trap Story 13-22 removed). The
// resolver is imported from the built @oslsr/types surface, same as its consumers.
import { describe, it, expect } from 'vitest';
import { skillLabelForSlug, SKILL_LABEL_BY_SLUG, SKILL_TAXONOMY } from '@oslsr/types';

describe('skillLabelForSlug (Story 13-28)', () => {
  it('maps every canonical slug to its Appendix-C label', () => {
    for (const { name, label } of SKILL_TAXONOMY) {
      expect(skillLabelForSlug(name)).toBe(label);
    }
  });

  it('returns the canonical label for a known slug', () => {
    expect(skillLabelForSlug('tailoring')).toBe('Tailoring/Sewing');
    expect(skillLabelForSlug('tour_guide')).toBe('Tour Guide Services');
  });

  it('humanizes a custom_* slug into title-cased free text (never a raw slug)', () => {
    expect(skillLabelForSlug('custom_realtor')).toBe('Realtor');
    expect(skillLabelForSlug('custom_drone_pilot')).toBe('Drone Pilot');
  });

  it('humanizes an unknown/legacy non-canonical slug rather than showing it raw', () => {
    expect(skillLabelForSlug('some_legacy_trade')).toBe('Some Legacy Trade');
  });

  it('never returns a raw slug for degenerate input (AC3)', () => {
    // A bare `custom_` or an all-underscores value strips to nothing — must
    // fall back to a neutral label, never the raw slug.
    expect(skillLabelForSlug('custom_')).toBe('Other skill');
    expect(skillLabelForSlug('___')).toBe('Other skill');
  });

  it('exposes a complete slug->label map covering all 150 canonical skills', () => {
    expect(Object.keys(SKILL_LABEL_BY_SLUG)).toHaveLength(SKILL_TAXONOMY.length);
  });
});
