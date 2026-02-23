// @vitest-environment jsdom
/**
 * SupervisorProductivityPage Tests
 *
 * Story 5.6a: Tests for the team productivity page with filters, exports, and states.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockInvalidateQueries } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

// ── Mock state ──────────────────────────────────────────────────────────────

let mockProductivityData: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
};

const mockExportMutate = vi.fn();

vi.mock('../../hooks/useProductivity', () => ({
  useTeamProductivity: () => mockProductivityData,
  useProductivityExport: () => ({
    mutate: mockExportMutate,
    isPending: false,
  }),
  productivityKeys: { all: ['productivity'] },
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonTable: () => <div data-testid="skeleton-table" />,
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

import { renderWithRouter } from '../../../../test-utils';
import SupervisorProductivityPage from '../SupervisorProductivityPage';

// ── Helpers ─────────────────────────────────────────────────────────────────

const sampleData = {
  data: [
    {
      id: 'enum-1',
      fullName: 'Alice Johnson',
      todayCount: 20,
      target: 25,
      percent: 80,
      status: 'on_track',
      trend: 'up',
      weekCount: 80,
      weekTarget: 125,
      monthCount: 320,
      monthTarget: 550,
      approvedCount: 15,
      rejectedCount: 2,
      rejRate: 12,
      daysActive: '4/5',
      lastActiveAt: new Date().toISOString(),
    },
  ],
  summary: {
    totalSubmissions: 20,
    avgPerDay: 20,
    totalTarget: 25,
    overallPercent: 80,
    completedCount: 0,
    behindCount: 0,
    inactiveCount: 0,
  },
  meta: {
    pagination: { page: 1, pageSize: 20, totalPages: 1, totalItems: 1 },
  },
};

function renderPage() {
  return renderWithRouter(<SupervisorProductivityPage />);
}

// ── Setup ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockProductivityData = {
    data: sampleData,
    isLoading: false,
    isError: false,
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SupervisorProductivityPage', () => {
  describe('Rendering', () => {
    it('renders page heading and description', () => {
      renderPage();
      expect(screen.getByText('Team Productivity')).toBeInTheDocument();
      expect(screen.getByText(/Track your team/)).toBeInTheDocument();
    });

    it('renders the productivity table with data', () => {
      renderPage();
      expect(screen.getByTestId('productivity-table')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    it('renders summary strip with 4 cards', () => {
      renderPage();
      const strip = screen.getByTestId('summary-strip');
      expect(strip).toBeInTheDocument();
      expect(screen.getByText('Total Submissions')).toBeInTheDocument();
      expect(screen.getByText('Avg per Enumerator')).toBeInTheDocument();
      expect(screen.getByText('Team Completion')).toBeInTheDocument();
      expect(screen.getByText('Behind / Inactive')).toBeInTheDocument();
    });

    it('renders period filter buttons including Custom', () => {
      renderPage();
      expect(screen.getByTestId('period-today')).toBeInTheDocument();
      expect(screen.getByTestId('period-week')).toBeInTheDocument();
      expect(screen.getByTestId('period-month')).toBeInTheDocument();
      expect(screen.getByTestId('period-custom')).toBeInTheDocument();
    });

    it('renders search input', () => {
      renderPage();
      expect(screen.getByTestId('search-input')).toBeInTheDocument();
    });

    it('renders export buttons', () => {
      renderPage();
      expect(screen.getByTestId('export-csv')).toBeInTheDocument();
      expect(screen.getByTestId('export-pdf')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows skeleton table when loading', () => {
      mockProductivityData = { data: undefined, isLoading: true, isError: false };
      renderPage();
      expect(screen.getByTestId('skeleton-table')).toBeInTheDocument();
    });

    it('does not show table when loading', () => {
      mockProductivityData = { data: undefined, isLoading: true, isError: false };
      renderPage();
      expect(screen.queryByTestId('productivity-table')).not.toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error message on fetch failure', () => {
      mockProductivityData = { data: undefined, isLoading: false, isError: true };
      renderPage();
      expect(screen.getByText(/Failed to load productivity data/)).toBeInTheDocument();
    });

    it('shows Try Again button on error', () => {
      mockProductivityData = { data: undefined, isLoading: false, isError: true };
      renderPage();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty state when no team members', () => {
      mockProductivityData = {
        data: {
          ...sampleData,
          data: [],
        },
        isLoading: false,
        isError: false,
      };
      renderPage();
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText(/No team members assigned/)).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls invalidateQueries on refresh click', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('refresh-button'));
      expect(mockInvalidateQueries).toHaveBeenCalled();
    });

    it('calls export mutation on CSV button click', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('export-csv'));
      expect(mockExportMutate).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'csv' }),
        expect.anything(),
      );
    });

    it('calls export mutation on PDF button click', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('export-pdf'));
      expect(mockExportMutate).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'pdf' }),
        expect.anything(),
      );
    });

    it('updates search input value', () => {
      renderPage();
      const searchInput = screen.getByTestId('search-input');
      fireEvent.change(searchInput, { target: { value: 'Alice' } });
      expect(searchInput).toHaveValue('Alice');
    });

    it('shows date range inputs when Custom period selected', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('period-custom'));
      expect(screen.getByTestId('custom-date-range')).toBeInTheDocument();
      expect(screen.getByTestId('date-from')).toBeInTheDocument();
      expect(screen.getByTestId('date-to')).toBeInTheDocument();
    });

    it('shows clear button when filters active and clears on click', () => {
      renderPage();
      const statusFilter = screen.getByTestId('status-filter');
      fireEvent.change(statusFilter, { target: { value: 'behind' } });
      expect(screen.getByTestId('clear-filters')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('clear-filters'));
      expect(statusFilter).toHaveValue('all');
    });
  });
});
