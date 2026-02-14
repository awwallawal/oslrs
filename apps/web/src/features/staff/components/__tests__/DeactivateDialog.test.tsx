// @vitest-environment jsdom
/**
 * DeactivateDialog Tests
 * Story 2.5-3: Code Review - Deferred Tests
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

expect.extend(matchers);

import { renderWithRouter } from '../../../../test-utils';
import { DeactivateDialog } from '../DeactivateDialog';
import type { StaffMember } from '../../types';

afterEach(() => {
  cleanup();
});

const mockStaff: StaffMember = {
  id: 'user-1',
  fullName: 'John Doe',
  email: 'john@example.com',
  phone: '08012345678',
  status: 'active',
  roleId: 'role-1',
  roleName: 'Enumerator',
  lgaId: 'lga-1',
  lgaName: 'Ibadan North',
  createdAt: new Date().toISOString(),
  invitedAt: null,
};

describe('DeactivateDialog', () => {
  const defaultProps = {
    staff: mockStaff,
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders dialog with title', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} />);

      expect(screen.getByText('Deactivate User')).toBeInTheDocument();
    });

    it('shows staff name in confirmation message', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText(/are you sure you want to deactivate/i)).toBeInTheDocument();
    });

    it('shows warning about consequences', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} />);

      expect(screen.getByText(/immediately log the user out/i)).toBeInTheDocument();
      expect(screen.getByText(/prevent the user from logging in/i)).toBeInTheDocument();
      expect(screen.getByText(/mark their account as deactivated/i)).toBeInTheDocument();
    });

    it('shows reactivation info', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} />);

      expect(screen.getByText(/can be reactivated by a super admin/i)).toBeInTheDocument();
    });

    it('renders cancel and deactivate buttons', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onClose when cancel button is clicked', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onConfirm with userId when deactivate is clicked', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /^deactivate$/i }));

      expect(defaultProps.onConfirm).toHaveBeenCalledWith('user-1');
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when isLoading is true', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Deactivating...')).toBeInTheDocument();
    });

    it('disables cancel button when loading', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('disables deactivate button when loading', () => {
      renderWithRouter(<DeactivateDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByRole('button', { name: /deactivating/i })).toBeDisabled();
    });
  });
});
