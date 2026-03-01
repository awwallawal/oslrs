// @vitest-environment jsdom
/**
 * ReopenDisputeDialog Tests — Story 6.6
 * Tests: reopen count display, comment validation, submission, loading states.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

expect.extend(matchers);

import { renderWithRouter } from '../../../../test-utils';
import { ReopenDisputeDialog } from '../ReopenDisputeDialog';

afterEach(() => {
  cleanup();
});

// ─── Mocks ────────────────────────────────────────────────────────

const mockMutate = vi.fn();
let mockIsPending = false;

vi.mock('../../hooks/useRemuneration', () => ({
  useReopenDispute: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────

describe('ReopenDisputeDialog', () => {
  const defaultProps = {
    disputeId: 'dispute-1',
    reopenCount: 0,
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending = false;
  });

  describe('Rendering', () => {
    it('renders dialog with title', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      expect(screen.getByText('Reopen Payment Dispute')).toBeInTheDocument();
    });

    it('renders comment textarea', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      expect(screen.getByTestId('reopen-comment-input')).toBeInTheDocument();
    });

    it('renders cancel and reopen buttons', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByTestId('reopen-dispute-button')).toBeInTheDocument();
    });
  });

  describe('Reopen Count', () => {
    it('shows reopen count warning when reopenCount > 0', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} reopenCount={2} />);

      expect(screen.getByText(/reopened 2 times before/i)).toBeInTheDocument();
    });

    it('does not show reopen warning when reopenCount is 0', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} reopenCount={0} />);

      expect(screen.queryByText(/reopened.*before/i)).not.toBeInTheDocument();
    });

    it('uses singular "time" for reopenCount of 1', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} reopenCount={1} />);

      expect(screen.getByText(/reopened 1 time before/i)).toBeInTheDocument();
    });
  });

  describe('Comment Validation', () => {
    it('shows validation error when comment < 10 characters', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      const textarea = screen.getByTestId('reopen-comment-input');
      fireEvent.change(textarea, { target: { value: 'short' } });

      expect(screen.getByTestId('reopen-comment-error')).toBeInTheDocument();
      expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
    });

    it('does not show error for 10+ character comment', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      const textarea = screen.getByTestId('reopen-comment-input');
      fireEvent.change(textarea, { target: { value: 'This is a valid comment' } });

      expect(screen.queryByTestId('reopen-comment-error')).not.toBeInTheDocument();
    });

    it('reopen button is disabled when comment < 10 chars', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      const textarea = screen.getByTestId('reopen-comment-input');
      fireEvent.change(textarea, { target: { value: 'short' } });

      expect(screen.getByTestId('reopen-dispute-button')).toBeDisabled();
    });

    it('reopen button is enabled when comment >= 10 chars', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      const textarea = screen.getByTestId('reopen-comment-input');
      fireEvent.change(textarea, { target: { value: 'This is a valid comment for reopen' } });

      expect(screen.getByTestId('reopen-dispute-button')).not.toBeDisabled();
    });
  });

  describe('Submission', () => {
    it('calls mutation with correct data on submit', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      const textarea = screen.getByTestId('reopen-comment-input');
      fireEvent.change(textarea, { target: { value: 'The payment still has not appeared in my bank account' } });

      fireEvent.click(screen.getByTestId('reopen-dispute-button'));

      expect(mockMutate).toHaveBeenCalledWith(
        {
          disputeId: 'dispute-1',
          data: { staffComment: 'The payment still has not appeared in my bank account' },
        },
        expect.any(Object),
      );
    });

    it('does not submit when comment is too short', () => {
      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      const textarea = screen.getByTestId('reopen-comment-input');
      fireEvent.change(textarea, { target: { value: 'short' } });

      fireEvent.click(screen.getByTestId('reopen-dispute-button'));

      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows loading text when submitting', () => {
      mockIsPending = true;

      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      expect(screen.getByText('Reopening...')).toBeInTheDocument();
    });

    it('disables textarea during submission', () => {
      mockIsPending = true;

      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      expect(screen.getByTestId('reopen-comment-input')).toBeDisabled();
    });

    it('disables cancel button during submission', () => {
      mockIsPending = true;

      renderWithRouter(<ReopenDisputeDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
  });
});
