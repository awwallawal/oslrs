import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { ThresholdGuard } from '../ThresholdGuard';

interface GapItem {
  skill: string;
  haveCount: number;
  wantCount: number;
}

interface SkillsGapChartProps {
  gapAnalysis: GapItem[] | null;
  threshold: { met: boolean; currentN: number; requiredN: number };
}

export function SkillsGapChart({ gapAnalysis, threshold }: SkillsGapChartProps) {
  return (
    <ThresholdGuard threshold={threshold} label="Skills gap analysis">
      <Card data-testid="skills-gap-chart">
        <CardHeader>
          <CardTitle className="text-lg">Skills Gap: Current vs Desired</CardTitle>
        </CardHeader>
        <CardContent>
          {!gapAnalysis || gapAnalysis.length === 0 ? (
            <p className="text-muted-foreground text-center py-4" data-testid="gap-placeholder">
              No training interest data available yet.
            </p>
          ) : (
            <>
              <div style={{ height: Math.max(300, gapAnalysis.length * 28) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={gapAnalysis.map((g) => ({
                      skill: g.skill.replace(/_/g, ' '),
                      gap: g.wantCount - g.haveCount,
                      have: g.haveCount,
                      want: g.wantCount,
                    }))}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                  >
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="skill" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(_value, _name, entry) => [
                        `Have: ${(entry.payload as { have: number; want: number }).have}, Want: ${(entry.payload as { have: number; want: number }).want}`,
                        'Gap',
                      ]}
                    />
                    <ReferenceLine x={0} stroke="#666" />
                    <Bar dataKey="gap">
                      {gapAnalysis.map((g, i) => (
                        <Cell
                          key={i}
                          fill={g.wantCount - g.haveCount > 0 ? '#2563EB' : '#9C1E23'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground justify-center">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-[#9C1E23] inline-block" /> Oversupply (have &gt; want)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-[#2563EB] inline-block" /> Undersupply (want &gt; have)
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </ThresholdGuard>
  );
}
