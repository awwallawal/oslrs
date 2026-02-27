// @vitest-environment jsdom
/**
 * PaymentBatchTable Tests — Story 6.4
 * Verifies batch history table rendering, pagination, and click handling.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import PaymentBatchTable, { formatNaira } from '../PaymentBatchTable';
import type { PaymentBatch } from '../../api/remuneration.api';

afterEach(() => {
  cleanup();
});

const mockBatches: PaymentBatch[] = [
  {
    id: 'batch-1',
    trancheNumber: 1,
    trancheName: 'February Tranche 1',
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
  {
    id: 'batch-2',
    trancheNumber: 2,
    trancheName: 'February Tranche 2',
    description: 'Second batch',
    bankReference: null,
    staffCount: 10,
    totalAmount: 500000,
    status: 'pending',
    lgaId: null,
    roleFilter: null,
    recordedBy: 'admin-1',
    createdAt: '2026-02-20T10:00:00Z',
    recordedByName: null,
  },
];

const defaultPagination = { page: 1, limit: 10, total: 2, totalPages: 1 };

describe('PaymentBatchTable', () => {
  let onPageChange: (page: number) => void;
  let onBatchClick: (batchId: string) => void;

  beforeEach(() => {
    onPageChange = vi.fn<(page: number) => void>();
    onBatchClick = vi.fn<(batchId: string) => void>();
  });

  it('renders loading state', () => {
    render(
      <PaymentBatchTable
        batches={[]}
        pagination={defaultPagination}
        onPageChange={onPageChange}
        onBatchClick={onBatchClick}
        isLoading
      />,
    );
    expect(screen.getByTestId('batch-table-loading')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(
      <PaymentBatchTable
        batches={[]}
        pagination={defaultPagination}
        onPageChange={onPageChange}
        onBatchClick={onBatchClick}
      />,
    );
    expect(screen.getByTestId('batch-table-empty')).toBeInTheDocument();
  });

  it('renders batch rows with correct data', () => {
    render(
      <PaymentBatchTable
        batches={mockBatches}
        pagination={defaultPagination}
        onPageChange={onPageChange}
        onBatchClick={onBatchClick}
      />,
    );
    expect(screen.getByTestId('batch-table')).toBeInTheDocument();
    expect(screen.getByText('February Tranche 1')).toBeInTheDocument();
    expect(screen.getByText('February Tranche 2')).toBeInTheDocument();
    expect(screen.getByText('₦2,500.00')).toBeInTheDocument();
    expect(screen.getByText('₦5,000.00')).toBeInTheDocument();
  });

  it('shows recorded by name or dash when missing', () => {
    render(
      <PaymentBatchTable
        batches={mockBatches}
        pagination={defaultPagination}
        onPageChange={onPageChange}
        onBatchClick={onBatchClick}
      />,
    );
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('fires onBatchClick when a row is clicked', () => {
    render(
      <PaymentBatchTable
        batches={mockBatches}
        pagination={defaultPagination}
        onPageChange={onPageChange}
        onBatchClick={onBatchClick}
      />,
    );
    fireEvent.click(screen.getByTestId('batch-row-batch-1'));
    expect(onBatchClick).toHaveBeenCalledWith('batch-1');
  });

  it('shows pagination when multiple pages exist', () => {
    const multiPagePagination = { page: 1, limit: 10, total: 25, totalPages: 3 };
    render(
      <PaymentBatchTable
        batches={mockBatches}
        pagination={multiPagePagination}
        onPageChange={onPageChange}
        onBatchClick={onBatchClick}
      />,
    );
    expect(screen.getByText('Page 1 of 3 (25 total)')).toBeInTheDocument();
  });

  it('does not show pagination for single page', () => {
    render(
      <PaymentBatchTable
        batches={mockBatches}
        pagination={defaultPagination}
        onPageChange={onPageChange}
        onBatchClick={onBatchClick}
      />,
    );
    expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
  });
});

describe('formatNaira', () => {
  it('formats kobo to Naira with 2 decimal places', () => {
    expect(formatNaira(100000)).toBe('₦1,000.00');
    expect(formatNaira(50050)).toBe('₦500.50');
    expect(formatNaira(0)).toBe('₦0.00');
  });
});
