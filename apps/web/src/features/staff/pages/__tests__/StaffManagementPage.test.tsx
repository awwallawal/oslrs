// @vitest-environment jsdom
/**
 * StaffManagementPage Tests
 * Story 2.5-3: Code Review - Deferred Tests
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

expect.extend(matchers);

import { renderWithRouter } from '../../../../test-utils';
import StaffManagementPage from '../StaffManagementPage';

// Mock the hooks
const mockRefetch = vi.fn();
const mockMutate = vi.fn();

const mockUseStaffList = vi.fn(() => ({
  data: {
    data: [
      {
        id: '1',
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
      },
      {
        id: '2',
        fullName: 'Jane Smith',
        email: 'jane@example.com',
        phone: '08087654321',
        status: 'invited',
        roleId: 'role-2',
        roleName: 'Supervisor',
        lgaId: 'lga-2',
        lgaName: 'Oyo',
        createdAt: new Date().toISOString(),
        invitedAt: new Date().toISOString(),
      },
    ],
    meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
  },
  isLoading: false,
  refetch: mockRefetch,
}));

const mockUseRoles = vi.fn(() => ({
  data: {
    data: [
      { id: 'role-1', name: 'enumerator', description: 'Field staff' },
      { id: 'role-2', name: 'supervisor', description: 'Team lead' },
    ],
  },
}));

vi.mock('../../hooks/useStaff', () => ({
  useStaffList: () => mockUseStaffList(),
  useRoles: () => mockUseRoles(),
  useUpdateRole: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useDeactivateStaff: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useResendInvitation: () => ({
    mutate: mockMutate,
  }),
  useDownloadIdCard: () => ({
    mutate: mockMutate,
  }),
  useImportStaffCsv: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useImportStatus: () => ({
    data: null,
  }),
  useCreateStaffManual: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useLgas: () => ({
    data: {
      data: [
        { id: 'lga-1', name: 'Ibadan North' },
        { id: 'lga-2', name: 'Oyo' },
      ],
    },
  }),
}));

describe('StaffManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStaffList.mockReturnValue({
      data: {
        data: [
          {
            id: '1',
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
          },
          {
            id: '2',
            fullName: 'Jane Smith',
            email: 'jane@example.com',
            phone: '08087654321',
            status: 'invited',
            roleId: 'role-2',
            roleName: 'Supervisor',
            lgaId: 'lga-2',
            lgaName: 'Oyo',
            createdAt: new Date().toISOString(),
            invitedAt: new Date().toISOString(),
          },
        ],
        meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
      },
      isLoading: false,
      refetch: mockRefetch,
    });
  });

  describe('Rendering', () => {
    it('renders page header with title and description', () => {
      renderWithRouter(<StaffManagementPage />);

      expect(screen.getByRole('heading', { name: /staff management/i })).toBeInTheDocument();
      expect(screen.getByText(/manage staff accounts/i)).toBeInTheDocument();
    });

    it('renders Add Staff and Bulk Import buttons', () => {
      renderWithRouter(<StaffManagementPage />);

      expect(screen.getByRole('button', { name: /add staff/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /bulk import/i })).toBeInTheDocument();
    });

    it('renders search input with placeholder', () => {
      renderWithRouter(<StaffManagementPage />);

      expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument();
    });

    it('renders status filter dropdown', () => {
      renderWithRouter(<StaffManagementPage />);

      expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument();
    });

    it('renders role filter dropdown', () => {
      renderWithRouter(<StaffManagementPage />);

      expect(screen.getByDisplayValue('All Roles')).toBeInTheDocument();
    });

    it('renders staff data in table', () => {
      renderWithRouter(<StaffManagementPage />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls refetch when refresh button is clicked', () => {
      renderWithRouter(<StaffManagementPage />);

      const refreshButton = screen.getByTitle('Refresh');
      fireEvent.click(refreshButton);

      expect(mockRefetch).toHaveBeenCalled();
    });

    it('updates search input value on change', () => {
      renderWithRouter(<StaffManagementPage />);

      const searchInput = screen.getByPlaceholderText(/search by name or email/i);
      fireEvent.change(searchInput, { target: { value: 'John' } });

      expect(searchInput).toHaveValue('John');
    });

    it('updates status filter on selection', () => {
      renderWithRouter(<StaffManagementPage />);

      const statusSelect = screen.getByDisplayValue('All Statuses');
      fireEvent.change(statusSelect, { target: { value: 'active' } });

      expect(statusSelect).toHaveValue('active');
    });

    it('updates role filter on selection', () => {
      renderWithRouter(<StaffManagementPage />);

      const roleSelect = screen.getByDisplayValue('All Roles');
      fireEvent.change(roleSelect, { target: { value: 'role-1' } });

      expect(roleSelect).toHaveValue('role-1');
    });
  });

  describe('Loading State', () => {
    it('shows loading state when data is fetching', () => {
      mockUseStaffList.mockReturnValue({
        data: undefined,
        isLoading: true,
        refetch: mockRefetch,
      });

      renderWithRouter(<StaffManagementPage />);

      // Should show skeleton or loading indicator (table handles this)
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });
});
