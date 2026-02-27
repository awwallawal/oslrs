// @vitest-environment jsdom
/**
 * RemunerationPage Tests — Story 6.4
 * Verifies page renders form + table, handles loading/empty, and batch detail panel.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockBatchesData = vi.hoisted(() => ({
  data: [
    {
      id: 'batch-1',
      trancheNumber: 1,
      trancheName: 'February 2026 Tranche 1',
      description: null,
      bankReference: 'REF-001',
      staffCount: 5,
      totalAmount: 250000,
      status: 'active',
      lgaId: null,
      roleFilter: null,
      recordedBy: 'admin-1',
      createdAt: '2026-02-15T10:00:00Z',
      recordedByName: 'Admin User',
    },
  ],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
}));

const mockDetailData = vi.hoisted(() => ({
  data: {
    id: 'batch-1',
    trancheNumber: 1,
    trancheName: 'February 2026 Tranche 1',
    description: 'Test batch',
    bankReference: 'REF-001',
    staffCount: 2,
    totalAmount: 100000,
    status: 'active',
    lgaId: null,
    roleFilter: null,
    recordedBy: 'admin-1',
    createdAt: '2026-02-15T10:00:00Z',
    recordedByName: 'Admin User',
    records: [
      {
        id: 'rec-1',
        userId: 'user-1',
        amount: 50000,
        status: 'active',
        effectiveFrom: '2026-02-15T10:00:00Z',
        effectiveUntil: null,
        createdAt: '2026-02-15T10:00:00Z',
        staffName: 'John Doe',
        staffEmail: 'john@example.com',
      },
    ],
    receiptFile: null,
  },
}));

let mockBatchesReturn = { data: mockBatchesData, isLoading: false };
let mockDetailReturn = { data: mockDetailData, isLoading: false };
let mockEligibleReturn = { data: { data: [] }, isLoading: false };
const mockMutateAsync = vi.fn().mockResolvedValue({ data: { staffCount: 3 } });

vi.mock('../../hooks/useRemuneration', () => ({
  usePaymentBatches: () => mockBatchesReturn,
  useBatchDetail: () => mockDetailReturn,
  useEligibleStaff: () => mockEligibleReturn,
  useCreatePaymentBatch: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  remunerationKeys: {
    all: ['remuneration'],
    lists: () => ['remuneration', 'list'],
    list: (p: unknown) => ['remuneration', 'list', p],
    details: () => ['remuneration', 'detail'],
    detail: (id: string) => ['remuneration', 'detail', id],
    eligibleStaff: (p: unknown) => ['remuneration', 'eligible-staff', p],
  },
}));

vi.mock('../../../staff/hooks/useStaff', () => ({
  useLgas: () => ({
    data: {
      data: [
        { id: 'lga-1', name: 'Ibadan North', code: 'ibn' },
        { id: 'lga-2', name: 'Ibadan South', code: 'ibs' },
      ],
    },
  }),
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

import RemunerationPage from '../RemunerationPage';

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RemunerationPage />
    </MemoryRouter>,
  );
}

describe('RemunerationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchesReturn = { data: mockBatchesData, isLoading: false };
    mockDetailReturn = { data: mockDetailData, isLoading: false };
    mockEligibleReturn = { data: { data: [] }, isLoading: false };
  });

  it('renders page title and subtitle', () => {
    renderPage();
    expect(screen.getByText('Staff Remuneration')).toBeInTheDocument();
    expect(screen.getByText('Record and manage bulk staff payments.')).toBeInTheDocument();
  });

  it('renders the bulk recording form (step 1 visible)', () => {
    renderPage();
    expect(screen.getByText('Record New Payment')).toBeInTheDocument();
    expect(screen.getByTestId('step-1')).toBeInTheDocument();
  });

  it('renders the payment batch history table', () => {
    renderPage();
    expect(screen.getByText('Payment Batch History')).toBeInTheDocument();
    expect(screen.getByTestId('batch-table')).toBeInTheDocument();
    expect(screen.getByText('February 2026 Tranche 1')).toBeInTheDocument();
  });

  it('shows loading state for batch table', () => {
    mockBatchesReturn = { data: undefined as never, isLoading: true };
    renderPage();
    expect(screen.getByTestId('batch-table-loading')).toBeInTheDocument();
  });

  it('shows empty state when no batches exist', () => {
    mockBatchesReturn = {
      data: { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } },
      isLoading: false,
    };
    renderPage();
    expect(screen.getByTestId('batch-table-empty')).toBeInTheDocument();
  });

  it('shows batch detail panel when a batch row is clicked', () => {
    renderPage();
    const row = screen.getByTestId('batch-row-batch-1');
    fireEvent.click(row);
    expect(screen.getByTestId('batch-detail-panel')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('hides batch detail panel when close is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('batch-row-batch-1'));
    expect(screen.getByTestId('batch-detail-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByTestId('batch-detail-panel')).not.toBeInTheDocument();
  });

  it('formats amounts in Naira', () => {
    renderPage();
    // Total amount 250000 kobo = ₦2,500.00
    expect(screen.getByText('₦2,500.00')).toBeInTheDocument();
  });
});
