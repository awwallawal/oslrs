// @vitest-environment jsdom
/**
 * LgaComparisonTable Component Tests
 *
 * Story 5.6b AC3: Tests for the LGA comparison table with 13 columns (12 data + 1 checkbox),
 * supervisorless highlighting, staffing model badges, checkbox selection, and summary row.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

expect.extend(matchers);

import LgaComparisonTable from '../LgaComparisonTable';

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockLgaRows: any[] = [
  {
    lgaId: 'lga-1',
    lgaName: 'Ibadan North',
    staffingModel: 'Full (1+5)',
    hasSupervisor: true,
    enumeratorCount: 5,
    supervisorName: 'Sup A',
    todayTotal: 50,
    lgaTarget: 125,
    percent: 40,
    avgPerEnumerator: 10,
    bestPerformer: { name: 'Adamu', count: 15 },
    lowestPerformer: { name: 'Tunde', count: 5 },
    rejRate: 10,
    trend: 'up' as const,
  },
  {
    lgaId: 'lga-2',
    lgaName: 'Ife Central',
    staffingModel: 'No Supervisor (3)',
    hasSupervisor: false,
    enumeratorCount: 3,
    supervisorName: null,
    todayTotal: 20,
    lgaTarget: 75,
    percent: 27,
    avgPerEnumerator: 6.7,
    bestPerformer: { name: 'Fatima', count: 10 },
    lowestPerformer: { name: 'Chidi', count: 3 },
    rejRate: 5,
    trend: 'flat' as const,
  },
  {
    lgaId: 'lga-3',
    lgaName: 'Oyo West',
    staffingModel: 'Full (1+4)',
    hasSupervisor: true,
    enumeratorCount: 4,
    supervisorName: 'Sup B',
    todayTotal: 35,
    lgaTarget: 100,
    percent: 35,
    avgPerEnumerator: 8.75,
    bestPerformer: { name: 'Yusuf', count: 12 },
    lowestPerformer: { name: 'Kemi', count: 6 },
    rejRate: 15,
    trend: 'down' as const,
  },
  {
    lgaId: 'lga-4',
    lgaName: 'Ogbomoso North',
    staffingModel: 'Full (1+5)',
    hasSupervisor: true,
    enumeratorCount: 5,
    supervisorName: 'Sup C',
    todayTotal: 60,
    lgaTarget: 125,
    percent: 48,
    avgPerEnumerator: 12,
    bestPerformer: { name: 'Amina', count: 18 },
    lowestPerformer: { name: 'Segun', count: 7 },
    rejRate: 8,
    trend: 'up' as const,
  },
  {
    lgaId: 'lga-5',
    lgaName: 'Atiba',
    staffingModel: 'Full (1+3)',
    hasSupervisor: true,
    enumeratorCount: 3,
    supervisorName: 'Sup D',
    todayTotal: 25,
    lgaTarget: 75,
    percent: 33,
    avgPerEnumerator: 8.3,
    bestPerformer: { name: 'Emeka', count: 11 },
    lowestPerformer: { name: 'Bisi', count: 4 },
    rejRate: 12,
    trend: 'flat' as const,
  },
  {
    lgaId: 'lga-6',
    lgaName: 'Akinyele',
    staffingModel: 'Full (1+4)',
    hasSupervisor: true,
    enumeratorCount: 4,
    supervisorName: 'Sup E',
    todayTotal: 40,
    lgaTarget: 100,
    percent: 40,
    avgPerEnumerator: 10,
    bestPerformer: { name: 'Kunle', count: 14 },
    lowestPerformer: { name: 'Ngozi', count: 6 },
    rejRate: 9,
    trend: 'up' as const,
  },
];

const mockSummary = {
  totalLgas: 6,
  totalSubmissions: 230,
  overallPercent: 37,
  supervisorlessCount: 1,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const defaultProps = {
  data: mockLgaRows,
  summary: mockSummary,
  sorting: [] as any[],
  onSortingChange: vi.fn(),
  selectedLgaIds: new Set<string>(),
  onSelectionChange: vi.fn(),
};

function renderTable(overrides: Partial<typeof defaultProps> = {}) {
  return render(<LgaComparisonTable {...defaultProps} {...overrides} />);
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('LgaComparisonTable', () => {
  it('renders all 13 columns (12 data + 1 checkbox)', () => {
    renderTable();
    // The checkbox column has an empty header, so we check the 12 named headers
    const expectedHeaders = [
      'LGA', 'Staffing Model', 'Enumerators', 'Supervisor',
      'Today Total', 'LGA Target', '%', 'Avg/Enum.',
      'Best Performer', 'Lowest Performer', 'Rej. Rate', 'Trend',
    ];
    for (const header of expectedHeaders) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    // The table has role="columnheader" elements — should be 13 (12 data + 1 empty checkbox)
    const columnHeaders = screen.getAllByRole('columnheader');
    expect(columnHeaders).toHaveLength(13);
  });

  it('supervisorless LGAs have data-testid="supervisorless-row"', () => {
    renderTable();
    // lga-2 (Ife Central) has hasSupervisor=false
    const supervisorlessRows = screen.getAllByTestId('supervisorless-row');
    expect(supervisorlessRows).toHaveLength(1);
    // Verify it is the correct LGA
    expect(screen.getByText('Ife Central')).toBeInTheDocument();
  });

  it('staffing model badge renders with data-testid="staffing-model-badge"', () => {
    renderTable();
    const badges = screen.getAllByTestId('staffing-model-badge');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    // First row's staffing model should be "Full (1+5)"
    expect(badges[0]).toHaveTextContent('Full (1+5)');
  });

  it('checkbox selection works (click checkbox, verify)', () => {
    renderTable();
    const checkbox = screen.getByTestId('lga-checkbox-lga-1');
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(defaultProps.onSelectionChange).toHaveBeenCalledTimes(1);
    // The callback should be called with a Set containing 'lga-1'
    const calledArg = defaultProps.onSelectionChange.mock.calls[0][0];
    expect(calledArg).toBeInstanceOf(Set);
    expect(calledArg.has('lga-1')).toBe(true);
  });

  it('max 5 selection enforced (remaining checkboxes disabled)', () => {
    // Select 5 LGAs
    const fiveSelected = new Set(['lga-1', 'lga-2', 'lga-3', 'lga-4', 'lga-5']);
    renderTable({ selectedLgaIds: fiveSelected });

    // The 6th LGA (lga-6) checkbox should be disabled
    const sixthCheckbox = screen.getByTestId('lga-checkbox-lga-6');
    expect(sixthCheckbox).toBeDisabled();

    // Already selected checkboxes should remain enabled (for deselection)
    const firstCheckbox = screen.getByTestId('lga-checkbox-lga-1');
    expect(firstCheckbox).not.toBeDisabled();
    expect(firstCheckbox).toBeChecked();
  });

  it('No Supervisor badge renders with data-testid="no-supervisor-badge"', () => {
    renderTable();
    const noSupBadges = screen.getAllByTestId('no-supervisor-badge');
    expect(noSupBadges).toHaveLength(1);
    expect(noSupBadges[0]).toHaveTextContent('No Supervisor');
  });

  it('summary row renders with data-testid="summary-row"', () => {
    renderTable();
    const summaryRow = screen.getByTestId('summary-row');
    expect(summaryRow).toBeInTheDocument();
    // Total LGAs in summary
    expect(screen.getByText('6 LGAs')).toBeInTheDocument();
    // Total submissions in summary footer
    expect(screen.getByText('230')).toBeInTheDocument();
    // Supervisorless count in summary
    expect(screen.getByText(/1 supervisorless LGA/)).toBeInTheDocument();
  });

  it('sort header click triggers onSortingChange via table', () => {
    renderTable();
    // Click the "LGA" column header to trigger sorting
    const lgaHeader = screen.getByText('LGA');
    fireEvent.click(lgaHeader);
    expect(defaultProps.onSortingChange).toHaveBeenCalled();
  });

  it('renders no summary row when data is empty', () => {
    renderTable({ data: [], summary: { totalLgas: 0, totalSubmissions: 0, overallPercent: 0, supervisorlessCount: 0 } });
    expect(screen.queryByTestId('summary-row')).not.toBeInTheDocument();
    expect(screen.getByText(/No LGA data available/)).toBeInTheDocument();
  });

  it('renders trend indicators correctly', () => {
    renderTable();
    // lga-1 has trend 'up', lga-2 has trend 'flat', lga-3 has trend 'down'
    expect(screen.getAllByTestId('trend-up').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('trend-flat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('trend-down').length).toBeGreaterThanOrEqual(1);
  });
});
