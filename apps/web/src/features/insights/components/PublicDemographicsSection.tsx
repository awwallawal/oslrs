import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { FrequencyBucket } from '@oslsr/types';
import { CHART_COLORS, formatLabel } from '../utils/chart-utils';

interface PublicDemographicsSectionProps {
  genderSplit: FrequencyBucket[];
}

/**
 * ⛔ Age removed 2026-08-26 (Awwal's ruling). Age is ~35% populated across the intake
 * routes — only L-PRES carries a date of birth; N-Cares and the fish roster carry none —
 * so an age chart on a PUBLIC page could not be published without a denominator caveat,
 * and a caveat a reader cannot interrogate is a headline somebody else gets to write.
 * Gender stays: ~99% populated on every route. Age analysis belongs to the `full`
 * stratum (taxonomy R3) and the final report.
 */
export function PublicDemographicsSection({ genderSplit }: PublicDemographicsSectionProps) {
  const visibleGender = genderSplit.filter(b => !b.suppressed);

  return (
    <section aria-labelledby="demographics-heading">
      <h2 id="demographics-heading" className="text-2xl font-bold text-neutral-900 mb-6">Demographics</h2>
      {/* One chart since age was removed — a 2-col grid left it hugging the left
          edge with dead space beside it. Centre it at a readable width. */}
      <div className="mx-auto max-w-2xl">
        {/* Gender Split */}
        <div>
          <h3 className="text-lg font-semibold text-neutral-700 mb-4">Gender Distribution</h3>
          {visibleGender.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={visibleGender.map(b => ({ name: formatLabel(b.label), value: b.count ?? 0 }))}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {visibleGender.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-neutral-500">No gender data available</p>
          )}
        </div>

      </div>
    </section>
  );
}
