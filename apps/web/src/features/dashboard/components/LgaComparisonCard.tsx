/**
 * LGA Comparison Card
 *
 * Story 5.6b AC3: Appears when 2+ LGAs are checkbox-selected in the LGA Comparison table.
 * Shows side-by-side comparison of selected LGAs' key metrics. Max 5 LGAs.
 */

import { X } from 'lucide-react';
import type { LgaProductivityRow } from '@oslsr/types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';

interface LgaComparisonCardProps {
  data: LgaProductivityRow[];
  onClear: () => void;
}

export default function LgaComparisonCard({ data, onClear }: LgaComparisonCardProps) {
  if (data.length < 2) return null;

  return (
    <Card className="mb-4" data-testid="lga-comparison-card">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-neutral-700">
            Comparing {data.length} LGAs
          </h3>
          <Button variant="ghost" size="sm" onClick={onClear} data-testid="comparison-clear">
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
          {data.map((lga) => (
            <div
              key={lga.lgaId}
              className={`rounded-lg border p-3 ${!lga.hasSupervisor ? 'border-amber-300 bg-amber-50/50' : 'border-neutral-200'}`}
              data-testid={`comparison-lga-${lga.lgaId}`}
            >
              <div className="font-semibold text-sm mb-2 truncate">{lga.lgaName}</div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Model</span>
                  <Badge
                    variant="outline"
                    className={!lga.hasSupervisor ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-neutral-100'}
                  >
                    {lga.staffingModel}
                  </Badge>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">Today</span>
                  <span className="font-mono font-medium">{lga.todayTotal}/{lga.lgaTarget}</span>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-neutral-500">Progress</span>
                    <span className="font-mono font-medium">{lga.percent}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-neutral-200">
                    <div
                      className={`h-2 rounded-full ${lga.percent >= 100 ? 'bg-green-500' : 'bg-[#9C1E23]'}`}
                      style={{ width: `${Math.min(lga.percent, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">Avg/Enum.</span>
                  <span className="font-mono">{lga.avgPerEnumerator}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">Rej. Rate</span>
                  <span className={`font-mono ${lga.rejRate > 20 ? 'text-red-600' : lga.rejRate > 10 ? 'text-amber-600' : 'text-green-600'}`}>
                    {lga.rejRate}%
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">Trend</span>
                  <span>
                    {lga.trend === 'up' ? '↑' : lga.trend === 'down' ? '↓' : '→'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
