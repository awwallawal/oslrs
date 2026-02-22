// @vitest-environment jsdom
/**
 * AssessorCompletedPage Tests
 *
 * Story 5.2 AC #6: Completed table renders with data, sorting by date,
 * filter by decision type, skeleton loading states.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// ── Mock hook return values ───────────────────────────────────────────

let mockCompletedData = {
  data: undefined as unknown,
  isLoading: false,
  isError: false,
};

let mockDetailData = {
  data: undefined as unknown,
  isLoading: false,
};

vi.mock('../../hooks/useAssessor', () => ({
  useCompletedReviews: () => mockCompletedData,
}));

vi.mock('../../hooks/useFraudDetections', () => ({
  useFraudDetectionDetail: () => mockDetailData,
}));

import AssessorCompletedPage from '../AssessorCompletedPage';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCompletedData = { data: undefined, isLoading: false, isError: false };
  mockDetailData = { data: undefined, isLoading: false };
});

function renderComponent() {
  return render(
    <MemoryRouter>
      <AssessorCompletedPage />
    </MemoryRouter>
  );
}

const sampleCompletedItem = {
  id: 'det-001',
  submissionId: 'sub-001',
  enumeratorId: 'enum-001',
  computedAt: '2026-02-01T10:00:00Z',
  totalScore: 72.3,
  severity: 'high',
  resolution: 'confirmed_fraud',
  resolutionNotes: null,
  assessorResolution: 'final_approved',
  assessorNotes: null,
  assessorReviewedAt: '2026-02-15T14:30:00Z',
  enumeratorName: 'Jane Smith',
  submittedAt: '2026-01-28T09:00:00Z',
  lgaId: 'asa',
};

describe('AssessorCompletedPage', () => {
  describe('AC #6: Completed table', () => {
    it('renders page title', () => {
      renderComponent();
      expect(screen.getByText('Completed Reviews')).toBeInTheDocument();
    });

    it('renders subtitle', () => {
      renderComponent();
      expect(screen.getByText('History of all assessor final decisions')).toBeInTheDocument();
    });

    it('shows empty state when no completed reviews', () => {
      mockCompletedData = {
        data: { data: [], page: 1, pageSize: 20, totalPages: 0, totalItems: 0 },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No completed reviews')).toBeInTheDocument();
    });

    it('renders completed items in table', () => {
      mockCompletedData = {
        data: {
          data: [sampleCompletedItem],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('72.3')).toBeInTheDocument();
      expect(screen.getByText('Final Approved')).toBeInTheDocument();
    });

    it('renders Final Rejected badge for rejected items', () => {
      mockCompletedData = {
        data: {
          data: [{ ...sampleCompletedItem, id: 'det-002', assessorResolution: 'final_rejected' }],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      expect(screen.getByText('Final Rejected')).toBeInTheDocument();
    });

    it('renders table headers', () => {
      mockCompletedData = {
        data: {
          data: [sampleCompletedItem],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      // Use getAllByRole to verify table header cells exist
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      const headers = screen.getAllByRole('columnheader');
      const headerTexts = headers.map(h => h.textContent);
      expect(headerTexts).toContain('Enumerator');
      expect(headerTexts).toContain('LGA');
      expect(headerTexts).toContain('Score');
      expect(headerTexts).toContain('Severity');
      expect(headerTexts).toContain('Supervisor');
      expect(headerTexts).toContain('Assessor Decision');
      expect(headerTexts).toContain('Reviewed At');
      expect(headerTexts).toContain('Notes');
    });
  });

  describe('AC #10: Skeleton loading', () => {
    it('shows skeleton when loading', () => {
      mockCompletedData = { data: undefined, isLoading: true, isError: false };
      renderComponent();
      expect(screen.getByLabelText('Loading completed reviews')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error message on failure', () => {
      mockCompletedData = { data: undefined, isLoading: false, isError: true };
      renderComponent();
      expect(screen.getByText('Failed to load completed reviews')).toBeInTheDocument();
    });
  });

  describe('Filters', () => {
    it('renders decision filter', () => {
      renderComponent();
      expect(screen.getByTestId('decision-filter')).toBeInTheDocument();
    });

    it('renders severity filter buttons', () => {
      renderComponent();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
    });

    it('can change decision filter', async () => {
      const user = userEvent.setup();
      renderComponent();
      const select = screen.getByTestId('decision-filter');
      await user.selectOptions(select, 'final_approved');
      expect(select).toHaveValue('final_approved');
    });
  });

  describe('Pagination', () => {
    it('shows pagination controls', () => {
      mockCompletedData = {
        data: {
          data: [sampleCompletedItem],
          page: 1,
          pageSize: 20,
          totalPages: 2,
          totalItems: 25,
        },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    });
  });

  describe('Row selection', () => {
    it('renders clickable rows with View button', () => {
      mockCompletedData = {
        data: {
          data: [sampleCompletedItem],
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalItems: 1,
        },
        isLoading: false,
        isError: false,
      };
      renderComponent();
      expect(screen.getByTestId('completed-row-det-001')).toBeInTheDocument();
      expect(screen.getByLabelText('View evidence for Jane Smith')).toBeInTheDocument();
    });
  });
});
