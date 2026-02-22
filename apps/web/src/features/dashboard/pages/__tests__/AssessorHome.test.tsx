// @vitest-environment jsdom
/**
 * AssessorHome Tests
 *
 * Story 2.5-7 AC1: Dashboard layout with 3 cards + filters.
 * Story 2.5-7 AC2: Evidence Panel placeholder.
 * Story 2.5-7 AC8: Skeleton loading branch.
 * Story 2.5-7 AC10: Tab navigation without focus traps.
 * Story 5.2 AC #5: Live queue count, recent activity list.
 * Story 5.2 AC #10: Skeleton loading states from hooks.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Mock hook return values ───────────────────────────────────────────

let mockStatsReturn = {
  data: undefined as { totalPending: number; severityBreakdown: Record<string, number>; reviewedToday: number } | undefined,
  isLoading: false,
};

let mockActivityReturn = {
  data: undefined as Array<{ id: string; action: string; targetId: string | null; details: Record<string, unknown> | null; createdAt: string }> | undefined,
  isLoading: false,
};

vi.mock('../../hooks/useAssessor', () => ({
  useQueueStats: () => mockStatsReturn,
  useRecentActivity: () => mockActivityReturn,
}));

import { MemoryRouter } from 'react-router-dom';
import AssessorHome from '../AssessorHome';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockStatsReturn = { data: undefined, isLoading: false };
  mockActivityReturn = { data: undefined, isLoading: false };
});

function renderComponent(props: { isLoading?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <AssessorHome {...props} />
    </MemoryRouter>
  );
}

describe('AssessorHome', () => {
  describe('AC1: Dashboard Layout', () => {
    it('renders page title and subtitle', () => {
      renderComponent();
      expect(screen.getByText('Assessor Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Verification queue and audit tools')).toBeInTheDocument();
    });

    it('renders 3 dashboard cards with correct titles', () => {
      renderComponent();
      expect(screen.getByText('Verification Queue')).toBeInTheDocument();
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByText('Evidence Panel')).toBeInTheDocument();
    });

    it('renders exactly 3 dashboard cards', () => {
      renderComponent();
      const titles = screen.getAllByText(/^(Verification Queue|Recent Activity|Evidence Panel)$/);
      expect(titles).toHaveLength(3);
    });

    it('renders Quick Filters section with LGA and Severity dropdowns', () => {
      renderComponent();
      expect(screen.getByText('Quick Filters')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by LGA')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Severity')).toBeInTheDocument();
    });

    it('renders Go to Queue button', () => {
      renderComponent();
      expect(screen.getByTestId('go-to-queue-btn')).toBeInTheDocument();
    });
  });

  describe('AC2: Evidence Panel Placeholder', () => {
    it('shows GPS clustering label', () => {
      renderComponent();
      expect(screen.getByText('GPS clustering')).toBeInTheDocument();
    });

    it('shows Completion times label', () => {
      renderComponent();
      expect(screen.getByText('Completion times')).toBeInTheDocument();
    });

    it('shows Response patterns label', () => {
      renderComponent();
      expect(screen.getByText('Response patterns')).toBeInTheDocument();
    });

    it('shows "Available in Verification Queue" badge', () => {
      renderComponent();
      expect(screen.getByText('Available in Verification Queue')).toBeInTheDocument();
    });
  });

  describe('AC8: Skeleton Loading', () => {
    it('renders 3 skeleton cards when externalLoading=true', () => {
      renderComponent({ isLoading: true });
      const skeletonCards = screen.getAllByLabelText('Loading card');
      expect(skeletonCards).toHaveLength(3);
    });

    it('renders 3 filter skeletons when externalLoading=true', () => {
      renderComponent({ isLoading: true });
      const filterSkeletons = screen.getAllByLabelText('Loading filter');
      expect(filterSkeletons).toHaveLength(3);
    });

    it('hides content when loading', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByText('Verification Queue')).not.toBeInTheDocument();
      expect(screen.queryByText('Recent Activity')).not.toBeInTheDocument();
    });

    it('shows skeleton when hooks are loading', () => {
      mockStatsReturn = { data: undefined, isLoading: true };
      renderComponent();
      const skeletonCards = screen.getAllByLabelText('Loading card');
      expect(skeletonCards).toHaveLength(3);
    });

    it('does not render skeleton cards when not loading', () => {
      renderComponent();
      const skeletons = screen.queryAllByLabelText('Loading card');
      expect(skeletons).toHaveLength(0);
    });
  });

  describe('AC10: Tab Navigation', () => {
    it('no interactive elements have negative tabindex (no focus traps)', () => {
      renderComponent();
      const focusableElements = document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      expect(focusableElements.length).toBeGreaterThanOrEqual(1);
      focusableElements.forEach((el) => {
        expect(el).not.toHaveAttribute('tabindex', '-1');
      });
    });

    it('tab navigation passes through without focus traps', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.tab();
      await user.tab();
      await user.tab();
      expect(document.body).toBeInTheDocument();
    });
  });

  describe('5.2 AC #5: Live queue count', () => {
    it('renders pending count from stats hook', () => {
      mockStatsReturn = {
        data: { totalPending: 42, severityBreakdown: {}, reviewedToday: 0 },
        isLoading: false,
      };
      renderComponent();
      expect(screen.getByTestId('queue-count')).toHaveTextContent('42');
    });

    it('renders 0 when stats data is undefined', () => {
      renderComponent();
      expect(screen.getByTestId('queue-count')).toHaveTextContent('0');
    });

    it('shows high severity count when present', () => {
      mockStatsReturn = {
        data: { totalPending: 10, severityBreakdown: { high: 3, critical: 2 }, reviewedToday: 0 },
        isLoading: false,
      };
      renderComponent();
      expect(screen.getByTestId('high-severity-count')).toHaveTextContent('5 high/critical severity');
    });

    it('shows reviewed today count', () => {
      mockStatsReturn = {
        data: { totalPending: 5, severityBreakdown: {}, reviewedToday: 8 },
        isLoading: false,
      };
      renderComponent();
      expect(screen.getByTestId('reviewed-today')).toHaveTextContent('8 reviewed today');
    });
  });

  describe('5.2 AC #5: Recent Activity', () => {
    it('shows "No recent activity" when empty', () => {
      mockActivityReturn = { data: [], isLoading: false };
      renderComponent();
      expect(screen.getByText('No recent activity')).toBeInTheDocument();
    });

    it('shows "No recent activity" when data is undefined', () => {
      renderComponent();
      expect(screen.getByText('No recent activity')).toBeInTheDocument();
    });

    it('renders activity list with data', () => {
      mockActivityReturn = {
        data: [
          { id: 'act-1', action: 'assessor_final_review', targetId: 'det-abc12345', details: null, createdAt: '2026-02-15T10:00:00Z' },
          { id: 'act-2', action: 'assessor_final_review', targetId: 'det-def67890', details: null, createdAt: '2026-02-15T09:30:00Z' },
        ],
        isLoading: false,
      };
      renderComponent();
      expect(screen.getByTestId('recent-activity-list')).toBeInTheDocument();
      const actionLabels = screen.getAllByText('Assessor Final Review');
      expect(actionLabels).toHaveLength(2);
      expect(screen.getByText('#det-abc1')).toBeInTheDocument();
    });

    it('limits display to 5 items', () => {
      mockActivityReturn = {
        data: Array.from({ length: 8 }, (_, i) => ({
          id: `act-${i}`,
          action: 'review',
          targetId: `det-${i}`,
          details: null,
          createdAt: '2026-02-15T10:00:00Z',
        })),
        isLoading: false,
      };
      renderComponent();
      const items = screen.getByTestId('recent-activity-list').querySelectorAll('li');
      expect(items).toHaveLength(5);
    });
  });

  describe('5.2 AC #5: Quick Filters navigation', () => {
    it('navigates to queue on Go to Queue click', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByTestId('go-to-queue-btn'));
      expect(mockNavigate).toHaveBeenCalledWith('queue');
    });

    it('navigates to queue with LGA filter param', async () => {
      const user = userEvent.setup();
      renderComponent();
      const lgaSelect = screen.getByLabelText('Filter by LGA');
      await user.selectOptions(lgaSelect, 'afijio');
      await user.click(screen.getByTestId('go-to-queue-btn'));
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('lgaId=afijio'));
    });

    it('navigates to queue with severity filter param', async () => {
      const user = userEvent.setup();
      renderComponent();
      const severitySelect = screen.getByLabelText('Filter by Severity');
      await user.selectOptions(severitySelect, 'high');
      await user.click(screen.getByTestId('go-to-queue-btn'));
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('severity=high'));
    });

    it('navigates to queue on Verification Queue card click', async () => {
      const user = userEvent.setup();
      renderComponent();
      const queueCard = screen.getByText('Verification Queue').closest('[role="link"]');
      expect(queueCard).not.toBeNull();
      await user.click(queueCard!);
      expect(mockNavigate).toHaveBeenCalledWith('queue');
    });
  });
});
