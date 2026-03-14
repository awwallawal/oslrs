import type { InferentialInsightsData } from '@oslsr/types';
import { ThresholdGuard } from '../ThresholdGuard';
import { ChiSquareCard } from './ChiSquareCard';
import { CorrelationCard } from './CorrelationCard';
import { GroupComparisonCard } from './GroupComparisonCard';
import { ProportionCICard } from './ProportionCICard';
import { EnrollmentForecastCard } from './EnrollmentForecastCard';

interface InsightsPanelProps {
  data: InferentialInsightsData;
}

export function InsightsPanel({ data }: InsightsPanelProps) {
  return (
    <div className="space-y-6">
      {/* Association Tests */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Association Tests (Chi-Square)</h3>
        <ThresholdGuard threshold={data.thresholds.chiSquare} label="Association Tests">
          <div className="grid gap-3 md:grid-cols-2">
            {data.chiSquare.map((r) => (
              <ChiSquareCard key={r.hypothesis} result={r} />
            ))}
          </div>
        </ThresholdGuard>
      </section>

      {/* Correlations */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Correlation Analysis</h3>
        <ThresholdGuard threshold={data.thresholds.correlations} label="Correlations">
          <div className="grid gap-3 md:grid-cols-2">
            {data.correlations.map((r) => (
              <CorrelationCard key={r.hypothesis} result={r} />
            ))}
          </div>
        </ThresholdGuard>
      </section>

      {/* Group Comparisons */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Group Comparisons</h3>
        <ThresholdGuard threshold={data.thresholds.groupComparisons} label="Group Comparisons">
          <div className="grid gap-3 md:grid-cols-2">
            {data.groupComparisons.map((r) => (
              <GroupComparisonCard key={r.hypothesis} result={r} />
            ))}
          </div>
        </ThresholdGuard>
      </section>

      {/* Proportion CIs */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Confidence Intervals</h3>
        <ThresholdGuard threshold={data.thresholds.proportionCIs} label="Confidence Intervals">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.proportionCIs.map((r) => (
              <ProportionCICard key={r.metric} result={r} />
            ))}
          </div>
        </ThresholdGuard>
      </section>

      {/* Enrollment Forecast */}
      {data.forecast && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Enrollment Velocity</h3>
          <ThresholdGuard threshold={data.thresholds.forecast} label="Enrollment Forecast">
            <EnrollmentForecastCard forecast={data.forecast} />
          </ThresholdGuard>
        </section>
      )}
    </div>
  );
}
