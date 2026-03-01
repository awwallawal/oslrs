// @vitest-environment jsdom
/**
 * DisputeDetailPanel Tests — Story 6.6
 * Tests: rendering sections, status-based action buttons, admin response display.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

expect.extend(matchers);

import { renderWithRouter } from '../../../../test-utils';
import { DisputeDetailPanel } from '../DisputeDetailPanel';

afterEach(() => {
  cleanup();
});

// ─── Mocks ────────────────────────────────────────────────────────

const mockDisputeDetail = vi.fn();
const mockAcknowledge = vi.fn();

vi.mock('../../hooks/useRemuneration', () => ({
  useDisputeDetail: (id: string) => mockDisputeDetail(id),
  useAcknowledgeDispute: () => ({
    mutate: mockAcknowledge,
    isPending: false,
  }),
}));

vi.mock('../DisputeStatusBadge', () => ({
  DisputeStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="dispute-status-badge">{status}</span>
  ),
}));

vi.mock('../../utils/format', () => ({
  formatNaira: (amount: number) => `₦${(amount / 100).toLocaleString()}`,
}));

vi.mock('../../../../lib/api-client', () => ({
  API_BASE_URL: 'http://localhost:3000/api/v1',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
}));

// ─── Test Data ────────────────────────────────────────────────────

function makeDisputeData(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: {
        id: 'dispute-1',
        paymentRecordId: 'rec-1',
        status: 'disputed',
        staffComment: 'Payment amount is incorrect',
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
        staffLgaName: 'Ibadan North',
        staffRoleName: 'Enumerator',
        resolvedByName: null,
        evidenceFile: null,
        evidenceFileId: null,
        ...overrides,
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('DisputeDetailPanel', () => {
  const defaultProps = {
    disputeId: 'dispute-1',
    onResolve: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders staff info, payment details, and dispute timeline', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData(),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByTestId('dispute-detail-panel')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Enumerator')).toBeInTheDocument();
      expect(screen.getByText('Ibadan North')).toBeInTheDocument();
      expect(screen.getByText('Tranche 1')).toBeInTheDocument();
    });

    it('renders staff comment', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData(),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByTestId('staff-comment-0')).toBeInTheDocument();
      expect(screen.getByText('Payment amount is incorrect')).toBeInTheDocument();
    });

    it('shows loading skeleton', () => {
      mockDisputeDetail.mockReturnValue({
        data: null,
        isLoading: true,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByTestId('dispute-detail-loading')).toBeInTheDocument();
    });

    it('shows error state', () => {
      mockDisputeDetail.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByTestId('dispute-detail-error')).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('shows "Acknowledge" button for disputed status', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData({ status: 'disputed' }),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByTestId('acknowledge-button')).toBeInTheDocument();
      expect(screen.getByText('Acknowledge Dispute')).toBeInTheDocument();
    });

    it('shows "Resolve" button for pending_resolution status', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData({ status: 'pending_resolution' }),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByTestId('resolve-button')).toBeInTheDocument();
      expect(screen.getByText('Resolve Dispute')).toBeInTheDocument();
    });

    it('shows "Resolve" button for reopened status', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData({ status: 'reopened', reopenCount: 1 }),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByTestId('resolve-button')).toBeInTheDocument();
    });

    it('shows read-only view for closed status', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData({ status: 'closed' }),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByText(/closed — no further action/i)).toBeInTheDocument();
      expect(screen.queryByTestId('acknowledge-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resolve-button')).not.toBeInTheDocument();
    });

    it('shows resolved info for resolved status', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData({
          status: 'resolved',
          adminResponse: 'Payment was confirmed',
          resolvedByName: 'Admin User',
          resolvedAt: '2026-02-20T14:00:00Z',
        }),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByText(/resolved — staff can reopen/i)).toBeInTheDocument();
      expect(screen.getByText('Payment was confirmed')).toBeInTheDocument();
      expect(screen.getByText(/admin user/i)).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onClose when close button is clicked', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData(),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId('close-detail-panel'));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls acknowledge mutation when acknowledge button is clicked', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData({ status: 'disputed' }),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId('acknowledge-button'));
      expect(mockAcknowledge).toHaveBeenCalledWith('dispute-1');
    });

    it('calls onResolve when resolve button is clicked', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData({ status: 'pending_resolution' }),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId('resolve-button'));
      expect(defaultProps.onResolve).toHaveBeenCalled();
    });
  });

  describe('Evidence Download', () => {
    it('shows evidence download button when evidence exists', () => {
      mockDisputeDetail.mockReturnValue({
        ...makeDisputeData({
          status: 'resolved',
          adminResponse: 'Payment confirmed',
          evidenceFile: {
            id: 'file-1',
            originalFilename: 'bank-proof.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
            s3Key: 'dispute-evidence/proof.pdf',
          },
          evidenceFileId: 'file-1',
          resolvedByName: 'Admin',
          resolvedAt: '2026-02-20T14:00:00Z',
        }),
        isLoading: false,
        isError: false,
      });

      renderWithRouter(<DisputeDetailPanel {...defaultProps} />);

      expect(screen.getByTestId('download-evidence-button')).toBeInTheDocument();
      expect(screen.getByText('bank-proof.pdf')).toBeInTheDocument();
    });
  });
});
