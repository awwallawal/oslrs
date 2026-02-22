/**
 * Official Statistics Page
 *
 * Story 5.1 AC2, AC3: Skills distribution chart + LGA breakdown chart
 * with Direction 08 styling, skeleton loading, and summary stats.
 */

import { SkeletonCard } from '../../../components/skeletons';
import { useSkillsDistribution, useLgaBreakdown } from '../hooks/useOfficial';
import { SkillsDistributionChart } from '../components/SkillsDistributionChart';
import { LgaBreakdownChart } from '../components/LgaBreakdownChart';

export default function OfficialStatsPage() {
  const { data: skills, isLoading: skillsLoading, error: skillsError } = useSkillsDistribution();
  const { data: lgaData, isLoading: lgaLoading, error: lgaError } = useLgaBreakdown();

  const isLoading = skillsLoading || lgaLoading;

  // Compute summary stats
  const topSkill = skills && skills.length > 0 ? skills[0].skill : '—';
  const mostActiveLga = lgaData && lgaData.length > 0 ? lgaData[0].lgaName : '—';
  const lgasWithData = lgaData ? lgaData.filter((l) => l.count > 0).length : 0;

  return (
    <div className="p-6">
      {/* Direction 08: Dark header accent strip */}
      <div className="bg-gray-800 text-white rounded-lg px-6 py-4 mb-6">
        <h1 className="text-2xl font-brand font-semibold">Statistics</h1>
        <p className="text-gray-300 mt-1">
          Skills distribution and LGA-level analysis
        </p>
      </div>

      {isLoading ? (
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
    </div>
  );
}
