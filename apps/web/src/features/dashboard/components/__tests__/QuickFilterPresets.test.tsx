// @vitest-environment jsdom
/**
 * QuickFilterPresets Tests
 *
 * Story 5.5 Task 7: 5 preset filter buttons.
 *
 * Tests:
 * - Renders 5 preset buttons
 * - Active preset has highlighted styling
 * - Click calls onPresetChange with correct preset
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { QuickFilterPresets, PRESETS } from '../QuickFilterPresets';

// ── Helpers ─────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('QuickFilterPresets', () => {
  it('renders 5 preset buttons', () => {
    render(
      <QuickFilterPresets
        activePreset="all"
        onPresetChange={vi.fn()}
      />,
    );

    const container = screen.getByTestId('quick-filter-presets');
    expect(container).toBeInTheDocument();

    expect(screen.getByTestId('preset-all')).toBeInTheDocument();
    expect(screen.getByTestId('preset-live')).toBeInTheDocument();
    expect(screen.getByTestId('preset-week')).toBeInTheDocument();
    expect(screen.getByTestId('preset-flagged')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pending')).toBeInTheDocument();
  });

  it('renders correct labels for all preset buttons', () => {
    render(
      <QuickFilterPresets
        activePreset={null}
        onPresetChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('preset-all').textContent).toBe('All Records');
    expect(screen.getByTestId('preset-live').textContent).toBe('Live Feed');
    expect(screen.getByTestId('preset-week').textContent).toBe('This Week');
    expect(screen.getByTestId('preset-flagged').textContent).toBe('Flagged');
    expect(screen.getByTestId('preset-pending').textContent).toBe('Pending Review');
  });

  it('active preset has highlighted styling', () => {
    render(
      <QuickFilterPresets
        activePreset="all"
        onPresetChange={vi.fn()}
      />,
    );

    const activeBtn = screen.getByTestId('preset-all');
    const inactiveBtn = screen.getByTestId('preset-live');

    // Active preset should have the dark background
    expect(activeBtn.className).toContain('bg-neutral-900');
    expect(activeBtn.className).toContain('text-white');

    // Inactive preset should have the light background
    expect(inactiveBtn.className).toContain('bg-white');
    expect(inactiveBtn.className).not.toContain('bg-neutral-900');
  });

  it('active preset uses official styling when isOfficialRoute', () => {
    render(
      <QuickFilterPresets
        activePreset="flagged"
        onPresetChange={vi.fn()}
        isOfficialRoute={true}
      />,
    );

    const activeBtn = screen.getByTestId('preset-flagged');

    // Official route uses maroon (#9C1E23) instead of neutral-900
    expect(activeBtn.className).toContain('bg-[#9C1E23]');
    expect(activeBtn.className).toContain('text-white');
  });

  it('click calls onPresetChange with correct preset', () => {
    const onPresetChange = vi.fn();

    render(
      <QuickFilterPresets
        activePreset="all"
        onPresetChange={onPresetChange}
      />,
    );

    // Click 'Live Feed' preset
    fireEvent.click(screen.getByTestId('preset-live'));

    expect(onPresetChange).toHaveBeenCalledTimes(1);
    expect(onPresetChange).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'live',
        label: 'Live Feed',
      }),
    );
  });

  it('click on different presets sends correct preset object', () => {
    const onPresetChange = vi.fn();

    render(
      <QuickFilterPresets
        activePreset={null}
        onPresetChange={onPresetChange}
      />,
    );

    // Click 'Flagged' preset
    fireEvent.click(screen.getByTestId('preset-flagged'));

    expect(onPresetChange).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'flagged',
        label: 'Flagged',
      }),
    );

    // Click 'Pending Review' preset
    fireEvent.click(screen.getByTestId('preset-pending'));

    expect(onPresetChange).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'pending',
        label: 'Pending Review',
      }),
    );
  });

  it('PRESETS array has exactly 5 entries', () => {
    expect(PRESETS).toHaveLength(5);
  });
});
