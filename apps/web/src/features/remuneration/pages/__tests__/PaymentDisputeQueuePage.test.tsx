// @vitest-environment jsdom
/**
 * PaymentDisputeQueuePage Tests — Story 6.6
 * Tests: stats strip, dispute table, empty state, row selection, filter, pagination.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

expect.extend(matchers);

import { renderWithRouter } from '../../../../test-utils';
import PaymentDisputeQueuePage from '../PaymentDisputeQueuePage';

afterEach(() => {
  cleanup();
});

// ─── Mocks ────────────────────────────────────────────────────────

const mockDisputeQueue = vi.fn();
const mockDisputeStats = vi.fn();
const mockDisputeDetail = vi.fn();

vi.mock('../../hooks/useRemuneration', () => ({
  useDisputeQueue: (filters: unknown) => mockDisputeQueue(filters),
  useDisputeStats: () => mockDisputeStats(),
  useDisputeDetail: (id: string | null) => mockDisputeDetail(id),
  useAcknowledgeDispute: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useResolveDispute: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('../../components/DisputeStatusBadge', () => ({
  DisputeStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="dispute-status-badge">{status}</span>
  ),
}));

vi.mock('../../utils/format', () => ({
  formatNaira: (amount: number) => `₦${(amount / 100).toLocaleString()}`,
}));

vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

// ─── Test Data ────────────────────────────────────────────────────

const mockDisputes = [
  {
    id: 'dispute-1',
    paymentRecordId: 'rec-1',
    status: 'disputed',
    staffComment: 'Payment amount is wrong',
    adminResponse: null,
    reopenCount: 0,
    createdAt: '2026-02-15T10:00:00Z',
    resolvedAt: null,
    amount: 5000000,
    trancheName: 'Tranche 1',
    trancheNumber: 1,
    bankReference: 'REF-001',
    batchDate: '2026-02-01T00:00:00Z',
    staffName: 'Alice Johnson',
    staffEmail: 'alice@test.com',
  },
  {
    id: 'dispute-2',
    paymentRecordId: 'rec-2',
    status: 'reopened',
    staffComment: 'Still not resolved',
    adminResponse: 'We checked and the payment was made',
    reopenCount: 1,
    createdAt: '2026-02-10T10:00:00Z',
    resolvedAt: null,
    amount: 3000000,
    trancheName: 'Tranche 2',
    trancheNumber: 2,
    bankReference: null,
    batchDate: '2026-01-15T00:00:00Z',
    staffName: 'Bob Smith',
    staffEmail: 'bob@test.com',
  },
];

const mockStats = {
  totalOpen: 5,
  pending: 2,
  resolvedThisMonth: 8,
  closed: 15,
};

function setupMocks(overrides?: {
  queueData?: unknown;
  statsData?: unknown;
  queueLoading?: boolean;
}) {
  mockDisputeQueue.mockReturnValue({
    data: overrides?.queueData ?? {
      data: mockDisputes,
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    },
    isLoading: overrides?.queueLoading ?? false,
  });

  mockDisputeStats.mockReturnValue({
    data: overrides?.statsData ?? { data: mockStats },
  });

  mockDisputeDetail.mockReturnValue({
    data: null,
    isLoading: false,
  });
}

// ─── Tests ────────────────────────────────────────────────────────

describe('PaymentDisputeQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  describe('Rendering', () => {
    it('renders page header', () => {
      renderWithRouter(<PaymentDisputeQueuePage />);

      expect(screen.getByText('Payment Disputes')).toBeInTheDocument();
      expect(screen.getByText(/review and resolve staff payment disputes/i)).toBeInTheDocument();
    });

    it('renders stats strip with correct counts (AC1)', () => {
      renderWithRouter(<PaymentDisputeQueuePage />);

      expect(screen.getByTestId('dispute-stats')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // totalOpen
      expect(screen.getByText('2')).toBeInTheDocument(); // pending
      expect(screen.getByText('8')).toBeInTheDocument(); // resolvedThisMonth
      expect(screen.getByText('15')).toBeInTheDocument(); // closed
    });

    it('renders dispute table with columns', () => {
      renderWithRouter(<PaymentDisputeQueuePage />);

      expect(screen.getByTestId('dispute-queue-table')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    it('renders filter buttons', () => {
      renderWithRouter(<PaymentDisputeQueuePage />);

      expect(screen.getByTestId('filter-disputed')).toBeInTheDocument();
      expect(screen.getByTestId('filter-reopened')).toBeInTheDocument();
      expect(screen.getByTestId('filter-resolved')).toBeInTheDocument();
    });

    it('renders search input', () => {
      renderWithRouter(<PaymentDisputeQueuePage />);

      expect(screen.getByTestId('search-input')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/search by staff name/i)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('displays empty state when no disputes', () => {
      setupMocks({
        queueData: {
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        },
      });

      renderWithRouter(<PaymentDisputeQueuePage />);

      expect(screen.getByTestId('dispute-table-empty')).toBeInTheDocument();
      expect(screen.getByText(/no payment disputes/i)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading state when fetching disputes', () => {
      setupMocks({ queueLoading: true });

      renderWithRouter(<PaymentDisputeQueuePage />);

      expect(screen.getByTestId('dispute-table-loading')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('clicking row selects dispute', () => {
      renderWithRouter(<PaymentDisputeQueuePage />);

      fireEvent.click(screen.getByTestId('dispute-row-dispute-1'));

      // Detail panel should appear
      expect(mockDisputeDetail).toHaveBeenCalledWith('dispute-1');
    });

    it('filter by status works', () => {
      renderWithRouter(<PaymentDisputeQueuePage />);

      fireEvent.click(screen.getByTestId('filter-disputed'));

      // The hook should be called with updated filters
      expect(mockDisputeQueue).toHaveBeenCalledWith(
        expect.objectContaining({ status: ['disputed'] }),
      );
    });

    it('search input updates query', () => {
      renderWithRouter(<PaymentDisputeQueuePage />);

      const searchInput = screen.getByTestId('search-input');
      fireEvent.change(searchInput, { target: { value: 'Alice' } });

      expect(searchInput).toHaveValue('Alice');
    });
  });

  describe('Pagination', () => {
    it('renders pagination when multiple pages', () => {
      setupMocks({
        queueData: {
          data: mockDisputes,
          pagination: { page: 1, limit: 20, total: 40, totalPages: 2 },
        },
      });

      renderWithRouter(<PaymentDisputeQueuePage />);

      expect(screen.getByTestId('prev-page')).toBeInTheDocument();
      expect(screen.getByTestId('next-page')).toBeInTheDocument();
      expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    });

    it('does not render pagination for single page', () => {
      renderWithRouter(<PaymentDisputeQueuePage />);

      expect(screen.queryByTestId('prev-page')).not.toBeInTheDocument();
    });
  });
});
