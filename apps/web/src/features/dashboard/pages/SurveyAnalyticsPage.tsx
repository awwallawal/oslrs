/**
 * Super Admin Survey Analytics Page
 *
 * Story 8.2 AC#1, AC#4, AC#5: Comprehensive survey analytics dashboard
 * with charts, stat cards, tabbed layout, global filters, and CSV export.
 */

import { useState, useMemo } from 'react';
import type { AnalyticsQueryParams } from '@oslsr/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { Card, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { AnalyticsFilters } from '../components/AnalyticsFilters';
import { ChartExportButton } from '../components/charts/ChartExportButton';
import { SkillsCharts } from '../components/charts/SkillsCharts';
import { AnalyticsTabsContent } from '../components/AnalyticsTabContent';
import { deriveEquityData } from '../utils/derive-equity-data';
import {
  useDemographics,
  useEmployment,
  useHousehold,
  useSkillsFrequency,
  useTrends,
  useRegistrySummary,
  useRegistryTotals,
  useDataHealth,
  usePipelineSummary,
  useSkillsInventory,
  useInferentialInsights,
  useExtendedEquity,
} from '../hooks/useAnalytics';
import { InsightsPanel } from '../components/charts/InsightsPanel';
import { ActivationStatusPanel } from '../components/ActivationStatusPanel';
import { fetchPolicyBriefPdf } from '../api/analytics.api';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CrossTabTable } from '../components/charts/CrossTabTable';
import { LgaChoroplethMap } from '../components/charts/LgaChoroplethMap';
import { FullSkillsChart } from '../components/charts/FullSkillsChart';
import { SkillsCategoryChart } from '../components/charts/SkillsCategoryChart';
import { SkillsGapChart } from '../components/charts/SkillsGapChart';
import { SkillsConcentrationTable } from '../components/charts/SkillsConcentrationTable';
import { SkillsDiversityCards } from '../components/charts/SkillsDiversityCards';
import { lgaDistributionToMapData } from '../utils/analytics-transforms';
import { ChartCard } from '../components/charts/ChartCard';
import { DataHealthPanel } from '../components/charts/DataHealthPanel';
import { useAuth } from '../../auth/context/AuthContext';
import { bucketTotal } from '../components/charts/chart-utils';
import {
  TOTAL_RESPONDENTS_LABEL,
  WITH_ANSWERS_LABEL,
  WITH_ANSWERS_CAPTION,
  ofAnswersCaption,
  pctOfAnswersCaption,
} from '../utils/registry-copy';

function StatCard({
  label,
  value,
  sub,
  testId,
}: {
  label: string;
  value: string | number;
  sub?: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-neutral-500 mb-0.5">{label}</p>
        <p className="text-lg font-bold text-gray-800">{value}</p>
        {sub && <p className="text-xs text-neutral-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function SurveyAnalyticsPage() {
  const [params, setParams] = useState<AnalyticsQueryParams>({});
  const [activeTab, setActiveTab] = useState('demographics');

  /**
   * 12-6 review L3 — the Data Health tab is shown only to the roles that can
   * actually load it.
   *
   * `GET /analytics/data-health` is narrowed at the route to super-admin +
   * government official (AC5.2), because the recovery drill carries respondent
   * PII. Every other tab on this page inherits the router-wide role set, so an
   * ungated trigger offered a supervisor or enumerator a tab that answers 403 —
   * they would click it and read "Failed to load data health", which describes a
   * broken tab rather than one that was never theirs.
   *
   * ⚠️ This is presentation only. The route is the control; hiding a trigger is
   * never authorization. The RBAC assertion in `analytics.routes.test.ts` is
   * what actually keeps this closed.
   */
  const { user } = useAuth();
  const canSeeDataHealth =
    user?.role === 'super_admin' || user?.role === 'government_official';

  // Always enabled — shown above tabs
  const { data: registry, isLoading: regLoading } = useRegistrySummary(params);
  // Story 12-5 AC1: the HONEST registry total. `registry.totalRespondents` is
  // the answer-bearing subset, NOT the total — never bind a total to it.
  // `isError` is read because the Data Health tab renders the funnel and the
  // per-status breakdown from THIS query rather than its own — so a
  // registry-totals failure is a Data-Health failure and has to reach the
  // panel (12-6 review H2). Without it the tab fell through every branch and
  // rendered nothing at all: no skeleton, no error, a blank tab.
  const { data: totals, isLoading: totalsLoading, isError: totalsError } = useRegistryTotals(params);
  const { data: pipeline, isLoading: pipeLoading } = usePipelineSummary(params);

  // AC1.2 / 13-33 harmonization: the "with answers" figure is sourced from
  // `getRegistryTotals().withAnswers`, and the % cards state the denominator
  // `getRegistrySummary` actually divided by. Each figure is still read from
  // the aggregate that produced it — never cross-bound.
  //
  // ⚠️ Story 12-6 removed the GRAIN difference between these two (both now read
  // the canonical respondent-anchored source, so neither double-counts a person
  // with two answer-bearing submissions) — but they are STILL not guaranteed
  // equal, and the remaining gap is not a bug:
  //   • `getRegistrySummary` counts unified ROWS — one per `respondents.id`.
  //   • `getRegistryTotals().withAnswers` counts PEOPLE **after** 12-4's
  //     identity-key collapse (NIN → E.164 phone), so a person holding two
  //     respondent rows is one here and two there.
  // The residual difference is therefore exactly 12-4's `identityAmbiguous`
  // territory — duplicate registrations, not double-counted submissions.
  //
  // ⚠️ Measured on prod 2026-08-21 that difference is ZERO (272 answer-bearing
  // rows resolve to 272 distinct identities), so these two SHOULD read the same
  // today. A gap appearing here is a signal worth chasing, not an expected
  // rounding artefact — but still never close one by pointing a figure at the
  // other's number; that publishes a denominator the arithmetic never used.
  const withAnswers = totals?.withAnswers;
  const pctDenominator = registry?.totalRespondents;

  // Gated by active tab — only fire when the corresponding tab is selected
  const { data: demographics, isLoading: demoLoading, error: demoError, refetch: refetchDemo } = useDemographics(params, activeTab === 'demographics' || activeTab === 'equity' || activeTab === 'geographic');
  const { data: employment, isLoading: empLoading, error: empError, refetch: refetchEmp } = useEmployment(params, activeTab === 'employment' || activeTab === 'equity');
  const { data: household, isLoading: hhLoading, error: hhError, refetch: refetchHh } = useHousehold(params, activeTab === 'household');
  const { data: skills, isLoading: skillsLoading, error: skillsError, refetch: refetchSkills } = useSkillsFrequency(params, activeTab === 'skills');
  const { data: trends, isLoading: trendsLoading, error: trendsError, refetch: refetchTrends } = useTrends(params, activeTab === 'trends');
  const { data: skillsInventory, isLoading: siLoading, isError: siError } = useSkillsInventory(params, activeTab === 'skills-inventory');
  const { data: insights, isLoading: insightsLoading, error: insightsError } = useInferentialInsights(params, activeTab === 'insights');
  const { data: extendedEquity, isLoading: eqxLoading, error: eqxError, refetch: refetchEqx } = useExtendedEquity(params, activeTab === 'equity');
  // Story 12-6 — Data Health. Lazy-fired like every other tab: the per-field
  // pass reads every answer-bearing row, so it must not run for a reader who
  // never opens the tab.
  const {
    data: dataHealth,
    isLoading: dhLoading,
    isError: dhError,
  // Gated on the ROLE as well as the tab: a role that cannot load this route
  // must not fire a request that can only 403 (12-6 review L3).
  } = useDataHealth(params, undefined, canSeeDataHealth && activeTab === 'data-health');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Derive equity data from raw analytics responses (Fix 4: derivation in parent)
  const equityData = useMemo(
    () => deriveEquityData(demographics, employment, registry),
    [demographics, employment, registry],
  );

  return (
    <div className="p-6" data-testid="survey-analytics-page">
      {/* Dark header strip */}
      <div className="bg-gray-800 text-white rounded-lg px-6 py-4 mb-6">
        <h1 className="text-2xl font-brand font-semibold">Survey Analytics</h1>
        <p className="text-gray-300 mt-1">State-wide labour market intelligence</p>
      </div>

      {/* Global Filters */}
      <AnalyticsFilters value={params} onChange={setParams} className="mb-6" />

      {/* Pipeline Stat Cards (Row A) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {pipeLoading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <StatCard label="Total Submissions" value={pipeline?.totalSubmissions.toLocaleString() ?? '—'} />
            <StatCard label="Completion Rate" value={pipeline?.completionRate != null ? `${pipeline.completionRate}%` : '—'} />
            <StatCard label="Avg Completion Time" value={pipeline?.avgCompletionTimeSecs != null ? `${Math.round(pipeline.avgCompletionTimeSecs / 60)}m` : 'N/A'} />
            <StatCard label="Active Enumerators (7d)" value={pipeline?.activeEnumerators ?? '—'} />
          </>
        )}
      </div>

      {/*
        Registry Stat Cards (Row B) — Story 12-5 AC1/AC2.

        Two cards carry the distinction the whole story rests on: "Total
        Respondents" is registered PEOPLE (12-4's aggregate) and "With Answers"
        is the subset whose questionnaire answers are on file. They used to be
        one card showing the second number under the first label, which made 63
        of 139 registered people invisible on the Ministry's own dashboard.

        Every percentage below is computed over the answers subset, so each
        states that denominator inline — a reader who divides by the 139 gets a
        different, wrong number, and nothing on the old card said so.
      */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
        {regLoading || totalsLoading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              testId="stat-total-respondents"
              label={TOTAL_RESPONDENTS_LABEL}
              value={totals?.totalRespondents.toLocaleString() ?? '—'}
              sub="registered people"
            />
            <StatCard
              testId="stat-with-answers"
              label={WITH_ANSWERS_LABEL}
              value={withAnswers?.toLocaleString() ?? '—'}
              sub={WITH_ANSWERS_CAPTION}
            />
            <StatCard
              testId="stat-employed"
              label="Employed"
              value={registry?.employedCount.toLocaleString() ?? '—'}
              sub={registry && pctDenominator != null ? pctOfAnswersCaption(registry.employedPct, pctDenominator) : undefined}
            />
            <StatCard
              testId="stat-female"
              label="Female"
              value={registry?.femaleCount.toLocaleString() ?? '—'}
              sub={registry && pctDenominator != null ? pctOfAnswersCaption(registry.femalePct, pctDenominator) : undefined}
            />
            <StatCard
              testId="stat-avg-age"
              label="Avg Age"
              value={registry?.avgAge ?? '—'}
              sub={pctDenominator != null ? ofAnswersCaption(pctDenominator) : undefined}
            />
            <StatCard
              testId="stat-business-owners"
              label="Business Owners"
              value={registry?.businessOwners.toLocaleString() ?? '—'}
              sub={registry && pctDenominator != null ? pctOfAnswersCaption(registry.businessOwnersPct, pctDenominator) : undefined}
            />
            <StatCard
              testId="stat-consent-optin"
              label="Consent Opt-In"
              value={registry?.consentMarketplacePct != null ? `${registry.consentMarketplacePct}%` : '—'}
              sub={pctDenominator != null ? ofAnswersCaption(pctDenominator) : undefined}
            />
            <StatCard
              testId="stat-consent-enriched"
              label="Enriched Consent"
              value={registry?.consentEnrichedPct != null ? `${registry.consentEnrichedPct}%` : '—'}
              sub={pctDenominator != null ? ofAnswersCaption(pctDenominator) : undefined}
            />
          </>
        )}
      </div>

      {/* Tabbed Chart Area */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-neutral-100 mb-4">
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="household">Household</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="equity">Equity</TabsTrigger>
          <TabsTrigger value="geographic">Geographic</TabsTrigger>
          <TabsTrigger value="cross-tab">Cross-Tab</TabsTrigger>
          <TabsTrigger value="skills-inventory">Skills Inventory</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          {canSeeDataHealth && <TabsTrigger value="data-health">Data Health</TabsTrigger>}
        </TabsList>

        {/* Shared tabs: Demographics, Employment, Household, Trends, Equity */}
        <AnalyticsTabsContent
          activeTab={activeTab}
          demographics={demographics}
          demoLoading={demoLoading}
          demoError={demoError}
          onRetryDemo={refetchDemo}
          employment={employment}
          empLoading={empLoading}
          empError={empError}
          onRetryEmp={refetchEmp}
          household={household}
          hhLoading={hhLoading}
          hhError={hhError}
          onRetryHh={refetchHh}
          trends={trends}
          trendsLoading={trendsLoading}
          trendsError={trendsError}
          onRetryTrends={refetchTrends}
          equityData={equityData}
          equityLoading={demoLoading || empLoading || regLoading}
          equityError={demoError || empError}
          onRetryEquity={() => { refetchDemo(); refetchEmp(); }}
          extendedEquity={extendedEquity}
          eqxLoading={eqxLoading}
          eqxError={eqxError}
          onRetryEqx={refetchEqx}
        />

        {/* Skills tab — only on SurveyAnalyticsPage (not shared) */}
        <TabsContent value="skills">
          <ErrorBoundary
            resetKey={activeTab}
            fallbackProps={{
              title: 'Skills chart error',
              description: 'This chart encountered an unexpected error. Other tabs still work.',
              showHomeLink: false,
            }}
          >
            <div className="flex justify-end mb-2">
              <ChartExportButton
                data={skills?.skills ?? []}
                filename="skills-frequency"
              />
            </div>
            {/*
              Story 12-5 AC4: the skills denominator is `respondentsAnswering` —
              the people who answered the skills question — NOT the sum of the
              counts. One respondent selecting five skills is one person here
              and five there, so summing would overstate the base badly.
            */}
            <SkillsCharts
              data={skills?.skills ?? []}
              n={skills?.respondentsAnswering}
              isLoading={skillsLoading}
              error={skillsError}
              onRetry={refetchSkills}
            />
          </ErrorBoundary>
        </TabsContent>

        {/* Geographic tab (Story 8.8) */}
        <TabsContent value="geographic">
          <ErrorBoundary
            resetKey={activeTab}
            fallbackProps={{
              title: 'Geographic chart error',
              description: 'This chart encountered an unexpected error. Other tabs still work.',
              showHomeLink: false,
            }}
          >
            {demoLoading && <SkeletonCard />}
            {demoError && (
              <Card className="p-6 text-center text-red-600">Failed to load geographic data.</Card>
            )}
            {demographics && (
              // AC4: the map's N is carried on the card rather than inside
              // LgaChoroplethMap, because the same map also renders on the
              // PUBLIC insights page over banded data whose small counts are
              // deliberately withheld — summing those would understate the base.
              // This N is the dashboard's own unbanded LGA distribution.
              <ChartCard
                title="Registration Density by LGA"
                n={bucketTotal(demographics.lgaDistribution)}
                bodyClassName=""
              >
                <LgaChoroplethMap
                  data={lgaDistributionToMapData(demographics.lgaDistribution)}
                  onLgaClick={(lgaCode) => setParams({ ...params, lgaId: lgaCode })}
                />
              </ChartCard>
            )}
          </ErrorBoundary>
        </TabsContent>

        {/* Cross-Tab tab (Story 8.6) */}
        <TabsContent value="cross-tab">
          <ErrorBoundary
            resetKey={activeTab}
            fallbackProps={{
              title: 'Cross-tabulation error',
              description: 'This tab encountered an unexpected error. Other tabs still work.',
              showHomeLink: false,
            }}
          >
            <CrossTabTable params={params} />
          </ErrorBoundary>
        </TabsContent>

        {/* Skills Inventory tab (Story 8.6) */}
        <TabsContent value="skills-inventory">
          <ErrorBoundary
            resetKey={activeTab}
            fallbackProps={{
              title: 'Skills inventory error',
              description: 'This tab encountered an unexpected error. Other tabs still work.',
              showHomeLink: false,
            }}
          >
            {siLoading && <SkeletonCard data-testid="skills-inventory-skeleton" />}
            {siError && (
              <Card className="p-6 text-center text-red-600" data-testid="skills-inventory-error">
                Failed to load skills inventory data.
              </Card>
            )}
            {skillsInventory && (
              <div className="space-y-6" data-testid="skills-inventory-section">
                <FullSkillsChart skills={skillsInventory.allSkills} threshold={skillsInventory.thresholds.allSkills} />
                <SkillsCategoryChart categories={skillsInventory.byCategory} threshold={skillsInventory.thresholds.byCategory} />
                <SkillsGapChart gapAnalysis={skillsInventory.gapAnalysis} threshold={skillsInventory.thresholds.gapAnalysis} />
                <SkillsConcentrationTable data={skillsInventory.byLga} threshold={skillsInventory.thresholds.byLga} />
                <SkillsDiversityCards data={skillsInventory.diversityIndex} threshold={skillsInventory.thresholds.diversityIndex} />
              </div>
            )}
          </ErrorBoundary>
        </TabsContent>

        {/* Insights tab (Story 8.7) */}
        <TabsContent value="insights">
          <ErrorBoundary
            resetKey={activeTab}
            fallbackProps={{
              title: 'Insights error',
              description: 'This tab encountered an unexpected error. Other tabs still work.',
              showHomeLink: false,
            }}
          >
            <div className="flex justify-end mb-4">
              <button
                onClick={async () => {
                  setPdfLoading(true);
                  try {
                    const blob = await fetchPolicyBriefPdf();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `oslrs-policy-brief-${new Date().toISOString().split('T')[0]}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'PDF generation failed');
                  } finally {
                    setPdfLoading(false);
                  }
                }}
                disabled={pdfLoading || (pipeline?.totalSubmissions ?? 0) < 100}
                className="inline-flex items-center gap-2 rounded-md bg-[#9C1E23] px-3 py-2 text-sm text-white hover:bg-[#7A171B] disabled:opacity-50 disabled:cursor-not-allowed"
                title={(pipeline?.totalSubmissions ?? 0) < 100 ? 'Need >= 100 submissions for policy brief' : undefined}
              >
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {pdfLoading ? 'Generating...' : 'Export Policy Brief'}
              </button>
            </div>
            {insightsLoading && <SkeletonCard />}
            {insightsError && (
              <Card className="p-6 text-center text-red-600">Failed to load inferential insights.</Card>
            )}
            {insights && <InsightsPanel data={insights} />}
          </ErrorBoundary>
        </TabsContent>

        {/* Data Health tab (Story 12-6) */}
        {canSeeDataHealth && (
        <TabsContent value="data-health">
          <ErrorBoundary
            resetKey={activeTab}
            fallbackProps={{
              title: 'Data health error',
              description: 'This tab encountered an unexpected error. Other tabs still work.',
              showHomeLink: false,
            }}
          >
            {/*
              The funnel + per-status breakdown come from `totals` (12-4's
              aggregate, already fetched above for the header strip) and are NOT
              re-fetched here — one registry, one count. Only the per-field rates
              and the recovery cohort are this tab's own request.
            */}
            <DataHealthPanel
              totals={totals}
              dataHealth={dataHealth}
              isLoading={dhLoading || totalsLoading}
              // BOTH queries feed this tab; either failing must surface as a
              // failure. See the note on `totalsError` above.
              isError={dhError || totalsError}
            />
          </ErrorBoundary>
        </TabsContent>
        )}
      </Tabs>

      {/* Activation Status Panel (Story 8.7) — all roles */}
      <ActivationStatusPanel />
    </div>
  );
}
