// @vitest-environment jsdom
/**
 * EnumeratorHome Tests
 *
 * Story 2.5-5 AC1: Mobile-optimized dashboard
 * Story 3.1: "Start Survey" navigates to surveys page
 * Story 3.2 AC3: Persistent storage request + warning banner
 * Story 3.3: Dynamic sync status badge + pending sync banner
 * prep-2: TotalSubmissionsCard, TodayProgressCard, SubmissionActivityChart
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// Mock usePersistentStorage before importing component
const mockUsePersistentStorage = vi.fn().mockReturnValue({
  isPersisted: true,
  storageQuota: null,
  isSupported: true,
  showWarning: false,
});

vi.mock('../../../../hooks/usePersistentStorage', () => ({
  usePersistentStorage: () => mockUsePersistentStorage(),
}));

// Mock useSyncStatus
const mockUseSyncStatus = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    status: 'synced',
    pendingCount: 0,
    failedCount: 0,
    syncingCount: 0,
    totalCount: 2,
  }),
);

vi.mock('../../../forms/hooks/useSyncStatus', () => ({
  useSyncStatus: mockUseSyncStatus,
}));

// Mock syncManager
const mockSyncNow = vi.hoisted(() => vi.fn());
const mockRetryFailed = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/sync-manager', () => ({
  syncManager: { syncNow: mockSyncNow, retryFailed: mockRetryFailed },
}));

// Mock useForms hooks
let mockCountsReturn = {
  data: undefined as Record<string, number> | undefined,
  isLoading: false,
  error: null as Error | null,
};

let mockDailyReturn = {
  data: undefined as Array<{ date: string; count: number }> | undefined,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../../../forms/hooks/useForms', () => ({
  useMySubmissionCounts: () => mockCountsReturn,
  useDailyCounts: () => mockDailyReturn,
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div aria-label="Loading card" />,
  SkeletonText: ({ width }: { width?: string }) => <div aria-label="Loading text" style={{ width }} />,
}));

// Mock recharts (jsdom can't render SVG)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ReferenceLine: () => <div />,
  Cell: () => <div />,
  CartesianGrid: () => <div />,
}));

import EnumeratorHome from '../EnumeratorHome';

afterEach(() => {
  cleanup();
});

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderComponent(props?: { isLoading?: boolean }) {
  return render(
    <MemoryRouter>
      <EnumeratorHome {...props} />
    </MemoryRouter>
  );
}

describe('EnumeratorHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePersistentStorage.mockReturnValue({
      isPersisted: true,
      storageQuota: null,
      isSupported: true,
      showWarning: false,
    });
    mockUseSyncStatus.mockReturnValue({
      status: 'synced',
      pendingCount: 0,
      failedCount: 0,
      syncingCount: 0,
      totalCount: 2,
    });
    mockCountsReturn = { data: undefined, isLoading: false, error: null };
    mockDailyReturn = { data: undefined, isLoading: false, error: null };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('AC1: Dashboard Layout', () => {
    it('renders page heading', () => {
      renderComponent();
      expect(screen.getByText('Enumerator Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Survey collection and progress tracking')).toBeInTheDocument();
    });

    it('renders Start Survey CTA button', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Survey' });
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveClass('min-h-[48px]');
    });

    it('renders Resume Draft section with empty state', () => {
      renderComponent();
      expect(screen.getByText('Resume Draft')).toBeInTheDocument();
      expect(screen.getByText('No drafts yet')).toBeInTheDocument();
    });

    it('renders Sync Status badge with Synced state and status role', () => {
      renderComponent();
      const statusBadge = screen.getByRole('status');
      expect(statusBadge).toBeInTheDocument();
      expect(screen.getByText('Synced')).toBeInTheDocument();
    });
  });

  describe('AC1: Skeleton Loading', () => {
    it('does not render skeleton cards when not loading (default)', () => {
      renderComponent();
      const skeletons = screen.queryAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(0);
      expect(screen.getByText('Resume Draft')).toBeInTheDocument();
    });

    it('renders skeleton cards and hides content when loading', () => {
      renderComponent({ isLoading: true });
      const skeletons = screen.getAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(5);
      expect(screen.queryByText('Resume Draft')).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('Story 3.1: Start Survey Navigation', () => {
    it('navigates to surveys page on Start Survey click', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Survey' });
      fireEvent.click(cta);
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/enumerator/survey');
    });
  });

  describe('Story 3.2 AC3: Persistent Storage', () => {
    it('does not show storage warning when persisted', () => {
      renderComponent();
      expect(
        screen.queryByText(/Storage not secured/)
      ).not.toBeInTheDocument();
    });

    it('shows storage warning banner when persistent storage is denied', () => {
      mockUsePersistentStorage.mockReturnValue({
        isPersisted: false,
        storageQuota: null,
        isSupported: true,
        showWarning: true,
      });
      renderComponent();
      expect(
        screen.getByText('Storage not secured. Avoid clearing browser data to prevent data loss.')
      ).toBeInTheDocument();
    });
  });

  describe('Story 3.3: Dynamic Sync Status', () => {
    it('shows Synced badge when all synced', () => {
      renderComponent();
      expect(screen.getByText('Synced')).toBeInTheDocument();
    });

    it('shows Syncing badge when items are syncing', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'syncing',
        pendingCount: 2,
        failedCount: 0,
        syncingCount: 1,
        totalCount: 3,
      });
      renderComponent();
      expect(screen.getByText('Syncing')).toBeInTheDocument();
    });

    it('shows Offline badge when offline', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'offline',
        pendingCount: 0,
        failedCount: 0,
        syncingCount: 0,
        totalCount: 1,
      });
      renderComponent();
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('shows Attention badge when failed items exist', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'attention',
        pendingCount: 0,
        failedCount: 2,
        syncingCount: 0,
        totalCount: 3,
      });
      renderComponent();
      expect(screen.getByText('Attention')).toBeInTheDocument();
    });

    it('hides badge when status is empty (no submissions)', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'empty',
        pendingCount: 0,
        failedCount: 0,
        syncingCount: 0,
        totalCount: 0,
      });
      renderComponent();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows PendingSyncBanner when pendingCount > 0', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'syncing',
        pendingCount: 3,
        failedCount: 0,
        syncingCount: 1,
        totalCount: 4,
      });
      renderComponent();
      expect(screen.getByText(/3 pending survey/)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('shows failed banner when failedCount > 0', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'attention',
        pendingCount: 0,
        failedCount: 2,
        syncingCount: 0,
        totalCount: 3,
      });
      renderComponent();
      expect(screen.getByText(/2 survey\(s\) failed to sync/)).toBeInTheDocument();
    });

    it('does not show PendingSyncBanner when pendingCount and failedCount are 0', () => {
      renderComponent();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('calls syncManager.syncNow on Upload Now click', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'synced',
        pendingCount: 2,
        failedCount: 0,
        syncingCount: 0,
        totalCount: 3,
      });
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /upload now/i }));
      expect(mockSyncNow).toHaveBeenCalledTimes(1);
    });

    it('calls syncManager.retryFailed on Retry click', () => {
      mockUseSyncStatus.mockReturnValue({
        status: 'attention',
        pendingCount: 0,
        failedCount: 2,
        syncingCount: 0,
        totalCount: 3,
      });
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(mockRetryFailed).toHaveBeenCalledTimes(1);
    });
  });

  describe('prep-2: Live Dashboard Cards', () => {
    it('renders TotalSubmissionsCard with correct total', () => {
      mockCountsReturn = { data: { form1: 5, form2: 3 }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('total-submissions-card')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('Total Submissions')).toBeInTheDocument();
    });

    it('renders TodayProgressCard', () => {
      mockDailyReturn = { data: [], isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('today-progress-card')).toBeInTheDocument();
      expect(screen.getByText(/surveys today/)).toBeInTheDocument();
    });

    it('renders SubmissionActivityChart', () => {
      mockDailyReturn = {
        data: [{ date: '2026-02-15', count: 5 }],
        isLoading: false,
        error: null,
      };
      renderComponent();
      expect(screen.getByTestId('submission-activity-chart')).toBeInTheDocument();
    });

    it('renders chart even with zero counts (gaps filled)', () => {
      mockDailyReturn = { data: [], isLoading: false, error: null };
      renderComponent();
      // fillDateGaps produces 7 zero-count entries so chart renders (not empty)
      expect(screen.getByTestId('submission-activity-chart')).toBeInTheDocument();
    });

    it('cards gracefully degrade on error', () => {
      mockCountsReturn = { data: undefined, isLoading: false, error: new Error('fail') };
      mockDailyReturn = { data: undefined, isLoading: false, error: new Error('fail') };
      renderComponent();
      expect(screen.queryByTestId('total-submissions-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('today-progress-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('submission-activity-chart')).not.toBeInTheDocument();
    });
  });
});
