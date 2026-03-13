import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { ThresholdGuard } from '../ThresholdGuard';

interface LgaSkillConcentration {
  lgaId: string;
  lgaName: string;
  topSkills: { skill: string; count: number }[];
}

interface SkillsConcentrationTableProps {
  data: LgaSkillConcentration[] | null;
  threshold: { met: boolean; currentN: number; requiredN: number };
}

export function SkillsConcentrationTable({ data, threshold }: SkillsConcentrationTableProps) {
  if (!data) return null; // Not rendered for Supervisor

  return (
    <ThresholdGuard threshold={threshold} label="Skills concentration by LGA">
      <Card data-testid="skills-concentration-table">
        <CardHeader>
          <CardTitle className="text-lg">Skills Concentration by LGA</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border p-2 bg-gray-50 text-left">LGA</th>
                  <th className="border p-2 bg-gray-50 text-center">#1 Skill</th>
                  <th className="border p-2 bg-gray-50 text-center">#2 Skill</th>
                  <th className="border p-2 bg-gray-50 text-center">#3 Skill</th>
                </tr>
              </thead>
              <tbody>
                {data.map((lga) => (
                  <tr key={lga.lgaId}>
                    <td className="border p-2 font-medium">{lga.lgaName}</td>
                    {[0, 1, 2].map((i) => (
                      <td key={i} className="border p-2 text-center">
                        {lga.topSkills[i] ? (
                          <span>
                            {lga.topSkills[i].skill.replace(/_/g, ' ')}
                            <span className="text-muted-foreground ml-1">({lga.topSkills[i].count})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </ThresholdGuard>
  );
}
