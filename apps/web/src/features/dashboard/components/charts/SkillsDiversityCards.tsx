import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { ThresholdGuard } from '../ThresholdGuard';

interface DiversityEntry {
  lgaId: string;
  lgaName: string;
  index: number;
  skillCount: number;
}

interface SkillsDiversityCardsProps {
  data: DiversityEntry[] | null;
  threshold: { met: boolean; currentN: number; requiredN: number };
}

function getDiversityColor(index: number): string {
  if (index > 2.0) return 'text-green-700 bg-green-50 border-green-200';
  if (index >= 1.0) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function getDiversityLabel(index: number): string {
  if (index > 2.0) return 'High diversity';
  if (index >= 1.0) return 'Moderate';
  return 'Low diversity';
}

export function SkillsDiversityCards({ data, threshold }: SkillsDiversityCardsProps) {
  if (!data) return null; // Not rendered for Supervisor

  return (
    <ThresholdGuard threshold={threshold} label="Skill diversity index">
      <Card data-testid="skills-diversity-cards">
        <CardHeader>
          <CardTitle className="text-lg">Skill Diversity Index (Shannon)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No diversity data available.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.map((entry) => (
                <div
                  key={entry.lgaId}
                  className={`rounded-lg border p-3 ${getDiversityColor(entry.index)}`}
                  data-testid={`diversity-card-${entry.lgaId}`}
                >
                  <p className="font-semibold text-lg">{entry.index.toFixed(2)}</p>
                  <p className="text-sm font-medium">{entry.lgaName}</p>
                  <p className="text-xs mt-1">
                    {getDiversityLabel(entry.index)} &middot; {entry.skillCount} skills
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </ThresholdGuard>
  );
}
