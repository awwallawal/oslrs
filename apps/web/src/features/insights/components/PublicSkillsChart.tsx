import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { SkillsFrequency } from '@oslsr/types';
import { formatLabel } from '../utils/chart-utils';

interface PublicSkillsChartProps {
  allSkills: SkillsFrequency[];
}

export function PublicSkillsChart({ allSkills }: PublicSkillsChartProps) {
  const top10 = allSkills.slice(0, 10);

  return (
    <section aria-labelledby="skills-heading">
      <div className="flex items-center justify-between mb-6">
        <h2 id="skills-heading" className="text-2xl font-bold text-neutral-900">Skills & Training</h2>
        {allSkills.length > 10 && (
          <Link to="/insights/skills" className="text-sm text-primary-600 hover:underline">
            View all skills &rarr;
          </Link>
        )}
      </div>
      {top10.length > 0 ? (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={top10.map(s => ({ name: formatLabel(s.skill), count: s.count }))} layout="vertical">
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), 'Count']} />
            <Bar dataKey="count" fill="#9C1E23" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-neutral-500">No skills data available</p>
      )}
    </section>
  );
}
