import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '../../../components/ui/skeleton';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { usePublicInsights } from '../hooks/usePublicInsights';
import { SkillsGapChart } from '../components/SkillsGapChart';
import { MethodologyNote } from '../components/MethodologyNote';
import { formatLabel } from '../utils/chart-utils';

export default function SkillsMapPage() {
  useDocumentTitle('Skills Distribution');
  const { data, isLoading, error, refetch } = usePublicInsights();

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900 mb-4">Unable to load skills data</h1>
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

  const allSkills = data.allSkills;
  const desiredSkills = data.desiredSkills;

  return (
    <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      <Link to="/insights" className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to Insights
      </Link>

      <h1 className="text-3xl font-bold text-neutral-900 mb-8">Skills Distribution</h1>

      {/* All Skills */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-800 mb-4">All Skills</h2>
        <p className="text-sm text-neutral-500 mb-6">
          Skills shown as a flat list. ISCO-08 occupational categorization will be available when classification metadata is added to the survey instrument.
        </p>
        {allSkills.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(400, allSkills.length * 30)}>
            <BarChart data={allSkills.map(s => ({ name: formatLabel(s.skill), count: s.count }))} layout="vertical">
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), 'Count']} />
              <Bar dataKey="count" fill="#9C1E23" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-neutral-500">No skills data available</p>
        )}
      </section>

      {/* Skills Gap */}
      <section>
        <SkillsGapChart allSkills={allSkills} desiredSkills={desiredSkills} />
      </section>

      <MethodologyNote totalRegistered={data.totalRegistered} lastUpdated={data.lastUpdated} />
    </div>
  );
}
