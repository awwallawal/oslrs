// @vitest-environment jsdom
/**
 * AssessorQueuePage Tests
 *
 * Story 5.2 AC #1: Queue renders with data, split-panel on row click, skeleton loading.
 * Story 5.2 AC #7: Filter controls render and dispatch.
 * Story 5.2 AC #9: RBAC access restrictions (tested at route level).
 * Story 5.2 AC #10: Skeleton loading states.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// ── Mock hook return values ───────────────────────────────────────────

let mockQueueData = {
  data: undefined as unknown,
  isLoading: false,
  isError: false,
};

let mockStatsData = {
  data: undefined as unknown,
};

let mockDetailData = {
  data: undefined as unknown,
  isLoading: false,
};

vi.mock('../../hooks/useAssessor', () => ({
  useAuditQueue: () => mockQueueData,
  useQueueStats: () => mockStatsData,
  useAssessorReview: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('../../hooks/useFraudDetections', () => ({
  useFraudDetectionDetail: () => mockDetailData,
}));

import AssessorQueuePage from '../AssessorQueuePage';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockQueueData = { data: undefined, isLoading: false, isError: false };
  mockStatsData = { data: undefined };
  mockDetailData = { data: undefined, isLoading: false };
});

function renderComponent() {
  return render(
    <MemoryRouter>
      <AssessorQueuePage />
    </MemoryRouter>
  );
}

const sampleQueueItem = {
  id: 'det-001',
  submissionId: 'sub-001',
  enumeratorId: 'enum-001',
  computedAt: '2026-02-01T10:00:00Z',
  totalScore: 85.5,
  severity: 'high',
  resolution: 'confirmed_fraud',
  resolutionNotes: null,
  reviewedAt: '2026-02-01T12:00:00Z',
  enumeratorName: 'John Doe',
  submittedAt: '2026-01-30T08:00:00Z',
  lgaId: 'ilorin_west',
};

describe('AssessorQueuePage', () => {
  describe('AC #1: Queue rendering', () => {
    it('renders page title', () => {
      renderComponent();
      expect(screen.getByText('Verification Queue')).toBeInTheDocument();
    });

    it('renders subtitle', () => {
      renderComponent();
      expect(screen.getByText('Review and finalize fraud detection decisions')).toBeInTheDocument();
    });

    it('shows empty state when no data', () => {
      mockQueueData = {
        data: { data: [], page: 1, pageSize: 20, totalPages: 0, totalItems: 0 },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No submissions in queue')).toBeInTheDocument();
    });

    it('renders queue items in table', () => {
      mockQueueData = {
        data: {
          data: [sampleQueueItem],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('85.5')).toBeInTheDocument();
    });
  });

  describe('AC #10: Skeleton loading', () => {
    it('shows skeleton when loading', () => {
      mockQueueData = { data: undefined, isLoading: true, isError: false };
      renderComponent();
      expect(screen.getByLabelText('Loading audit queue')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error message on failure', () => {
      mockQueueData = { data: undefined, isLoading: false, isError: true };
      renderComponent();
      expect(screen.getByText('Failed to load audit queue')).toBeInTheDocument();
    });
  });

  describe('AC #5: Stats strip', () => {
    it('shows pending count in stats strip', () => {
      mockStatsData = {
        data: { totalPending: 12, reviewedToday: 3, severityBreakdown: { high: 4, critical: 1 } },
      };
      renderComponent();
      expect(screen.getByText('12 pending')).toBeInTheDocument();
    });

    it('shows reviewed today count', () => {
      mockStatsData = {
        data: { totalPending: 5, reviewedToday: 7, severityBreakdown: {} },
      };
      renderComponent();
      expect(screen.getByText('7 reviewed today')).toBeInTheDocument();
    });
  });

  describe('AC #7: Filters', () => {
    it('renders filter bar', () => {
      renderComponent();
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    });

    it('renders LGA filter', () => {
      renderComponent();
      expect(screen.getByTestId('lga-filter')).toBeInTheDocument();
    });

    it('renders supervisor resolution filter', () => {
      renderComponent();
      expect(screen.getByTestId('resolution-filter')).toBeInTheDocument();
    });

    it('renders date range filters', () => {
      renderComponent();
      expect(screen.getByTestId('date-from')).toBeInTheDocument();
      expect(screen.getByTestId('date-to')).toBeInTheDocument();
    });

    it('renders enumerator search input', () => {
      renderComponent();
      expect(screen.getByTestId('enumerator-search')).toBeInTheDocument();
    });

    it('renders severity filter buttons', () => {
      renderComponent();
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('toggles severity filter on click', async () => {
      const user = userEvent.setup();
      renderComponent();
      const highBtn = screen.getByText('High');
      await user.click(highBtn);
      // After click the button should have the active style (bg-neutral-900)
      expect(highBtn.className).toContain('bg-neutral-900');
    });
  });

  describe('Pagination', () => {
    it('shows pagination when data is loaded', () => {
      mockQueueData = {
        data: {
          data: [sampleQueueItem],
          page: 1,
          pageSize: 20,
          totalPages: 3,
          totalItems: 50,
        },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
      expect(screen.getByText('50 items', { exact: false })).toBeInTheDocument();
    });

    it('disables Previous button on first page', () => {
      mockQueueData = {
        data: {
          data: [sampleQueueItem],
          page: 1,
          pageSize: 20,
          totalPages: 3,
          totalItems: 50,
        },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      const prevBtn = screen.getByText('Previous').closest('button');
      expect(prevBtn).toBeDisabled();
    });
  });
});
