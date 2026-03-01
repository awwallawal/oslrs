// @vitest-environment jsdom
/**
 * StaffPaymentHistoryPage Tests — Story 6.5
 * Verifies: table render, empty state, Naira formatting, status badges,
 * Report Issue button visibility, dispute detail rendering.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockPaymentHistoryData = vi.hoisted(() => vi.fn());
const mockOpenDisputeMutate = vi.hoisted(() => vi.fn());
const mockUserId = vi.hoisted(() => 'staff-user-001');

vi.mock('../../hooks/useRemuneration', () => ({
  useMyPaymentHistory: (...args: unknown[]) => mockPaymentHistoryData(...args),
  useOpenDispute: () => ({
    mutate: mockOpenDisputeMutate,
    isPending: false,
  }),
  remunerationKeys: {
    all: ['remuneration'],
    paymentHistory: (userId: string, params: Record<string, unknown>) => ['remuneration', 'payment-history', userId, params],
  },
}));

vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: mockUserId, role: 'enumerator', email: 'staff@test.com', fullName: 'Test Staff', status: 'active' },
    isAuthenticated: true,
  }),
}));

const mockActiveRecord = {
  id: 'rec-1',
  batchId: 'batch-1',
  amount: 5000000, // 50,000.00 Naira
  status: 'active',
  effectiveFrom: '2026-02-15T10:00:00Z',
  effectiveUntil: null,
  createdAt: '2026-02-15T10:00:00Z',
  trancheName: 'February 2026 Tranche 1',
  trancheNumber: 1,
  bankReference: 'REF-001',
  disputeId: null,
  disputeStatus: null,
  disputeComment: null,
  disputeAdminResponse: null,
  disputeResolvedAt: null,
  disputeCreatedAt: null,
};

const mockDisputedRecord = {
  ...mockActiveRecord,
  id: 'rec-2',
  status: 'disputed',
  disputeId: 'dispute-1',
  disputeStatus: 'disputed',
  disputeComment: 'Payment amount is incorrect',
  disputeAdminResponse: null,
  disputeResolvedAt: null,
  disputeCreatedAt: '2026-02-16T12:00:00Z',
};

const mockCorrectedRecord = {
  ...mockActiveRecord,
  id: 'rec-3',
  status: 'corrected',
};

import StaffPaymentHistoryPage from '../StaffPaymentHistoryPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <StaffPaymentHistoryPage />
    </MemoryRouter>,
  );
}

describe('StaffPaymentHistoryPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(cleanup);

  it('should render payment history table with columns', () => {
    mockPaymentHistoryData.mockReturnValue({
      data: {
        data: [mockActiveRecord],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByTestId('staff-payment-history-page')).toBeInTheDocument();
    expect(screen.getByTestId('payment-history-table')).toBeInTheDocument();
    expect(screen.getByText('Tranche')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Bank Ref')).toBeInTheDocument();
  });

  it('should display empty state when no records', () => {
    mockPaymentHistoryData.mockReturnValue({
      data: {
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByTestId('payment-history-empty')).toBeInTheDocument();
    expect(screen.getByText(/no payment records yet/i)).toBeInTheDocument();
  });

  it('should format amount in Naira correctly', () => {
    mockPaymentHistoryData.mockReturnValue({
      data: {
        data: [mockActiveRecord], // 5000000 kobo = 50,000.00
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    const amountCell = screen.getByTestId('payment-amount');
    expect(amountCell.textContent).toContain('50,000.00');
  });

  it('should show status badges with correct text', () => {
    mockPaymentHistoryData.mockReturnValue({
      data: {
        data: [mockActiveRecord, mockDisputedRecord, mockCorrectedRecord],
        pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    const badges = screen.getAllByTestId('payment-status-badge');
    expect(badges).toHaveLength(3);
    expect(badges[0]).toHaveTextContent('active');
    expect(badges[1]).toHaveTextContent('disputed');
    expect(badges[2]).toHaveTextContent('corrected');
  });

  it('should show "Report Issue" button only for active records (AC4)', () => {
    mockPaymentHistoryData.mockReturnValue({
      data: {
        data: [mockActiveRecord, mockDisputedRecord, mockCorrectedRecord],
        pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    const reportButtons = screen.getAllByTestId('report-issue-button');
    // Only 1 button — for the active record
    expect(reportButtons).toHaveLength(1);
    expect(reportButtons[0]).toHaveTextContent('Report Issue');
  });

  it('should show dispute details when expanding a disputed record (AC5)', () => {
    mockPaymentHistoryData.mockReturnValue({
      data: {
        data: [mockDisputedRecord],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    // Click to expand
    const row = screen.getByTestId(`payment-row-${mockDisputedRecord.id}`);
    fireEvent.click(row);

    expect(screen.getByTestId('dispute-detail')).toBeInTheDocument();
    expect(screen.getByText('Payment amount is incorrect')).toBeInTheDocument();
  });

  it('should show error state on API failure', () => {
    mockPaymentHistoryData.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderPage();

    expect(screen.getByTestId('payment-history-error')).toBeInTheDocument();
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('should show loading state', () => {
    mockPaymentHistoryData.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderPage();

    expect(screen.getByText(/loading payment history/i)).toBeInTheDocument();
  });
});
