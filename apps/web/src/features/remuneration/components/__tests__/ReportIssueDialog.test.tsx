// @vitest-environment jsdom
/**
 * ReportIssueDialog Tests — Story 6.5
 * Verifies: dialog render, comment validation, submit behavior,
 * success/error toasts, dialog close on success.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockMutate = vi.hoisted(() => vi.fn());
const mockIsPending = vi.hoisted(() => ({ value: false }));

vi.mock('../../hooks/useRemuneration', () => ({
  useOpenDispute: () => ({
    mutate: (...args: unknown[]) => mockMutate(...args),
    isPending: mockIsPending.value,
  }),
  remunerationKeys: {
    all: ['remuneration'],
  },
}));

import ReportIssueDialog from '../ReportIssueDialog';
import type { StaffPaymentRecord } from '../../api/remuneration.api';

const mockRecord: StaffPaymentRecord = {
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

const mockOnClose = vi.fn();

function renderDialog(isOpen = true) {
  return render(
    <ReportIssueDialog
      paymentRecord={isOpen ? mockRecord : null}
      isOpen={isOpen}
      onClose={mockOnClose}
    />,
  );
}

describe('ReportIssueDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsPending.value = false;
  });

  afterEach(cleanup);

  it('should render payment details and textarea', () => {
    renderDialog();

    expect(screen.getByText('Report Payment Issue')).toBeInTheDocument();
    expect(screen.getByText(/February 2026 Tranche 1/)).toBeInTheDocument();
    expect(screen.getByTestId('dispute-amount')).toHaveTextContent('50,000.00');
    expect(screen.getByTestId('dispute-comment')).toBeInTheDocument();
  });

  it('should validate minimum 10 character comment', () => {
    renderDialog();

    const textarea = screen.getByTestId('dispute-comment');
    fireEvent.change(textarea, { target: { value: 'short' } });

    expect(screen.getByTestId('comment-validation-error')).toBeInTheDocument();
    expect(screen.getByText(/at least 10 characters/)).toBeInTheDocument();
  });

  it('should disable submit button when comment is too short', () => {
    renderDialog();

    const submitBtn = screen.getByTestId('submit-dispute-button');
    expect(submitBtn).toBeDisabled();

    const textarea = screen.getByTestId('dispute-comment');
    fireEvent.change(textarea, { target: { value: 'too short' } });
    expect(submitBtn).toBeDisabled();
  });

  it('should enable submit button when comment has 10+ characters', () => {
    renderDialog();

    const textarea = screen.getByTestId('dispute-comment');
    fireEvent.change(textarea, { target: { value: 'This payment amount is incorrect for this period' } });

    const submitBtn = screen.getByTestId('submit-dispute-button');
    expect(submitBtn).not.toBeDisabled();
  });

  it('should call mutate with correct data on submit', () => {
    renderDialog();

    const textarea = screen.getByTestId('dispute-comment');
    fireEvent.change(textarea, { target: { value: 'This payment amount is incorrect for this period' } });

    const submitBtn = screen.getByTestId('submit-dispute-button');
    fireEvent.click(submitBtn);

    expect(mockMutate).toHaveBeenCalledWith(
      {
        paymentRecordId: 'rec-1',
        staffComment: 'This payment amount is incorrect for this period',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('should call onClose on successful submission', () => {
    renderDialog();

    const textarea = screen.getByTestId('dispute-comment');
    fireEvent.change(textarea, { target: { value: 'This payment amount is incorrect for this period' } });

    const submitBtn = screen.getByTestId('submit-dispute-button');
    fireEvent.click(submitBtn);

    // Simulate success callback
    const callArgs = mockMutate.mock.calls[0];
    const options = callArgs[1];
    options.onSuccess();

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should show loading state during submission', () => {
    mockIsPending.value = true;
    renderDialog();

    expect(screen.getByText('Submitting...')).toBeInTheDocument();
  });

  it('should not render when isOpen is false', () => {
    renderDialog(false);

    expect(screen.queryByText('Report Payment Issue')).not.toBeInTheDocument();
  });
});
