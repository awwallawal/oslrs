// @vitest-environment jsdom
/**
 * SupervisorHome Tests
 *
 * Story 2.5-4 AC1: Supervisor Dashboard Home
 * prep-2: Fully live — Team Overview, Pending Alerts, TodayProgressCard,
 * TotalSubmissionsCard, SubmissionActivityChart, all wired to APIs.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockNavigate, mockInvalidateQueries } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

// ── Mock state ──────────────────────────────────────────────────────────────

let mockTeamOverview = {
  data: undefined as { total: number; active: number; inactive: number } | undefined,
  isLoading: false,
  error: null as Error | null,
};

let mockPendingAlerts = {
  data: undefined as { unprocessedCount: number; failedCount: number; totalAlerts: number } | undefined,
  isLoading: false,
  error: null as Error | null,
};

let mockTeamCounts = {
  data: undefined as Record<string, number> | undefined,
  isLoading: false,
  error: null as Error | null,
};

let mockDailyReturn = {
  data: undefined as Array<{ date: string; count: number }> | undefined,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../../hooks/useSupervisor', () => ({
  useTeamOverview: () => mockTeamOverview,
  usePendingAlerts: () => mockPendingAlerts,
  supervisorKeys: { all: ['supervisor'] },
}));

vi.mock('../../../forms/hooks/useForms', () => ({
  useTeamSubmissionCounts: () => mockTeamCounts,
  useDailyCounts: () => mockDailyReturn,
  formKeys: {
    teamSubmissionCounts: () => ['forms', 'teamSubmissionCounts'],
    dailyCounts: (d: number) => ['forms', 'dailyCounts', d],
  },
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

import SupervisorHome from '../SupervisorHome';

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderComponent() {
  return render(
    <MemoryRouter>
      <SupervisorHome />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockTeamOverview = { data: undefined, isLoading: false, error: null };
  mockPendingAlerts = { data: undefined, isLoading: false, error: null };
  mockTeamCounts = { data: undefined, isLoading: false, error: null };
  mockDailyReturn = { data: undefined, isLoading: false, error: null };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SupervisorHome', () => {
  describe('AC1: Dashboard Layout', () => {
    it('renders page heading', () => {
      renderComponent();
      expect(screen.getByText('Supervisor Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Team management and oversight tools')).toBeInTheDocument();
    });

    it('renders refresh button with accessible label', () => {
      renderComponent();
      expect(screen.getByLabelText('Refresh dashboard')).toBeInTheDocument();
    });

    it('displays Last Updated timestamp', () => {
      renderComponent();
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });

  describe('AC1: Refresh', () => {
    it('updates timestamp on refresh click', () => {
      vi.useFakeTimers();
      renderComponent();
      const timestampBefore = screen.getByText(/Last updated:/).textContent;
      vi.advanceTimersByTime(60_000);
      fireEvent.click(screen.getByLabelText('Refresh dashboard'));
      const timestampAfter = screen.getByText(/Last updated:/).textContent;
      expect(timestampAfter).not.toBe(timestampBefore);
      vi.useRealTimers();
    });

    it('invalidates query caches on refresh', () => {
      renderComponent();
      fireEvent.click(screen.getByLabelText('Refresh dashboard'));
      expect(mockInvalidateQueries).toHaveBeenCalled();
    });
  });

  describe('AC1: Skeleton Loading', () => {
    it('renders skeleton cards when any hook is loading', () => {
      mockTeamOverview = { data: undefined, isLoading: true, error: null };
      renderComponent();
      const skeletons = screen.getAllByLabelText('Loading card');
      expect(skeletons.length).toBeGreaterThanOrEqual(5);
    });

    it('hides content cards during loading', () => {
      mockTeamOverview = { data: undefined, isLoading: true, error: null };
      renderComponent();
      expect(screen.queryByText('Team Overview')).not.toBeInTheDocument();
      expect(screen.queryByText('Pending Alerts')).not.toBeInTheDocument();
    });

    it('does not render skeleton cards when not loading', () => {
      renderComponent();
      const skeletons = screen.queryAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(0);
    });
  });

  describe('prep-2: Live Team Overview Card', () => {
    it('renders Team Overview card with real data', () => {
      mockTeamOverview = {
        data: { total: 12, active: 10, inactive: 2 },
        isLoading: false,
        error: null,
      };
      renderComponent();
      expect(screen.getByTestId('team-overview-card')).toBeInTheDocument();
      expect(screen.getByText('Team Overview')).toBeInTheDocument();
      expect(screen.getByTestId('team-total')).toHaveTextContent('12');
      expect(screen.getByTestId('team-active')).toHaveTextContent('10 active');
      expect(screen.getByTestId('team-inactive')).toHaveTextContent('2 inactive');
    });

    it('hides Team Overview card on error', () => {
      mockTeamOverview = { data: undefined, isLoading: false, error: new Error('fail') };
      renderComponent();
      expect(screen.queryByTestId('team-overview-card')).not.toBeInTheDocument();
    });

    it('clicking Team Overview card navigates to /dashboard/supervisor/team', () => {
      mockTeamOverview = {
        data: { total: 5, active: 3, inactive: 2 },
        isLoading: false,
        error: null,
      };
      renderComponent();
      fireEvent.click(screen.getByTestId('team-overview-card'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/supervisor/team');
    });
  });

  describe('prep-2: Live Pending Alerts Card', () => {
    it('renders Pending Alerts card with "All clear" when no alerts', () => {
      mockPendingAlerts = {
        data: { unprocessedCount: 0, failedCount: 0, totalAlerts: 0 },
        isLoading: false,
        error: null,
      };
      renderComponent();
      expect(screen.getByTestId('pending-alerts-card')).toBeInTheDocument();
      expect(screen.getByTestId('alerts-clear')).toHaveTextContent('All clear');
    });

    it('renders unprocessed count when present', () => {
      mockPendingAlerts = {
        data: { unprocessedCount: 5, failedCount: 0, totalAlerts: 5 },
        isLoading: false,
        error: null,
      };
      renderComponent();
      expect(screen.getByTestId('unprocessed-count')).toHaveTextContent('5');
    });

    it('renders failed count when present', () => {
      mockPendingAlerts = {
        data: { unprocessedCount: 0, failedCount: 3, totalAlerts: 3 },
        isLoading: false,
        error: null,
      };
      renderComponent();
      expect(screen.getByTestId('failed-count')).toHaveTextContent('3');
    });

    it('hides Pending Alerts card on error', () => {
      mockPendingAlerts = { data: undefined, isLoading: false, error: new Error('fail') };
      renderComponent();
      expect(screen.queryByTestId('pending-alerts-card')).not.toBeInTheDocument();
    });
  });

  describe('prep-2: Live Dashboard Cards', () => {
    it('renders TotalSubmissionsCard with team total', () => {
      mockTeamCounts = { data: { form1: 50, form2: 30 }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('total-submissions-card')).toBeInTheDocument();
      expect(screen.getByText('80')).toBeInTheDocument();
      expect(screen.getByText('Team Submissions')).toBeInTheDocument();
    });

    it('renders TodayProgressCard', () => {
      mockDailyReturn = { data: [], isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('today-progress-card')).toBeInTheDocument();
      expect(screen.getByText(/team submissions today/)).toBeInTheDocument();
    });

    it('renders SubmissionActivityChart', () => {
      mockDailyReturn = {
        data: [{ date: '2026-02-15', count: 50 }],
        isLoading: false,
        error: null,
      };
      renderComponent();
      expect(screen.getByTestId('submission-activity-chart')).toBeInTheDocument();
    });

    it('cards gracefully degrade on error', () => {
      mockTeamCounts = { data: undefined, isLoading: false, error: new Error('fail') };
      mockDailyReturn = { data: undefined, isLoading: false, error: new Error('fail') };
      renderComponent();
      expect(screen.queryByTestId('total-submissions-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('today-progress-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('submission-activity-chart')).not.toBeInTheDocument();
    });
  });

  describe('AC1: Dashboard card content', () => {
    it('renders expected interactive cards and controls', () => {
      mockTeamOverview = {
        data: { total: 5, active: 3, inactive: 2 },
        isLoading: false,
        error: null,
      };
      mockPendingAlerts = {
        data: { unprocessedCount: 0, failedCount: 0, totalAlerts: 0 },
        isLoading: false,
        error: null,
      };
      renderComponent();
      expect(screen.getByTestId('team-overview-card')).toBeInTheDocument();
      expect(screen.getByTestId('pending-alerts-card')).toBeInTheDocument();
      expect(screen.getByLabelText('Refresh dashboard')).toBeInTheDocument();
    });
  });

  describe('prep-2: "Coming in Epic 3" removed', () => {
    it('does not render "Coming in Epic 3" text', () => {
      renderComponent();
      expect(screen.queryByText('Coming in Epic 3')).not.toBeInTheDocument();
    });
  });
});
