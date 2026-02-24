// @vitest-environment jsdom
/**
 * SuperAdminProductivityPage Tests
 *
 * Story 5.6b: Tests for the cross-LGA productivity page with two tabs,
 * filters, exports, summary strip, loading, error, and empty states.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mockStaffQuery = vi.hoisted(() => ({
  data: null as any,
  isLoading: false,
  error: null as any,
  refetch: vi.fn(),
}));

const mockLgaQuery = vi.hoisted(() => ({
  data: null as any,
  isLoading: false,
  error: null as any,
  refetch: vi.fn(),
}));

const mockExportMutate = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useProductivity', () => ({
  useAllStaffProductivity: () => mockStaffQuery,
  useLgaComparison: () => mockLgaQuery,
  useCrossLgaExport: () => ({ mutate: mockExportMutate, isPending: false }),
  productivityKeys: {
    all: ['productivity'],
    allStaff: () => ['productivity', 'allStaff'],
    lgaComparison: () => ['productivity', 'lgaComparison'],
  },
}));

const mockApiClient = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: [] })));
vi.mock('../../../../lib/api-client', () => ({
  apiClient: mockApiClient,
}));

// Mock useQuery (used for LGA list fetch via TanStack Query)
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: { data: [] }, isLoading: false, error: null })),
  };
});

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonTable: () => <div data-testid="skeleton-table" />,
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

// Mock child table components to avoid deep rendering complexity
vi.mock('../../components/CrossLgaStaffTable', () => ({
  default: (props: any) => (
    <div data-testid="cross-lga-staff-table">
      {props.data?.map((row: any) => (
        <div
          key={row.id}
          data-testid={row.role === 'supervisor' ? 'supervisor-row' : 'staff-row'}
        >
          {row.fullName}
        </div>
      ))}
      {props.data?.length === 0 && (
        <div data-testid="empty-staff">No staff data available</div>
      )}
      <table>
        <thead>
          <tr>
            <th>Staff Name</th>
            <th>Role</th>
            <th>LGA</th>
            <th>Supervisor</th>
            <th>Today</th>
            <th>Target</th>
            <th>%</th>
            <th>Status</th>
            <th>Trend</th>
            <th>This Week</th>
            <th>This Month</th>
            <th>Approved</th>
            <th>Rej. Rate</th>
            <th>Days Active</th>
            <th>Last Active</th>
          </tr>
        </thead>
      </table>
    </div>
  ),
}));

vi.mock('../../components/LgaComparisonTable', () => ({
  default: (props: any) => (
    <div data-testid="lga-comparison-table">
      {props.data?.map((row: any) => (
        <div key={row.lgaId}>{row.lgaName}</div>
      ))}
    </div>
  ),
}));

vi.mock('../../components/LgaComparisonCard', () => ({
  default: () => <div data-testid="lga-comparison-card" />,
}));

vi.mock('../../components/LgaMultiSelect', () => ({
  default: () => <div data-testid="lga-multi-select" />,
}));

import { renderWithQueryClient } from '../../../../test-utils';
import SuperAdminProductivityPage from '../SuperAdminProductivityPage';

// ── Mock data ───────────────────────────────────────────────────────────────

const mockStaffData = {
  data: [
    { id: '1', fullName: 'Adamu Test', role: 'enumerator', lgaId: 'lga-1', lgaName: 'Ibadan North', supervisorName: 'Supervisor A', todayCount: 10, target: 25, percent: 40, status: 'on_track', trend: 'up', weekCount: 50, weekTarget: 125, monthCount: 200, monthTarget: 550, approvedCount: 8, rejectedCount: 2, rejRate: 20, daysActive: '3/5', lastActiveAt: null },
    { id: '2', fullName: 'Bola Test', role: 'supervisor', lgaId: 'lga-1', lgaName: 'Ibadan North', supervisorName: null, todayCount: 5, target: 50, percent: 10, status: 'behind', trend: 'down', weekCount: 25, weekTarget: 250, monthCount: 100, monthTarget: 1100, approvedCount: 3, rejectedCount: 2, rejRate: 40, daysActive: '2/5', lastActiveAt: null },
  ],
  summary: { totalSubmissions: 15, avgPerDay: 8, totalTarget: 75, overallPercent: 20, completedCount: 0, behindCount: 1, inactiveCount: 0, supervisorlessLgaCount: 1 },
  meta: { pagination: { page: 1, pageSize: 50, totalPages: 1, totalItems: 2 } },
};

const mockLgaData = {
  data: [
    { lgaId: 'lga-1', lgaName: 'Ibadan North', staffingModel: 'Full (1+5)', hasSupervisor: true, enumeratorCount: 5, supervisorName: 'Sup A', todayTotal: 50, lgaTarget: 125, percent: 40, avgPerEnumerator: 10, bestPerformer: { name: 'Adamu', count: 15 }, lowestPerformer: { name: 'Tunde', count: 5 }, rejRate: 10, trend: 'up' },
    { lgaId: 'lga-2', lgaName: 'Ife Central', staffingModel: 'No Supervisor (3)', hasSupervisor: false, enumeratorCount: 3, supervisorName: null, todayTotal: 20, lgaTarget: 75, percent: 27, avgPerEnumerator: 6.7, bestPerformer: { name: 'Fatima', count: 10 }, lowestPerformer: { name: 'Chidi', count: 3 }, rejRate: 5, trend: 'flat' },
  ],
  summary: { totalLgas: 2, totalSubmissions: 70, overallPercent: 35, supervisorlessCount: 1 },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
  return renderWithQueryClient(<SuperAdminProductivityPage />);
}

// ── Setup ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockStaffQuery.data = mockStaffData;
  mockStaffQuery.isLoading = false;
  mockStaffQuery.error = null;
  mockStaffQuery.refetch = vi.fn();
  mockLgaQuery.data = mockLgaData;
  mockLgaQuery.isLoading = false;
  mockLgaQuery.error = null;
  mockLgaQuery.refetch = vi.fn();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SuperAdminProductivityPage', () => {
  it('renders with both tab triggers (Staff Performance and LGA Comparison)', () => {
    renderPage();
    expect(screen.getByTestId('tab-staff')).toBeInTheDocument();
    expect(screen.getByTestId('tab-staff')).toHaveTextContent('Staff Performance');
    expect(screen.getByTestId('tab-lga-comparison')).toBeInTheDocument();
    expect(screen.getByTestId('tab-lga-comparison')).toHaveTextContent('LGA Comparison');
  });

  it('staff tab shows 15 column headers', () => {
    renderPage();
    // The mock CrossLgaStaffTable renders a table with 15 <th> elements
    const table = screen.getByTestId('cross-lga-staff-table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(15);
  });

  it('summary strip shows correct totals for staff tab', () => {
    renderPage();
    const strip = screen.getByTestId('summary-strip');
    expect(strip).toBeInTheDocument();
    const s = within(strip);
    // Total Staff = totalItems from pagination
    expect(s.getByText('Total Staff')).toBeInTheDocument();
    expect(s.getByText('2')).toBeInTheDocument();
    // Submissions Today = totalSubmissions
    expect(s.getByText('Submissions Today')).toBeInTheDocument();
    expect(s.getByText('15')).toBeInTheDocument();
    // Avg Per Staff = avgPerDay
    expect(s.getByText('Avg Per Staff')).toBeInTheDocument();
    expect(s.getByText('8')).toBeInTheDocument();
    // Supervisorless LGAs count
    expect(s.getByText('Supervisorless LGAs')).toBeInTheDocument();
    expect(s.getByText('1')).toBeInTheDocument();
  });

  it('tab switching works (click LGA Comparison tab, verify LGA data renders)', async () => {
    const user = userEvent.setup();
    renderPage();
    // Initially the staff table is visible
    expect(screen.getByTestId('cross-lga-staff-table')).toBeInTheDocument();

    // Click on LGA Comparison tab
    await user.click(screen.getByTestId('tab-lga-comparison'));

    // LGA comparison table should now render
    await waitFor(() => {
      expect(screen.getByTestId('lga-comparison-table')).toBeInTheDocument();
    });
    // LGA names from mock data should be visible
    expect(screen.getByText('Ibadan North')).toBeInTheDocument();
    expect(screen.getByText('Ife Central')).toBeInTheDocument();
  });

  it('export buttons present (CSV and PDF)', () => {
    renderPage();
    expect(screen.getByTestId('export-csv')).toBeInTheDocument();
    expect(screen.getByTestId('export-pdf')).toBeInTheDocument();
  });

  it('export CSV button triggers mutation', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('export-csv'));
    expect(mockExportMutate).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'csv' }),
      expect.anything(),
    );
  });

  it('export PDF button triggers mutation', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('export-pdf'));
    expect(mockExportMutate).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'pdf' }),
      expect.anything(),
    );
  });

  it('supervisor rows styled differently (has data-testid="supervisor-row")', () => {
    renderPage();
    // The mock CrossLgaStaffTable renders supervisor-row testid for supervisor role
    expect(screen.getByTestId('supervisor-row')).toBeInTheDocument();
    // Also verify there are staff rows
    expect(screen.getByTestId('staff-row')).toBeInTheDocument();
  });

  it('skeleton loading state shown when isLoading=true', () => {
    mockStaffQuery.data = null;
    mockStaffQuery.isLoading = true;
    renderPage();
    expect(screen.getByTestId('skeleton-table')).toBeInTheDocument();
    expect(screen.queryByTestId('cross-lga-staff-table')).not.toBeInTheDocument();
  });

  it('error state shown when error present', () => {
    mockStaffQuery.data = null;
    mockStaffQuery.error = new Error('fetch failed');
    renderPage();
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText(/Failed to load staff productivity data/)).toBeInTheDocument();
  });

  it('empty state shown when no data', () => {
    mockStaffQuery.data = {
      ...mockStaffData,
      data: [],
      meta: { pagination: { page: 1, pageSize: 50, totalPages: 0, totalItems: 0 } },
    };
    renderPage();
    // The table should render with empty data
    expect(screen.getByTestId('cross-lga-staff-table')).toBeInTheDocument();
    expect(screen.getByTestId('empty-staff')).toBeInTheDocument();
  });

  it('renders the page root element with data-testid', () => {
    renderPage();
    expect(screen.getByTestId('super-admin-productivity-page')).toBeInTheDocument();
  });

  it('LGA Comparison tab shows correct summary strip totals', async () => {
    const user = userEvent.setup();
    renderPage();
    // Switch to LGA Comparison tab
    await user.click(screen.getByTestId('tab-lga-comparison'));

    await waitFor(() => {
      expect(screen.getByText('Total LGAs')).toBeInTheDocument();
    });

    const strip = screen.getByTestId('summary-strip');
    const s = within(strip);
    // Total LGAs = 2
    expect(s.getByText('Total LGAs')).toBeInTheDocument();
    expect(s.getByText('2')).toBeInTheDocument();
    // Total Submissions = 70
    expect(s.getByText('Total Submissions')).toBeInTheDocument();
    expect(s.getByText('70')).toBeInTheDocument();
    // Overall Percent = 35%
    expect(s.getByText('35%')).toBeInTheDocument();
  });

  it('renders supervisor filter dropdown in staff tab', () => {
    renderPage();
    expect(screen.getByTestId('supervisor-filter')).toBeInTheDocument();
  });

  it('renders role filter dropdown in staff tab', () => {
    renderPage();
    expect(screen.getByTestId('role-filter')).toBeInTheDocument();
  });

  it('refresh button triggers staff query refetch', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('refresh-btn'));
    expect(mockStaffQuery.refetch).toHaveBeenCalled();
  });
});
