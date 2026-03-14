/**
 * Official Statistics & Analytics Page
 *
 * Story 5.1 AC2, AC3: Skills distribution chart + LGA breakdown chart
 * Story 8.2 AC#2: Enhanced with tabbed analytics (Demographics, Employment, Household, Trends, Equity)
 *
 * Overview tab preserves existing hooks (useOfficial). New tabs use analytics hooks (8-1 endpoints).
 * NO PII anywhere — no names, NIN, phone numbers in any view.
 */

import { useState, useMemo } from 'react';
import type { AnalyticsQueryParams } from '@oslsr/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { SkeletonCard } from '../../../components/skeletons';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { useSkillsDistribution, useLgaBreakdown } from '../hooks/useOfficial';
import {
  useDemographics,
  useEmployment,
  useHousehold,
  useTrends,
  useRegistrySummary,
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
import { FullSkillsChart } from '../components/charts/FullSkillsChart';
import { SkillsCategoryChart } from '../components/charts/SkillsCategoryChart';
import { SkillsGapChart } from '../components/charts/SkillsGapChart';
import { SkillsConcentrationTable } from '../components/charts/SkillsConcentrationTable';
import { SkillsDiversityCards } from '../components/charts/SkillsDiversityCards';
import { Card } from '../../../components/ui/card';
import { SkillsDistributionChart } from '../components/SkillsDistributionChart';
import { LgaBreakdownChart } from '../components/LgaBreakdownChart';
import { AnalyticsFilters } from '../components/AnalyticsFilters';
import { AnalyticsTabsContent } from '../components/AnalyticsTabContent';
import { deriveEquityData } from '../utils/derive-equity-data';

export default function OfficialStatsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [params, setParams] = useState<AnalyticsQueryParams>({});

  // Existing hooks for Overview tab (Story 5.1)
  // NOTE (Fix 3): These hooks call /reports/overview, /reports/skills-distribution, and
  // /reports/lga-breakdown which are state-wide aggregate endpoints with no query param
  // support. Adding filter params would require API-side changes to the ReportService
  // (adding WHERE clauses for lgaId, dateFrom, dateTo). The global AnalyticsFilters
  // only affect the analytics hooks (8-1 endpoints), not these Overview endpoints.
  const { data: skills, isLoading: skillsLoading, error: skillsError } = useSkillsDistribution();
  const { data: lgaData, isLoading: lgaLoading, error: lgaError } = useLgaBreakdown();

  // Always enabled — registry summary shown in Equity tab metrics
  const { data: registry, isLoading: regLoading } = useRegistrySummary(params);
  const { data: pipeline } = usePipelineSummary(params);

  // Analytics hooks gated by active tab (Story 8.2)
  const { data: demographics, isLoading: demoLoading, error: demoError, refetch: refetchDemo } = useDemographics(params, activeTab === 'demographics' || activeTab === 'equity');
  const { data: employment, isLoading: empLoading, error: empError, refetch: refetchEmp } = useEmployment(params, activeTab === 'employment' || activeTab === 'equity');
  const { data: household, isLoading: hhLoading, error: hhError, refetch: refetchHh } = useHousehold(params, activeTab === 'household');
  const { data: trends, isLoading: trendsLoading, error: trendsError, refetch: refetchTrends } = useTrends(params, activeTab === 'trends');
  const { data: skillsInventory, isLoading: siLoading, isError: siError } = useSkillsInventory(params, activeTab === 'skills-inventory');
  const { data: insights, isLoading: insightsLoading, error: insightsError } = useInferentialInsights(params, activeTab === 'insights');
  const { data: extendedEquity, isLoading: eqxLoading, error: eqxError, refetch: refetchEqx } = useExtendedEquity(params, activeTab === 'equity');
  const [pdfLoading, setPdfLoading] = useState(false);

  const overviewLoading = skillsLoading || lgaLoading;

  // Compute summary stats for Overview tab
  const topSkill = skills && skills.length > 0 ? skills[0].skill : '—';
  const mostActiveLga = lgaData && lgaData.length > 0 ? lgaData[0].lgaName : '—';
  const lgasWithData = lgaData ? lgaData.filter((l) => l.count > 0).length : 0;

  // Derive equity data from raw analytics responses (Fix 4: derivation in parent)
  const equityData = useMemo(
    () => deriveEquityData(demographics, employment, registry),
    [demographics, employment, registry],
  );

  return (
    <div className="p-6" data-testid="official-stats-page">
      {/* Direction 08: Dark header accent strip */}
      <div className="bg-gray-800 text-white rounded-lg px-6 py-4 mb-6">
        <h1 className="text-2xl font-brand font-semibold">Statistics & Analytics</h1>
        <p className="text-gray-300 mt-1">
          Skills distribution, LGA analysis, and labour market intelligence
        </p>
      </div>

      {/* Global Filters */}
      <AnalyticsFilters value={params} onChange={setParams} showSource={false} className="mb-6" />

      {/* Tabbed Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-neutral-100 mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="household">Household</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="equity">Equity</TabsTrigger>
          <TabsTrigger value="cross-tab">Cross-Tab</TabsTrigger>
          <TabsTrigger value="skills-inventory">Skills Inventory</TabsTrigger>
          <TabsTrigger value="insights">Policy Insights</TabsTrigger>
        </TabsList>

        {/* Overview Tab — Preserved from Story 5.1 */}
        <TabsContent value="overview">
          <ErrorBoundary
            resetKey={activeTab}
            fallbackProps={{
              title: 'Overview chart error',
              description: 'This chart encountered an unexpected error. Other tabs still work.',
              showHomeLink: false,
            }}
          >
            {overviewLoading ? (
              <>
                <div className="border-l-4 border-gray-200 pl-4 mb-6">
                  <div className="h-6 w-32 bg-neutral-200 rounded animate-pulse" />
                </div>
                <div className="grid gap-6 md:grid-cols-3 mb-6">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              </>
            ) : (
              <>
                {/* Summary Stats Row */}
                <div className="border-l-4 border-[#9C1E23] pl-4 mb-6">
                  <h2 className="text-lg font-brand font-semibold text-gray-800">Summary</h2>
                </div>
                <div className="grid gap-6 md:grid-cols-3 mb-8" data-testid="summary-stats">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-600 mb-1">Top Skill</p>
                    <p className="text-lg font-semibold text-gray-800" data-testid="top-skill">{topSkill}</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-600 mb-1">Most Active LGA</p>
                    <p className="text-lg font-semibold text-gray-800" data-testid="most-active-lga">{mostActiveLga}</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-600 mb-1">Coverage</p>
                    <p className="text-lg font-semibold text-gray-800" data-testid="coverage">{lgasWithData} / 33</p>
                  </div>
                </div>

                {/* Charts Grid */}
                <div className="grid gap-6 md:grid-cols-2">
                  <SkillsDistributionChart
                    data={skills ?? []}
                    isLoading={false}
                    error={skillsError}
                  />
                  <LgaBreakdownChart
                    data={lgaData ?? []}
                    isLoading={false}
                    error={lgaError}
                  />
                </div>
              </>
            )}
          </ErrorBoundary>
        </TabsContent>

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

        {/* Policy Insights tab (Story 8.7) */}
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
                  }
                  finally { setPdfLoading(false); }
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
      </Tabs>

      {/* Activation Status Panel (Story 8.7) */}
      <ActivationStatusPanel />
    </div>
  );
}
