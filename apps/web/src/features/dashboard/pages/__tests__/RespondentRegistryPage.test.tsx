// @vitest-environment jsdom
/**
 * RespondentRegistryPage Tests
 *
 * Story 5.5 Task 9: Main page composing QuickFilterPresets, RegistryFilters,
 * RespondentRegistryTable, ExportButton, and live monitoring.
 *
 * Tests:
 * - Renders page with "Respondent Registry" heading
 * - Shows skeleton loading state when data is loading
 * - Renders ExportButton with current filters
 * - Shows quick filter presets
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

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

vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'super_admin', id: 'test-id' } }),
}));

// ── Mock state ──────────────────────────────────────────────────────────────

let mockRespondentListReturn = {
  data: undefined as undefined | {
    data: Array<Record<string, unknown>>;
    meta: { pagination: { totalItems: number; hasNextPage: boolean; hasPreviousPage: boolean; pageSize: number; nextCursor: string | null } };
  },
  isLoading: false,
  dataUpdatedAt: Date.now(),
};

vi.mock('../../hooks/useRespondent', () => ({
  useRespondentList: () => mockRespondentListReturn,
}));

vi.mock('../../hooks/useLiveMonitoring', () => ({
  useLiveMonitoring: () => ({
    refetchInterval: false,
    isLiveMode: false,
    lastUpdated: new Date(),
    setLastUpdated: vi.fn(),
    newCount: 0,
    setNewCount: vi.fn(),
  }),
}));

// Mock child components to isolate page-level tests
vi.mock('../../components/QuickFilterPresets', () => ({
  QuickFilterPresets: ({ activePreset }: { activePreset: string | null }) => (
    <div data-testid="quick-filter-presets">preset-active:{activePreset}</div>
  ),
  PRESETS: [
    { key: 'all', label: 'All Records', getFilters: () => ({}), sort: { sortBy: 'registeredAt', sortOrder: 'desc' } },
    { key: 'live', label: 'Live Feed', getFilters: () => ({}), sort: { sortBy: 'registeredAt', sortOrder: 'desc' } },
    { key: 'week', label: 'This Week', getFilters: () => ({}), sort: { sortBy: 'registeredAt', sortOrder: 'desc' } },
    { key: 'flagged', label: 'Flagged', getFilters: () => ({}), sort: { sortBy: 'fraudScore', sortOrder: 'desc' } },
    { key: 'pending', label: 'Pending Review', getFilters: () => ({}), sort: { sortBy: 'registeredAt', sortOrder: 'asc' } },
  ],
}));

vi.mock('../../components/RegistryFilters', () => ({
  RegistryFilters: () => <div data-testid="registry-filters">filters</div>,
}));

vi.mock('../../components/RespondentRegistryTable', () => ({
  RespondentRegistryTable: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="registry-table">{isLoading ? 'loading' : 'table'}</div>
  ),
}));

vi.mock('../../components/ExportButton', () => ({
  ExportButton: ({ filters }: { filters: Record<string, unknown> }) => (
    <div data-testid="export-button">export:{JSON.stringify(filters)}</div>
  ),
}));

// Story 8.2: Registry summary strip mocks
let mockRegistrySummaryReturn = {
  data: undefined as any,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../../hooks/useAnalytics', () => ({
  useRegistrySummary: () => mockRegistrySummaryReturn,
}));

vi.mock('../../components/charts/RegistrySummaryStrip', () => ({
  RegistrySummaryStrip: ({ data, isLoading }: { data: any; isLoading: boolean }) => (
    <div data-testid="registry-summary-strip">{isLoading ? 'loading' : data ? 'summary' : 'empty'}</div>
  ),
}));

import RespondentRegistryPage from '../RespondentRegistryPage';

// ── Helpers ─────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRespondentListReturn = {
    data: undefined,
    isLoading: false,
    dataUpdatedAt: Date.now(),
  };
  mockRegistrySummaryReturn = {
    data: undefined,
    isLoading: false,
    error: null,
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RespondentRegistryPage', () => {
  it('renders page with "Respondent Registry" heading', () => {
    render(<RespondentRegistryPage />);

    expect(screen.getByTestId('respondent-registry-page')).toBeInTheDocument();
    expect(screen.getByText('Respondent Registry')).toBeInTheDocument();
  });

  it('shows skeleton loading state when data is loading', () => {
    mockRespondentListReturn = {
      data: undefined,
      isLoading: true,
      dataUpdatedAt: Date.now(),
    };

    render(<RespondentRegistryPage />);

    const table = screen.getByTestId('registry-table');
    expect(table).toBeInTheDocument();
    expect(table.textContent).toContain('loading');
  });

  it('renders ExportButton with current filters', () => {
    render(<RespondentRegistryPage />);

    const exportBtn = screen.getByTestId('export-button');
    expect(exportBtn).toBeInTheDocument();
  });

  it('shows quick filter presets', () => {
    render(<RespondentRegistryPage />);

    const presets = screen.getByTestId('quick-filter-presets');
    expect(presets).toBeInTheDocument();
    expect(presets.textContent).toContain('preset-active:all');
  });

  // ── Story 8.2 AC#3: Registry Summary Strip ──

  it('renders registry summary strip above table', () => {
    render(<RespondentRegistryPage />);
    expect(screen.getByTestId('registry-summary-strip')).toBeInTheDocument();
  });

  it('passes loading state to registry summary strip', () => {
    mockRegistrySummaryReturn = { data: undefined, isLoading: true, error: null };
    render(<RespondentRegistryPage />);
    const strip = screen.getByTestId('registry-summary-strip');
    expect(strip.textContent).toContain('loading');
  });

  it('passes data to registry summary strip when loaded', () => {
    mockRegistrySummaryReturn = {
      data: { totalRespondents: 100, employedCount: 60, employedPct: 60, femaleCount: 50, femalePct: 50, avgAge: 30, businessOwners: 20, businessOwnersPct: 20 },
      isLoading: false,
      error: null,
    };
    render(<RespondentRegistryPage />);
    const strip = screen.getByTestId('registry-summary-strip');
    expect(strip.textContent).toContain('summary');
  });

  it('registry summary strip appears before collapsible filters', () => {
    render(<RespondentRegistryPage />);
    const strip = screen.getByTestId('registry-summary-strip');
    const toggleFilters = screen.getByTestId('toggle-filters');
    // Verify strip appears before filters in DOM order
    const page = screen.getByTestId('respondent-registry-page');
    const children = Array.from(page.querySelectorAll('[data-testid]'));
    const stripIndex = children.indexOf(strip);
    const filtersIndex = children.indexOf(toggleFilters);
    expect(stripIndex).toBeLessThan(filtersIndex);
  });
});
