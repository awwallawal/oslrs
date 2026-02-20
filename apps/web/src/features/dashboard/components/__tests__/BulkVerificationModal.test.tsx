// @vitest-environment jsdom
/**
 * BulkVerificationModal Tests
 * Story 4.5 AC4.5.3: Form validation, character counter, submit flow, loading state.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { BulkVerificationModal } from '../BulkVerificationModal';

afterEach(() => {
  cleanup();
});

describe('BulkVerificationModal', () => {
  const defaultProps = {
    isOpen: true,
    alertCount: 15,
    onVerify: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    isPending: false,
  };

  it('renders with correct alert count in header', () => {
    render(<BulkVerificationModal {...defaultProps} />);
    expect(screen.getByText(/15 alerts selected/)).toBeInTheDocument();
  });

  it('renders textarea with character counter showing 0 / 500', () => {
    render(<BulkVerificationModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox', { name: /event context/i });
    expect(textarea).toBeInTheDocument();
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
  });

  it('disables Verify button when context is less than 10 characters', () => {
    render(<BulkVerificationModal {...defaultProps} />);
    const verifyButton = screen.getByTestId('bulk-verify-confirm');
    expect(verifyButton).toBeDisabled();

    // Type less than 10 chars
    const textarea = screen.getByRole('textbox', { name: /event context/i });
    fireEvent.change(textarea, { target: { value: 'Short' } });
    expect(verifyButton).toBeDisabled();
  });

  it('enables Verify button when context reaches 10 characters', () => {
    render(<BulkVerificationModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox', { name: /event context/i });
    fireEvent.change(textarea, { target: { value: '1234567890' } });

    const verifyButton = screen.getByTestId('bulk-verify-confirm');
    expect(verifyButton).not.toBeDisabled();
  });

  it('updates character counter as user types', () => {
    render(<BulkVerificationModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox', { name: /event context/i });
    fireEvent.change(textarea, { target: { value: 'Union meeting' } });
    expect(screen.getByTestId('character-counter')).toHaveTextContent('13 / 500');
  });

  it('truncates input at 500 characters', () => {
    render(<BulkVerificationModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox', { name: /event context/i });
    const longText = 'a'.repeat(600);
    fireEvent.change(textarea, { target: { value: longText } });
    expect(screen.getByTestId('character-counter')).toHaveTextContent('500 / 500');
  });

  it('shows minimum length message when under 10 characters', () => {
    render(<BulkVerificationModal {...defaultProps} />);
    expect(screen.getByText(/Minimum 10 characters required/)).toBeInTheDocument();
  });

  it('shows event context provided message when >= 10 characters', () => {
    render(<BulkVerificationModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox', { name: /event context/i });
    fireEvent.change(textarea, { target: { value: 'Legitimate union meeting event' } });
    expect(screen.getByText('Event context provided')).toBeInTheDocument();
  });

  it('calls onVerify with context text when Verify is clicked', async () => {
    const onVerify = vi.fn().mockResolvedValue(undefined);
    render(<BulkVerificationModal {...defaultProps} onVerify={onVerify} />);

    const textarea = screen.getByRole('textbox', { name: /event context/i });
    fireEvent.change(textarea, { target: { value: 'Legitimate union meeting at Trade Union Hall' } });
    fireEvent.click(screen.getByTestId('bulk-verify-confirm'));

    expect(onVerify).toHaveBeenCalledWith('Legitimate union meeting at Trade Union Hall');
  });

  it('shows loading state when isPending', () => {
    render(<BulkVerificationModal {...defaultProps} isPending={true} />);
    expect(screen.getByText('Verifying...')).toBeInTheDocument();
  });

  it('disables textarea when isPending', () => {
    render(<BulkVerificationModal {...defaultProps} isPending={true} />);
    const textarea = screen.getByRole('textbox', { name: /event context/i });
    expect(textarea).toBeDisabled();
  });

  it('disables Cancel button when isPending', () => {
    render(<BulkVerificationModal {...defaultProps} isPending={true} />);
    const cancelButton = screen.getByText('Cancel').closest('button');
    expect(cancelButton).toBeDisabled();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<BulkVerificationModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not render when isOpen is false', () => {
    render(<BulkVerificationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('bulk-verification-modal')).not.toBeInTheDocument();
  });
});
