// @vitest-environment jsdom
/**
 * AssessorReviewActions Tests
 *
 * Story 5.2 AC #3: Final Approve triggers mutation.
 * Story 5.2 AC #4: Reject opens dialog, notes validation (min 10 chars),
 * Cancel gets initial focus.
 * Supervisor resolution badge displayed.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);

const mockMutate = vi.fn();

vi.mock('../../hooks/useAssessor', () => ({
  useAssessorReview: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { AssessorReviewActions } from '../AssessorReviewActions';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function renderComponent(props: Partial<Parameters<typeof AssessorReviewActions>[0]> = {}) {
  return render(
    <AssessorReviewActions
      detectionId="det-123"
      supervisorResolution="confirmed_fraud"
      onReviewComplete={vi.fn()}
      {...props}
    />
  );
}

describe('AssessorReviewActions', () => {
  describe('AC #3: Final Approve', () => {
    it('renders Final Approve button', () => {
      renderComponent();
      expect(screen.getByTestId('assessor-approve-btn')).toBeInTheDocument();
      expect(screen.getByTestId('assessor-approve-btn')).toHaveTextContent('Final Approve');
    });

    it('calls mutation with final_approved on click', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByTestId('assessor-approve-btn'));
      expect(mockMutate).toHaveBeenCalledWith(
        { detectionId: 'det-123', assessorResolution: 'final_approved' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });

  describe('AC #4: Reject Dialog', () => {
    it('renders Reject button', () => {
      renderComponent();
      expect(screen.getByTestId('assessor-reject-btn')).toBeInTheDocument();
      expect(screen.getByTestId('assessor-reject-btn')).toHaveTextContent('Reject');
    });

    it('opens reject dialog on Reject click', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByTestId('assessor-reject-btn'));
      await waitFor(() => {
        expect(screen.getByText('Reject Detection')).toBeInTheDocument();
      });
    });

    it('shows notes textarea in reject dialog', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByTestId('assessor-reject-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('reject-notes-input')).toBeInTheDocument();
      });
    });

    it('validates minimum 10 characters for rejection notes', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByTestId('assessor-reject-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('reject-notes-input')).toBeInTheDocument();
      });

      // Type short notes
      await user.type(screen.getByTestId('reject-notes-input'), 'too short');
      await user.click(screen.getByTestId('reject-confirm-btn'));

      // Mutation should NOT be called
      expect(mockMutate).not.toHaveBeenCalled();
      expect(screen.getByText(/minimum 10 characters/)).toBeInTheDocument();
    });

    it('calls mutation with final_rejected and notes on valid submit', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByTestId('assessor-reject-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('reject-notes-input')).toBeInTheDocument();
      });

      const validNotes = 'This submission has clear GPS anomalies and timing issues';
      await user.type(screen.getByTestId('reject-notes-input'), validNotes);
      await user.click(screen.getByTestId('reject-confirm-btn'));

      expect(mockMutate).toHaveBeenCalledWith(
        {
          detectionId: 'det-123',
          assessorResolution: 'final_rejected',
          assessorNotes: validNotes,
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('shows cancel button in reject dialog', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByTestId('assessor-reject-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('reject-cancel-btn')).toBeInTheDocument();
      });
    });

    it('shows character count', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByTestId('assessor-reject-btn'));
      await waitFor(() => {
        expect(screen.getByText('0/1000')).toBeInTheDocument();
      });
    });
  });

  describe('Supervisor resolution display', () => {
    it('shows supervisor resolution badge', () => {
      renderComponent({ supervisorResolution: 'confirmed_fraud' });
      expect(screen.getByText('Supervisor Decision:')).toBeInTheDocument();
    });

    it('does not show supervisor label when resolution is null', () => {
      renderComponent({ supervisorResolution: null });
      expect(screen.queryByText('Supervisor Decision:')).not.toBeInTheDocument();
    });
  });
});
