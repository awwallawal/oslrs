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

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
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

  // Always enabled — shown above tabs
  const { data: registry, isLoading: regLoading } = useRegistrySummary(params);
  const { data: pipeline, isLoading: pipeLoading } = usePipelineSummary(params);

  // Gated by active tab — only fire when the corresponding tab is selected
  const { data: demographics, isLoading: demoLoading, error: demoError, refetch: refetchDemo } = useDemographics(params, activeTab === 'demographics' || activeTab === 'equity');
  const { data: employment, isLoading: empLoading, error: empError, refetch: refetchEmp } = useEmployment(params, activeTab === 'employment' || activeTab === 'equity');
  const { data: household, isLoading: hhLoading, error: hhError, refetch: refetchHh } = useHousehold(params, activeTab === 'household');
  const { data: skills, isLoading: skillsLoading, error: skillsError, refetch: refetchSkills } = useSkillsFrequency(params, activeTab === 'skills');
  const { data: trends, isLoading: trendsLoading, error: trendsError, refetch: refetchTrends } = useTrends(params, activeTab === 'trends');
  const { data: skillsInventory, isLoading: siLoading, isError: siError } = useSkillsInventory(params, activeTab === 'skills-inventory');
  const { data: insights, isLoading: insightsLoading, error: insightsError } = useInferentialInsights(params, activeTab === 'insights');
  const { data: extendedEquity, isLoading: eqxLoading, error: eqxError, refetch: refetchEqx } = useExtendedEquity(params, activeTab === 'equity');
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

      {/* Registry Stat Cards (Row B) */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {regLoading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <StatCard label="Total Respondents" value={registry?.totalRespondents.toLocaleString() ?? '—'} />
            <StatCard label="Employed" value={registry?.employedCount.toLocaleString() ?? '—'} sub={registry ? `${registry.employedPct}%` : undefined} />
            <StatCard label="Female" value={registry?.femaleCount.toLocaleString() ?? '—'} sub={registry ? `${registry.femalePct}%` : undefined} />
            <StatCard label="Avg Age" value={registry?.avgAge ?? '—'} />
            <StatCard label="Business Owners" value={registry?.businessOwners.toLocaleString() ?? '—'} sub={registry ? `${registry.businessOwnersPct}%` : undefined} />
            <StatCard label="Consent Opt-In" value={registry?.consentMarketplacePct != null ? `${registry.consentMarketplacePct}%` : '—'} />
            <StatCard label="Enriched Consent" value={registry?.consentEnrichedPct != null ? `${registry.consentEnrichedPct}%` : '—'} />
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
          <TabsTrigger value="cross-tab">Cross-Tab</TabsTrigger>
          <TabsTrigger value="skills-inventory">Skills Inventory</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
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
                data={skills ?? []}
                filename="skills-frequency"
              />
            </div>
            <SkillsCharts data={skills ?? []} isLoading={skillsLoading} error={skillsError} onRetry={refetchSkills} />
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
      </Tabs>

      {/* Activation Status Panel (Story 8.7) — all roles */}
      <ActivationStatusPanel />
    </div>
  );
}
