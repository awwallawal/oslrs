/**
 * Respondent Diversity Chart — gender split pie + age spread bar
 * Story 8.3: Enumerator personal stats — "My Profile" tab
 */

import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { CHART_COLORS, formatLabel } from './chart-utils';
import type { FrequencyBucket } from '@oslsr/types';

interface Props {
  genderSplit?: FrequencyBucket[];
  ageSpread?: FrequencyBucket[];
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function RespondentDiversityChart({ genderSplit, ageSpread, isLoading, error, className }: Props) {
  if (isLoading) {
    return <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${className ?? ''}`}><SkeletonCard /><SkeletonCard /></div>;
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-red-600">Failed to load diversity data</CardContent>
      </Card>
    );
  }

  const hasGender = genderSplit && genderSplit.length > 0;
  const hasAge = ageSpread && ageSpread.length > 0;

  if (!hasGender && !hasAge) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">No diversity data available</CardContent>
      </Card>
    );
  }

  // Advisory text
  const maleCount = genderSplit?.find((b) => b.label === 'male')?.count ?? 0;
  const femaleCount = genderSplit?.find((b) => b.label === 'female')?.count ?? 0;
  const total = (maleCount ?? 0) + (femaleCount ?? 0);
  const malePct = total > 0 ? Math.round(((maleCount ?? 0) / total) * 100) : null;
  const advisory = malePct !== null && malePct > 65
    ? `${malePct}% male — consider reaching more women`
    : malePct !== null && malePct < 35
    ? `${100 - malePct}% female — consider reaching more men`
    : null;

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${className ?? ''}`}>
      {hasGender && (
        <Card>
          <CardHeader className="pb-2">
            <div className="border-l-4 border-[#9C1E23] pl-3">
              <CardTitle className="text-base">Gender Split</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={genderSplit.map((b) => ({ name: formatLabel(b.label), value: b.count ?? 0 }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {genderSplit.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            {advisory && (
              <p className="text-xs text-amber-600 text-center mt-1">{advisory}</p>
            )}
          </CardContent>
        </Card>
      )}

      {hasAge && (
        <Card>
          <CardHeader className="pb-2">
            <div className="border-l-4 border-[#9C1E23] pl-3">
              <CardTitle className="text-base">Age Distribution</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageSpread.map((b) => ({ name: b.label, count: b.count ?? 0 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill={CHART_COLORS[0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
