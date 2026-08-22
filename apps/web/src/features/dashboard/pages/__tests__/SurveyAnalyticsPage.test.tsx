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
const mockRegistryTotals = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any }));
const mockPipeline = vi.hoisted(() => ({ data: null as any, isLoading: true, error: null as any }));
// Story 12-6 — records the `enabled` flag it was called with, so the tab's
// lazy-fire contract can be asserted rather than assumed.
const mockDataHealth = vi.hoisted(() => ({ data: null as any, isLoading: false, isError: false }));
const mockUseDataHealth = vi.hoisted(() => vi.fn(() => mockDataHealth));

vi.mock('../../hooks/useAnalytics', () => ({
  useDemographics: () => mockDemographics,
  useEmployment: () => mockEmployment,
  useHousehold: () => mockHousehold,
  useSkillsFrequency: () => mockSkills,
  useTrends: () => mockTrends,
  useRegistrySummary: () => mockRegistry,
  useRegistryTotals: () => mockRegistryTotals,
  useDataHealth: (...args: unknown[]) => mockUseDataHealth(...(args as [])),
  usePipelineSummary: () => mockPipeline,
  useSkillsInventory: () => ({ data: null, isLoading: false }),
  useInferentialInsights: () => ({ data: null, isLoading: false, error: null }),
  useExtendedEquity: () => ({ data: null, isLoading: false, error: null, refetch: mockRefetch }),
  useActivationStatus: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock('../../api/export.api', () => ({
  fetchLgas: vi.fn().mockResolvedValue([]),
}));

// Story 12-6 review L3 — the Data Health trigger is role-gated, so the page now
// reads the auth context. Mutable so a test can take the role away.
const mockAuthUser = vi.hoisted(() => ({ current: { role: 'super_admin' } as { role: string } | null }));
vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser.current }),
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
  mockRegistryTotals.data = null; mockRegistryTotals.isLoading = true; mockRegistryTotals.error = null;
  (mockRegistryTotals as unknown as { isError: boolean }).isError = false;
  mockPipeline.data = null; mockPipeline.isLoading = true; mockPipeline.error = null;
  mockDataHealth.data = null; mockDataHealth.isLoading = false; mockDataHealth.isError = false;
  mockUseDataHealth.mockClear();
  mockAuthUser.current = { role: 'super_admin' };
}

/** The prod split this story exists to make legible: 139 people, 76 with answers. */
const TOTALS_139 = {
  totalRespondents: 139,
  withAnswers: 76,
  byDataStatus: { completed: 76, data_lost: 55, pending_nin: 1, nin_unavailable: 0, imported: 0, no_submission: 7 },
  bySource: {}, byCompleteness: { full: 76, core: 0, partial: 63 },
  byVerification: { nin_on_file: 130, self_declared: 8, pending_nin: 1, unverified_import: 0 },
  identityAmbiguous: 0, inProgressDrafts: 0,
};

/** `getRegistrySummary` — the 76, plus percentages computed OVER the 76. */
const SUMMARY_76 = {
  totalRespondents: 76, employedCount: 34, employedPct: 44.7, femaleCount: 38, femalePct: 50,
  avgAge: 30, businessOwners: 20, businessOwnersPct: 26.3,
  consentMarketplacePct: 70, consentEnrichedPct: 55,
};

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
    mockRegistryTotals.data = TOTALS_139; mockRegistryTotals.isLoading = false;

    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByText('Total Submissions')).toBeInTheDocument();
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
    expect(screen.getByText('Total Respondents')).toBeInTheDocument();
    expect(screen.getByText('With Answers')).toBeInTheDocument();
    expect(screen.getByText('Employed')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Avg Age')).toBeInTheDocument();
  });

  it('renders with data when hooks return results', () => {
    mockDemographics.data = { genderDistribution: [], ageDistribution: [], educationDistribution: [], maritalDistribution: [], disabilityPrevalence: [], lgaDistribution: [], consentMarketplace: [], consentEnriched: [] };
    mockDemographics.isLoading = false;
    mockRegistry.data = { totalRespondents: 100, employedCount: 60, employedPct: 60, femaleCount: 50, femalePct: 50, avgAge: 30, businessOwners: 20, businessOwnersPct: 20, consentMarketplacePct: 70, consentEnrichedPct: 55 };
    mockRegistry.isLoading = false;
    mockRegistryTotals.data = { ...TOTALS_139, totalRespondents: 163, withAnswers: 100 };
    mockRegistryTotals.isLoading = false;
    mockPipeline.data = { totalSubmissions: 500, completionRate: 85, avgCompletionTimeSecs: 1200, activeEnumerators: 12 };
    mockPipeline.isLoading = false;

    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByText('500')).toBeInTheDocument();
    // The total comes from the totals aggregate; the 100 is the answers subset.
    expect(screen.getByTestId('stat-total-respondents')).toHaveTextContent('163');
    expect(screen.getByTestId('stat-with-answers')).toHaveTextContent('100');
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

  // ── Story 12-5 AC6.1 — label honesty ─────────────────────────────────
  describe('honest headline (Story 12-5 AC1)', () => {
    function renderWithTotals() {
      mockRegistry.data = SUMMARY_76; mockRegistry.isLoading = false;
      mockRegistryTotals.data = TOTALS_139; mockRegistryTotals.isLoading = false;
      mockPipeline.data = { totalSubmissions: 500, completionRate: 85, avgCompletionTimeSecs: 1200, activeEnumerators: 12 };
      mockPipeline.isLoading = false;
      render(<SurveyAnalyticsPage />, { wrapper });
    }

    it('binds "Total Respondents" to the honest 139, not the 76', () => {
      renderWithTotals();
      const card = screen.getByTestId('stat-total-respondents');
      expect(card).toHaveTextContent('Total Respondents');
      expect(card).toHaveTextContent('139');
    });

    it('never labels the 76 as "Total Respondents"', () => {
      renderWithTotals();
      // The regression that mattered: the answers subset wearing the total's label.
      expect(screen.getByTestId('stat-total-respondents')).not.toHaveTextContent('76');
    });

    it('shows the 76 as a distinct, labelled "With Answers" figure', () => {
      renderWithTotals();
      const card = screen.getByTestId('stat-with-answers');
      expect(card).toHaveTextContent('With Answers');
      expect(card).toHaveTextContent('76');
    });

    it('sub-captions the percentage cards with the denominator they divide by', () => {
      renderWithTotals();
      // AC2.1 — so a reader cannot divide the 34 employed by 139.
      expect(screen.getByTestId('stat-employed')).toHaveTextContent('44.7% of 76 respondents with answers');
      expect(screen.getByTestId('stat-business-owners')).toHaveTextContent('26.3% of 76 respondents with answers');
    });

    it('keeps the two "with answers" figures apart when they still disagree', () => {
      // Review R1, updated by Story 12-6. Both aggregates now read the canonical
      // respondent-anchored source, so the GRAIN difference (271 people vs ~282
      // submissions) is gone. They can still differ, for a narrower reason:
      // getRegistryTotals additionally resolves rows to PEOPLE via 12-4's
      // identity key, so duplicate REGISTRATIONS collapse there and not here.
      //
      // The rule is unchanged and is what this pins: each figure is stated with
      // the base its own arithmetic used. The page must never reconcile them by
      // pointing one at the other's number.
      mockRegistry.data = { ...SUMMARY_76, totalRespondents: 282, employedPct: 44.7 };
      mockRegistry.isLoading = false;
      mockRegistryTotals.data = { ...TOTALS_139, totalRespondents: 300, withAnswers: 271 };
      mockRegistryTotals.isLoading = false;
      mockPipeline.data = { totalSubmissions: 500, completionRate: 85, avgCompletionTimeSecs: 1200, activeEnumerators: 12 };
      mockPipeline.isLoading = false;
      render(<SurveyAnalyticsPage />, { wrapper });

      // The card counts PEOPLE and says so.
      const withAnswers = screen.getByTestId('stat-with-answers');
      expect(withAnswers).toHaveTextContent('271');
      expect(withAnswers).toHaveTextContent('respondents whose answers we hold');

      // The percentage names the count it actually divided by (282), so that
      // figure is never mistaken for a second, contradictory value of the 271.
      expect(screen.getByTestId('stat-employed'))
        .toHaveTextContent('44.7% of 282 respondents with answers');
    });

    it('falls back to an em-dash rather than a wrong number when totals are unavailable', () => {
      mockRegistry.data = SUMMARY_76; mockRegistry.isLoading = false;
      mockRegistryTotals.data = undefined; mockRegistryTotals.isLoading = false;
      render(<SurveyAnalyticsPage />, { wrapper });
      // Never silently substitute the 76 for the total it is not.
      expect(screen.getByTestId('stat-total-respondents')).not.toHaveTextContent('76');
      expect(screen.getByTestId('stat-total-respondents')).toHaveTextContent('—');
    });
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

/**
 * Story 12-6 — the Data Health tab.
 *
 * The lazy-fire assertion is the one with teeth. The per-field pass reads every
 * answer-bearing row in the registry, so a tab that fetched eagerly would put
 * that scan on every dashboard load for readers who never open it — and nothing
 * on screen would show it happening.
 */
describe('SurveyAnalyticsPage — Data Health tab (Story 12-6)', () => {
  const DATA_HEALTH = {
    withAnswers: 76,
    formId: 'form-1',
    formTitle: 'OSLSR Master v3',
    fields: [
      { key: 'monthly_income', label: 'Monthly income', answeredCount: 0, responseRate: 0 },
      { key: 'gender', label: 'Gender', answeredCount: 76, responseRate: 100 },
    ],
    recoveryCohort: {
      total: 55,
      limit: 50,
      offset: 0,
      rows: [
        {
          respondentId: 'r-1',
          referenceCode: 'OYO-0001',
          fullName: 'Ade Bello',
          lgaId: 'ibadan_north',
          lgaName: 'Ibadan North',
          registeredAt: '2026-05-01T10:00:00.000Z',
          phoneNumber: '+2348012345678',
        },
      ],
    },
  };

  it('renders the tab trigger', () => {
    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByRole('tab', { name: 'Data Health' })).toBeInTheDocument();
  });

  it('does NOT fire its query until the tab is selected', () => {
    render(<SurveyAnalyticsPage />, { wrapper });
    // Third positional arg is `enabled`. It must be false on first paint.
    const [, , enabled] = mockUseDataHealth.mock.calls[0] as unknown as [unknown, unknown, boolean];
    expect(enabled).toBe(false);
  });

  it('fires its query once the tab is selected', async () => {
    const user = userEvent.setup();
    render(<SurveyAnalyticsPage />, { wrapper });
    await user.click(screen.getByRole('tab', { name: 'Data Health' }));

    const lastCall = mockUseDataHealth.mock.calls.at(-1) as unknown as [unknown, unknown, boolean];
    expect(lastCall[2]).toBe(true);
  });

  it('renders the funnel, status breakdown, field rates and recovery cohort', async () => {
    mockRegistryTotals.data = TOTALS_139; mockRegistryTotals.isLoading = false;
    mockDataHealth.data = DATA_HEALTH;

    const user = userEvent.setup();
    render(<SurveyAnalyticsPage />, { wrapper });
    await user.click(screen.getByRole('tab', { name: 'Data Health' }));

    expect(screen.getByTestId('data-health-panel')).toBeInTheDocument();
    expect(screen.getByTestId('data-health-funnel')).toBeInTheDocument();
    expect(screen.getByTestId('data-health-status-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('data-health-field-rates')).toBeInTheDocument();

    // The recoverable count is the COHORT size (55), not the drill page (1).
    expect(screen.getByTestId('data-health-recovery-count')).toHaveTextContent('55');
    expect(screen.getByTestId('data-health-recovery-bound')).toHaveTextContent('Showing 1 of 55');
    expect(screen.getByTestId('data-health-recovery-table')).toHaveTextContent('Ade Bello');
    expect(screen.getByTestId('data-health-recovery-table')).toHaveTextContent('OYO-0001');
  });

  it('shows skeletons while loading and the error card on failure', async () => {
    mockDataHealth.isLoading = true;
    const user = userEvent.setup();
    const { unmount } = render(<SurveyAnalyticsPage />, { wrapper });
    await user.click(screen.getByRole('tab', { name: 'Data Health' }));
    expect(screen.getByTestId('data-health-loading')).toBeInTheDocument();
    unmount();

    resetMocks();
    mockDataHealth.isError = true;
    mockRegistryTotals.isLoading = false;
    const user2 = userEvent.setup();
    render(<SurveyAnalyticsPage />, { wrapper });
    await user2.click(screen.getByRole('tab', { name: 'Data Health' }));
    expect(screen.getByTestId('data-health-error')).toBeInTheDocument();
  });

  it('surfaces a registry-totals failure instead of rendering a blank tab (review H2)', async () => {
    // ⚠️ THE HOLE THE ORIGINAL ERROR TEST PASSED OVER. It only ever drove
    // `dhError`, and `totals` happened to be undefined alongside it — so it never
    // reached the state where data-health SUCCEEDS and registry-totals FAILS.
    // The page passed only `dhError` through, so that state fell past every
    // branch in the panel and returned `null`: no skeleton, no error, a blank
    // tab. On a completeness view a blank space reads as an answer.
    mockRegistryTotals.data = null;
    mockRegistryTotals.isLoading = false;
    (mockRegistryTotals as unknown as { isError: boolean }).isError = true;
    mockDataHealth.data = DATA_HEALTH;

    const user = userEvent.setup();
    render(<SurveyAnalyticsPage />, { wrapper });
    await user.click(screen.getByRole('tab', { name: 'Data Health' }));

    expect(screen.getByTestId('data-health-error')).toBeInTheDocument();
    expect(screen.queryByTestId('data-health-panel')).not.toBeInTheDocument();
  });

  it('hides the tab from a role the route would 403 (review L3)', () => {
    // The route is narrowed to super-admin + government official because the
    // recovery drill carries PII. Offering a supervisor a tab that can only
    // answer 403 makes a permissions boundary look like a broken feature.
    //
    // ⚠️ Presentation only — `analytics.routes.test.ts` holds the actual control.
    mockAuthUser.current = { role: 'supervisor' };
    render(<SurveyAnalyticsPage />, { wrapper });

    expect(screen.queryByRole('tab', { name: 'Data Health' })).not.toBeInTheDocument();
    // ...and it does not fire a request it cannot be served.
    const enabledFlags = mockUseDataHealth.mock.calls.map(
      (c) => (c as unknown as [unknown, unknown, boolean])[2],
    );
    expect(enabledFlags.every((e) => e === false)).toBe(true);
  });

  it('still shows the tab to a government official', () => {
    mockAuthUser.current = { role: 'government_official' };
    render(<SurveyAnalyticsPage />, { wrapper });
    expect(screen.getByRole('tab', { name: 'Data Health' })).toBeInTheDocument();
  });
});
