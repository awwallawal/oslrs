// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SKILL_TAXONOMY, skillSectorForSlug } from '@oslsr/types';
import { TradeAvatar, glyphForSkill, tileColorForId } from '../common/TradeAvatar';

expect.extend(matchers);

afterEach(() => cleanup());

const ID_A = '018e1234-5678-7000-8000-00000000000a';
const ID_B = '018e1234-5678-7000-8000-00000000000b';

describe('TradeAvatar — Story 13-38 AC5', () => {
  it('renders a decorative tile carrying no PII', () => {
    render(<TradeAvatar id={ID_A} skillSlug="carpentry" />);

    const avatar = screen.getByTestId('trade-avatar');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    // No photo, and no initials — both are locked-out design decisions.
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.textContent).toBe('');
  });

  it('gives the SAME id the SAME colour on every render (deterministic)', () => {
    const { unmount } = render(<TradeAvatar id={ID_A} skillSlug="carpentry" />);
    const first = screen.getByTestId('trade-avatar').getAttribute('style');
    unmount();

    render(<TradeAvatar id={ID_A} skillSlug="tailoring" />);
    const second = screen.getByTestId('trade-avatar').getAttribute('style');

    // Colour follows the id, not the skill.
    expect(tileColorForId(ID_A)).toBe(tileColorForId(ID_A));
    expect(first).toBe(second);
  });

  it('picks a colour from the fixed palette for any id', () => {
    const palette = new Set(
      [ID_A, ID_B, 'x', '', 'a-very-different-identifier'].map((id) => tileColorForId(id)),
    );
    for (const colour of palette) {
      expect(colour).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('keys the glyph off the skill SECTOR, so same-sector trades share it', () => {
    // carpentry + plumbing are both 'Construction & Building' in the canonical
    // taxonomy — the avatar must not maintain its own skill->icon vocabulary.
    expect(glyphForSkill('carpentry')).toBe(glyphForSkill('plumbing'));
    // A different sector must differ.
    expect(glyphForSkill('carpentry')).not.toBe(glyphForSkill('tailoring'));
  });

  it('falls back to a generic glyph for a missing or custom skill', () => {
    const fallback = glyphForSkill(null);
    expect(fallback).toBeDefined();
    expect(glyphForSkill('custom_something_unmapped')).toBe(fallback);
    expect(glyphForSkill(undefined)).toBe(fallback);
  });

  /**
   * [AI-Review][Low] 2026-08-18 (re-review). GLYPH_BY_SECTOR is a SECOND
   * sector->icon vocabulary keyed by string literal, with a silent Briefcase
   * fallback. It is complete today, but nothing failed if a sector were renamed or
   * added in the taxonomy — those workers would just quietly go generic. That is
   * exactly the drift this component's own doc-comment cites as Story 13-22's
   * lesson (90/150 slugs fell to 'Other'). This is the guard that makes the
   * comment enforceable.
   */
  it('has a distinct glyph for EVERY canonical sector — no silent fallback drift', () => {
    const fallback = glyphForSkill(null);

    // One real slug per sector, taken from the canonical taxonomy itself.
    const slugBySector = new Map<string, string>();
    for (const entry of SKILL_TAXONOMY) {
      if (!slugBySector.has(entry.sector)) slugBySector.set(entry.sector, entry.name);
    }

    const unmapped: string[] = [];
    for (const [sector, slug] of slugBySector) {
      // Sanity: the slug really does resolve to the sector we filed it under.
      expect(skillSectorForSlug(slug)).toBe(sector);
      if (glyphForSkill(slug) === fallback) unmapped.push(sector);
    }

    expect(slugBySector.size).toBeGreaterThan(0);
    expect(unmapped).toEqual([]);
  });

  it('honours an explicit size', () => {
    render(<TradeAvatar id={ID_A} skillSlug="carpentry" size={40} />);

    const avatar = screen.getByTestId('trade-avatar');
    expect(avatar.getAttribute('style')).toContain('40px');
  });
});
