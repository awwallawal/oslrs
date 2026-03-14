// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

expect.extend(matchers);
afterEach(() => cleanup());

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockRefetch = vi.hoisted(() => vi.fn());
const mockTeamQuality = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any, refetch: mockRefetch }));
const mockDemographics = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any, refetch: mockRefetch }));
const mockEmployment = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any, refetch: mockRefetch }));

vi.mock('../../hooks/useAnalytics', () => ({
  useTeamQuality: () => mockTeamQuality,
  useDemographics: () => mockDemographics,
  useEmployment: () => mockEmployment,
  useSkillsInventory: () => ({ data: null, isLoading: false }),
  useActivationStatus: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock('../../api/export.api', () => ({
  fetchLgas: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

vi.mock('../../components/charts/TeamQualityCharts', () => ({
  default: (props: any) => <div data-testid="team-quality-charts">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/TeamCompletionTimeChart', () => ({
  default: (props: any) => <div data-testid="team-completion-time-chart">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/DayOfWeekChart', () => ({
  default: (props: any) => <div data-testid="day-of-week-chart">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/HourOfDayChart', () => ({
  default: (props: any) => <div data-testid="hour-of-day-chart">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/FieldCoverageMap', () => ({
  default: (props: any) => <div data-testid="field-coverage-map">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/DemographicCharts', () => ({
  DemographicCharts: (props: any) => <div data-testid="demographic-charts">{props.isLoading ? 'loading' : 'loaded'}</div>,
}));
vi.mock('../../components/charts/EmploymentCharts', () => ({
  EmploymentCharts: (props: any) => <div data-testid="employment-charts">{props.isLoading ? 'loading' : 'loaded'}</div>,
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

import SupervisorAnalyticsPage from '../SupervisorAnalyticsPage';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const TEAM_QUALITY_DATA = {
  enumerators: [{ enumeratorId: '1', name: 'Test', submissionCount: 50, avgCompletionTimeSec: 300, gpsRate: 0.9, ninRate: 0.8, skipRate: 0.1, fraudFlagRate: 0.02, status: 'active' }],
  teamAverages: { avgCompletionTime: 350, gpsRate: 0.85, ninRate: 0.7, skipRate: 0.12, fraudRate: 0.03 },
  submissionsByDay: [],
  dayOfWeekPattern: [],
  hourOfDayPattern: [],
};

function resetMocks() {
  mockTeamQuality.data = null; mockTeamQuality.isLoading = true; mockTeamQuality.error = null;
  mockDemographics.data = null; mockDemographics.isLoading = true; mockDemographics.error = null;
  mockEmployment.data = null; mockEmployment.isLoading = true; mockEmployment.error = null;
}

beforeEach(() => resetMocks());

describe('SupervisorAnalyticsPage', () => {
  it('renders page header "Team Analytics"', () => {
    render(<SupervisorAnalyticsPage />, { wrapper });
    expect(screen.getByText('Team Analytics')).toBeInTheDocument();
    expect(screen.getByText('Monitor your team\'s performance and data quality')).toBeInTheDocument();
  });

  it('renders tabs: Data Quality, Field Coverage, LGA Demographics', () => {
    render(<SupervisorAnalyticsPage />, { wrapper });
    expect(screen.getByText('Data Quality')).toBeInTheDocument();
    expect(screen.getByText('Field Coverage')).toBeInTheDocument();
    expect(screen.getByText('LGA Demographics')).toBeInTheDocument();
  });

  it('Data Quality tab is active by default', () => {
    render(<SupervisorAnalyticsPage />, { wrapper });
    const qualityTrigger = screen.getByText('Data Quality').closest('[data-state]');
    expect(qualityTrigger).toHaveAttribute('data-state', 'active');
  });

  it('shows loading state when teamQuality.isLoading=true', () => {
    render(<SupervisorAnalyticsPage />, { wrapper });
    // The TeamQualityCharts stub renders "loading" when isLoading is true
    expect(screen.getByTestId('team-quality-charts')).toHaveTextContent('loading');
  });

  it('shows team averages when data is loaded on coverage tab', async () => {
    mockTeamQuality.data = TEAM_QUALITY_DATA;
    mockTeamQuality.isLoading = false;

    render(<SupervisorAnalyticsPage />, { wrapper });
    // Radix tabs respond to mouseDown + focus, not click
    const coverageTab = screen.getByRole('tab', { name: 'Field Coverage' });
    await act(async () => {
      fireEvent.mouseDown(coverageTab);
      fireEvent.focus(coverageTab);
      fireEvent.click(coverageTab);
    });

    expect(screen.getByText('GPS Coverage Rate')).toBeInTheDocument();
    expect(screen.getByText('NIN Capture Rate')).toBeInTheDocument();
    // 0.85 * 100 = 85%
    expect(screen.getByText('85%')).toBeInTheDocument();
    // 0.7 * 100 = 70%
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('renders analytics filters', () => {
    render(<SupervisorAnalyticsPage />, { wrapper });
    expect(screen.getByTestId('analytics-filters')).toBeInTheDocument();
  });
});
