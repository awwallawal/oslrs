/**
 * Enumerator My Stats Page
 * Story 8.3: Field Team Analytics — Enumerator personal view
 */

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { Card, CardContent } from '../../../components/ui/card';
import { usePersonalStats } from '../hooks/useAnalytics';
import PersonalTrendChart from '../components/charts/PersonalTrendChart';
import PersonalSkillsChart from '../components/charts/PersonalSkillsChart';
import CompletionTimeComparison from '../components/charts/CompletionTimeComparison';
import DataQualityScorecard from '../components/charts/DataQualityScorecard';
import RespondentDiversityChart from '../components/charts/RespondentDiversityChart';
import { ActivationStatusPanel } from '../components/ActivationStatusPanel';

export default function EnumeratorStatsPage() {
  const [activeTab, setActiveTab] = useState('performance');
  const stats = usePersonalStats();

  return (
    <div className="p-6">
      {/* Dark Header */}
      <div className="bg-neutral-900 text-white rounded-lg px-6 py-4 mb-6">
        <h1 className="text-xl font-brand font-semibold">My Stats</h1>
        <p className="text-neutral-300 text-sm mt-1">Track your personal performance and data quality</p>
      </div>

      {/* Summary Cards */}
      {stats.data && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-sm text-neutral-500">Total Submissions</div>
              <div className="text-3xl font-bold text-[#9C1E23]">{stats.data.cumulativeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-sm text-neutral-500">Quality Score</div>
              <div className="text-3xl font-bold text-[#9C1E23]">
                {stats.data.compositeQualityScore !== null ? Math.round(stats.data.compositeQualityScore) : '—'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-sm text-neutral-500">Avg Completion</div>
              <div className="text-3xl font-bold text-[#9C1E23]">
                {stats.data.avgCompletionTimeSec !== null ? `${Math.round(stats.data.avgCompletionTimeSec / 60)}m` : '—'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-neutral-100 mb-4 overflow-x-auto">
          <TabsTrigger value="performance">My Performance</TabsTrigger>
          <TabsTrigger value="quality">My Data Quality</TabsTrigger>
          <TabsTrigger value="profile">My Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="performance">
          <div className="space-y-6">
            <PersonalTrendChart
              data={stats.data?.dailyTrend}
              isLoading={stats.isLoading}
              error={stats.error}
            />
            <CompletionTimeComparison
              avgTimeSec={stats.data?.avgCompletionTimeSec ?? null}
              teamAvgTimeSec={stats.data?.teamAvgCompletionTimeSec ?? null}
              isLoading={stats.isLoading}
              error={stats.error}
            />
            <PersonalSkillsChart
              data={stats.data?.topSkillsCollected}
              isLoading={stats.isLoading}
              error={stats.error}
            />
          </div>
        </TabsContent>

        <TabsContent value="quality">
          <DataQualityScorecard
            data={stats.data}
            isClerk={false}
            isLoading={stats.isLoading}
            error={stats.error}
          />
        </TabsContent>

        <TabsContent value="profile">
          <RespondentDiversityChart
            genderSplit={stats.data?.respondentDiversity.genderSplit}
            ageSpread={stats.data?.respondentDiversity.ageSpread}
            isLoading={stats.isLoading}
            error={stats.error}
          />
        </TabsContent>
      </Tabs>
      <ActivationStatusPanel />
    </div>
  );
}
