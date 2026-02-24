// @vitest-environment jsdom
/**
 * OfficialProductivityPage Tests
 *
 * Story 5.6b AC4: Tests for the government official aggregate-only productivity page.
 * Direction 08 styling, no individual staff names, no export, read-only.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mockLgaSummaryResult = vi.hoisted(() => ({
  data: null as any,
  isLoading: false,
  error: null as any,
}));

vi.mock('../../hooks/useProductivity', () => ({
  useLgaSummary: () => mockLgaSummaryResult,
  productivityKeys: {
    all: ['productivity'],
    lgaSummary: () => ['productivity', 'lgaSummary'],
  },
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonTable: () => <div data-testid="skeleton-table" />,
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

import { renderWithQueryClient } from '../../../../test-utils';
import OfficialProductivityPage from '../OfficialProductivityPage';

// ── Mock data ───────────────────────────────────────────────────────────────

const mockSummaryData = {
  data: [
    { lgaId: 'lga-1', lgaName: 'Ibadan North', activeStaff: 5, todayTotal: 50, dailyTarget: 125, percent: 40, weekTotal: 200, weekAvgPerDay: 40, monthTotal: 800, completionRate: 36, trend: 'up' },
  ],
  summary: { totalLgas: 1, totalActiveStaff: 5, overallCompletionRate: 36, totalSubmissionsToday: 50 },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
  return renderWithQueryClient(<OfficialProductivityPage />);
}

// ── Setup ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockLgaSummaryResult.data = mockSummaryData;
  mockLgaSummaryResult.isLoading = false;
  mockLgaSummaryResult.error = null;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('OfficialProductivityPage', () => {
  it('renders with Direction 08 dark header — page has data-testid="official-productivity-page"', () => {
    renderPage();
    expect(screen.getByTestId('official-productivity-page')).toBeInTheDocument();
    // Direction 08 page heading
    expect(screen.getByText('LGA Productivity Overview')).toBeInTheDocument();
    expect(screen.getByText(/Aggregate field operation progress/)).toBeInTheDocument();
  });

  it('10-column table renders with data-testid="official-productivity-table"', () => {
    renderPage();
    const table = screen.getByTestId('official-productivity-table');
    expect(table).toBeInTheDocument();
    // Verify 10 column headers using within(table) to avoid summary strip collisions
    const t = within(table);
    const expectedHeaders = [
      'LGA', 'Active Staff', 'Today Total', 'Daily Target', '%',
      'This Week', 'Week Avg/Day', 'This Month', 'Completion', 'Trend',
    ];
    for (const header of expectedHeaders) {
      expect(t.getByText(header)).toBeInTheDocument();
    }
  });

  it('no staff names visible (query for specific names and expect not to find them)', () => {
    renderPage();
    // The page should NOT show individual staff names — only LGA aggregate names
    expect(screen.queryByText('Adamu Test')).not.toBeInTheDocument();
    expect(screen.queryByText('Bola Test')).not.toBeInTheDocument();
    expect(screen.queryByText('Supervisor A')).not.toBeInTheDocument();
    // LGA name should be visible
    expect(screen.getByText('Ibadan North')).toBeInTheDocument();
  });

  it('no export button present (query for "export" button and expect not found)', () => {
    renderPage();
    expect(screen.queryByTestId('export-csv')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-pdf')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-controls')).not.toBeInTheDocument();
  });

  it('summary strip shows correct totals', () => {
    renderPage();
    const strip = screen.getByTestId('summary-strip');
    expect(strip).toBeInTheDocument();
    // Use within(strip) to avoid collisions with table column headers
    const s = within(strip);
    // Total LGAs = 1
    expect(s.getByText('Total LGAs')).toBeInTheDocument();
    expect(s.getByText('1')).toBeInTheDocument();
    // Active Staff = 5
    expect(s.getByText('Active Staff')).toBeInTheDocument();
    expect(s.getByText('5')).toBeInTheDocument();
    // Overall Completion = 36%
    expect(s.getByText('Overall Completion')).toBeInTheDocument();
    expect(s.getByText('36%')).toBeInTheDocument();
    // Submissions Today = 50
    expect(s.getByText('Submissions Today')).toBeInTheDocument();
    expect(s.getByText('50')).toBeInTheDocument();
  });

  it('period filter dropdown present with data-testid="period-select"', () => {
    renderPage();
    expect(screen.getByTestId('period-select')).toBeInTheDocument();
  });

  it('LGA filter dropdown present with data-testid="lga-filter"', () => {
    renderPage();
    expect(screen.getByTestId('lga-filter')).toBeInTheDocument();
  });

  it('skeleton loading state when isLoading=true', () => {
    mockLgaSummaryResult.data = null;
    mockLgaSummaryResult.isLoading = true;
    renderPage();
    // Should show skeleton table for the main table area
    expect(screen.getByTestId('skeleton-table')).toBeInTheDocument();
    // Should show skeleton cards for summary area
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThanOrEqual(1);
    // Should NOT show the data table
    expect(screen.queryByTestId('official-productivity-table')).not.toBeInTheDocument();
  });

  it('empty state message when no data', () => {
    mockLgaSummaryResult.data = { data: [], summary: null };
    renderPage();
    expect(screen.getByText(/No productivity data available/)).toBeInTheDocument();
  });

  it('error state shown when error present', () => {
    mockLgaSummaryResult.data = null;
    mockLgaSummaryResult.error = new Error('network error');
    renderPage();
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText(/Failed to load productivity data/)).toBeInTheDocument();
  });
});
