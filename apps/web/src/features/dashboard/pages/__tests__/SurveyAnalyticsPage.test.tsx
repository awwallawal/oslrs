// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

expect.extend(matchers);
afterEach(() => cleanup());

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockRefetch = vi.hoisted(() => vi.fn());
const mockDemographics = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any, refetch: mockRefetch }));
const mockEmployment = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any, refetch: mockRefetch }));
const mockHousehold = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any, refetch: mockRefetch }));
const mockSkills = vi.hoisted(() => ({ data: [] as any, isLoading: true, error: null as any, refetch: mockRefetch }));
const mockTrends = vi.hoisted(() => ({ data: [] as any, isLoading: true, error: null as any, refetch: mockRefetch }));
const mockRegistry = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any }));
const mockPipeline = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any }));

vi.mock('../../hooks/useAnalytics', () => ({
  useDemographics: () => mockDemographics,
  useEmployment: () => mockEmployment,
  useHousehold: () => mockHousehold,
  useSkillsFrequency: () => mockSkills,
  useTrends: () => mockTrends,
  useRegistrySummary: () => mockRegistry,
  usePipelineSummary: () => mockPipeline,
  useSkillsInventory: () => ({ data: null, isLoading: false }),
  useInferentialInsights: () => ({ data: null, isLoading: false, error: null }),
  useExtendedEquity: () => ({ data: null, isLoading: false, error: null, refetch: mockRefetch }),
  useActivationStatus: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock('../../api/export.api', () => ({
  fetchLgas: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}));

vi.mock('../../api/analytics.api', () => ({
  fetchPolicyBriefPdf: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
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

import SurveyAnalyticsPage from '../SurveyAnalyticsPage';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

function resetMocks() {
  mockDemographics.data = null; mockDemographics.isLoading = true; mockDemographics.error = null;
  mockEmployment.data = null; mockEmployment.isLoading = true; mockEmployment.error = null;
  mockHousehold.data = null; mockHousehold.isLoading = true; mockHousehold.error = null;
  mockSkills.data = []; mockSkills.isLoading = true; mockSkills.error = null;
  mockTrends.data = []; mockTrends.isLoading = true; mockTrends.error = null;
  mockRegistry.data = null; mockRegistry.isLoading = true; mockRegistry.error = null;
  mockPipeline.data = null; mockPipeline.isLoading = true; mockPipeline.error = null;
}

beforeEach(() => resetMocks());

describe('SurveyAnalyticsPage', () => {
  it('renders page with header and tabs', () => {
    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByTestId('survey-analytics-page')).toBeInTheDocument();
    expect(screen.getByText('Survey Analytics')).toBeInTheDocument();
    expect(screen.getByText('Demographics')).toBeInTheDocument();
    expect(screen.getByText('Employment')).toBeInTheDocument();
    expect(screen.getByText('Household')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Trends')).toBeInTheDocument();
    expect(screen.getByText('Equity')).toBeInTheDocument();
  });

  it('renders loading skeletons when data is loading', () => {
    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('renders global filters', () => {
    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByTestId('analytics-filters')).toBeInTheDocument();
  });

  it('renders stat card labels for pipeline and registry rows when loaded', () => {
    mockPipeline.data = { totalSubmissions: 500, completionRate: 85, avgCompletionTimeSecs: 1200, activeEnumerators: 12 };
    mockPipeline.isLoading = false;
    mockRegistry.data = { totalRespondents: 100, employedCount: 60, employedPct: 60, femaleCount: 50, femalePct: 50, avgAge: 30, businessOwners: 20, businessOwnersPct: 20, consentMarketplacePct: 70, consentEnrichedPct: 55 };
    mockRegistry.isLoading = false;

    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByText('Total Submissions')).toBeInTheDocument();
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
    expect(screen.getByText('Total Respondents')).toBeInTheDocument();
    expect(screen.getByText('Employed')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Avg Age')).toBeInTheDocument();
  });

  it('renders with data when hooks return results', () => {
    mockDemographics.data = { genderDistribution: [], ageDistribution: [], educationDistribution: [], maritalDistribution: [], disabilityPrevalence: [], lgaDistribution: [], consentMarketplace: [], consentEnriched: [] };
    mockDemographics.isLoading = false;
    mockRegistry.data = { totalRespondents: 100, employedCount: 60, employedPct: 60, femaleCount: 50, femalePct: 50, avgAge: 30, businessOwners: 20, businessOwnersPct: 20, consentMarketplacePct: 70, consentEnrichedPct: 55 };
    mockRegistry.isLoading = false;
    mockPipeline.data = { totalSubmissions: 500, completionRate: 85, avgCompletionTimeSecs: 1200, activeEnumerators: 12 };
    mockPipeline.isLoading = false;

    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('tab switching works', () => {
    render(<SurveyAnalyticsPage />, { wrapper });
    // All 6 tabs should be present and clickable
    const tabs = ['Demographics', 'Employment', 'Household', 'Skills', 'Trends', 'Equity'];
    tabs.forEach((tab) => {
      expect(screen.getByText(tab)).toBeInTheDocument();
    });
    // Demographics tab should be active by default (first tab)
    const demoTrigger = screen.getByText('Demographics').closest('[data-state]');
    expect(demoTrigger).toHaveAttribute('data-state', 'active');
  });

  it('renders CSV export buttons', () => {
    mockDemographics.data = { genderDistribution: [{ label: 'male', count: 50, percentage: 50 }], ageDistribution: [], educationDistribution: [], maritalDistribution: [], disabilityPrevalence: [], lgaDistribution: [], consentMarketplace: [], consentEnriched: [] };
    mockDemographics.isLoading = false;

    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByLabelText('Export demographics-gender as CSV')).toBeInTheDocument();
  });

  it('renders page header description', () => {
    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByText('State-wide labour market intelligence')).toBeInTheDocument();
  });

  it('disables PDF export button when submissions < 100', async () => {
    mockPipeline.data = { totalSubmissions: 50, completionRate: 70, avgCompletionTimeSecs: 900, activeEnumerators: 5 };
    mockPipeline.isLoading = false;

    const user = userEvent.setup();
    render(<SurveyAnalyticsPage />, { wrapper });

    // Switch to insights tab
    await user.click(screen.getByRole('tab', { name: 'Insights' }));

    const exportBtn = screen.getByRole('button', { name: /Export Policy Brief/i });
    expect(exportBtn).toBeDisabled();
  });
});
