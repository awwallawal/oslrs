// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MARKETPLACE_EXPERIENCE_LEVELS, experienceLabelFor } from '@oslsr/types';
import { MarketplaceFilters } from '../components/MarketplaceFilters';

expect.extend(matchers);
afterEach(() => cleanup());

/**
 * Story 13-38 R4 (Awwal's ruling 2026-08-18) — the experience filter is bound to
 * the canon instead of being a free-text box matched with `=`.
 *
 * ⚠️ WHY THIS FILE EXISTS. Before it, the ONLY assertion on this control was
 * `expect(getByTestId('experience-filter')).toBeInTheDocument()` — a presence
 * check that passes for an <input>, a <select>, or a <div>. Swapping the control
 * wholesale broke NOTHING, which is how the change was found to be unguarded.
 * That is this repo's "a test that passes over a hole": green, asserts the safe
 * outcome, never exercises the thing it is supposed to protect.
 */

// Radix Select drives itself with pointer-capture + scrollIntoView, neither of
// which jsdom implements. Without these the trigger never opens and every
// assertion below would silently degrade into "no options found".
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

function renderFilters(overrides: Partial<Parameters<typeof MarketplaceFilters>[0]> = {}) {
  const onExperienceLevelChange = vi.fn();
  render(
    <MarketplaceFilters
      lgaId=""
      profession=""
      experienceLevel=""
      lgas={[]}
      onLgaChange={vi.fn()}
      onProfessionChange={vi.fn()}
      onExperienceLevelChange={onExperienceLevelChange}
      onClear={vi.fn()}
      {...overrides}
    />,
  );
  return { onExperienceLevelChange };
}

describe('MarketplaceFilters — experience level (13-38 R4)', () => {
  it('is a bound control, NOT the free-text box it replaced', () => {
    renderFilters();
    // The regression this guards: reverting to <Input> would restore a box that
    // only matches when a user types a raw slug exactly.
    expect(screen.queryByPlaceholderText('Experience level')).not.toBeInTheDocument();
    expect(screen.getByTestId('experience-filter')).toBeInTheDocument();
  });

  it('offers exactly the canonical buckets, labelled from the SAME table as the card hero stat', async () => {
    const user = userEvent.setup();
    renderFilters();

    await user.click(screen.getByTestId('experience-filter'));

    // Every canonical level is offered, under its canonical label — so a bucket
    // added to MARKETPLACE_EXPERIENCE_LEVELS appears here with no edit to this
    // component, and a relabelling cannot drift from the card.
    for (const level of MARKETPLACE_EXPERIENCE_LEVELS) {
      const label = experienceLabelFor(level);
      expect(label, `experienceLabelFor(${level}) must resolve`).not.toBeNull();
      expect(screen.getByRole('option', { name: label as string })).toBeInTheDocument();
    }

    // Plus the clear-the-filter affordance, and nothing else.
    expect(screen.getByRole('option', { name: /all experience levels/i })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(MARKETPLACE_EXPERIENCE_LEVELS.length + 1);
  });

  it('emits the stored SLUG, never the human label', async () => {
    const user = userEvent.setup();
    const { onExperienceLevelChange } = renderFilters();

    await user.click(screen.getByTestId('experience-filter'));
    await user.click(screen.getByRole('option', { name: experienceLabelFor('7_10') as string }));

    // The column stores `7_10`; the label reads "7–10 yrs". Emitting the label
    // would match zero rows — the exact silent-no-match failure R4 exists to end.
    await vi.waitFor(() => {
      expect(onExperienceLevelChange).toHaveBeenCalledWith('7_10');
    });
    expect(onExperienceLevelChange).not.toHaveBeenCalledWith(experienceLabelFor('7_10'));
  });

  it('emits empty string when cleared, so the filter is dropped rather than sent as "all"', async () => {
    const user = userEvent.setup();
    const { onExperienceLevelChange } = renderFilters({ experienceLevel: '4_6' });

    await user.click(screen.getByTestId('experience-filter'));
    await user.click(screen.getByRole('option', { name: /all experience levels/i }));

    await vi.waitFor(() => {
      expect(onExperienceLevelChange).toHaveBeenCalledWith('');
    });
    expect(onExperienceLevelChange).not.toHaveBeenCalledWith('all');
  });
});
