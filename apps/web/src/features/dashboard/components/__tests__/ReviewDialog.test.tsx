// @vitest-environment jsdom
/**
 * ReviewDialog Tests
 * Story 4.4 AC4.4.5: Resolution selection, notes input, submit flow, loading state.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { ReviewDialog } from '../ReviewDialog';

afterEach(() => {
  cleanup();
});

describe('ReviewDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    isPending: false,
    enumeratorName: 'Adewale Johnson',
  };

  it('renders all 6 resolution options', () => {
    render(<ReviewDialog {...defaultProps} />);
    expect(screen.getByText(/False Positive/)).toBeInTheDocument();
    expect(screen.getByText('Confirmed Fraud')).toBeInTheDocument();
    expect(screen.getByText('Needs Investigation')).toBeInTheDocument();
    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(screen.getByText('Enumerator Warned')).toBeInTheDocument();
    expect(screen.getByText('Enumerator Suspended')).toBeInTheDocument();
  });

  /**
   * 13-2 R-A2 review — an imported detection has no enumerator. "Warn" and "Suspend"
   * would record an action against nobody, and the subject must say what KIND of
   * party it is rather than rendering blank or "null".
   */
  it('offers no enumerator actions for an imported detection, and labels the subject', () => {
    render(
      <ReviewDialog {...defaultProps} enumeratorName={null} importBatchId="01a071c8-0000-4000-8000-000000000000" />,
    );
    expect(screen.queryByText('Enumerator Warned')).not.toBeInTheDocument();
    expect(screen.queryByText('Enumerator Suspended')).not.toBeInTheDocument();
    expect(screen.getByText('Confirmed Fraud')).toBeInTheDocument();
    expect(screen.getByText('Imported batch')).toBeInTheDocument();
  });

  it('renders enumerator name in description', () => {
    render(<ReviewDialog {...defaultProps} />);
    expect(screen.getByText('Adewale Johnson')).toBeInTheDocument();
  });

  it('renders notes textarea with character counter', () => {
    render(<ReviewDialog {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Add any notes about this review...');
    expect(textarea).toBeInTheDocument();
    expect(screen.getByText('0/1000')).toBeInTheDocument();
  });

  it('disables submit button when no resolution is selected', () => {
    render(<ReviewDialog {...defaultProps} />);
    const submitButton = screen.getByText('Submit Review');
    expect(submitButton.closest('button')).toBeDisabled();
  });

  it('enables submit button after selecting a resolution', () => {
    render(<ReviewDialog {...defaultProps} />);
    const radio = screen.getByDisplayValue('confirmed_fraud');
    fireEvent.click(radio);
    const submitButton = screen.getByText('Submit Review');
    expect(submitButton.closest('button')).not.toBeDisabled();
  });

  it('calls onSubmit with resolution and notes on submit', () => {
    const onSubmit = vi.fn();
    render(<ReviewDialog {...defaultProps} onSubmit={onSubmit} />);

    // Select resolution
    fireEvent.click(screen.getByDisplayValue('false_positive'));

    // Type notes
    const textarea = screen.getByPlaceholderText('Add any notes about this review...');
    fireEvent.change(textarea, { target: { value: 'Not fraudulent' } });

    // Submit
    fireEvent.click(screen.getByText('Submit Review'));

    expect(onSubmit).toHaveBeenCalledWith('false_positive', 'Not fraudulent');
  });

  it('calls onSubmit without notes when notes are empty', () => {
    const onSubmit = vi.fn();
    render(<ReviewDialog {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByDisplayValue('confirmed_fraud'));
    fireEvent.click(screen.getByText('Submit Review'));

    expect(onSubmit).toHaveBeenCalledWith('confirmed_fraud', undefined);
  });

  it('shows loading state when isPending', () => {
    render(<ReviewDialog {...defaultProps} isPending={true} />);
    expect(screen.getByText('Submitting...')).toBeInTheDocument();
  });

  it('disables cancel button when isPending', () => {
    render(<ReviewDialog {...defaultProps} isPending={true} />);
    const cancelButton = screen.getByText('Cancel').closest('button');
    expect(cancelButton).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<ReviewDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('updates character counter when typing notes', () => {
    render(<ReviewDialog {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Add any notes about this review...');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(screen.getByText('5/1000')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<ReviewDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Review Fraud Detection')).not.toBeInTheDocument();
  });
});
