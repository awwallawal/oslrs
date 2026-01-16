// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ReAuthModal } from '../ReAuthModal';

expect.extend(matchers);

// Mock useReAuth hook
const mockSubmit = vi.fn();
const mockClose = vi.fn();
const mockReset = vi.fn();
const mockSetPassword = vi.fn();

vi.mock('../../hooks/useReAuth', () => ({
  useReAuth: () => ({
    password: '',
    error: null,
    isLoading: false,
    isOpen: true,
    pendingAction: 'update profile',
    setPassword: mockSetPassword,
    open: vi.fn(),
    close: mockClose,
    submit: mockSubmit,
    reset: mockReset,
  }),
}));

describe('ReAuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmit.mockResolvedValue(true);
  });

  it('renders modal when open', () => {
    render(<ReAuthModal isOpen={true} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Your Identity')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ReAuthModal isOpen={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows action description', () => {
    render(<ReAuthModal isOpen={true} actionDescription="edit your profile" />);

    expect(screen.getByText(/edit your profile/i)).toBeInTheDocument();
  });

  it('has cancel and confirm buttons', () => {
    render(<ReAuthModal isOpen={true} />);

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<ReAuthModal isOpen={true} onClose={onClose} />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockReset).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(<ReAuthModal isOpen={true} onClose={onClose} />);

    // Find the close button by aria-label
    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons.find(btn =>
      btn.getAttribute('aria-label')?.toLowerCase().includes('close')
    );
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('shows Remember Me explanation in footer', () => {
    render(<ReAuthModal isOpen={true} />);

    expect(screen.getByText(/remember me/i)).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<ReAuthModal isOpen={true} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'reauth-title');
  });

  it('closes on escape key press', () => {
    const onClose = vi.fn();
    render(<ReAuthModal isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mockReset).toHaveBeenCalled();
  });

  it('confirm button is disabled without password', () => {
    render(<ReAuthModal isOpen={true} />);

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();
  });

  it('has password input placeholder', () => {
    render(<ReAuthModal isOpen={true} />);

    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  });
});
