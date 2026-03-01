// @vitest-environment jsdom
/**
 * ResolutionDialog Tests — Story 6.6
 * Tests: form rendering, validation, file upload, submission states.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

expect.extend(matchers);

import { renderWithRouter } from '../../../../test-utils';
import { ResolutionDialog } from '../ResolutionDialog';
import type { DisputeDetail } from '../../api/remuneration.api';

afterEach(() => {
  cleanup();
});

// ─── Mocks ────────────────────────────────────────────────────────

const mockMutate = vi.fn();

vi.mock('../../hooks/useRemuneration', () => ({
  useResolveDispute: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock('../../utils/format', () => ({
  formatNaira: (amount: number) => `₦${(amount / 100).toLocaleString()}`,
}));

// ─── Test Data ────────────────────────────────────────────────────

const mockDispute: DisputeDetail = {
  id: 'dispute-1',
  paymentRecordId: 'rec-1',
  status: 'pending_resolution',
  staffComment: 'Payment amount is incorrect for this month',
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
  evidenceFileId: null,
  updatedAt: '2026-02-15T10:00:00Z',
  resolvedBy: null,
  recordStatus: 'disputed',
  staffLgaId: null,
  staffRoleId: null,
  staffLgaName: null,
  staffRoleName: null,
  resolvedByName: null,
  evidenceFile: null,
  openedBy: 'user-1',
};

// ─── Tests ────────────────────────────────────────────────────────

describe('ResolutionDialog', () => {
  const defaultProps = {
    dispute: mockDispute,
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders dialog title and dispute summary', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      expect(screen.getByText('Resolve Payment Dispute')).toBeInTheDocument();
      expect(screen.getByText(/alice johnson/i)).toBeInTheDocument();
      expect(screen.getByText(/tranche 1/i)).toBeInTheDocument();
    });

    it('renders resolution response textarea', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      const textarea = screen.getByTestId('resolution-response-input');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue('');
    });

    it('renders evidence upload button', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      expect(screen.getByTestId('upload-evidence-button')).toBeInTheDocument();
      expect(screen.getByText(/evidence \(optional\)/i)).toBeInTheDocument();
    });

    it('renders cancel and resolve buttons', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByTestId('resolve-dispute-button')).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('resolve button is disabled when response is empty', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      const resolveButton = screen.getByTestId('resolve-dispute-button');
      expect(resolveButton).toBeDisabled();
    });

    it('resolve button is enabled when response is provided', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      const textarea = screen.getByTestId('resolution-response-input');
      fireEvent.change(textarea, { target: { value: 'Payment confirmed via bank records' } });

      const resolveButton = screen.getByTestId('resolve-dispute-button');
      expect(resolveButton).not.toBeDisabled();
    });
  });

  describe('File Upload', () => {
    it('shows file name after selection', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      const fileInput = screen.getByTestId('evidence-file-input');
      const file = new File(['fake-content'], 'proof.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('proof.png')).toBeInTheDocument();
      expect(screen.getByTestId('remove-evidence-button')).toBeInTheDocument();
    });

    it('shows error for invalid file type', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      const fileInput = screen.getByTestId('evidence-file-input');
      const file = new File(['fake-content'], 'doc.txt', { type: 'text/plain' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByTestId('file-error')).toBeInTheDocument();
      expect(screen.getByText(/only png, jpeg, and pdf/i)).toBeInTheDocument();
    });

    it('removes file when remove button is clicked', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      const fileInput = screen.getByTestId('evidence-file-input');
      const file = new File(['fake-content'], 'proof.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });
      expect(screen.getByText('proof.png')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('remove-evidence-button'));
      expect(screen.queryByText('proof.png')).not.toBeInTheDocument();
    });
  });

  describe('Submission', () => {
    it('calls mutation on submit with response text', () => {
      renderWithRouter(<ResolutionDialog {...defaultProps} />);

      const textarea = screen.getByTestId('resolution-response-input');
      fireEvent.change(textarea, { target: { value: 'Payment was confirmed via bank transfer' } });

      fireEvent.click(screen.getByTestId('resolve-dispute-button'));

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          disputeId: 'dispute-1',
          data: expect.objectContaining({
            adminResponse: 'Payment was confirmed via bank transfer',
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('Null State', () => {
    it('returns null when dispute is null', () => {
      const { container } = renderWithRouter(
        <ResolutionDialog {...defaultProps} dispute={null} />,
      );

      expect(container.innerHTML).toBe('');
    });
  });
});
