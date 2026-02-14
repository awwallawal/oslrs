// @vitest-environment jsdom
/**
 * StaffTable Component Tests
 *
 * Story 2.5-3, AC1: Tests for staff table rendering and interactions
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { StaffTable } from '../StaffTable';
import type { StaffMember, PaginationMeta } from '../../types';

afterEach(() => {
  cleanup();
});

const mockStaff: StaffMember[] = [
  {
    id: 'user-1',
    fullName: 'John Doe',
    email: 'john@example.com',
    phone: '+2348012345678',
    status: 'active',
    roleId: 'role-1',
    roleName: 'enumerator',
    lgaId: 'lga-1',
    lgaName: 'Ibadan North',
    createdAt: '2026-01-15T10:00:00Z',
    invitedAt: '2026-01-14T10:00:00Z',
  },
  {
    id: 'user-2',
    fullName: 'Jane Smith',
    email: 'jane@example.com',
    phone: '+2348012345679',
    status: 'invited',
    roleId: 'role-2',
    roleName: 'supervisor',
    lgaId: 'lga-2',
    lgaName: 'Oyo',
    createdAt: '2026-01-16T10:00:00Z',
    invitedAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'user-3',
    fullName: 'Bob Wilson',
    email: 'bob@example.com',
    phone: null,
    status: 'deactivated',
    roleId: '',
    roleName: '',
    lgaId: null,
    lgaName: null,
    createdAt: '2026-01-17T10:00:00Z',
    invitedAt: null,
  },
];

const mockMeta: PaginationMeta = {
  total: 25,
  page: 1,
  limit: 10,
  totalPages: 3,
};

const defaultProps = {
  data: mockStaff,
  meta: mockMeta,
  isLoading: false,
  page: 1,
  onPageChange: vi.fn(),
  onResendInvitation: vi.fn(),
  onChangeRole: vi.fn(),
  onDeactivate: vi.fn(),
  onReactivate: vi.fn(),
  onDownloadIdCard: vi.fn(),
};

describe('StaffTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders correct columns', () => {
      render(<StaffTable {...defaultProps} />);

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Role')).toBeInTheDocument();
      expect(screen.getByText('LGA')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('displays staff data correctly', () => {
      render(<StaffTable {...defaultProps} />);

      // First staff member
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('Enumerator')).toBeInTheDocument();
      expect(screen.getByText('Ibadan North')).toBeInTheDocument();

      // Second staff member
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    });

    it('displays status badges with correct labels', () => {
      render(<StaffTable {...defaultProps} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Invited')).toBeInTheDocument();
      expect(screen.getByText('Deactivated')).toBeInTheDocument();
    });

    it('shows placeholder for missing role/LGA', () => {
      render(<StaffTable {...defaultProps} />);

      // Bob Wilson has no role and no LGA
      const unassignedElements = screen.getAllByText('Unassigned');
      expect(unassignedElements.length).toBeGreaterThan(0);

      const dashElements = screen.getAllByText('-');
      expect(dashElements.length).toBeGreaterThan(0);
    });

    it('shows empty state when no data', () => {
      render(<StaffTable {...defaultProps} data={[]} />);

      expect(screen.getByText('No staff members found')).toBeInTheDocument();
      expect(
        screen.getByText(/Try adjusting your search or filters/)
      ).toBeInTheDocument();
    });

    it('renders skeleton during loading', () => {
      render(<StaffTable {...defaultProps} isLoading={true} />);

      // SkeletonTable uses aria-label="Loading table" and aria-busy="true"
      const skeleton = screen.getByLabelText('Loading table');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Pagination', () => {
    it('displays pagination controls when multiple pages', () => {
      render(<StaffTable {...defaultProps} />);

      expect(screen.getByText('Page 1 of 3 (25 total)')).toBeInTheDocument();
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('disables Previous button on first page', () => {
      render(<StaffTable {...defaultProps} page={1} />);

      const prevButton = screen.getByText('Previous');
      expect(prevButton).toBeDisabled();
    });

    it('disables Next button on last page', () => {
      render(<StaffTable {...defaultProps} page={3} />);

      const nextButton = screen.getByText('Next');
      expect(nextButton).toBeDisabled();
    });

    it('calls onPageChange when clicking Next', () => {
      const onPageChange = vi.fn();
      render(<StaffTable {...defaultProps} page={1} onPageChange={onPageChange} />);

      fireEvent.click(screen.getByText('Next'));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('calls onPageChange when clicking Previous', () => {
      const onPageChange = vi.fn();
      render(<StaffTable {...defaultProps} page={2} onPageChange={onPageChange} />);

      fireEvent.click(screen.getByText('Previous'));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('hides pagination when single page', () => {
      const singlePageMeta = { ...mockMeta, totalPages: 1, total: 3 };
      render(<StaffTable {...defaultProps} meta={singlePageMeta} />);

      expect(screen.queryByText('Previous')).not.toBeInTheDocument();
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
    });
  });

  describe('Actions Menu', () => {
    it('shows actions menu button for each row with actions', () => {
      render(<StaffTable {...defaultProps} />);

      // Active, invited, and deactivated users all have action menus
      // (deactivated users have a reactivate action)
      const menuButtons = screen.getAllByLabelText('Open actions menu');
      expect(menuButtons.length).toBe(3); // John (active), Jane (invited), Bob (deactivated - reactivate)
    });
  });
});
