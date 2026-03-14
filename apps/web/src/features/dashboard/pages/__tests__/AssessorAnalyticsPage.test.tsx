// @vitest-environment jsdom
/**
 * AssessorAnalyticsPage Tests
 * Story 8.4: Page render, tab switching, stat cards, chart rendering, filters
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

expect.extend(matchers);
afterEach(() => cleanup());

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockRefetch = vi.hoisted(() => vi.fn());
const mockPipeline = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any, refetch: mockRefetch }));
const mockDemographics = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any, refetch: mockRefetch }));
const mockEmployment = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any, refetch: mockRefetch }));

vi.mock('../../hooks/useAnalytics', () => ({
  useVerificationPipeline: () => mockPipeline,
  useDemographics: () => mockDemographics,
  useEmployment: () => mockEmployment,
  useActivationStatus: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock('../../components/AnalyticsFilters', () => ({
  AnalyticsFilters: ({ onChange }: { onChange: (p: Record<string, unknown>) => void }) => (
    <div data-testid="analytics-filters">
      <button onClick={() => onChange({})}>Reset</button>
    </div>
  ),
}));

// Mock all chart components
vi.mock('../../components/charts/VerificationFunnelChart', () => ({
  default: (props: any) => <div data-testid="funnel-chart">{props.isLoading ? 'loading' : 'funnel'}</div>,
}));
vi.mock('../../components/charts/FraudTypeBreakdownChart', () => ({
  default: (props: any) => <div data-testid="fraud-breakdown">{props.isLoading ? 'loading' : 'breakdown'}</div>,
}));
vi.mock('../../components/charts/ReviewThroughputChart', () => ({
  default: (props: any) => <div data-testid="throughput-chart">{props.isLoading ? 'loading' : 'throughput'}</div>,
}));
vi.mock('../../components/charts/TopFlaggedEnumeratorsTable', () => ({
  default: (props: any) => <div data-testid="top-flagged">{props.isLoading ? 'loading' : 'flagged'}</div>,
}));
vi.mock('../../components/charts/BacklogTrendChart', () => ({
  default: (props: any) => <div data-testid="backlog-trend">{props.isLoading ? 'loading' : 'backlog'}</div>,
}));
vi.mock('../../components/charts/RejectionReasonsChart', () => ({
  default: (props: any) => <div data-testid="rejection-reasons">{props.isLoading ? 'loading' : 'reasons'}</div>,
}));
vi.mock('../../components/charts/PipelineStatCards', () => ({
  default: (props: any) => <div data-testid="stat-cards">{props.isLoading ? 'loading' : 'stats'}</div>,
}));
vi.mock('../../components/charts/DemographicCharts', () => ({
  DemographicCharts: (props: any) => <div data-testid="demo-charts">{props.isLoading ? 'loading' : 'demographics'}</div>,
}));
vi.mock('../../components/charts/EmploymentCharts', () => ({
  EmploymentCharts: (props: any) => <div data-testid="employment-charts">{props.isLoading ? 'loading' : 'employment'}</div>,
}));

import AssessorAnalyticsPage from '../AssessorAnalyticsPage';

const PIPELINE_DATA = {
  funnel: { totalSubmissions: 100, totalFlagged: 30, totalReviewed: 20, totalApproved: 15, totalRejected: 5 },
  fraudTypeBreakdown: { gpsCluster: 10, speedRun: 8, straightLining: 5, duplicateResponse: 3, offHours: 2 },
  throughputTrend: [],
  topFlaggedEnumerators: [],
  backlogTrend: [],
  rejectionReasons: [],
  avgReviewTimeMinutes: 30,
  medianTimeToResolutionDays: 2,
  dataQualityScore: { completenessRate: 90, consistencyRate: 85 },
};

function resetMocks() {
  mockPipeline.data = null; mockPipeline.isLoading = true; mockPipeline.error = null;
  mockDemographics.data = null; mockDemographics.isLoading = true; mockDemographics.error = null;
  mockEmployment.data = null; mockEmployment.isLoading = true; mockEmployment.error = null;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return createElement(QueryClientProvider, { client: qc },
    createElement(MemoryRouter, null, children)
  );
}

beforeEach(() => resetMocks());

async function switchTab(name: string) {
  const tab = screen.getByRole('tab', { name });
  await act(async () => {
    fireEvent.mouseDown(tab);
    fireEvent.focus(tab);
    fireEvent.click(tab);
  });
}

describe('AssessorAnalyticsPage', () => {
  it('renders page header', () => {
    render(<AssessorAnalyticsPage />, { wrapper });
    expect(screen.getByText('Verification Analytics')).toBeInTheDocument();
  });

  it('renders all three tabs', () => {
    render(<AssessorAnalyticsPage />, { wrapper });
    expect(screen.getByText('Verification Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Data Quality Flags')).toBeInTheDocument();
    expect(screen.getByText('Demographics')).toBeInTheDocument();
  });

  it('pipeline tab is active by default and shows loading charts', () => {
    render(<AssessorAnalyticsPage />, { wrapper });
    const pipelineTab = screen.getByText('Verification Pipeline').closest('[data-state]');
    expect(pipelineTab).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('stat-cards')).toHaveTextContent('loading');
    expect(screen.getByTestId('funnel-chart')).toHaveTextContent('loading');
  });

  it('shows loaded charts when pipeline data is available', () => {
    mockPipeline.data = PIPELINE_DATA;
    mockPipeline.isLoading = false;
    render(<AssessorAnalyticsPage />, { wrapper });
    expect(screen.getByTestId('stat-cards')).toHaveTextContent('stats');
    expect(screen.getByTestId('funnel-chart')).toHaveTextContent('funnel');
    expect(screen.getByTestId('fraud-breakdown')).toHaveTextContent('breakdown');
    expect(screen.getByTestId('throughput-chart')).toHaveTextContent('throughput');
    expect(screen.getByTestId('backlog-trend')).toHaveTextContent('backlog');
    expect(screen.getByTestId('top-flagged')).toHaveTextContent('flagged');
    expect(screen.getByTestId('rejection-reasons')).toHaveTextContent('reasons');
  });

  it('renders severity filter buttons', () => {
    render(<AssessorAnalyticsPage />, { wrapper });
    expect(screen.getByTestId('severity-filter')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('toggles severity filter on click', () => {
    render(<AssessorAnalyticsPage />, { wrapper });
    const highBtn = screen.getByText('High');
    fireEvent.click(highBtn);
    expect(highBtn.className).toContain('bg-[#9C1E23]');
  });

  it('switches to Data Quality Flags tab', async () => {
    mockPipeline.data = PIPELINE_DATA;
    mockPipeline.isLoading = false;
    render(<AssessorAnalyticsPage />, { wrapper });
    await switchTab('Data Quality Flags');
    expect(screen.getByText('Completeness Rate')).toBeInTheDocument();
    expect(screen.getByText('Consistency Rate')).toBeInTheDocument();
  });

  it('switches to Demographics tab', async () => {
    mockDemographics.isLoading = false;
    mockEmployment.isLoading = false;
    render(<AssessorAnalyticsPage />, { wrapper });
    await switchTab('Demographics');
    expect(screen.getByTestId('demo-charts')).toBeInTheDocument();
    expect(screen.getByTestId('employment-charts')).toBeInTheDocument();
  });
});
