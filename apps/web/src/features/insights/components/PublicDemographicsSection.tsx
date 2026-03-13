import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { FrequencyBucket } from '@oslsr/types';
import { CHART_COLORS, formatLabel } from '../utils/chart-utils';

interface PublicDemographicsSectionProps {
  genderSplit: FrequencyBucket[];
  ageDistribution: FrequencyBucket[];
}

export function PublicDemographicsSection({ genderSplit, ageDistribution }: PublicDemographicsSectionProps) {
  const visibleGender = genderSplit.filter(b => !b.suppressed);
  const visibleAge = ageDistribution.filter(b => !b.suppressed);

  return (
    <section aria-labelledby="demographics-heading">
      <h2 id="demographics-heading" className="text-2xl font-bold text-neutral-900 mb-6">Demographics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

        {/* Age Distribution */}
        <div>
          <h3 className="text-lg font-semibold text-neutral-700 mb-4">Age Distribution</h3>
          {visibleAge.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={visibleAge.map(b => ({ name: b.label, count: b.count ?? 0 }))}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#9C1E23" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-neutral-500">No age data available</p>
          )}
        </div>
      </div>
    </section>
  );
}
