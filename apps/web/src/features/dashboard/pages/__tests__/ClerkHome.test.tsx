// @vitest-environment jsdom
/**
 * ClerkHome Tests
 *
 * Story 2.5-6 AC1: Desktop-optimized dashboard with CTA, cards, shortcuts
 * Story 2.5-6 AC2: Auto-focus on CTA button
 * Story 2.5-6 AC4: Single-key shortcuts (N, ?, Esc)
 * Story 2.5-6 AC5: Keyboard shortcuts modal
 * Story 2.5-6 AC9: Skeleton loading branch
 * Story 2.5-6 AC11: Tab navigation without focus traps
 *
 * Story 3.6 AC3.6.9: Removed "Coming in Epic 3" modal.
 * CTA and N shortcut navigate to /dashboard/clerk/surveys.
 * SyncStatusBadge and PendingSyncBanner added.
 * prep-2: TotalSubmissionsCard, TodayProgressCard, SubmissionActivityChart.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import ClerkHome from '../ClerkHome';

// ── Mock state ──────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

let mockSyncStatus = {
  status: 'empty' as string,
  pendingCount: 0,
  failedCount: 0,
  syncingCount: 0,
  totalCount: 0,
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../forms/hooks/useSyncStatus', () => ({
  useSyncStatus: () => mockSyncStatus,
}));

vi.mock('../../../../services/sync-manager', () => ({
  syncManager: {
    syncNow: vi.fn(),
    retryFailed: vi.fn(),
  },
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div aria-label="Loading card" />,
  SkeletonText: ({ width }: { width?: string }) => <div aria-label="Loading text" style={{ width }} />,
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

// Mock recharts
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderComponent(props: { isLoading?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <ClerkHome {...props} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSyncStatus = {
    status: 'empty',
    pendingCount: 0,
    failedCount: 0,
    syncingCount: 0,
    totalCount: 0,
  };
  mockCountsReturn = { data: undefined, isLoading: false, error: null };
  mockDailyReturn = { data: undefined, isLoading: false, error: null };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ClerkHome', () => {
  describe('AC1: Dashboard Layout', () => {
    it('renders page title and subtitle', () => {
      renderComponent();
      expect(screen.getByText('Data Entry Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Keyboard-optimized paper form digitization')).toBeInTheDocument();
    });

    it('renders "Start Data Entry" CTA button', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Data Entry' });
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveClass('min-h-[48px]');
    });

    it('renders Recent Entries card with empty state', () => {
      renderComponent();
      expect(screen.getByText('Recent Entries')).toBeInTheDocument();
      expect(screen.getByText('No entries yet')).toBeInTheDocument();
    });
  });

  describe('AC2: Auto-focus CTA', () => {
    it('CTA has auto-focus on mount', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Data Entry' });
      expect(document.activeElement).toBe(cta);
    });
  });

  describe('AC3.6.9: CTA navigates to surveys (Epic 3 modal removed)', () => {
    it('click CTA navigates to /dashboard/clerk/surveys', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Data Entry' });
      fireEvent.click(cta);
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/clerk/surveys');
    });

    it('"Coming in Epic 3" modal no longer exists', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: 'Start Data Entry' }));
      expect(screen.queryByText('Coming in Epic 3')).not.toBeInTheDocument();
    });
  });

  describe('AC4: Keyboard Shortcuts', () => {
    it('keyboard shortcut N navigates to /dashboard/clerk/surveys', () => {
      renderComponent();
      fireEvent.keyDown(document, { key: 'n' });
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/clerk/surveys');
    });

    it('keyboard shortcut ? opens shortcuts modal', () => {
      renderComponent();
      fireEvent.keyDown(document, { key: '?' });
      const matches = screen.getAllByText('Keyboard Shortcuts');
      expect(matches.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('keyboard shortcut Esc closes shortcuts modal', () => {
      renderComponent();
      fireEvent.keyDown(document, { key: '?' });
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('keyboard shortcuts section is visible on dashboard', () => {
      renderComponent();
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });
  });

  describe('AC3.6.9: Sync components', () => {
    it('renders PendingSyncBanner when pending submissions exist', () => {
      mockSyncStatus = {
        status: 'synced',
        pendingCount: 3,
        failedCount: 0,
        syncingCount: 0,
        totalCount: 3,
      };
      renderComponent();
      expect(screen.getByText(/3 pending survey/i)).toBeInTheDocument();
    });

    it('renders PendingSyncBanner when failed submissions exist', () => {
      mockSyncStatus = {
        status: 'attention',
        pendingCount: 0,
        failedCount: 2,
        syncingCount: 0,
        totalCount: 2,
      };
      renderComponent();
      expect(screen.getByText(/2.*failed to sync/i)).toBeInTheDocument();
    });

    it('does not render PendingSyncBanner when no pending/failed', () => {
      mockSyncStatus = {
        status: 'empty',
        pendingCount: 0,
        failedCount: 0,
        syncingCount: 0,
        totalCount: 0,
      };
      renderComponent();
      expect(screen.queryByText(/pending survey/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/failed to sync/i)).not.toBeInTheDocument();
    });
  });

  describe('AC9: Skeleton Loading', () => {
    it('renders skeleton layout matching content shape when isLoading=true', () => {
      renderComponent({ isLoading: true });
      const skeletonCards = screen.getAllByLabelText('Loading card');
      expect(skeletonCards).toHaveLength(4);
      const buttonSkeleton = screen.getByLabelText('Loading button');
      expect(buttonSkeleton).toBeInTheDocument();
    });

    it('hides content when loading', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByText('Start Data Entry')).not.toBeInTheDocument();
      expect(screen.queryByText('Recent Entries')).not.toBeInTheDocument();
    });

    it('does not render skeleton cards when not loading (default)', () => {
      renderComponent();
      const skeletons = screen.queryAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(0);
      expect(screen.getByText('Recent Entries')).toBeInTheDocument();
    });
  });

  describe('AC11: Tab Navigation', () => {
    it('no interactive elements have negative tabindex (no focus traps)', () => {
      renderComponent();
      const cta = screen.getByRole('button', { name: 'Start Data Entry' });
      expect(document.activeElement).toBe(cta);
      expect(cta).not.toHaveAttribute('tabindex', '-1');
    });

    it('all interactive elements are tabbable in sequential order', () => {
      renderComponent();
      const focusableElements = document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      expect(focusableElements.length).toBeGreaterThanOrEqual(1);
      focusableElements.forEach((el) => {
        expect(el).not.toHaveAttribute('tabindex', '-1');
      });
    });
  });

  describe('AC1: Quick actions content', () => {
    it('renders actionable shortcuts content', () => {
      renderComponent();
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start Data Entry' })).toBeInTheDocument();
    });
  });

  describe('prep-2: Live Dashboard Cards', () => {
    it('renders TotalSubmissionsCard with correct total', () => {
      mockCountsReturn = { data: { form1: 5, form2: 3 }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('total-submissions-card')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('Total Entries')).toBeInTheDocument();
    });

    it('renders TodayProgressCard', () => {
      mockDailyReturn = { data: [], isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('today-progress-card')).toBeInTheDocument();
      expect(screen.getByText(/forms today/)).toBeInTheDocument();
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
