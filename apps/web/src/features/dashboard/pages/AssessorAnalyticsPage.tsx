/**
 * Assessor Verification Analytics Page
 * Story 8.4: Verification pipeline analytics for Assessor, Super Admin, Government Official
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { useVerificationPipeline, useDemographics, useEmployment } from '../hooks/useAnalytics';
import { AnalyticsFilters } from '../components/AnalyticsFilters';
import VerificationFunnelChart from '../components/charts/VerificationFunnelChart';
import FraudTypeBreakdownChart from '../components/charts/FraudTypeBreakdownChart';
import ReviewThroughputChart from '../components/charts/ReviewThroughputChart';
import TopFlaggedEnumeratorsTable from '../components/charts/TopFlaggedEnumeratorsTable';
import BacklogTrendChart from '../components/charts/BacklogTrendChart';
import RejectionReasonsChart from '../components/charts/RejectionReasonsChart';
import PipelineStatCards from '../components/charts/PipelineStatCards';
import { DemographicCharts } from '../components/charts/DemographicCharts';
import { EmploymentCharts } from '../components/charts/EmploymentCharts';
import { Card, CardContent } from '../../../components/ui/card';
import type { AnalyticsQueryParams } from '@oslsr/types';
import { ActivationStatusPanel } from '../components/ActivationStatusPanel';

const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;

export default function AssessorAnalyticsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pipeline');
  const [filterParams, setFilterParams] = useState<AnalyticsQueryParams>({});
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);

  const handleFilterChange = useCallback((params: AnalyticsQueryParams) => {
    setFilterParams(params);
  }, []);

  const handleSeverityToggle = useCallback((severity: string) => {
    setSelectedSeverities(prev => {
      const next = prev.includes(severity) ? prev.filter(s => s !== severity) : [...prev, severity];
      return next;
    });
  }, []);

  const pipelineParams = {
    lgaId: filterParams.lgaId,
    severity: selectedSeverities.length > 0 ? selectedSeverities : undefined,
    dateFrom: filterParams.dateFrom,
    dateTo: filterParams.dateTo,
  };

  const pipeline = useVerificationPipeline(
    pipelineParams,
    activeTab === 'pipeline' || activeTab === 'quality',
  );

  const demographics = useDemographics(filterParams, activeTab === 'demographics');
  const employment = useEmployment(filterParams, activeTab === 'demographics');

  const data = pipeline.data;

  return (
    <div className="p-6">
      {/* Dark Header */}
      <div className="bg-neutral-900 text-white rounded-lg px-6 py-4 mb-6">
        <h1 className="text-xl font-brand font-semibold">Verification Analytics</h1>
        <p className="text-neutral-300 text-sm mt-1">Monitor the verification pipeline and data quality patterns</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <AnalyticsFilters
          value={filterParams}
          onChange={handleFilterChange}
          showSource={false}
        />
        {/* Severity multi-select */}
        <div className="flex gap-1" data-testid="severity-filter">
          {SEVERITY_OPTIONS.map(sev => (
            <button
              key={sev}
              onClick={() => handleSeverityToggle(sev)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                selectedSeverities.includes(sev)
                  ? 'bg-[#9C1E23] text-white border-[#9C1E23]'
                  : 'bg-white text-neutral-600 border-neutral-300 hover:border-[#9C1E23]'
              }`}
              aria-label={`Filter severity: ${sev}`}
            >
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-neutral-100 mb-4">
          <TabsTrigger value="pipeline">Verification Pipeline</TabsTrigger>
          <TabsTrigger value="quality">Data Quality Flags</TabsTrigger>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <div className="space-y-6">
            {/* Row 1: Stat Cards */}
            <PipelineStatCards
              avgReviewTimeMinutes={data?.avgReviewTimeMinutes ?? null}
              medianTimeToResolutionDays={data?.medianTimeToResolutionDays ?? null}
              completenessRate={data?.dataQualityScore.completenessRate ?? 0}
              consistencyRate={data?.dataQualityScore.consistencyRate ?? 0}
              isLoading={pipeline.isLoading}
              error={pipeline.error}
            />

            {/* Row 2: Funnel */}
            <VerificationFunnelChart
              data={data?.funnel}
              isLoading={pipeline.isLoading}
              error={pipeline.error}
            />

            {/* Row 3: Fraud breakdown + Rejection reasons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FraudTypeBreakdownChart
                data={data?.fraudTypeBreakdown}
                isLoading={pipeline.isLoading}
                error={pipeline.error}
              />
              <RejectionReasonsChart
                data={data?.rejectionReasons}
                isLoading={pipeline.isLoading}
                error={pipeline.error}
              />
            </div>

            {/* Row 4: Throughput */}
            <ReviewThroughputChart
              data={data?.throughputTrend}
              isLoading={pipeline.isLoading}
              error={pipeline.error}
            />

            {/* Row 5: Backlog + Top Flagged */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <BacklogTrendChart
                data={data?.backlogTrend}
                isLoading={pipeline.isLoading}
                error={pipeline.error}
              />
              <TopFlaggedEnumeratorsTable
                data={data?.topFlaggedEnumerators}
                isLoading={pipeline.isLoading}
                error={pipeline.error}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="quality">
          <div className="space-y-6">
            {/* Quality stat cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="py-4 text-center">
                  <div className="text-sm text-neutral-500">Completeness Rate</div>
                  <div className="text-3xl font-bold text-[#9C1E23]">
                    {data ? `${data.dataQualityScore.completenessRate.toFixed(1)}%` : '—'}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <div className="text-sm text-neutral-500">Consistency Rate</div>
                  <div className="text-3xl font-bold text-[#9C1E23]">
                    {data ? `${data.dataQualityScore.consistencyRate.toFixed(1)}%` : '—'}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent quality flags table */}
            <Card>
              <CardContent className="py-4">
                <h3 className="font-semibold mb-3">Recent Quality Flags by Type</h3>
                {data && data.fraudTypeBreakdown ? (
                  <div className="space-y-2">
                    {[
                      { label: 'GPS Cluster', count: data.fraudTypeBreakdown.gpsCluster, severity: 'high,critical' },
                      { label: 'Speed Run', count: data.fraudTypeBreakdown.speedRun, severity: 'high,critical' },
                      { label: 'Straight-lining', count: data.fraudTypeBreakdown.straightLining, severity: 'high,critical' },
                      { label: 'Duplicate Response', count: data.fraudTypeBreakdown.duplicateResponse, severity: 'high,critical' },
                      { label: 'Off Hours', count: data.fraudTypeBreakdown.offHours, severity: 'high,critical' },
                    ].map(flag => (
                      <div
                        key={flag.label}
                        onClick={() => navigate(`/dashboard/assessor/queue?severity=${flag.severity}`)}
                        className="flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-neutral-50 transition-colors"
                        data-testid={`quality-flag-${flag.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <span className="text-sm font-medium">{flag.label}</span>
                        <span className="text-sm text-neutral-500">{flag.count} flags</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-neutral-500 text-center py-4">No data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="demographics">
          <div className="space-y-6">
            <DemographicCharts
              data={demographics.data}
              isLoading={demographics.isLoading}
              error={demographics.error}
              onRetry={() => demographics.refetch()}
            />
            <EmploymentCharts
              data={employment.data}
              isLoading={employment.isLoading}
              error={employment.error}
              onRetry={() => employment.refetch()}
            />
          </div>
        </TabsContent>
      </Tabs>
      <ActivationStatusPanel />
    </div>
  );
}
