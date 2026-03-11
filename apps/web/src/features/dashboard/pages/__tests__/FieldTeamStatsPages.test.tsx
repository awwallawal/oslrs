// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

expect.extend(matchers);
afterEach(() => cleanup());

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockPersonalStats = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any }));

vi.mock('../../hooks/useAnalytics', () => ({
  usePersonalStats: () => mockPersonalStats,
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

vi.mock('../../components/charts/PersonalTrendChart', () => ({
  default: (props: any) => <div data-testid="personal-trend-chart">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/PersonalSkillsChart', () => ({
  default: (props: any) => <div data-testid="personal-skills-chart">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/CompletionTimeComparison', () => ({
  default: (props: any) => <div data-testid="completion-time-comparison">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/DataQualityScorecard', () => ({
  default: (props: any) => <div data-testid="data-quality-scorecard">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/RespondentDiversityChart', () => ({
  default: (props: any) => <div data-testid="respondent-diversity-chart">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: ({ children }: any) => <div>{children}</div>,
  Cell: () => <div />,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  CartesianGrid: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div />,
}));

import EnumeratorStatsPage from '../EnumeratorStatsPage';
import ClerkStatsPage from '../ClerkStatsPage';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const PERSONAL_STATS_DATA = {
  dailyTrend: [{ date: '2026-03-01', count: 5 }],
  cumulativeCount: 42,
  avgCompletionTimeSec: 300,
  teamAvgCompletionTimeSec: 350,
  gpsRate: 0.9,
  ninRate: 0.8,
  skipRate: 0.05,
  fraudFlagRate: 0.01,
  teamAvgFraudRate: 0.03,
  respondentDiversity: {
    genderSplit: [{ label: 'Male', count: 30, percentage: 60 }],
    ageSpread: [{ label: '18-25', count: 20, percentage: 40 }],
  },
  topSkillsCollected: [{ skill: 'Welding', count: 15, percentage: 30 }],
  compositeQualityScore: 78,
};

function resetMocks() {
  mockPersonalStats.data = null;
  mockPersonalStats.isLoading = true;
  mockPersonalStats.error = null;
}

beforeEach(() => resetMocks());

// ── EnumeratorStatsPage ─────────────────────────────────────────────────

describe('EnumeratorStatsPage', () => {
  it('renders page header "My Stats"', () => {
    render(<EnumeratorStatsPage />, { wrapper });
    expect(screen.getByText('My Stats')).toBeInTheDocument();
    expect(screen.getByText('Track your personal performance and data quality')).toBeInTheDocument();
  });

  it('renders tabs: My Performance, My Data Quality, My Profile', () => {
    render(<EnumeratorStatsPage />, { wrapper });
    expect(screen.getByText('My Performance')).toBeInTheDocument();
    expect(screen.getByText('My Data Quality')).toBeInTheDocument();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
  });

  it('shows summary cards when data loaded', () => {
    mockPersonalStats.data = PERSONAL_STATS_DATA;
    mockPersonalStats.isLoading = false;

    render(<EnumeratorStatsPage />, { wrapper });
    expect(screen.getByText('Total Submissions')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Quality Score')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('Avg Completion')).toBeInTheDocument();
    // 300 / 60 = 5m
    expect(screen.getByText('5m')).toBeInTheDocument();
  });

  it('shows loading state when isLoading=true', () => {
    render(<EnumeratorStatsPage />, { wrapper });
    // Summary cards are not rendered when data is null (conditional rendering)
    expect(screen.queryByText('Total Submissions')).not.toBeInTheDocument();
    // Chart stubs show loading text
    expect(screen.getByTestId('personal-trend-chart')).toHaveTextContent('loading');
  });

  it('handles null quality score gracefully', () => {
    mockPersonalStats.data = { ...PERSONAL_STATS_DATA, compositeQualityScore: null };
    mockPersonalStats.isLoading = false;

    render(<EnumeratorStatsPage />, { wrapper });
    expect(screen.getByText('Quality Score')).toBeInTheDocument();
    // Should show em dash for null score
    const qualityCards = screen.getAllByText('—');
    expect(qualityCards.length).toBeGreaterThanOrEqual(1);
  });
});

// ── ClerkStatsPage ──────────────────────────────────────────────────────

describe('ClerkStatsPage', () => {
  it('renders page header "My Stats" with clerk description text', () => {
    render(<ClerkStatsPage />, { wrapper });
    expect(screen.getByText('My Stats')).toBeInTheDocument();
    expect(screen.getByText('Track your data entry productivity and quality')).toBeInTheDocument();
  });

  it('renders tabs: My Performance, My Data Quality (only 2 tabs, no Profile)', () => {
    render(<ClerkStatsPage />, { wrapper });
    expect(screen.getByText('My Performance')).toBeInTheDocument();
    expect(screen.getByText('My Data Quality')).toBeInTheDocument();
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument();
  });

  it('shows summary cards when data loaded', () => {
    mockPersonalStats.data = PERSONAL_STATS_DATA;
    mockPersonalStats.isLoading = false;

    render(<ClerkStatsPage />, { wrapper });
    expect(screen.getByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Quality Score')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
  });

  it('shows loading state when isLoading=true', () => {
    render(<ClerkStatsPage />, { wrapper });
    // Summary cards are not rendered when data is null
    expect(screen.queryByText('Total Entries')).not.toBeInTheDocument();
    // Chart stubs show loading text
    expect(screen.getByTestId('personal-trend-chart')).toHaveTextContent('loading');
  });

  it('handles null quality score gracefully', () => {
    mockPersonalStats.data = { ...PERSONAL_STATS_DATA, compositeQualityScore: null };
    mockPersonalStats.isLoading = false;

    render(<ClerkStatsPage />, { wrapper });
    expect(screen.getByText('Quality Score')).toBeInTheDocument();
    // Should show em dash for null score
    const emDashes = screen.getAllByText('—');
    expect(emDashes.length).toBeGreaterThanOrEqual(1);
  });
});
