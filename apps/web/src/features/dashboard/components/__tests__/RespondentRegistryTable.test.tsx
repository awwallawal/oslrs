// @vitest-environment jsdom
/**
 * RespondentRegistryTable Tests
 *
 * Story 5.5 Task 5: Role-based column visibility, sortable headers,
 * row click navigation, pagination controls, empty state.
 *
 * Tests:
 * - Renders all 11 columns for super_admin
 * - Hides PII columns (firstName, nin, phoneNumber) for supervisor
 * - Shows skeleton table during loading
 * - Row click calls navigate
 * - Pagination controls (Previous/Next) visible
 * - Shows "No respondents found" for empty data
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/dashboard/super-admin/registry' }),
  };
});

vi.mock('../../../../components/skeletons/SkeletonTable', () => ({
  SkeletonTable: ({ columns, rows }: { columns: number; rows: number }) => (
    <div data-testid="registry-table-skeleton" aria-label="Loading table" aria-busy="true">
      skeleton-cols:{columns}-rows:{rows}
    </div>
  ),
}));

vi.mock('../FraudSeverityBadge', () => ({
  FraudSeverityBadge: ({ severity }: { severity: string }) => (
    <span data-testid="fraud-badge">{severity}</span>
  ),
}));

import { RespondentRegistryTable } from '../RespondentRegistryTable';
import type { RespondentListItem } from '@oslsr/types';

// ── Test Data ───────────────────────────────────────────────────────────────

const mockRespondent: RespondentListItem = {
  id: 'resp-1',
  firstName: 'John',
  lastName: 'Doe',
  nin: '12345678901',
  phoneNumber: '+2348012345678',
  gender: 'male',
  lgaId: 'lga-1',
  lgaName: 'Ibadan North',
  source: 'enumerator',
  enumeratorId: 'enum-1',
  enumeratorName: 'Enumerator A',
  formName: 'Test Form',
  registeredAt: '2026-02-15T10:00:00Z',
  fraudSeverity: 'low',
  fraudTotalScore: 15,
  verificationStatus: 'pending_review',
};

const mockRespondent2: RespondentListItem = {
  id: 'resp-2',
  firstName: 'Jane',
  lastName: 'Smith',
  nin: '98765432100',
  phoneNumber: '+2348087654321',
  gender: 'female',
  lgaId: 'lga-2',
  lgaName: 'Oyo',
  source: 'public',
  enumeratorId: null,
  enumeratorName: null,
  formName: 'Registration Form',
  registeredAt: '2026-02-16T14:00:00Z',
  fraudSeverity: null,
  fraudTotalScore: null,
  verificationStatus: 'auto_clean',
};

const defaultProps = {
  data: [mockRespondent, mockRespondent2],
  isLoading: false,
  userRole: 'super_admin',
  sorting: [{ id: 'registeredAt', desc: true }],
  onSortingChange: vi.fn(),
  pagination: {
    pageSize: 20,
    hasNextPage: true,
    hasPreviousPage: false,
  },
  onNextPage: vi.fn(),
  onPreviousPage: vi.fn(),
  pageSize: 20,
  onPageSizeChange: vi.fn(),
};

// ── Helpers ─────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RespondentRegistryTable', () => {
  it('renders all 11 columns for super_admin', () => {
    render(<RespondentRegistryTable {...defaultProps} />);

    const table = screen.getByTestId('registry-table');
    expect(table).toBeInTheDocument();

    // All 11 column headers: Name, NIN, Phone, Gender, LGA, Channel, Enumerator, Form, Date, Fraud, Status
    // Use getAllByText where the header text also appears in cell data
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('NIN')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('Form')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Fraud')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    // These header texts also appear as cell values, so use getAllByText
    const lgaMatches = screen.getAllByText('LGA');
    expect(lgaMatches.length).toBeGreaterThanOrEqual(1);
    const enumeratorMatches = screen.getAllByText('Enumerator');
    expect(enumeratorMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('hides PII columns (firstName, nin, phoneNumber) for supervisor', () => {
    render(<RespondentRegistryTable {...defaultProps} userRole="supervisor" />);

    const table = screen.getByTestId('registry-table');
    expect(table).toBeInTheDocument();

    // PII columns should be hidden
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
    expect(screen.queryByText('NIN')).not.toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();

    // Non-PII columns should remain visible
    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.getByText('LGA')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
  });

  it('shows skeleton table during loading', () => {
    render(<RespondentRegistryTable {...defaultProps} isLoading={true} />);

    const skeleton = screen.getByTestId('registry-table-skeleton');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.textContent).toContain('skeleton-cols:11');
  });

  it('shows skeleton with 8 columns for supervisor loading', () => {
    render(<RespondentRegistryTable {...defaultProps} isLoading={true} userRole="supervisor" />);

    const skeleton = screen.getByTestId('registry-table-skeleton');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.textContent).toContain('skeleton-cols:8');
  });

  it('row click calls navigate', () => {
    render(<RespondentRegistryTable {...defaultProps} />);

    const row = screen.getByTestId('registry-row-resp-1');
    expect(row).toBeInTheDocument();
    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/super-admin/respondent/resp-1');
  });

  it('pagination controls (Previous/Next) visible', () => {
    render(<RespondentRegistryTable {...defaultProps} />);

    const prevBtn = screen.getByTestId('prev-page');
    const nextBtn = screen.getByTestId('next-page');

    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();
    expect(prevBtn.textContent).toContain('Previous');
    expect(nextBtn.textContent).toContain('Next');
  });

  it('disables Previous when hasPreviousPage is false', () => {
    render(<RespondentRegistryTable {...defaultProps} />);

    const prevBtn = screen.getByTestId('prev-page');
    expect(prevBtn).toBeDisabled();
  });

  it('enables Next when hasNextPage is true', () => {
    render(<RespondentRegistryTable {...defaultProps} />);

    const nextBtn = screen.getByTestId('next-page');
    expect(nextBtn).not.toBeDisabled();
  });

  it('calls onNextPage when Next is clicked', () => {
    const onNextPage = vi.fn();
    render(<RespondentRegistryTable {...defaultProps} onNextPage={onNextPage} />);

    fireEvent.click(screen.getByTestId('next-page'));
    expect(onNextPage).toHaveBeenCalledTimes(1);
  });

  it('shows "No respondents found" for empty data', () => {
    render(<RespondentRegistryTable {...defaultProps} data={[]} />);

    expect(screen.getByText(/No respondents found/)).toBeInTheDocument();
  });

  it('renders page size select', () => {
    render(<RespondentRegistryTable {...defaultProps} />);

    const select = screen.getByTestId('page-size-select');
    expect(select).toBeInTheDocument();
  });
});
