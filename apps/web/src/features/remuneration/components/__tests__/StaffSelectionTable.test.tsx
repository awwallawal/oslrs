// @vitest-environment jsdom
/**
 * StaffSelectionTable Tests — Story 6.4
 * Verifies staff selection, checkbox behavior, bank detail masking, and filtering.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import StaffSelectionTable from '../StaffSelectionTable';
import type { EligibleStaff } from '../../api/remuneration.api';

afterEach(() => {
  cleanup();
});

const mockStaff: EligibleStaff[] = [
  {
    id: 'staff-1',
    fullName: 'John Doe',
    email: 'john@example.com',
    bankName: 'First Bank',
    accountNumber: '1234567890',
    accountName: 'John Doe',
    lgaId: 'lga-1',
    lgaName: 'Ibadan North',
    roleId: 'enumerator',
  },
  {
    id: 'staff-2',
    fullName: 'Jane Smith',
    email: 'jane@example.com',
    bankName: 'GTBank',
    accountNumber: '9876543210',
    accountName: 'Jane Smith',
    lgaId: 'lga-2',
    lgaName: 'Ibadan South',
    roleId: 'supervisor',
  },
  {
    id: 'staff-3',
    fullName: 'No Bank User',
    email: 'nobank@example.com',
    bankName: null,
    accountNumber: null,
    accountName: null,
    lgaId: 'lga-1',
    lgaName: 'Ibadan North',
    roleId: 'enumerator',
  },
];

describe('StaffSelectionTable', () => {
  let onSelectionChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelectionChange = vi.fn();
  });

  it('renders loading state', () => {
    render(
      <StaffSelectionTable staff={[]} selectedIds={[]} onSelectionChange={onSelectionChange} isLoading />,
    );
    expect(screen.getByTestId('staff-selection-loading')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(
      <StaffSelectionTable staff={[]} selectedIds={[]} onSelectionChange={onSelectionChange} />,
    );
    expect(screen.getByTestId('staff-selection-empty')).toBeInTheDocument();
  });

  it('renders staff rows with names and emails', () => {
    render(
      <StaffSelectionTable staff={mockStaff} selectedIds={[]} onSelectionChange={onSelectionChange} />,
    );
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('masks account numbers showing only last 4 digits', () => {
    render(
      <StaffSelectionTable staff={mockStaff} selectedIds={[]} onSelectionChange={onSelectionChange} />,
    );
    expect(screen.getByText('****7890')).toBeInTheDocument();
    expect(screen.getByText('****3210')).toBeInTheDocument();
  });

  it('shows "No bank details" for staff without bank info', () => {
    render(
      <StaffSelectionTable staff={mockStaff} selectedIds={[]} onSelectionChange={onSelectionChange} />,
    );
    expect(screen.getByText('No bank details')).toBeInTheDocument();
  });

  it('disables checkbox for staff without bank details', () => {
    render(
      <StaffSelectionTable staff={mockStaff} selectedIds={[]} onSelectionChange={onSelectionChange} />,
    );
    const noBankCheckbox = screen.getByLabelText('Select No Bank User');
    expect(noBankCheckbox).toBeDisabled();
  });

  it('toggles individual staff selection', () => {
    render(
      <StaffSelectionTable staff={mockStaff} selectedIds={[]} onSelectionChange={onSelectionChange} />,
    );
    const checkbox = screen.getByLabelText('Select John Doe');
    fireEvent.click(checkbox);
    expect(onSelectionChange).toHaveBeenCalledWith(['staff-1']);
  });

  it('deselects staff when already selected', () => {
    render(
      <StaffSelectionTable staff={mockStaff} selectedIds={['staff-1']} onSelectionChange={onSelectionChange} />,
    );
    const checkbox = screen.getByLabelText('Select John Doe');
    fireEvent.click(checkbox);
    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('select-all selects only staff with bank details', () => {
    render(
      <StaffSelectionTable staff={mockStaff} selectedIds={[]} onSelectionChange={onSelectionChange} />,
    );
    const selectAll = screen.getByLabelText('Select all staff');
    fireEvent.click(selectAll);
    expect(onSelectionChange).toHaveBeenCalledWith(['staff-1', 'staff-2']);
  });

  it('select-all deselects when all eligible are selected', () => {
    render(
      <StaffSelectionTable
        staff={mockStaff}
        selectedIds={['staff-1', 'staff-2']}
        onSelectionChange={onSelectionChange}
      />,
    );
    const selectAll = screen.getByLabelText('Select all staff');
    fireEvent.click(selectAll);
    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('displays correct selection count', () => {
    render(
      <StaffSelectionTable staff={mockStaff} selectedIds={['staff-1']} onSelectionChange={onSelectionChange} />,
    );
    expect(screen.getByText(/1 of 2 eligible staff selected/)).toBeInTheDocument();
    expect(screen.getByText(/1 without bank details/)).toBeInTheDocument();
  });
});
