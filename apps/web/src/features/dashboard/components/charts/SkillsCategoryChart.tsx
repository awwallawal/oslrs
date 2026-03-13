import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { ThresholdGuard } from '../ThresholdGuard';
import type { SkillsFrequency } from '@oslsr/types';

interface CategoryData {
  category: string;
  totalCount: number;
  skills: SkillsFrequency[];
}

interface SkillsCategoryChartProps {
  categories: CategoryData[];
  threshold: { met: boolean; currentN: number; requiredN: number };
}

export function SkillsCategoryChart({ categories, threshold }: SkillsCategoryChartProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <ThresholdGuard threshold={threshold} label="Skills by category">
      <Card data-testid="skills-category-chart">
        <CardHeader>
          <CardTitle className="text-lg">Skills by ISCO-08 Sector</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {categories.map((cat) => (
            <div key={cat.category}>
              <button
                type="button"
                onClick={() => toggle(cat.category)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 rounded"
                data-testid={`category-${cat.category}`}
              >
                <span className="font-medium">{cat.category}</span>
                <span className="text-muted-foreground">
                  {cat.totalCount.toLocaleString()} ({cat.skills.length} skills)
                </span>
              </button>
              {expanded.has(cat.category) && (
                <div className="pl-6 pb-2 space-y-1" data-testid={`category-skills-${cat.category}`}>
                  {cat.skills.map((skill) => (
                    <div key={skill.skill} className="flex justify-between text-sm">
                      <span>{skill.skill.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground">{skill.count} ({skill.percentage}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </ThresholdGuard>
  );
}
