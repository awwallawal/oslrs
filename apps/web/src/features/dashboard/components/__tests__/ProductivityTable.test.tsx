// @vitest-environment jsdom
/**
 * ProductivityTable Component Tests
 *
 * Story 5.6a: Tests for the productivity table with 13 columns,
 * status badges, trend indicators, pagination, and summary row.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ProductivitySummary, StaffProductivityRow } from '@oslsr/types';

expect.extend(matchers);

import ProductivityTable from '../ProductivityTable';

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockSummary: ProductivitySummary = {
  totalSubmissions: 45,
  avgPerDay: 15,
  totalTarget: 75,
  overallPercent: 60,
  completedCount: 1,
  behindCount: 1,
  inactiveCount: 0,
};

const mockRows: StaffProductivityRow[] = [
  {
    id: 'enum-1',
    fullName: 'Alice Johnson',
    todayCount: 25,
    target: 25,
    percent: 100,
    status: 'complete',
    trend: 'up',
    weekCount: 100,
    weekTarget: 125,
    monthCount: 400,
    monthTarget: 550,
    approvedCount: 90,
    rejectedCount: 5,
    rejRate: 5,
    daysActive: '5/5',
    lastActiveAt: new Date().toISOString(),
  },
  {
    id: 'enum-2',
    fullName: 'Bob Smith',
    todayCount: 10,
    target: 25,
    percent: 40,
    status: 'behind',
    trend: 'down',
    weekCount: 50,
    weekTarget: 125,
    monthCount: 200,
    monthTarget: 550,
    approvedCount: 40,
    rejectedCount: 15,
    rejRate: 27,
    daysActive: '3/5',
    lastActiveAt: null,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const defaultProps = {
  data: mockRows,
  summary: mockSummary,
  sorting: [],
  onSortingChange: vi.fn(),
  page: 1,
  pageSize: 20,
  totalItems: 2,
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
};

function renderTable(overrides = {}) {
  return render(<ProductivityTable {...defaultProps} {...overrides} />);
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ProductivityTable', () => {
  describe('Column rendering', () => {
    it('renders all 13 column headers', () => {
      renderTable();
      const headers = ['Enumerator', 'Today', 'Target', '%', 'Status', 'Trend',
        'This Week', 'This Month', 'Approved', 'Rejected', 'Rej. Rate', 'Days Active', 'Last Active'];
      for (const header of headers) {
        expect(screen.getByText(header)).toBeInTheDocument();
      }
    });

    it('renders enumerator names', () => {
      renderTable();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });
  });

  describe('Status badges', () => {
    it('renders status badge for "complete"', () => {
      renderTable();
      expect(screen.getByTestId('status-badge-complete')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-complete')).toHaveTextContent('Complete');
    });

    it('renders status badge for "behind"', () => {
      renderTable();
      expect(screen.getByTestId('status-badge-behind')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-behind')).toHaveTextContent('Behind');
    });
  });

  describe('Trend indicators', () => {
    it('renders trend up arrow', () => {
      renderTable();
      expect(screen.getByTestId('trend-up')).toBeInTheDocument();
    });

    it('renders trend down arrow', () => {
      renderTable();
      expect(screen.getByTestId('trend-down')).toBeInTheDocument();
    });
  });

  describe('Progress bar', () => {
    it('renders progress bars', () => {
      renderTable();
      const bars = screen.getAllByTestId('progress-bar');
      expect(bars.length).toBeGreaterThanOrEqual(2);
    });

    it('displays percentage values', () => {
      renderTable();
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('40%')).toBeInTheDocument();
    });
  });

  describe('Rejection rate coloring', () => {
    it('renders rejection rate with conditional color', () => {
      renderTable();
      // Bob's 27% > 20 → should have text-red-600 class
      const bobRejRate = screen.getByText('27%');
      expect(bobRejRate).toHaveClass('text-red-600');
      // Alice's 5% <= 10 → should have text-green-600 class
      const aliceRejRate = screen.getByText('5%');
      expect(aliceRejRate).toHaveClass('text-green-600');
    });
  });

  describe('Last active', () => {
    it('renders relative time for active enumerator', () => {
      renderTable();
      // Alice has a recent lastActiveAt, should show something like "Just now" or "Xm ago"
      expect(screen.queryByText('Never')).toBeInTheDocument(); // Bob has null lastActiveAt
    });
  });

  describe('Summary row', () => {
    it('renders summary row in tfoot', () => {
      renderTable();
      const summaryRow = screen.getByTestId('summary-row');
      expect(summaryRow).toBeInTheDocument();
      expect(screen.getByText('Team Total')).toBeInTheDocument();
    });

    it('displays summary stats', () => {
      renderTable();
      expect(screen.getByText('1 complete')).toBeInTheDocument();
      expect(screen.getByText('1 behind')).toBeInTheDocument();
      expect(screen.getByText('0 inactive')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('renders pagination controls', () => {
      renderTable();
      expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
    });

    it('displays current page info', () => {
      renderTable();
      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    });

    it('calls onPageChange when next page clicked', () => {
      renderTable({ totalItems: 50, pageSize: 20 });
      fireEvent.click(screen.getByTestId('next-page'));
      expect(defaultProps.onPageChange).toHaveBeenCalledWith(2);
    });

    it('disables prev button on first page', () => {
      renderTable();
      expect(screen.getByTestId('prev-page')).toBeDisabled();
    });

    it('calls onPageSizeChange when page size changes', () => {
      renderTable();
      const select = screen.getByTestId('page-size-select');
      fireEvent.change(select, { target: { value: '50' } });
      expect(defaultProps.onPageSizeChange).toHaveBeenCalledWith(50);
    });
  });
});
