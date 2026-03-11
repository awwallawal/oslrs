// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { RegistrySummary } from '@oslsr/types';

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

describe('RegistrySummaryStrip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders strip with data', () => {
    render(<RegistrySummaryStrip data={mockData} isLoading={false} error={null} />);
    expect(screen.getByTestId('registry-summary-strip')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<RegistrySummaryStrip isLoading={true} error={null} />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('shows stat items by default when localStorage has no saved state', () => {
    render(<RegistrySummaryStrip data={mockData} isLoading={false} error={null} />);
    // Stat items should be visible — check for at least one stat label
    expect(screen.getByText('Total Respondents')).toBeInTheDocument();
    expect(screen.getByText('1,247')).toBeInTheDocument();
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
