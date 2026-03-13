import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Skeleton } from '../../../components/ui/skeleton';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { usePublicInsights, usePublicTrends } from '../hooks/usePublicInsights';
import { MethodologyNote } from '../components/MethodologyNote';
import { CHART_COLORS } from '../utils/chart-utils';

function formatWeek(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
}

export default function TrendsPage() {
  useDocumentTitle('Registration Trends');
  const { data, isLoading, error, refetch } = usePublicTrends();
  const { data: insightsData } = usePublicInsights();

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900 mb-4">Unable to load trends</h1>
        <p className="text-neutral-600 mb-6">{(error as Error).message}</p>
        <button
          onClick={() => refetch()}
          className="px-6 py-2 bg-[#9C1E23] text-white rounded-lg hover:bg-[#7A171B] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Compute cumulative sum from daily counts, skipping suppressed days
  const cumulativeData = data.dailyRegistrations.reduce<{ date: string; cumulative: number }[]>(
    (acc, point) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
      const dayCount = point.count ?? 0;
      acc.push({ date: point.date, cumulative: prev + dayCount });
      return acc;
    },
    [],
  );

  const employmentByWeek = data.employmentByWeek ?? [];

  return (
    <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      <Link to="/insights" className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to Insights
      </Link>

      <h1 className="text-3xl font-bold text-neutral-900 mb-2">Registration Trends</h1>
      <p className="text-neutral-600 mb-8">Cumulative registrations over the last 90 days</p>

      {cumulativeData.length > 0 ? (
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={cumulativeData}>
            <defs>
              <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#9C1E23" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#9C1E23" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
            />
            <YAxis />
            <Tooltip
              labelFormatter={(d) => String(d) !== '' ? new Date(String(d)).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
              formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), 'Cumulative Registrations']}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="#9C1E23"
              fill="url(#colorCumulative)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-neutral-500 text-center py-8">No registration data available for the last 90 days</p>
      )}

      {/* Employment Type Breakdown Over Time (AC#5) */}
      {employmentByWeek.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Employment Type Breakdown</h2>
          <p className="text-neutral-600 mb-6">Weekly breakdown by employment status</p>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={employmentByWeek}>
              <XAxis dataKey="week" tickFormatter={formatWeek} tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip
                labelFormatter={(w) => `Week of ${formatWeek(String(w))}`}
                formatter={(value: number | undefined, name: string | undefined) => [
                  (value ?? 0).toLocaleString(),
                  name ?? '',
                ]}
              />
              <Legend />
              <Bar dataKey="employed" name="Employed" stackId="emp" fill={CHART_COLORS[2]} />
              <Bar dataKey="unemployedSeeking" name="Unemployed (Seeking)" stackId="emp" fill={CHART_COLORS[0]} />
              <Bar dataKey="temporarilyAbsent" name="Temporarily Absent" stackId="emp" fill={CHART_COLORS[3]} />
              <Bar dataKey="other" name="Other" stackId="emp" fill={CHART_COLORS[5]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      <MethodologyNote
        totalRegistered={insightsData?.totalRegistered ?? 0}
        lastUpdated={data.lastUpdated}
      />
    </div>
  );
}
