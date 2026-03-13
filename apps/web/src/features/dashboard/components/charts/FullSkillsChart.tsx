import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { SkillsFrequency } from '@oslsr/types';
import { ThresholdGuard } from '../ThresholdGuard';

interface FullSkillsChartProps {
  skills: SkillsFrequency[];
  threshold: { met: boolean; currentN: number; requiredN: number };
}

export function FullSkillsChart({ skills, threshold }: FullSkillsChartProps) {
  return (
    <ThresholdGuard threshold={threshold} label="Skills frequency">
      <Card data-testid="full-skills-chart">
        <CardHeader>
          <CardTitle className="text-lg">All Skills Frequency</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="overflow-y-auto"
            style={{ height: Math.max(400, skills.length * 28) }}
          >
            <ResponsiveContainer width="100%" height={Math.max(400, skills.length * 28)}>
              <BarChart
                data={skills}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
              >
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="skill"
                  width={110}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value, _name, entry) => [
                    `${value} (${(entry.payload as SkillsFrequency).percentage}%)`,
                    'Count',
                  ]}
                />
                <Bar dataKey="count" fill="#9C1E23" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {skills.length} skills displayed
          </p>
        </CardContent>
      </Card>
    </ThresholdGuard>
  );
}
