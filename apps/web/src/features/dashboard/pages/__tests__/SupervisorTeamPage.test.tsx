// @vitest-environment jsdom
/**
 * SupervisorTeamPage Tests
 *
 * Story 4.1: Supervisor Team Dashboard
 * Tests roster rendering, map markers, loading/empty/error states, and refresh.
 * Follows vi.hoisted + vi.mock pattern from SupervisorHome.test.tsx.
 * Test selectors: text content, data-testid, ARIA roles only (A3 compliance).
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

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

let mockMetrics = {
  data: undefined as { enumerators: Array<{
    id: string; fullName: string; status: string; lastLoginAt: string | null;
    dailyCount: number; weeklyCount: number; lastSubmittedAt: string | null;
  }> } | undefined,
  isLoading: false,
  error: null as Error | null,
};

let mockGps = {
  data: undefined as { points: Array<{
    enumeratorId: string; enumeratorName: string;
    latitude: number; longitude: number; submittedAt: string;
  }> } | undefined,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../../hooks/useSupervisor', () => ({
  useTeamMetrics: () => mockMetrics,
  useTeamGps: () => mockGps,
  supervisorKeys: { all: ['supervisor'] },
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: ({ className }: { className?: string }) => <div aria-label="Loading card" className={className} />,
  SkeletonTable: ({ rows, columns }: { rows?: number; columns?: number }) => (
    <div aria-label="Loading table" data-rows={rows} data-columns={columns} />
  ),
}));

// Mock TeamGpsMap (jsdom can't render Leaflet)
vi.mock('../../components/TeamGpsMap', () => ({
  TeamGpsMap: ({ points }: { points: Array<{ enumeratorId: string }> }) => (
    <div data-testid="gps-map-container" data-point-count={points.length}>
      Map with {points.length} markers
    </div>
  ),
}));

import SupervisorTeamPage from '../SupervisorTeamPage';

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderComponent() {
  return render(<SupervisorTeamPage />);
}

const sampleEnumerators = [
  {
    id: 'enum-1', fullName: 'Alice Enumerator', status: 'active', lastLoginAt: null,
    dailyCount: 5, weeklyCount: 20, lastSubmittedAt: '2026-02-18T09:00:00Z',
  },
  {
    id: 'enum-2', fullName: 'Bob Enumerator', status: 'verified', lastLoginAt: '2026-02-18T10:00:00Z',
    dailyCount: 3, weeklyCount: 15, lastSubmittedAt: '2026-02-18T08:00:00Z',
  },
  {
    id: 'enum-3', fullName: 'Charlie Idle', status: 'inactive', lastLoginAt: null,
    dailyCount: 0, weeklyCount: 0, lastSubmittedAt: null,
  },
];

const sampleGpsPoints = [
  { enumeratorId: 'enum-1', enumeratorName: 'Alice Enumerator', latitude: 7.3775, longitude: 3.947, submittedAt: '2026-02-18T09:00:00Z' },
  { enumeratorId: 'enum-2', enumeratorName: 'Bob Enumerator', latitude: 7.38, longitude: 3.95, submittedAt: '2026-02-18T08:00:00Z' },
];

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockMetrics = { data: undefined, isLoading: false, error: null };
  mockGps = { data: undefined, isLoading: false, error: null };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SupervisorTeamPage', () => {
  describe('Page layout', () => {
    it('renders page heading', () => {
      renderComponent();
      expect(screen.getByText('Team Progress')).toBeInTheDocument();
      expect(screen.getByText('Monitor your assigned enumerators')).toBeInTheDocument();
    });

    it('renders refresh button with accessible label', () => {
      renderComponent();
      expect(screen.getByLabelText('Refresh team data')).toBeInTheDocument();
    });

    it('displays Last Updated timestamp', () => {
      renderComponent();
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });

  describe('Loading state (AC 4.1.5)', () => {
    it('renders skeleton table and card when loading', () => {
      mockMetrics = { data: undefined, isLoading: true, error: null };
      mockGps = { data: undefined, isLoading: true, error: null };
      renderComponent();
      expect(screen.getByTestId('team-loading')).toBeInTheDocument();
      expect(screen.getByLabelText('Loading table')).toBeInTheDocument();
      expect(screen.getByLabelText('Loading card')).toBeInTheDocument();
    });

    it('does not render roster during loading', () => {
      mockMetrics = { data: undefined, isLoading: true, error: null };
      renderComponent();
      expect(screen.queryByTestId('team-roster')).not.toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('renders error card when metrics fail', () => {
      mockMetrics = { data: undefined, isLoading: false, error: new Error('fail') };
      renderComponent();
      expect(screen.getByTestId('team-error')).toBeInTheDocument();
      expect(screen.getByText('Unable to load team data')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('renders empty state when no enumerators assigned', () => {
      mockMetrics = { data: { enumerators: [] }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('team-empty')).toBeInTheDocument();
      expect(screen.getByText('No enumerators assigned yet')).toBeInTheDocument();
    });
  });

  describe('Roster rendering (AC 4.1.1)', () => {
    it('renders team roster with enumerator names', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: { points: [] }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('team-roster')).toBeInTheDocument();
      expect(screen.getByText('Alice Enumerator')).toBeInTheDocument();
      expect(screen.getByText('Bob Enumerator')).toBeInTheDocument();
      expect(screen.getByText('Charlie Idle')).toBeInTheDocument();
    });

    it('renders roster count in header', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: { points: [] }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByText('Team Roster (3)')).toBeInTheDocument();
    });

    it('renders status badges for each enumerator', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: { points: [] }, isLoading: false, error: null };
      renderComponent();
      const badges = screen.getAllByTestId('status-badge');
      expect(badges).toHaveLength(3);
    });

    it('renders daily and weekly counts', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: { points: [] }, isLoading: false, error: null };
      renderComponent();
      const dailyCounts = screen.getAllByTestId('daily-count');
      expect(dailyCounts[0]).toHaveTextContent('5');
      expect(dailyCounts[1]).toHaveTextContent('3');
      expect(dailyCounts[2]).toHaveTextContent('0');
    });

    it('renders enumerator rows for each team member', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: { points: [] }, isLoading: false, error: null };
      renderComponent();
      const rows = screen.getAllByTestId('enumerator-row');
      expect(rows).toHaveLength(3);
    });

    it('renders table with accessible label', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: { points: [] }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByLabelText('Team roster')).toBeInTheDocument();
    });
  });

  describe('GPS Map (AC 4.1.3)', () => {
    it('renders map when GPS points available', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: { points: sampleGpsPoints }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('team-map')).toBeInTheDocument();
      expect(screen.getByTestId('gps-map-container')).toBeInTheDocument();
      expect(screen.getByText('Map with 2 markers')).toBeInTheDocument();
    });

    it('renders empty map state when no GPS data', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: { points: [] }, isLoading: false, error: null };
      renderComponent();
      expect(screen.getByTestId('map-empty')).toBeInTheDocument();
      expect(screen.getByText('No GPS data available yet')).toBeInTheDocument();
    });

    it('renders map error state', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: undefined, isLoading: false, error: new Error('fail') };
      renderComponent();
      expect(screen.getByTestId('map-error')).toBeInTheDocument();
      expect(screen.getByText('Unable to load map data')).toBeInTheDocument();
    });
  });

  describe('Refresh behavior (AC 4.1.4)', () => {
    it('invalidates supervisor query caches on refresh', () => {
      mockMetrics = { data: { enumerators: sampleEnumerators }, isLoading: false, error: null };
      mockGps = { data: { points: [] }, isLoading: false, error: null };
      renderComponent();
      fireEvent.click(screen.getByLabelText('Refresh team data'));
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['supervisor'],
      });
    });

    it('updates timestamp on refresh click', () => {
      vi.useFakeTimers();
      renderComponent();
      const timestampBefore = screen.getByText(/Last updated:/).textContent;
      vi.advanceTimersByTime(60_000);
      fireEvent.click(screen.getByLabelText('Refresh team data'));
      const timestampAfter = screen.getByText(/Last updated:/).textContent;
      expect(timestampAfter).not.toBe(timestampBefore);
      vi.useRealTimers();
    });
  });
});
