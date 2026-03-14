/**
 * Supervisor Team Analytics Page
 * Story 8.3: Field Team Analytics — Supervisor view
 */

import { useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { Card } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { useTeamQuality, useDemographics, useEmployment, useSkillsInventory } from '../hooks/useAnalytics';
import { AnalyticsFilters } from '../components/AnalyticsFilters';
import TeamQualityCharts from '../components/charts/TeamQualityCharts';
import TeamCompletionTimeChart from '../components/charts/TeamCompletionTimeChart';
import DayOfWeekChart from '../components/charts/DayOfWeekChart';
import HourOfDayChart from '../components/charts/HourOfDayChart';
import FieldCoverageMap from '../components/charts/FieldCoverageMap';
import type { AnalyticsQueryParams } from '@oslsr/types';
import { ActivationStatusPanel } from '../components/ActivationStatusPanel';

// Named imports from Story 8-2
import { DemographicCharts } from '../components/charts/DemographicCharts';
import { EmploymentCharts } from '../components/charts/EmploymentCharts';
import { FullSkillsChart } from '../components/charts/FullSkillsChart';
import { SkillsCategoryChart } from '../components/charts/SkillsCategoryChart';

export default function SupervisorAnalyticsPage() {
  const [activeTab, setActiveTab] = useState('quality');
  const [filterParams, setFilterParams] = useState<AnalyticsQueryParams>({});

  const handleFilterChange = useCallback((params: AnalyticsQueryParams) => {
    setFilterParams(params);
  }, []);

  const teamQuality = useTeamQuality(
    { dateFrom: filterParams.dateFrom, dateTo: filterParams.dateTo },
    activeTab === 'quality' || activeTab === 'coverage',
  );

  // LGA Demographics tab: reuse same endpoints — supervisor scope auto-applied by backend
  const demographics = useDemographics(
    filterParams,
    activeTab === 'demographics',
  );
  const employment = useEmployment(
    filterParams,
    activeTab === 'demographics',
  );

  const { data: skillsInventory, isLoading: siLoading, isError: siError } = useSkillsInventory(
    filterParams,
    activeTab === 'skills',
  );

  return (
    <div className="p-6">
      {/* Dark Header */}
      <div className="bg-neutral-900 text-white rounded-lg px-6 py-4 mb-6">
        <h1 className="text-xl font-brand font-semibold">Team Analytics</h1>
        <p className="text-neutral-300 text-sm mt-1">Monitor your team's performance and data quality</p>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <AnalyticsFilters
          value={filterParams}
          onChange={handleFilterChange}
          showSource={false}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-neutral-100 mb-4">
          <TabsTrigger value="quality">Data Quality</TabsTrigger>
          <TabsTrigger value="coverage">Field Coverage</TabsTrigger>
          <TabsTrigger value="demographics">LGA Demographics</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
        </TabsList>

        <TabsContent value="quality">
          <div className="space-y-6">
            <TeamQualityCharts
              data={teamQuality.data}
              isLoading={teamQuality.isLoading}
              error={teamQuality.error}
              onRetry={() => teamQuality.refetch()}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TeamCompletionTimeChart
                enumerators={teamQuality.data?.enumerators}
                teamAvgTime={teamQuality.data?.teamAverages.avgCompletionTime ?? null}
                isLoading={teamQuality.isLoading}
                error={teamQuality.error}
              />
              <div className="grid grid-cols-1 gap-6">
                <DayOfWeekChart
                  data={teamQuality.data?.dayOfWeekPattern}
                  isLoading={teamQuality.isLoading}
                  error={teamQuality.error}
                />
                <HourOfDayChart
                  data={teamQuality.data?.hourOfDayPattern}
                  isLoading={teamQuality.isLoading}
                  error={teamQuality.error}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="coverage">
          <div className="space-y-6">
            <FieldCoverageMap
              isLoading={teamQuality.isLoading}
              error={teamQuality.error}
            />
            {teamQuality.data && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg border p-4 text-center">
                  <div className="text-sm text-neutral-500">GPS Coverage Rate</div>
                  <div className="text-3xl font-bold text-[#9C1E23]">
                    {teamQuality.data.teamAverages.gpsRate !== null
                      ? `${(teamQuality.data.teamAverages.gpsRate * 100).toFixed(0)}%`
                      : '—'}
                  </div>
                </div>
                <div className="bg-white rounded-lg border p-4 text-center">
                  <div className="text-sm text-neutral-500">NIN Capture Rate</div>
                  <div className="text-3xl font-bold text-[#9C1E23]">
                    {teamQuality.data.teamAverages.ninRate !== null
                      ? `${(teamQuality.data.teamAverages.ninRate * 100).toFixed(0)}%`
                      : '—'}
                  </div>
                </div>
              </div>
            )}
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

        {/* Simplified Skills tab (Story 8.6) — LGA-scoped only */}
        <TabsContent value="skills">
          {siLoading && <SkeletonCard data-testid="skills-inventory-skeleton" />}
          {siError && (
            <Card className="p-6 text-center text-red-600" data-testid="skills-inventory-error">
              Failed to load skills inventory data.
            </Card>
          )}
          {skillsInventory && (
            <div className="space-y-6" data-testid="supervisor-skills-section">
              <FullSkillsChart skills={skillsInventory.allSkills} threshold={skillsInventory.thresholds.allSkills} />
              <SkillsCategoryChart categories={skillsInventory.byCategory} threshold={skillsInventory.thresholds.byCategory} />
            </div>
          )}
        </TabsContent>
      </Tabs>
      <ActivationStatusPanel />
    </div>
  );
}
