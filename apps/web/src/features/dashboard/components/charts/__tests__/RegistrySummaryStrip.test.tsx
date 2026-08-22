// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { RegistrySummary, RegistryTotals } from '@oslsr/types';

expect.extend(matchers);
afterEach(() => cleanup());

vi.mock('../../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

import { RegistrySummaryStrip } from '../RegistrySummaryStrip';

const STORAGE_KEY = 'registry-summary-collapsed';

const mockData: RegistrySummary = {
  totalRespondents: 1247,
  employedCount: 892,
  employedPct: 71.5,
  femaleCount: 623,
  femalePct: 49.9,
  avgAge: 34,
  businessOwners: 312,
  businessOwnersPct: 25.0,
  consentMarketplacePct: 70,
  consentEnrichedPct: 55,
};

/** 12-4's aggregate: 1,983 registered people, of whom 1,247 have answers on file. */
const mockTotals: RegistryTotals = {
  totalRespondents: 1983,
  withAnswers: 1247,
  byDataStatus: {
    completed: 1247, data_lost: 700, pending_nin: 12,
    nin_unavailable: 0, imported: 0, no_submission: 24,
  },
  bySource: { public: 1983 },
  byCompleteness: { full: 1247, core: 0, partial: 736 },
  byVerification: { nin_on_file: 1900, self_declared: 71, pending_nin: 12, unverified_import: 0 },
  identityAmbiguous: 0,
  inProgressDrafts: 0,
};

describe('RegistrySummaryStrip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders strip with data', () => {
    render(<RegistrySummaryStrip data={mockData} isLoading={false} error={null} />);
    expect(screen.getByTestId('registry-summary-strip')).toBeInTheDocument();
  });

  // ── Story 12-5 AC3 / AC6.2 — reconciliation ───────────────────────────
  describe('honest total (Story 12-5 AC3)', () => {
    it('reads the total from the registry-totals aggregate, not the answers subset', () => {
      render(
        <RegistrySummaryStrip data={mockData} totals={mockTotals} isLoading={false} error={null} />,
      );
      const total = screen.getByTestId('strip-total-respondents');
      expect(total).toHaveTextContent('Total Respondents');
      // 1,983 registered people — the number the page header also shows.
      expect(total).toHaveTextContent('1,983');
      expect(total).not.toHaveTextContent('1,247');
    });

    it('shows the answers subset as its own labelled item, not as the total', () => {
      render(
        <RegistrySummaryStrip data={mockData} totals={mockTotals} isLoading={false} error={null} />,
      );
      const withAnswers = screen.getByTestId('strip-with-answers');
      expect(withAnswers).toHaveTextContent('With Answers');
      expect(withAnswers).toHaveTextContent('1,247');
    });

    it('captions percentages with the denominator they divide by', () => {
      render(
        <RegistrySummaryStrip data={mockData} totals={mockTotals} isLoading={false} error={null} />,
      );
      expect(screen.getByText('71.5% of 1,247 respondents with answers')).toBeInTheDocument();
    });

    it('renders an em-dash rather than falling back to the answers count', () => {
      // The fallback that would reinstate the bug: showing data.totalRespondents
      // under the label "Total Respondents" when the honest total is missing.
      render(<RegistrySummaryStrip data={mockData} isLoading={false} error={null} />);
      const total = screen.getByTestId('strip-total-respondents');
      expect(total).not.toHaveTextContent('1,247');
      expect(total).toHaveTextContent('—');
    });
  });

  it('renders loading state', () => {
    render(<RegistrySummaryStrip isLoading={true} error={null} />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('shows stat items by default when localStorage has no saved state', () => {
    render(
      <RegistrySummaryStrip data={mockData} totals={mockTotals} isLoading={false} error={null} />,
    );
    // Stat items should be visible — check for at least one stat label
    expect(screen.getByText('Total Respondents')).toBeInTheDocument();
    expect(screen.getByText('1,983')).toBeInTheDocument();
  });

  it('hides stat items when collapse button is clicked', () => {
    render(<RegistrySummaryStrip data={mockData} isLoading={false} error={null} />);
    // Verify stats are visible initially
    expect(screen.getByText('Total Respondents')).toBeInTheDocument();

    // Click the collapse button
    const collapseBtn = screen.getByLabelText('Collapse registry summary');
    fireEvent.click(collapseBtn);

    // Stat items should now be hidden
    expect(screen.queryByText('Total Respondents')).not.toBeInTheDocument();
  });

  it('persists collapsed state to localStorage', () => {
    render(<RegistrySummaryStrip data={mockData} isLoading={false} error={null} />);

    // Initially not collapsed
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Click to collapse
    const collapseBtn = screen.getByLabelText('Collapse registry summary');
    fireEvent.click(collapseBtn);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

    // Click to expand
    const expandBtn = screen.getByLabelText('Expand registry summary');
    fireEvent.click(expandBtn);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('reads initial collapsed state from localStorage', () => {
    // Set localStorage to collapsed before rendering
    localStorage.setItem(STORAGE_KEY, 'true');

    render(<RegistrySummaryStrip data={mockData} isLoading={false} error={null} />);

    // Stat items should be hidden because initial state is collapsed
    expect(screen.queryByText('Total Respondents')).not.toBeInTheDocument();
    // Expand button should be present
    expect(screen.getByLabelText('Expand registry summary')).toBeInTheDocument();
  });
});
