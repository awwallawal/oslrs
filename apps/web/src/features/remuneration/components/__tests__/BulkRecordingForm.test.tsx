// @vitest-environment jsdom
/**
 * BulkRecordingForm Tests — Story 6.4
 * Verifies 3-step form flow: staff selection → batch details → review & confirm.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { staffCount: 2 } }));

const mockStaff = vi.hoisted(() => [
  {
    id: 'staff-1',
    fullName: 'John Doe',
    email: 'john@example.com',
    bankName: 'First Bank',
    accountNumber: '1234567890',
    accountName: 'John Doe',
    lgaId: 'lga-1',
    lgaName: 'Ibadan North',
    roleId: 'enumerator',
  },
  {
    id: 'staff-2',
    fullName: 'Jane Smith',
    email: 'jane@example.com',
    bankName: 'GTBank',
    accountNumber: '9876543210',
    accountName: 'Jane Smith',
    lgaId: 'lga-2',
    lgaName: 'Ibadan South',
    roleId: 'supervisor',
  },
]);

vi.mock('../../hooks/useRemuneration', () => ({
  useEligibleStaff: () => ({ data: { data: mockStaff }, isLoading: false }),
  useCreatePaymentBatch: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

import BulkRecordingForm from '../BulkRecordingForm';

afterEach(() => {
  cleanup();
});

const lgas = [
  { id: 'lga-1', name: 'Ibadan North' },
  { id: 'lga-2', name: 'Ibadan South' },
];

function renderForm() {
  return render(<BulkRecordingForm lgas={lgas} />);
}

describe('BulkRecordingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Step 1 ──────────────────────────────────────────────────────────
  it('renders step 1 with staff selection table', () => {
    renderForm();
    expect(screen.getByTestId('step-1')).toBeInTheDocument();
    expect(screen.getByText('Record New Payment')).toBeInTheDocument();
    expect(screen.getByTestId('staff-selection-table')).toBeInTheDocument();
  });

  it('disables "Next" button when no staff selected', () => {
    renderForm();
    const next = screen.getByTestId('proceed-to-step-2');
    expect(next).toBeDisabled();
  });

  it('enables "Next" button after selecting staff', () => {
    renderForm();
    // Select first staff via checkbox
    fireEvent.click(screen.getByLabelText('Select John Doe'));
    const next = screen.getByTestId('proceed-to-step-2');
    expect(next).not.toBeDisabled();
  });

  // ── Step 2 ──────────────────────────────────────────────────────────
  it('proceeds to step 2 and shows batch detail fields', () => {
    renderForm();
    fireEvent.click(screen.getByLabelText('Select John Doe'));
    fireEvent.click(screen.getByTestId('proceed-to-step-2'));

    expect(screen.getByTestId('step-2')).toBeInTheDocument();
    expect(screen.getByTestId('tranche-name')).toBeInTheDocument();
    expect(screen.getByTestId('amount-input')).toBeInTheDocument();
    expect(screen.getByTestId('receipt-upload')).toBeInTheDocument();
  });

  it('disables "Next: Review" when tranche name and amount are empty', () => {
    renderForm();
    fireEvent.click(screen.getByLabelText('Select John Doe'));
    fireEvent.click(screen.getByTestId('proceed-to-step-2'));

    expect(screen.getByTestId('proceed-to-step-3')).toBeDisabled();
  });

  it('can go back to step 1 from step 2', () => {
    renderForm();
    fireEvent.click(screen.getByLabelText('Select John Doe'));
    fireEvent.click(screen.getByTestId('proceed-to-step-2'));
    expect(screen.getByTestId('step-2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByTestId('step-1')).toBeInTheDocument();
  });

  // ── Step 3 ──────────────────────────────────────────────────────────
  it('proceeds to step 3 review when form is valid', () => {
    renderForm();
    // Step 1: select staff
    fireEvent.click(screen.getByLabelText('Select John Doe'));
    fireEvent.click(screen.getByLabelText('Select Jane Smith'));
    fireEvent.click(screen.getByTestId('proceed-to-step-2'));

    // Step 2: fill in batch details
    fireEvent.change(screen.getByTestId('tranche-name'), { target: { value: 'Feb Tranche' } });
    fireEvent.change(screen.getByTestId('amount-input'), { target: { value: '5000' } });
    fireEvent.click(screen.getByTestId('proceed-to-step-3'));

    // Step 3: review
    expect(screen.getByTestId('step-3')).toBeInTheDocument();
    expect(screen.getByText(/Feb Tranche/)).toBeInTheDocument();
    expect(screen.getByTestId('staff-count')).toHaveTextContent('2');
  });

  it('shows total amount in Naira format on review step', () => {
    renderForm();
    fireEvent.click(screen.getByLabelText('Select John Doe'));
    fireEvent.click(screen.getByTestId('proceed-to-step-2'));

    fireEvent.change(screen.getByTestId('tranche-name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByTestId('amount-input'), { target: { value: '5000' } });
    fireEvent.click(screen.getByTestId('proceed-to-step-3'));

    // 5000 Naira = 500000 kobo for 1 staff
    expect(screen.getByTestId('total-amount')).toHaveTextContent('₦5,000.00');
  });

  it('submits batch and resets form on success', async () => {
    renderForm();
    fireEvent.click(screen.getByLabelText('Select John Doe'));
    fireEvent.click(screen.getByTestId('proceed-to-step-2'));

    fireEvent.change(screen.getByTestId('tranche-name'), { target: { value: 'Test Tranche' } });
    fireEvent.change(screen.getByTestId('amount-input'), { target: { value: '5000' } });
    fireEvent.click(screen.getByTestId('proceed-to-step-3'));

    fireEvent.click(screen.getByTestId('confirm-submit'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          trancheName: 'Test Tranche',
          amount: 500000, // 5000 Naira = 500000 kobo
          staffIds: ['staff-1'],
        }),
      );
    });

    // After submit, form resets to step 1
    await waitFor(() => {
      expect(screen.getByTestId('step-1')).toBeInTheDocument();
    });
  });

  it('can navigate back to step 2 from step 3', () => {
    renderForm();
    fireEvent.click(screen.getByLabelText('Select John Doe'));
    fireEvent.click(screen.getByTestId('proceed-to-step-2'));
    fireEvent.change(screen.getByTestId('tranche-name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('amount-input'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('proceed-to-step-3'));

    expect(screen.getByTestId('step-3')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByTestId('step-2')).toBeInTheDocument();
  });
});
