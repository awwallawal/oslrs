import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent } from '../../../components/ui/card';
import type { FrequencyBucket } from '@oslsr/types';
import { CHART_COLORS, formatLabel } from '../utils/chart-utils';

interface PublicEmploymentSectionProps {
  employmentBreakdown: FrequencyBucket[];
  formalInformalRatio: FrequencyBucket[];
  unemploymentEstimate: number | null;
}

export function PublicEmploymentSection({
  employmentBreakdown,
  formalInformalRatio,
  unemploymentEstimate,
}: PublicEmploymentSectionProps) {
  const visibleEmp = employmentBreakdown.filter(b => !b.suppressed);
  const visibleFormal = formalInformalRatio.filter(b => !b.suppressed);

  const formalBucket = visibleFormal.find(b => b.label === 'formal');
  const informalBucket = visibleFormal.find(b => b.label === 'informal');

  return (
    <section aria-labelledby="employment-heading">
      <h2 id="employment-heading" className="text-2xl font-bold text-neutral-900 mb-6">Employment Landscape</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Employment Status Donut */}
        <div>
          <h3 className="text-lg font-semibold text-neutral-700 mb-4">Employment Status</h3>
          {visibleEmp.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={visibleEmp.map(b => ({ name: formatLabel(b.label), value: b.count ?? 0 }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {visibleEmp.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-neutral-500">No employment data available</p>
          )}
        </div>

        {/* Formal/Informal + Unemployment */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-neutral-700 mb-4">Sector & Unemployment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-sm text-neutral-500">Formal Sector</div>
                <div className="text-2xl font-bold text-neutral-900">
                  {formalBucket?.percentage != null ? `${formalBucket.percentage.toFixed(1)}%` : 'N/A'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-sm text-neutral-500">Informal Sector</div>
                <div className="text-2xl font-bold text-neutral-900">
                  {informalBucket?.percentage != null ? `${informalBucket.percentage.toFixed(1)}%` : 'N/A'}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-neutral-500">Unemployment Estimate</div>
              <div className="text-3xl font-bold text-red-700">
                {unemploymentEstimate != null ? `${unemploymentEstimate}%` : 'N/A'}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
