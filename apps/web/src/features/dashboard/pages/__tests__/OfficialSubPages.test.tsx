// @vitest-environment jsdom
/**
 * Official Sub-Pages Tests
 *
 * Story 5.1:
 * - OfficialStatsPage: AC2, AC3 — charts render, empty states, skeleton loading
 * - OfficialTrendsPage: AC4 — chart render, 7d/30d toggle, skeleton loading
 * - OfficialExportPage: Unchanged placeholder
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

// ── Mock state ───────────────────────────────────────────────────────────────

let mockSkillsReturn = {
  data: undefined as any,
  isLoading: false,
  error: null as Error | null,
};

let mockLgaReturn = {
  data: undefined as any,
  isLoading: false,
  error: null as Error | null,
};

let mockTrendsReturn = {
  data: undefined as any,
  isLoading: false,
  error: null as Error | null,
};

// Analytics hook mocks (Story 8.2)
const mockAnalyticsRefetch = vi.fn();
const mockDemographicsReturn = { data: null as any, isLoading: true, error: null as any, refetch: mockAnalyticsRefetch };
const mockEmploymentReturn = { data: null as any, isLoading: true, error: null as any, refetch: mockAnalyticsRefetch };
const mockHouseholdReturn = { data: null as any, isLoading: true, error: null as any, refetch: mockAnalyticsRefetch };
const mockAnalyticsTrendsReturn = { data: [] as any, isLoading: true, error: null as any, refetch: mockAnalyticsRefetch };
const mockRegistryReturn = { data: null as any, isLoading: true, error: null as any };

vi.mock('../../hooks/useOfficial', () => ({
  useSkillsDistribution: () => mockSkillsReturn,
  useLgaBreakdown: () => mockLgaReturn,
  useRegistrationTrends: () => mockTrendsReturn,
  officialKeys: {
    all: ['official'],
    skills: () => ['official', 'skills'],
    lgaBreakdown: () => ['official', 'lgaBreakdown'],
    trends: (d: number) => ['official', 'trends', d],
  },
}));

vi.mock('../../hooks/useAnalytics', () => ({
  useDemographics: () => mockDemographicsReturn,
  useEmployment: () => mockEmploymentReturn,
  useHousehold: () => mockHouseholdReturn,
  useTrends: () => mockAnalyticsTrendsReturn,
  useRegistrySummary: () => mockRegistryReturn,
  useSkillsFrequency: () => ({ data: [], isLoading: true, error: null }),
  usePipelineSummary: () => ({ data: null, isLoading: true, error: null }),
}));

vi.mock('../../api/export.api', () => ({
  fetchLgas: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div aria-label="Loading card" />,
}));

// Mock export hooks for OfficialExportPage (which now renders ExportPage)
vi.mock('../../hooks/useExport', () => ({
  useExportPreviewCount: () => ({ data: 42, isLoading: false }),
  useLgas: () => ({
    data: [
      { id: '1', name: 'Ibadan North', code: 'ibadan-north' },
    ],
    isLoading: false,
    isError: false,
  }),
  usePublishedForms: () => ({
    data: [
      { id: 'form-1', title: 'OSLSR Master v3', formId: 'oslsr_master_v3', version: '1.0.0' },
    ],
    isLoading: false,
  }),
  useExportDownload: () => ({
    download: vi.fn(),
    isDownloading: false,
    error: null,
  }),
  exportKeys: {
    all: ['exports'],
    previewCount: (f: unknown) => ['exports', 'count', f],
    lgas: ['lgas'],
    publishedForms: ['forms', 'published'],
  },
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

// Mock Recharts — they need a DOM container width > 0
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Bar: () => <div data-testid="bar" />,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  CartesianGrid: () => <div />,
  ReferenceLine: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div />,
}));

import OfficialStatsPage from '../OfficialStatsPage';
import OfficialTrendsPage from '../OfficialTrendsPage';
import OfficialExportPage from '../OfficialExportPage';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    createElement(QueryClientProvider, { client: qc },
      createElement(MemoryRouter, null, ui)
    )
  );
}

afterEach(() => {
  cleanup();
});

// ── Sample Data ────────────────────────────────────────────────────────────

const sampleSkills = [
  { skill: 'Carpentry', count: 45 },
  { skill: 'Tailoring', count: 30 },
  { skill: 'Plumbing', count: 15 },
];

const sampleLga = [
  { lgaCode: 'ibadan-north', lgaName: 'Ibadan North', count: 50 },
  { lgaCode: 'ibadan-south-east', lgaName: 'Ibadan South East', count: 30 },
  { lgaCode: 'ogbomosho-north', lgaName: 'Ogbomosho North', count: 0 },
];

const sampleTrends = [
  { date: '2026-02-20', count: 10 },
  { date: '2026-02-21', count: 15 },
  { date: '2026-02-22', count: 8 },
];

// ── Stats Page Tests ───────────────────────────────────────────────────────

describe('OfficialStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkillsReturn = { data: sampleSkills, isLoading: false, error: null };
    mockLgaReturn = { data: sampleLga, isLoading: false, error: null };
  });

  it('renders page title', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByText('Statistics & Analytics')).toBeInTheDocument();
  });

  it('renders summary stats section', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByTestId('summary-stats')).toBeInTheDocument();
  });

  it('displays top skill from data', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByTestId('top-skill')).toHaveTextContent('Carpentry');
  });

  it('displays most active LGA', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByTestId('most-active-lga')).toHaveTextContent('Ibadan North');
  });

  it('displays coverage count', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByTestId('coverage')).toHaveTextContent('2 / 33');
  });

  it('renders skills distribution chart', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByTestId('skills-distribution-chart')).toBeInTheDocument();
  });

  it('renders LGA breakdown chart', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByTestId('lga-breakdown-chart')).toBeInTheDocument();
  });

  it('shows skeleton loading when data is loading', () => {
    mockSkillsReturn = { data: undefined, isLoading: true, error: null };
    mockLgaReturn = { data: undefined, isLoading: true, error: null };
    renderWithProviders(<OfficialStatsPage />);
    const skeletons = screen.getAllByLabelText('Loading card');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it('hides charts when loading', () => {
    mockSkillsReturn = { data: undefined, isLoading: true, error: null };
    mockLgaReturn = { data: undefined, isLoading: true, error: null };
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.queryByTestId('skills-distribution-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lga-breakdown-chart')).not.toBeInTheDocument();
  });

  it('renders empty skills message when no skills data', () => {
    mockSkillsReturn = { data: [], isLoading: false, error: null };
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByTestId('skills-empty')).toHaveTextContent('No skill data available yet');
  });

  it('renders empty LGA message when no LGA data', () => {
    mockLgaReturn = { data: [], isLoading: false, error: null };
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByTestId('lga-empty')).toHaveTextContent('No LGA data available yet');
  });

  // ── Story 8.2 Tests: Tabbed Analytics ──

  it('renders tabbed layout with all 6 tabs', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Demographics')).toBeInTheDocument();
    expect(screen.getByText('Employment')).toBeInTheDocument();
    expect(screen.getByText('Household')).toBeInTheDocument();
    expect(screen.getByText('Trends')).toBeInTheDocument();
    expect(screen.getByText('Equity')).toBeInTheDocument();
  });

  it('preserves existing skills + LGA charts in Overview tab', () => {
    renderWithProviders(<OfficialStatsPage />);
    // Overview is default active tab — existing charts should render
    expect(screen.getByTestId('skills-distribution-chart')).toBeInTheDocument();
    expect(screen.getByTestId('lga-breakdown-chart')).toBeInTheDocument();
  });

  it('renders global analytics filters', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.getByTestId('analytics-filters')).toBeInTheDocument();
  });

  it('does not show source filter for government official', () => {
    renderWithProviders(<OfficialStatsPage />);
    expect(screen.queryByLabelText('Filter by source')).not.toBeInTheDocument();
  });

  it('renders overview tab as default active', () => {
    renderWithProviders(<OfficialStatsPage />);
    const overviewTrigger = screen.getByText('Overview').closest('[data-state]');
    expect(overviewTrigger).toHaveAttribute('data-state', 'active');
  });

  it('no PII fields present in any analytics view', () => {
    renderWithProviders(<OfficialStatsPage />);
    // Verify no PII-related labels or patterns exist anywhere in Overview tab
    expect(screen.queryByText(/NIN/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full Name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Date of Birth/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Address/i)).not.toBeInTheDocument();
    // Assert no NIN patterns (11-digit) or phone patterns (+234 / 080x) in rendered text
    const pageText = screen.getByTestId('official-stats-page').textContent ?? '';
    expect(pageText).not.toMatch(/\b\d{11}\b/); // NIN-like 11-digit numbers
    expect(pageText).not.toMatch(/\+234/); // Nigerian phone prefix
    expect(pageText).not.toMatch(/\b0[789]0\d{8}\b/); // Nigerian mobile numbers
    expect(pageText).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/); // Email addresses
  });
});

// ── Trends Page Tests ──────────────────────────────────────────────────────

describe('OfficialTrendsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrendsReturn = { data: sampleTrends, isLoading: false, error: null };
  });

  it('renders page title', () => {
    render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
    expect(screen.getByText('Trend Analysis')).toBeInTheDocument();
  });

  it('renders registration trends chart', () => {
    render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
    expect(screen.getByTestId('submission-activity-chart')).toBeInTheDocument();
  });

  it('renders 7-day toggle button', () => {
    render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
    expect(screen.getByTestId('toggle-7d')).toBeInTheDocument();
  });

  it('renders 30-day toggle button', () => {
    render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
    expect(screen.getByTestId('toggle-30d')).toBeInTheDocument();
  });

  it('renders trend summary cards', () => {
    render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
    expect(screen.getByTestId('trend-summary')).toBeInTheDocument();
    expect(screen.getByTestId('trend-avg')).toBeInTheDocument();
    expect(screen.getByTestId('trend-best')).toBeInTheDocument();
    expect(screen.getByTestId('trend-total')).toBeInTheDocument();
  });

  it('shows skeleton loading when data is loading', () => {
    mockTrendsReturn = { data: undefined, isLoading: true, error: null };
    render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
    const skeletons = screen.getAllByLabelText('Loading card');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('hides chart and summary when loading', () => {
    mockTrendsReturn = { data: undefined, isLoading: true, error: null };
    render(<MemoryRouter><OfficialTrendsPage /></MemoryRouter>);
    expect(screen.queryByTestId('submission-activity-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trend-summary')).not.toBeInTheDocument();
  });
});

// ── Export Page Tests (Story 5.4 — now renders full ExportPage) ───────────

describe('OfficialExportPage', () => {
  it('renders page title', () => {
    render(<MemoryRouter><OfficialExportPage /></MemoryRouter>);
    expect(screen.getByText('Export Reports')).toBeInTheDocument();
  });

  it('renders filter controls', () => {
    render(<MemoryRouter><OfficialExportPage /></MemoryRouter>);
    expect(screen.getByTestId('lga-filter')).toBeInTheDocument();
    expect(screen.getByTestId('source-filter')).toBeInTheDocument();
  });

  it('renders export button and format toggle', () => {
    render(<MemoryRouter><OfficialExportPage /></MemoryRouter>);
    expect(screen.getByTestId('export-button')).toBeInTheDocument();
    expect(screen.getByTestId('format-toggle')).toBeInTheDocument();
  });
});
