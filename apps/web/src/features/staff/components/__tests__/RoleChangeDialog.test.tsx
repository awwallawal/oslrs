// @vitest-environment jsdom
/**
 * RoleChangeDialog Tests
 * Story 2.5-3: Code Review - Deferred Tests
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

expect.extend(matchers);

import { renderWithRouter } from '../../../../test-utils';
import { RoleChangeDialog } from '../RoleChangeDialog';
import type { StaffMember } from '../../types';

afterEach(() => {
  cleanup();
});

// Mock the hooks
const mockUseRoles = vi.fn(() => ({
  data: {
    data: [
      { id: 'role-1', name: 'enumerator', description: 'Field staff' },
      { id: 'role-2', name: 'supervisor', description: 'Team lead' },
      { id: 'role-3', name: 'super_admin', description: 'Administrator' },
    ],
  },
  isLoading: false,
}));

vi.mock('../../hooks/useStaff', () => ({
  useRoles: () => mockUseRoles(),
}));

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

describe('RoleChangeDialog', () => {
  const defaultProps = {
    staff: mockStaff,
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRoles.mockReturnValue({
      data: {
        data: [
          { id: 'role-1', name: 'enumerator', description: 'Field staff' },
          { id: 'role-2', name: 'supervisor', description: 'Team lead' },
          { id: 'role-3', name: 'super_admin', description: 'Administrator' },
        ],
      },
      isLoading: false,
    });
  });

  describe('Rendering', () => {
    it('renders dialog with title', () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} />);

      expect(screen.getByRole('heading', { name: /change role/i })).toBeInTheDocument();
    });

    it('shows staff name in description', () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('renders role dropdown', () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('shows session invalidation warning', () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} />);

      expect(screen.getByText(/invalidate all active sessions/i)).toBeInTheDocument();
    });

    it('renders cancel and change role buttons', () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change role/i })).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onClose when cancel button is clicked', () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('disables change role button when role unchanged', () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} />);

      // Initial role is already selected
      expect(screen.getByRole('button', { name: /change role/i })).toBeDisabled();
    });

    it('enables change role button when different role selected', async () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'role-2' } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /change role/i })).not.toBeDisabled();
      });
    });

    it('calls onConfirm with userId and roleId when confirmed', async () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'role-2' } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /change role/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: /change role/i }));

      expect(defaultProps.onConfirm).toHaveBeenCalledWith('user-1', 'role-2');
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when isLoading is true', () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Updating...')).toBeInTheDocument();
    });

    it('disables cancel button when loading', () => {
      renderWithRouter(<RoleChangeDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
  });
});
