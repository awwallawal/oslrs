import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import type { SkillsFrequency } from '@oslsr/types';
import { formatLabel } from '../utils/chart-utils';

interface SkillsGapChartProps {
  allSkills: SkillsFrequency[];
  desiredSkills: SkillsFrequency[];
}

export function SkillsGapChart({ allSkills, desiredSkills }: SkillsGapChartProps) {
  if (desiredSkills.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">
        No training interest data yet
      </div>
    );
  }

  // Build diverging dataset: "have" extends right (positive), "want" extends left (negative)
  const desiredMap = new Map(desiredSkills.map(s => [s.skill, s.count]));
  const allMap = new Map(allSkills.map(s => [s.skill, s.count]));
  const allSkillNames = new Set([...allSkills.map(s => s.skill), ...desiredSkills.map(s => s.skill)]);

  const gapData = Array.from(allSkillNames)
    .map(skill => ({
      name: formatLabel(skill),
      have: allMap.get(skill) ?? 0,
      wantToLearn: -(desiredMap.get(skill) ?? 0), // negative for left-extending bars
    }))
    .sort((a, b) => (b.have + Math.abs(b.wantToLearn)) - (a.have + Math.abs(a.wantToLearn)))
    .slice(0, 20);

  return (
    <div>
      <h3 className="text-lg font-semibold text-neutral-700 mb-4">Skills Gap: Have vs. Want to Learn</h3>
      <ResponsiveContainer width="100%" height={Math.max(400, gapData.length * 35)}>
        <BarChart data={gapData} layout="vertical" stackOffset="sign">
          <XAxis
            type="number"
            tickFormatter={(v: number) => Math.abs(v).toLocaleString()}
          />
          <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number | undefined) => [Math.abs(value ?? 0).toLocaleString()]}
          />
          <Legend />
          <ReferenceLine x={0} stroke="#94a3b8" />
          <Bar dataKey="have" name="Have" fill="#059669" radius={[0, 4, 4, 0]} />
          <Bar dataKey="wantToLearn" name="Want to Learn" fill="#D97706" radius={[4, 0, 0, 4]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
