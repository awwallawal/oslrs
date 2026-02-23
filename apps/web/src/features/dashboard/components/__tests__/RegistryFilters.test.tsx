// @vitest-environment jsdom
/**
 * RegistryFilters Tests
 *
 * Story 5.5 Task 6: 9 filter controls with role-based visibility.
 *
 * Tests:
 * - Renders all 9 filter controls for PII roles (super_admin)
 * - Search field hidden for supervisor
 * - LGA dropdown disabled for supervisor
 * - Clear Filters button resets filters
 * - Filter change triggers onFilterChange callback
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: mockUseQuery,
  };
});

vi.mock('../../api/export.api', () => ({
  fetchLgas: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../api/registry.api', () => ({
  fetchFormList: vi.fn().mockResolvedValue([]),
  fetchEnumeratorList: vi.fn().mockResolvedValue([]),
}));

import { RegistryFilters } from '../RegistryFilters';

// ── Helpers ─────────────────────────────────────────────────────────────────

const baseFilters = {
  pageSize: 20,
  sortBy: 'registeredAt' as const,
  sortOrder: 'desc' as const,
};

const filtersWithValues = {
  ...baseFilters,
  lgaId: 'lga-1',
  gender: 'male',
  source: 'enumerator',
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockReturnValue({ data: [], isLoading: false });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RegistryFilters', () => {
  it('renders all 9 filter controls for PII roles (super_admin)', () => {
    render(
      <RegistryFilters
        filters={baseFilters}
        onFilterChange={vi.fn()}
        userRole="super_admin"
      />,
    );

    expect(screen.getByTestId('registry-filters')).toBeInTheDocument();

    // 9 filter controls
    expect(screen.getByTestId('filter-lga')).toBeInTheDocument();
    expect(screen.getByTestId('filter-gender')).toBeInTheDocument();
    expect(screen.getByTestId('filter-source')).toBeInTheDocument();
    expect(screen.getByTestId('filter-date-from')).toBeInTheDocument();
    expect(screen.getByTestId('filter-date-to')).toBeInTheDocument();
    expect(screen.getByTestId('filter-verification-status')).toBeInTheDocument();
    expect(screen.getByTestId('filter-severity')).toBeInTheDocument();
    expect(screen.getByTestId('filter-form')).toBeInTheDocument();
    expect(screen.getByTestId('filter-enumerator')).toBeInTheDocument();

    // Search should be visible for super_admin (PII role)
    expect(screen.getByTestId('filter-search')).toBeInTheDocument();
  });

  it('search field hidden for supervisor', () => {
    render(
      <RegistryFilters
        filters={baseFilters}
        onFilterChange={vi.fn()}
        userRole="supervisor"
        userLgaId="lga-1"
      />,
    );

    // Search should NOT be rendered for supervisor
    expect(screen.queryByTestId('filter-search')).not.toBeInTheDocument();

    // Other filters should still be visible
    expect(screen.getByTestId('filter-lga')).toBeInTheDocument();
    expect(screen.getByTestId('filter-gender')).toBeInTheDocument();
  });

  it('LGA dropdown disabled for supervisor', () => {
    render(
      <RegistryFilters
        filters={baseFilters}
        onFilterChange={vi.fn()}
        userRole="supervisor"
        userLgaId="lga-1"
      />,
    );

    const lgaSelect = screen.getByTestId('filter-lga');
    expect(lgaSelect).toBeDisabled();
  });

  it('LGA dropdown enabled for super_admin', () => {
    render(
      <RegistryFilters
        filters={baseFilters}
        onFilterChange={vi.fn()}
        userRole="super_admin"
      />,
    );

    const lgaSelect = screen.getByTestId('filter-lga');
    expect(lgaSelect).not.toBeDisabled();
  });

  it('Clear Filters button resets filters', () => {
    const onFilterChange = vi.fn();

    render(
      <RegistryFilters
        filters={filtersWithValues}
        onFilterChange={onFilterChange}
        userRole="super_admin"
      />,
    );

    // Clear Filters button should be visible when filters are active
    const clearBtn = screen.getByTestId('clear-filters');
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);

    // Should call onFilterChange with only pagination/sort fields (reset filters)
    expect(onFilterChange).toHaveBeenCalledWith({
      pageSize: 20,
      sortBy: 'registeredAt',
      sortOrder: 'desc',
    });
  });

  it('Clear Filters button not shown when no active filters', () => {
    render(
      <RegistryFilters
        filters={baseFilters}
        onFilterChange={vi.fn()}
        userRole="super_admin"
      />,
    );

    expect(screen.queryByTestId('clear-filters')).not.toBeInTheDocument();
  });

  it('filter change triggers onFilterChange callback', () => {
    const onFilterChange = vi.fn();

    render(
      <RegistryFilters
        filters={baseFilters}
        onFilterChange={onFilterChange}
        userRole="super_admin"
      />,
    );

    const genderSelect = screen.getByTestId('filter-gender');
    fireEvent.change(genderSelect, { target: { value: 'female' } });

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        gender: 'female',
        cursor: undefined,
      }),
    );
  });

  it('severity filter renders as multi-select with checkbox options', () => {
    render(
      <RegistryFilters
        filters={baseFilters}
        onFilterChange={vi.fn()}
        userRole="super_admin"
      />,
    );

    const severityFilter = screen.getByTestId('filter-severity');
    expect(severityFilter).toBeInTheDocument();

    // Click to open severity dropdown
    fireEvent.click(severityFilter.querySelector('button')!);

    // Should show 5 severity checkboxes
    expect(screen.getByTestId('severity-clean')).toBeInTheDocument();
    expect(screen.getByTestId('severity-low')).toBeInTheDocument();
    expect(screen.getByTestId('severity-medium')).toBeInTheDocument();
    expect(screen.getByTestId('severity-high')).toBeInTheDocument();
    expect(screen.getByTestId('severity-critical')).toBeInTheDocument();
  });

  it('severity multi-select sends comma-separated values', () => {
    const onFilterChange = vi.fn();

    render(
      <RegistryFilters
        filters={{ ...baseFilters, severity: 'medium' }}
        onFilterChange={onFilterChange}
        userRole="super_admin"
      />,
    );

    // Open severity dropdown
    fireEvent.click(screen.getByTestId('filter-severity').querySelector('button')!);

    // Check "high" checkbox (adds to existing "medium")
    fireEvent.click(screen.getByTestId('severity-high'));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'medium,high',
        cursor: undefined,
      }),
    );
  });
});
