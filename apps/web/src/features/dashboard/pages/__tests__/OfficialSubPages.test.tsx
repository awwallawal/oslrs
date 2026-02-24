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
  useExportDownload: () => ({
    download: vi.fn(),
    isDownloading: false,
    error: null,
  }),
  exportKeys: {
    all: ['exports'],
    previewCount: (f: unknown) => ['exports', 'count', f],
    lgas: ['lgas'],
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
}));

import OfficialStatsPage from '../OfficialStatsPage';
import OfficialTrendsPage from '../OfficialTrendsPage';
import OfficialExportPage from '../OfficialExportPage';

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
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.getByText('Statistics')).toBeInTheDocument();
  });

  it('renders summary stats section', () => {
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.getByTestId('summary-stats')).toBeInTheDocument();
  });

  it('displays top skill from data', () => {
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.getByTestId('top-skill')).toHaveTextContent('Carpentry');
  });

  it('displays most active LGA', () => {
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.getByTestId('most-active-lga')).toHaveTextContent('Ibadan North');
  });

  it('displays coverage count', () => {
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.getByTestId('coverage')).toHaveTextContent('2 / 33');
  });

  it('renders skills distribution chart', () => {
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.getByTestId('skills-distribution-chart')).toBeInTheDocument();
  });

  it('renders LGA breakdown chart', () => {
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.getByTestId('lga-breakdown-chart')).toBeInTheDocument();
  });

  it('shows skeleton loading when data is loading', () => {
    mockSkillsReturn = { data: undefined, isLoading: true, error: null };
    mockLgaReturn = { data: undefined, isLoading: true, error: null };
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    const skeletons = screen.getAllByLabelText('Loading card');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it('hides charts when loading', () => {
    mockSkillsReturn = { data: undefined, isLoading: true, error: null };
    mockLgaReturn = { data: undefined, isLoading: true, error: null };
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.queryByTestId('skills-distribution-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lga-breakdown-chart')).not.toBeInTheDocument();
  });

  it('renders empty skills message when no skills data', () => {
    mockSkillsReturn = { data: [], isLoading: false, error: null };
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.getByTestId('skills-empty')).toHaveTextContent('No skill data available yet');
  });

  it('renders empty LGA message when no LGA data', () => {
    mockLgaReturn = { data: [], isLoading: false, error: null };
    render(<MemoryRouter><OfficialStatsPage /></MemoryRouter>);
    expect(screen.getByTestId('lga-empty')).toHaveTextContent('No LGA data available yet');
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
