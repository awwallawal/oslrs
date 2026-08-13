// @vitest-environment jsdom
/**
 * StaffManagementPage Tests
 * Story 2.5-3: Code Review - Deferred Tests
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

expect.extend(matchers);

import { renderWithRouter } from '../../../../test-utils';
import StaffManagementPage from '../StaffManagementPage';

afterEach(() => {
  cleanup();
});

// Mock the hooks
const mockRefetch = vi.fn();
const mockMutate = vi.fn();

// ⚠️ The params argument is CAPTURED (Story 13-60 review H1). A mock that
// discards it cannot tell whether a filter control reaches the server, which is
// exactly how `missingPhoto` shipped wired to nothing.
const mockUseStaffList = vi.fn((_params?: unknown): { data: unknown; isLoading: boolean; refetch: typeof mockRefetch } => ({
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
  useStaffList: (params?: unknown) => mockUseStaffList(params),
  useRoles: () => mockUseRoles(),
  useUpdateRole: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useDeactivateStaff: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useReactivateStaff: () => ({
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

    /**
     * Story 13-60 AC3.1 — "who will I fail to print an ID card for?"
     *
     * ⛔ THE LOAD-BEARING ASSERTION IS ON THE QUERY PARAMS, not on the button's
     * appearance. `missingPhoto` shipped fully implemented on the server, in the
     * API client and in the types — and set by nothing, so the operator could
     * not ask the question at all. A test that only checked the toggle looked
     * pressed would have passed over exactly that hole.
     */
    it('asks the server for the ID-photo gap when the operator toggles it', () => {
      renderWithRouter(<StaffManagementPage />);

      const toggle = screen.getByRole('button', { name: /no id photo/i });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(mockUseStaffList.mock.calls.at(-1)?.[0]).not.toHaveProperty('missingPhoto');

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(mockUseStaffList.mock.calls.at(-1)?.[0]).toMatchObject({ missingPhoto: true, page: 1 });

      // …and it is a toggle, not a trap: the operator can get back to everyone.
      fireEvent.click(toggle);
      expect(mockUseStaffList.mock.calls.at(-1)?.[0]).not.toHaveProperty('missingPhoto');
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
